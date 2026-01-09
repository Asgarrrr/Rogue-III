/**
 * Stats Components
 *
 * Components for combat stats, health, and attributes.
 */

import { ComponentSchema, ComponentType } from "../../core/component";

/**
 * Health component.
 */
export interface HealthData {
  current: number;
  max: number;
}

export const HealthSchema = ComponentSchema.define<HealthData>("Health")
  .field("current", ComponentType.I32, 100)
  .field("max", ComponentType.I32, 100)
  .build();

/**
 * Combat stats component.
 */
export interface CombatStatsData {
  attack: number;
  defense: number;
  accuracy: number;
  evasion: number;
}

export const CombatStatsSchema = ComponentSchema.define<CombatStatsData>(
  "CombatStats",
)
  .field("attack", ComponentType.I32, 10)
  .field("defense", ComponentType.I32, 5)
  .field("accuracy", ComponentType.I32, 80)
  .field("evasion", ComponentType.I32, 10)
  .build();

/**
 * Experience and leveling.
 */
export interface ExperienceData {
  level: number;
  current: number;
  toNextLevel: number;
}

export const ExperienceSchema = ComponentSchema.define<ExperienceData>(
  "Experience",
)
  .field("level", ComponentType.U16, 1)
  .field("current", ComponentType.U32, 0)
  .field("toNextLevel", ComponentType.U32, 100)
  .build();

/**
 * Dead tag component - marks entity as dead.
 */
export const DeadSchema =
  ComponentSchema.define<Record<string, never>>("Dead").build();
