import { describe, expect, test } from "bun:test";
import { CellType, Grid } from "@rogue/procgen";

describe("Grid", () => {
  describe("Constructor and initialization", () => {
    test("creates grid with correct dimensions", () => {
      const grid = new Grid({ width: 10, height: 20 });
      expect(grid.width).toBe(10);
      expect(grid.height).toBe(20);
    });

    test("initializes with FLOOR by default", () => {
      const grid = new Grid({ width: 5, height: 5 });
      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 5; x++) {
          expect(grid.getCell(x, y)).toBe(CellType.FLOOR);
        }
      }
    });

    test("initializes with specified value", () => {
      const grid = new Grid({ width: 5, height: 5 }, CellType.WALL);
      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 5; x++) {
          expect(grid.getCell(x, y)).toBe(CellType.WALL);
        }
      }
    });

    test("handles 1x1 grid", () => {
      const grid = new Grid({ width: 1, height: 1 });
      expect(grid.width).toBe(1);
      expect(grid.height).toBe(1);
      expect(grid.getCell(0, 0)).toBe(CellType.FLOOR);
    });
  });

  describe("isInBounds()", () => {
    const grid = new Grid({ width: 10, height: 8 });

    test("returns true for valid coordinates", () => {
      expect(grid.isInBounds(0, 0)).toBe(true);
      expect(grid.isInBounds(9, 7)).toBe(true);
      expect(grid.isInBounds(5, 4)).toBe(true);
    });

    test("returns false for negative coordinates", () => {
      expect(grid.isInBounds(-1, 0)).toBe(false);
      expect(grid.isInBounds(0, -1)).toBe(false);
      expect(grid.isInBounds(-5, -5)).toBe(false);
    });

    test("returns false for coordinates >= dimensions", () => {
      expect(grid.isInBounds(10, 0)).toBe(false);
      expect(grid.isInBounds(0, 8)).toBe(false);
      expect(grid.isInBounds(10, 8)).toBe(false);
    });
  });

  describe("getCell/setCell", () => {
    test("sets and gets cell values", () => {
      const grid = new Grid({ width: 5, height: 5 });

      grid.setCell(2, 3, CellType.WALL);
      expect(grid.getCell(2, 3)).toBe(CellType.WALL);

      grid.setCell(2, 3, CellType.FLOOR);
      expect(grid.getCell(2, 3)).toBe(CellType.FLOOR);
    });

    test("getCell returns WALL for out of bounds", () => {
      const grid = new Grid({ width: 5, height: 5 });

      expect(grid.getCell(-1, 0)).toBe(CellType.WALL);
      expect(grid.getCell(0, -1)).toBe(CellType.WALL);
      expect(grid.getCell(5, 0)).toBe(CellType.WALL);
      expect(grid.getCell(0, 5)).toBe(CellType.WALL);
    });

    test("setCell ignores out of bounds", () => {
      const grid = new Grid({ width: 5, height: 5 });

      // These should not throw
      grid.setCell(-1, 0, CellType.WALL);
      grid.setCell(0, -1, CellType.WALL);
      grid.setCell(5, 0, CellType.WALL);
      grid.setCell(0, 5, CellType.WALL);

      // Grid should remain unchanged
      expect(grid.getCell(0, 0)).toBe(CellType.FLOOR);
    });
  });

  describe("getCellUnsafe/setCellUnsafe", () => {
    test("sets and gets cell values without bounds checking", () => {
      const grid = new Grid({ width: 5, height: 5 });

      grid.setCellUnsafe(2, 3, CellType.WALL);
      expect(grid.getCellUnsafe(2, 3)).toBe(CellType.WALL);
    });

    test("is faster than safe version for bulk operations", () => {
      const grid = new Grid({ width: 100, height: 100 });

      // This should not throw for valid coordinates
      for (let y = 0; y < 100; y++) {
        for (let x = 0; x < 100; x++) {
          grid.setCellUnsafe(x, y, CellType.WALL);
        }
      }

      expect(grid.getCellUnsafe(50, 50)).toBe(CellType.WALL);
    });
  });

  describe("countNeighbors4()", () => {
    test("counts 4-connected neighbors correctly", () => {
      const grid = new Grid({ width: 5, height: 5 }, CellType.FLOOR);

      // Set some walls
      grid.setCell(2, 1, CellType.WALL); // North of (2,2)
      grid.setCell(3, 2, CellType.WALL); // East of (2,2)

      expect(grid.countNeighbors4(2, 2, CellType.WALL)).toBe(2);
    });

    test("treats out of bounds as walls", () => {
      const grid = new Grid({ width: 5, height: 5 }, CellType.FLOOR);

      // Corner cell (0,0) has 2 OOB neighbors (counted as walls)
      expect(grid.countNeighbors4(0, 0, CellType.WALL)).toBe(2);

      // Edge cell (0,2) has 1 OOB neighbor
      expect(grid.countNeighbors4(0, 2, CellType.WALL)).toBe(1);
    });

    test("returns 0 when no neighbors match", () => {
      const grid = new Grid({ width: 5, height: 5 }, CellType.WALL);

      // Clear center and its neighbors
      grid.setCell(2, 2, CellType.FLOOR);
      grid.setCell(2, 1, CellType.FLOOR);
      grid.setCell(3, 2, CellType.FLOOR);
      grid.setCell(2, 3, CellType.FLOOR);
      grid.setCell(1, 2, CellType.FLOOR);

      expect(grid.countNeighbors4(2, 2, CellType.WALL)).toBe(0);
    });

    test("returns 4 when all neighbors match", () => {
      const grid = new Grid({ width: 5, height: 5 }, CellType.WALL);

      expect(grid.countNeighbors4(2, 2, CellType.WALL)).toBe(4);
    });
  });

  describe("countNeighbors8()", () => {
    test("counts 8-connected neighbors correctly", () => {
      const grid = new Grid({ width: 5, height: 5 }, CellType.FLOOR);

      // Set diagonal walls around (2,2)
      grid.setCell(1, 1, CellType.WALL);
      grid.setCell(3, 3, CellType.WALL);

      expect(grid.countNeighbors8(2, 2, CellType.WALL)).toBe(2);
    });

    test("treats out of bounds as walls", () => {
      const grid = new Grid({ width: 5, height: 5 }, CellType.FLOOR);

      // Corner cell (0,0) has 5 OOB neighbors (3 top + 1 left + 1 diagonal)
      expect(grid.countNeighbors8(0, 0, CellType.WALL)).toBe(5);
    });

    test("returns 8 when all neighbors are walls", () => {
      const grid = new Grid({ width: 5, height: 5 }, CellType.WALL);

      expect(grid.countNeighbors8(2, 2, CellType.WALL)).toBe(8);
    });
  });

  describe("getNeighbors4()", () => {
    test("returns 4 neighbors for center cell", () => {
      const grid = new Grid({ width: 5, height: 5 });
      const neighbors = grid.getNeighbors4(2, 2);

      expect(neighbors).toHaveLength(4);
    });

    test("returns 2 neighbors for corner cell", () => {
      const grid = new Grid({ width: 5, height: 5 });
      const neighbors = grid.getNeighbors4(0, 0);

      expect(neighbors).toHaveLength(2);
      expect(neighbors).toContainEqual({ x: 1, y: 0 });
      expect(neighbors).toContainEqual({ x: 0, y: 1 });
    });

    test("returns 3 neighbors for edge cell", () => {
      const grid = new Grid({ width: 5, height: 5 });
      const neighbors = grid.getNeighbors4(0, 2);

      expect(neighbors).toHaveLength(3);
    });
  });

  describe("getNeighbors8()", () => {
    test("returns 8 neighbors for center cell", () => {
      const grid = new Grid({ width: 5, height: 5 });
      const neighbors = grid.getNeighbors8(2, 2);

      expect(neighbors).toHaveLength(8);
    });

    test("returns 3 neighbors for corner cell", () => {
      const grid = new Grid({ width: 5, height: 5 });
      const neighbors = grid.getNeighbors8(0, 0);

      expect(neighbors).toHaveLength(3);
    });
  });

  describe("fillRect()", () => {
    test("fills rectangular area", () => {
      const grid = new Grid({ width: 10, height: 10 });

      grid.fillRect(2, 3, 4, 3, CellType.WALL);

      // Check filled area
      for (let y = 3; y < 6; y++) {
        for (let x = 2; x < 6; x++) {
          expect(grid.getCell(x, y)).toBe(CellType.WALL);
        }
      }

      // Check outside area
      expect(grid.getCell(1, 3)).toBe(CellType.FLOOR);
      expect(grid.getCell(6, 3)).toBe(CellType.FLOOR);
    });

    test("clips to grid bounds", () => {
      const grid = new Grid({ width: 5, height: 5 });

      // Rect extends past bounds
      grid.fillRect(3, 3, 10, 10, CellType.WALL);

      // Only fills within bounds
      expect(grid.getCell(4, 4)).toBe(CellType.WALL);
      expect(grid.getCell(3, 3)).toBe(CellType.WALL);
    });

    test("handles negative start coordinates", () => {
      const grid = new Grid({ width: 5, height: 5 });

      grid.fillRect(-2, -2, 5, 5, CellType.WALL);

      // Should fill from 0,0 to 2,2
      expect(grid.getCell(0, 0)).toBe(CellType.WALL);
      expect(grid.getCell(2, 2)).toBe(CellType.WALL);
      expect(grid.getCell(3, 3)).toBe(CellType.FLOOR);
    });
  });

  describe("countCellsInRect()", () => {
    test("counts cells of specified type", () => {
      const grid = new Grid({ width: 10, height: 10 });

      grid.fillRect(0, 0, 5, 5, CellType.WALL);

      expect(grid.countCellsInRect(0, 0, 5, 5, CellType.WALL)).toBe(25);
      expect(grid.countCellsInRect(0, 0, 5, 5, CellType.FLOOR)).toBe(0);
    });

    test("clips to grid bounds", () => {
      const grid = new Grid({ width: 5, height: 5 }, CellType.WALL);

      expect(grid.countCellsInRect(0, 0, 100, 100, CellType.WALL)).toBe(25);
    });
  });

  describe("clone()", () => {
    test("creates independent copy", () => {
      const grid = new Grid({ width: 5, height: 5 });
      grid.setCell(2, 2, CellType.WALL);

      const clone = grid.clone();

      // Clone has same values
      expect(clone.getCell(2, 2)).toBe(CellType.WALL);

      // Modifying clone doesn't affect original
      clone.setCell(2, 2, CellType.FLOOR);
      expect(grid.getCell(2, 2)).toBe(CellType.WALL);
      expect(clone.getCell(2, 2)).toBe(CellType.FLOOR);
    });

    test("preserves dimensions", () => {
      const grid = new Grid({ width: 10, height: 20 });
      const clone = grid.clone();

      expect(clone.width).toBe(10);
      expect(clone.height).toBe(20);
    });
  });

  describe("clear()", () => {
    test("clears to FLOOR by default", () => {
      const grid = new Grid({ width: 5, height: 5 }, CellType.WALL);

      grid.clear();

      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 5; x++) {
          expect(grid.getCell(x, y)).toBe(CellType.FLOOR);
        }
      }
    });

    test("clears to specified value", () => {
      const grid = new Grid({ width: 5, height: 5 });

      grid.clear(CellType.WALL);

      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 5; x++) {
          expect(grid.getCell(x, y)).toBe(CellType.WALL);
        }
      }
    });
  });

  describe("fromBooleanGrid/toBooleanGrid", () => {
    test("converts from boolean grid", () => {
      const boolGrid = [
        [true, false, true],
        [false, true, false],
      ];

      const grid = Grid.fromBooleanGrid(boolGrid);

      expect(grid.width).toBe(3);
      expect(grid.height).toBe(2);
      expect(grid.getCell(0, 0)).toBe(CellType.WALL);
      expect(grid.getCell(1, 0)).toBe(CellType.FLOOR);
      expect(grid.getCell(1, 1)).toBe(CellType.WALL);
    });

    test("converts to boolean grid", () => {
      const grid = new Grid({ width: 3, height: 2 });
      grid.setCell(0, 0, CellType.WALL);
      grid.setCell(2, 0, CellType.WALL);
      grid.setCell(1, 1, CellType.WALL);

      const boolGrid = grid.toBooleanGrid();

      expect(boolGrid).toEqual([
        [true, false, true],
        [false, true, false],
      ]);
    });

    test("round-trip conversion preserves data", () => {
      const original = [
        [true, false, true, false],
        [false, true, false, true],
        [true, true, false, false],
      ];

      const grid = Grid.fromBooleanGrid(original);
      const result = grid.toBooleanGrid();

      expect(result).toEqual(original);
    });

    test("handles empty grid", () => {
      const grid = Grid.fromBooleanGrid([]);
      expect(grid.width).toBe(0);
      expect(grid.height).toBe(0);
    });
  });

  describe("applyCellularAutomata()", () => {
    test("applies survival/birth rules", () => {
      const grid = new Grid({ width: 5, height: 5 }, CellType.FLOOR);

      // Create a pattern
      grid.setCell(1, 2, CellType.WALL);
      grid.setCell(2, 2, CellType.WALL);
      grid.setCell(3, 2, CellType.WALL);

      // Apply CA rules (survival=4, birth=5 should kill most cells)
      const result = grid.applyCellularAutomata(4, 5);

      // Result should be different grid
      expect(result).not.toBe(grid);
      expect(result.width).toBe(5);
      expect(result.height).toBe(5);
    });

    test("returns new grid, original unchanged", () => {
      const grid = new Grid({ width: 5, height: 5 }, CellType.WALL);

      const result = grid.applyCellularAutomata(4, 5);

      // Original unchanged
      expect(grid.getCell(2, 2)).toBe(CellType.WALL);

      // Result is separate
      expect(result).not.toBe(grid);
    });
  });

  describe("getRawData()", () => {
    test("returns underlying array", () => {
      const grid = new Grid({ width: 3, height: 3 });
      const data = grid.getRawData();

      expect(data).toBeInstanceOf(Uint8Array);
      expect(data.length).toBe(9);
    });

    test("modifications affect grid", () => {
      const grid = new Grid({ width: 3, height: 3 });
      const data = grid.getRawData();

      // Modify raw data
      data[4] = CellType.WALL; // Center cell (1,1)

      expect(grid.getCell(1, 1)).toBe(CellType.WALL);
    });
  });

  describe("Edge cases", () => {
    test("handles large grid", () => {
      const grid = new Grid({ width: 500, height: 500 });

      grid.setCell(250, 250, CellType.WALL);
      expect(grid.getCell(250, 250)).toBe(CellType.WALL);
    });

    test("handles rectangular non-square grid", () => {
      const grid = new Grid({ width: 100, height: 10 });

      grid.setCell(99, 9, CellType.WALL);
      expect(grid.getCell(99, 9)).toBe(CellType.WALL);
      expect(grid.isInBounds(99, 10)).toBe(false);
    });
  });
});
