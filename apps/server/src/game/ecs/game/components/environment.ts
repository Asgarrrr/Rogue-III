/**
 * Environment Components
 *
 * Components for doors, stairs, traps, and terrain features.
 */

import { ComponentSchema, ComponentType } from "../../core/component";

/**
 * Door component.
 */
export interface DoorData {
  open: boolean;
  locked: boolean;
  keyId: string; // Empty = no key needed
}

export const DoorSchema = ComponentSchema.define<DoorData>("Door")
  .field("open", ComponentType.U8, 0)
  .field("locked", ComponentType.U8, 0)
  .field("keyId", ComponentType.String, "")
  .useAoS()
  .build();

/**
 * Stairs component for level transitions.
 */
export interface StairsData {
  direction: "up" | "down";
  targetLevel: number;
  targetX: number;
  targetY: number;
}

export const StairsSchema = ComponentSchema.define<StairsData>("Stairs")
  .field("direction", ComponentType.String, "down")
  .field("targetLevel", ComponentType.I32, 1)
  .field("targetX", ComponentType.I32, 0)
  .field("targetY", ComponentType.I32, 0)
  .useAoS()
  .build();

/**
 * Trap component.
 */
export interface TrapData {
  trapType: TrapType;
  damage: number;
  triggered: boolean;
  visible: boolean;
  reusable: boolean;
}

export type TrapType = "spike" | "arrow" | "poison" | "teleport" | "alarm";

export const TrapSchema = ComponentSchema.define<TrapData>("Trap")
  .field("trapType", ComponentType.String, "spike")
  .field("damage", ComponentType.U16, 10)
  .field("triggered", ComponentType.U8, 0)
  .field("visible", ComponentType.U8, 0)
  .field("reusable", ComponentType.U8, 0)
  .useAoS()
  .build();

/**
 * Interactable component.
 */
export interface InteractableData {
  interactionType: InteractionType;
  message: string;
}

export type InteractionType =
  | "examine"
  | "open"
  | "activate"
  | "talk"
  | "read"
  | "loot";

export const InteractableSchema = ComponentSchema.define<InteractableData>(
  "Interactable",
)
  .field("interactionType", ComponentType.String, "examine")
  .field("message", ComponentType.String, "")
  .useAoS()
  .build();

/**
 * Container component (chests, barrels, etc.).
 */
export interface ContainerData {
  items: number[]; // Entity IDs of contained items
  locked: boolean;
  keyId: string; // Empty = no key needed
  opened: boolean;
  lootTable: string; // Optional loot table ID for procedural content
}

export const ContainerSchema = ComponentSchema.define<ContainerData>(
  "Container",
)
  .field("items", ComponentType.Object, () => [])
  .field("locked", ComponentType.U8, 0)
  .field("keyId", ComponentType.String, "")
  .field("opened", ComponentType.U8, 0)
  .field("lootTable", ComponentType.String, "")
  .useAoS()
  .build();

/**
 * Key component for unlocking doors/containers.
 */
export interface KeyData {
  keyId: string; // Matches Door.keyId or Container.keyId
  consumeOnUse: boolean;
}

export const KeySchema = ComponentSchema.define<KeyData>("Key")
  .field("keyId", ComponentType.String, "")
  .field("consumeOnUse", ComponentType.U8, 1) // 1 = true
  .useAoS()
  .build();
