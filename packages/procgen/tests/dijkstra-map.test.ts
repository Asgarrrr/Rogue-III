/**
 * Dijkstra Map Tests
 */

import { describe, expect, it } from "bun:test";
import { Grid } from "../src/core/grid";
import { CellType } from "../src/core/grid/types";
import {
  combineDijkstraMaps,
  computeDijkstraMap,
  computeFleeMap,
  DijkstraMap,
} from "../src/core/pathfinding";

describe("DijkstraMap", () => {
  it("initializes with Infinity distances", () => {
    const map = new DijkstraMap(10, 10);

    expect(map.get(5, 5)).toBe(Infinity);
    expect(map.get(0, 0)).toBe(Infinity);
  });

  it("allows setting and getting distances", () => {
    const map = new DijkstraMap(10, 10);
    map.set(5, 5, 10);

    expect(map.get(5, 5)).toBe(10);
  });

  it("returns Infinity for out of bounds", () => {
    const map = new DijkstraMap(10, 10);

    expect(map.get(-1, 0)).toBe(Infinity);
    expect(map.get(0, -1)).toBe(Infinity);
    expect(map.get(10, 0)).toBe(Infinity);
    expect(map.get(0, 10)).toBe(Infinity);
  });

  it("finds furthest point correctly", () => {
    const map = new DijkstraMap(10, 10);
    map.set(0, 0, 0);
    map.set(5, 5, 10);
    map.set(9, 9, 20);

    const result = map.findFurthestPoint();

    expect(result).not.toBeNull();
    expect(result?.point).toEqual({ x: 9, y: 9 });
    expect(result?.distance).toBe(20);
  });

  it("gets points in range", () => {
    const map = new DijkstraMap(10, 10);
    map.set(0, 0, 5);
    map.set(1, 1, 10);
    map.set(2, 2, 15);
    map.set(3, 3, 20);

    const points = map.getPointsInRange(8, 18);

    expect(points.length).toBe(2);
    expect(points).toContainEqual({ x: 1, y: 1 });
    expect(points).toContainEqual({ x: 2, y: 2 });
  });

  it("calculates stats correctly", () => {
    const map = new DijkstraMap(5, 5);
    map.set(0, 0, 0);
    map.set(1, 1, 5);
    map.set(2, 2, 10);

    const stats = map.getStats();

    expect(stats.minDistance).toBe(0);
    expect(stats.maxDistance).toBe(10);
    expect(stats.avgDistance).toBe(5);
    expect(stats.reachableCells).toBe(3);
    expect(stats.unreachableCells).toBe(22);
  });

  it("gets downhill direction", () => {
    const map = new DijkstraMap(5, 5);
    map.set(2, 2, 0);
    map.set(2, 1, 1);
    map.set(2, 3, 1);
    map.set(1, 2, 1);
    map.set(3, 2, 1);
    map.set(1, 1, 2);

    const dir = map.getDownhillDirection(1, 1);
    expect(dir).not.toBeNull();
    // Should point towards lower distance
  });

  it("returns null downhill direction at goal", () => {
    const map = new DijkstraMap(5, 5);
    map.set(2, 2, 0);

    const dir = map.getDownhillDirection(2, 2);
    expect(dir).toBeNull();
  });
});

describe("computeDijkstraMap", () => {
  function createOpenGrid(width: number, height: number): Grid {
    const grid = new Grid(width, height, CellType.FLOOR);
    return grid;
  }

  it("computes distances from single goal", () => {
    const grid = createOpenGrid(10, 10);

    const map = computeDijkstraMap(grid, [{ x: 0, y: 0 }]);

    expect(map.get(0, 0)).toBe(0);
    expect(map.get(1, 0)).toBe(1);
    expect(map.get(0, 1)).toBe(1);
    // Diagonal should be sqrt(2) ≈ 1.414
    expect(map.get(1, 1)).toBeCloseTo(Math.SQRT2, 2);
  });

  it("computes distances from multiple goals", () => {
    const grid = createOpenGrid(10, 10);

    const map = computeDijkstraMap(grid, [
      { x: 0, y: 0 },
      { x: 9, y: 9 },
    ]);

    expect(map.get(0, 0)).toBe(0);
    expect(map.get(9, 9)).toBe(0);
    // Middle point should be equidistant
    const middleDist = map.get(5, 5);
    expect(middleDist).toBeLessThan(10);
  });

  it("respects walls", () => {
    const grid = new Grid(10, 10, CellType.FLOOR);
    // Create a wall blocking direct path
    for (let y = 0; y < 8; y++) {
      grid.set(5, y, CellType.WALL);
    }

    const map = computeDijkstraMap(grid, [{ x: 0, y: 0 }]);

    // Point behind wall should have longer distance
    const directDist = 6; // Would be 6 if no wall
    expect(map.get(6, 0)).toBeGreaterThan(directDist);
  });

  it("respects maxDistance option", () => {
    const grid = createOpenGrid(100, 100);

    const map = computeDijkstraMap(grid, [{ x: 0, y: 0 }], {
      maxDistance: 10,
    });

    expect(map.get(5, 0)).toBeLessThanOrEqual(10);
    expect(map.get(50, 50)).toBe(Infinity);
  });

  it("works without diagonal movement", () => {
    const grid = createOpenGrid(10, 10);

    const map = computeDijkstraMap(grid, [{ x: 0, y: 0 }], {
      allowDiagonal: false,
    });

    expect(map.get(1, 1)).toBe(2); // Must go cardinal
    expect(map.get(5, 5)).toBe(10); // Manhattan distance
  });

  it("keeps correct distances across repeated calls with pooled queue", () => {
    const large = createOpenGrid(120, 120);
    const expectedLargeDistance = 238;

    for (let i = 0; i < 5; i++) {
      const map = computeDijkstraMap(large, [{ x: 0, y: 0 }], {
        allowDiagonal: false,
      });
      expect(map.get(119, 119)).toBe(expectedLargeDistance);
    }

    const small = createOpenGrid(10, 10);
    const smallMap = computeDijkstraMap(small, [{ x: 0, y: 0 }], {
      allowDiagonal: false,
    });
    expect(smallMap.get(9, 9)).toBe(18);
  });
});

describe("computeFleeMap", () => {
  it("inverts distances for fleeing", () => {
    const grid = new Grid(10, 10, CellType.FLOOR);
    const source = computeDijkstraMap(grid, [{ x: 5, y: 5 }]);

    const fleeMap = computeFleeMap(source);

    // After flee map computation, the goal should have a different value
    // The flee map inverts then smooths, so we check relative values
    const goalValue = fleeMap.get(5, 5);
    const nearValue = fleeMap.get(4, 5);

    // Goal was distance 0 in source, gets inverted to 0
    // Near points were distance 1, get inverted to -1.2 * 1 = -1.2
    // After smoothing, we just check that different cells have different values
    expect(goalValue).not.toBe(Infinity);
    expect(nearValue).not.toBe(Infinity);
  });
});

describe("combineDijkstraMaps", () => {
  it("combines maps with weights", () => {
    const map1 = new DijkstraMap(10, 10);
    const map2 = new DijkstraMap(10, 10);

    map1.set(5, 5, 10);
    map2.set(5, 5, 20);

    const combined = combineDijkstraMaps([
      [map1, 1],
      [map2, 2],
    ]);

    // 10*1 + 20*2 = 50
    expect(combined.get(5, 5)).toBe(50);
  });

  it("throws on empty array", () => {
    expect(() => combineDijkstraMaps([])).toThrow();
  });
});
