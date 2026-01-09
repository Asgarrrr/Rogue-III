/**
 * Network Protocol Types
 *
 * Type definitions for WebSocket communication between client and server.
 * These types define the complete protocol for the Rogue III game.
 *
 * @see NETWORK_ARCHITECTURE.md for full specification
 */

import type { Entity } from "../ecs/types";

// =============================================================================
// Protocol Version
// =============================================================================

/**
 * Current protocol version.
 * Increment when making breaking changes to the protocol.
 */
export const PROTOCOL_VERSION = 1;

// =============================================================================
// Direction Mapping
// =============================================================================

/**
 * Direction encoding using numpad-style layout:
 * ```
 * 7 8 9
 * 4 0 6   (0 = wait/stay in place)
 * 1 2 3
 * ```
 * Note: 5 is not used (would be same as 0)
 */
export type Direction = 0 | 1 | 2 | 3 | 4 | 6 | 7 | 8 | 9;

/**
 * Maps direction numbers to dx/dy deltas.
 */
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

/**
 * Valid direction values for validation.
 */
export const VALID_DIRECTIONS: ReadonlySet<number> = new Set([
  0, 1, 2, 3, 4, 6, 7, 8, 9,
]);

/**
 * Checks if a number is a valid direction.
 */
export function isValidDirection(d: number): d is Direction {
  return VALID_DIRECTIONS.has(d);
}

// =============================================================================
// Common Types
// =============================================================================

/**
 * Equipment slot identifiers.
 */
export type EquipmentSlot = "weapon" | "armor" | "helmet" | "accessory";

/**
 * Valid equipment slots for validation.
 */
export const VALID_EQUIPMENT_SLOTS: ReadonlySet<string> = new Set([
  "weapon",
  "armor",
  "helmet",
  "accessory",
]);

/**
 * Checks if a string is a valid equipment slot.
 */
export function isValidEquipmentSlot(s: string): s is EquipmentSlot {
  return VALID_EQUIPMENT_SLOTS.has(s);
}

/**
 * Tile type identifiers.
 * Matches TileType enum in game-map.ts
 */
export type TileType = 0 | 1 | 2 | 3 | 4;

export const TileTypeNames = {
  Wall: 0,
  Floor: 1,
  Door: 2,
  Water: 3,
  Lava: 4,
} as const;

/**
 * Health information (compact format).
 */
export interface HealthInfo {
  /** Current health */
  c: number;
  /** Maximum health */
  m: number;
}

/**
 * Experience information (compact format).
 */
export interface ExperienceInfo {
  /** Current level */
  lv: number;
  /** Current XP */
  cur: number;
  /** XP needed for next level */
  next: number;
}

// =============================================================================
// Client → Server Messages
// =============================================================================

/**
 * Move action message.
 * Direction 0 = wait/pass turn.
 */
export interface MoveMessage {
  t: "m";
  /** Direction (numpad-style: 0=wait, 1-9 except 5) */
  d: Direction;
}

/**
 * Attack action message.
 */
export interface AttackMessage {
  t: "a";
  /** Target entity ID */
  e: Entity;
}

/**
 * Pickup action message.
 */
export interface PickupMessage {
  t: "p";
  /** Optional: specific item to pick up */
  e?: Entity;
}

/**
 * Drop item action message.
 */
export interface DropMessage {
  t: "d";
  /** Item entity ID from inventory */
  e: Entity;
}

/**
 * Use item action message.
 */
export interface UseItemMessage {
  t: "u";
  /** Item entity ID */
  e: Entity;
}

/**
 * Equip item action message.
 */
export interface EquipMessage {
  t: "eq";
  /** Item entity ID */
  e: Entity;
  /** Equipment slot */
  s: EquipmentSlot;
}

/**
 * Unequip item action message.
 */
export interface UnequipMessage {
  t: "uq";
  /** Equipment slot to unequip */
  s: EquipmentSlot;
}

/**
 * Interact action message.
 * Used for doors, stairs, containers, etc.
 */
export interface InteractMessage {
  t: "i";
  /** Optional direction (0 or undefined = at feet) */
  d?: Direction;
}

/**
 * Client ready message.
 * Sent after connection to request initial game state.
 */
export interface ReadyMessage {
  t: "ready";
}

/**
 * Ping message for latency measurement.
 */
export interface PingMessage {
  t: "ping";
  /** Client timestamp (ms) */
  c: number;
}

/**
 * Union of all client message types.
 */
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

/**
 * Client message type discriminator values.
 */
export type ClientMessageType = ClientMessage["t"];

/**
 * All valid client message types for validation.
 */
export const VALID_CLIENT_MESSAGE_TYPES: ReadonlySet<string> = new Set([
  "m",
  "a",
  "p",
  "d",
  "u",
  "eq",
  "uq",
  "i",
  "ready",
  "ping",
]);

// =============================================================================
// Server → Client Messages
// =============================================================================

/**
 * Entity data for full state or added entities.
 */
export interface EntityData {
  /** Entity ID */
  id: Entity;
  /** X position */
  x: number;
  /** Y position */
  y: number;
  /** Glyph (character) */
  g: string;
  /** Foreground color (#hex) */
  fg: string;
  /** Name (optional) */
  n?: string;
  /** Health (optional, for creatures) */
  hp?: HealthInfo;
}

/**
 * Entity update (partial data, only changed fields).
 */
export interface EntityUpdate {
  /** Entity ID */
  id: Entity;
  /** X position (if changed) */
  x?: number;
  /** Y position (if changed) */
  y?: number;
  /** Glyph (if changed) */
  g?: string;
  /** Foreground color (if changed) */
  fg?: string;
  /** Health (if changed) */
  hp?: HealthInfo;
}

/**
 * Inventory item data.
 */
export interface InventoryItem {
  /** Item entity ID */
  id: Entity;
  /** Glyph */
  g: string;
  /** Name */
  n: string;
  /** Quantity (for stackables) */
  qty: number;
  /** Is currently equipped? */
  eq?: boolean;
}

/**
 * Equipment state (entity IDs or undefined).
 */
export interface EquipmentState {
  weapon?: Entity;
  armor?: Entity;
  helmet?: Entity;
  accessory?: Entity;
}

/**
 * Full player data (sent on connection/level change).
 */
export interface FullPlayerData {
  /** Player entity ID */
  id: Entity;
  /** X position */
  x: number;
  /** Y position */
  y: number;
  /** Health */
  hp: HealthInfo;
  /** Inventory items */
  inv: InventoryItem[];
  /** Equipped items */
  eq: EquipmentState;
  /** Experience/level */
  xp: ExperienceInfo;
  /** FOV radius */
  fov: number;
}

/**
 * Player delta (partial, only changed fields).
 */
export interface PlayerDelta {
  x?: number;
  y?: number;
  hp?: HealthInfo;
  /** Full inventory (if changed) */
  inv?: InventoryItem[];
  /** Full equipment (if changed) */
  eq?: EquipmentState;
  xp?: ExperienceInfo;
}

/**
 * Terrain tile data.
 */
export interface TerrainTile {
  /** Packed coordinate (x << 16 | y) */
  c: number;
  /** Tile type */
  t: TileType;
}

/**
 * Full terrain data (sent on connection).
 */
export interface TerrainData {
  /** Currently visible tiles */
  visible: TerrainTile[];
  /** Explored tile coordinates (packed) */
  explored: number[];
}

/**
 * Terrain delta (incremental update).
 */
export interface TerrainDelta {
  /** Newly visible packed coords */
  visible?: number[];
  /** Newly explored packed coords */
  explored?: number[];
  /** Tiles that changed type (doors opening, etc.) */
  changed?: TerrainTile[];
}

/**
 * Full state message (sent on connection or level change).
 */
export interface FullStateMessage {
  t: "full";
  /** Protocol version */
  v: number;
  /** Current game tick */
  tick: number;
  /** Map dimensions */
  map: {
    /** Width */
    w: number;
    /** Height */
    h: number;
  };
  /** Terrain data */
  terrain: TerrainData;
  /** Visible entities */
  entities: EntityData[];
  /** Player data */
  player: FullPlayerData;
}

/**
 * State delta message (incremental update).
 */
export interface StateDeltaMessage {
  t: "state";
  /** Current game tick */
  tick: number;
  /** Newly visible entities */
  add?: EntityData[];
  /** Updated entities (partial) */
  upd?: EntityUpdate[];
  /** Entities no longer visible or dead */
  rem?: Entity[];
  /** Player changes (partial) */
  player?: PlayerDelta;
  /** Terrain changes */
  terrain?: TerrainDelta;
}

/**
 * Turn notification message.
 */
export interface TurnMessage {
  t: "turn";
  /** Is it the player's turn to act? */
  active: boolean;
  /** Current game tick */
  tick: number;
}

/**
 * Action result message.
 */
export interface ResultMessage {
  t: "result";
  /** Did the action succeed? */
  ok: boolean;
  /** Human-readable message */
  msg?: string;
  /** Error code for programmatic handling */
  reason?: ErrorCode;
}

/**
 * Game event data types.
 */
export type GameEventData =
  | {
      type: "damage";
      src: Entity;
      tgt: Entity;
      dmg: number;
      crit?: boolean;
    }
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

/**
 * Game event message.
 */
export interface EventMessage {
  t: "event";
  /** Event data */
  e: GameEventData;
}

/**
 * Error codes for action failures.
 */
export type ErrorCode =
  | "NOT_YOUR_TURN"
  | "INVALID_ACTION"
  | "INVALID_DIRECTION"
  | "INVALID_TARGET"
  | "TARGET_NOT_FOUND"
  | "OUT_OF_RANGE"
  | "INVENTORY_FULL"
  | "CANNOT_EQUIP"
  | "BLOCKED"
  | "DEAD"
  | "NOT_READY"
  | "INTERNAL_ERROR";

/**
 * Error message.
 */
export interface ErrorMessage {
  t: "error";
  /** Error code */
  code: ErrorCode;
  /** Human-readable message */
  msg: string;
}

/**
 * Pong message (response to ping).
 */
export interface PongMessage {
  t: "pong";
  /** Echo of client timestamp */
  c: number;
  /** Server timestamp (ms) */
  s: number;
}

/**
 * Union of all server message types.
 */
export type ServerMessage =
  | FullStateMessage
  | StateDeltaMessage
  | TurnMessage
  | ResultMessage
  | EventMessage
  | ErrorMessage
  | PongMessage;

/**
 * Server message type discriminator values.
 */
export type ServerMessageType = ServerMessage["t"];

// =============================================================================
// Message Validation Helpers
// =============================================================================

/**
 * Type guard for ClientMessage.
 */
export function isClientMessage(msg: unknown): msg is ClientMessage {
  if (typeof msg !== "object" || msg === null) return false;
  const m = msg as Record<string, unknown>;
  if (typeof m.t !== "string") return false;
  return VALID_CLIENT_MESSAGE_TYPES.has(m.t);
}

/**
 * Validates a client message structure.
 * Returns error message or null if valid.
 */
export function validateClientMessage(msg: unknown): string | null {
  if (typeof msg !== "object" || msg === null) {
    return "Message must be an object";
  }

  const m = msg as Record<string, unknown>;

  if (typeof m.t !== "string") {
    return "Missing message type";
  }

  if (!VALID_CLIENT_MESSAGE_TYPES.has(m.t)) {
    return `Unknown message type: ${m.t}`;
  }

  switch (m.t) {
    case "m": // Move
      if (typeof m.d !== "number" || !isValidDirection(m.d)) {
        return "Invalid direction";
      }
      break;

    case "a": // Attack
      if (typeof m.e !== "number") {
        return "Missing target entity";
      }
      break;

    case "p": // Pickup
      if (m.e !== undefined && typeof m.e !== "number") {
        return "Invalid target entity";
      }
      break;

    case "d": // Drop
    case "u": // Use
      if (typeof m.e !== "number") {
        return "Missing item entity";
      }
      break;

    case "eq": // Equip
      if (typeof m.e !== "number") {
        return "Missing item entity";
      }
      if (typeof m.s !== "string" || !isValidEquipmentSlot(m.s)) {
        return "Invalid equipment slot";
      }
      break;

    case "uq": // Unequip
      if (typeof m.s !== "string" || !isValidEquipmentSlot(m.s)) {
        return "Invalid equipment slot";
      }
      break;

    case "i": // Interact
      if (m.d !== undefined) {
        if (typeof m.d !== "number" || !isValidDirection(m.d)) {
          return "Invalid direction";
        }
      }
      break;

    case "ping":
      if (typeof m.c !== "number") {
        return "Missing client timestamp";
      }
      break;

    case "ready":
      // No additional fields required
      break;
  }

  return null;
}

// =============================================================================
// Coordinate Packing Utilities
// =============================================================================

/**
 * Packs x,y coordinates into a single number.
 * Uses 16 bits for each coordinate (supports -32768 to 32767).
 */
export function packCoord(x: number, y: number): number {
  return ((x & 0xffff) << 16) | (y & 0xffff);
}

/**
 * Unpacks a packed coordinate into x,y.
 */
export function unpackCoord(packed: number): { x: number; y: number } {
  let x = (packed >> 16) & 0xffff;
  let y = packed & 0xffff;

  // Handle signed values
  if (x > 0x7fff) x -= 0x10000;
  if (y > 0x7fff) y -= 0x10000;

  return { x, y };
}

// =============================================================================
// Rate Limiting Constants
// =============================================================================

/**
 * Rate limiting configuration.
 */
export const RATE_LIMITS = {
  /** Maximum actions per second */
  actionsPerSecond: 10,
  /** Maximum messages per minute */
  messagesPerMinute: 600,
  /** Ping interval in milliseconds */
  pingIntervalMs: 30_000,
  /** Ping timeout in milliseconds */
  pingTimeoutMs: 10_000,
  /** Inactivity timeout in milliseconds */
  inactivityTimeoutMs: 300_000, // 5 minutes
} as const;

// =============================================================================
// Exports for external use
// =============================================================================

export type { Entity };
