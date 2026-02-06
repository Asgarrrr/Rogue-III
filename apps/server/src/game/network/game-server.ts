/**
 * Game Server
 *
 * Main orchestrator for WebSocket game sessions.
 * Coordinates between WebSocket connections, ECS world, and network sync.
 *
 * @see NETWORK_ARCHITECTURE.md for full specification
 */

import type { EventQueue } from "../ecs/core/events";
import type { World } from "../ecs/core/world";
import type { EntityTemplateRegistry } from "../ecs/features/templates";
import type { PositionData } from "../ecs/game/components/spatial";
import type { GameMap } from "../ecs/game/resources/game-map";
import type { TurnStateManager } from "../ecs/game/resources/turn-state";
import type { Entity } from "../ecs/types";

import type { GameSession } from "./game-session";
import { type ActionResult, MessageHandler } from "./message-handler";
import { NetworkSyncManager } from "./sync-manager";
import {
  type ClientMessage,
  type ErrorCode,
  type ErrorMessage,
  type EventMessage,
  type FullStateMessage,
  type GameEventData,
  type PongMessage,
  RATE_LIMITS,
  type ResultMessage,
  type ServerMessage,
  type StateDeltaMessage,
  type TurnMessage,
  validateClientMessage,
} from "./types";

// =============================================================================
// Types
// =============================================================================

/**
 * WebSocket interface abstraction.
 * Allows for testing without actual WebSocket.
 */
export interface WebSocketLike {
  send(data: string): void;
  close(): void;
}

/**
 * Callback for sending messages to a specific session.
 */
export type SendCallback = (sessionId: string, message: ServerMessage) => void;

/**
 * Configuration for GameServer.
 */
export interface GameServerConfig {
  /** Entity template registry for spawning players */
  templates: EntityTemplateRegistry;
  /** Inactivity timeout in ms (default: 5 minutes) */
  inactivityTimeoutMs?: number;
  /** Ping interval in ms (default: 30 seconds) */
  pingIntervalMs?: number;
}

// =============================================================================
// GameServer Class
// =============================================================================

/**
 * GameServer manages the game loop and coordinates WebSocket clients.
 *
 * Responsibilities:
 * - Handle client connections and disconnections
 * - Route messages to appropriate handlers
 * - Broadcast state updates after game ticks
 * - Manage player spawning and despawning
 * - Handle heartbeat/ping mechanism
 *
 * @example
 * ```typescript
 * const gameServer = new GameServer(world, {
 *   templates: templateRegistry,
 * });
 *
 * // In WebSocket handler:
 * ws.on("open", (ws) => {
 *   gameServer.handleConnect(sessionId, userId, ws);
 * });
 *
 * ws.on("message", (ws, message) => {
 *   gameServer.handleMessage(sessionId, message);
 * });
 *
 * ws.on("close", (ws) => {
 *   gameServer.handleDisconnect(sessionId);
 * });
 * ```
 */
export class GameServer {
  /**
   * Reference to the ECS world.
   */
  private readonly world: World;

  /**
   * Network sync manager.
   */
  private readonly syncManager: NetworkSyncManager;

  /**
   * Message handler for routing client actions.
   */
  private readonly messageHandler: MessageHandler;

  /**
   * Entity template registry for spawning.
   */
  private readonly templates: EntityTemplateRegistry;

  /**
   * WebSocket connections by session ID.
   */
  private readonly connections = new Map<string, WebSocketLike>();

  /**
   * Configuration.
   */
  private readonly config: Required<GameServerConfig>;

  /**
   * Ping interval handle.
   */
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  /**
   * Creates a new GameServer.
   *
   * @param world - The ECS world
   * @param config - Server configuration
   */
  constructor(world: World, config: GameServerConfig) {
    this.world = world;
    this.templates = config.templates;

    this.config = {
      templates: config.templates,
      inactivityTimeoutMs:
        config.inactivityTimeoutMs ?? RATE_LIMITS.inactivityTimeoutMs,
      pingIntervalMs: config.pingIntervalMs ?? RATE_LIMITS.pingIntervalMs,
    };

    this.syncManager = new NetworkSyncManager(world);
    this.messageHandler = new MessageHandler(world, this.syncManager);

    // Start ping interval
    this.startPingInterval();
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  /**
   * Starts the ping interval for heartbeat.
   */
  private startPingInterval(): void {
    if (this.pingInterval) return;

    this.pingInterval = setInterval(() => {
      this.checkInactiveSessions();
    }, this.config.pingIntervalMs);
  }

  /**
   * Stops the server and cleans up resources.
   */
  public shutdown(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    // Disconnect all clients
    for (const sessionId of this.connections.keys()) {
      this.handleDisconnect(sessionId);
    }
  }

  /**
   * Checks for inactive sessions and disconnects them.
   */
  private checkInactiveSessions(): void {
    const now = Date.now();

    for (const [sessionId, session] of this.syncManager.getAllSessions()) {
      if (session.isInactive(this.config.inactivityTimeoutMs)) {
        console.log(
          `[GameServer] Session ${sessionId} timed out after ${this.config.inactivityTimeoutMs}ms of inactivity`,
        );
        this.handleDisconnect(sessionId);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Connection Handling
  // ---------------------------------------------------------------------------

  /**
   * Handles a new client connection.
   *
   * @param sessionId - Unique session identifier
   * @param userId - User ID from authentication
   * @param ws - WebSocket connection
   */
  public handleConnect(
    sessionId: string,
    userId: string,
    ws: WebSocketLike,
  ): void {
    console.log(
      `[GameServer] Client connected: ${userId} (session: ${sessionId})`,
    );

    // Store WebSocket reference
    this.connections.set(sessionId, ws);

    // Create session
    const session = this.syncManager.createSession(sessionId, userId);

    // Spawn player entity
    try {
      const playerId = this.spawnPlayer(userId);
      session.playerId = playerId;
      console.log(
        `[GameServer] Player spawned: entity ${playerId} for user ${userId}`,
      );
    } catch (error) {
      console.error(`[GameServer] Failed to spawn player:`, error);
      this.sendError(sessionId, "INTERNAL_ERROR", "Failed to spawn player");
      ws.close();
      return;
    }
  }

  /**
   * Handles a client message.
   *
   * @param sessionId - Session identifier
   * @param rawMessage - Raw message data (string or object)
   */
  public handleMessage(sessionId: string, rawMessage: unknown): void {
    const session = this.syncManager.getSession(sessionId);
    if (!session) {
      console.warn(`[GameServer] Message from unknown session: ${sessionId}`);
      return;
    }

    // Update activity
    session.updateActivity();

    // Parse message
    const message = this.parseMessage(rawMessage);
    if (!message) {
      this.sendError(sessionId, "INVALID_ACTION", "Invalid message format");
      return;
    }

    // Track stats
    const messageSize =
      typeof rawMessage === "string"
        ? rawMessage.length
        : JSON.stringify(rawMessage).length;
    session.recordReceivedMessage(messageSize);

    // Handle message based on type
    if (message.t === "ready") {
      this.handleReady(sessionId, session);
    } else if (message.t === "ping") {
      this.handlePing(sessionId, message);
    } else {
      // Game action
      this.handleAction(sessionId, session, message);
    }
  }

  /**
   * Handles client disconnection.
   *
   * @param sessionId - Session identifier
   */
  public handleDisconnect(sessionId: string): void {
    const session = this.syncManager.getSession(sessionId);
    if (!session) return;

    console.log(
      `[GameServer] Client disconnected: ${session.userId} (session: ${sessionId})`,
    );

    // Despawn player
    if (session.playerId) {
      this.despawnPlayer(session.playerId);
    }

    // Mark session as disconnected
    session.markDisconnected();

    // Cleanup
    this.syncManager.removeSession(sessionId);
    this.connections.delete(sessionId);
  }

  // ---------------------------------------------------------------------------
  // Message Handlers
  // ---------------------------------------------------------------------------

  /**
   * Handles "ready" message - client is ready to receive game state.
   */
  private handleReady(sessionId: string, session: GameSession): void {
    console.log(`[GameServer] Session ${sessionId} ready`);

    session.markReady();

    // Send full game state
    const fullState = this.syncManager.getFullState(sessionId);
    if (fullState) {
      this.send(sessionId, fullState);
    } else {
      this.sendError(sessionId, "INTERNAL_ERROR", "Failed to get game state");
      return;
    }

    // Send turn notification
    this.sendTurnNotification(sessionId);
  }

  /**
   * Handles "ping" message - heartbeat/latency measurement.
   */
  private handlePing(
    sessionId: string,
    message: { t: "ping"; c: number },
  ): void {
    const pong: PongMessage = {
      t: "pong",
      c: message.c,
      s: Date.now(),
    };
    this.send(sessionId, pong);
  }

  /**
   * Handles a game action message.
   */
  private handleAction(
    sessionId: string,
    session: GameSession,
    message: ClientMessage,
  ): void {
    // Process the action
    const result = this.messageHandler.handleAction(session, message);

    // Send result to client
    this.sendResult(sessionId, result);

    // If action succeeded, broadcast state updates
    if (result.ok) {
      this.broadcastStateUpdates();
    }
  }

  // ---------------------------------------------------------------------------
  // State Broadcasting
  // ---------------------------------------------------------------------------

  /**
   * Broadcasts state updates to all connected clients.
   * Call this after each game tick.
   */
  public broadcastStateUpdates(): void {
    for (const [sessionId, session] of this.syncManager.getAllSessions()) {
      if (!session.isReady) continue;

      // Get delta for this session
      const delta = this.syncManager.getStateDelta(sessionId);
      if (delta) {
        this.send(sessionId, delta);
      }

      // Send any pending events
      const events = session.drainEvents();
      for (const event of events) {
        const eventMessage: EventMessage = { t: "event", e: event };
        this.send(sessionId, eventMessage);
      }

      // Send turn notification
      this.sendTurnNotification(sessionId);
    }
  }

  /**
   * Sends turn notification to a session if turn state changed.
   */
  private sendTurnNotification(sessionId: string): void {
    const turnInfo = this.syncManager.getTurnInfo(sessionId);
    if (!turnInfo) return;

    const session = this.syncManager.getSession(sessionId);
    if (!session) return;

    // Only send if turn state changed
    if (session.lastTurnActive !== turnInfo.active) {
      session.lastTurnActive = turnInfo.active;

      const turnMessage: TurnMessage = {
        t: "turn",
        active: turnInfo.active,
        tick: turnInfo.tick,
      };
      this.send(sessionId, turnMessage);
    }
  }

  // ---------------------------------------------------------------------------
  // Player Spawning
  // ---------------------------------------------------------------------------

  /**
   * Spawns a player entity for a user.
   *
   * @param userId - User ID
   * @returns Spawned player entity ID
   */
  private spawnPlayer(userId: string): Entity {
    // Find a valid spawn position
    const spawnPos = this.findSpawnPosition();

    // Instantiate player from template
    const playerId = this.templates.instantiate(this.world, "player", {
      Position: {
        x: spawnPos.x,
        y: spawnPos.y,
        layer: 2, // Creature layer
      },
    });

    // Register in GameMap spatial index
    const gameMap = this.world.resources.get<GameMap>("gameMap");
    if (gameMap) {
      gameMap.addEntity(spawnPos.x, spawnPos.y, playerId);
    }

    return playerId;
  }

  /**
   * Finds a valid spawn position for a player.
   */
  private findSpawnPosition(): { x: number; y: number } {
    const gameMap = this.world.resources.get<GameMap>("gameMap");
    if (!gameMap) {
      return { x: 5, y: 5 }; // Fallback
    }

    // Find first walkable tile
    for (let y = 1; y < gameMap.height - 1; y++) {
      for (let x = 1; x < gameMap.width - 1; x++) {
        if (gameMap.isWalkable(x, y) && !gameMap.hasEntities(x, y)) {
          return { x, y };
        }
      }
    }

    return { x: 5, y: 5 }; // Fallback
  }

  /**
   * Despawns a player entity.
   *
   * @param playerId - Player entity ID
   */
  private despawnPlayer(playerId: Entity): void {
    // Get position before despawning
    const pos = this.world.getComponent<PositionData>(playerId, "Position");

    // Remove from GameMap spatial index
    if (pos) {
      const gameMap = this.world.resources.get<GameMap>("gameMap");
      if (gameMap) {
        gameMap.removeEntity(pos.x, pos.y, playerId);
      }
    }

    // Despawn entity
    this.world.despawn(playerId);
  }

  // ---------------------------------------------------------------------------
  // Message Sending
  // ---------------------------------------------------------------------------

  /**
   * Sends a message to a session.
   *
   * @param sessionId - Session identifier
   * @param message - Message to send
   */
  private send(sessionId: string, message: ServerMessage): void {
    const ws = this.connections.get(sessionId);
    if (!ws) return;

    const session = this.syncManager.getSession(sessionId);

    try {
      const json = JSON.stringify(message);
      ws.send(json);

      // Track stats
      if (session) {
        session.recordSentMessage(json.length);
      }
    } catch (error) {
      console.error(
        `[GameServer] Failed to send message to ${sessionId}:`,
        error,
      );
    }
  }

  /**
   * Sends an error message to a session.
   */
  private sendError(sessionId: string, code: ErrorCode, msg: string): void {
    const errorMessage: ErrorMessage = { t: "error", code, msg };
    this.send(sessionId, errorMessage);
  }

  /**
   * Sends an action result to a session.
   */
  private sendResult(sessionId: string, result: ActionResult): void {
    const resultMessage: ResultMessage = {
      t: "result",
      ok: result.ok,
      msg: result.msg,
      reason: result.reason,
    };
    this.send(sessionId, resultMessage);
  }

  // ---------------------------------------------------------------------------
  // Message Parsing
  // ---------------------------------------------------------------------------

  /**
   * Parses a raw message into a ClientMessage.
   *
   * @param rawMessage - Raw message data
   * @returns Parsed message or null if invalid
   */
  private parseMessage(rawMessage: unknown): ClientMessage | null {
    let message: unknown;

    // Parse JSON if string
    if (typeof rawMessage === "string") {
      try {
        message = JSON.parse(rawMessage);
      } catch {
        return null;
      }
    } else {
      message = rawMessage;
    }

    // Validate structure
    const error = validateClientMessage(message);
    if (error) {
      return null;
    }

    return message as ClientMessage;
  }

  // ---------------------------------------------------------------------------
  // Accessors
  // ---------------------------------------------------------------------------

  /**
   * Gets the sync manager (for testing).
   */
  public getSyncManager(): NetworkSyncManager {
    return this.syncManager;
  }

  /**
   * Gets the message handler (for testing).
   */
  public getMessageHandler(): MessageHandler {
    return this.messageHandler;
  }

  /**
   * Gets the number of connected clients.
   */
  public getConnectionCount(): number {
    return this.connections.size;
  }

  /**
   * Gets all session IDs.
   */
  public getSessionIds(): string[] {
    return Array.from(this.connections.keys());
  }
}
