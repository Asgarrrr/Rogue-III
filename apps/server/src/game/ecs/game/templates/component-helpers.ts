/**
 * Component Helper Functions
 *
 * Type-safe factory functions for creating component data.
 * These eliminate the need for 'as' casts in template definitions.
 */

import type { Entity } from "../../types";
import type { PositionData } from "../components/spatial";
import type { RenderableData } from "../components/render";
import type { HealthData, CombatStatsData } from "../components/stats";
import type {
  EquipmentData,
  InventoryData,
  ItemData,
  ItemType,
  ConsumableData,
  EffectType,
  WeaponData,
  ArmorData,
} from "../components/items";
import type { TurnEnergyData } from "../components/turn";
import type { AIData, AIState } from "../components/actor";
import type { FOVData } from "../components/fov";
import type {
  DoorData,
  StairsData,
  TrapData,
  TrapType,
  InteractableData,
  InteractionType,
} from "../components/environment";

// Spatial
export const position = (x: number, y: number, layer = 2): PositionData => ({
  x,
  y,
  layer,
});

// Renderable
export const renderable = (
  glyph: string,
  fgColor: string,
  bgColor = "",
  zIndex = 0,
): RenderableData => ({ glyph, fgColor, bgColor, zIndex });

// Health
export const health = (current: number, max: number): HealthData => ({
  current,
  max,
});

// Combat Stats
export const combatStats = (
  attack: number,
  defense: number,
  accuracy: number,
  evasion: number,
): CombatStatsData => ({ attack, defense, accuracy, evasion });

// Turn Energy
export const turnEnergy = (
  energy = 0,
  energyPerTurn = 100,
  speed = 100,
): TurnEnergyData => ({ energy, energyPerTurn, speed });

// FOV
export const fov = (radius: number, dirty = true): FOVData => ({
  radius,
  dirty,
});

// Inventory
export const inventory = (
  capacity: number,
  items: Entity[] = [],
): InventoryData => ({ capacity, items });

// Equipment
export const equipment = (
  weapon = 0,
  armor = 0,
  helmet = 0,
  accessory = 0,
): EquipmentData => ({ weapon, armor, helmet, accessory });

// AI
export const ai = (
  state: AIState = "idle",
  target = 0,
  alertness = 50,
  homeX = 0,
  homeY = 0,
  patrolRadius = 5,
): AIData => ({ state, target, alertness, homeX, homeY, patrolRadius });

// Item
export const item = (
  itemType: ItemType,
  stackable: boolean,
  count: number,
  value: number,
): ItemData => ({ itemType, stackable, count, value });

// Consumable
export const consumable = (
  effectType: EffectType,
  effectValue: number,
  effectDuration = 0,
): ConsumableData => ({ effectType, effectValue, effectDuration });

// Weapon
export const weapon = (
  damageMin: number,
  damageMax: number,
  accuracy: number,
  range: number,
): WeaponData => ({ damageMin, damageMax, accuracy, range });

// Armor
export const armor = (defense: number, evasionPenalty: number): ArmorData => ({
  defense,
  evasionPenalty,
});

// Door
export const door = (open = false, locked = false, keyId = ""): DoorData => ({
  open,
  locked,
  keyId,
});

// Stairs
export const stairs = (
  direction: "up" | "down",
  targetLevel: number,
  targetX = 0,
  targetY = 0,
): StairsData => ({ direction, targetLevel, targetX, targetY });

// Trap
export const trap = (
  trapType: TrapType,
  damage: number,
  triggered = false,
  visible = false,
  reusable = true,
): TrapData => ({ trapType, damage, triggered, visible, reusable });

// Interactable
export const interactable = (
  interactionType: InteractionType,
  message = "",
): InteractableData => ({ interactionType, message });

// Blocking (simple object)
export interface BlockingData {
  blocks: boolean;
}
export const blocking = (blocks = true): BlockingData => ({ blocks });

// Player tag (empty object)
export const playerTag = (): Record<string, never> => ({});
