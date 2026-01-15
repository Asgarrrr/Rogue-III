/**
 * BitGrid class unit tests
 */

import { describe, expect, it } from "bun:test";
import { BitGrid } from "../src/core/grid";

describe("BitGrid", () => {
  describe("construction", () => {
    it("creates grid with correct dimensions", () => {
      const grid = new BitGrid(100, 50);
      expect(grid.width).toBe(100);
      expect(grid.height).toBe(50);
    });

    it("initializes all bits to false", () => {
      const grid = new BitGrid(10, 10);
      for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 10; x++) {
          expect(grid.get(x, y)).toBe(false);
        }
      }
    });
  });

  describe("get/set operations", () => {
    it("sets and gets single bits", () => {
      const grid = new BitGrid(10, 10);
      grid.set(5, 5, true);
      expect(grid.get(5, 5)).toBe(true);
      expect(grid.get(4, 5)).toBe(false);
    });

    it("clears bits", () => {
      const grid = new BitGrid(10, 10);
      grid.set(5, 5, true);
      grid.set(5, 5, false);
      expect(grid.get(5, 5)).toBe(false);
    });

    it("returns false for out-of-bounds coordinates", () => {
      const grid = new BitGrid(10, 10);
      expect(grid.get(-1, 0)).toBe(false);
      expect(grid.get(0, -1)).toBe(false);
      expect(grid.get(10, 0)).toBe(false);
      expect(grid.get(0, 10)).toBe(false);
    });

    it("ignores out-of-bounds set operations", () => {
      const grid = new BitGrid(10, 10);
      grid.set(-1, 0, true);
      grid.set(10, 0, true);
      // Should not throw
    });
  });

  describe("point-based operations", () => {
    it("getAt returns correct value", () => {
      const grid = new BitGrid(10, 10);
      grid.set(3, 4, true);
      expect(grid.getAt({ x: 3, y: 4 })).toBe(true);
    });

    it("setAt modifies value", () => {
      const grid = new BitGrid(10, 10);
      grid.setAt({ x: 7, y: 8 }, true);
      expect(grid.get(7, 8)).toBe(true);
    });
  });

  describe("toggle", () => {
    it("toggles false to true", () => {
      const grid = new BitGrid(10, 10);
      grid.toggle(5, 5);
      expect(grid.get(5, 5)).toBe(true);
    });

    it("toggles true to false", () => {
      const grid = new BitGrid(10, 10);
      grid.set(5, 5, true);
      grid.toggle(5, 5);
      expect(grid.get(5, 5)).toBe(false);
    });
  });

  describe("clear", () => {
    it("clears all bits to false", () => {
      const grid = new BitGrid(10, 10);
      grid.set(1, 1, true);
      grid.set(5, 5, true);
      grid.set(9, 9, true);

      grid.clear();

      expect(grid.get(1, 1)).toBe(false);
      expect(grid.get(5, 5)).toBe(false);
      expect(grid.get(9, 9)).toBe(false);
    });
  });

  describe("fill", () => {
    it("sets all bits to true", () => {
      const grid = new BitGrid(10, 10);
      grid.fill();

      for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 10; x++) {
          expect(grid.get(x, y)).toBe(true);
        }
      }
    });
  });

  describe("count", () => {
    it("counts set bits correctly", () => {
      const grid = new BitGrid(10, 10);
      expect(grid.count()).toBe(0);

      grid.set(0, 0, true);
      grid.set(5, 5, true);
      grid.set(9, 9, true);

      expect(grid.count()).toBe(3);
    });

    it("counts all bits when filled", () => {
      const grid = new BitGrid(10, 10);
      grid.fill();
      expect(grid.count()).toBe(100);
    });
  });

  describe("clone", () => {
    it("creates independent copy", () => {
      const grid = new BitGrid(10, 10);
      grid.set(5, 5, true);

      const clone = grid.clone();
      expect(clone.get(5, 5)).toBe(true);

      // Modify original
      grid.set(5, 5, false);
      // Clone should be unchanged
      expect(clone.get(5, 5)).toBe(true);
    });
  });

  describe("bit packing correctness", () => {
    it("handles bits across Uint32 boundaries", () => {
      const grid = new BitGrid(100, 1);

      // Set bits near boundary (32 bits per Uint32)
      grid.set(31, 0, true);
      grid.set(32, 0, true);
      grid.set(63, 0, true);
      grid.set(64, 0, true);

      expect(grid.get(31, 0)).toBe(true);
      expect(grid.get(32, 0)).toBe(true);
      expect(grid.get(63, 0)).toBe(true);
      expect(grid.get(64, 0)).toBe(true);

      // Adjacent bits should be false
      expect(grid.get(30, 0)).toBe(false);
      expect(grid.get(33, 0)).toBe(false);
    });

    it("handles large grids efficiently", () => {
      const grid = new BitGrid(1000, 1000);

      // Set corners
      grid.set(0, 0, true);
      grid.set(999, 0, true);
      grid.set(0, 999, true);
      grid.set(999, 999, true);

      expect(grid.get(0, 0)).toBe(true);
      expect(grid.get(999, 999)).toBe(true);
      expect(grid.count()).toBe(4);
    });
  });

  describe("fromDimensions", () => {
    it("creates grid from dimensions object", () => {
      const grid = BitGrid.fromDimensions({ width: 50, height: 30 });
      expect(grid.width).toBe(50);
      expect(grid.height).toBe(30);
    });
  });

  describe("bounds checking", () => {
    it("isInBounds returns true for valid coordinates", () => {
      const grid = new BitGrid(10, 10);
      expect(grid.isInBounds(0, 0)).toBe(true);
      expect(grid.isInBounds(9, 9)).toBe(true);
    });

    it("isInBounds returns false for invalid coordinates", () => {
      const grid = new BitGrid(10, 10);
      expect(grid.isInBounds(-1, 0)).toBe(false);
      expect(grid.isInBounds(10, 0)).toBe(false);
    });
  });
});
