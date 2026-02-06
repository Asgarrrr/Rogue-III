# WebSocket Network Architecture - Rogue III

**Version:** 1.0.0  
**Created:** 2025-01-XX  
**Status:** 📋 Specification - Ready for Implementation  
**Author:** Claude  
**Breaking Changes:** N/A (New feature)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Architecture Overview](#2-architecture-overview)
3. [Design Decisions](#3-design-decisions)
4. [Protocol Specification](#4-protocol-specification)
5. [Component Design](#5-component-design)
6. [Data Flow](#6-data-flow)
7. [Security Considerations](#7-security-considerations)
8. [Error Handling](#8-error-handling)
9. [Performance Considerations](#9-performance-considerations)
10. [Implementation Plan](#10-implementation-plan)
11. [Testing Strategy](#11-testing-strategy)
12. [Future Considerations](#12-future-considerations)

---

## 1. Executive Summary

### 1.1 Purpose

This document specifies the WebSocket-based network architecture for Rogue III, enabling real-time communication between the game client and server. The server remains the **single source of truth** for all game state, while the client receives **FOV-filtered updates** to ensure players only see what their character can see.

### 1.2 Key Requirements

| Requirement           | Description                                                 | Priority |
| --------------------- | ----------------------------------------------------------- | -------- |
| **FOV Filtering**     | Client only receives entities within player's field of view | P0       |
| **Server Authority**  | All game logic runs on server; client is a thin renderer    | P0       |
| **Low Latency**       | Responsive feedback for player actions (<100ms round-trip)  | P1       |
| **Delta Compression** | Send only changed data to minimize bandwidth                | P1       |
| **Robustness**        | Handle disconnections, reconnections gracefully             | P1       |
| **Extensibility**     | Easy to add multiplayer later                               | P2       |

### 1.3 Non-Goals (For This Version)

- Multi-player synchronization
- Spectator mode
- Replay recording
- Client-side prediction

---

## 2. Architecture Overview

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              SERVER                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────┐      ┌────────────────────┐      ┌─────────────────┐  │
│  │   ws.ts      │─────▶│    GameServer      │─────▶│      World      │  │
│  │  (Elysia)    │      │                    │      │      (ECS)      │  │
│  │              │      │  • handleConnect   │      │                 │  │
│  │  /ws/game    │      │  • handleMessage   │      │  • Components   │  │
│  └──────────────┘      │  • handleClose     │      │  • Systems      │  │
│         ▲              └────────────────────┘      │  • Resources    │  │
│         │                       │                  └────────┬────────┘  │
│         │                       │                           │           │
│         │                       ▼                           ▼           │
│         │              ┌────────────────────┐      ┌─────────────────┐  │
│         │              │  NetworkSyncManager │◀─────│   EventQueue    │  │
│         │              │                    │      └─────────────────┘  │
│         │              │  • sessions        │                           │
│         │              │  • getStateDelta() │                           │
│         │              │  • processInput()  │                           │
│         └──────────────│  • broadcastState()│                           │
│                        └────────────────────┘                           │
│                                 │                                        │
│                                 ▼                                        │
│                        ┌────────────────────┐                           │
│                        │   GameSession      │                           │
│                        │                    │                           │
│                        │  • playerId        │                           │
│                        │  • lastSentState   │                           │
│                        │  • pendingEvents   │                           │
│                        └────────────────────┘                           │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ WebSocket
                                    │ JSON Messages
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              CLIENT                                      │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ┌──────────────────┐    ┌─────────────────┐    ┌───────────────────┐  │
│  │  WebSocket       │───▶│  GameClient     │───▶│  Renderer         │  │
│  │  Connection      │    │                 │    │                   │  │
│  │                  │    │  • state        │    │  • Canvas/WebGL   │  │
│  │                  │    │  • handleMsg()  │    │  • Animations     │  │
│  └──────────────────┘    │  • sendInput()  │    │  • UI             │  │
│                          └─────────────────┘    └───────────────────┘  │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

### 2.2 Component Responsibilities

| Component                    | Responsibility                                                      |
| ---------------------------- | ------------------------------------------------------------------- |
| **ws.ts**                    | WebSocket route handler (Elysia), authentication                    |
| **GameServer**               | Orchestrates game loop, manages sessions, routes messages           |
| **NetworkSyncManager**       | Computes state deltas, FOV filtering, event broadcasting            |
| **GameSession**              | Per-client state: player entity, last sent snapshot, pending events |
| **World**                    | ECS world containing all game state                                 |
| **GameClient** (client-side) | Receives state, sends inputs, manages local display state           |

---

## 3. Design Decisions

### 3.1 Protocol Format: JSON

**Decision:** Use JSON for all messages.

**Rationale:**
| Factor | JSON | Binary | MessagePack |
|--------|------|--------|-------------|
| Parse speed | ~0.01ms for <1KB | Faster | ~0.01ms |
| Message size | ~300-500 bytes avg | ~150-250 bytes | ~200-350 bytes |
| Debug ease | ✅ Excellent | ❌ Poor | ⚠️ Moderate |
| Implementation | ✅ Native | ❌ Complex | ⚠️ Dependency |
| Extensibility | ✅ Easy | ❌ Schema changes hard | ✅ Easy |

**Justification:**

- Turn-based roguelike doesn't require real-time precision
- WebSocket compression (`permessage-deflate`) reduces JSON by 60-70%
- Development velocity and debugging more important than micro-optimization
- Can migrate to MessagePack later if needed (drop-in replacement)

### 3.2 Update Model: Event-Driven

**Decision:** Send updates only when game state changes (not polling/tick-based).

**Rationale:**

- Roguelike turns can take seconds (player thinking time)
- No value in sending "nothing changed" messages
- Reduces bandwidth and server CPU

**Flow:**

1. Client sends input
2. Server processes input, runs game systems
3. Server computes state delta
4. Server sends delta to client
5. Client renders update

### 3.3 State Synchronization: Delta Compression

**Decision:** Send only changed data, computed per-client based on their FOV.

**Types of updates:**

- **Added:** Entity entered FOV (or spawned)
- **Updated:** Entity in FOV changed (position, health, etc.)
- **Removed:** Entity left FOV (or despawned)

### 3.4 Short Keys for Bandwidth

**Decision:** Use single-letter keys in JSON for common fields.

```typescript
// Instead of:
{ "type": "move", "direction": 2 }

// Use:
{ "t": "m", "d": 2 }
```

**Rationale:**

- Reduces message size by ~40% for small messages
- Still human-readable
- Easy to map to full names in code

---

## 4. Protocol Specification

### 4.1 Message Envelope

All messages follow this structure:

```typescript
interface Message {
  t: string; // Type discriminator
  [key: string]: unknown; // Type-specific payload
}
```

### 4.2 Client → Server Messages

#### 4.2.1 Movement

```typescript
interface MoveMessage {
  t: "m";
  d: Direction; // 0-8: 0=wait, 1-8=directions
}

// Direction encoding (numpad style):
// 7 8 9
// 4 0 6  (0 = wait/stay)
// 1 2 3
type Direction = 0 | 1 | 2 | 3 | 4 | 6 | 7 | 8 | 9;
```

#### 4.2.2 Attack

```typescript
interface AttackMessage {
  t: "a";
  e: Entity; // Target entity ID
}
```

#### 4.2.3 Pickup

```typescript
interface PickupMessage {
  t: "p";
  e?: Entity; // Optional: specific item to pick up
}
```

#### 4.2.4 Drop

```typescript
interface DropMessage {
  t: "d";
  e: Entity; // Item entity ID from inventory
}
```

#### 4.2.5 Use Item

```typescript
interface UseItemMessage {
  t: "u";
  e: Entity; // Item entity ID
}
```

#### 4.2.6 Equip

```typescript
interface EquipMessage {
  t: "eq";
  e: Entity; // Item entity ID
  s: EquipmentSlot; // "weapon" | "armor" | "helmet" | "accessory"
}
```

#### 4.2.7 Unequip

```typescript
interface UnequipMessage {
  t: "uq";
  s: EquipmentSlot;
}
```

#### 4.2.8 Interact

```typescript
interface InteractMessage {
  t: "i";
  d?: Direction; // Optional direction (0 = at feet)
}
```

#### 4.2.9 Meta Messages

```typescript
// Ready to receive game state (sent after connection)
interface ReadyMessage {
  t: "ready";
}

// Heartbeat
interface PingMessage {
  t: "ping";
  c: number; // Client timestamp
}
```

#### 4.2.10 Client Message Union

```typescript
type ClientMessage =
  | MoveMessage
  | AttackMessage
  | PickupMessage
  | DropMessage
  | UseItemMessage
  | EquipMessage
  | UnequipMessage
  | InteractMessage
  | ReadyMessage
  | PingMessage;
```

### 4.3 Server → Client Messages

#### 4.3.1 Full State (Initial/Reconnect)

Sent on connection or after level change.

```typescript
interface FullStateMessage {
  t: "full";
  v: number; // Protocol version
  tick: number;

  // Map dimensions
  map: {
    w: number; // width
    h: number; // height
  };

  // Visible terrain tiles
  terrain: {
    visible: TerrainTile[]; // Currently visible
    explored: number[]; // Packed coords of explored tiles
  };

  // Visible entities
  entities: EntityData[];

  // Player state
  player: FullPlayerData;
}

interface TerrainTile {
  c: number; // Packed coord (x << 16 | y)
  t: TileType; // 0=wall, 1=floor, 2=door, etc.
}

interface EntityData {
  id: Entity;
  x: number;
  y: number;
  g: string; // Glyph (character)
  fg: string; // Foreground color (#hex)
  n?: string; // Name (optional)
  hp?: HealthInfo; // Health (optional, for creatures)
}

interface HealthInfo {
  c: number; // Current
  m: number; // Max
}

interface FullPlayerData {
  id: Entity;
  x: number;
  y: number;
  hp: HealthInfo;
  inv: InventoryItem[];
  eq: EquipmentState;
  xp: ExperienceInfo;
  fov: number; // FOV radius
}

interface InventoryItem {
  id: Entity;
  g: string; // Glyph
  n: string; // Name
  qty: number; // Quantity (for stackables)
  eq?: boolean; // Is equipped?
}

interface EquipmentState {
  weapon?: Entity;
  armor?: Entity;
  helmet?: Entity;
  accessory?: Entity;
}

interface ExperienceInfo {
  lv: number; // Level
  cur: number; // Current XP
  next: number; // XP to next level
}
```

#### 4.3.2 State Delta

Incremental update after each action.

```typescript
interface StateDeltaMessage {
  t: "state";
  tick: number;

  // Entity changes (all optional)
  add?: EntityData[]; // New entities in FOV
  upd?: EntityUpdate[]; // Changed entities
  rem?: Entity[]; // Entities left FOV or died

  // Player changes (optional, only if changed)
  player?: PlayerDelta;

  // Terrain changes (optional)
  terrain?: TerrainDelta;
}

interface EntityUpdate {
  id: Entity;
  // Only include changed fields
  x?: number;
  y?: number;
  g?: string;
  fg?: string;
  hp?: HealthInfo;
}

interface PlayerDelta {
  // Only include changed fields
  x?: number;
  y?: number;
  hp?: HealthInfo;
  inv?: InventoryItem[]; // Full inventory if changed
  eq?: EquipmentState; // Full equipment if changed
  xp?: ExperienceInfo;
}

interface TerrainDelta {
  visible?: number[]; // Newly visible packed coords
  explored?: number[]; // Newly explored packed coords
  changed?: TerrainTile[]; // Tiles that changed type (doors)
}
```

#### 4.3.3 Turn Notification

Indicates whether it's the player's turn.

```typescript
interface TurnMessage {
  t: "turn";
  active: boolean; // true = player's turn
  tick: number;
}
```

#### 4.3.4 Action Result

Response to player action.

```typescript
interface ResultMessage {
  t: "result";
  ok: boolean; // Action succeeded?
  msg?: string; // Error/info message
  reason?: string; // Error code for programmatic handling
}
```

#### 4.3.5 Game Event

For combat log, notifications, etc.

```typescript
interface EventMessage {
  t: "event";
  e: GameEventData;
}

type GameEventData =
  | { type: "damage"; src: Entity; tgt: Entity; dmg: number; crit?: boolean }
  | { type: "death"; ent: Entity; killer?: Entity }
  | { type: "heal"; ent: Entity; amt: number }
  | { type: "pickup"; ent: Entity; item: Entity; name: string }
  | { type: "drop"; ent: Entity; item: Entity; name: string }
  | { type: "equip"; ent: Entity; item: Entity; slot: string }
  | { type: "unequip"; ent: Entity; slot: string }
  | { type: "door"; ent: Entity; door: Entity; open: boolean }
  | { type: "level"; level: number; direction: "down" | "up" }
  | { type: "trap"; ent: Entity; trap: Entity; dmg?: number }
  | { type: "status"; ent: Entity; status: string; applied: boolean }
  | { type: "message"; text: string; color?: string };
```

#### 4.3.6 Error Message

```typescript
interface ErrorMessage {
  t: "error";
  code: ErrorCode;
  msg: string;
}

type ErrorCode =
  | "NOT_YOUR_TURN"
  | "INVALID_ACTION"
  | "TARGET_NOT_FOUND"
  | "OUT_OF_RANGE"
  | "INVENTORY_FULL"
  | "CANNOT_EQUIP"
  | "BLOCKED"
  | "DEAD"
  | "INTERNAL_ERROR";
```

#### 4.3.7 Pong

```typescript
interface PongMessage {
  t: "pong";
  c: number; // Echo client timestamp
  s: number; // Server timestamp
}
```

#### 4.3.8 Server Message Union

```typescript
type ServerMessage =
  | FullStateMessage
  | StateDeltaMessage
  | TurnMessage
  | ResultMessage
  | EventMessage
  | ErrorMessage
  | PongMessage;
```

### 4.4 Protocol Version

Protocol version is sent in the `full` message. Client should verify compatibility.

```typescript
const PROTOCOL_VERSION = 1;
```

---

## 5. Component Design

### 5.1 GameSession

Tracks per-client state for delta computation.

```typescript
// apps/server/src/engine/network/game-session.ts

import type { Entity } from "../ecs/types";

export interface EntitySnapshot {
  readonly x: number;
  readonly y: number;
  readonly glyph: string;
  readonly fgColor: string;
  readonly hp?: { current: number; max: number };
  readonly hash: number; // Quick equality check
}

export interface PlayerSnapshot {
  readonly x: number;
  readonly y: number;
  readonly hp: { current: number; max: number };
  readonly inventoryHash: number;
  readonly equipmentHash: number;
  readonly xp: { level: number; current: number; toNext: number };
}

export interface TerrainSnapshot {
  readonly exploredCount: number;
  readonly exploredHash: number;
}

export class GameSession {
  public readonly sessionId: string;
  public readonly userId: string;
  public playerId: Entity | null = null;

  // State tracking for delta computation
  public lastSentEntities: Map<Entity, EntitySnapshot> = new Map();
  public lastPlayerState: PlayerSnapshot | null = null;
  public lastTerrainState: TerrainSnapshot | null = null;
  public lastSentTick: number = 0;

  // Pending events to send
  public pendingEvents: GameEventData[] = [];

  // Connection state
  public isReady: boolean = false;
  public lastActivityTime: number = Date.now();

  constructor(sessionId: string, userId: string) {
    this.sessionId = sessionId;
    this.userId = userId;
  }

  public updateActivity(): void {
    this.lastActivityTime = Date.now();
  }

  public clearState(): void {
    this.lastSentEntities.clear();
    this.lastPlayerState = null;
    this.lastTerrainState = null;
    this.pendingEvents = [];
  }
}
```

### 5.2 NetworkSyncManager

Core synchronization logic between ECS and network.

```typescript
// apps/server/src/engine/network/sync-manager.ts

import type { World } from "../ecs/core/world";
import type { Entity } from "../ecs/types";
import type { EventQueue, GameEvent } from "../ecs/core/events";
import type { GameMap } from "../ecs/game/resources/game-map";
import {
  GameSession,
  type EntitySnapshot,
  type PlayerSnapshot,
} from "./game-session";
import { unpackCoords } from "../ecs/game/components/fov";

export class NetworkSyncManager {
  private readonly sessions = new Map<string, GameSession>();

  constructor(private readonly world: World) {
    this.subscribeToGameEvents();
  }

  // --- Session Management ---

  public createSession(sessionId: string, userId: string): GameSession {
    const session = new GameSession(sessionId, userId);
    this.sessions.set(sessionId, session);
    return session;
  }

  public getSession(sessionId: string): GameSession | undefined {
    return this.sessions.get(sessionId);
  }

  public removeSession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  // --- Event Subscription ---

  private subscribeToGameEvents(): void {
    const eventQueue = this.world.resources.get<EventQueue>("eventQueue");
    if (!eventQueue) return;

    // Events to broadcast to relevant clients
    const broadcastEventTypes = [
      "combat.damage",
      "combat.death",
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
    ];

    for (const eventType of broadcastEventTypes) {
      eventQueue.on(eventType, (event) => {
        this.broadcastEvent(event);
      });
    }
  }

  private broadcastEvent(event: GameEvent): void {
    const eventData = this.gameEventToData(event);
    if (!eventData) return;

    // Add to pending events for all sessions where relevant
    for (const session of this.sessions.values()) {
      if (this.isEventRelevantToSession(event, session)) {
        session.pendingEvents.push(eventData);
      }
    }
  }

  private isEventRelevantToSession(
    event: GameEvent,
    session: GameSession,
  ): boolean {
    // Player's own events are always relevant
    if ("entity" in event && event.entity === session.playerId) return true;
    if ("attacker" in event && event.attacker === session.playerId) return true;
    if ("target" in event && event.target === session.playerId) return true;
    if ("picker" in event && event.picker === session.playerId) return true;

    // Events involving visible entities are relevant
    const visibleEntities = this.getVisibleEntityIds(session);
    if ("entity" in event && visibleEntities.has(event.entity)) return true;
    if ("attacker" in event && visibleEntities.has(event.attacker)) return true;
    if ("target" in event && visibleEntities.has(event.target)) return true;

    return false;
  }

  // --- State Delta Computation ---

  public getFullState(sessionId: string): FullStateMessage | null {
    const session = this.sessions.get(sessionId);
    if (!session?.playerId) return null;

    const tick = this.getCurrentTick();
    const gameMap = this.world.resources.get<GameMap>("gameMap");
    if (!gameMap) return null;

    // Get visible entities
    const visibleEntities = this.getVisibleEntities(session);
    const entityDataList = this.entitiesToData(visibleEntities);

    // Get terrain
    const terrain = this.getVisibleTerrain(session);

    // Get player data
    const playerData = this.getFullPlayerData(session.playerId);
    if (!playerData) return null;

    // Update session state
    session.lastSentTick = tick;
    session.lastSentEntities = this.createEntitySnapshotMap(visibleEntities);
    session.lastPlayerState = this.createPlayerSnapshot(session.playerId);

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
        if (update) updated.push(update);
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

    // Get pending events
    const events = session.pendingEvents.splice(0);

    // Update session state
    session.lastSentEntities = currentEntityMap;
    session.lastSentTick = tick;

    // If nothing changed, return null
    if (
      added.length === 0 &&
      updated.length === 0 &&
      removed.length === 0 &&
      !playerDelta &&
      !terrainDelta &&
      events.length === 0
    ) {
      return null;
    }

    return {
      t: "state",
      tick,
      add: added.length > 0 ? added : undefined,
      upd: updated.length > 0 ? updated : undefined,
      rem: removed.length > 0 ? removed : undefined,
      player: playerDelta,
      terrain: terrainDelta,
    };
  }

  // --- Helper Methods ---

  private getVisibleEntities(
    session: GameSession,
  ): Map<Entity, EntitySnapshot> {
    if (!session.playerId) return new Map();

    const visibleCells = this.world.getComponent<VisibleCellsData>(
      session.playerId,
      "VisibleCells",
    );
    if (!visibleCells) return new Map();

    const gameMap = this.world.resources.get<GameMap>("gameMap");
    if (!gameMap) return new Map();

    const entities = new Map<Entity, EntitySnapshot>();

    // Iterate visible cells and collect entities
    for (let i = 0; i < visibleCells.count; i++) {
      const { x, y } = unpackCoords(visibleCells.cells[i]);

      for (const entity of gameMap.getEntitiesAt(x, y)) {
        if (entity === session.playerId) continue; // Skip player

        const snapshot = this.createEntitySnapshot(entity);
        if (snapshot) {
          entities.set(entity, snapshot);
        }
      }
    }

    return entities;
  }

  private createEntitySnapshot(entity: Entity): EntitySnapshot | null {
    const pos = this.world.getComponent<PositionData>(entity, "Position");
    const render = this.world.getComponent<RenderableData>(
      entity,
      "Renderable",
    );

    if (!pos || !render) return null;

    const health = this.world.getComponent<HealthData>(entity, "Health");

    const snapshot: EntitySnapshot = {
      x: pos.x,
      y: pos.y,
      glyph: render.glyph,
      fgColor: render.fgColor,
      hp: health ? { current: health.current, max: health.max } : undefined,
      hash: this.computeEntityHash(pos, render, health),
    };

    return snapshot;
  }

  private computeEntityHash(
    pos: PositionData,
    render: RenderableData,
    health?: HealthData,
  ): number {
    let hash = 0;
    hash = (hash * 31 + pos.x) | 0;
    hash = (hash * 31 + pos.y) | 0;
    hash = (hash * 31 + this.stringHash(render.glyph)) | 0;
    hash = (hash * 31 + this.stringHash(render.fgColor)) | 0;
    if (health) {
      hash = (hash * 31 + health.current) | 0;
      hash = (hash * 31 + health.max) | 0;
    }
    return hash;
  }

  private stringHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return hash;
  }

  private getCurrentTick(): number {
    const turnState = this.world.resources.get<TurnStateManager>("turnState");
    return turnState?.getCurrentTick() ?? 0;
  }

  // ... Additional helper methods would be implemented here
}
```

### 5.3 GameServer

Main orchestrator for game sessions and message handling.

```typescript
// apps/server/src/engine/network/game-server.ts

import type { World } from "../ecs/core/world";
import type { Entity } from "../ecs/types";
import type { ElysiaWS } from "elysia/ws";
import { NetworkSyncManager } from "./sync-manager";
import { GameSession } from "./game-session";
import { MessageHandler } from "./message-handler";
import type { ClientMessage, ServerMessage } from "./types";

export class GameServer {
  private readonly syncManager: NetworkSyncManager;
  private readonly messageHandler: MessageHandler;
  private readonly wsConnections = new Map<string, ElysiaWS<any>>();

  constructor(private readonly world: World) {
    this.syncManager = new NetworkSyncManager(world);
    this.messageHandler = new MessageHandler(world, this.syncManager);
  }

  // --- Connection Lifecycle ---

  public handleConnect(
    sessionId: string,
    userId: string,
    ws: ElysiaWS<any>,
  ): void {
    console.log(`[GameServer] Client connected: ${userId}`);

    // Create session
    const session = this.syncManager.createSession(sessionId, userId);

    // Store WebSocket reference
    this.wsConnections.set(sessionId, ws);

    // Spawn player entity (or restore existing)
    const playerId = this.spawnPlayer(userId);
    session.playerId = playerId;

    console.log(`[GameServer] Player spawned: entity ${playerId}`);
  }

  public handleMessage(sessionId: string, message: unknown): void {
    const session = this.syncManager.getSession(sessionId);
    if (!session) {
      console.warn(`[GameServer] Message from unknown session: ${sessionId}`);
      return;
    }

    session.updateActivity();

    // Parse and validate message
    const parsed = this.parseMessage(message);
    if (!parsed) {
      this.sendError(sessionId, "INVALID_ACTION", "Invalid message format");
      return;
    }

    // Handle based on message type
    if (parsed.t === "ready") {
      this.handleReady(sessionId, session);
    } else if (parsed.t === "ping") {
      this.handlePing(sessionId, parsed);
    } else {
      // Game action
      const result = this.messageHandler.handleAction(session, parsed);
      this.sendResult(sessionId, result);

      // If action succeeded, send state update
      if (result.ok) {
        this.broadcastStateUpdates();
      }
    }
  }

  public handleDisconnect(sessionId: string): void {
    const session = this.syncManager.getSession(sessionId);
    if (!session) return;

    console.log(`[GameServer] Client disconnected: ${session.userId}`);

    // Despawn player (or keep for reconnection)
    if (session.playerId) {
      this.despawnPlayer(session.playerId);
    }

    // Cleanup
    this.syncManager.removeSession(sessionId);
    this.wsConnections.delete(sessionId);
  }

  // --- Message Handling ---

  private handleReady(sessionId: string, session: GameSession): void {
    session.isReady = true;

    // Send full game state
    const fullState = this.syncManager.getFullState(sessionId);
    if (fullState) {
      this.send(sessionId, fullState);
    }

    // Send turn notification
    this.sendTurnNotification(sessionId, session);
  }

  private handlePing(sessionId: string, msg: { t: "ping"; c: number }): void {
    this.send(sessionId, {
      t: "pong",
      c: msg.c,
      s: Date.now(),
    });
  }

  // --- State Broadcasting ---

  public broadcastStateUpdates(): void {
    for (const [sessionId, session] of this.syncManager.getAllSessions()) {
      if (!session.isReady) continue;

      // Get delta for this session
      const delta = this.syncManager.getStateDelta(sessionId);
      if (delta) {
        this.send(sessionId, delta);
      }

      // Send any pending events
      for (const event of session.pendingEvents) {
        this.send(sessionId, { t: "event", e: event });
      }
      session.pendingEvents = [];

      // Send turn notification if needed
      this.sendTurnNotification(sessionId, session);
    }
  }

  private sendTurnNotification(sessionId: string, session: GameSession): void {
    const turnState = this.world.resources.get<TurnStateManager>("turnState");
    if (!turnState) return;

    const state = turnState.getState();
    const isPlayerTurn =
      state.activeEntity === session.playerId && state.turnPhase === "acting";

    this.send(sessionId, {
      t: "turn",
      active: isPlayerTurn,
      tick: state.currentTick,
    });
  }

  // --- Utility Methods ---

  private send(sessionId: string, message: ServerMessage): void {
    const ws = this.wsConnections.get(sessionId);
    if (ws) {
      ws.send(JSON.stringify(message));
    }
  }

  private sendError(sessionId: string, code: string, msg: string): void {
    this.send(sessionId, { t: "error", code, msg });
  }

  private sendResult(
    sessionId: string,
    result: { ok: boolean; msg?: string },
  ): void {
    this.send(sessionId, { t: "result", ok: result.ok, msg: result.msg });
  }

  private parseMessage(message: unknown): ClientMessage | null {
    // Validate and parse JSON message
    if (typeof message === "string") {
      try {
        return JSON.parse(message);
      } catch {
        return null;
      }
    }
    if (typeof message === "object" && message !== null) {
      return message as ClientMessage;
    }
    return null;
  }

  private spawnPlayer(userId: string): Entity {
    // Implementation would use EntityTemplateRegistry
    // For now, placeholder
    throw new Error("spawnPlayer not implemented");
  }

  private despawnPlayer(playerId: Entity): void {
    this.world.despawn(playerId);
  }
}
```

### 5.4 MessageHandler

Validates and routes client actions to ECS.

```typescript
// apps/server/src/engine/network/message-handler.ts

import type { World } from "../ecs/core/world";
import type { Entity } from "../ecs/types";
import type { GameSession } from "./game-session";
import type { NetworkSyncManager } from "./sync-manager";
import type { ClientMessage } from "./types";
import { submitAction, type ActionRequest } from "../ecs/game/systems/turn";
import {
  requestPickup,
  requestDrop,
  requestEquip,
  requestUnequip,
  requestUseItem,
} from "../ecs/game/systems/inventory";
import { requestInteract } from "../ecs/game/systems/interaction";

// Direction to dx/dy mapping (numpad style)
const DIRECTION_MAP: Record<number, { dx: number; dy: number }> = {
  0: { dx: 0, dy: 0 }, // Wait
  1: { dx: -1, dy: 1 }, // SW
  2: { dx: 0, dy: 1 }, // S
  3: { dx: 1, dy: 1 }, // SE
  4: { dx: -1, dy: 0 }, // W
  6: { dx: 1, dy: 0 }, // E
  7: { dx: -1, dy: -1 }, // NW
  8: { dx: 0, dy: -1 }, // N
  9: { dx: 1, dy: -1 }, // NE
};

export interface ActionResult {
  ok: boolean;
  msg?: string;
  reason?: string;
}

export class MessageHandler {
  constructor(
    private readonly world: World,
    private readonly syncManager: NetworkSyncManager,
  ) {}

  public handleAction(
    session: GameSession,
    message: ClientMessage,
  ): ActionResult {
    if (!session.playerId) {
      return { ok: false, msg: "No player entity", reason: "INTERNAL_ERROR" };
    }

    const playerId = session.playerId;

    switch (message.t) {
      case "m": // Move
        return this.handleMove(playerId, message.d);

      case "a": // Attack
        return this.handleAttack(playerId, message.e);

      case "p": // Pickup
        return this.handlePickup(playerId, message.e);

      case "d": // Drop
        return this.handleDrop(playerId, message.e);

      case "u": // Use item
        return this.handleUseItem(playerId, message.e);

      case "eq": // Equip
        return this.handleEquip(playerId, message.e, message.s);

      case "uq": // Unequip
        return this.handleUnequip(playerId, message.s);

      case "i": // Interact
        return this.handleInteract(playerId, message.d);

      default:
        return { ok: false, msg: "Unknown action", reason: "INVALID_ACTION" };
    }
  }

  private handleMove(playerId: Entity, direction: number): ActionResult {
    const dir = DIRECTION_MAP[direction];
    if (!dir) {
      return { ok: false, msg: "Invalid direction", reason: "INVALID_ACTION" };
    }

    // Wait action
    if (direction === 0) {
      const success = submitAction(this.world, playerId, { type: "wait" });
      return success
        ? { ok: true }
        : { ok: false, msg: "Not your turn", reason: "NOT_YOUR_TURN" };
    }

    // Move action
    const action: ActionRequest = {
      type: "move",
      data: { dx: dir.dx, dy: dir.dy },
    };

    const success = submitAction(this.world, playerId, action);
    return success
      ? { ok: true }
      : { ok: false, msg: "Cannot move", reason: "BLOCKED" };
  }

  private handleAttack(playerId: Entity, targetId: Entity): ActionResult {
    if (!this.world.isAlive(targetId)) {
      return { ok: false, msg: "Target not found", reason: "TARGET_NOT_FOUND" };
    }

    const action: ActionRequest = {
      type: "attack",
      data: { target: targetId },
    };

    const success = submitAction(this.world, playerId, action);
    return success
      ? { ok: true }
      : { ok: false, msg: "Cannot attack", reason: "NOT_YOUR_TURN" };
  }

  private handlePickup(playerId: Entity, targetId?: Entity): ActionResult {
    requestPickup(this.world, playerId, targetId);

    // Run systems to process the request
    this.world.tick();

    return { ok: true };
  }

  private handleDrop(playerId: Entity, itemId: Entity): ActionResult {
    if (!this.world.isAlive(itemId)) {
      return { ok: false, msg: "Item not found", reason: "TARGET_NOT_FOUND" };
    }

    requestDrop(this.world, playerId, itemId);
    this.world.tick();

    return { ok: true };
  }

  private handleUseItem(playerId: Entity, itemId: Entity): ActionResult {
    if (!this.world.isAlive(itemId)) {
      return { ok: false, msg: "Item not found", reason: "TARGET_NOT_FOUND" };
    }

    requestUseItem(this.world, playerId, itemId);
    this.world.tick();

    return { ok: true };
  }

  private handleEquip(
    playerId: Entity,
    itemId: Entity,
    slot: string,
  ): ActionResult {
    if (!this.world.isAlive(itemId)) {
      return { ok: false, msg: "Item not found", reason: "TARGET_NOT_FOUND" };
    }

    requestEquip(this.world, playerId, itemId);
    this.world.tick();

    return { ok: true };
  }

  private handleUnequip(playerId: Entity, slot: string): ActionResult {
    requestUnequip(this.world, playerId, slot as any);
    this.world.tick();

    return { ok: true };
  }

  private handleInteract(playerId: Entity, direction?: number): ActionResult {
    let dx = 0,
      dy = 0;
    if (direction !== undefined && direction !== 0) {
      const dir = DIRECTION_MAP[direction];
      if (dir) {
        dx = dir.dx;
        dy = dir.dy;
      }
    }

    requestInteract(this.world, playerId, dx, dy);
    this.world.tick();

    return { ok: true };
  }
}
```

---

## 6. Data Flow

### 6.1 Connection Flow

```
┌──────────────────────────────────────────────────────────────────┐
│ CONNECTION SEQUENCE                                               │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Client                          Server                           │
│    │                               │                              │
│    │  1. WebSocket Connect         │                              │
│    │  ─────────────────────────▶  │                              │
│    │     (with auth cookie)        │                              │
│    │                               │                              │
│    │                               │  2. Validate session         │
│    │                               │  3. Create GameSession       │
│    │                               │  4. Spawn player entity      │
│    │                               │                              │
│    │  5. { t: "ready" }            │                              │
│    │  ─────────────────────────▶  │                              │
│    │                               │                              │
│    │                               │  6. Compute full state       │
│    │                               │                              │
│    │  7. { t: "full", ... }        │                              │
│    │  ◀─────────────────────────  │                              │
│    │                               │                              │
│    │  8. { t: "turn", active }     │                              │
│    │  ◀─────────────────────────  │                              │
│    │                               │                              │
│    ▼                               ▼                              │
│  Ready to play                   Ready to receive actions         │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 6.2 Turn Flow

```
┌──────────────────────────────────────────────────────────────────┐
│ PLAYER TURN SEQUENCE                                              │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Client                          Server                           │
│    │                               │                              │
│    │  1. User presses arrow key    │                              │
│    │                               │                              │
│    │  2. { t: "m", d: 6 }          │                              │
│    │  ─────────────────────────▶  │                              │
│    │                               │                              │
│    │                               │  3. Validate: player's turn? │
│    │                               │  4. submitAction(move)       │
│    │                               │  5. Run ECS systems:         │
│    │                               │     - Movement               │
│    │                               │     - Collision              │
│    │                               │     - FOV recalc             │
│    │                               │     - AI reactions           │
│    │                               │     - Combat (if any)        │
│    │                               │  6. Process EventQueue       │
│    │                               │                              │
│    │  7. { t: "result", ok: true } │                              │
│    │  ◀─────────────────────────  │                              │
│    │                               │                              │
│    │  8. { t: "state", ... }       │                              │
│    │  ◀─────────────────────────  │                              │
│    │     (delta: moved entities,   │                              │
│    │      new FOV, player pos)     │                              │
│    │                               │                              │
│    │  9. { t: "event", ... }       │  (for each combat event)     │
│    │  ◀─────────────────────────  │                              │
│    │                               │                              │
│    │  10. { t: "turn", active }    │                              │
│    │  ◀─────────────────────────  │                              │
│    │                               │                              │
│    ▼                               ▼                              │
│                                                                   │
└──────────────────────────────────────────────────────────────────┘
```

### 6.3 AI Turn Flow

When enemies act, the flow is simpler:

```
Server: Run AI system for entity with enough energy
Server: Process actions, emit events
Server: Send state delta to client
Server: Send events to client
Server: Check for next active entity
```

---

## 7. Security Considerations

### 7.1 Authentication

- WebSocket connection requires valid session (via Better Auth)
- Session validated in `beforeHandle` hook
- User ID extracted from session, not from client message

### 7.2 Input Validation

| Input         | Validation                        |
| ------------- | --------------------------------- |
| Direction     | Must be 0-9 (excluding 5)         |
| Entity ID     | Must exist and be alive           |
| Slot          | Must be valid equipment slot      |
| Action timing | Only allowed during player's turn |

### 7.3 Rate Limiting

```typescript
const RATE_LIMITS = {
  actionsPerSecond: 10, // Max actions per second
  messagesPerMinute: 600, // Max total messages
  pingInterval: 30000, // Required ping interval
};
```

### 7.4 State Isolation

- Each client only receives entities in their FOV
- Entity IDs are server-side (no spoofing possible)
- All game logic runs on server

---

## 8. Error Handling

### 8.1 Error Codes

| Code               | Description                        | Recovery                   |
| ------------------ | ---------------------------------- | -------------------------- |
| `NOT_YOUR_TURN`    | Action sent when not player's turn | Wait for turn notification |
| `INVALID_ACTION`   | Malformed or unknown action        | Check message format       |
| `TARGET_NOT_FOUND` | Referenced entity doesn't exist    | Refresh state              |
| `OUT_OF_RANGE`     | Target too far away                | Move closer                |
| `INVENTORY_FULL`   | Cannot pick up item                | Drop something             |
| `CANNOT_EQUIP`     | Item not equippable in slot        | Check item type            |
| `BLOCKED`          | Movement blocked                   | Try different direction    |
| `DEAD`             | Player is dead                     | Game over                  |
| `INTERNAL_ERROR`   | Server error                       | Report bug                 |

### 8.2 Reconnection Handling

```
1. Client detects disconnect
2. Client attempts reconnect with exponential backoff
3. On reconnect, client sends { t: "ready" }
4. Server sends { t: "full", ... } with current state
5. Game continues
```

### 8.3 Timeout Handling

- Server pings client every 30 seconds
- Client must respond within 10 seconds
- After 60 seconds of inactivity, disconnect
- Player entity persists for 5 minutes (reconnection window)

---

## 9. Performance Considerations

### 9.1 Message Size Estimates

| Message Type        | Typical Size  | Notes                          |
| ------------------- | ------------- | ------------------------------ |
| Move input          | ~15 bytes     | `{"t":"m","d":6}`              |
| State delta (small) | ~200 bytes    | 2-3 entity updates             |
| State delta (large) | ~1KB          | 10+ entity updates             |
| Full state          | ~2-5KB        | All visible entities + terrain |
| Event               | ~50-100 bytes | Combat, pickup, etc.           |

### 9.2 Bandwidth Estimates

For typical gameplay:

- Average actions per minute: 30-60
- Average messages per action: 3 (result + delta + turn)
- Average bytes per action: ~500

**Result: ~15-30 KB/minute** (very low)

### 9.3 Server Memory per Session

| Component        | Size                           |
| ---------------- | ------------------------------ |
| GameSession      | ~100 bytes                     |
| Entity snapshots | ~5KB (100 entities × 50 bytes) |
| Pending events   | ~500 bytes (10 events)         |
| WebSocket buffer | ~8KB                           |

**Total: ~15KB per connected client**

### 9.4 Optimization Opportunities

1. **Enable WebSocket compression** (`permessage-deflate`)
2. **Pool EntitySnapshot objects** to reduce GC
3. **Batch events** if many occur in single tick
4. **Cache terrain deltas** (explored tiles rarely change)

---

## 10. Implementation Plan

### 10.1 Files to Create

```
apps/server/src/engine/network/
├── types.ts              # Protocol types (~150 lines)
├── game-session.ts       # Session management (~100 lines)
├── sync-manager.ts       # State synchronization (~350 lines)
├── message-handler.ts    # Input handling (~200 lines)
├── game-server.ts        # Main orchestrator (~250 lines)
└── index.ts              # Exports (~20 lines)
```

### 10.2 Files to Modify

```
apps/server/src/web/ws.ts  # Update to use GameServer (~80 lines)
```

### 10.3 Implementation Order

| Phase | Task                        | Effort | Dependencies                   |
| ----- | --------------------------- | ------ | ------------------------------ |
| 1     | Create `types.ts`           | 1h     | None                           |
| 2     | Create `game-session.ts`    | 1h     | types.ts                       |
| 3     | Create `sync-manager.ts`    | 3h     | types.ts, game-session.ts, ECS |
| 4     | Create `message-handler.ts` | 2h     | types.ts, ECS systems          |
| 5     | Create `game-server.ts`     | 2h     | All above                      |
| 6     | Update `ws.ts`              | 1h     | game-server.ts                 |
| 7     | Integration testing         | 2h     | All above                      |
| 8     | Manual testing              | 1h     | All above                      |

**Total: ~13 hours**

### 10.4 Implementation Checklist

- [ ] **types.ts**
  - [ ] ClientMessage union type
  - [ ] ServerMessage union type
  - [ ] Direction enum/mapping
  - [ ] Error codes
  - [ ] Protocol version constant

- [ ] **game-session.ts**
  - [ ] GameSession class
  - [ ] EntitySnapshot interface
  - [ ] PlayerSnapshot interface
  - [ ] TerrainSnapshot interface

- [ ] **sync-manager.ts**
  - [ ] Session CRUD
  - [ ] Event subscription
  - [ ] getFullState()
  - [ ] getStateDelta()
  - [ ] FOV filtering
  - [ ] Entity snapshot creation
  - [ ] Delta computation
  - [ ] Player delta computation
  - [ ] Terrain delta computation

- [ ] **message-handler.ts**
  - [ ] Message validation
  - [ ] handleMove()
  - [ ] handleAttack()
  - [ ] handlePickup()
  - [ ] handleDrop()
  - [ ] handleUseItem()
  - [ ] handleEquip()
  - [ ] handleUnequip()
  - [ ] handleInteract()

- [ ] **game-server.ts**
  - [ ] handleConnect()
  - [ ] handleMessage()
  - [ ] handleDisconnect()
  - [ ] handleReady()
  - [ ] handlePing()
  - [ ] broadcastStateUpdates()
  - [ ] sendTurnNotification()
  - [ ] Player spawning
  - [ ] Player despawning

- [ ] **ws.ts update**
  - [ ] Create GameServer instance
  - [ ] Wire up WebSocket handlers
  - [ ] Initialize World if needed

---

## 11. Testing Strategy

### 11.1 Unit Tests

```typescript
// tests/engine/network/sync-manager.test.ts

describe("NetworkSyncManager", () => {
  describe("getStateDelta", () => {
    it("should return null for unknown session", () => {
      // ...
    });

    it("should detect added entities", () => {
      // Move player to see new entity
      // Assert entity in delta.add
    });

    it("should detect removed entities", () => {
      // Move player away from entity
      // Assert entity in delta.rem
    });

    it("should detect updated entities", () => {
      // Damage an entity in view
      // Assert entity in delta.upd with hp change
    });

    it("should filter by FOV", () => {
      // Place entity outside FOV
      // Assert entity NOT in any delta
    });
  });

  describe("event broadcasting", () => {
    it("should add events to relevant sessions", () => {
      // Emit combat event
      // Assert event in session.pendingEvents
    });
  });
});
```

### 11.2 Integration Tests

```typescript
// tests/engine/network/game-server.integration.test.ts

describe("GameServer Integration", () => {
  it("should complete full connection handshake", async () => {
    const { ws, server } = await createTestConnection();

    ws.send(JSON.stringify({ t: "ready" }));

    const fullState = await ws.nextMessage();
    expect(fullState.t).toBe("full");
    expect(fullState.player).toBeDefined();

    const turn = await ws.nextMessage();
    expect(turn.t).toBe("turn");
    expect(turn.active).toBe(true);
  });

  it("should process move and return delta", async () => {
    const { ws, server } = await createTestConnection();
    await ws.waitForReady();

    ws.send(JSON.stringify({ t: "m", d: 6 })); // Move east

    const result = await ws.nextMessage();
    expect(result.ok).toBe(true);

    const delta = await ws.nextMessage();
    expect(delta.t).toBe("state");
    expect(delta.player?.x).toBeDefined();
  });
});
```

### 11.3 Manual Testing Checklist

- [ ] Connect with valid session
- [ ] Receive full state
- [ ] Move in all 8 directions
- [ ] Wait (direction 0)
- [ ] Attack an enemy
- [ ] Pick up an item
- [ ] Drop an item
- [ ] Use a consumable
- [ ] Equip a weapon
- [ ] Unequip a weapon
- [ ] Interact with a door
- [ ] Descend stairs (level change)
- [ ] Die (game over)
- [ ] Disconnect and reconnect
- [ ] Ping/pong heartbeat

---

## 12. Future Considerations

### 12.1 Multiplayer (Future)

When multiplayer is needed:

1. **Multiple players in same World**
   - Each player has their own GameSession
   - Each player has their own FOV
   - Actions affect shared World

2. **Visibility between players**
   - Players see each other when in mutual FOV
   - Could add "team" visibility

3. **Turn ordering**
   - Queue actions from multiple players
   - Simultaneous turns or round-robin

4. **Conflict resolution**
   - Two players target same item
   - Two players move to same tile

### 12.2 Spectator Mode (Future)

- Read-only GameSession without playerId
- Follows a specific player's FOV
- Could see full map (GM mode)

### 12.3 Replay System (Future)

- Log all inputs with timestamps
- Deterministic replay via same seed + inputs
- Useful for debugging and sharing

### 12.4 Client-Side Prediction (Future)

For lower latency feel:

- Client predicts move result
- Server confirms or corrects
- Rollback on mismatch

Not needed for turn-based, but possible for real-time mode.

---

## Appendix A: Complete Type Definitions

```typescript
// apps/server/src/engine/network/types.ts

import type { Entity } from "../ecs/types";

// =============================================================================
// Protocol Version
// =============================================================================

export const PROTOCOL_VERSION = 1;

// =============================================================================
// Direction Mapping
// =============================================================================

export type Direction = 0 | 1 | 2 | 3 | 4 | 6 | 7 | 8 | 9;

export const DIRECTION_TO_DELTA: Record<Direction, { dx: number; dy: number }> =
  {
    0: { dx: 0, dy: 0 }, // Wait
    1: { dx: -1, dy: 1 }, // SW
    2: { dx: 0, dy: 1 }, // S
    3: { dx: 1, dy: 1 }, // SE
    4: { dx: -1, dy: 0 }, // W
    6: { dx: 1, dy: 0 }, // E
    7: { dx: -1, dy: -1 }, // NW
    8: { dx: 0, dy: -1 }, // N
    9: { dx: 1, dy: -1 }, // NE
  };

// =============================================================================
// Client → Server Messages
// =============================================================================

export interface MoveMessage {
  t: "m";
  d: Direction;
}
export interface AttackMessage {
  t: "a";
  e: Entity;
}
export interface PickupMessage {
  t: "p";
  e?: Entity;
}
export interface DropMessage {
  t: "d";
  e: Entity;
}
export interface UseItemMessage {
  t: "u";
  e: Entity;
}
export interface EquipMessage {
  t: "eq";
  e: Entity;
  s: EquipmentSlot;
}
export interface UnequipMessage {
  t: "uq";
  s: EquipmentSlot;
}
export interface InteractMessage {
  t: "i";
  d?: Direction;
}
export interface ReadyMessage {
  t: "ready";
}
export interface PingMessage {
  t: "ping";
  c: number;
}

export type ClientMessage =
  | MoveMessage
  | AttackMessage
  | PickupMessage
  | DropMessage
  | UseItemMessage
  | EquipMessage
  | UnequipMessage
  | InteractMessage
  | ReadyMessage
  | PingMessage;

// =============================================================================
// Server → Client Messages
// =============================================================================

export type EquipmentSlot = "weapon" | "armor" | "helmet" | "accessory";
export type TileType = 0 | 1 | 2 | 3 | 4; // Wall, Floor, Door, Water, Lava

export interface HealthInfo {
  c: number;
  m: number;
}
export interface ExperienceInfo {
  lv: number;
  cur: number;
  next: number;
}

export interface EntityData {
  id: Entity;
  x: number;
  y: number;
  g: string;
  fg: string;
  n?: string;
  hp?: HealthInfo;
}

export interface EntityUpdate {
  id: Entity;
  x?: number;
  y?: number;
  g?: string;
  fg?: string;
  hp?: HealthInfo;
}

export interface InventoryItem {
  id: Entity;
  g: string;
  n: string;
  qty: number;
  eq?: boolean;
}

export interface EquipmentState {
  weapon?: Entity;
  armor?: Entity;
  helmet?: Entity;
  accessory?: Entity;
}

export interface FullPlayerData {
  id: Entity;
  x: number;
  y: number;
  hp: HealthInfo;
  inv: InventoryItem[];
  eq: EquipmentState;
  xp: ExperienceInfo;
  fov: number;
}

export interface PlayerDelta {
  x?: number;
  y?: number;
  hp?: HealthInfo;
  inv?: InventoryItem[];
  eq?: EquipmentState;
  xp?: ExperienceInfo;
}

export interface TerrainTile {
  c: number;
  t: TileType;
}

export interface TerrainData {
  visible: TerrainTile[];
  explored: number[];
}

export interface TerrainDelta {
  visible?: number[];
  explored?: number[];
  changed?: TerrainTile[];
}

export interface FullStateMessage {
  t: "full";
  v: number;
  tick: number;
  map: { w: number; h: number };
  terrain: TerrainData;
  entities: EntityData[];
  player: FullPlayerData;
}

export interface StateDeltaMessage {
  t: "state";
  tick: number;
  add?: EntityData[];
  upd?: EntityUpdate[];
  rem?: Entity[];
  player?: PlayerDelta;
  terrain?: TerrainDelta;
}

export interface TurnMessage {
  t: "turn";
  active: boolean;
  tick: number;
}

export interface ResultMessage {
  t: "result";
  ok: boolean;
  msg?: string;
  reason?: string;
}

export type GameEventData =
  | { type: "damage"; src: Entity; tgt: Entity; dmg: number; crit?: boolean }
  | { type: "death"; ent: Entity; killer?: Entity }
  | { type: "heal"; ent: Entity; amt: number }
  | { type: "pickup"; ent: Entity; item: Entity; name: string }
  | { type: "drop"; ent: Entity; item: Entity; name: string }
  | { type: "equip"; ent: Entity; item: Entity; slot: string }
  | { type: "unequip"; ent: Entity; slot: string }
  | { type: "door"; ent: Entity; door: Entity; open: boolean }
  | { type: "level"; level: number; direction: "down" | "up" }
  | { type: "trap"; ent: Entity; trap: Entity; dmg?: number }
  | { type: "status"; ent: Entity; status: string; applied: boolean }
  | { type: "message"; text: string; color?: string };

export interface EventMessage {
  t: "event";
  e: GameEventData;
}

export type ErrorCode =
  | "NOT_YOUR_TURN"
  | "INVALID_ACTION"
  | "TARGET_NOT_FOUND"
  | "OUT_OF_RANGE"
  | "INVENTORY_FULL"
  | "CANNOT_EQUIP"
  | "BLOCKED"
  | "DEAD"
  | "INTERNAL_ERROR";

export interface ErrorMessage {
  t: "error";
  code: ErrorCode;
  msg: string;
}

export interface PongMessage {
  t: "pong";
  c: number;
  s: number;
}

export type ServerMessage =
  | FullStateMessage
  | StateDeltaMessage
  | TurnMessage
  | ResultMessage
  | EventMessage
  | ErrorMessage
  | PongMessage;
```

---

## Appendix B: Example Message Sequences

### B.1 Player Moves and Discovers Enemy

```json
// Client sends:
{"t":"m","d":6}

// Server responds:
{"t":"result","ok":true}
{"t":"state","tick":42,"add":[{"id":128,"x":15,"y":10,"g":"o","fg":"#00ff00","n":"Orc","hp":{"c":10,"m":10}}],"player":{"x":12}}
{"t":"turn","active":true,"tick":42}
```

### B.2 Player Attacks and Kills Enemy

```json
// Client sends:
{"t":"a","e":128}

// Server responds:
{"t":"result","ok":true}
{"t":"event","e":{"type":"damage","src":1,"tgt":128,"dmg":12}}
{"t":"event","e":{"type":"death","ent":128,"killer":1}}
{"t":"state","tick":43,"rem":[128],"player":{"xp":{"lv":1,"cur":25,"next":100}}}
{"t":"turn","active":true,"tick":43}
```

### B.3 Player Picks Up Item

```json
// Client sends:
{"t":"p"}

// Server responds:
{"t":"result","ok":true}
{"t":"event","e":{"type":"pickup","ent":1,"item":256,"name":"Health Potion"}}
{"t":"state","tick":44,"rem":[256],"player":{"inv":[{"id":256,"g":"!","n":"Health Potion","qty":1}]}}
{"t":"turn","active":true,"tick":44}
```

---

**Document Status:** ✅ Complete - Ready for Implementation

**Next Steps:**

1. Review this specification
2. Create `types.ts` with all type definitions
3. Implement components in order specified in Section 10.3
4. Write tests alongside implementation
5. Integrate with existing `ws.ts`
