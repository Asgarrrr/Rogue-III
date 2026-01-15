/**
 * Type-safe pipeline builder DSL.
 *
 * Allows composing passes into pipelines with compile-time type checking
 * of artifact flow.
 */

import { type DungeonSeed, SeededRandom } from "@rogue/contracts";
import { CellType } from "../core/grid/types";
import { createTraceCollector } from "./trace";
import type {
  Artifact,
  DungeonStateArtifact,
  GenerationConfig,
  Pass,
  PassContext,
  PassMetrics,
  Pipeline,
  PipelineOptions,
  PipelineResult,
  PipelineSnapshot,
  RNGStreams,
} from "./types";

/**
 * Internal pipeline step representation
 */
interface PipelineStep {
  readonly pass: Pass<Artifact, Artifact>;
  readonly index: number;
}

/**
 * Create RNG streams from seed - ensures each stage has isolated randomness
 */
export function createRNGStreams(seed: DungeonSeed): RNGStreams {
  return {
    layout: new SeededRandom(seed.layout),
    rooms: new SeededRandom(seed.rooms),
    connections: new SeededRandom(seed.connections),
    details: new SeededRandom(seed.details),
  };
}

/**
 * Capture a snapshot of the current pipeline state
 */
function captureSnapshot(
  artifact: Artifact,
  passId: string,
  passIndex: number,
): PipelineSnapshot {
  // Try to extract state from DungeonStateArtifact
  const state = artifact as DungeonStateArtifact;
  const hasGrid = state.grid && typeof state.grid.getRawDataCopy === "function";

  return {
    passId,
    passIndex,
    timestamp: performance.now(),
    terrain: hasGrid ? state.grid.getRawDataCopy() : undefined,
    roomCount: Array.isArray(state.rooms) ? state.rooms.length : 0,
    connectionCount: Array.isArray(state.connections)
      ? state.connections.length
      : 0,
  };
}

/**
 * Collect lightweight metrics from the current artifact.
 * Much cheaper than full snapshots - no terrain copy.
 */
function collectPassMetrics(
  artifact: Artifact,
  passId: string,
  passIndex: number,
  durationMs: number,
): PassMetrics {
  const state = artifact as DungeonStateArtifact;
  const hasGrid = state.grid && typeof state.grid.countCells === "function";

  let floorRatio = 0;
  if (hasGrid) {
    const totalCells = state.grid.width * state.grid.height;
    const floorCells = state.grid.countCells(CellType.FLOOR);
    floorRatio = totalCells > 0 ? floorCells / totalCells : 0;
  }

  return {
    passId,
    passIndex,
    durationMs,
    roomCount: Array.isArray(state.rooms) ? state.rooms.length : 0,
    connectionCount: Array.isArray(state.connections)
      ? state.connections.length
      : 0,
    spawnCount: Array.isArray(state.spawns) ? state.spawns.length : 0,
    floorRatio,
  };
}

/**
 * Pipeline builder for composing passes.
 *
 * Type parameters:
 * - TStart: The input artifact type for the pipeline
 * - TCurrent: The current output artifact type (evolves as passes are added)
 */
export class PipelineBuilder<
  TStart extends Artifact,
  TCurrent extends Artifact,
> {
  private readonly id: string;
  private readonly steps: PipelineStep[] = [];
  private readonly config: GenerationConfig;

  private constructor(
    id: string,
    config: GenerationConfig,
    steps: PipelineStep[] = [],
  ) {
    this.id = id;
    this.config = config;
    this.steps = steps;
  }

  /**
   * Create a new pipeline builder
   */
  static create<TStart extends Artifact>(
    id: string,
    config: GenerationConfig,
  ): PipelineBuilder<TStart, TStart> {
    return new PipelineBuilder<TStart, TStart>(id, config, []);
  }

  /**
   * Add a pass to the pipeline
   */
  pipe<TNext extends Artifact>(
    pass: Pass<TCurrent, TNext>,
  ): PipelineBuilder<TStart, TNext> {
    const newSteps = [
      ...this.steps,
      { pass: pass as Pass<Artifact, Artifact>, index: this.steps.length },
    ];
    return new PipelineBuilder<TStart, TNext>(this.id, this.config, newSteps);
  }

  /**
   * Add a conditional pass.
   *
   * When the condition is false, the pass is skipped and the type remains TCurrent.
   * When true, the type becomes TNext.
   *
   * Note: The union type TCurrent | TNext is necessary because at compile time
   * we don't know which branch will be taken.
   */
  when<TNext extends Artifact>(
    condition: (config: GenerationConfig) => boolean,
    pass: Pass<TCurrent, TNext>,
  ): PipelineBuilder<TStart, TCurrent | TNext> {
    if (condition(this.config)) {
      // Condition met: add the pass, output type becomes TNext
      const builder = this.pipe(pass);
      // Safe: PipelineBuilder<TStart, TNext> is assignable to PipelineBuilder<TStart, TCurrent | TNext>
      return builder as PipelineBuilder<TStart, TCurrent | TNext>;
    }
    // Condition not met: skip the pass, output type stays TCurrent
    // Safe: PipelineBuilder<TStart, TCurrent> is assignable to PipelineBuilder<TStart, TCurrent | TNext>
    return this as PipelineBuilder<TStart, TCurrent | TNext>;
  }

  /**
   * Build the final pipeline
   */
  build(): Pipeline<TStart, TCurrent> {
    const steps = [...this.steps];
    const pipelineId = this.id;
    const config = this.config;

    return {
      id: pipelineId,

      async run(
        input: TStart,
        seed: DungeonSeed,
        options?: PipelineOptions,
      ): Promise<PipelineResult<TCurrent>> {
        const startTime = performance.now();
        const trace = createTraceCollector(config.trace ?? false);
        const streams = createRNGStreams(seed);
        const rng = new SeededRandom(seed.primary);
        const snapshots: PipelineSnapshot[] = [];
        const shouldCaptureSnapshots =
          options?.captureSnapshots ?? config.snapshots ?? false;

        const ctx: PassContext = {
          rng,
          streams,
          config,
          trace,
          seed,
        };

        let current: Artifact = input;
        const totalSteps = steps.length;

        try {
          for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            if (!step) continue;

            // Check for abort signal
            if (options?.signal?.aborted) {
              throw new DOMException("Pipeline aborted", "AbortError");
            }

            trace.start(step.pass.id);
            const stepStart = performance.now();

            const result = step.pass.run(current, ctx);
            current = result instanceof Promise ? await result : result;

            const stepDuration = performance.now() - stepStart;
            trace.end(step.pass.id, stepDuration);

            // Capture snapshot after each pass
            if (shouldCaptureSnapshots) {
              snapshots.push(captureSnapshot(current, step.pass.id, i));
            }

            // Emit lightweight metrics (much cheaper than snapshots)
            if (options?.onPassMetrics) {
              const metrics = collectPassMetrics(
                current,
                step.pass.id,
                i,
                stepDuration,
              );
              options.onPassMetrics(metrics);
            }

            if (options?.onProgress) {
              const progress = Math.round(((i + 1) / totalSteps) * 100);
              options.onProgress(progress, step.pass.id);
            }
          }

          return {
            success: true,
            artifact: current as TCurrent,
            trace: trace.getEvents(),
            snapshots: shouldCaptureSnapshots ? snapshots : undefined,
            durationMs: performance.now() - startTime,
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error : new Error(String(error)),
            trace: trace.getEvents(),
            snapshots: shouldCaptureSnapshots ? snapshots : undefined,
            durationMs: performance.now() - startTime,
          };
        }
      },

      runSync(
        input: TStart,
        seed: DungeonSeed,
        options?: Omit<PipelineOptions, "signal">,
      ): PipelineResult<TCurrent> {
        const startTime = performance.now();
        const trace = createTraceCollector(config.trace ?? false);
        const streams = createRNGStreams(seed);
        const rng = new SeededRandom(seed.primary);
        const snapshots: PipelineSnapshot[] = [];
        const shouldCaptureSnapshots =
          options?.captureSnapshots ?? config.snapshots ?? false;

        const ctx: PassContext = {
          rng,
          streams,
          config,
          trace,
          seed,
        };

        let current: Artifact = input;
        const totalSteps = steps.length;

        try {
          for (let i = 0; i < steps.length; i++) {
            const step = steps[i];
            if (!step) continue;

            trace.start(step.pass.id);
            const stepStart = performance.now();

            const result = step.pass.run(current, ctx);

            // For sync execution, we don't await promises
            if (result instanceof Promise) {
              throw new Error(
                `Pass ${step.pass.id} returned a Promise in synchronous execution`,
              );
            }

            current = result;

            const stepDuration = performance.now() - stepStart;
            trace.end(step.pass.id, stepDuration);

            // Capture snapshot after each pass
            if (shouldCaptureSnapshots) {
              snapshots.push(captureSnapshot(current, step.pass.id, i));
            }

            // Emit lightweight metrics (much cheaper than snapshots)
            if (options?.onPassMetrics) {
              const metrics = collectPassMetrics(
                current,
                step.pass.id,
                i,
                stepDuration,
              );
              options.onPassMetrics(metrics);
            }

            if (options?.onProgress) {
              const progress = Math.round(((i + 1) / totalSteps) * 100);
              options.onProgress(progress, step.pass.id);
            }
          }

          return {
            success: true,
            artifact: current as TCurrent,
            trace: trace.getEvents(),
            snapshots: shouldCaptureSnapshots ? snapshots : undefined,
            durationMs: performance.now() - startTime,
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error : new Error(String(error)),
            trace: trace.getEvents(),
            snapshots: shouldCaptureSnapshots ? snapshots : undefined,
            durationMs: performance.now() - startTime,
          };
        }
      },
    };
  }
}

/**
 * Convenience function to create a pipeline
 */
export function createPipeline<TStart extends Artifact>(
  id: string,
  config: GenerationConfig,
): PipelineBuilder<TStart, TStart> {
  return PipelineBuilder.create<TStart>(id, config);
}
