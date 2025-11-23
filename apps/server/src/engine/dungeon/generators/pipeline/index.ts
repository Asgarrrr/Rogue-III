import {
  type PipelineSnapshot,
  type ProgressEvent,
  ProgressEventSchema,
} from "@rogue/contracts";
import { performance } from "node:perf_hooks";
import type { Grid, Region } from "../../core/grid";
import type { DungeonConfig } from "../../core/types";
import type { ConnectionImpl } from "../../entities/connection";
import type { RoomImpl } from "../../entities/room";
import { snapshotHandlerRegistry } from "./snapshot-handlers";

export type { SnapshotHandler } from "./snapshot-handlers";
// Re-export snapshot handler utilities
export {
  registerSnapshotHandler,
  SnapshotConstructors,
  snapshotHandlerRegistry,
  unregisterSnapshotHandler,
} from "./snapshot-handlers";

export interface GenContext {
  grid: { base: Grid; layers: Map<string, Grid> };
  graphs: {
    rooms: RoomImpl[];
    connections: ConnectionImpl[];
    regions: Region[];
  };
  config: DungeonConfig;
  meta: Map<string, unknown>;
}

export interface StepIO {
  reads: string[];
  writes: string[];
}

export interface PipelineStep {
  id: string;
  io: StepIO;
  dependsOn?: string[];
  parallelizable?: boolean;
  canRun?(ctx: GenContext): boolean;
  run(ctx: GenContext, signal?: AbortSignal): Promise<void> | void;
}

export interface Pipeline {
  steps: PipelineStep[];
}

export interface RunnerOptions {
  cache?: boolean;
  onProgress?(progress: number, stepId: string): void;
  onSnapshot?(stepId: string, ctx: GenContext): void;
  onProgressEvent?(event: ProgressEvent): void;
  onSnapshotEvent?(event: PipelineSnapshot): void;
}

/**
 * Context-local pipeline handlers.
 * Stored per-runner instance instead of global state.
 */
export interface PipelineHandlers {
  onProgressEvent?: (event: ProgressEvent) => void;
  onSnapshotEvent?: (event: PipelineSnapshot) => void;
}

/**
 * WeakMap to store handlers per PipelineRunner instance.
 * This avoids global mutable state while allowing handler configuration.
 */
const runnerHandlers = new WeakMap<PipelineRunner, PipelineHandlers>();

/**
 * Set handlers for a specific pipeline runner instance.
 * Replaces global state with instance-specific handlers.
 */
export function setPipelineHandlers(
  runner: PipelineRunner,
  handlers: PipelineHandlers,
): void {
  runnerHandlers.set(runner, handlers);
}

/**
 * Get handlers for a specific pipeline runner instance.
 */
export function getPipelineHandlers(
  runner: PipelineRunner,
): PipelineHandlers | undefined {
  return runnerHandlers.get(runner);
}

export class PipelineRunner {
  private readonly pipeline: Pipeline;
  private readonly opts: RunnerOptions;
  private readonly startedAt: number;

  constructor(pipeline: Pipeline, opts: RunnerOptions = {}) {
    this.pipeline = pipeline;
    this.opts = opts;
    this.startedAt = performance.now();
  }

  async run(ctx: GenContext, signal?: AbortSignal) {
    const steps = this.toposort(this.pipeline.steps);
    const total = steps.length;
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      this.assertWrites(step);
      if (signal?.aborted) throw new Error("Pipeline aborted");
      const stepStart = performance.now();
      if (step.canRun && !step.canRun(ctx)) {
        const progress = ((i + 1) / total) * 100;
        this.emitProgress(step.id, progress, {
          stepIndex: i,
          totalSteps: total,
          durationMs: performance.now() - stepStart,
          elapsedMs: performance.now() - this.startedAt,
        });
        continue;
      }
      await step.run(ctx, signal);
      this.emitSnapshots(step, ctx);
      const progress = ((i + 1) / total) * 100;
      this.emitProgress(step.id, progress, {
        stepIndex: i,
        totalSteps: total,
        durationMs: performance.now() - stepStart,
        elapsedMs: performance.now() - this.startedAt,
      });
    }
  }

  runSync(ctx: GenContext, signal?: AbortSignal) {
    const steps = this.toposort(this.pipeline.steps);
    const total = steps.length;
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      this.assertWrites(step);
      if (signal?.aborted) throw new Error("Pipeline aborted");
      const stepStart = performance.now();
      if (step.canRun && !step.canRun(ctx)) {
        const progress = ((i + 1) / total) * 100;
        this.emitProgress(step.id, progress, {
          stepIndex: i,
          totalSteps: total,
          durationMs: performance.now() - stepStart,
          elapsedMs: performance.now() - this.startedAt,
        });
        continue;
      }
      const ret = step.run(ctx, signal);
      // Intentionally do not await; synchronous execution expected here
      void ret;
      this.emitSnapshots(step, ctx);
      const progress = ((i + 1) / total) * 100;
      this.emitProgress(step.id, progress, {
        stepIndex: i,
        totalSteps: total,
        durationMs: performance.now() - stepStart,
        elapsedMs: performance.now() - this.startedAt,
      });
    }
  }

  private toposort(steps: PipelineStep[]): PipelineStep[] {
    const idToStep = new Map(steps.map((s) => [s.id, s] as const));
    const visited = new Set<string>();
    const temp = new Set<string>();
    const order: PipelineStep[] = [];
    const visit = (id: string) => {
      if (visited.has(id)) return;
      if (temp.has(id)) throw new Error(`Cycle in pipeline at ${id}`);
      temp.add(id);
      const s = idToStep.get(id);
      if (!s) throw new Error(`Unknown step ${id}`);
      for (const dep of s.dependsOn ?? []) visit(dep);
      temp.delete(id);
      visited.add(id);
      order.push(s);
    };
    for (const s of steps) visit(s.id);
    return order;
  }

  private emitProgress(
    stepId: string,
    progress: number,
    meta?: {
      stepIndex?: number;
      totalSteps?: number;
      durationMs?: number;
      elapsedMs?: number;
    },
  ) {
    // Back-compat callback
    this.opts.onProgress?.(progress, stepId);
    // Structured event callback
    const candidate: ProgressEvent = {
      stepId,
      progress,
      ...meta,
    } as ProgressEvent;
    const parsed = ProgressEventSchema.safeParse(candidate);
    if (parsed.success) {
      this.opts.onProgressEvent?.(parsed.data);

      // Instance-specific handlers
      const instanceHandlers = runnerHandlers.get(this);
      instanceHandlers?.onProgressEvent?.(parsed.data);
    }
  }

  private emitSnapshots(step: PipelineStep, ctx: GenContext) {
    // Back-compat callback
    this.opts.onSnapshot?.(step.id, ctx);

    const writes = step.io?.writes ?? [];

    // Use handler registry for type-safe snapshot generation
    const snapshots = snapshotHandlerRegistry.generateSnapshots(
      step.id,
      writes,
      ctx,
    );

    // Emit snapshots through configured handlers
    const instanceHandlers = runnerHandlers.get(this);

    for (const snap of snapshots) {
      this.opts.onSnapshotEvent?.(snap);
      instanceHandlers?.onSnapshotEvent?.(snap);
    }
  }

  // Dev-time discipline: ensure steps declare writes if they mutate known resources
  private assertWrites(step: PipelineStep) {
    if (process.env.NODE_ENV === "production") return;
    const writes = new Set(step.io?.writes ?? []);
    const known = [
      "grid.base",
      "graphs.rooms",
      "graphs.connections",
      "graphs.regions",
    ];
    // If a step reads but never writes, it's fine. If a step mutates these without declaring writes,
    // we can't know at this point; we encourage explicit writes for snapshot accuracy.
    for (const _key of known) {
      // Soft assertion: require steps that likely mutate to declare writes based on id heuristics
      if (
        step.id.includes("compose") ||
        step.id.includes("paths") ||
        step.id.includes("grid")
      ) {
        // These steps usually mutate grid or graphs
        if (
          !writes.has("grid.base") &&
          !writes.has("graphs.rooms") &&
          !writes.has("graphs.connections") &&
          !writes.has("graphs.regions")
        ) {
          // eslint-disable-next-line no-console
          console.warn(
            `[pipeline] Step '${step.id}' has no io.writes declared; snapshots may be incomplete.`,
          );
        }
        break;
      }
    }
  }
}
