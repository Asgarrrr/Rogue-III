/**
 * Network Module
 *
 * WebSocket-based network layer for client-server communication.
 * Handles state synchronization, input routing, and event broadcasting.
 *
 * @see NETWORK_ARCHITECTURE.md for full specification
 *
 * @example
 * ```typescript
 * import {
 *   GameServer,
 *   NetworkSyncManager,
 *   type ClientMessage,
 *   type ServerMessage,
 *   PROTOCOL_VERSION,
 * } from "@engine/network";
 *
 * // Create game server
 * const gameServer = new GameServer(world, { templates });
 *
 * // Handle WebSocket events
 * gameServer.handleConnect(sessionId, userId, ws);
 * gameServer.handleMessage(sessionId, message);
 * gameServer.handleDisconnect(sessionId);
 * ```
 */

// =============================================================================
// Types
// =============================================================================

export {
  type AttackMessage,
  type ClientMessage,
  type ClientMessageType,
  DIRECTION_TO_DELTA,
  // Direction
  type Direction,
  type DropMessage,
  // Server messages
  type EntityData,
  type EntityUpdate,
  type EquipMessage,
  // Equipment
  type EquipmentSlot,
  type EquipmentState,
  type ErrorCode,
  type ErrorMessage,
  type EventMessage,
  type ExperienceInfo,
  type FullPlayerData,
  type FullStateMessage,
  type GameEventData,
  // Common types
  type HealthInfo,
  type InteractMessage,
  type InventoryItem,
  // Validation
  isClientMessage,
  isValidDirection,
  isValidEquipmentSlot,
  // Client messages
  type MoveMessage,
  type PickupMessage,
  type PingMessage,
  type PlayerDelta,
  type PongMessage,
  // Protocol version
  PROTOCOL_VERSION,
  // Coordinate utilities
  packCoord,
  // Rate limiting
  RATE_LIMITS,
  type ReadyMessage,
  type ResultMessage,
  type ServerMessage,
  type ServerMessageType,
  type StateDeltaMessage,
  type TerrainData,
  type TerrainDelta,
  type TerrainTile,
  // Tile types
  type TileType,
  TileTypeNames,
  type TurnMessage,
  type UnequipMessage,
  type UseItemMessage,
  unpackCoord,
  VALID_CLIENT_MESSAGE_TYPES,
  VALID_DIRECTIONS,
  VALID_EQUIPMENT_SLOTS,
  validateClientMessage,
} from "./types";

// =============================================================================
// Game Session
// =============================================================================

export {
  type ConnectionState,
  // Utilities
  computeEntityHash,
  computeEquipmentHash,
  computeInventoryHash,
  // Factory
  createGameSession,
  // Types
  type EntitySnapshot,
  // Class
  GameSession,
  type PlayerSnapshot,
  type SessionStats,
  stringHash,
  type TerrainSnapshot,
} from "./game-session";

// =============================================================================
// Network Sync Manager
// =============================================================================

export { NetworkSyncManager } from "./sync-manager";

// =============================================================================
// Message Handler
// =============================================================================

export { type ActionResult, MessageHandler } from "./message-handler";

// =============================================================================
// Game Server
// =============================================================================

export {
  GameServer,
  type GameServerConfig,
  type SendCallback,
  type WebSocketLike,
} from "./game-server";
