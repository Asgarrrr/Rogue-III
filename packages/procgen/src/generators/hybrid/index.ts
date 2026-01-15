/**
 * Hybrid Generator Module
 *
 * Combines BSP and Cellular automata for varied dungeon layouts.
 */

// Types
export type {
  GenerationAlgorithm,
  HybridConfig,
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

// Generator
export {
  createHybridGenerator,
  HybridGenerator,
  hybridGenerator,
} from "./generator";
