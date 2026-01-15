/**
 * Content Placement Module
 *
 * Data-driven content spawning using the rule engine.
 *
 * @example
 * ```typescript
 * import { content } from "@rogue/procgen-v2/passes";
 *
 * // Create rule-based spawner
 * const spawner = content.createRuleSpawner({
 *   rules: JSON.stringify(content.createStandardRules()),
 * });
 *
 * // Use in custom pipeline
 * pipeline.addPass(spawner);
 * ```
 */

export * from "./poi-rules";
export * from "./poi-spawner";

// POI System
export * from "./poi-types";
export * from "./rule-based-spawner";
export * from "./types";

// Intelligent Placement Rules
export type {
  ConditionOperator,
  ConditionType,
  EntityType,
  PlacementCondition,
  PlacementRule,
  PositioningStrategy,
  SpawnTemplate,
} from "./placement-rules";
export {
  ABYSS_PLACEMENT_RULES,
  applyPlacementRules,
  createCondition,
  createPlacementRule,
  createSpawnTemplate,
  scaleByDistance,
  scaleLootQuality,
} from "./placement-rules";
