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

// Hybrid Generator - BSP + Cellular combination
export {
  createHybridGenerator,
  findZoneAtPoint,
  getAlgorithmForZoneType,
  HybridGenerator,
  hybridGenerator,
  isPointInZone,
  splitIntoZones,
} from "./hybrid";
export type {
  GenerationAlgorithm,
  HybridConfig,
  ZoneBounds,
  ZoneDefinition,
  ZoneSplitConfig,
  ZoneSplitResult,
  ZoneTransition,
  ZoneType,
} from "./hybrid";
export { DEFAULT_HYBRID_CONFIG, DEFAULT_ZONE_SPLIT_CONFIG } from "./hybrid";
