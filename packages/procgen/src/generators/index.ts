/**
 * Generators module - dungeon generation algorithms.
 *
 * Each generator provides a complete pipeline for creating dungeons
 * using a specific algorithm.
 */

// BSP Generator - Binary Space Partitioning algorithm
export { BSPGenerator, BSPPasses, createBSPGenerator } from "./bsp";

// Cellular Generator - Cellular Automata algorithm
export {
  CellularGenerator,
  CellularPasses,
  createCellularGenerator,
} from "./cellular";
export type {
  GenerationAlgorithm,
  HybridConfig,
  HybridConfigPatch,
  ZoneBounds,
  ZoneDefinition,
  ZoneSplitConfig,
  ZoneSplitResult,
  ZoneTransition,
  ZoneType,
} from "./hybrid";
// Hybrid Generator - BSP + Cellular combination
export {
  createHybridGenerator,
  DEFAULT_HYBRID_CONFIG,
  DEFAULT_ZONE_SPLIT_CONFIG,
  findZoneAtPoint,
  getAlgorithmForZoneType,
  HybridGenerator,
  isPointInZone,
  splitIntoZones,
} from "./hybrid";
