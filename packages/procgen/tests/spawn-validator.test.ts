/**
 * Spawn Validator Tests
 */

import { describe, expect, it } from "bun:test";
import { Grid } from "../src/core/grid/grid";
import { CellType } from "../src/core/grid/types";
import {
  findNearestFloorForSpawn,
  revalidateSpawns,
  validateAndFixSpawns,
} from "../src/pipeline/spawn-validator";
import type { DungeonArtifact, SpawnPoint } from "../src/pipeline/types";

function createTestDungeon(
  width: number,
  height: number,
  terrain: Uint8Array,
  spawns: SpawnPoint[],
): DungeonArtifact {
  return {
    width,
    height,
    terrain,
    rooms: [],
    connections: [],
    spawns,
    checksum: "0000000000000000",
    seed: { numericValue: 0, stringValue: "test", timestamp: 0 },
  };
}

describe("findNearestFloorForSpawn", () => {
  it("returns same position if already on floor", () => {
    const grid = new Grid(10, 10, CellType.WALL);
    grid.set(5, 5, CellType.FLOOR);

    const result = findNearestFloorForSpawn(grid, 5, 5);

    expect(result).toEqual({ x: 5, y: 5 });
  });

  it("finds nearest floor tile", () => {
    const grid = new Grid(10, 10, CellType.WALL);
    grid.set(5, 5, CellType.FLOOR);

    const result = findNearestFloorForSpawn(grid, 3, 5);

    expect(result).toEqual({ x: 5, y: 5 });
  });

  it("returns null when no floor within distance", () => {
    const grid = new Grid(10, 10, CellType.WALL);
    grid.set(9, 9, CellType.FLOOR);

    const result = findNearestFloorForSpawn(grid, 0, 0, 5);

    expect(result).toBeNull();
  });

  it("respects maxDistance parameter", () => {
    const grid = new Grid(20, 20, CellType.WALL);
    grid.set(15, 15, CellType.FLOOR);

    const result1 = findNearestFloorForSpawn(grid, 0, 0, 5);
    const result2 = findNearestFloorForSpawn(grid, 0, 0, 30);

    expect(result1).toBeNull();
    expect(result2).not.toBeNull();
  });

  it("finds closest of multiple floor tiles", () => {
    const grid = new Grid(10, 10, CellType.WALL);
    grid.set(2, 5, CellType.FLOOR);
    grid.set(8, 5, CellType.FLOOR);

    const result = findNearestFloorForSpawn(grid, 5, 5);

    // Should find x=2 (distance 3) instead of x=8 (distance 3)
    // BFS will find whichever comes first in search order
    expect(result).not.toBeNull();
  });
});

describe("validateAndFixSpawns", () => {
  it("keeps valid spawns unchanged", () => {
    const terrain = new Uint8Array(100).fill(CellType.WALL);
    terrain[55] = CellType.FLOOR; // (5, 5)

    const spawns: SpawnPoint[] = [
      { type: "entrance", position: { x: 5, y: 5 } },
    ];

    const dungeon = createTestDungeon(10, 10, terrain, spawns);
    const result = validateAndFixSpawns(dungeon);

    expect(result.validSpawns).toHaveLength(1);
    expect(result.invalidCount).toBe(0);
    expect(result.relocatedCount).toBe(0);
    expect(result.removedCount).toBe(0);
  });

  it("relocates invalid spawn to nearest floor", () => {
    const terrain = new Uint8Array(100).fill(CellType.WALL);
    terrain[55] = CellType.FLOOR; // (5, 5)

    const spawns: SpawnPoint[] = [
      { type: "entrance", position: { x: 3, y: 5 } }, // On wall, floor nearby
    ];

    const dungeon = createTestDungeon(10, 10, terrain, spawns);
    const result = validateAndFixSpawns(dungeon);

    expect(result.validSpawns).toHaveLength(1);
    expect(result.validSpawns[0]?.position).toEqual({ x: 5, y: 5 });
    expect(result.invalidCount).toBe(1);
    expect(result.relocatedCount).toBe(1);
  });

  it("removes spawn when no floor nearby", () => {
    const terrain = new Uint8Array(100).fill(CellType.WALL);
    terrain[99] = CellType.FLOOR; // (9, 9) - far from spawn

    const spawns: SpawnPoint[] = [
      { type: "entrance", position: { x: 0, y: 0 } },
    ];

    const dungeon = createTestDungeon(10, 10, terrain, spawns);
    const result = validateAndFixSpawns(dungeon, { maxRelocationDistance: 5 });

    expect(result.validSpawns).toHaveLength(0);
    expect(result.invalidCount).toBe(1);
    expect(result.removedCount).toBe(1);
  });

  it("respects relocateInvalid option", () => {
    const terrain = new Uint8Array(100).fill(CellType.WALL);
    terrain[55] = CellType.FLOOR; // (5, 5)

    const spawns: SpawnPoint[] = [
      { type: "entrance", position: { x: 3, y: 5 } },
    ];

    const dungeon = createTestDungeon(10, 10, terrain, spawns);
    const result = validateAndFixSpawns(dungeon, { relocateInvalid: false });

    expect(result.validSpawns).toHaveLength(0);
    expect(result.removedCount).toBe(1);
  });

  it("handles multiple spawns", () => {
    const terrain = new Uint8Array(100).fill(CellType.WALL);
    terrain[55] = CellType.FLOOR; // (5, 5)
    terrain[66] = CellType.FLOOR; // (6, 6)

    const spawns: SpawnPoint[] = [
      { type: "entrance", position: { x: 5, y: 5 } }, // Valid
      { type: "exit", position: { x: 3, y: 3 } }, // Invalid, needs relocation
      { type: "enemy", position: { x: 6, y: 6 } }, // Valid
    ];

    const dungeon = createTestDungeon(10, 10, terrain, spawns);
    const result = validateAndFixSpawns(dungeon);

    expect(result.validSpawns).toHaveLength(3);
    expect(result.invalidCount).toBe(1);
    expect(result.relocatedCount).toBe(1);
  });

  it("preserves spawn metadata during relocation", () => {
    const terrain = new Uint8Array(100).fill(CellType.WALL);
    terrain[55] = CellType.FLOOR; // (5, 5)

    const spawns: SpawnPoint[] = [
      {
        type: "enemy",
        position: { x: 3, y: 5 },
        data: { level: 5, name: "Goblin" },
      },
    ];

    const dungeon = createTestDungeon(10, 10, terrain, spawns);
    const result = validateAndFixSpawns(dungeon);

    expect(result.validSpawns[0]?.type).toBe("enemy");
    expect(result.validSpawns[0]?.data).toEqual({ level: 5, name: "Goblin" });
  });
});

describe("revalidateSpawns", () => {
  it("returns new dungeon with fixed spawns", () => {
    const terrain = new Uint8Array(100).fill(CellType.WALL);
    terrain[55] = CellType.FLOOR; // (5, 5)

    const spawns: SpawnPoint[] = [
      { type: "entrance", position: { x: 3, y: 5 } },
    ];

    const dungeon = createTestDungeon(10, 10, terrain, spawns);
    const result = revalidateSpawns(dungeon);

    expect(result.spawns).toHaveLength(1);
    expect(result.spawns[0]?.position).toEqual({ x: 5, y: 5 });
    // Original dungeon unchanged
    expect(dungeon.spawns[0]?.position).toEqual({ x: 3, y: 5 });
  });

  it("preserves other dungeon properties", () => {
    const terrain = new Uint8Array(100).fill(CellType.FLOOR);
    const dungeon = createTestDungeon(10, 10, terrain, []);

    const result = revalidateSpawns(dungeon);

    expect(result.width).toBe(dungeon.width);
    expect(result.height).toBe(dungeon.height);
    expect(result.terrain).toBe(dungeon.terrain);
    expect(result.checksum).toBe(dungeon.checksum);
  });
});
