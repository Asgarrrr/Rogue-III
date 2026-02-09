/**
 * Pipeline Types
 *
 * Type-safe artifacts and passes for composable generation pipelines.
 */

import type { DungeonSeed, SeededRandom } from "@rogue/contracts";

// Re-export all types from sub-modules
export * from "./artifacts";
export * from "./config";
export * from "./trace";

// Import types needed for this file
import type {
  AnyArtifact,
  Artifact,
  DungeonArtifact,
  EmptyArtifact,
} from "./artifacts";
import type { GenerationConfig, ValidatedConfig } from "./config";
import type { TraceCollector, TraceEvent } from "./trace";

// =============================================================================
// RNG STREAMS
// =============================================================================

/**
 * Names of available RNG streams.
 * Used for compile-time stream scoping in passes.
 */
export type RNGStreamName = "layout" | "rooms" | "connections" | "details";

/**
 * Multiple RNG streams for different generation stages.
 *
 * Each stream is isolated to ensure that changes in one generation phase
 * don't affect randomness in other phases. This provides:
 * - **Determinism**: Same seed always produces same output
 * - **Stability**: Adding RNG calls in one pass doesn't shift others
 * - **Debuggability**: Each phase's randomness can be analyzed independently
 */
export interface RNGStreams {
  /**
   * Layout stream - BSP partitioning, cellular initialization, grid setup.
   */
  readonly layout: SeededRandom;

  /**
   * Rooms stream - Room placement, sizing, template selection.
   */
  readonly rooms: SeededRandom;

  /**
   * Connections stream - Corridor decisions, connectivity.
   */
  readonly connections: SeededRandom;

  /**
   * Details stream - Spawns, content, decorations.
   */
  readonly details: SeededRandom;
}

/**
 * Partial RNG streams - only contains the streams a pass declared it needs.
 * This provides compile-time enforcement of stream discipline.
 */
export type ScopedRNGStreams<T extends RNGStreamName> = Pick<RNGStreams, T>;

/**
 * Runtime context available to passes.
 *
 * The `streams` property contains only the RNG streams the pass declared
 * it needs via `requiredStreams`. This provides compile-time enforcement
 * of stream discipline.
 */
export interface PassContext<TStreams extends RNGStreamName = RNGStreamName> {
  /** Primary RNG (derived from seed.primary) - use sparingly, prefer streams */
  readonly rng: SeededRandom;
  /** Scoped RNG streams - only contains streams declared in requiredStreams */
  readonly streams: ScopedRNGStreams<TStreams>;
  /** Generation configuration (validated with all defaults resolved) */
  readonly config: ValidatedConfig;
  /** Trace collector for debugging */
  readonly trace: TraceCollector;
  /** The dungeon seed */
  readonly seed: DungeonSeed;
}

/**
 * Full context with all streams (used internally by builder)
 */
export type FullPassContext = PassContext<RNGStreamName>;

// =============================================================================
// PASSES
// =============================================================================

/**
 * A pass transforms one artifact type into another.
 *
 * Passes must declare which RNG streams they need via `requiredStreams`.
 * Use `[] as const` for passes that don't need RNG (e.g., finalization).
 * This enables compile-time enforcement of stream discipline.
 *
 * @example
 * ```typescript
 * // Pass that uses RNG
 * function placeRooms(): Pass<DungeonStateArtifact, DungeonStateArtifact, "rooms"> {
 *   return {
 *     id: "place-rooms",
 *     inputType: "dungeon-state",
 *     outputType: "dungeon-state",
 *     requiredStreams: ["rooms"] as const,
 *     run(input, ctx) {
 *       const rng = ctx.streams.rooms;
 *       // ...
 *     }
 *   };
 * }
 *
 * // Pass that doesn't use RNG
 * function finalize(): Pass<DungeonStateArtifact, DungeonArtifact, never> {
 *   return {
 *     id: "finalize",
 *     inputType: "dungeon-state",
 *     outputType: "dungeon",
 *     requiredStreams: [] as const,
 *     run(input, ctx) { ... }
 *   };
 * }
 * ```
 */
export interface Pass<
  TIn extends Artifact,
  TOut extends Artifact,
  TStreams extends RNGStreamName = never,
> {
  readonly id: string;
  readonly inputType: TIn["type"];
  readonly outputType: TOut["type"];
  /**
   * RNG streams this pass requires.
   * Use `[] as const` for passes that don't need RNG.
   */
  readonly requiredStreams: readonly TStreams[];
  run(input: TIn, ctx: PassContext<TStreams>): TOut | Promise<TOut>;
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
  readonly terrain?: Uint8Array;
  readonly roomCount: number;
  readonly connectionCount: number;
}

/**
 * Lightweight metrics collected after each pass.
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
 */
export type PassMetricsCallback = (metrics: PassMetrics) => void;

/**
 * Successful pipeline execution result.
 * When `success` is true, `artifact` is guaranteed to be present.
 */
export interface PipelineSuccess<T extends Artifact> {
  readonly success: true;
  readonly artifact: T;
  readonly trace: readonly TraceEvent[];
  readonly snapshots: readonly PipelineSnapshot[];
  readonly durationMs: number;
}

/**
 * Failed pipeline execution result.
 * When `success` is false, `error` is guaranteed to be present.
 */
export interface PipelineFailure {
  readonly success: false;
  readonly error: Error;
  readonly trace: readonly TraceEvent[];
  readonly snapshots: readonly PipelineSnapshot[];
  readonly durationMs: number;
}

/**
 * Pipeline execution result - discriminated union.
 * Use `if (result.success)` to narrow to success/failure types.
 */
export type PipelineResult<T extends Artifact> =
  | PipelineSuccess<T>
  | PipelineFailure;

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
  validateConfig(
    config: GenerationConfig,
  ): import("./artifacts").ValidationArtifact;
  getDefaultConfig(): Partial<GenerationConfig>;
}
