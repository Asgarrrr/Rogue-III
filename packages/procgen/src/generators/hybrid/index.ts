/**
 * Hybrid Generator Module
 *
 * Combines BSP and Cellular automata for varied dungeon layouts.
 */

// Generator
export {
  createHybridGenerator,
  HybridGenerator,
} from "./generator";
// Types
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
} from "./types";
export { DEFAULT_HYBRID_CONFIG, DEFAULT_ZONE_SPLIT_CONFIG } from "./types";
// Zone Splitter
export {
  findZoneAtPoint,
  getAlgorithmForZoneType,
  isPointInZone,
  splitIntoZones,
} from "./zone-splitter";
