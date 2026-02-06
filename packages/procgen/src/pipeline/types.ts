/**
 * Progen V2 Pipeline Types
 *
 * Type-safe artifacts and passes for composable generation pipelines.
 */

import type { DungeonSeed, SeededRandom } from "@rogue/contracts";
import type { Point } from "../core/geometry/types";
import type { Grid } from "../core/grid/grid";
import type { Region } from "../core/grid/types";
import type { TraitVector } from "../core/traits";
import type { RoomTemplate } from "../prefabs/types";

// =============================================================================
// ARTIFACTS - Typed intermediate and final data products
// =============================================================================

/**
 * Base artifact interface. All artifacts have a type discriminant and unique ID.
 */
export interface Artifact<T extends string = string> {
  readonly type: T;
  readonly id: string;
}

/**
 * Empty artifact - starting point for pipelines
 */
export interface EmptyArtifact extends Artifact<"empty"> {
  readonly type: "empty";
}

/**
 * Grid artifact - 2D cell grid
 */
export interface GridArtifact extends Artifact<"grid"> {
  readonly type: "grid";
  readonly width: number;
  readonly height: number;
  readonly cells: Uint8Array;
  readonly grid?: Grid;
}

/**
 * Room type for semantic categorization
 */
export type RoomType =
  | "normal"
  | "entrance"
  | "exit"
  | "treasure"
  | "boss"
  | "cavern"
  | "library"
  | "armory";

/**
 * Room definition
 */
export interface Room {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly centerX: number;
  readonly centerY: number;
  readonly type: RoomType;
  readonly seed: number;
  /** Optional room template for non-rectangular shapes */
  readonly template?: RoomTemplate;
  /** Optional trait vector for room personality */
  readonly traits?: TraitVector;
}

/**
 * Rooms artifact - collection of placed rooms
 */
export interface RoomsArtifact extends Artifact<"rooms"> {
  readonly type: "rooms";
  readonly rooms: readonly Room[];
}

/**
 * Connection between two rooms
 */
export interface Connection {
  readonly fromRoomId: number;
  readonly toRoomId: number;
  readonly path: readonly Point[];
}

/**
 * Graph artifact - room connectivity graph
 */
export interface GraphArtifact extends Artifact<"graph"> {
  readonly type: "graph";
  readonly nodes: readonly number[];
  readonly edges: readonly [number, number][];
  readonly connections?: readonly Connection[];
}

/**
 * Regions artifact - identified connected regions
 */
export interface RegionsArtifact extends Artifact<"regions"> {
  readonly type: "regions";
  readonly regions: readonly Region[];
}

/**
 * BSP tree node
 */
export interface BSPNode {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly leftChild?: BSPNode;
  readonly rightChild?: BSPNode;
  readonly room?: Room;
}

/**
 * BSP tree artifact
 */
export interface BSPTreeArtifact extends Artifact<"bsp-tree"> {
  readonly type: "bsp-tree";
  readonly root: BSPNode;
  readonly leaves: readonly BSPNode[];
}

/**
 * Spawn point types defined by procgen.
 * Only structural types are defined here - game-specific types
 * should be expressed via tags.
 */
export type SpawnPointType =
  | "entrance" // Structural: player spawn
  | "exit" // Structural: level exit
  | "spawn"; // Generic: game layer interprets via tags

/**
 * Individual spawn point.
 *
 * Procgen provides positions and hints - the game layer
 * interprets tags to create actual entities.
 *
 * @example
 * ```typescript
 * // Procgen outputs:
 * { position, roomId, type: "spawn", tags: ["enemy", "guardian"] }
 *
 * // Game layer interprets:
 * if (spawn.tags.includes("enemy")) {
 *   const difficulty = spawn.distanceFromStart / maxDistance;
 *   spawnEnemy(spawn.position, { difficulty });
 * }
 * ```
 */
export interface SpawnPoint {
  readonly position: Point;
  readonly roomId: number;
  /** Structural type - use tags for game-specific categorization */
  readonly type: SpawnPointType;
  /** Free-form tags for game layer to interpret */
  readonly tags: readonly string[];
  /** Hint for relative importance (0-1) */
  readonly weight: number;
  /** Structural info: distance from entrance in room-hops */
  readonly distanceFromStart: number;
}

/**
 * Spawn artifact - placement points for game entities
 */
export interface SpawnArtifact extends Artifact<"spawns"> {
  readonly type: "spawns";
  readonly points: readonly SpawnPoint[];
}

/**
 * Validation violation
 */
export interface Violation {
  readonly type: string;
  readonly message: string;
  readonly severity: "error" | "warning";
}

/**
 * Validation artifact
 */
export interface ValidationArtifact extends Artifact<"validation"> {
  readonly type: "validation";
  readonly violations: readonly Violation[];
  readonly passed: boolean;
}

/**
 * Final dungeon artifact - complete generation result
 */
export interface DungeonArtifact extends Artifact<"dungeon"> {
  readonly type: "dungeon";
  readonly width: number;
  readonly height: number;
  readonly terrain: Uint8Array;
  readonly rooms: readonly Room[];
  readonly connections: readonly Connection[];
  readonly spawns: readonly SpawnPoint[];
  readonly checksum: string;
  readonly seed: DungeonSeed;
}

/**
 * Custom artifact for extensibility
 */
export interface CustomArtifact<T = unknown> extends Artifact<"custom"> {
  readonly type: "custom";
  readonly customType: string;
  readonly data: T;
}

// =============================================================================
// DUNGEON STATE ARTIFACT - Carries full pipeline state through passes
// =============================================================================

/**
 * Dungeon generation state - carries all data through pipeline passes.
 * This enables proper composition where each pass can access and modify
 * any part of the generation state.
 */
export interface DungeonStateArtifact extends Artifact<"dungeon-state"> {
  readonly type: "dungeon-state";
  readonly width: number;
  readonly height: number;
  readonly grid: Grid;
  readonly bspTree?: BSPNode;
  readonly bspLeaves?: readonly BSPNode[];
  readonly rooms: readonly Room[];
  readonly edges: readonly [number, number][];
  readonly connections: readonly Connection[];
  readonly spawns: readonly SpawnPoint[];
}

// =============================================================================
// UNION OF ALL ARTIFACT TYPES
// =============================================================================

/**
 * Union of all built-in artifact types
 */
export type AnyArtifact =
  | EmptyArtifact
  | GridArtifact
  | RoomsArtifact
  | GraphArtifact
  | RegionsArtifact
  | BSPTreeArtifact
  | SpawnArtifact
  | ValidationArtifact
  | DungeonArtifact
  | DungeonStateArtifact
  | CustomArtifact;

// =============================================================================
// TRACE & DEBUG
// =============================================================================

/**
 * Trace event types
 */
export type TraceEventType =
  | "start"
  | "end"
  | "decision"
  | "artifact"
  | "warning";

/**
 * Decision system identifiers for structured tracing.
 * Enables filtering and analysis by generation subsystem.
 */
export type DecisionSystem =
  | "layout"        // BSP partitioning, grid initialization
  | "rooms"         // Room placement, sizing, type assignment
  | "connectivity"  // MST, corridor carving, graph operations
  | "spawns"        // Entity placement, content distribution
  | "grammar"       // Grammar expansion, symbol selection
  | "constraints"   // Constraint evaluation, repair decisions
  | "simulation"    // Playthrough simulation, pacing analysis
  | "semantic";     // Semantic enrichment, trait assignment

/**
 * Confidence level for decisions.
 */
export type DecisionConfidence = "high" | "medium" | "low";

/**
 * Structured decision data for enhanced tracing.
 */
export interface StructuredDecisionData {
  /** Which system made this decision */
  readonly system: DecisionSystem;
  /** The question being answered */
  readonly question: string;
  /** Available options */
  readonly options: readonly unknown[];
  /** The chosen option */
  readonly chosen: unknown;
  /** Human-readable reason */
  readonly reason: string;
  /** Confidence in this decision */
  readonly confidence: DecisionConfidence;
  /** Number of RNG calls consumed for this decision */
  readonly rngConsumed: number;
  /** Optional context data */
  readonly context?: Record<string, unknown>;
}

/**
 * Base trace event
 */
export interface TraceEvent {
  readonly timestamp: number;
  readonly passId: string;
  readonly eventType: TraceEventType;
  readonly data?: unknown;
}

/**
 * Decision event for "explain why" debugging
 */
export interface DecisionEvent extends TraceEvent {
  readonly eventType: "decision";
  readonly data: {
    readonly question: string;
    readonly options: readonly unknown[];
    readonly chosen: unknown;
    readonly reason: string;
  };
}

/**
 * Enhanced decision event with structured data.
 */
export interface StructuredDecisionEvent extends TraceEvent {
  readonly eventType: "decision";
  readonly data: StructuredDecisionData;
}

/**
 * Statistics for decision analysis.
 */
export interface DecisionStats {
  readonly totalDecisions: number;
  readonly bySystem: Readonly<Record<DecisionSystem, number>>;
  readonly byConfidence: Readonly<Record<DecisionConfidence, number>>;
  readonly totalRngConsumed: number;
  readonly avgRngPerDecision: number;
}

/**
 * Trace collector interface
 */
export interface TraceCollector {
  readonly enabled: boolean;
  start(passId: string): void;
  end(passId: string, durationMs: number): void;
  decision(
    passId: string,
    question: string,
    options: readonly unknown[],
    chosen: unknown,
    reason: string,
  ): void;
  /**
   * Record a structured decision with full metadata.
   */
  structuredDecision(passId: string, data: StructuredDecisionData): void;
  warning(passId: string, message: string): void;
  artifact(passId: string, artifact: AnyArtifact): void;
  getEvents(): readonly TraceEvent[];
  /**
   * Get all decisions filtered by system.
   */
  getDecisionsBySystem(system: DecisionSystem): readonly StructuredDecisionEvent[];
  /**
   * Get decision statistics.
   */
  getDecisionStats(): DecisionStats;
  clear(): void;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * BSP algorithm configuration
 */
export interface BSPConfig {
  readonly minRoomSize: number;
  readonly maxRoomSize: number;
  readonly splitRatioMin: number;
  readonly splitRatioMax: number;
  readonly roomPadding: number;
  readonly corridorWidth: number;
  readonly maxDepth?: number;
  /** Probability of placing a room in each BSP leaf (0.0-1.0, default 1.0) */
  readonly roomPlacementChance?: number;
}

/**
 * Cellular automata configuration
 */
export interface CellularConfig {
  readonly initialFillRatio: number;
  readonly birthLimit: number;
  readonly deathLimit: number;
  readonly iterations: number;
  readonly minRegionSize: number;
  /** Connect all floor regions instead of keeping only the largest (default false) */
  readonly connectAllRegions?: boolean;
}

/**
 * Content placement configuration
 */
export interface ContentConfig {
  readonly enemyDensity: number;
  readonly treasureRatio: number;
  readonly decorationDensity: number;
}

/**
 * Generation configuration
 */
export interface GenerationConfig {
  readonly width: number;
  readonly height: number;
  readonly seed: DungeonSeed;
  readonly algorithm?: "bsp" | "cellular";
  readonly trace?: boolean;
  readonly snapshots?: boolean;
  readonly bsp?: BSPConfig;
  readonly cellular?: CellularConfig;
  readonly content?: ContentConfig;
  /** Dungeon depth level (for difficulty scaling) */
  readonly depth?: number;
  /** Difficulty multiplier (0-1 range) */
  readonly difficulty?: number;
}

/**
 * Default BSP configuration
 */
export const DEFAULT_BSP_CONFIG: BSPConfig = {
  minRoomSize: 6,
  maxRoomSize: 15,
  splitRatioMin: 0.4,
  splitRatioMax: 0.6,
  roomPadding: 1,
  corridorWidth: 2,
  maxDepth: 8,
  roomPlacementChance: 1.0,
};

/**
 * Default cellular configuration
 */
export const DEFAULT_CELLULAR_CONFIG: CellularConfig = {
  initialFillRatio: 0.45,
  birthLimit: 5,
  deathLimit: 4,
  iterations: 4,
  minRegionSize: 50,
  connectAllRegions: false,
};

// =============================================================================
// PASS CONTEXT
// =============================================================================

/**
 * Multiple RNG streams for different generation stages.
 *
 * Each stream is isolated to ensure that changes in one generation phase
 * don't affect randomness in other phases. This provides:
 * - **Determinism**: Same seed always produces same output
 * - **Stability**: Adding RNG calls in one pass doesn't shift others
 * - **Debuggability**: Each phase's randomness can be analyzed independently
 *
 * ## Stream Responsibilities
 *
 * | Stream | Used By | Purpose |
 * |--------|---------|---------|
 * | `layout` | BSP partitioning, grid initialization | Space division decisions |
 * | `rooms` | Room placement, sizing, template selection | Room generation |
 * | `connections` | MST selection, corridor carving direction | Connectivity |
 * | `details` | Spawn placement, content rules, decorations | Final details |
 *
 * ## Consumption Order Contract
 *
 * Within each stream, calls to `next()` must be deterministic in number and order.
 * Breaking rules:
 * - ❌ Conditional RNG consumption based on random values
 * - ❌ Different number of `next()` calls in different code paths
 * - ❌ Using `Math.random()` anywhere in generation
 *
 * Safe patterns:
 * - ✅ Fixed number of `next()` calls per entity
 * - ✅ Consuming RNG before conditional logic
 * - ✅ Using loop counters (not random) to control iteration
 *
 * @example
 * ```typescript
 * // GOOD: Fixed consumption
 * const x = rng.next();
 * const y = rng.next();
 * if (condition) { useX(x); }
 *
 * // BAD: Conditional consumption
 * if (condition) {
 *   const x = rng.next(); // Different call count per branch!
 * }
 * ```
 */
export interface RNGStreams {
  /**
   * Layout stream - BSP partitioning, cellular initialization, grid setup.
   * Consumed by: initializeState, partitionBSP, initializeRandom
   */
  readonly layout: SeededRandom;

  /**
   * Rooms stream - Room placement, sizing, template selection.
   * Consumed by: placeRooms, keepLargestRegion (room assignment)
   */
  readonly rooms: SeededRandom;

  /**
   * Connections stream - Corridor decisions, connectivity.
   * Consumed by: buildConnectivity, carveCorridors, connectRegions
   */
  readonly connections: SeededRandom;

  /**
   * Details stream - Spawns, content, decorations.
   * Consumed by: calculateSpawns, content rules, POI placement
   */
  readonly details: SeededRandom;
}

/**
 * Runtime context available to passes
 */
export interface PassContext {
  readonly rng: SeededRandom;
  readonly streams: RNGStreams;
  readonly config: Readonly<GenerationConfig>;
  readonly trace: TraceCollector;
  readonly seed: DungeonSeed;
}

// =============================================================================
// PASSES
// =============================================================================

/**
 * A pass transforms one artifact type into another.
 */
export interface Pass<TIn extends Artifact, TOut extends Artifact> {
  readonly id: string;
  readonly inputType: TIn["type"];
  readonly outputType: TOut["type"];
  run(input: TIn, ctx: PassContext): TOut | Promise<TOut>;
}

/**
 * Pass factory function type
 */
export type PassFactory<
  TIn extends Artifact,
  TOut extends Artifact,
  TConfig = void,
> = TConfig extends void
  ? () => Pass<TIn, TOut>
  : (config: TConfig) => Pass<TIn, TOut>;

// =============================================================================
// PIPELINE
// =============================================================================

/**
 * Snapshot of intermediate pipeline state
 */
export interface PipelineSnapshot {
  readonly passId: string;
  readonly passIndex: number;
  readonly timestamp: number;
  readonly terrain?: Uint8Array; // Grid state if available
  readonly roomCount: number;
  readonly connectionCount: number;
}

// =============================================================================
// PASS METRICS - Lightweight observability without full snapshots
// =============================================================================

/**
 * Lightweight metrics collected after each pass.
 * Enables dashboards and QA without the memory overhead of full snapshots.
 */
export interface PassMetrics {
  /** Pass identifier */
  readonly passId: string;
  /** Pass index in pipeline */
  readonly passIndex: number;
  /** Execution duration in milliseconds */
  readonly durationMs: number;
  /** Number of rooms after this pass */
  readonly roomCount: number;
  /** Number of connections after this pass */
  readonly connectionCount: number;
  /** Number of spawn points after this pass */
  readonly spawnCount: number;
  /** Floor tile ratio (0-1) */
  readonly floorRatio: number;
  /** Custom metrics from the pass */
  readonly custom?: Record<string, number | string | boolean>;
}

/**
 * Callback for pass metrics.
 * Called after each pass completes with lightweight metrics.
 */
export type PassMetricsCallback = (metrics: PassMetrics) => void;

// =============================================================================
// STATISTICAL QUALITY ASSURANCE
// =============================================================================

/**
 * Quality thresholds for detecting degenerate outputs.
 * Dungeons failing these checks should be flagged or rejected.
 */
export interface QualityThresholds {
  /** Minimum number of rooms (default: 3) */
  readonly minRooms: number;
  /** Maximum number of rooms (default: 100) */
  readonly maxRooms: number;
  /** Minimum floor ratio (default: 0.15) */
  readonly minFloorRatio: number;
  /** Maximum floor ratio (default: 0.6) */
  readonly maxFloorRatio: number;
  /** Minimum average room size in tiles (default: 16) */
  readonly minAvgRoomSize: number;
  /** Maximum dead-end ratio (default: 0.5) */
  readonly maxDeadEndRatio: number;
  /** Minimum connectivity (all rooms reachable) */
  readonly requireFullConnectivity: boolean;
}

/**
 * Default quality thresholds
 */
export const DEFAULT_QUALITY_THRESHOLDS: QualityThresholds = {
  minRooms: 3,
  maxRooms: 100,
  minFloorRatio: 0.15,
  maxFloorRatio: 0.6,
  minAvgRoomSize: 16,
  maxDeadEndRatio: 0.5,
  requireFullConnectivity: true,
};

/**
 * Quality assessment result
 */
export interface QualityAssessment {
  /** Whether all checks passed */
  readonly passed: boolean;
  /** Individual check results */
  readonly checks: readonly QualityCheck[];
  /** Overall quality score (0-100) */
  readonly score: number;
}

/**
 * Individual quality check result
 */
export interface QualityCheck {
  readonly name: string;
  readonly passed: boolean;
  readonly value: number;
  readonly threshold: number;
  readonly message: string;
}

/**
 * Pipeline execution result
 */
export interface PipelineResult<T extends Artifact> {
  readonly success: boolean;
  readonly artifact?: T;
  readonly error?: Error;
  readonly trace?: readonly TraceEvent[];
  readonly snapshots?: readonly PipelineSnapshot[];
  readonly durationMs: number;
}

/**
 * Progress callback type
 */
export type ProgressCallback = (
  progress: number,
  passId: string,
  artifact?: AnyArtifact,
) => void;

/**
 * Pipeline execution options
 */
export interface PipelineOptions {
  /** Abort signal for cancellation */
  readonly signal?: AbortSignal;
  /** Progress callback (percent, passId) */
  readonly onProgress?: ProgressCallback;
  /** Capture full grid snapshots after each pass (memory intensive) */
  readonly captureSnapshots?: boolean;
  /** Lightweight metrics callback after each pass (recommended) */
  readonly onPassMetrics?: PassMetricsCallback;
}

/**
 * Pipeline interface
 */
export interface Pipeline<TStart extends Artifact, TEnd extends Artifact> {
  readonly id: string;
  run(
    input: TStart,
    seed: DungeonSeed,
    options?: PipelineOptions,
  ): Promise<PipelineResult<TEnd>>;
  runSync(
    input: TStart,
    seed: DungeonSeed,
    options?: Omit<PipelineOptions, "signal">,
  ): PipelineResult<TEnd>;
}

// =============================================================================
// GENERATOR
// =============================================================================

/**
 * Generator interface - creates pipelines for specific algorithms
 */
export interface Generator {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  createPipeline(
    config: GenerationConfig,
  ): Pipeline<EmptyArtifact, DungeonArtifact>;
  validateConfig(config: GenerationConfig): ValidationArtifact;
  getDefaultConfig(): Partial<GenerationConfig>;
}

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create an empty artifact
 */
export function createEmptyArtifact(): EmptyArtifact {
  return { type: "empty", id: "empty" };
}

/**
 * Create a grid artifact
 */
export function createGridArtifact(
  grid: Grid,
  id: string = "grid",
): GridArtifact {
  return {
    type: "grid",
    id,
    width: grid.width,
    height: grid.height,
    cells: grid.getRawDataCopy(), // Use copy for immutability
    grid,
  };
}

/**
 * Create a rooms artifact
 */
export function createRoomsArtifact(
  rooms: readonly Room[],
  id: string = "rooms",
): RoomsArtifact {
  return { type: "rooms", id, rooms };
}

/**
 * Create a graph artifact
 */
export function createGraphArtifact(
  nodes: readonly number[],
  edges: readonly [number, number][],
  connections?: readonly Connection[],
  id: string = "graph",
): GraphArtifact {
  return { type: "graph", id, nodes, edges, connections };
}

/**
 * Create a validation artifact
 */
export function createValidationArtifact(
  violations: readonly Violation[],
  id: string = "validation",
): ValidationArtifact {
  const passed = violations.every((v) => v.severity !== "error");
  return { type: "validation", id, violations, passed };
}

/**
 * Create a dungeon state artifact
 */
export function createDungeonStateArtifact(
  grid: Grid,
  id: string = "dungeon-state",
): DungeonStateArtifact {
  return {
    type: "dungeon-state",
    id,
    width: grid.width,
    height: grid.height,
    grid,
    rooms: [],
    edges: [],
    connections: [],
    spawns: [],
  };
}
