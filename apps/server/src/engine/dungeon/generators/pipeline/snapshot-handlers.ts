import {
  type PipelineSnapshot,
  PipelineSnapshotSchema,
} from "@rogue/contracts";
import type { Grid, Region } from "../../core/grid";
import type { ConnectionImpl } from "../../entities/connection";
import type { RoomImpl } from "../../entities/room";
import type { GenContext } from "./index";

/**
 * Type-safe snapshot constructors that replace dangerous `as const` assertions.
 * Each constructor validates the data structure at compile time.
 */
export const SnapshotConstructors = {
  /**
   * Create a grid snapshot with proper typing.
   */
  grid(stepId: string, grid: Grid): PipelineSnapshot {
    // Get raw data - copy to new Uint8Array for proper ArrayBuffer typing
    const rawData = grid.getRawData();
    const cells = new Uint8Array(rawData) as Uint8Array<ArrayBuffer>;
    return {
      kind: "grid",
      payload: {
        id: stepId,
        width: grid.width,
        height: grid.height,
        cells,
        encoding: "raw",
      },
    };
  },

  /**
   * Create a rooms snapshot with proper typing.
   */
  rooms(stepId: string, rooms: RoomImpl[]): PipelineSnapshot {
    return {
      kind: "rooms",
      payload: {
        id: stepId,
        rooms: rooms.map((r) => ({
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
        })),
      },
    };
  },

  /**
   * Create a connections snapshot with proper typing.
   */
  connections(
    stepId: string,
    rooms: RoomImpl[],
    connections: ConnectionImpl[],
  ): PipelineSnapshot {
    return {
      kind: "connections",
      payload: {
        id: stepId,
        connections: connections.map((c) => ({
          from: Math.max(0, rooms.indexOf(c.from as RoomImpl)),
          to: Math.max(0, rooms.indexOf(c.to as RoomImpl)),
          path: c.path.map((p) => ({ x: p.x, y: p.y })),
        })),
      },
    };
  },

  /**
   * Create a regions snapshot with proper typing.
   */
  regions(stepId: string, regions: Region[]): PipelineSnapshot {
    return {
      kind: "regions",
      payload: {
        id: stepId,
        regions: regions.map((r) => ({
          id: r.id,
          size: r.size,
        })),
      },
    };
  },
} as const;

/**
 * Handler function type for processing specific write operations.
 */
export type SnapshotHandler = (
  stepId: string,
  ctx: GenContext,
) => PipelineSnapshot | null;

/**
 * Registry for snapshot handlers.
 * Allows decoupling and extensibility of snapshot generation.
 */
class SnapshotHandlerRegistry {
  private handlers = new Map<string, SnapshotHandler>();

  constructor() {
    this.registerDefaults();
  }

  /**
   * Register default handlers for built-in write operations.
   */
  private registerDefaults(): void {
    this.register("grid.base", (stepId, ctx) => {
      const grid = ctx.grid.base;
      if (!grid) return null;
      return SnapshotConstructors.grid(stepId, grid);
    });

    this.register("graphs.rooms", (stepId, ctx) => {
      const rooms = ctx.graphs.rooms;
      if (!rooms || rooms.length === 0) return null;
      return SnapshotConstructors.rooms(stepId, rooms);
    });

    this.register("graphs.connections", (stepId, ctx) => {
      const rooms = ctx.graphs.rooms;
      const connections = ctx.graphs.connections;
      if (!connections || connections.length === 0) return null;
      return SnapshotConstructors.connections(stepId, rooms, connections);
    });

    this.register("graphs.regions", (stepId, ctx) => {
      const regions = ctx.graphs.regions;
      if (!regions || regions.length === 0) return null;
      return SnapshotConstructors.regions(stepId, regions);
    });
  }

  /**
   * Register a custom snapshot handler for a write key.
   */
  register(writeKey: string, handler: SnapshotHandler): void {
    this.handlers.set(writeKey, handler);
  }

  /**
   * Unregister a handler.
   */
  unregister(writeKey: string): boolean {
    return this.handlers.delete(writeKey);
  }

  /**
   * Get a handler for a specific write key.
   */
  get(writeKey: string): SnapshotHandler | undefined {
    return this.handlers.get(writeKey);
  }

  /**
   * Check if a handler is registered.
   */
  has(writeKey: string): boolean {
    return this.handlers.has(writeKey);
  }

  /**
   * Get all registered write keys.
   */
  keys(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Generate snapshots for a set of writes.
   * Returns validated snapshots ready for emission.
   */
  generateSnapshots(
    stepId: string,
    writes: string[],
    ctx: GenContext,
  ): PipelineSnapshot[] {
    const snapshots: PipelineSnapshot[] = [];

    for (const writeKey of writes) {
      const handler = this.handlers.get(writeKey);
      if (!handler) continue;

      const snapshot = handler(stepId, ctx);
      if (!snapshot) continue;

      // Validate against schema for runtime safety
      const parsed = PipelineSnapshotSchema.safeParse(snapshot);
      if (parsed.success) {
        snapshots.push(parsed.data);
      }
    }

    return snapshots;
  }
}

/**
 * Global snapshot handler registry instance.
 * Can be replaced with dependency injection if needed.
 */
export const snapshotHandlerRegistry = new SnapshotHandlerRegistry();

/**
 * Register a custom snapshot handler.
 */
export function registerSnapshotHandler(
  writeKey: string,
  handler: SnapshotHandler,
): void {
  snapshotHandlerRegistry.register(writeKey, handler);
}

/**
 * Unregister a snapshot handler.
 */
export function unregisterSnapshotHandler(writeKey: string): boolean {
  return snapshotHandlerRegistry.unregister(writeKey);
}
