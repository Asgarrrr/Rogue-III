/**
 * Game Session
 *
 * Manages per-client state for delta computation and event tracking.
 * Each connected client has one GameSession instance.
 *
 * @see NETWORK_ARCHITECTURE.md for full specification
 */

import type { Entity } from "../ecs/types";
import type { GameEventData } from "./types";

// =============================================================================
// Snapshot Types
// =============================================================================

/**
 * Snapshot of an entity's visible state.
 * Used for delta computation between updates.
 */
export interface EntitySnapshot {
  readonly x: number;
  readonly y: number;
  readonly glyph: string;
  readonly fgColor: string;
  readonly hp?: { current: number; max: number };
  /** Hash for quick equality check */
  readonly hash: number;
}

/**
 * Snapshot of player's state.
 * Used for delta computation between updates.
 */
export interface PlayerSnapshot {
  readonly x: number;
  readonly y: number;
  readonly hp: { current: number; max: number };
  readonly inventoryHash: number;
  readonly equipmentHash: number;
  readonly xp: { level: number; current: number; toNext: number };
}

/**
 * Snapshot of terrain exploration state.
 */
export interface TerrainSnapshot {
  readonly exploredCount: number;
  readonly exploredHash: number;
  readonly visibleCells: Set<number>;
}

// =============================================================================
// Session State
// =============================================================================

/**
 * Connection state for a session.
 */
export type ConnectionState = "connecting" | "ready" | "disconnected";

/**
 * Session statistics for monitoring.
 */
export interface SessionStats {
  /** Total messages sent */
  messagesSent: number;
  /** Total messages received */
  messagesReceived: number;
  /** Total bytes sent (approximate) */
  bytesSent: number;
  /** Total bytes received (approximate) */
  bytesReceived: number;
  /** Connection start time */
  connectedAt: number;
  /** Last ping round-trip time in ms */
  lastPingRtt: number;
}

// =============================================================================
// GameSession Class
// =============================================================================

/**
 * GameSession manages state for a single connected client.
 *
 * Responsibilities:
 * - Track player entity association
 * - Store last sent state for delta computation
 * - Queue pending events for delivery
 * - Track connection health and activity
 *
 * @example
 * ```typescript
 * const session = new GameSession("sess_123", "user_456");
 * session.playerId = playerEntity;
 * session.isReady = true;
 *
 * // Later, for delta computation:
 * const previousEntities = session.lastSentEntities;
 * // ... compute delta ...
 * session.lastSentEntities = currentEntities;
 * ```
 */
export class GameSession {
  // ---------------------------------------------------------------------------
  // Identity
  // ---------------------------------------------------------------------------

  /** Unique session identifier */
  public readonly sessionId: string;

  /** User ID from authentication */
  public readonly userId: string;

  /** Associated player entity (null until spawned) */
  public playerId: Entity | null = null;

  // ---------------------------------------------------------------------------
  // State Tracking for Delta Computation
  // ---------------------------------------------------------------------------

  /**
   * Last sent entity snapshots.
   * Key: Entity ID, Value: Snapshot at last send time.
   */
  public lastSentEntities: Map<Entity, EntitySnapshot> = new Map();

  /**
   * Last sent player state.
   * Used to compute player delta.
   */
  public lastPlayerState: PlayerSnapshot | null = null;

  /**
   * Last sent terrain state.
   * Used to compute terrain delta.
   */
  public lastTerrainState: TerrainSnapshot | null = null;

  /**
   * Last sent game tick.
   */
  public lastSentTick: number = 0;

  /**
   * Whether the player was active (their turn) in last update.
   */
  public lastTurnActive: boolean = false;

  // ---------------------------------------------------------------------------
  // Event Queue
  // ---------------------------------------------------------------------------

  /**
   * Pending events to send to client.
   * Cleared after each state update.
   */
  public pendingEvents: GameEventData[] = [];

  // ---------------------------------------------------------------------------
  // Connection State
  // ---------------------------------------------------------------------------

  /**
   * Current connection state.
   */
  public connectionState: ConnectionState = "connecting";

  /**
   * Whether client has sent "ready" message.
   */
  public isReady: boolean = false;

  /**
   * Timestamp of last activity (message received).
   */
  public lastActivityTime: number = Date.now();

  /**
   * Timestamp of last ping sent.
   */
  public lastPingSentTime: number = 0;

  /**
   * Pending ping client timestamp (for RTT calculation).
   */
  public pendingPingTimestamp: number | null = null;

  // ---------------------------------------------------------------------------
  // Statistics
  // ---------------------------------------------------------------------------

  /**
   * Session statistics.
   */
  public readonly stats: SessionStats = {
    messagesSent: 0,
    messagesReceived: 0,
    bytesSent: 0,
    bytesReceived: 0,
    connectedAt: Date.now(),
    lastPingRtt: 0,
  };

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  /**
   * Creates a new game session.
   *
   * @param sessionId - Unique session identifier
   * @param userId - User ID from authentication
   */
  constructor(sessionId: string, userId: string) {
    this.sessionId = sessionId;
    this.userId = userId;
  }

  // ---------------------------------------------------------------------------
  // Activity Tracking
  // ---------------------------------------------------------------------------

  /**
   * Updates the last activity timestamp.
   * Call this when any message is received from the client.
   */
  public updateActivity(): void {
    this.lastActivityTime = Date.now();
  }

  /**
   * Checks if the session has been inactive for too long.
   *
   * @param timeoutMs - Inactivity timeout in milliseconds
   * @returns true if session is inactive
   */
  public isInactive(timeoutMs: number): boolean {
    return Date.now() - this.lastActivityTime > timeoutMs;
  }

  /**
   * Gets the time since last activity in milliseconds.
   */
  public getInactivityDuration(): number {
    return Date.now() - this.lastActivityTime;
  }

  // ---------------------------------------------------------------------------
  // State Management
  // ---------------------------------------------------------------------------

  /**
   * Clears all cached state.
   * Call this on level change or reconnection.
   */
  public clearState(): void {
    this.lastSentEntities.clear();
    this.lastPlayerState = null;
    this.lastTerrainState = null;
    this.pendingEvents = [];
    this.lastSentTick = 0;
    this.lastTurnActive = false;
  }

  /**
   * Marks the session as ready to receive game state.
   */
  public markReady(): void {
    this.isReady = true;
    this.connectionState = "ready";
  }

  /**
   * Marks the session as disconnected.
   */
  public markDisconnected(): void {
    this.connectionState = "disconnected";
    this.isReady = false;
  }

  // ---------------------------------------------------------------------------
  // Event Management
  // ---------------------------------------------------------------------------

  /**
   * Adds an event to the pending queue.
   *
   * @param event - Event data to queue
   */
  public queueEvent(event: GameEventData): void {
    this.pendingEvents.push(event);
  }

  /**
   * Drains and returns all pending events.
   * Clears the pending events array.
   *
   * @returns Array of pending events
   */
  public drainEvents(): GameEventData[] {
    const events = this.pendingEvents;
    this.pendingEvents = [];
    return events;
  }

  /**
   * Gets the number of pending events.
   */
  public getPendingEventCount(): number {
    return this.pendingEvents.length;
  }

  // ---------------------------------------------------------------------------
  // Statistics
  // ---------------------------------------------------------------------------

  /**
   * Records a sent message.
   *
   * @param byteSize - Approximate size in bytes
   */
  public recordSentMessage(byteSize: number): void {
    this.stats.messagesSent++;
    this.stats.bytesSent += byteSize;
  }

  /**
   * Records a received message.
   *
   * @param byteSize - Approximate size in bytes
   */
  public recordReceivedMessage(byteSize: number): void {
    this.stats.messagesReceived++;
    this.stats.bytesReceived += byteSize;
    this.updateActivity();
  }

  /**
   * Records a completed ping-pong round trip.
   *
   * @param rttMs - Round-trip time in milliseconds
   */
  public recordPingRtt(rttMs: number): void {
    this.stats.lastPingRtt = rttMs;
  }

  /**
   * Gets session duration in milliseconds.
   */
  public getSessionDuration(): number {
    return Date.now() - this.stats.connectedAt;
  }

  // ---------------------------------------------------------------------------
  // Debugging
  // ---------------------------------------------------------------------------

  /**
   * Returns a debug summary of the session.
   */
  public toDebugString(): string {
    return [
      `GameSession[${this.sessionId}]`,
      `  userId: ${this.userId}`,
      `  playerId: ${this.playerId ?? "null"}`,
      `  state: ${this.connectionState}`,
      `  ready: ${this.isReady}`,
      `  lastTick: ${this.lastSentTick}`,
      `  cachedEntities: ${this.lastSentEntities.size}`,
      `  pendingEvents: ${this.pendingEvents.length}`,
      `  inactive: ${this.getInactivityDuration()}ms`,
      `  rtt: ${this.stats.lastPingRtt}ms`,
    ].join("\n");
  }
}

// =============================================================================
// Factory Functions
// =============================================================================

/**
 * Creates a new GameSession.
 * Convenience factory function.
 *
 * @param sessionId - Unique session identifier
 * @param userId - User ID from authentication
 * @returns New GameSession instance
 */
export function createGameSession(
  sessionId: string,
  userId: string,
): GameSession {
  return new GameSession(sessionId, userId);
}

// =============================================================================
// Snapshot Utilities
// =============================================================================

/**
 * Computes a hash for an entity snapshot.
 * Used for quick change detection.
 *
 * @param x - X position
 * @param y - Y position
 * @param glyph - Display glyph
 * @param fgColor - Foreground color
 * @param hp - Optional health data
 * @returns Hash number
 */
export function computeEntityHash(
  x: number,
  y: number,
  glyph: string,
  fgColor: string,
  hp?: { current: number; max: number },
): number {
  let hash = 0;
  hash = (hash * 31 + x) | 0;
  hash = (hash * 31 + y) | 0;
  hash = (hash * 31 + stringHash(glyph)) | 0;
  hash = (hash * 31 + stringHash(fgColor)) | 0;
  if (hp) {
    hash = (hash * 31 + hp.current) | 0;
    hash = (hash * 31 + hp.max) | 0;
  }
  return hash;
}

/**
 * Computes a hash for a string.
 * Simple djb2-style hash.
 *
 * @param str - String to hash
 * @returns Hash number
 */
export function stringHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return hash;
}

/**
 * Computes a hash for an inventory.
 * Used to detect inventory changes without deep comparison.
 *
 * @param items - Array of item entity IDs and counts
 * @returns Hash number
 */
export function computeInventoryHash(
  items: Array<{ id: Entity; count: number }>,
): number {
  let hash = 0;
  for (const item of items) {
    hash = (hash * 31 + item.id) | 0;
    hash = (hash * 31 + item.count) | 0;
  }
  return hash;
}

/**
 * Computes a hash for equipment state.
 *
 * @param equipment - Equipment slot entity IDs
 * @returns Hash number
 */
export function computeEquipmentHash(equipment: {
  weapon?: Entity;
  armor?: Entity;
  helmet?: Entity;
  accessory?: Entity;
}): number {
  let hash = 0;
  hash = (hash * 31 + (equipment.weapon ?? 0)) | 0;
  hash = (hash * 31 + (equipment.armor ?? 0)) | 0;
  hash = (hash * 31 + (equipment.helmet ?? 0)) | 0;
  hash = (hash * 31 + (equipment.accessory ?? 0)) | 0;
  return hash;
}
