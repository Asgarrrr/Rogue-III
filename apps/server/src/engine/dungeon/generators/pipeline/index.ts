import {
  type PipelineSnapshot,
  PipelineSnapshotSchema,
  type ProgressEvent,
  ProgressEventSchema,
} from "@rogue/contracts";
import type { Grid, Region } from "../../core/grid";
import type { DungeonConfig } from "../../core/types";
import type { ConnectionImpl } from "../../entities/connection";
import type { RoomImpl } from "../../entities/room";

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

// Optional global observers (useful for CLI/demo without plumbing options through)
let GLOBAL_ON_PROGRESS_EVENT: ((event: ProgressEvent) => void) | undefined;
let GLOBAL_ON_SNAPSHOT_EVENT: ((event: PipelineSnapshot) => void) | undefined;

export function setGlobalPipelineHandlers(handlers: {
  onProgressEvent?: (event: ProgressEvent) => void;
  onSnapshotEvent?: (event: PipelineSnapshot) => void;
}) {
  GLOBAL_ON_PROGRESS_EVENT = handlers.onProgressEvent;
  GLOBAL_ON_SNAPSHOT_EVENT = handlers.onSnapshotEvent;
}

export class PipelineRunner {
  private readonly pipeline: Pipeline;
  private readonly opts: RunnerOptions;
  constructor(pipeline: Pipeline, opts: RunnerOptions = {}) {
    this.pipeline = pipeline;
    this.opts = opts;
  }

  async run(ctx: GenContext, signal?: AbortSignal) {
    const steps = this.toposort(this.pipeline.steps);
    const total = steps.length;
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      this.assertWrites(step);
      if (signal?.aborted) throw new Error("Pipeline aborted");
      if (step.canRun && !step.canRun(ctx)) {
        const progress = ((i + 1) / total) * 100;
        this.emitProgress(step.id, progress);
        continue;
      }
      await step.run(ctx, signal);
      this.emitSnapshots(step, ctx);
      const progress = ((i + 1) / total) * 100;
      this.emitProgress(step.id, progress);
    }
  }

  runSync(ctx: GenContext, signal?: AbortSignal) {
    const steps = this.toposort(this.pipeline.steps);
    const total = steps.length;
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      this.assertWrites(step);
      if (signal?.aborted) throw new Error("Pipeline aborted");
      if (step.canRun && !step.canRun(ctx)) {
        const progress = ((i + 1) / total) * 100;
        this.emitProgress(step.id, progress);
        continue;
      }
      const ret = step.run(ctx, signal);
      // Intentionally do not await; synchronous execution expected here
      void ret;
      this.emitSnapshots(step, ctx);
      const progress = ((i + 1) / total) * 100;
      this.emitProgress(step.id, progress);
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

  private emitProgress(stepId: string, progress: number) {
    // Back-compat callback
    this.opts.onProgress?.(progress, stepId);
    // Structured event callback
    const candidate: ProgressEvent = { stepId, progress } as ProgressEvent;
    const parsed = ProgressEventSchema.safeParse(candidate);
    if (parsed.success) {
      this.opts.onProgressEvent?.(parsed.data);
      GLOBAL_ON_PROGRESS_EVENT?.(parsed.data);
    }
  }

  private emitSnapshots(step: PipelineStep, ctx: GenContext) {
    // Back-compat callback
    this.opts.onSnapshot?.(step.id, ctx);

    const writes = step.io?.writes ?? [];
    const snapshots: PipelineSnapshot[] = [];

    if (writes.includes("grid.base")) {
      const grid = ctx.grid.base;
      const cells = grid.getRawData(); // Uint8Array of 0/1 already
      const candidate = {
        kind: "grid",
        payload: {
          id: step.id,
          width: grid.width,
          height: grid.height,
          cells,
          encoding: "raw",
        },
      } as const;
      const parsed = PipelineSnapshotSchema.safeParse(candidate);
      if (parsed.success) snapshots.push(parsed.data);
    }

    if (writes.includes("graphs.rooms")) {
      const rooms = ctx.graphs.rooms.map((r) => ({
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
      }));
      const candidate = {
        kind: "rooms",
        payload: { id: step.id, rooms },
      } as const;
      const parsed = PipelineSnapshotSchema.safeParse(candidate);
      if (parsed.success) snapshots.push(parsed.data);
    }

    if (writes.includes("graphs.connections")) {
      const rooms = ctx.graphs.rooms;
      const connections = ctx.graphs.connections.map((c) => ({
        from: Math.max(0, rooms.indexOf(c.from as RoomImpl)),
        to: Math.max(0, rooms.indexOf(c.to as RoomImpl)),
        path: c.path.map((p) => ({ x: p.x, y: p.y })),
      }));
      const candidate = {
        kind: "connections",
        payload: { id: step.id, connections },
      } as const;
      const parsed = PipelineSnapshotSchema.safeParse(candidate);
      if (parsed.success) snapshots.push(parsed.data);
    }

    if (writes.includes("graphs.regions")) {
      const regions = ctx.graphs.regions.map((r) => ({
        id: r.id,
        size: r.size,
      }));
      const candidate = {
        kind: "regions",
        payload: { id: step.id, regions },
      } as const;
      const parsed = PipelineSnapshotSchema.safeParse(candidate);
      if (parsed.success) snapshots.push(parsed.data);
    }

    for (const snap of snapshots) {
      this.opts.onSnapshotEvent?.(snap);
      GLOBAL_ON_SNAPSHOT_EVENT?.(snap);
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
