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
  FullPassContext,
  GenerationConfig,
  Pass,
  PassContext,
  PassMetrics,
  Pipeline,
  PipelineOptions,
  PipelineResult,
  PipelineSnapshot,
  RNGStreamName,
  RNGStreams,
} from "./types";
import { validateConfig } from "./types";

/**
 * Internal pipeline step representation.
 * Uses RNGStreamName to accept passes with any stream requirements.
 */
interface PipelineStep {
  readonly pass: Pass<Artifact, Artifact, RNGStreamName>;
  readonly index: number;
}

/**
 * Create an AbortError that works across runtimes.
 * DOMException is not available in some Node runtimes.
 */
function createAbortError(message: string): Error {
  if (typeof DOMException !== "undefined") {
    return new DOMException(message, "AbortError");
  }
  const error = new Error(message);
  error.name = "AbortError";
  return error;
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
 * Type guard for DungeonStateArtifact
 */
function isDungeonStateArtifact(
  artifact: Artifact,
): artifact is DungeonStateArtifact {
  return artifact.type === "dungeon-state";
}

/**
 * Capture a snapshot of the current pipeline state
 */
function captureSnapshot(
  artifact: Artifact,
  passId: string,
  passIndex: number,
): PipelineSnapshot {
  if (isDungeonStateArtifact(artifact)) {
    return {
      passId,
      passIndex,
      timestamp: performance.now(),
      terrain: artifact.grid.getRawDataCopy(),
      roomCount: artifact.rooms.length,
      connectionCount: artifact.connections.length,
    };
  }

  // Non-dungeon-state artifacts: return minimal snapshot
  return {
    passId,
    passIndex,
    timestamp: performance.now(),
    terrain: undefined,
    roomCount: 0,
    connectionCount: 0,
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
  if (!isDungeonStateArtifact(artifact)) {
    return {
      passId,
      passIndex,
      durationMs,
      roomCount: 0,
      connectionCount: 0,
      spawnCount: 0,
      floorRatio: 0,
    };
  }

  const totalCells = artifact.grid.width * artifact.grid.height;
  const floorCells = artifact.grid.countCells(CellType.FLOOR);
  const floorRatio = totalCells > 0 ? floorCells / totalCells : 0;

  return {
    passId,
    passIndex,
    durationMs,
    roomCount: artifact.rooms.length,
    connectionCount: artifact.connections.length,
    spawnCount: artifact.spawns.length,
    floorRatio,
  };
}

/**
 * Common setup for pipeline execution
 */
interface PipelineExecutionSetup {
  readonly trace: ReturnType<typeof createTraceCollector>;
  readonly streams: RNGStreams;
  readonly rng: SeededRandom;
  readonly ctx: PassContext;
  readonly shouldCaptureSnapshots: boolean;
  readonly snapshots: PipelineSnapshot[];
  readonly startTime: number;
}

/**
 * Initialize common state for both sync and async execution
 */
function setupPipelineExecution(
  seed: DungeonSeed,
  config: GenerationConfig,
  options?: PipelineOptions | Omit<PipelineOptions, "signal">,
): PipelineExecutionSetup {
  const startTime = performance.now();
  // Validate config once at pipeline start - all passes get validated config
  const validatedConfig = validateConfig(config);
  const trace = createTraceCollector(validatedConfig.trace);
  const streams = createRNGStreams(seed);
  const rng = new SeededRandom(seed.primary);
  const snapshots: PipelineSnapshot[] = [];
  const shouldCaptureSnapshots =
    options?.captureSnapshots ?? validatedConfig.snapshots;

  const ctx: PassContext = {
    rng,
    streams,
    config: validatedConfig,
    trace,
    seed,
  };

  return {
    trace,
    streams,
    rng,
    ctx,
    shouldCaptureSnapshots,
    snapshots,
    startTime,
  };
}

/**
 * Handle common pass execution side effects (metrics, progress, snapshots)
 */
function handlePassSideEffects(
  current: Artifact,
  step: PipelineStep,
  stepIndex: number,
  stepDuration: number,
  totalSteps: number,
  snapshots: PipelineSnapshot[],
  shouldCaptureSnapshots: boolean,
  options?: PipelineOptions | Omit<PipelineOptions, "signal">,
): void {
  // Capture snapshot after each pass
  if (shouldCaptureSnapshots) {
    snapshots.push(captureSnapshot(current, step.pass.id, stepIndex));
  }

  // Emit lightweight metrics (much cheaper than snapshots)
  if (options?.onPassMetrics) {
    const metrics = collectPassMetrics(
      current,
      step.pass.id,
      stepIndex,
      stepDuration,
    );
    options.onPassMetrics(metrics);
  }

  if (options?.onProgress) {
    const progress = Math.round(((stepIndex + 1) / totalSteps) * 100);
    options.onProgress(progress, step.pass.id);
  }
}

/**
 * Create a scoped context for a pass based on its requiredStreams.
 *
 * The generic TStreams parameter preserves the stream type from the pass,
 * allowing TypeScript to enforce that passes only access declared streams.
 */
function createScopedContext<TStreams extends RNGStreamName>(
  fullCtx: FullPassContext,
  requiredStreams: readonly TStreams[],
): PassContext<TStreams> {
  // Empty streams = pass doesn't use RNG, return empty streams object
  if (requiredStreams.length === 0) {
    return {
      ...fullCtx,
      streams: {} as Pick<RNGStreams, TStreams>,
    };
  }

  // Create scoped streams object with only the required streams
  const scopedStreams = {} as Pick<RNGStreams, TStreams>;
  for (const streamName of requiredStreams) {
    (scopedStreams as Record<string, SeededRandom>)[streamName] =
      fullCtx.streams[streamName];
  }

  return {
    ...fullCtx,
    streams: scopedStreams,
  };
}

/**
 * Core pipeline execution logic - runs the pass loop.
 * Returns the artifact and whether we encountered an async pass.
 */
function executePasses(
  steps: readonly PipelineStep[],
  input: Artifact,
  ctx: FullPassContext,
  trace: ReturnType<typeof createTraceCollector>,
  snapshots: PipelineSnapshot[],
  shouldCaptureSnapshots: boolean,
  options: PipelineOptions | Omit<PipelineOptions, "signal"> | undefined,
  checkAbort: boolean,
): {
  current: Artifact;
  asyncResult?: Promise<Artifact>;
  stepIndex: number;
  step?: PipelineStep;
} {
  let current: Artifact = input;
  const totalSteps = steps.length;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    if (!step) continue;

    // Check for abort signal
    if (checkAbort && (options as PipelineOptions)?.signal?.aborted) {
      throw createAbortError("Pipeline aborted");
    }

    // Create scoped context for this pass
    const scopedCtx = createScopedContext(ctx, step.pass.requiredStreams);

    trace.start(step.pass.id);
    const stepStart = performance.now();

    const result = step.pass.run(current, scopedCtx);

    // If we get a Promise, return it for async handling
    if (result instanceof Promise) {
      return {
        current,
        asyncResult: result,
        stepIndex: i,
        step,
      };
    }

    current = result;

    const stepDuration = performance.now() - stepStart;
    trace.end(step.pass.id, stepDuration);

    handlePassSideEffects(
      current,
      step,
      i,
      stepDuration,
      totalSteps,
      snapshots,
      shouldCaptureSnapshots,
      options,
    );
  }

  return { current, stepIndex: steps.length };
}

/**
 * Build successful result
 */
function buildSuccessResult<TCurrent extends Artifact>(
  current: Artifact,
  trace: ReturnType<typeof createTraceCollector>,
  snapshots: PipelineSnapshot[],
  shouldCaptureSnapshots: boolean,
  startTime: number,
): PipelineResult<TCurrent> {
  return {
    success: true,
    artifact: current as TCurrent,
    trace: trace.getEvents(),
    snapshots: shouldCaptureSnapshots ? snapshots : [],
    durationMs: performance.now() - startTime,
  };
}

/**
 * Build error result
 */
function buildErrorResult<TCurrent extends Artifact>(
  error: unknown,
  stepIndex: number,
  step: PipelineStep | undefined,
  trace: ReturnType<typeof createTraceCollector>,
  snapshots: PipelineSnapshot[],
  shouldCaptureSnapshots: boolean,
  startTime: number,
): PipelineResult<TCurrent> {
  const originalError =
    error instanceof Error ? error : new Error(String(error));

  // Preserve AbortError without wrapping
  if (originalError.name === "AbortError") {
    return {
      success: false,
      error: originalError,
      trace: trace.getEvents(),
      snapshots: shouldCaptureSnapshots ? snapshots : [],
      durationMs: performance.now() - startTime,
    };
  }

  const passId = step?.pass.id ?? "unknown";
  const enhancedError = new Error(
    `Pipeline failed at step ${stepIndex} (pass: ${passId}): ${originalError.message}`,
  );
  enhancedError.cause = originalError;

  return {
    success: false,
    error: enhancedError,
    trace: trace.getEvents(),
    snapshots: shouldCaptureSnapshots ? snapshots : [],
    durationMs: performance.now() - startTime,
  };
}

/**
 * Synchronous pipeline execution.
 */
function runPipelineSync<TStart extends Artifact, TCurrent extends Artifact>(
  steps: readonly PipelineStep[],
  input: TStart,
  seed: DungeonSeed,
  config: GenerationConfig,
  options?: Omit<PipelineOptions, "signal">,
): PipelineResult<TCurrent> {
  const { trace, ctx, snapshots, shouldCaptureSnapshots, startTime } =
    setupPipelineExecution(seed, config, options);

  try {
    const result = executePasses(
      steps,
      input,
      ctx,
      trace,
      snapshots,
      shouldCaptureSnapshots,
      options,
      false, // no abort checking in sync mode
    );

    // If we got an async result, that's an error in sync mode
    if (result.asyncResult) {
      throw new Error(
        `Pass ${result.step?.pass.id} returned a Promise in synchronous execution. ` +
          `Use generateAsync() or pipeline.run() for async passes.`,
      );
    }

    return buildSuccessResult<TCurrent>(
      result.current,
      trace,
      snapshots,
      shouldCaptureSnapshots,
      startTime,
    );
  } catch (error) {
    return buildErrorResult<TCurrent>(
      error,
      -1,
      undefined,
      trace,
      snapshots,
      shouldCaptureSnapshots,
      startTime,
    );
  }
}

/**
 * Asynchronous pipeline execution.
 */
async function runPipelineAsync<
  TStart extends Artifact,
  TCurrent extends Artifact,
>(
  steps: readonly PipelineStep[],
  input: TStart,
  seed: DungeonSeed,
  config: GenerationConfig,
  options?: PipelineOptions,
): Promise<PipelineResult<TCurrent>> {
  const { trace, ctx, snapshots, shouldCaptureSnapshots, startTime } =
    setupPipelineExecution(seed, config, options);

  try {
    let current: Artifact = input;
    let startIndex = 0;
    const totalSteps = steps.length;

    // Loop to handle async passes - resume from where we left off
    while (startIndex < steps.length) {
      // Run sync portion
      const remainingSteps = steps.slice(startIndex);
      const result = executePasses(
        remainingSteps,
        current,
        ctx,
        trace,
        snapshots,
        shouldCaptureSnapshots,
        options,
        true, // check abort in async mode
      );

      // If we hit an async pass, await it and continue
      if (result.asyncResult && result.step) {
        const stepStart = performance.now();
        current = await result.asyncResult;
        const stepDuration = performance.now() - stepStart;

        trace.end(result.step.pass.id, stepDuration);
        handlePassSideEffects(
          current,
          result.step,
          startIndex + result.stepIndex,
          stepDuration,
          totalSteps,
          snapshots,
          shouldCaptureSnapshots,
          options,
        );

        startIndex = startIndex + result.stepIndex + 1;
      } else {
        // All done
        current = result.current;
        break;
      }
    }

    return buildSuccessResult<TCurrent>(
      current,
      trace,
      snapshots,
      shouldCaptureSnapshots,
      startTime,
    );
  } catch (error) {
    return buildErrorResult<TCurrent>(
      error,
      -1,
      undefined,
      trace,
      snapshots,
      shouldCaptureSnapshots,
      startTime,
    );
  }
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
   * Add a pass to the pipeline.
   * Accepts passes with any RNG stream requirements.
   */
  pipe<TNext extends Artifact, TStreams extends RNGStreamName = never>(
    pass: Pass<TCurrent, TNext, TStreams>,
  ): PipelineBuilder<TStart, TNext> {
    const newSteps = [
      ...this.steps,
      {
        pass: pass as Pass<Artifact, Artifact, RNGStreamName>,
        index: this.steps.length,
      },
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
  when<TNext extends Artifact, TStreams extends RNGStreamName = never>(
    condition: (config: GenerationConfig) => boolean,
    pass: Pass<TCurrent, TNext, TStreams>,
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

      run(
        input: TStart,
        seed: DungeonSeed,
        options?: PipelineOptions,
      ): Promise<PipelineResult<TCurrent>> {
        return runPipelineAsync<TStart, TCurrent>(
          steps,
          input,
          seed,
          config,
          options,
        );
      },

      runSync(
        input: TStart,
        seed: DungeonSeed,
        options?: Omit<PipelineOptions, "signal">,
      ): PipelineResult<TCurrent> {
        return runPipelineSync<TStart, TCurrent>(
          steps,
          input,
          seed,
          config,
          options,
        );
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
