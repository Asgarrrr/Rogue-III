/**
 * @rogue/procgen - Procedural Dungeon Generation
 */

// =============================================================================
// PUBLIC API
// =============================================================================

// High-level generation API
export {
  chain,
  type GenerateAsyncOptions,
  type GenerateOptions,
  generate,
  generateAsync,
  getAvailableAlgorithms,
  registerGenerator,
  validateConfig,
} from "./api";
// Seed utilities
export {
  createSeed,
  createSeedFromString,
  createSeedWithTimestamp,
  normalizeSeed,
  /** @deprecated Use normalizeSeed instead */
  normalizeSeed as createSeedFromSeed,
  randomSeed,
  seedsAreEquivalent,
  serializeSeed,
} from "./seed";
// Testing utilities (separated to avoid circular deps)
export {
  assertDeterministic,
  DeterminismViolationError,
  testDeterminism,
} from "./testing";
// Validation & Statistics
export {
  computeStats,
  type DungeonValidationResult,
  type GenerationStats,
  validateDungeon,
} from "./validation";

// =============================================================================
// CORE TYPES (selective export)
// =============================================================================

// Algorithms
export { UnionFind } from "./core/algorithms/union-find";

// Data structures
export {
  CoordSet,
  coordFromKey,
  coordKey,
  FastQueue,
} from "./core/data-structures/fast-queue";

// Geometry
export {
  buildMSTFromEdges,
  delaunayTriangulation,
} from "./core/geometry/delaunay";
// Geometry - public API only
export type { Point, Rect } from "./core/geometry/types";
export { buildRoomAdjacency } from "./core/graph/adjacency";
// Graph algorithms
export { calculateBFSDistances } from "./core/graph/bfs-distance";

// Grid - public API only
export { BitGrid, CellType, Grid } from "./core/grid";
// Grid utilities
export { findAllRegions, floodFillBFS } from "./core/grid/flood-fill";
// Grid types (MutableGrid and ReadonlyGrid for custom passes)
export type { MutableGrid, ReadonlyGrid, Region } from "./core/grid/types";

// =============================================================================
// PIPELINE TYPES (public interfaces)
// =============================================================================

// Quality types
export type {
  BSPConfig,
  CellularConfig,
  Connection,
  // Artifacts
  DungeonArtifact,
  // Config
  GenerationConfig,
  Generator,
  PassMetrics,
  PassMetricsCallback,
  // Pipeline
  Pipeline,
  PipelineOptions,
  PipelineResult,
  QualityAssessment,
  QualityCheck,
  QualityThresholds,
  Room,
  RoomType,
  SpawnPoint,
  SpawnPointType,
  // Validated config types (for custom passes)
  ValidatedBSPConfig,
  ValidatedCellularConfig,
  ValidatedConfig,
  ValidationArtifact,
  Violation,
} from "./pipeline/types";
export {
  // Quality thresholds
  DEFAULT_QUALITY_THRESHOLDS,
} from "./pipeline/types";

// =============================================================================
// GENERATORS (public factory functions)
// =============================================================================

export {
  createBSPGenerator,
  createCellularGenerator,
  createHybridGenerator,
} from "./generators";

// =============================================================================
// ADVANCED API (for custom pipelines)
// =============================================================================

// Re-export SeededRandom from contracts for convenience
export { type RngState, SeededRandom } from "@rogue/contracts";
// Context utilities
export {
  cacheContext,
  combineContexts,
  combineSeedWithContext,
  createContextProvider,
  createEmptyContext,
  remapContext,
  transformContext,
  withDefaults,
} from "./core/context/provider";
// Seed encoding utilities
export {
  decodeSeed,
  decodeSeedPretty,
  encodeSeed,
  encodeSeedPretty,
  isValidEncodedSeed,
  pathToSeed,
  randomEncodedSeed,
  seedToPath,
} from "./core/seed/encoding";
// Namespace for passes - allows procgen.passes.carving etc
export * as passes from "./passes";
export type {
  RoomEdge,
  RoomMetadata,
} from "./passes/connectivity/graph-algorithms";
// Pass-specific utilities
export {
  buildCompleteGraph,
  buildMST,
  calculateRoomMetadata,
} from "./passes/connectivity/graph-algorithms";
// Pipeline builder for advanced usage
export { createPipeline, PipelineBuilder } from "./pipeline";
// Transformer for post-processing
export { transform } from "./pipeline/chaining";
// Quality assessment
export { assessQuality } from "./quality";
// Visualization & debug utilities (ASCII/SVG/snapshots)
export * from "./utils";
