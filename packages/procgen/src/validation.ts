/**
 * Dungeon Validation & Statistics
 *
 * Public facade for validation and statistics utilities.
 * For testing utilities (determinism checks), see testing.ts.
 */

export {
  computeStats,
  type GenerationStats,
} from "./validation/compute-stats";
export {
  validateDungeon,
} from "./validation/validate-dungeon";
export {
  type DungeonValidationResult,
  type ValidationFailure,
  type ValidationSuccess,
} from "./validation/result-types";
