/**
 * Item Entity Templates
 *
 * Templates for consumables, equipment, and other items.
 */

import { defineTemplate } from "../../features/templates";
import type { PositionData } from "../components/spatial";
import type { RenderableData } from "../components/render";
import type {
  ItemData,
  ConsumableData,
  WeaponData,
  ArmorData,
} from "../components/items";

// ============================================================================
// Base Item Template
// ============================================================================

export const BaseItemTemplate = defineTemplate("base_item")
  .tagged("item")
  .with("Position", { x: 0, y: 0, layer: 1 } as PositionData)
  .with("Renderable", {
    glyph: "?",
    fgColor: "#ffffff",
    bgColor: "",
    zIndex: 1,
  } as RenderableData)
  .with("Item", {
    itemType: "misc",
    stackable: false,
    count: 1,
    value: 0,
  } as ItemData)
  .build();

// ============================================================================
// Consumable Templates
// ============================================================================

export const HealthPotionTemplate = defineTemplate("potion_health")
  .extends("base_item")
  .tagged("consumable", "potion")
  .with("Renderable", {
    glyph: "!",
    fgColor: "#ff0000",
    bgColor: "",
    zIndex: 1,
  } as RenderableData)
  .with("Item", {
    itemType: "consumable",
    stackable: true,
    count: 1,
    value: 25,
  } as ItemData)
  .with("Consumable", {
    effectType: "heal",
    effectValue: 25,
    effectDuration: 0,
  } as ConsumableData)
  .build();

export const GreaterHealthPotionTemplate = defineTemplate(
  "potion_health_greater",
)
  .extends("potion_health")
  .with("Renderable", {
    glyph: "!",
    fgColor: "#ff4444",
    bgColor: "",
    zIndex: 1,
  } as RenderableData)
  .with("Item", {
    itemType: "consumable",
    stackable: true,
    count: 1,
    value: 75,
  } as ItemData)
  .with("Consumable", {
    effectType: "heal",
    effectValue: 50,
    effectDuration: 0,
  } as ConsumableData)
  .build();

export const ManaPotionTemplate = defineTemplate("potion_mana")
  .extends("base_item")
  .tagged("consumable", "potion")
  .with("Renderable", {
    glyph: "!",
    fgColor: "#0000ff",
    bgColor: "",
    zIndex: 1,
  } as RenderableData)
  .with("Item", {
    itemType: "consumable",
    stackable: true,
    count: 1,
    value: 30,
  } as ItemData)
  .with("Consumable", {
    effectType: "buff",
    effectValue: 20,
    effectDuration: 0,
  } as ConsumableData)
  .build();

export const ScrollTeleportTemplate = defineTemplate("scroll_teleport")
  .extends("base_item")
  .tagged("consumable", "scroll")
  .with("Renderable", {
    glyph: "?",
    fgColor: "#ffff00",
    bgColor: "",
    zIndex: 1,
  } as RenderableData)
  .with("Item", {
    itemType: "consumable",
    stackable: true,
    count: 1,
    value: 100,
  } as ItemData)
  .with("Consumable", {
    effectType: "teleport",
    effectValue: 0,
    effectDuration: 0,
  } as ConsumableData)
  .build();

export const ScrollRevealTemplate = defineTemplate("scroll_reveal")
  .extends("base_item")
  .tagged("consumable", "scroll")
  .with("Renderable", {
    glyph: "?",
    fgColor: "#00ffff",
    bgColor: "",
    zIndex: 1,
  } as RenderableData)
  .with("Item", {
    itemType: "consumable",
    stackable: true,
    count: 1,
    value: 150,
  } as ItemData)
  .with("Consumable", {
    effectType: "buff",
    effectValue: 20,
    effectDuration: 0,
  } as ConsumableData)
  .build();

// ============================================================================
// Weapon Templates
// ============================================================================

export const DaggerTemplate = defineTemplate("weapon_dagger")
  .extends("base_item")
  .tagged("equipment", "weapon", "melee")
  .with("Renderable", {
    glyph: "/",
    fgColor: "#c0c0c0",
    bgColor: "",
    zIndex: 1,
  } as RenderableData)
  .with("Item", {
    itemType: "weapon",
    stackable: false,
    count: 1,
    value: 50,
  } as ItemData)
  .with("Weapon", {
    damageMin: 2,
    damageMax: 6,
    accuracy: 10,
    range: 1,
  } as WeaponData)
  .build();

export const SwordTemplate = defineTemplate("weapon_sword")
  .extends("base_item")
  .tagged("equipment", "weapon", "melee")
  .with("Renderable", {
    glyph: "/",
    fgColor: "#ffffff",
    bgColor: "",
    zIndex: 1,
  } as RenderableData)
  .with("Item", {
    itemType: "weapon",
    stackable: false,
    count: 1,
    value: 100,
  } as ItemData)
  .with("Weapon", {
    damageMin: 4,
    damageMax: 12,
    accuracy: 5,
    range: 1,
  } as WeaponData)
  .build();

export const AxeTemplate = defineTemplate("weapon_axe")
  .extends("base_item")
  .tagged("equipment", "weapon", "melee")
  .with("Renderable", {
    glyph: "P",
    fgColor: "#8b4513",
    bgColor: "",
    zIndex: 1,
  } as RenderableData)
  .with("Item", {
    itemType: "weapon",
    stackable: false,
    count: 1,
    value: 120,
  } as ItemData)
  .with("Weapon", {
    damageMin: 6,
    damageMax: 18,
    accuracy: -5,
    range: 1,
  } as WeaponData)
  .build();

export const BowTemplate = defineTemplate("weapon_bow")
  .extends("base_item")
  .tagged("equipment", "weapon", "ranged")
  .with("Renderable", {
    glyph: "}",
    fgColor: "#8b4513",
    bgColor: "",
    zIndex: 1,
  } as RenderableData)
  .with("Item", {
    itemType: "weapon",
    stackable: false,
    count: 1,
    value: 150,
  } as ItemData)
  .with("Weapon", {
    damageMin: 3,
    damageMax: 9,
    accuracy: 10,
    range: 8,
  } as WeaponData)
  .build();

// ============================================================================
// Armor Templates
// ============================================================================

export const LeatherArmorTemplate = defineTemplate("armor_leather")
  .extends("base_item")
  .tagged("equipment", "armor", "body")
  .with("Renderable", {
    glyph: "[",
    fgColor: "#8b4513",
    bgColor: "",
    zIndex: 1,
  } as RenderableData)
  .with("Item", {
    itemType: "armor",
    stackable: false,
    count: 1,
    value: 80,
  } as ItemData)
  .with("Armor", {
    defense: 2,
    evasionPenalty: -5,
  } as ArmorData)
  .build();

export const ChainmailTemplate = defineTemplate("armor_chainmail")
  .extends("base_item")
  .tagged("equipment", "armor", "body")
  .with("Renderable", {
    glyph: "[",
    fgColor: "#c0c0c0",
    bgColor: "",
    zIndex: 1,
  } as RenderableData)
  .with("Item", {
    itemType: "armor",
    stackable: false,
    count: 1,
    value: 200,
  } as ItemData)
  .with("Armor", {
    defense: 5,
    evasionPenalty: 5,
  } as ArmorData)
  .build();

export const PlateArmorTemplate = defineTemplate("armor_plate")
  .extends("base_item")
  .tagged("equipment", "armor", "body")
  .with("Renderable", {
    glyph: "[",
    fgColor: "#ffd700",
    bgColor: "",
    zIndex: 1,
  } as RenderableData)
  .with("Item", {
    itemType: "armor",
    stackable: false,
    count: 1,
    value: 500,
  } as ItemData)
  .with("Armor", {
    defense: 10,
    evasionPenalty: 15,
  } as ArmorData)
  .build();

// ============================================================================
// Miscellaneous Items
// ============================================================================

export const GoldTemplate = defineTemplate("gold")
  .extends("base_item")
  .tagged("currency")
  .with("Renderable", {
    glyph: "$",
    fgColor: "#ffd700",
    bgColor: "",
    zIndex: 1,
  } as RenderableData)
  .with("Item", {
    itemType: "treasure",
    stackable: true,
    count: 1,
    value: 1,
  } as ItemData)
  .build();

export const KeyTemplate = defineTemplate("key")
  .extends("base_item")
  .tagged("key")
  .with("Renderable", {
    glyph: "-",
    fgColor: "#ffd700",
    bgColor: "",
    zIndex: 1,
  } as RenderableData)
  .with("Item", {
    itemType: "key",
    stackable: false,
    count: 1,
    value: 0,
  } as ItemData)
  .build();

// ============================================================================
// All Item Templates
// ============================================================================

export const ALL_ITEM_TEMPLATES = [
  BaseItemTemplate,
  // Consumables
  HealthPotionTemplate,
  GreaterHealthPotionTemplate,
  ManaPotionTemplate,
  ScrollTeleportTemplate,
  ScrollRevealTemplate,
  // Weapons
  DaggerTemplate,
  SwordTemplate,
  AxeTemplate,
  BowTemplate,
  // Armor
  LeatherArmorTemplate,
  ChainmailTemplate,
  PlateArmorTemplate,
  // Misc
  GoldTemplate,
  KeyTemplate,
];
