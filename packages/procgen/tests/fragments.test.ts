/**
 * Algorithm Fragments Tests
 */

import { describe, expect, it } from "bun:test";
import { Grid } from "../src/core/grid/grid";
import { CellType } from "../src/core/grid/types";
import {
  cellularSmooth,
  cellularStep,
  ensureWallBorder,
  fillSmallRegions,
  getGridStats,
  initializeRandomGrid,
  keepLargestRegion,
} from "../src/fragments/cellular";
import {
  addExtraEdges,
  buildCompleteGraph,
  buildGabrielGraph,
  buildMST,
  buildRelativeNeighborhoodGraph,
  calculateGraphDiameter,
  findConnectedComponents,
  findShortestPath,
} from "../src/fragments/connectivity";
import {
  bspPartition,
  getBSPCenter,
  getBSPDepth,
  getBSPLeaves,
  getBSPSiblingPairs,
  placeRoomInPartition,
} from "../src/fragments/partitioning";

// Simple seeded RNG for testing
function createTestRng(seed: number) {
  let s = seed;
  return {
    next(): number {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    },
  };
}

describe("partitioning fragments", () => {
  describe("bspPartition", () => {
    it("creates a root node with correct dimensions", () => {
      const rng = createTestRng(42);
      const root = bspPartition(100, 80, { minSize: 10 }, rng);

      expect(root.x).toBe(0);
      expect(root.y).toBe(0);
      expect(root.width).toBe(100);
      expect(root.height).toBe(80);
    });

    it("subdivides when space permits", () => {
      const rng = createTestRng(42);
      const root = bspPartition(
        100,
        80,
        { minSize: 10, splitRatio: 0.5, splitVariance: 0 },
        rng,
      );

      expect(root.left).not.toBeNull();
      expect(root.right).not.toBeNull();
    });

    it("stops subdividing at minSize", () => {
      const rng = createTestRng(42);
      const root = bspPartition(100, 80, { minSize: 40 }, rng);

      // Should have limited splits
      const leaves = getBSPLeaves(root);
      for (const leaf of leaves) {
        // Each leaf should be at least minSize/2 in each dimension
        expect(leaf.width).toBeGreaterThanOrEqual(20);
        expect(leaf.height).toBeGreaterThanOrEqual(20);
      }
    });

    it("respects maxDepth", () => {
      const rng = createTestRng(42);
      const root = bspPartition(200, 200, { minSize: 5, maxDepth: 2 }, rng);

      const depth = getBSPDepth(root);
      expect(depth).toBeLessThanOrEqual(2);
    });
  });

  describe("getBSPLeaves", () => {
    it("returns single leaf for unsplit tree", () => {
      const rng = createTestRng(42);
      const root = bspPartition(10, 10, { minSize: 50 }, rng); // Too small to split

      const leaves = getBSPLeaves(root);
      expect(leaves).toHaveLength(1);
      expect(leaves[0]).toBe(root);
    });

    it("returns all leaf nodes", () => {
      const rng = createTestRng(42);
      const root = bspPartition(100, 80, { minSize: 15 }, rng);

      const leaves = getBSPLeaves(root);
      expect(leaves.length).toBeGreaterThan(1);

      // All leaves should be terminal (no children)
      for (const leaf of leaves) {
        expect(leaf.left).toBeNull();
        expect(leaf.right).toBeNull();
      }
    });
  });

  describe("getBSPSiblingPairs", () => {
    it("returns pairs of siblings for corridor connection", () => {
      const rng = createTestRng(42);
      const root = bspPartition(100, 80, { minSize: 20 }, rng);

      const pairs = getBSPSiblingPairs(root);
      expect(pairs.length).toBeGreaterThan(0);

      for (const pair of pairs) {
        expect(pair.left).toBeDefined();
        expect(pair.right).toBeDefined();
        expect(typeof pair.splitHorizontal).toBe("boolean");
      }
    });
  });

  describe("placeRoomInPartition", () => {
    it("places room within partition bounds", () => {
      const partition = {
        x: 10,
        y: 10,
        width: 30,
        height: 30,
        left: null,
        right: null,
      };
      const rng = createTestRng(42);

      const room = placeRoomInPartition(partition, 2, 4, rng);

      expect(room).not.toBeNull();
      expect(room?.x).toBeGreaterThanOrEqual(partition.x + 2);
      expect(room?.y).toBeGreaterThanOrEqual(partition.y + 2);
      expect(room?.x + room?.width).toBeLessThanOrEqual(
        partition.x + partition.width - 2,
      );
      expect(room?.y + room?.height).toBeLessThanOrEqual(
        partition.y + partition.height - 2,
      );
    });

    it("returns null for partition too small", () => {
      const partition = {
        x: 0,
        y: 0,
        width: 5,
        height: 5,
        left: null,
        right: null,
      };
      const rng = createTestRng(42);

      const room = placeRoomInPartition(partition, 2, 4, rng);

      expect(room).toBeNull();
    });
  });

  describe("getBSPCenter", () => {
    it("returns center point", () => {
      const node = {
        x: 10,
        y: 20,
        width: 30,
        height: 40,
        left: null,
        right: null,
      };
      const center = getBSPCenter(node);

      expect(center.x).toBe(25);
      expect(center.y).toBe(40);
    });
  });
});

describe("connectivity fragments", () => {
  describe("buildCompleteGraph", () => {
    it("creates n*(n-1)/2 edges for n points", () => {
      const points = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 10 },
      ];

      const edges = buildCompleteGraph(points);

      expect(edges).toHaveLength(3); // 3*(3-1)/2 = 3
    });

    it("calculates correct distances", () => {
      const points = [
        { x: 0, y: 0 },
        { x: 3, y: 4 },
      ];

      const edges = buildCompleteGraph(points);

      expect(edges[0]?.weight).toBe(5); // 3-4-5 triangle
    });
  });

  describe("buildMST", () => {
    it("returns n-1 edges for n nodes", () => {
      const points = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 10 },
        { x: 20, y: 5 },
      ];

      const edges = buildCompleteGraph(points);
      const mst = buildMST(points.length, edges);

      expect(mst).toHaveLength(3); // 4-1 = 3
    });

    it("creates connected tree", () => {
      const points = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 10 },
      ];

      const edges = buildCompleteGraph(points);
      const mst = buildMST(points.length, edges);

      const components = findConnectedComponents(points.length, mst);
      expect(components).toHaveLength(1);
      expect(components[0]).toHaveLength(3);
    });
  });

  describe("addExtraEdges", () => {
    it("adds edges from non-MST set", () => {
      const rng = createTestRng(42);
      const points = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 10 },
        { x: 20, y: 5 },
      ];

      const allEdges = buildCompleteGraph(points);
      const mst = buildMST(points.length, allEdges);
      const withExtras = addExtraEdges(mst, allEdges, 1.0, rng);

      expect(withExtras.length).toBeGreaterThanOrEqual(mst.length);
    });
  });

  describe("buildRelativeNeighborhoodGraph", () => {
    it("creates edges for nearby points", () => {
      const points = [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 100, y: 100 },
      ];

      const edges = buildRelativeNeighborhoodGraph(points);

      // Close points should be connected
      const has01 = edges.some(
        (e) => (e.from === 0 && e.to === 1) || (e.from === 1 && e.to === 0),
      );
      expect(has01).toBe(true);
    });
  });

  describe("buildGabrielGraph", () => {
    it("creates subset of Delaunay edges", () => {
      const points = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 10 },
      ];

      const gabriel = buildGabrielGraph(points);
      const complete = buildCompleteGraph(points);

      expect(gabriel.length).toBeLessThanOrEqual(complete.length);
    });
  });

  describe("findShortestPath", () => {
    it("finds path in connected graph", () => {
      const adjacency = new Map<number, readonly number[]>([
        [0, [1]],
        [1, [0, 2]],
        [2, [1, 3]],
        [3, [2]],
      ]);

      const path = findShortestPath(adjacency, 0, 3);

      expect(path).toEqual([0, 1, 2, 3]);
    });

    it("returns null for disconnected nodes", () => {
      const adjacency = new Map<number, readonly number[]>([
        [0, [1]],
        [1, [0]],
        [2, [3]],
        [3, [2]],
      ]);

      const path = findShortestPath(adjacency, 0, 3);

      expect(path).toBeNull();
    });
  });

  describe("calculateGraphDiameter", () => {
    it("returns longest shortest path", () => {
      const edges = [
        { from: 0, to: 1, weight: 1 },
        { from: 1, to: 2, weight: 1 },
        { from: 2, to: 3, weight: 1 },
      ];

      const diameter = calculateGraphDiameter(4, edges);

      expect(diameter).toBe(3);
    });
  });

  describe("findConnectedComponents", () => {
    it("finds single component for connected graph", () => {
      const edges = [
        { from: 0, to: 1, weight: 1 },
        { from: 1, to: 2, weight: 1 },
      ];

      const components = findConnectedComponents(3, edges);

      expect(components).toHaveLength(1);
    });

    it("finds multiple components for disconnected graph", () => {
      const edges = [
        { from: 0, to: 1, weight: 1 },
        { from: 2, to: 3, weight: 1 },
      ];

      const components = findConnectedComponents(4, edges);

      expect(components).toHaveLength(2);
    });
  });
});

describe("cellular fragments", () => {
  describe("initializeRandomGrid", () => {
    it("creates grid with specified dimensions", () => {
      const rng = createTestRng(42);
      const grid = initializeRandomGrid(50, 40, 0.5, rng);

      expect(grid.width).toBe(50);
      expect(grid.height).toBe(40);
    });

    it("approximately respects fill ratio", () => {
      const rng = createTestRng(42);
      const grid = initializeRandomGrid(100, 100, 0.45, rng);

      let floorCount = 0;
      for (let y = 0; y < grid.height; y++) {
        for (let x = 0; x < grid.width; x++) {
          if (grid.get(x, y) === CellType.FLOOR) floorCount++;
        }
      }

      const ratio = floorCount / (grid.width * grid.height);
      expect(ratio).toBeGreaterThan(0.3);
      expect(ratio).toBeLessThan(0.6);
    });
  });

  describe("cellularStep", () => {
    it("applies birth and death rules", () => {
      const grid = new Grid(5, 5, CellType.WALL);
      // Create a cross pattern
      grid.set(2, 1, CellType.FLOOR);
      grid.set(1, 2, CellType.FLOOR);
      grid.set(2, 2, CellType.FLOOR);
      grid.set(3, 2, CellType.FLOOR);
      grid.set(2, 3, CellType.FLOOR);

      const result = cellularStep(grid);

      // Center should survive (4 neighbors)
      expect(result.get(2, 2)).toBe(CellType.FLOOR);
    });

    it("does not modify input grid", () => {
      const grid = new Grid(5, 5, CellType.FLOOR);
      const originalVal = grid.get(2, 2);

      cellularStep(grid);

      expect(grid.get(2, 2)).toBe(originalVal);
    });
  });

  describe("cellularSmooth", () => {
    it("applies multiple iterations", () => {
      const rng = createTestRng(42);
      const grid = initializeRandomGrid(50, 50, 0.45, rng);

      const smoothed = cellularSmooth(grid, 5);

      // After smoothing, should have more contiguous regions
      const stats = getGridStats(smoothed);
      expect(stats.regionCount).toBeGreaterThan(0);
    });
  });

  describe("fillSmallRegions", () => {
    it("fills regions smaller than threshold", () => {
      const grid = new Grid(20, 20, CellType.WALL);

      // Create a small region (3 cells)
      grid.set(2, 2, CellType.FLOOR);
      grid.set(2, 3, CellType.FLOOR);
      grid.set(3, 2, CellType.FLOOR);

      // Create a larger region (10+ cells)
      for (let x = 10; x < 18; x++) {
        grid.set(x, 10, CellType.FLOOR);
        grid.set(x, 11, CellType.FLOOR);
      }

      fillSmallRegions(grid, 5);

      // Small region should be filled
      expect(grid.get(2, 2)).toBe(CellType.WALL);
      // Large region should remain
      expect(grid.get(14, 10)).toBe(CellType.FLOOR);
    });
  });

  describe("keepLargestRegion", () => {
    it("removes all but largest region", () => {
      const grid = new Grid(30, 30, CellType.WALL);

      // Small region
      grid.set(2, 2, CellType.FLOOR);
      grid.set(2, 3, CellType.FLOOR);

      // Large region
      for (let x = 10; x < 25; x++) {
        for (let y = 10; y < 25; y++) {
          grid.set(x, y, CellType.FLOOR);
        }
      }

      const largestSize = keepLargestRegion(grid);

      expect(largestSize).toBe(15 * 15);
      expect(grid.get(2, 2)).toBe(CellType.WALL);
      expect(grid.get(15, 15)).toBe(CellType.FLOOR);
    });
  });

  describe("ensureWallBorder", () => {
    it("sets all border cells to wall", () => {
      const grid = new Grid(10, 10, CellType.FLOOR);

      ensureWallBorder(grid);

      // Check all border cells
      for (let x = 0; x < grid.width; x++) {
        expect(grid.get(x, 0)).toBe(CellType.WALL);
        expect(grid.get(x, grid.height - 1)).toBe(CellType.WALL);
      }
      for (let y = 0; y < grid.height; y++) {
        expect(grid.get(0, y)).toBe(CellType.WALL);
        expect(grid.get(grid.width - 1, y)).toBe(CellType.WALL);
      }

      // Interior should remain floor
      expect(grid.get(5, 5)).toBe(CellType.FLOOR);
    });
  });

  describe("getGridStats", () => {
    it("calculates correct statistics", () => {
      const grid = new Grid(10, 10, CellType.WALL);

      // Create two regions
      grid.set(1, 1, CellType.FLOOR);
      grid.set(1, 2, CellType.FLOOR);
      grid.set(2, 1, CellType.FLOOR);

      grid.set(8, 8, CellType.FLOOR);

      const stats = getGridStats(grid);

      expect(stats.floorCount).toBe(4);
      expect(stats.wallCount).toBe(96);
      expect(stats.floorRatio).toBe(0.04);
      expect(stats.regionCount).toBe(2);
      expect(stats.largestRegionSize).toBe(3);
    });
  });
});
