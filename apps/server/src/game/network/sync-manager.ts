/**
 * Network Sync Manager
 *
 * Manages synchronization between ECS world state and network clients.
 * Computes state deltas, filters by FOV, and broadcasts events.
 *
 * @see NETWORK_ARCHITECTURE.md for full specification
 */

import type {
  EventQueue,
  GameEvent,
  TimestampedEvent,
} from "../ecs/core/events";
import type { World } from "../ecs/core/world";
import type { ActorNameData } from "../ecs/game/components/actor";
import type { FOVData, VisibleCellsData } from "../ecs/game/components/fov";
import { packCoords, unpackCoords } from "../ecs/game/components/fov";
import type {
  EquipmentData,
  InventoryData,
  ItemData,
} from "../ecs/game/components/items";
import type { RenderableData } from "../ecs/game/components/render";
import type { PositionData } from "../ecs/game/components/spatial";
import type { ExperienceData, HealthData } from "../ecs/game/components/stats";
import type { GameMap, TileType } from "../ecs/game/resources/game-map";
import type { TurnStateManager } from "../ecs/game/resources/turn-state";
import type { Entity } from "../ecs/types";
import {
  computeEntityHash,
  computeEquipmentHash,
  computeInventoryHash,
  type EntitySnapshot,
  GameSession,
  type PlayerSnapshot,
  type TerrainSnapshot,
} from "./game-session";
import {
  type EntityData,
  type EntityUpdate,
  type EquipmentState,
  type ExperienceInfo,
  type FullPlayerData,
  type FullStateMessage,
  type GameEventData,
  type HealthInfo,
  type InventoryItem,
  type PlayerDelta,
  PROTOCOL_VERSION,
  packCoord,
  type StateDeltaMessage,
  type TerrainData,
  type TerrainDelta,
  type TerrainTile,
} from "./types";

// =============================================================================
// Types
// =============================================================================

/**
 * Events that should be broadcast to clients.
 */
const BROADCAST_EVENT_TYPES: ReadonlySet<string> = new Set([
  "combat.damage",
  "combat.death",
  "entity.died",
  "item.picked_up",
  "item.dropped",
  "item.equipped",
  "item.unequipped",
  "item.used",
  "door.opened",
  "door.closed",
  "level.changed",
  "status.applied",
  "status.expired",
]);

// =============================================================================
// NetworkSyncManager Class
// =============================================================================

/**
 * NetworkSyncManager handles synchronization between ECS and network clients.
 *
 * Responsibilities:
 * - Manage client sessions
 * - Compute full state for initial sync
 * - Compute state deltas for incremental updates
 * - Filter entities by player FOV
 * - Queue and broadcast game events
 *
 * @example
 * ```typescript
 * const syncManager = new NetworkSyncManager(world);
 *
 * // On client connect
 * const session = syncManager.createSession(sessionId, userId);
 * session.playerId = playerEntity;
 *
 * // On client ready
 * const fullState = syncManager.getFullState(sessionId);
 * ws.send(JSON.stringify(fullState));
 *
 * // After each game tick
 * const delta = syncManager.getStateDelta(sessionId);
 * if (delta) ws.send(JSON.stringify(delta));
 * ```
 */
export class NetworkSyncManager {
  /**
   * Active sessions by session ID.
   */
  private readonly sessions = new Map<string, GameSession>();

  /**
   * Reference to the ECS world.
   */
  private readonly world: World;

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  /**
   * Creates a new NetworkSyncManager.
   *
   * @param world - The ECS world to synchronize
   */
  constructor(world: World) {
    this.world = world;
    this.subscribeToGameEvents();
  }

  // ---------------------------------------------------------------------------
  // Session Management
  // ---------------------------------------------------------------------------

  /**
   * Creates a new game session.
   *
   * @param sessionId - Unique session identifier
   * @param userId - User ID from authentication
   * @returns The created session
   */
  public createSession(sessionId: string, userId: string): GameSession {
    const session = new GameSession(sessionId, userId);
    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Gets a session by ID.
   *
   * @param sessionId - Session identifier
   * @returns The session or undefined
   */
  public getSession(sessionId: string): GameSession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Removes a session.
   *
   * @param sessionId - Session identifier
   * @returns true if session was removed
   */
  public removeSession(sessionId: string): boolean {
    return this.sessions.delete(sessionId);
  }

  /**
   * Gets all active sessions.
   *
   * @returns Iterator of [sessionId, session] pairs
   */
  public getAllSessions(): IterableIterator<[string, GameSession]> {
    return this.sessions.entries();
  }

  /**
   * Gets the number of active sessions.
   */
  public getSessionCount(): number {
    return this.sessions.size;
  }

  // ---------------------------------------------------------------------------
  // Event Subscription
  // ---------------------------------------------------------------------------

  /**
   * Subscribes to game events for broadcasting.
   */
  private subscribeToGameEvents(): void {
    const eventQueue = this.world.resources.get<EventQueue>("eventQueue");
    if (!eventQueue) {
      console.warn(
        "[NetworkSyncManager] EventQueue not found in world resources",
      );
      return;
    }

    // Subscribe to all broadcast-worthy events
    eventQueue.onAny((event: TimestampedEvent) => {
      if (BROADCAST_EVENT_TYPES.has(event.type)) {
        this.broadcastEvent(event);
      }
    });
  }

  /**
   * Broadcasts an event to relevant sessions.
   */
  private broadcastEvent(event: GameEvent): void {
    const eventData = this.gameEventToData(event);
    if (!eventData) return;

    // Add to pending events for all sessions where relevant
    for (const session of this.sessions.values()) {
      if (this.isEventRelevantToSession(event, session)) {
        session.queueEvent(eventData);
      }
    }
  }

  /**
   * Checks if an event is relevant to a session.
   * Events are relevant if they involve the player or visible entities.
   */
  private isEventRelevantToSession(
    event: GameEvent,
    session: GameSession,
  ): boolean {
    if (!session.playerId) return false;

    // Player's own events are always relevant
    if ("entity" in event && event.entity === session.playerId) return true;
    if ("attacker" in event && event.attacker === session.playerId) return true;
    if ("target" in event && event.target === session.playerId) return true;
    if ("picker" in event && event.picker === session.playerId) return true;
    if ("user" in event && event.user === session.playerId) return true;
    if ("dropper" in event && event.dropper === session.playerId) return true;

    // Events involving visible entities are relevant
    const visibleEntities = this.getVisibleEntityIds(session);

    if ("entity" in event && visibleEntities.has(event.entity)) return true;
    if ("attacker" in event && visibleEntities.has(event.attacker)) return true;
    if ("target" in event && visibleEntities.has(event.target)) return true;
    if ("door" in event && visibleEntities.has(event.door)) return true;

    // Level events are always relevant
    if (event.type === "level.changed") return true;

    return false;
  }

  /**
   * Converts a game event to network event data.
   */
  private gameEventToData(event: GameEvent): GameEventData | null {
    switch (event.type) {
      case "combat.damage":
        return {
          type: "damage",
          src: event.attacker,
          tgt: event.target,
          dmg: event.actualDamage,
          crit: event.isCritical,
        };

      case "combat.death":
      case "entity.died":
        return {
          type: "death",
          ent: event.entity,
          killer: "killer" in event ? event.killer : undefined,
        };

      case "item.picked_up":
        return {
          type: "pickup",
          ent: event.picker,
          item: event.item,
          name: event.itemType,
        };

      case "item.dropped":
        return {
          type: "drop",
          ent: event.dropper,
          item: event.item,
          name: "", // Name not available in event
        };

      case "item.equipped":
        return {
          type: "equip",
          ent: event.entity,
          item: event.item,
          slot: event.slot,
        };

      case "item.unequipped":
        return {
          type: "unequip",
          ent: event.entity,
          slot: event.slot,
        };

      case "item.used":
        return {
          type: "message",
          text: `Used ${event.effect}`,
          color: "#88ff88",
        };

      case "door.opened":
        return {
          type: "door",
          ent: event.entity,
          door: event.door,
          open: true,
        };

      case "door.closed":
        return {
          type: "door",
          ent: event.entity,
          door: event.door,
          open: false,
        };

      case "level.changed":
        return {
          type: "level",
          level: event.level,
          direction: event.level > event.previousLevel ? "down" : "up",
        };

      case "status.applied":
        return {
          type: "status",
          ent: event.entity,
          status: event.status,
          applied: true,
        };

      case "status.expired":
        return {
          type: "status",
          ent: event.entity,
          status: event.status,
          applied: false,
        };

      default:
        return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Full State Computation
  // ---------------------------------------------------------------------------

  /**
   * Gets the full game state for a session.
   * Used on initial connection or level change.
   *
   * @param sessionId - Session identifier
   * @returns Full state message or null if session invalid
   */
  public getFullState(sessionId: string): FullStateMessage | null {
    const session = this.sessions.get(sessionId);
    if (!session?.playerId) return null;

    const gameMap = this.world.resources.get<GameMap>("gameMap");
    if (!gameMap) return null;

    const tick = this.getCurrentTick();

    // Get visible entities
    const visibleEntities = this.getVisibleEntities(session);
    const entityDataList = this.entitiesToData(visibleEntities);

    // Get terrain
    const terrain = this.getVisibleTerrain(session, gameMap);

    // Get player data
    const playerData = this.getFullPlayerData(session.playerId);
    if (!playerData) return null;

    // Update session state
    session.lastSentTick = tick;
    session.lastSentEntities = this.createEntitySnapshotMap(visibleEntities);
    session.lastPlayerState = this.createPlayerSnapshot(session.playerId);
    session.lastTerrainState = this.createTerrainSnapshot(session, gameMap);

    return {
      t: "full",
      v: PROTOCOL_VERSION,
      tick,
      map: { w: gameMap.width, h: gameMap.height },
      terrain,
      entities: entityDataList,
      player: playerData,
    };
  }

  /**
   * Gets visible terrain data for a session.
   */
  private getVisibleTerrain(
    session: GameSession,
    gameMap: GameMap,
  ): TerrainData {
    if (!session.playerId) {
      return { visible: [], explored: [] };
    }

    const visibleCells = this.world.getComponent<VisibleCellsData>(
      session.playerId,
      "VisibleCells",
    );

    const visible: TerrainTile[] = [];
    const explored: number[] = [];

    if (visibleCells) {
      // Add currently visible tiles
      for (let i = 0; i < visibleCells.count; i++) {
        const packed = visibleCells.cells[i];
        const { x, y } = unpackCoords(packed);
        const tileType = gameMap.getTile(x, y) as TileType;
        visible.push({ c: packCoord(x, y), t: tileType });
      }
    }

    // Add explored tiles (iterate through map)
    for (let y = 0; y < gameMap.height; y++) {
      for (let x = 0; x < gameMap.width; x++) {
        if (gameMap.isExplored(x, y)) {
          explored.push(packCoord(x, y));
        }
      }
    }

    return { visible, explored };
  }

  /**
   * Gets full player data.
   */
  private getFullPlayerData(playerId: Entity): FullPlayerData | null {
    const pos = this.world.getComponent<PositionData>(playerId, "Position");
    const health = this.world.getComponent<HealthData>(playerId, "Health");
    const fov = this.world.getComponent<FOVData>(playerId, "FOV");

    if (!pos || !health) return null;

    const inventory = this.getPlayerInventory(playerId);
    const equipment = this.getPlayerEquipment(playerId);
    const xp = this.getPlayerExperience(playerId);

    return {
      id: playerId,
      x: pos.x,
      y: pos.y,
      hp: { c: health.current, m: health.max },
      inv: inventory,
      eq: equipment,
      xp,
      fov: fov?.radius ?? 8,
    };
  }

  /**
   * Gets player inventory items.
   */
  private getPlayerInventory(playerId: Entity): InventoryItem[] {
    const inventory = this.world.getComponent<InventoryData>(
      playerId,
      "Inventory",
    );
    if (!inventory) return [];

    const items: InventoryItem[] = [];
    const equipment = this.world.getComponent<EquipmentData>(
      playerId,
      "Equipment",
    );

    for (const itemId of inventory.items) {
      if (!this.world.isAlive(itemId)) continue;

      const item = this.world.getComponent<ItemData>(itemId, "Item");
      const render = this.world.getComponent<RenderableData>(
        itemId,
        "Renderable",
      );
      const name = this.world.getComponent<ActorNameData>(itemId, "ActorName");

      if (!item || !render) continue;

      // Check if equipped
      const isEquipped =
        equipment &&
        (equipment.weapon === itemId ||
          equipment.armor === itemId ||
          equipment.helmet === itemId ||
          equipment.accessory === itemId);

      items.push({
        id: itemId,
        g: render.glyph,
        n: name?.name ?? item.itemType,
        qty: item.count,
        eq: isEquipped || undefined,
      });
    }

    return items;
  }

  /**
   * Gets player equipment state.
   */
  private getPlayerEquipment(playerId: Entity): EquipmentState {
    const equipment = this.world.getComponent<EquipmentData>(
      playerId,
      "Equipment",
    );
    if (!equipment) return {};

    return {
      weapon: equipment.weapon ? (equipment.weapon as Entity) : undefined,
      armor: equipment.armor ? (equipment.armor as Entity) : undefined,
      helmet: equipment.helmet ? (equipment.helmet as Entity) : undefined,
      accessory: equipment.accessory
        ? (equipment.accessory as Entity)
        : undefined,
    };
  }

  /**
   * Gets player experience info.
   */
  private getPlayerExperience(playerId: Entity): ExperienceInfo {
    const xp = this.world.getComponent<ExperienceData>(playerId, "Experience");
    if (!xp) {
      return { lv: 1, cur: 0, next: 100 };
    }
    return {
      lv: xp.level,
      cur: xp.current,
      next: xp.toNextLevel,
    };
  }

  // ---------------------------------------------------------------------------
  // Delta Computation
  // ---------------------------------------------------------------------------

  /**
   * Gets the state delta for a session since last update.
   *
   * @param sessionId - Session identifier
   * @returns State delta message or null if no changes
   */
  public getStateDelta(sessionId: string): StateDeltaMessage | null {
    const session = this.sessions.get(sessionId);
    if (!session?.playerId || !session.isReady) return null;

    const tick = this.getCurrentTick();

    // Get current visible entities
    const currentVisibleEntities = this.getVisibleEntities(session);
    const currentEntityMap = this.createEntitySnapshotMap(
      currentVisibleEntities,
    );

    // Compute entity changes
    const added: EntityData[] = [];
    const updated: EntityUpdate[] = [];
    const removed: Entity[] = [];

    // Find added and updated entities
    for (const [entity, snapshot] of currentEntityMap) {
      const previousSnapshot = session.lastSentEntities.get(entity);

      if (!previousSnapshot) {
        // New entity in FOV
        added.push(this.snapshotToEntityData(entity, snapshot));
      } else if (snapshot.hash !== previousSnapshot.hash) {
        // Entity changed
        const update = this.computeEntityUpdate(
          entity,
          previousSnapshot,
          snapshot,
        );
        if (update) {
          updated.push(update);
        }
      }
    }

    // Find removed entities
    for (const [entity] of session.lastSentEntities) {
      if (!currentEntityMap.has(entity)) {
        removed.push(entity);
      }
    }

    // Compute player delta
    const playerDelta = this.computePlayerDelta(session);

    // Compute terrain delta
    const terrainDelta = this.computeTerrainDelta(session);

    // Update session state
    session.lastSentEntities = currentEntityMap;
    session.lastSentTick = tick;

    if (playerDelta) {
      session.lastPlayerState = this.createPlayerSnapshot(session.playerId);
    }

    // If nothing changed, return null
    if (
      added.length === 0 &&
      updated.length === 0 &&
      removed.length === 0 &&
      !playerDelta &&
      !terrainDelta
    ) {
      return null;
    }

    return {
      t: "state",
      tick,
      add: added.length > 0 ? added : undefined,
      upd: updated.length > 0 ? updated : undefined,
      rem: removed.length > 0 ? removed : undefined,
      player: playerDelta ?? undefined,
      terrain: terrainDelta ?? undefined,
    };
  }

  /**
   * Computes an entity update (partial data).
   */
  private computeEntityUpdate(
    entity: Entity,
    prev: EntitySnapshot,
    curr: EntitySnapshot,
  ): EntityUpdate | null {
    const update: EntityUpdate = { id: entity };
    let hasChanges = false;

    if (prev.x !== curr.x) {
      update.x = curr.x;
      hasChanges = true;
    }
    if (prev.y !== curr.y) {
      update.y = curr.y;
      hasChanges = true;
    }
    if (prev.glyph !== curr.glyph) {
      update.g = curr.glyph;
      hasChanges = true;
    }
    if (prev.fgColor !== curr.fgColor) {
      update.fg = curr.fgColor;
      hasChanges = true;
    }
    if (
      prev.hp?.current !== curr.hp?.current ||
      prev.hp?.max !== curr.hp?.max
    ) {
      if (curr.hp) {
        update.hp = { c: curr.hp.current, m: curr.hp.max };
      }
      hasChanges = true;
    }

    return hasChanges ? update : null;
  }

  /**
   * Computes player delta (changed fields only).
   */
  private computePlayerDelta(session: GameSession): PlayerDelta | null {
    if (!session.playerId) return null;

    const prev = session.lastPlayerState;
    if (!prev) return null; // First update handled by getFullState

    const pos = this.world.getComponent<PositionData>(
      session.playerId,
      "Position",
    );
    const health = this.world.getComponent<HealthData>(
      session.playerId,
      "Health",
    );

    if (!pos || !health) return null;

    const delta: PlayerDelta = {};
    let hasChanges = false;

    // Check position
    if (prev.x !== pos.x) {
      delta.x = pos.x;
      hasChanges = true;
    }
    if (prev.y !== pos.y) {
      delta.y = pos.y;
      hasChanges = true;
    }

    // Check health
    if (prev.hp.current !== health.current || prev.hp.max !== health.max) {
      delta.hp = { c: health.current, m: health.max };
      hasChanges = true;
    }

    // Check inventory
    const inventory = this.getPlayerInventory(session.playerId);
    const invHash = computeInventoryHash(
      inventory.map((i) => ({ id: i.id, count: i.qty })),
    );
    if (prev.inventoryHash !== invHash) {
      delta.inv = inventory;
      hasChanges = true;
    }

    // Check equipment
    const equipment = this.getPlayerEquipment(session.playerId);
    const eqHash = computeEquipmentHash(equipment);
    if (prev.equipmentHash !== eqHash) {
      delta.eq = equipment;
      hasChanges = true;
    }

    // Check experience
    const xp = this.getPlayerExperience(session.playerId);
    if (
      prev.xp.level !== xp.lv ||
      prev.xp.current !== xp.cur ||
      prev.xp.toNext !== xp.next
    ) {
      delta.xp = xp;
      hasChanges = true;
    }

    return hasChanges ? delta : null;
  }

  /**
   * Computes terrain delta (newly explored/visible).
   */
  private computeTerrainDelta(session: GameSession): TerrainDelta | null {
    if (!session.playerId) return null;

    const gameMap = this.world.resources.get<GameMap>("gameMap");
    if (!gameMap) return null;

    const prev = session.lastTerrainState;
    if (!prev) return null;

    const visibleCells = this.world.getComponent<VisibleCellsData>(
      session.playerId,
      "VisibleCells",
    );

    const delta: TerrainDelta = {};
    let hasChanges = false;

    // Find newly visible cells
    if (visibleCells) {
      const newlyVisible: number[] = [];
      for (let i = 0; i < visibleCells.count; i++) {
        const packed = visibleCells.cells[i];
        if (!prev.visibleCells.has(packed)) {
          const { x, y } = unpackCoords(packed);
          newlyVisible.push(packCoord(x, y));
        }
      }
      if (newlyVisible.length > 0) {
        delta.visible = newlyVisible;
        hasChanges = true;
      }
    }

    // Find newly explored cells (simplified - just count change)
    let currentExploredCount = 0;
    for (let y = 0; y < gameMap.height; y++) {
      for (let x = 0; x < gameMap.width; x++) {
        if (gameMap.isExplored(x, y)) {
          currentExploredCount++;
        }
      }
    }

    if (currentExploredCount > prev.exploredCount) {
      // There are new explored cells, but we'd need to track them individually
      // For now, we skip this optimization
    }

    return hasChanges ? delta : null;
  }

  // ---------------------------------------------------------------------------
  // Entity Visibility
  // ---------------------------------------------------------------------------

  /**
   * Gets entities visible to a session's player.
   *
   * @param session - Game session
   * @returns Map of entity ID to position data
   */
  private getVisibleEntities(session: GameSession): Map<
    Entity,
    {
      pos: PositionData;
      render: RenderableData;
      health?: HealthData;
      name?: string;
    }
  > {
    if (!session.playerId) return new Map();

    const visibleCells = this.world.getComponent<VisibleCellsData>(
      session.playerId,
      "VisibleCells",
    );
    if (!visibleCells) return new Map();

    const gameMap = this.world.resources.get<GameMap>("gameMap");
    if (!gameMap) return new Map();

    const entities = new Map<
      Entity,
      {
        pos: PositionData;
        render: RenderableData;
        health?: HealthData;
        name?: string;
      }
    >();

    // Iterate visible cells and collect entities
    for (let i = 0; i < visibleCells.count; i++) {
      const { x, y } = unpackCoords(visibleCells.cells[i]);

      for (const entity of gameMap.getEntitiesAt(x, y)) {
        if (entity === session.playerId) continue; // Skip player

        const pos = this.world.getComponent<PositionData>(entity, "Position");
        const render = this.world.getComponent<RenderableData>(
          entity,
          "Renderable",
        );

        if (!pos || !render) continue;

        const health = this.world.getComponent<HealthData>(entity, "Health");
        const actorName = this.world.getComponent<ActorNameData>(
          entity,
          "ActorName",
        );

        entities.set(entity, {
          pos,
          render,
          health: health ?? undefined,
          name: actorName?.name,
        });
      }
    }

    return entities;
  }

  /**
   * Gets just the IDs of visible entities.
   */
  private getVisibleEntityIds(session: GameSession): Set<Entity> {
    const entities = this.getVisibleEntities(session);
    return new Set(entities.keys());
  }

  // ---------------------------------------------------------------------------
  // Snapshot Creation
  // ---------------------------------------------------------------------------

  /**
   * Creates an entity snapshot map from visible entities.
   */
  private createEntitySnapshotMap(
    entities: Map<
      Entity,
      {
        pos: PositionData;
        render: RenderableData;
        health?: HealthData;
        name?: string;
      }
    >,
  ): Map<Entity, EntitySnapshot> {
    const map = new Map<Entity, EntitySnapshot>();

    for (const [entity, data] of entities) {
      const snapshot: EntitySnapshot = {
        x: data.pos.x,
        y: data.pos.y,
        glyph: data.render.glyph,
        fgColor: data.render.fgColor,
        hp: data.health
          ? { current: data.health.current, max: data.health.max }
          : undefined,
        hash: computeEntityHash(
          data.pos.x,
          data.pos.y,
          data.render.glyph,
          data.render.fgColor,
          data.health,
        ),
      };
      map.set(entity, snapshot);
    }

    return map;
  }

  /**
   * Creates a player snapshot for delta computation.
   */
  private createPlayerSnapshot(playerId: Entity): PlayerSnapshot | null {
    const pos = this.world.getComponent<PositionData>(playerId, "Position");
    const health = this.world.getComponent<HealthData>(playerId, "Health");

    if (!pos || !health) return null;

    const inventory = this.getPlayerInventory(playerId);
    const equipment = this.getPlayerEquipment(playerId);
    const xp = this.getPlayerExperience(playerId);

    return {
      x: pos.x,
      y: pos.y,
      hp: { current: health.current, max: health.max },
      inventoryHash: computeInventoryHash(
        inventory.map((i) => ({ id: i.id, count: i.qty })),
      ),
      equipmentHash: computeEquipmentHash(equipment),
      xp: { level: xp.lv, current: xp.cur, toNext: xp.next },
    };
  }

  /**
   * Creates a terrain snapshot for delta computation.
   */
  private createTerrainSnapshot(
    session: GameSession,
    gameMap: GameMap,
  ): TerrainSnapshot {
    const visibleCells = this.world.getComponent<VisibleCellsData>(
      session.playerId!,
      "VisibleCells",
    );

    const visibleSet = new Set<number>();
    if (visibleCells) {
      for (let i = 0; i < visibleCells.count; i++) {
        visibleSet.add(visibleCells.cells[i]);
      }
    }

    let exploredCount = 0;
    let exploredHash = 0;
    for (let y = 0; y < gameMap.height; y++) {
      for (let x = 0; x < gameMap.width; x++) {
        if (gameMap.isExplored(x, y)) {
          exploredCount++;
          exploredHash = (exploredHash * 31 + packCoord(x, y)) | 0;
        }
      }
    }

    return {
      exploredCount,
      exploredHash,
      visibleCells: visibleSet,
    };
  }

  // ---------------------------------------------------------------------------
  // Data Conversion
  // ---------------------------------------------------------------------------

  /**
   * Converts visible entities to EntityData array.
   */
  private entitiesToData(
    entities: Map<
      Entity,
      {
        pos: PositionData;
        render: RenderableData;
        health?: HealthData;
        name?: string;
      }
    >,
  ): EntityData[] {
    const data: EntityData[] = [];

    for (const [entity, { pos, render, health, name }] of entities) {
      data.push({
        id: entity,
        x: pos.x,
        y: pos.y,
        g: render.glyph,
        fg: render.fgColor,
        n: name,
        hp: health ? { c: health.current, m: health.max } : undefined,
      });
    }

    return data;
  }

  /**
   * Converts an entity snapshot to EntityData.
   */
  private snapshotToEntityData(
    entity: Entity,
    snapshot: EntitySnapshot,
  ): EntityData {
    const actorName = this.world.getComponent<ActorNameData>(
      entity,
      "ActorName",
    );

    return {
      id: entity,
      x: snapshot.x,
      y: snapshot.y,
      g: snapshot.glyph,
      fg: snapshot.fgColor,
      n: actorName?.name,
      hp: snapshot.hp
        ? { c: snapshot.hp.current, m: snapshot.hp.max }
        : undefined,
    };
  }

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------

  /**
   * Gets the current game tick.
   */
  private getCurrentTick(): number {
    const turnState = this.world.resources.get<TurnStateManager>("turnState");
    return turnState?.getCurrentTick() ?? 0;
  }

  /**
   * Checks if it's a specific player's turn.
   */
  public isPlayerTurn(playerId: Entity): boolean {
    const turnState = this.world.resources.get<TurnStateManager>("turnState");
    if (!turnState) return false;

    const state = turnState.getState();
    return state.activeEntity === playerId && state.turnPhase === "acting";
  }

  /**
   * Gets turn information for a session.
   */
  public getTurnInfo(
    sessionId: string,
  ): { active: boolean; tick: number } | null {
    const session = this.sessions.get(sessionId);
    if (!session?.playerId) return null;

    const turnState = this.world.resources.get<TurnStateManager>("turnState");
    if (!turnState) return null;

    const state = turnState.getState();
    return {
      active:
        state.activeEntity === session.playerId && state.turnPhase === "acting",
      tick: state.currentTick,
    };
  }
}
