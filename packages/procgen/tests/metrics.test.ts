/**
 * Metrics Collector Tests
 */

import { describe, expect, it } from "bun:test";
import { createSeed, generate } from "../src";
import { CellType } from "../src/core/grid/types";
import {
  collectMetrics,
  compareMetrics,
  formatMetrics,
} from "../src/metrics/collector";
import type {
  Connection,
  DungeonArtifact,
  Room,
  SpawnPoint,
} from "../src/pipeline/types";

function createMockArtifact(options: {
  width?: number;
  height?: number;
  rooms?: Room[];
  connections?: Connection[];
  spawns?: SpawnPoint[];
  terrain?: Uint8Array;
}): DungeonArtifact {
  const width = options.width ?? 40;
  const height = options.height ?? 30;

  const terrain =
    options.terrain ?? new Uint8Array(width * height).fill(CellType.FLOOR);

  return {
    width,
    height,
    terrain,
    rooms: options.rooms ?? [],
    connections: options.connections ?? [],
    spawns: options.spawns ?? [],
    checksum: "0000000000000000",
    seed: { numericValue: 0, stringValue: "test", timestamp: 0 },
  };
}

describe("collectMetrics", () => {
  it("collects metrics from empty dungeon", () => {
    const artifact = createMockArtifact({});

    const metrics = collectMetrics(artifact);

    expect(metrics.width).toBe(40);
    expect(metrics.height).toBe(30);
    expect(metrics.spatial.roomCount).toBe(0);
    expect(metrics.spatial.connectionCount).toBe(0);
    expect(metrics.connectivity.isFullyConnected).toBe(true);
    expect(metrics.content.totalSpawns).toBe(0);
  });

  it("calculates correct floor ratio", () => {
    const terrain = new Uint8Array(100).fill(CellType.WALL);
    // Set 25 tiles to floor
    for (let i = 0; i < 25; i++) {
      terrain[i] = CellType.FLOOR;
    }

    const artifact = createMockArtifact({ width: 10, height: 10, terrain });

    const metrics = collectMetrics(artifact);

    expect(metrics.spatial.floorRatio).toBe(0.25);
    expect(metrics.spatial.floorTileCount).toBe(25);
    expect(metrics.spatial.wallTileCount).toBe(75);
  });

  it("calculates room size statistics", () => {
    const rooms: Room[] = [
      {
        id: 0,
        x: 0,
        y: 0,
        width: 5,
        height: 5,
        centerX: 2,
        centerY: 2,
        type: "normal",
        seed: 0,
      },
      {
        id: 1,
        x: 10,
        y: 0,
        width: 10,
        height: 10,
        centerX: 15,
        centerY: 5,
        type: "normal",
        seed: 1,
      },
      {
        id: 2,
        x: 0,
        y: 10,
        width: 8,
        height: 8,
        centerX: 4,
        centerY: 14,
        type: "normal",
        seed: 2,
      },
    ];

    const artifact = createMockArtifact({ rooms });

    const metrics = collectMetrics(artifact);

    expect(metrics.spatial.roomCount).toBe(3);
    expect(metrics.spatial.roomSizes.min).toBe(25); // 5*5
    expect(metrics.spatial.roomSizes.max).toBe(100); // 10*10
    // (25 + 100 + 64) / 3 = 63
    expect(metrics.spatial.roomSizes.avg).toBe(63);
  });

  it("calculates connectivity metrics", () => {
    const rooms: Room[] = [
      {
        id: 0,
        x: 0,
        y: 0,
        width: 5,
        height: 5,
        centerX: 2,
        centerY: 2,
        type: "entrance",
        seed: 0,
      },
      {
        id: 1,
        x: 10,
        y: 0,
        width: 5,
        height: 5,
        centerX: 12,
        centerY: 2,
        type: "normal",
        seed: 1,
      },
      {
        id: 2,
        x: 20,
        y: 0,
        width: 5,
        height: 5,
        centerX: 22,
        centerY: 2,
        type: "exit",
        seed: 2,
      },
    ];

    const connections: Connection[] = [
      {
        fromRoomId: 0,
        toRoomId: 1,
        path: [
          { x: 5, y: 2 },
          { x: 10, y: 2 },
        ],
      },
      {
        fromRoomId: 1,
        toRoomId: 2,
        path: [
          { x: 15, y: 2 },
          { x: 20, y: 2 },
        ],
      },
    ];

    const artifact = createMockArtifact({ rooms, connections });

    const metrics = collectMetrics(artifact);

    expect(metrics.connectivity.isFullyConnected).toBe(true);
    expect(metrics.connectivity.diameter).toBe(2); // 0->1->2
    expect(metrics.connectivity.deadEndCount).toBe(2); // rooms 0 and 2 have degree 1
    expect(metrics.connectivity.hubCount).toBe(0); // no room has degree >= 3
  });

  it("counts spawns by type", () => {
    const spawns: SpawnPoint[] = [
      { type: "entrance", position: { x: 5, y: 5 } },
      { type: "exit", position: { x: 20, y: 20 } },
      { type: "enemy", position: { x: 10, y: 10 } },
      { type: "enemy", position: { x: 15, y: 15 } },
      { type: "treasure", position: { x: 8, y: 8 } },
    ];

    const artifact = createMockArtifact({ spawns });

    const metrics = collectMetrics(artifact);

    expect(metrics.content.totalSpawns).toBe(5);
    expect(metrics.content.spawnsByType.entrance).toBe(1);
    expect(metrics.content.spawnsByType.exit).toBe(1);
    expect(metrics.content.spawnsByType.enemy).toBe(2);
    expect(metrics.content.spawnsByType.treasure).toBe(1);
  });

  it("counts rooms by type", () => {
    const rooms: Room[] = [
      {
        id: 0,
        x: 0,
        y: 0,
        width: 5,
        height: 5,
        centerX: 2,
        centerY: 2,
        type: "entrance",
        seed: 0,
      },
      {
        id: 1,
        x: 10,
        y: 0,
        width: 5,
        height: 5,
        centerX: 12,
        centerY: 2,
        type: "normal",
        seed: 1,
      },
      {
        id: 2,
        x: 20,
        y: 0,
        width: 5,
        height: 5,
        centerX: 22,
        centerY: 2,
        type: "normal",
        seed: 2,
      },
      {
        id: 3,
        x: 30,
        y: 0,
        width: 5,
        height: 5,
        centerX: 32,
        centerY: 2,
        type: "exit",
        seed: 3,
      },
    ];

    const artifact = createMockArtifact({ rooms });

    const metrics = collectMetrics(artifact);

    expect(metrics.content.roomsByType.entrance).toBe(1);
    expect(metrics.content.roomsByType.normal).toBe(2);
    expect(metrics.content.roomsByType.exit).toBe(1);
  });

  it("detects disconnected graph", () => {
    const rooms: Room[] = [
      {
        id: 0,
        x: 0,
        y: 0,
        width: 5,
        height: 5,
        centerX: 2,
        centerY: 2,
        type: "normal",
        seed: 0,
      },
      {
        id: 1,
        x: 10,
        y: 0,
        width: 5,
        height: 5,
        centerX: 12,
        centerY: 2,
        type: "normal",
        seed: 1,
      },
      {
        id: 2,
        x: 20,
        y: 0,
        width: 5,
        height: 5,
        centerX: 22,
        centerY: 2,
        type: "normal",
        seed: 2,
      },
    ];

    const connections: Connection[] = [
      // Only connect 0 and 1, leaving 2 disconnected
      { fromRoomId: 0, toRoomId: 1, path: [], pathLength: 0 },
    ];

    const artifact = createMockArtifact({ rooms, connections });

    const metrics = collectMetrics(artifact);

    expect(metrics.connectivity.isFullyConnected).toBe(false);
  });
});

describe("formatMetrics", () => {
  it("produces readable output", () => {
    const artifact = createMockArtifact({});
    const metrics = collectMetrics(artifact);

    const formatted = formatMetrics(metrics);

    expect(formatted).toContain("Dungeon Metrics");
    expect(formatted).toContain("Dimensions: 40x30");
    expect(formatted).toContain("Spatial");
    expect(formatted).toContain("Connectivity");
    expect(formatted).toContain("Content");
  });
});

describe("compareMetrics", () => {
  it("identifies differences between metrics", () => {
    const artifact1 = createMockArtifact({
      rooms: [
        {
          id: 0,
          x: 0,
          y: 0,
          width: 5,
          height: 5,
          centerX: 2,
          centerY: 2,
          type: "normal",
          seed: 0,
        },
      ],
    });
    const artifact2 = createMockArtifact({
      rooms: [
        {
          id: 0,
          x: 0,
          y: 0,
          width: 5,
          height: 5,
          centerX: 2,
          centerY: 2,
          type: "normal",
          seed: 0,
        },
        {
          id: 1,
          x: 10,
          y: 0,
          width: 5,
          height: 5,
          centerX: 12,
          centerY: 2,
          type: "normal",
          seed: 1,
        },
      ],
    });

    const metrics1 = collectMetrics(artifact1);
    const metrics2 = collectMetrics(artifact2);

    const diff = compareMetrics(metrics1, metrics2);

    expect(diff["spatial.roomCount"]).toEqual({ a: 1, b: 2, diff: 1 });
  });

  it("returns empty for identical metrics", () => {
    const artifact = createMockArtifact({});
    const metrics = collectMetrics(artifact);

    const diff = compareMetrics(metrics, metrics);

    expect(Object.keys(diff)).toHaveLength(0);
  });
});

describe("integration with generator", () => {
  it("collects metrics from generated dungeon", () => {
    const result = generate({
      width: 80,
      height: 60,
      seed: createSeed(42),
      algorithm: "bsp",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    const metrics = collectMetrics(result.artifact);

    expect(metrics.spatial.roomCount).toBeGreaterThan(0);
    expect(metrics.spatial.connectionCount).toBeGreaterThan(0);
    expect(metrics.spatial.floorRatio).toBeGreaterThan(0);
    expect(metrics.connectivity.isFullyConnected).toBe(true);
    expect(metrics.content.spawnsByType.entrance).toBe(1);
    expect(metrics.content.spawnsByType.exit).toBe(1);
  });

  it("handles cellular automata dungeons", () => {
    const result = generate({
      width: 80,
      height: 60,
      seed: createSeed(42),
      algorithm: "cellular",
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    const metrics = collectMetrics(result.artifact);

    expect(metrics.spatial.roomCount).toBeGreaterThan(0);
    expect(metrics.spatial.floorRatio).toBeGreaterThan(0);
  });
});
