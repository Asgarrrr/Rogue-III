/**
 * Actor Entity Templates
 *
 * Templates for player, enemies, and NPCs.
 */

import { defineTemplate } from "../../features/templates";
import type { Entity } from "../../types";
import type { AIData } from "../components/actor";
import type { FOVData } from "../components/fov";
import type { EquipmentData, InventoryData } from "../components/items";
import type { RenderableData } from "../components/render";
import type { PositionData } from "../components/spatial";
import type { CombatStatsData, HealthData } from "../components/stats";
import type { TurnEnergyData } from "../components/turn";
import type { BlockingData } from "../systems/movement";

// ============================================================================
// Player Template
// ============================================================================

export const PlayerTemplate = defineTemplate("player")
  .tagged("actor", "player")
  .with("Position", { x: 0, y: 0, layer: 2 } as PositionData)
  .with("Renderable", {
    glyph: "@",
    fgColor: "#ffffff",
    bgColor: "",
    zIndex: 10,
  } as RenderableData)
  .with("Health", { current: 100, max: 100 } as HealthData)
  .with("CombatStats", {
    attack: 10,
    defense: 5,
    accuracy: 85,
    evasion: 15,
  } as CombatStatsData)
  .with("TurnEnergy", {
    energy: 0,
    energyPerTurn: 100,
    speed: 100,
  } as TurnEnergyData)
  .with("FOV", { radius: 10, dirty: true } as FOVData)
  .with("Inventory", { capacity: 20, items: [] as Entity[] } as InventoryData)
  .with("Equipment", {
    weapon: 0,
    armor: 0,
    helmet: 0,
    accessory: 0,
  } as EquipmentData)
  .with("Player", {} as Record<string, never>)
  .build();

// ============================================================================
// Enemy Templates
// ============================================================================

/**
 * Base enemy template - other enemies inherit from this.
 */
export const BaseEnemyTemplate = defineTemplate("base_enemy")
  .tagged("actor", "enemy")
  .with("Position", { x: 0, y: 0, layer: 2 } as PositionData)
  .with("Renderable", {
    glyph: "?",
    fgColor: "#ff0000",
    bgColor: "",
    zIndex: 5,
  } as RenderableData)
  .with("Health", { current: 10, max: 10 } as HealthData)
  .with("CombatStats", {
    attack: 5,
    defense: 2,
    accuracy: 70,
    evasion: 10,
  } as CombatStatsData)
  .with("TurnEnergy", {
    energy: 0,
    energyPerTurn: 100,
    speed: 100,
  } as TurnEnergyData)
  .with("AI", {
    state: "idle",
    target: 0,
    alertness: 50,
    homeX: 0,
    homeY: 0,
    patrolRadius: 5,
  } as AIData)
  .with("Blocking", { blocks: true } as BlockingData)
  .build();

/**
 * Rat - weak enemy for early game.
 */
export const RatTemplate = defineTemplate("rat")
  .extends("base_enemy")
  .tagged("animal", "weak")
  .with("Renderable", {
    glyph: "r",
    fgColor: "#8b4513",
    bgColor: "",
    zIndex: 5,
  } as RenderableData)
  .with("Health", { current: 5, max: 5 } as HealthData)
  .with("CombatStats", {
    attack: 2,
    defense: 0,
    accuracy: 60,
    evasion: 20,
  } as CombatStatsData)
  .with("TurnEnergy", {
    energy: 0,
    energyPerTurn: 100,
    speed: 120,
  } as TurnEnergyData)
  .build();

/**
 * Orc - standard melee enemy.
 */
export const OrcTemplate = defineTemplate("orc")
  .extends("base_enemy")
  .tagged("humanoid", "orc")
  .with("Renderable", {
    glyph: "o",
    fgColor: "#00ff00",
    bgColor: "",
    zIndex: 5,
  } as RenderableData)
  .with("Health", { current: 30, max: 30 } as HealthData)
  .with("CombatStats", {
    attack: 8,
    defense: 2,
    accuracy: 75,
    evasion: 5,
  } as CombatStatsData)
  .with("TurnEnergy", {
    energy: 0,
    energyPerTurn: 100,
    speed: 80,
  } as TurnEnergyData)
  .build();

/**
 * Orc Warrior - stronger orc variant.
 */
export const OrcWarriorTemplate = defineTemplate("orc_warrior")
  .extends("orc")
  .tagged("elite")
  .with("Renderable", {
    glyph: "O",
    fgColor: "#228b22",
    bgColor: "",
    zIndex: 5,
  } as RenderableData)
  .with("Health", { current: 50, max: 50 } as HealthData)
  .with("CombatStats", {
    attack: 12,
    defense: 5,
    accuracy: 80,
    evasion: 5,
  } as CombatStatsData)
  .build();

/**
 * Goblin - fast but weak enemy.
 */
export const GoblinTemplate = defineTemplate("goblin")
  .extends("base_enemy")
  .tagged("humanoid", "goblin")
  .with("Renderable", {
    glyph: "g",
    fgColor: "#ffff00",
    bgColor: "",
    zIndex: 5,
  } as RenderableData)
  .with("Health", { current: 15, max: 15 } as HealthData)
  .with("CombatStats", {
    attack: 5,
    defense: 1,
    accuracy: 70,
    evasion: 25,
  } as CombatStatsData)
  .with("TurnEnergy", {
    energy: 0,
    energyPerTurn: 100,
    speed: 110,
  } as TurnEnergyData)
  .build();

/**
 * Troll - tough but slow enemy.
 */
export const TrollTemplate = defineTemplate("troll")
  .extends("base_enemy")
  .tagged("humanoid", "troll", "boss")
  .with("Renderable", {
    glyph: "T",
    fgColor: "#808080",
    bgColor: "",
    zIndex: 5,
  } as RenderableData)
  .with("Health", { current: 80, max: 80 } as HealthData)
  .with("CombatStats", {
    attack: 15,
    defense: 8,
    accuracy: 65,
    evasion: 0,
  } as CombatStatsData)
  .with("TurnEnergy", {
    energy: 0,
    energyPerTurn: 100,
    speed: 60,
  } as TurnEnergyData)
  .build();

/**
 * Skeleton - undead enemy.
 */
export const SkeletonTemplate = defineTemplate("skeleton")
  .extends("base_enemy")
  .tagged("undead", "skeleton")
  .with("Renderable", {
    glyph: "s",
    fgColor: "#f0f0f0",
    bgColor: "",
    zIndex: 5,
  } as RenderableData)
  .with("Health", { current: 20, max: 20 } as HealthData)
  .with("CombatStats", {
    attack: 6,
    defense: 3,
    accuracy: 70,
    evasion: 10,
  } as CombatStatsData)
  .build();

/**
 * Ghost - ethereal undead.
 */
export const GhostTemplate = defineTemplate("ghost")
  .extends("base_enemy")
  .tagged("undead", "ethereal")
  .with("Renderable", {
    glyph: "G",
    fgColor: "#add8e6",
    bgColor: "",
    zIndex: 5,
  } as RenderableData)
  .with("Health", { current: 25, max: 25 } as HealthData)
  .with("CombatStats", {
    attack: 8,
    defense: 0,
    accuracy: 90,
    evasion: 40,
  } as CombatStatsData)
  .with("Blocking", { blocks: false } as BlockingData)
  .build();

// ============================================================================
// All Actor Templates
// ============================================================================

export const ALL_ACTOR_TEMPLATES = [
  PlayerTemplate,
  BaseEnemyTemplate,
  RatTemplate,
  OrcTemplate,
  OrcWarriorTemplate,
  GoblinTemplate,
  TrollTemplate,
  SkeletonTemplate,
  GhostTemplate,
];
