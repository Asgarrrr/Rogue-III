/**
 * Item Components
 *
 * Components for items, inventory, and equipment.
 */

import { ComponentSchema, ComponentType } from "../../core/component";
import type { Entity } from "../../types";

/**
 * Item types.
 */
export type ItemType =
  | "weapon"
  | "armor"
  | "consumable"
  | "key"
  | "treasure"
  | "misc";

/**
 * Item component.
 */
export interface ItemData {
  itemType: ItemType;
  stackable: boolean;
  count: number;
  value: number; // Gold value
}

export const ItemSchema = ComponentSchema.define<ItemData>("Item")
  .field("itemType", ComponentType.String, "misc")
  .field("stackable", ComponentType.U8, 0)
  .field("count", ComponentType.U32, 1)
  .field("value", ComponentType.U32, 0)
  .useAoS()
  .build();

/**
 * Weapon stats.
 */
export interface WeaponData {
  damageMin: number;
  damageMax: number;
  range: number; // 1 = melee
  accuracy: number; // Bonus to hit
}

export const WeaponSchema = ComponentSchema.define<WeaponData>("Weapon")
  .field("damageMin", ComponentType.U16, 1)
  .field("damageMax", ComponentType.U16, 4)
  .field("range", ComponentType.U8, 1)
  .field("accuracy", ComponentType.I16, 0)
  .build();

/**
 * Armor stats.
 */
export interface ArmorData {
  defense: number;
  evasionPenalty: number;
}

export const ArmorSchema = ComponentSchema.define<ArmorData>("Armor")
  .field("defense", ComponentType.U16, 0)
  .field("evasionPenalty", ComponentType.I16, 0)
  .build();

/**
 * Consumable effect.
 */
export type EffectType = "heal" | "damage" | "buff" | "debuff" | "teleport";

export interface ConsumableData {
  effectType: EffectType;
  effectValue: number;
  effectDuration: number; // 0 = instant
}

export const ConsumableSchema = ComponentSchema.define<ConsumableData>(
  "Consumable",
)
  .field("effectType", ComponentType.String, "heal")
  .field("effectValue", ComponentType.I32, 10)
  .field("effectDuration", ComponentType.U16, 0)
  .useAoS()
  .build();

/**
 * Equipment slots.
 */
export type EquipmentSlot = "weapon" | "armor" | "helmet" | "accessory";

/**
 * Equipment component - what an entity has equipped.
 */
export interface EquipmentData {
  weapon: number; // Entity ID or 0
  armor: number;
  helmet: number;
  accessory: number;
}

export const EquipmentSchema = ComponentSchema.define<EquipmentData>(
  "Equipment",
)
  .field("weapon", ComponentType.U32, 0)
  .field("armor", ComponentType.U32, 0)
  .field("helmet", ComponentType.U32, 0)
  .field("accessory", ComponentType.U32, 0)
  .build();

/**
 * Equippable component - marks item as equippable.
 */
export interface EquippableData {
  slot: EquipmentSlot;
}

export const EquippableSchema = ComponentSchema.define<EquippableData>(
  "Equippable",
)
  .field("slot", ComponentType.String, "weapon")
  .useAoS()
  .build();

/**
 * Inventory component.
 */
export interface InventoryData {
  items: Entity[];
  capacity: number;
}

export const InventorySchema = ComponentSchema.define<InventoryData>(
  "Inventory",
)
  .field("items", ComponentType.Object, () => [])
  .field("capacity", ComponentType.U8, 20)
  .useAoS()
  .build();

/**
 * InInventory component - marks item as being in an inventory.
 */
export interface InInventoryData {
  owner: number; // Entity ID
}

export const InInventorySchema = ComponentSchema.define<InInventoryData>(
  "InInventory",
)
  .field("owner", ComponentType.U32, 0)
  .build();

/**
 * Pickupable tag - item can be picked up.
 */
export const PickupableSchema =
  ComponentSchema.define<Record<string, never>>("Pickupable").build();
