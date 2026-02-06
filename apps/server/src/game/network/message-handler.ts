/**
 * Message Handler
 *
 * Validates client messages and routes them to appropriate ECS systems.
 * Acts as the bridge between network input and game logic.
 *
 * @see NETWORK_ARCHITECTURE.md for full specification
 */

import type { World } from "../ecs/core/world";
import type { GameMap } from "../ecs/game/resources/game-map";
import type { TurnStateManager } from "../ecs/game/resources/turn-state";
import { requestAttack } from "../ecs/game/systems/combat";
import {
  requestInteract,
  requestInteractWith,
} from "../ecs/game/systems/interaction";
import {
  requestDrop,
  requestEquip,
  requestPickup,
  requestUnequip,
  requestUseItem,
} from "../ecs/game/systems/inventory";
import { type ActionRequest, submitAction } from "../ecs/game/systems/turn";
import type { Entity } from "../ecs/types";

import type { GameSession } from "./game-session";
import type { NetworkSyncManager } from "./sync-manager";
import {
  type ClientMessage,
  DIRECTION_TO_DELTA,
  type Direction,
  type ErrorCode,
  isValidDirection,
  isValidEquipmentSlot,
  validateClientMessage,
} from "./types";

// =============================================================================
// Types
// =============================================================================

/**
 * Result of processing a client action.
 */
export interface ActionResult {
  /** Did the action succeed? */
  ok: boolean;
  /** Human-readable message */
  msg?: string;
  /** Error code for programmatic handling */
  reason?: ErrorCode;
}

/**
 * Success result helper.
 */
function success(msg?: string): ActionResult {
  return { ok: true, msg };
}

/**
 * Failure result helper.
 */
function failure(reason: ErrorCode, msg: string): ActionResult {
  return { ok: false, reason, msg };
}

// =============================================================================
// MessageHandler Class
// =============================================================================

/**
 * MessageHandler validates and routes client messages to ECS systems.
 *
 * Responsibilities:
 * - Validate message format and content
 * - Check if action is allowed (turn state)
 * - Route to appropriate ECS system
 * - Return result for client feedback
 *
 * @example
 * ```typescript
 * const handler = new MessageHandler(world, syncManager);
 *
 * const result = handler.handleMessage(session, { t: "m", d: 6 });
 * if (result.ok) {
 *   // Action succeeded, broadcast state update
 * } else {
 *   // Send error to client
 * }
 * ```
 */
export class MessageHandler {
  /**
   * Reference to the ECS world.
   */
  private readonly world: World;

  /**
   * Reference to the sync manager.
   */
  private readonly syncManager: NetworkSyncManager;

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  /**
   * Creates a new MessageHandler.
   *
   * @param world - The ECS world
   * @param syncManager - The network sync manager
   */
  constructor(world: World, syncManager: NetworkSyncManager) {
    this.world = world;
    this.syncManager = syncManager;
  }

  // ---------------------------------------------------------------------------
  // Main Entry Point
  // ---------------------------------------------------------------------------

  /**
   * Handles a client message.
   *
   * @param session - The client's game session
   * @param message - The raw message (already parsed from JSON)
   * @returns Action result
   */
  public handleMessage(session: GameSession, message: unknown): ActionResult {
    // Validate message format
    const validationError = validateClientMessage(message);
    if (validationError) {
      return failure("INVALID_ACTION", validationError);
    }

    const msg = message as ClientMessage;

    // Handle non-action messages
    if (msg.t === "ready" || msg.t === "ping") {
      // These are handled by GameServer, not here
      return success();
    }

    // Check if session has a player
    if (!session.playerId) {
      return failure("INTERNAL_ERROR", "No player entity assigned");
    }

    // Check if player is alive
    if (!this.world.isAlive(session.playerId)) {
      return failure("DEAD", "Player is dead");
    }

    // Route to appropriate handler
    return this.handleAction(session, msg);
  }

  /**
   * Handles a game action message.
   *
   * @param session - The client's game session
   * @param message - The validated client message
   * @returns Action result
   */
  public handleAction(
    session: GameSession,
    message: ClientMessage,
  ): ActionResult {
    if (!session.playerId) {
      return failure("INTERNAL_ERROR", "No player entity");
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

      case "ready":
      case "ping":
        // Already handled above, but TypeScript needs this
        return success();

      default:
        return failure("INVALID_ACTION", "Unknown action type");
    }
  }

  // ---------------------------------------------------------------------------
  // Turn Validation
  // ---------------------------------------------------------------------------

  /**
   * Checks if it's the player's turn to act.
   */
  private isPlayerTurn(playerId: Entity): boolean {
    return this.syncManager.isPlayerTurn(playerId);
  }

  /**
   * Validates that it's the player's turn before allowing an action.
   */
  private validateTurn(playerId: Entity): ActionResult | null {
    if (!this.isPlayerTurn(playerId)) {
      return failure("NOT_YOUR_TURN", "It's not your turn");
    }
    return null;
  }

  // ---------------------------------------------------------------------------
  // Movement Handler
  // ---------------------------------------------------------------------------

  /**
   * Handles move action.
   *
   * @param playerId - Player entity ID
   * @param direction - Direction (0-9 numpad style, 0=wait)
   * @returns Action result
   */
  private handleMove(playerId: Entity, direction: Direction): ActionResult {
    // Validate direction
    if (!isValidDirection(direction)) {
      return failure("INVALID_DIRECTION", "Invalid direction");
    }

    // Validate turn
    const turnError = this.validateTurn(playerId);
    if (turnError) return turnError;

    // Get delta from direction
    const delta = DIRECTION_TO_DELTA[direction];

    // Wait action (direction 0)
    if (direction === 0) {
      const submitted = submitAction(this.world, playerId, { type: "wait" });
      if (!submitted) {
        return failure("NOT_YOUR_TURN", "Failed to submit wait action");
      }
      return success("Waiting...");
    }

    // Check if destination is walkable
    const gameMap = this.world.resources.get<GameMap>("gameMap");
    if (gameMap) {
      const pos = this.world.getComponent<{ x: number; y: number }>(
        playerId,
        "Position",
      );
      if (pos) {
        const newX = pos.x + delta.dx;
        const newY = pos.y + delta.dy;

        // Check for blocking entities at destination
        const entitiesAt = gameMap.getEntitiesAt(newX, newY);
        for (const entity of entitiesAt) {
          if (entity === playerId) continue;

          // Check if entity blocks movement
          if (this.world.hasComponent(entity, "BlocksMovement")) {
            // Check if it's an enemy we can attack
            if (
              this.world.hasComponent(entity, "Health") &&
              this.world.hasComponent(entity, "AI")
            ) {
              // Auto-attack!
              return this.handleAttack(playerId, entity);
            }
            return failure("BLOCKED", "Path is blocked");
          }
        }

        // Check terrain
        if (!gameMap.isWalkable(newX, newY)) {
          return failure("BLOCKED", "Cannot move there");
        }
      }
    }

    // Submit move action
    const action: ActionRequest = {
      type: "move",
      data: { dx: delta.dx, dy: delta.dy },
    };

    const submitted = submitAction(this.world, playerId, action);
    if (!submitted) {
      return failure("NOT_YOUR_TURN", "Failed to submit move action");
    }

    return success();
  }

  // ---------------------------------------------------------------------------
  // Attack Handler
  // ---------------------------------------------------------------------------

  /**
   * Handles attack action.
   *
   * @param playerId - Player entity ID
   * @param targetId - Target entity ID
   * @returns Action result
   */
  private handleAttack(playerId: Entity, targetId: Entity): ActionResult {
    // Validate turn
    const turnError = this.validateTurn(playerId);
    if (turnError) return turnError;

    // Validate target exists
    if (!this.world.isAlive(targetId)) {
      return failure("TARGET_NOT_FOUND", "Target not found");
    }

    // Check target has health (can be attacked)
    if (!this.world.hasComponent(targetId, "Health")) {
      return failure("INVALID_TARGET", "Target cannot be attacked");
    }

    // Check range (adjacent only for melee)
    const playerPos = this.world.getComponent<{ x: number; y: number }>(
      playerId,
      "Position",
    );
    const targetPos = this.world.getComponent<{ x: number; y: number }>(
      targetId,
      "Position",
    );

    if (playerPos && targetPos) {
      const dx = Math.abs(playerPos.x - targetPos.x);
      const dy = Math.abs(playerPos.y - targetPos.y);

      if (dx > 1 || dy > 1) {
        return failure("OUT_OF_RANGE", "Target is too far away");
      }
    }

    // Submit attack via request component
    requestAttack(this.world, playerId, targetId);

    // Submit action to end turn
    const action: ActionRequest = {
      type: "attack",
      data: { target: targetId },
    };

    const submitted = submitAction(this.world, playerId, action);
    if (!submitted) {
      return failure("NOT_YOUR_TURN", "Failed to submit attack action");
    }

    return success();
  }

  // ---------------------------------------------------------------------------
  // Item Handlers
  // ---------------------------------------------------------------------------

  /**
   * Handles pickup action.
   *
   * @param playerId - Player entity ID
   * @param targetId - Optional specific item to pick up
   * @returns Action result
   */
  private handlePickup(playerId: Entity, targetId?: Entity): ActionResult {
    // Validate turn
    const turnError = this.validateTurn(playerId);
    if (turnError) return turnError;

    // If specific target, validate it exists
    if (targetId !== undefined && !this.world.isAlive(targetId)) {
      return failure("TARGET_NOT_FOUND", "Item not found");
    }

    // Request pickup
    requestPickup(this.world, playerId, targetId ?? 0);

    // Submit action to process systems and end turn
    const action: ActionRequest = {
      type: "interact",
      data: { target: targetId ?? playerId },
    };

    const submitted = submitAction(this.world, playerId, action);
    if (!submitted) {
      return failure("NOT_YOUR_TURN", "Failed to submit pickup action");
    }

    return success();
  }

  /**
   * Handles drop action.
   *
   * @param playerId - Player entity ID
   * @param itemId - Item entity ID to drop
   * @returns Action result
   */
  private handleDrop(playerId: Entity, itemId: Entity): ActionResult {
    // Validate item exists
    if (!this.world.isAlive(itemId)) {
      return failure("TARGET_NOT_FOUND", "Item not found");
    }

    // Validate item is in player's inventory
    const inInventory = this.world.getComponent<{ owner: number }>(
      itemId,
      "InInventory",
    );
    if (!inInventory || inInventory.owner !== playerId) {
      return failure("INVALID_TARGET", "Item not in inventory");
    }

    // Request drop (doesn't consume turn)
    requestDrop(this.world, playerId, itemId);

    // Process immediately without consuming turn
    this.world.tick();

    return success();
  }

  /**
   * Handles use item action.
   *
   * @param playerId - Player entity ID
   * @param itemId - Item entity ID to use
   * @returns Action result
   */
  private handleUseItem(playerId: Entity, itemId: Entity): ActionResult {
    // Validate turn (using consumables takes a turn)
    const turnError = this.validateTurn(playerId);
    if (turnError) return turnError;

    // Validate item exists
    if (!this.world.isAlive(itemId)) {
      return failure("TARGET_NOT_FOUND", "Item not found");
    }

    // Check item is usable (has Consumable component)
    if (!this.world.hasComponent(itemId, "Consumable")) {
      return failure("INVALID_TARGET", "Item cannot be used");
    }

    // Request use
    requestUseItem(this.world, playerId, itemId);

    // Submit action to end turn
    const action: ActionRequest = {
      type: "use_item",
      data: { item: itemId },
    };

    const submitted = submitAction(this.world, playerId, action);
    if (!submitted) {
      return failure("NOT_YOUR_TURN", "Failed to submit use action");
    }

    return success();
  }

  /**
   * Handles equip action.
   *
   * @param playerId - Player entity ID
   * @param itemId - Item entity ID to equip
   * @param slot - Equipment slot
   * @returns Action result
   */
  private handleEquip(
    playerId: Entity,
    itemId: Entity,
    slot: string,
  ): ActionResult {
    // Validate slot
    if (!isValidEquipmentSlot(slot)) {
      return failure("INVALID_ACTION", "Invalid equipment slot");
    }

    // Validate item exists
    if (!this.world.isAlive(itemId)) {
      return failure("TARGET_NOT_FOUND", "Item not found");
    }

    // Check item is equippable
    if (!this.world.hasComponent(itemId, "Equippable")) {
      return failure("CANNOT_EQUIP", "Item cannot be equipped");
    }

    // Request equip (doesn't consume turn)
    requestEquip(this.world, playerId, itemId);

    // Process immediately
    this.world.tick();

    return success();
  }

  /**
   * Handles unequip action.
   *
   * @param playerId - Player entity ID
   * @param slot - Equipment slot to unequip
   * @returns Action result
   */
  private handleUnequip(playerId: Entity, slot: string): ActionResult {
    // Validate slot
    if (!isValidEquipmentSlot(slot)) {
      return failure("INVALID_ACTION", "Invalid equipment slot");
    }

    // Request unequip (doesn't consume turn)
    requestUnequip(this.world, playerId, slot as any);

    // Process immediately
    this.world.tick();

    return success();
  }

  // ---------------------------------------------------------------------------
  // Interaction Handler
  // ---------------------------------------------------------------------------

  /**
   * Handles interact action.
   *
   * @param playerId - Player entity ID
   * @param direction - Optional direction (0 = at feet)
   * @returns Action result
   */
  private handleInteract(
    playerId: Entity,
    direction?: Direction,
  ): ActionResult {
    // Validate turn
    const turnError = this.validateTurn(playerId);
    if (turnError) return turnError;

    // Validate direction if provided
    if (direction !== undefined && direction !== 0) {
      if (!isValidDirection(direction)) {
        return failure("INVALID_DIRECTION", "Invalid direction");
      }
    }

    // Request interaction
    requestInteract(this.world, playerId, direction ?? 0);

    // Submit action to end turn
    const action: ActionRequest = {
      type: "interact",
    };

    const submitted = submitAction(this.world, playerId, action);
    if (!submitted) {
      return failure("NOT_YOUR_TURN", "Failed to submit interact action");
    }

    return success();
  }
}
