/**
 * Game Components
 *
 * All component schemas for the game.
 */

// Actor
export {
  type ActorNameData,
  ActorNameSchema,
  type AIData,
  AISchema,
  type AIState,
  type FactionData,
  FactionSchema,
  type FactionType,
  PlayerSchema,
} from "./actor";
// Environment
export {
  type ContainerData,
  ContainerSchema,
  type DoorData,
  DoorSchema,
  type InteractableData,
  InteractableSchema,
  type InteractionType,
  type KeyData,
  KeySchema,
  type StairsData,
  StairsSchema,
  type TrapData,
  TrapSchema,
  type TrapType,
} from "./environment";
// FOV
export {
  type FOVData,
  FOVSchema,
  type MemoryData,
  MemorySchema,
  packCoords,
  unpackCoords,
  type VisibleCellsData,
  VisibleCellsSchema,
} from "./fov";
// Items
export {
  type ArmorData,
  ArmorSchema,
  type ConsumableData,
  ConsumableSchema,
  type EffectType,
  type EquipmentData,
  EquipmentSchema,
  type EquipmentSlot,
  type EquippableData,
  EquippableSchema,
  type InInventoryData,
  InInventorySchema,
  type InventoryData,
  InventorySchema,
  type ItemData,
  ItemSchema,
  type ItemType,
  PickupableSchema,
  type WeaponData,
  WeaponSchema,
} from "./items";
// Render
export {
  type AnimationData,
  AnimationSchema,
  type AnimationType,
  type DescriptionData,
  DescriptionSchema,
  type RenderableData,
  RenderableSchema,
} from "./render";
// Spatial
export {
  BlocksMovementSchema,
  BlocksVisionSchema,
  Layer,
  type LayerType,
  type PositionData,
  PositionSchema,
  type PreviousPositionData,
  PreviousPositionSchema,
  type VelocityData,
  VelocitySchema,
} from "./spatial";
// Stats
export {
  type CombatStatsData,
  CombatStatsSchema,
  DeadSchema,
  type ExperienceData,
  ExperienceSchema,
  type HealthData,
  HealthSchema,
} from "./stats";
// Turn
export {
  type ActionData,
  ActionSchema,
  type ActionType,
  ActiveTurnSchema,
  ENERGY_THRESHOLD,
  type TurnEnergyData,
  TurnEnergySchema,
  WaitingForInputSchema,
} from "./turn";

import type { World } from "../../core/world";
import {
  ActorNameSchema,
  AISchema,
  FactionSchema,
  PlayerSchema,
} from "./actor";
import {
  ContainerSchema,
  DoorSchema,
  InteractableSchema,
  KeySchema,
  StairsSchema,
  TrapSchema,
} from "./environment";
import { FOVSchema, MemorySchema, VisibleCellsSchema } from "./fov";
import {
  ArmorSchema,
  ConsumableSchema,
  EquipmentSchema,
  EquippableSchema,
  InInventorySchema,
  InventorySchema,
  ItemSchema,
  PickupableSchema,
  WeaponSchema,
} from "./items";
import { AnimationSchema, DescriptionSchema, RenderableSchema } from "./render";
import {
  BlocksMovementSchema,
  BlocksVisionSchema,
  PositionSchema,
  PreviousPositionSchema,
  VelocitySchema,
} from "./spatial";
import {
  CombatStatsSchema,
  DeadSchema,
  ExperienceSchema,
  HealthSchema,
} from "./stats";
import {
  ActionSchema,
  ActiveTurnSchema,
  TurnEnergySchema,
  WaitingForInputSchema,
} from "./turn";

/**
 * All game component schemas.
 */
export const ALL_GAME_SCHEMAS = [
  // Spatial
  PositionSchema,
  PreviousPositionSchema,
  VelocitySchema,
  BlocksMovementSchema,
  BlocksVisionSchema,
  // Stats
  HealthSchema,
  CombatStatsSchema,
  ExperienceSchema,
  DeadSchema,
  // Turn
  TurnEnergySchema,
  ActiveTurnSchema,
  WaitingForInputSchema,
  ActionSchema,
  // Actor
  PlayerSchema,
  AISchema,
  FactionSchema,
  ActorNameSchema,
  // FOV
  FOVSchema,
  VisibleCellsSchema,
  MemorySchema,
  // Items
  ItemSchema,
  WeaponSchema,
  ArmorSchema,
  ConsumableSchema,
  EquipmentSchema,
  EquippableSchema,
  InventorySchema,
  InInventorySchema,
  PickupableSchema,
  // Environment
  DoorSchema,
  StairsSchema,
  TrapSchema,
  InteractableSchema,
  ContainerSchema,
  KeySchema,
  // Render
  RenderableSchema,
  DescriptionSchema,
  AnimationSchema,
] as const;

/**
 * Registers all game components with a world.
 */
export function registerGameComponents(world: World): void {
  for (const schema of ALL_GAME_SCHEMAS) {
    world.registerComponent(schema);
  }
}
