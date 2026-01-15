import { describe, expect, test } from "bun:test";
import { CellType, FloodFill, Grid } from "@rogue/procgen";

describe("FloodFill", () => {
  describe("scanlineFill()", () => {
    test("fills connected region", () => {
      const grid = new Grid({ width: 5, height: 5 }, CellType.WALL);
      // Create a floor region
      grid.setCell(1, 1, CellType.FLOOR);
      grid.setCell(2, 1, CellType.FLOOR);
      grid.setCell(3, 1, CellType.FLOOR);
      grid.setCell(2, 2, CellType.FLOOR);

      const points = FloodFill.scanlineFill(grid, 2, 1);

      expect(points).toHaveLength(4);
      // All points should now be WALL (filled)
      expect(grid.getCell(1, 1)).toBe(CellType.WALL);
      expect(grid.getCell(2, 1)).toBe(CellType.WALL);
      expect(grid.getCell(3, 1)).toBe(CellType.WALL);
      expect(grid.getCell(2, 2)).toBe(CellType.WALL);
    });

    test("returns empty for out of bounds start", () => {
      const grid = new Grid({ width: 5, height: 5 });
      const points = FloodFill.scanlineFill(grid, -1, 0);
      expect(points).toHaveLength(0);
    });

    test("returns empty if start is not target value", () => {
      const grid = new Grid({ width: 5, height: 5 }, CellType.WALL);
      const points = FloodFill.scanlineFill(grid, 2, 2);
      expect(points).toHaveLength(0);
    });

    test("respects maxSize limit", () => {
      const grid = new Grid({ width: 10, height: 10 }, CellType.FLOOR);
      const points = FloodFill.scanlineFill(grid, 5, 5, { maxSize: 20 });
      expect(points.length).toBeLessThanOrEqual(20);
    });

    test("uses custom fillValue", () => {
      const grid = new Grid({ width: 3, height: 3 }, CellType.FLOOR);
      FloodFill.scanlineFill(grid, 1, 1, { fillValue: CellType.WALL });
      expect(grid.getCell(1, 1)).toBe(CellType.WALL);
    });

    test("handles single cell region", () => {
      const grid = new Grid({ width: 5, height: 5 }, CellType.WALL);
      grid.setCell(2, 2, CellType.FLOOR);

      const points = FloodFill.scanlineFill(grid, 2, 2);

      expect(points).toHaveLength(1);
      expect(points[0]).toEqual({ x: 2, y: 2 });
    });

    test("fills horizontal line efficiently", () => {
      const grid = new Grid({ width: 100, height: 3 }, CellType.WALL);
      // Create horizontal line
      for (let x = 0; x < 100; x++) {
        grid.setCell(x, 1, CellType.FLOOR);
      }

      const points = FloodFill.scanlineFill(grid, 50, 1);

      expect(points).toHaveLength(100);
    });
  });

  describe("standardFill()", () => {
    test("fills connected region with 4-connectivity", () => {
      const grid = new Grid({ width: 5, height: 5 }, CellType.WALL);
      grid.setCell(1, 2, CellType.FLOOR);
      grid.setCell(2, 2, CellType.FLOOR);
      grid.setCell(3, 2, CellType.FLOOR);
      grid.setCell(2, 1, CellType.FLOOR);
      grid.setCell(2, 3, CellType.FLOOR);

      const points = FloodFill.standardFill(grid, 2, 2);

      expect(points).toHaveLength(5);
    });

    test("respects 8-connectivity with diagonal option", () => {
      const grid = new Grid({ width: 3, height: 3 }, CellType.WALL);
      grid.setCell(0, 0, CellType.FLOOR);
      grid.setCell(2, 2, CellType.FLOOR);

      // Without diagonal - not connected
      const gridCopy1 = grid.clone();
      const points4 = FloodFill.standardFill(gridCopy1, 0, 0, {
        diagonal: false,
      });
      expect(points4).toHaveLength(1);

      // With diagonal - still not connected (no diagonal path)
      const gridCopy2 = grid.clone();
      const points8 = FloodFill.standardFill(gridCopy2, 0, 0, {
        diagonal: true,
      });
      expect(points8).toHaveLength(1);
    });

    test("fills diagonal path with 8-connectivity", () => {
      const grid = new Grid({ width: 5, height: 5 }, CellType.WALL);
      grid.setCell(0, 0, CellType.FLOOR);
      grid.setCell(1, 1, CellType.FLOOR);
      grid.setCell(2, 2, CellType.FLOOR);

      const points = FloodFill.standardFill(grid, 0, 0, { diagonal: true });

      expect(points).toHaveLength(3);
    });

    test("returns empty for out of bounds", () => {
      const grid = new Grid({ width: 5, height: 5 });
      const points = FloodFill.standardFill(grid, 10, 10);
      expect(points).toHaveLength(0);
    });

    test("respects maxSize", () => {
      const grid = new Grid({ width: 10, height: 10 }, CellType.FLOOR);
      const points = FloodFill.standardFill(grid, 5, 5, { maxSize: 15 });
      expect(points.length).toBeLessThanOrEqual(15);
    });
  });

  describe("findRegions()", () => {
    test("finds all separate regions", () => {
      const grid = new Grid({ width: 10, height: 5 }, CellType.WALL);

      // Create two separate regions
      grid.setCell(1, 1, CellType.FLOOR);
      grid.setCell(2, 1, CellType.FLOOR);

      grid.setCell(7, 3, CellType.FLOOR);
      grid.setCell(8, 3, CellType.FLOOR);

      const regions = FloodFill.findRegions(grid, CellType.FLOOR);

      expect(regions).toHaveLength(2);
      expect(regions[0].size).toBe(2);
      expect(regions[1].size).toBe(2);
    });

    test("filters by minSize", () => {
      const grid = new Grid({ width: 10, height: 5 }, CellType.WALL);

      // Small region (2 cells)
      grid.setCell(1, 1, CellType.FLOOR);
      grid.setCell(2, 1, CellType.FLOOR);

      // Large region (5 cells)
      grid.setCell(6, 2, CellType.FLOOR);
      grid.setCell(7, 2, CellType.FLOOR);
      grid.setCell(8, 2, CellType.FLOOR);
      grid.setCell(7, 1, CellType.FLOOR);
      grid.setCell(7, 3, CellType.FLOOR);

      const regions = FloodFill.findRegions(grid, CellType.FLOOR, 3);

      expect(regions).toHaveLength(1);
      expect(regions[0].size).toBe(5);
    });

    test("assigns unique IDs to regions", () => {
      const grid = new Grid({ width: 10, height: 1 }, CellType.WALL);
      grid.setCell(0, 0, CellType.FLOOR);
      grid.setCell(5, 0, CellType.FLOOR);
      grid.setCell(9, 0, CellType.FLOOR);

      const regions = FloodFill.findRegions(grid);

      const ids = regions.map((r) => r.id);
      expect(new Set(ids).size).toBe(3);
    });

    test("calculates correct bounds", () => {
      const grid = new Grid({ width: 10, height: 10 }, CellType.WALL);
      // Create connected cross shape
      grid.setCell(3, 1, CellType.FLOOR);
      grid.setCell(3, 2, CellType.FLOOR);
      grid.setCell(2, 3, CellType.FLOOR);
      grid.setCell(3, 3, CellType.FLOOR);
      grid.setCell(4, 3, CellType.FLOOR);
      grid.setCell(5, 3, CellType.FLOOR);
      grid.setCell(3, 4, CellType.FLOOR);
      grid.setCell(3, 5, CellType.FLOOR);

      const regions = FloodFill.findRegions(grid);

      expect(regions).toHaveLength(1);
      expect(regions[0].bounds).toEqual({
        minX: 2,
        maxX: 5,
        minY: 1,
        maxY: 5,
      });
    });

    test("returns empty array for empty grid", () => {
      const grid = new Grid({ width: 5, height: 5 }, CellType.WALL);
      const regions = FloodFill.findRegions(grid, CellType.FLOOR);
      expect(regions).toHaveLength(0);
    });

    test("handles entire grid as one region", () => {
      const grid = new Grid({ width: 5, height: 5 }, CellType.FLOOR);
      const regions = FloodFill.findRegions(grid, CellType.FLOOR, 1, false);

      // Should find regions
      expect(regions.length).toBeGreaterThanOrEqual(1);
      // Each region should have positive size
      for (const region of regions) {
        expect(region.size).toBeGreaterThan(0);
      }
    });

    test("uses 8-connectivity when diagonal is true", () => {
      const grid = new Grid({ width: 3, height: 3 }, CellType.WALL);
      grid.setCell(0, 0, CellType.FLOOR);
      grid.setCell(1, 1, CellType.FLOOR);
      grid.setCell(2, 2, CellType.FLOOR);

      // Without diagonal - 3 separate regions
      const regions4 = FloodFill.findRegions(grid, CellType.FLOOR, 1, false);
      expect(regions4).toHaveLength(3);

      // With diagonal - 1 connected region
      const regions8 = FloodFill.findRegions(grid, CellType.FLOOR, 1, true);
      expect(regions8).toHaveLength(1);
      expect(regions8[0].size).toBe(3);
    });

    test("does not modify grid", () => {
      const grid = new Grid({ width: 5, height: 5 }, CellType.FLOOR);
      grid.setCell(2, 2, CellType.WALL);

      FloodFill.findRegions(grid);

      // Grid should be unchanged
      expect(grid.getCell(0, 0)).toBe(CellType.FLOOR);
      expect(grid.getCell(2, 2)).toBe(CellType.WALL);
    });
  });

  describe("findLargestRegion()", () => {
    test("returns largest region", () => {
      const grid = new Grid({ width: 10, height: 5 }, CellType.WALL);

      // Small region (2 cells)
      grid.setCell(1, 1, CellType.FLOOR);
      grid.setCell(2, 1, CellType.FLOOR);

      // Large region (5 cells)
      grid.setCell(6, 2, CellType.FLOOR);
      grid.setCell(7, 2, CellType.FLOOR);
      grid.setCell(8, 2, CellType.FLOOR);
      grid.setCell(7, 1, CellType.FLOOR);
      grid.setCell(7, 3, CellType.FLOOR);

      const largest = FloodFill.findLargestRegion(grid);

      expect(largest).not.toBeNull();
      expect(largest?.size).toBe(5);
    });

    test("returns null for empty grid", () => {
      const grid = new Grid({ width: 5, height: 5 }, CellType.WALL);
      const largest = FloodFill.findLargestRegion(grid, CellType.FLOOR);
      expect(largest).toBeNull();
    });

    test("returns only region when single region exists", () => {
      const grid = new Grid({ width: 3, height: 3 }, CellType.FLOOR);
      const largest = FloodFill.findLargestRegion(grid);

      expect(largest).not.toBeNull();
      // Should find at least one region
      expect(largest?.size).toBeGreaterThan(0);
    });

    test("handles tie by returning first largest", () => {
      const grid = new Grid({ width: 10, height: 1 }, CellType.WALL);
      grid.setCell(0, 0, CellType.FLOOR);
      grid.setCell(1, 0, CellType.FLOOR);
      grid.setCell(5, 0, CellType.FLOOR);
      grid.setCell(6, 0, CellType.FLOOR);

      const largest = FloodFill.findLargestRegion(grid);

      expect(largest).not.toBeNull();
      expect(largest?.size).toBe(2);
    });

    test("uses diagonal connectivity when specified", () => {
      const grid = new Grid({ width: 5, height: 5 }, CellType.WALL);
      // Diagonal line
      grid.setCell(0, 0, CellType.FLOOR);
      grid.setCell(1, 1, CellType.FLOOR);
      grid.setCell(2, 2, CellType.FLOOR);
      grid.setCell(3, 3, CellType.FLOOR);

      // Without diagonal
      const largest4 = FloodFill.findLargestRegion(grid, CellType.FLOOR, false);
      expect(largest4?.size).toBe(1);

      // With diagonal
      const largest8 = FloodFill.findLargestRegion(grid, CellType.FLOOR, true);
      expect(largest8?.size).toBe(4);
    });
  });

  describe("areConnected()", () => {
    test("returns true for connected points", () => {
      const grid = new Grid({ width: 5, height: 5 }, CellType.FLOOR);

      // Test adjacent points first (definitely connected)
      const connectedAdjacent = FloodFill.areConnected(
        grid,
        { x: 0, y: 0 },
        { x: 1, y: 0 },
      );
      expect(connectedAdjacent).toBe(true);

      // Test same point
      const connectedSame = FloodFill.areConnected(
        grid,
        { x: 2, y: 2 },
        { x: 2, y: 2 },
      );
      expect(connectedSame).toBe(true);
    });

    test("returns false for disconnected points", () => {
      const grid = new Grid({ width: 5, height: 5 }, CellType.WALL);
      grid.setCell(0, 0, CellType.FLOOR);
      grid.setCell(4, 4, CellType.FLOOR);

      const connected = FloodFill.areConnected(
        grid,
        { x: 0, y: 0 },
        { x: 4, y: 4 },
      );

      expect(connected).toBe(false);
    });

    test("returns false if point1 is not target type", () => {
      const grid = new Grid({ width: 5, height: 5 }, CellType.FLOOR);
      grid.setCell(0, 0, CellType.WALL);

      const connected = FloodFill.areConnected(
        grid,
        { x: 0, y: 0 },
        { x: 4, y: 4 },
      );

      expect(connected).toBe(false);
    });

    test("returns false if point2 is not target type", () => {
      const grid = new Grid({ width: 5, height: 5 }, CellType.FLOOR);
      grid.setCell(4, 4, CellType.WALL);

      const connected = FloodFill.areConnected(
        grid,
        { x: 0, y: 0 },
        { x: 4, y: 4 },
      );

      expect(connected).toBe(false);
    });

    test("returns true for same point", () => {
      const grid = new Grid({ width: 5, height: 5 }, CellType.FLOOR);

      const connected = FloodFill.areConnected(
        grid,
        { x: 2, y: 2 },
        { x: 2, y: 2 },
      );

      expect(connected).toBe(true);
    });

    test("respects diagonal connectivity", () => {
      const grid = new Grid({ width: 3, height: 3 }, CellType.WALL);
      grid.setCell(0, 0, CellType.FLOOR);
      grid.setCell(1, 1, CellType.FLOOR);
      grid.setCell(2, 2, CellType.FLOOR);

      // Without diagonal
      const connected4 = FloodFill.areConnected(
        grid,
        { x: 0, y: 0 },
        { x: 2, y: 2 },
        CellType.FLOOR,
        false,
      );
      expect(connected4).toBe(false);

      // With diagonal
      const connected8 = FloodFill.areConnected(
        grid,
        { x: 0, y: 0 },
        { x: 2, y: 2 },
        CellType.FLOOR,
        true,
      );
      expect(connected8).toBe(true);
    });

    test("handles complex maze path", () => {
      const grid = new Grid({ width: 7, height: 7 }, CellType.WALL);
      // Create maze-like path
      const path = [
        [1, 0],
        [1, 1],
        [1, 2],
        [2, 2],
        [3, 2],
        [3, 3],
        [3, 4],
        [4, 4],
        [5, 4],
        [5, 5],
      ];
      for (const [x, y] of path) {
        grid.setCell(x, y, CellType.FLOOR);
      }

      expect(FloodFill.areConnected(grid, { x: 1, y: 0 }, { x: 5, y: 5 })).toBe(
        true,
      );

      expect(FloodFill.areConnected(grid, { x: 1, y: 0 }, { x: 0, y: 0 })).toBe(
        false,
      );
    });

    test("does not modify grid", () => {
      const grid = new Grid({ width: 5, height: 5 }, CellType.FLOOR);

      FloodFill.areConnected(grid, { x: 0, y: 0 }, { x: 4, y: 4 });

      // Grid should be unchanged
      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 5; x++) {
          expect(grid.getCell(x, y)).toBe(CellType.FLOOR);
        }
      }
    });
  });

  describe("Edge cases and performance", () => {
    test("handles 1x1 grid", () => {
      const grid = new Grid({ width: 1, height: 1 }, CellType.FLOOR);

      const regions = FloodFill.findRegions(grid);
      expect(regions).toHaveLength(1);
      expect(regions[0].size).toBe(1);

      const largest = FloodFill.findLargestRegion(grid);
      expect(largest?.size).toBe(1);
    });

    test("handles large grid efficiently", () => {
      const grid = new Grid({ width: 100, height: 100 }, CellType.FLOOR);

      const start = performance.now();
      const regions = FloodFill.findRegions(grid);
      const duration = performance.now() - start;

      // Should find regions
      expect(regions.length).toBeGreaterThanOrEqual(1);
      // Should complete quickly
      expect(duration).toBeLessThan(100); // Should complete within 100ms
    });

    test("handles many small regions", () => {
      const grid = new Grid({ width: 20, height: 20 }, CellType.WALL);

      // Create checkerboard pattern (many 1-cell regions)
      for (let y = 0; y < 20; y += 2) {
        for (let x = 0; x < 20; x += 2) {
          grid.setCell(x, y, CellType.FLOOR);
        }
      }

      const regions = FloodFill.findRegions(grid);

      expect(regions).toHaveLength(100); // 10x10 checkerboard
      for (const region of regions) {
        expect(region.size).toBe(1);
      }
    });
  });
});
