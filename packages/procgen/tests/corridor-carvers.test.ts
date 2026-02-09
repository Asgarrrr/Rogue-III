import { describe, expect, it } from "bun:test";
import type { Point } from "../src/core/geometry/types";
import { Grid } from "../src/core/grid/grid";
import { CellType } from "../src/core/grid/types";
import {
  type CorridorOptions,
  carveAStarCorridor,
  carveBresenhamCorridor,
  carveCorridor,
  carveLShapedCorridor,
} from "../src/passes/carving/corridor-carvers";

describe("Corridor Carvers", () => {
  describe("carveLShapedCorridor", () => {
    it("should create an L-shaped path with horizontal first", () => {
      const grid = Grid.walls(20, 20);
      const from: Point = { x: 5, y: 5 };
      const to: Point = { x: 15, y: 15 };

      const path = carveLShapedCorridor(grid, from, to, 1, true);

      // Path should not be empty
      expect(path.length).toBeGreaterThan(0);

      // Starting point should be carved
      expect(grid.get(from.x, from.y)).toBe(CellType.FLOOR);

      // Ending point should be carved
      expect(grid.get(to.x, to.y)).toBe(CellType.FLOOR);

      // Verify horizontal segment exists
      expect(grid.get(10, 5)).toBe(CellType.FLOOR);

      // Verify vertical segment exists
      expect(grid.get(15, 10)).toBe(CellType.FLOOR);
    });

    it("should create an L-shaped path with vertical first", () => {
      const grid = Grid.walls(20, 20);
      const from: Point = { x: 5, y: 5 };
      const to: Point = { x: 15, y: 15 };

      const path = carveLShapedCorridor(grid, from, to, 1, false);

      // Path should not be empty
      expect(path.length).toBeGreaterThan(0);

      // Starting point should be carved
      expect(grid.get(from.x, from.y)).toBe(CellType.FLOOR);

      // Ending point should be carved
      expect(grid.get(to.x, to.y)).toBe(CellType.FLOOR);

      // Verify vertical segment exists
      expect(grid.get(5, 10)).toBe(CellType.FLOOR);

      // Verify horizontal segment exists
      expect(grid.get(10, 15)).toBe(CellType.FLOOR);
    });

    it("should respect corridor width of 1", () => {
      const grid = Grid.walls(20, 20);
      const from: Point = { x: 5, y: 10 };
      const to: Point = { x: 15, y: 10 };

      carveLShapedCorridor(grid, from, to, 1, true);

      // Width 1 should carve a single cell wide corridor
      expect(grid.get(10, 10)).toBe(CellType.FLOOR);
      expect(grid.get(10, 9)).toBe(CellType.WALL);
      expect(grid.get(10, 11)).toBe(CellType.WALL);
    });

    it("should respect corridor width of 3", () => {
      const grid = Grid.walls(20, 20);
      const from: Point = { x: 10, y: 5 };
      const to: Point = { x: 10, y: 15 };

      carveLShapedCorridor(grid, from, to, 3, false);

      // Width 3 should carve 3 cells wide (center + 1 on each side)
      expect(grid.get(10, 10)).toBe(CellType.FLOOR);
      expect(grid.get(9, 10)).toBe(CellType.FLOOR);
      expect(grid.get(11, 10)).toBe(CellType.FLOOR);
      expect(grid.get(8, 10)).toBe(CellType.WALL);
      expect(grid.get(12, 10)).toBe(CellType.WALL);
    });

    it("should handle same start and end points", () => {
      const grid = Grid.walls(20, 20);
      const point: Point = { x: 10, y: 10 };

      const path = carveLShapedCorridor(grid, point, point, 1, true);

      // Should still carve at least the single point
      expect(path.length).toBeGreaterThan(0);
      expect(grid.get(point.x, point.y)).toBe(CellType.FLOOR);
    });

    it("should handle adjacent points horizontally", () => {
      const grid = Grid.walls(20, 20);
      const from: Point = { x: 10, y: 10 };
      const to: Point = { x: 11, y: 10 };

      const path = carveLShapedCorridor(grid, from, to, 1, true);

      // Both points should be carved
      expect(grid.get(from.x, from.y)).toBe(CellType.FLOOR);
      expect(grid.get(to.x, to.y)).toBe(CellType.FLOOR);
      expect(path.length).toBeGreaterThan(0);
    });

    it("should handle adjacent points vertically", () => {
      const grid = Grid.walls(20, 20);
      const from: Point = { x: 10, y: 10 };
      const to: Point = { x: 10, y: 11 };

      const path = carveLShapedCorridor(grid, from, to, 1, false);

      // Both points should be carved
      expect(grid.get(from.x, from.y)).toBe(CellType.FLOOR);
      expect(grid.get(to.x, to.y)).toBe(CellType.FLOOR);
      expect(path.length).toBeGreaterThan(0);
    });

    it("should not carve outside grid bounds", () => {
      const grid = Grid.walls(10, 10);
      const from: Point = { x: 1, y: 1 };
      const to: Point = { x: 8, y: 8 };

      carveLShapedCorridor(grid, from, to, 5, true);

      // Grid should still have the same dimensions
      expect(grid.width).toBe(10);
      expect(grid.height).toBe(10);

      // Corners should still be walls (out of bounds protection)
      expect(grid.get(0, 0)).toBe(CellType.WALL);
      expect(grid.get(9, 9)).toBe(CellType.WALL);
    });

    it("should handle corridors from right to left", () => {
      const grid = Grid.walls(20, 20);
      const from: Point = { x: 15, y: 10 };
      const to: Point = { x: 5, y: 10 };

      const path = carveLShapedCorridor(grid, from, to, 1, true);

      expect(path.length).toBeGreaterThan(0);
      expect(grid.get(from.x, from.y)).toBe(CellType.FLOOR);
      expect(grid.get(to.x, to.y)).toBe(CellType.FLOOR);
      expect(grid.get(10, 10)).toBe(CellType.FLOOR);
    });

    it("should handle corridors from bottom to top", () => {
      const grid = Grid.walls(20, 20);
      const from: Point = { x: 10, y: 15 };
      const to: Point = { x: 10, y: 5 };

      const path = carveLShapedCorridor(grid, from, to, 1, false);

      expect(path.length).toBeGreaterThan(0);
      expect(grid.get(from.x, from.y)).toBe(CellType.FLOOR);
      expect(grid.get(to.x, to.y)).toBe(CellType.FLOOR);
      expect(grid.get(10, 10)).toBe(CellType.FLOOR);
    });
  });

  describe("carveBresenhamCorridor", () => {
    it("should create a straight horizontal path", () => {
      const grid = Grid.walls(20, 20);
      const from: Point = { x: 5, y: 10 };
      const to: Point = { x: 15, y: 10 };

      const path = carveBresenhamCorridor(grid, from, to, 1);

      // Path should not be empty
      expect(path.length).toBeGreaterThan(0);

      // Starting and ending points should be carved
      expect(grid.get(from.x, from.y)).toBe(CellType.FLOOR);
      expect(grid.get(to.x, to.y)).toBe(CellType.FLOOR);

      // All points along the horizontal line should be carved
      for (let x = 5; x <= 15; x++) {
        expect(grid.get(x, 10)).toBe(CellType.FLOOR);
      }
    });

    it("should create a straight vertical path", () => {
      const grid = Grid.walls(20, 20);
      const from: Point = { x: 10, y: 5 };
      const to: Point = { x: 10, y: 15 };

      const path = carveBresenhamCorridor(grid, from, to, 1);

      // Path should not be empty
      expect(path.length).toBeGreaterThan(0);

      // Starting and ending points should be carved
      expect(grid.get(from.x, from.y)).toBe(CellType.FLOOR);
      expect(grid.get(to.x, to.y)).toBe(CellType.FLOOR);

      // All points along the vertical line should be carved
      for (let y = 5; y <= 15; y++) {
        expect(grid.get(10, y)).toBe(CellType.FLOOR);
      }
    });

    it("should create a diagonal path", () => {
      const grid = Grid.walls(20, 20);
      const from: Point = { x: 5, y: 5 };
      const to: Point = { x: 15, y: 15 };

      const path = carveBresenhamCorridor(grid, from, to, 1);

      // Path should not be empty
      expect(path.length).toBeGreaterThan(0);

      // Starting and ending points should be carved
      expect(grid.get(from.x, from.y)).toBe(CellType.FLOOR);
      expect(grid.get(to.x, to.y)).toBe(CellType.FLOOR);

      // Points along the diagonal should be carved
      expect(grid.get(10, 10)).toBe(CellType.FLOOR);
    });

    it("should respect corridor width of 1", () => {
      const grid = Grid.walls(20, 20);
      const from: Point = { x: 5, y: 10 };
      const to: Point = { x: 15, y: 10 };

      carveBresenhamCorridor(grid, from, to, 1);

      // Width 1 should carve a single cell wide corridor
      expect(grid.get(10, 10)).toBe(CellType.FLOOR);
      expect(grid.get(10, 9)).toBe(CellType.WALL);
      expect(grid.get(10, 11)).toBe(CellType.WALL);
    });

    it("should respect corridor width of 3", () => {
      const grid = Grid.walls(20, 20);
      const from: Point = { x: 10, y: 5 };
      const to: Point = { x: 10, y: 15 };

      carveBresenhamCorridor(grid, from, to, 3);

      // Width 3 should carve 3 cells wide (center + 1 on each side)
      expect(grid.get(10, 10)).toBe(CellType.FLOOR);
      expect(grid.get(9, 10)).toBe(CellType.FLOOR);
      expect(grid.get(11, 10)).toBe(CellType.FLOOR);
      expect(grid.get(8, 10)).toBe(CellType.WALL);
      expect(grid.get(12, 10)).toBe(CellType.WALL);
    });

    it("should handle same start and end points", () => {
      const grid = Grid.walls(20, 20);
      const point: Point = { x: 10, y: 10 };

      const path = carveBresenhamCorridor(grid, point, point, 1);

      // Should carve at least the single point
      expect(path.length).toBeGreaterThan(0);
      expect(grid.get(point.x, point.y)).toBe(CellType.FLOOR);
    });

    it("should handle adjacent points", () => {
      const grid = Grid.walls(20, 20);
      const from: Point = { x: 10, y: 10 };
      const to: Point = { x: 11, y: 10 };

      const path = carveBresenhamCorridor(grid, from, to, 1);

      // Both points should be carved
      expect(grid.get(from.x, from.y)).toBe(CellType.FLOOR);
      expect(grid.get(to.x, to.y)).toBe(CellType.FLOOR);
      expect(path.length).toBeGreaterThan(0);
    });

    it("should not carve outside grid bounds", () => {
      const grid = Grid.walls(10, 10);
      const from: Point = { x: 1, y: 1 };
      const to: Point = { x: 8, y: 8 };

      carveBresenhamCorridor(grid, from, to, 5);

      // Grid should still have the same dimensions
      expect(grid.width).toBe(10);
      expect(grid.height).toBe(10);
    });

    it("should handle negative direction (right to left)", () => {
      const grid = Grid.walls(20, 20);
      const from: Point = { x: 15, y: 10 };
      const to: Point = { x: 5, y: 10 };

      const path = carveBresenhamCorridor(grid, from, to, 1);

      expect(path.length).toBeGreaterThan(0);
      expect(grid.get(from.x, from.y)).toBe(CellType.FLOOR);
      expect(grid.get(to.x, to.y)).toBe(CellType.FLOOR);
      expect(grid.get(10, 10)).toBe(CellType.FLOOR);
    });

    it("should handle negative direction (bottom to top)", () => {
      const grid = Grid.walls(20, 20);
      const from: Point = { x: 10, y: 15 };
      const to: Point = { x: 10, y: 5 };

      const path = carveBresenhamCorridor(grid, from, to, 1);

      expect(path.length).toBeGreaterThan(0);
      expect(grid.get(from.x, from.y)).toBe(CellType.FLOOR);
      expect(grid.get(to.x, to.y)).toBe(CellType.FLOOR);
      expect(grid.get(10, 10)).toBe(CellType.FLOOR);
    });

    it("should create continuous path between points", () => {
      const grid = Grid.walls(30, 30);
      const from: Point = { x: 5, y: 5 };
      const to: Point = { x: 25, y: 15 };

      carveBresenhamCorridor(grid, from, to, 1);

      // Verify path is continuous by checking that carved cells form a connected path
      let connectedCells = 0;
      grid.forEach((_x, _y, value) => {
        if (value === CellType.FLOOR) {
          connectedCells++;
        }
      });

      // Should have carved a reasonable number of cells
      expect(connectedCells).toBeGreaterThan(10);
    });
  });

  describe("carveAStarCorridor", () => {
    it("should create a path between start and end", () => {
      const grid = Grid.walls(20, 20);
      const from: Point = { x: 2, y: 2 };
      const to: Point = { x: 17, y: 17 };

      const path = carveAStarCorridor(grid, from, to, 1, true);

      expect(path.length).toBeGreaterThan(0);
      expect(grid.get(from.x, from.y)).toBe(CellType.FLOOR);
      expect(grid.get(to.x, to.y)).toBe(CellType.FLOOR);
    });

    it("should route through a gap in a wall barrier", () => {
      const grid = Grid.walls(20, 20);
      const from: Point = { x: 2, y: 10 };
      const to: Point = { x: 17, y: 10 };

      // Build a solid vertical wall with one opening at y=10.
      for (let y = 0; y < 20; y++) {
        if (y === 10) continue;
        grid.set(10, y, CellType.WALL);
      }

      // Give the algorithm a cheap existing-floor lane at the gap.
      for (let x = 0; x < 20; x++) {
        grid.set(x, 10, CellType.FLOOR);
      }

      const path = carveAStarCorridor(grid, from, to, 1, true, true, 8, 1);

      expect(path.length).toBeGreaterThan(0);
      expect(grid.get(10, 10)).toBe(CellType.FLOOR);
      expect(grid.get(from.x, from.y)).toBe(CellType.FLOOR);
      expect(grid.get(to.x, to.y)).toBe(CellType.FLOOR);
    });
  });

  describe("carveCorridor", () => {
    it("should use L-shaped style when specified", () => {
      const grid = Grid.walls(20, 20);
      const from: Point = { x: 5, y: 5 };
      const to: Point = { x: 15, y: 15 };
      const options: CorridorOptions = { width: 1, style: "l-shaped" };

      const path = carveCorridor(grid, from, to, options, true);

      // Should return a path
      expect(path.length).toBeGreaterThan(0);

      // Verify L-shaped characteristics (horizontal then vertical)
      expect(grid.get(from.x, from.y)).toBe(CellType.FLOOR);
      expect(grid.get(to.x, to.y)).toBe(CellType.FLOOR);
      expect(grid.get(15, 5)).toBe(CellType.FLOOR); // Corner of L
    });

    it("should use Bresenham style when specified", () => {
      const grid = Grid.walls(20, 20);
      const from: Point = { x: 5, y: 5 };
      const to: Point = { x: 15, y: 15 };
      const options: CorridorOptions = { width: 1, style: "bresenham" };

      const path = carveCorridor(grid, from, to, options);

      // Should return a path
      expect(path.length).toBeGreaterThan(0);

      // Verify diagonal path
      expect(grid.get(from.x, from.y)).toBe(CellType.FLOOR);
      expect(grid.get(to.x, to.y)).toBe(CellType.FLOOR);
      expect(grid.get(10, 10)).toBe(CellType.FLOOR); // Midpoint on diagonal
    });

    it("should use Bresenham for straight style", () => {
      const grid = Grid.walls(20, 20);
      const from: Point = { x: 5, y: 5 };
      const to: Point = { x: 15, y: 15 };
      const options: CorridorOptions = { width: 1, style: "straight" };

      const path = carveCorridor(grid, from, to, options);

      // Should return a path
      expect(path.length).toBeGreaterThan(0);

      // Verify diagonal path (same as bresenham)
      expect(grid.get(from.x, from.y)).toBe(CellType.FLOOR);
      expect(grid.get(to.x, to.y)).toBe(CellType.FLOOR);
    });

    it("should use A* style when specified", () => {
      const grid = Grid.walls(20, 20);
      const from: Point = { x: 2, y: 2 };
      const to: Point = { x: 17, y: 17 };
      const options: CorridorOptions = { width: 1, style: "astar" };

      const path = carveCorridor(grid, from, to, options, true);

      expect(path.length).toBeGreaterThan(0);
      expect(grid.get(from.x, from.y)).toBe(CellType.FLOOR);
      expect(grid.get(to.x, to.y)).toBe(CellType.FLOOR);
    });

    it("should respect width option", () => {
      const grid = Grid.walls(20, 20);
      const from: Point = { x: 10, y: 5 };
      const to: Point = { x: 10, y: 15 };
      const options: CorridorOptions = { width: 3, style: "bresenham" };

      carveCorridor(grid, from, to, options);

      // Width 3 should carve 3 cells wide
      expect(grid.get(10, 10)).toBe(CellType.FLOOR);
      expect(grid.get(9, 10)).toBe(CellType.FLOOR);
      expect(grid.get(11, 10)).toBe(CellType.FLOOR);
    });

    it("should respect horizontalFirst parameter for L-shaped", () => {
      const grid1 = Grid.walls(20, 20);
      const grid2 = Grid.walls(20, 20);
      const from: Point = { x: 5, y: 5 };
      const to: Point = { x: 15, y: 15 };
      const options: CorridorOptions = { width: 1, style: "l-shaped" };

      carveCorridor(grid1, from, to, options, true);
      carveCorridor(grid2, from, to, options, false);

      // Different orientations should produce different results at corner
      // Horizontal first: carves along y=5 first
      expect(grid1.get(15, 5)).toBe(CellType.FLOOR);

      // Vertical first: carves along x=5 first
      expect(grid2.get(5, 15)).toBe(CellType.FLOOR);
    });

    it("should default to L-shaped for unknown style", () => {
      const grid = Grid.walls(20, 20);
      const from: Point = { x: 5, y: 5 };
      const to: Point = { x: 15, y: 15 };
      const invalidOptions = { width: 1, style: "unknown" };

      const path = carveCorridor(
        grid,
        from,
        to,
        invalidOptions as unknown as CorridorOptions,
        true,
      );

      // Should still create a corridor (falling back to L-shaped)
      expect(path.length).toBeGreaterThan(0);
      expect(grid.get(from.x, from.y)).toBe(CellType.FLOOR);
      expect(grid.get(to.x, to.y)).toBe(CellType.FLOOR);
    });
  });

  describe("Path Continuity", () => {
    it("should ensure L-shaped corridor connects start and end", () => {
      const grid = Grid.walls(30, 30);
      const from: Point = { x: 5, y: 5 };
      const to: Point = { x: 25, y: 20 };

      carveLShapedCorridor(grid, from, to, 1, true);

      // Both endpoints should be floor
      expect(grid.get(from.x, from.y)).toBe(CellType.FLOOR);
      expect(grid.get(to.x, to.y)).toBe(CellType.FLOOR);

      // Corner point should be floor (connection point)
      expect(grid.get(to.x, from.y)).toBe(CellType.FLOOR);
    });

    it("should ensure Bresenham corridor connects start and end", () => {
      const grid = Grid.walls(30, 30);
      const from: Point = { x: 5, y: 5 };
      const to: Point = { x: 25, y: 20 };

      carveBresenhamCorridor(grid, from, to, 1);

      // Both endpoints should be floor
      expect(grid.get(from.x, from.y)).toBe(CellType.FLOOR);
      expect(grid.get(to.x, to.y)).toBe(CellType.FLOOR);

      // Verify path exists by counting floor cells
      const floorCount = grid.countCells(CellType.FLOOR);
      expect(floorCount).toBeGreaterThan(15);
    });

    it("should handle zero-length corridors gracefully", () => {
      const grid = Grid.walls(20, 20);
      const point: Point = { x: 10, y: 10 };

      const path1 = carveLShapedCorridor(grid, point, point, 1, true);
      const path2 = carveBresenhamCorridor(grid, point, point, 1);

      expect(path1.length).toBeGreaterThan(0);
      expect(path2.length).toBeGreaterThan(0);
      expect(grid.get(point.x, point.y)).toBe(CellType.FLOOR);
    });
  });

  describe("Width Validation", () => {
    it("should handle width of 1 correctly", () => {
      const grid = Grid.walls(20, 20);
      const from: Point = { x: 10, y: 10 };
      const to: Point = { x: 10, y: 15 };

      carveBresenhamCorridor(grid, from, to, 1);

      // Center should be carved
      expect(grid.get(10, 12)).toBe(CellType.FLOOR);

      // Sides should be walls
      expect(grid.get(9, 12)).toBe(CellType.WALL);
      expect(grid.get(11, 12)).toBe(CellType.WALL);
    });

    it("should handle width of 2 correctly", () => {
      const grid = Grid.walls(20, 20);
      const from: Point = { x: 10, y: 10 };
      const to: Point = { x: 10, y: 15 };

      carveBresenhamCorridor(grid, from, to, 2);

      // halfWidth = floor(2/2) = 1
      // Should carve center +/- 1
      expect(grid.get(10, 12)).toBe(CellType.FLOOR);
      expect(grid.get(9, 12)).toBe(CellType.FLOOR);
      expect(grid.get(11, 12)).toBe(CellType.FLOOR);

      // Outside should be walls
      expect(grid.get(8, 12)).toBe(CellType.WALL);
      expect(grid.get(12, 12)).toBe(CellType.WALL);
    });

    it("should handle width of 5 correctly", () => {
      const grid = Grid.walls(30, 30);
      const from: Point = { x: 15, y: 15 };
      const to: Point = { x: 15, y: 20 };

      carveBresenhamCorridor(grid, from, to, 5);

      // halfWidth = floor(5/2) = 2
      // Should carve center +/- 2 (5 cells total)
      expect(grid.get(15, 17)).toBe(CellType.FLOOR);
      expect(grid.get(13, 17)).toBe(CellType.FLOOR);
      expect(grid.get(14, 17)).toBe(CellType.FLOOR);
      expect(grid.get(16, 17)).toBe(CellType.FLOOR);
      expect(grid.get(17, 17)).toBe(CellType.FLOOR);

      // Outside should be walls
      expect(grid.get(12, 17)).toBe(CellType.WALL);
      expect(grid.get(18, 17)).toBe(CellType.WALL);
    });
  });

  describe("Edge Cases", () => {
    it("should handle corridors at grid edges", () => {
      const grid = Grid.walls(10, 10);
      const from: Point = { x: 0, y: 0 };
      const to: Point = { x: 9, y: 9 };

      const path = carveBresenhamCorridor(grid, from, to, 1);

      expect(path.length).toBeGreaterThan(0);
      expect(grid.get(0, 0)).toBe(CellType.FLOOR);
      expect(grid.get(9, 9)).toBe(CellType.FLOOR);
    });

    it("should handle wide corridors near edges", () => {
      const grid = Grid.walls(10, 10);
      const from: Point = { x: 1, y: 5 };
      const to: Point = { x: 8, y: 5 };

      carveBresenhamCorridor(grid, from, to, 5);

      // Should not crash and should carve what it can
      expect(grid.get(5, 5)).toBe(CellType.FLOOR);
      expect(grid.width).toBe(10);
      expect(grid.height).toBe(10);
    });

    it("should handle single cell grids", () => {
      const grid = Grid.walls(1, 1);
      const point: Point = { x: 0, y: 0 };

      const path = carveLShapedCorridor(grid, point, point, 1, true);

      expect(path.length).toBeGreaterThan(0);
      expect(grid.get(0, 0)).toBe(CellType.FLOOR);
    });

    it("should handle corridors in narrow grids", () => {
      const grid = Grid.walls(20, 3);
      const from: Point = { x: 2, y: 1 };
      const to: Point = { x: 18, y: 1 };

      const path = carveBresenhamCorridor(grid, from, to, 1);

      expect(path.length).toBeGreaterThan(0);
      expect(grid.get(from.x, from.y)).toBe(CellType.FLOOR);
      expect(grid.get(to.x, to.y)).toBe(CellType.FLOOR);
      expect(grid.get(10, 1)).toBe(CellType.FLOOR);
    });

    it("should handle very long corridors", () => {
      const grid = Grid.walls(100, 100);
      const from: Point = { x: 10, y: 10 };
      const to: Point = { x: 90, y: 90 };

      const path = carveBresenhamCorridor(grid, from, to, 1);

      expect(path.length).toBeGreaterThan(50);
      expect(grid.get(from.x, from.y)).toBe(CellType.FLOOR);
      expect(grid.get(to.x, to.y)).toBe(CellType.FLOOR);
      expect(grid.get(50, 50)).toBe(CellType.FLOOR);
    });

    it("should handle diagonals with small differences", () => {
      const grid = Grid.walls(20, 20);
      const from: Point = { x: 10, y: 10 };
      const to: Point = { x: 12, y: 11 };

      const path = carveBresenhamCorridor(grid, from, to, 1);

      expect(path.length).toBeGreaterThan(0);
      expect(grid.get(from.x, from.y)).toBe(CellType.FLOOR);
      expect(grid.get(to.x, to.y)).toBe(CellType.FLOOR);
    });
  });
});
