/**
 * Game Systems
 *
 * All game systems for the roguelike.
 */

import type { World } from "../../core/world";

// AI System
export { AISystem } from "./ai";
// Combat System
export {
  ActionResolutionSystem,
  type AttackRequestData,
  AttackRequestSchema,
  applyMoveAction,
  type CombatResult,
  CombatSystem,
  requestAttack,
} from "./combat";

// FOV System
export {
  FOVCalculator,
  FOVSystem,
  initializeFOVResources,
  isCellVisible,
} from "./fov";
// Interaction System
export {
  ContainerSystem,
  canInteract,
  DoorSystem,
  findNearestInteractable,
  InteractionSystem,
  type InteractRequestData,
  InteractRequestSchema,
  type LootContainerRequestData,
  LootContainerRequestSchema,
  type OpenDoorRequestData,
  OpenDoorRequestSchema,
  requestInteract,
  requestInteractWith,
  requestLootContainer,
  requestOpenDoor,
  requestUseStairs,
  StairsSystem,
  type UseStairsRequestData,
  UseStairsRequestSchema,
} from "./interaction";
// Inventory System
export {
  type DropRequestData,
  DropRequestSchema,
  DropSystem,
  type EquipRequestData,
  EquipRequestSchema,
  EquipSystem,
  getEquippedItem,
  getInventoryCapacity,
  getInventoryItems,
  hasInventorySpace,
  type PickupRequestData,
  PickupRequestSchema,
  PickupSystem,
  requestDrop,
  requestEquip,
  requestPickup,
  requestUnequip,
  requestUseItem,
  type UnequipRequestData,
  UnequipRequestSchema,
  UnequipSystem,
  type UseItemRequestData,
  UseItemRequestSchema,
  UseItemSystem,
} from "./inventory";
// Movement System
export {
  type BlockingData,
  BlockingSchema,
  CollisionSystem,
  MovementSystem,
} from "./movement";
// Turn System
export {
  type ActionRequest,
  ENERGY_THRESHOLD,
  submitAction,
  TurnManagementSystem,
} from "./turn";

/**
 * All game systems in execution order.
 */
export const ALL_GAME_SYSTEMS = [
  // Note: Import the actual system objects when registering
  "TurnManagement", // PreUpdate - manages turn order
  "AI", // Update - AI decision making
  "ActionResolution", // Update - converts actions to effects
  "Interaction", // Update - dispatches to specific interaction systems
  "Door", // Update - door open/close
  "Stairs", // Update - level transitions
  "Container", // Update - container looting
  "Pickup", // Update - item pickup
  "Drop", // Update - item drop
  "Equip", // Update - item equip
  "Unequip", // Update - item unequip
  "UseItem", // Update - consumable use
  "Collision", // Update - validates movement
  "Movement", // Update - applies movement
  "Combat", // Update - resolves combat
  "FOV", // PostUpdate - updates visibility
];

/**
 * Registers all game systems with a world.
 */
export function registerGameSystems(world: World): void {
  // Import systems to register
  const { TurnManagementSystem } = require("./turn");
  const { MovementSystem, CollisionSystem } = require("./movement");
  const { FOVSystem } = require("./fov");
  const { AISystem } = require("./ai");
  const { CombatSystem, ActionResolutionSystem } = require("./combat");
  const {
    PickupSystem,
    DropSystem,
    EquipSystem,
    UnequipSystem,
    UseItemSystem,
  } = require("./inventory");
  const {
    InteractionSystem,
    DoorSystem,
    StairsSystem,
    ContainerSystem,
  } = require("./interaction");

  // Register in order
  world.systems.register(TurnManagementSystem);
  world.systems.register(AISystem);
  world.systems.register(ActionResolutionSystem);

  // Interaction systems
  world.systems.register(InteractionSystem);
  world.systems.register(DoorSystem);
  world.systems.register(StairsSystem);
  world.systems.register(ContainerSystem);

  // Inventory systems
  world.systems.register(PickupSystem);
  world.systems.register(DropSystem);
  world.systems.register(EquipSystem);
  world.systems.register(UnequipSystem);
  world.systems.register(UseItemSystem);

  // Movement and combat
  world.systems.register(CollisionSystem);
  world.systems.register(MovementSystem);
  world.systems.register(CombatSystem);
  world.systems.register(FOVSystem);
}

/**
 * Registers additional components needed by systems.
 */
export function registerSystemComponents(world: World): void {
  const { BlockingSchema } = require("./movement");
  const { AttackRequestSchema } = require("./combat");
  const {
    PickupRequestSchema,
    DropRequestSchema,
    EquipRequestSchema,
    UnequipRequestSchema,
    UseItemRequestSchema,
  } = require("./inventory");
  const {
    InteractRequestSchema,
    OpenDoorRequestSchema,
    UseStairsRequestSchema,
    LootContainerRequestSchema,
  } = require("./interaction");

  // Movement/Combat
  world.registerComponent(BlockingSchema);
  world.registerComponent(AttackRequestSchema);

  // Inventory
  world.registerComponent(PickupRequestSchema);
  world.registerComponent(DropRequestSchema);
  world.registerComponent(EquipRequestSchema);
  world.registerComponent(UnequipRequestSchema);
  world.registerComponent(UseItemRequestSchema);

  // Interaction
  world.registerComponent(InteractRequestSchema);
  world.registerComponent(OpenDoorRequestSchema);
  world.registerComponent(UseStairsRequestSchema);
  world.registerComponent(LootContainerRequestSchema);
}
