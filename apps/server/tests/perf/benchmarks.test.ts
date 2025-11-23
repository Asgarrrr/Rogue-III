import { describe, expect, test } from "bun:test";
import { DungeonManager } from "../../src/engine/dungeon";
import { buildDungeonConfig } from "../../src/engine/dungeon/config/builder";
import { CellType, Grid } from "../../src/engine/dungeon/core/grid";
import { FloodFill } from "../../src/engine/dungeon/core/grid/flood-fill";
import { SeededRandom } from "../../src/engine/dungeon/core/random/seeded-random";

/**
 * Performance benchmarks with baseline expectations
 * These tests verify that performance doesn't regress below acceptable thresholds
 */

// Performance baselines (in milliseconds)
// Update these if you intentionally improve performance
const BASELINES = {
  // Dungeon generation (observed on 2025-11-21 with xorshift128+; padded for headroom)
  cellular_60x30: 25,
  cellular_120x90: 80,
  bsp_60x30: 15,
  bsp_120x90: 25,

  // Core operations
  grid_1000x1000_fill: 15,
  floodfill_500x500: 60,
  rng_1M_operations: 300, // 1M random numbers (64-bit xorshift128+)
};

function measure(fn: () => void, iterations = 1): number {
  const start = performance.now();
  for (let i = 0; i < iterations; i++) {
    fn();
  }
  return (performance.now() - start) / iterations;
}

describe("Performance Benchmarks", () => {
  describe("Dungeon Generation", () => {
    test("cellular 60x30 generates within baseline", () => {
      const config = buildDungeonConfig({
        width: 60,
        height: 30,
        algorithm: "cellular",
        roomCount: 0,
        roomSizeRange: [5, 12],
      });

      if (!config.success) throw new Error("Config failed");

      const elapsed = measure(() => {
        DungeonManager.generateFromSeedSync(12345, config.value);
      }, 5);

      expect(elapsed).toBeLessThan(BASELINES.cellular_60x30);
      console.log(
        `cellular 60x30: ${elapsed.toFixed(2)}ms (baseline: ${BASELINES.cellular_60x30}ms)`,
      );
    });

    test("cellular 120x90 generates within baseline", () => {
      const config = buildDungeonConfig({
        width: 120,
        height: 90,
        algorithm: "cellular",
        roomCount: 0,
        roomSizeRange: [5, 12],
      });

      if (!config.success) throw new Error("Config failed");

      const elapsed = measure(() => {
        DungeonManager.generateFromSeedSync(12345, config.value);
      }, 3);

      expect(elapsed).toBeLessThan(BASELINES.cellular_120x90);
      console.log(
        `cellular 120x90: ${elapsed.toFixed(2)}ms (baseline: ${BASELINES.cellular_120x90}ms)`,
      );
    });

    test("bsp 60x30 generates within baseline", () => {
      const config = buildDungeonConfig({
        width: 60,
        height: 30,
        algorithm: "bsp",
        roomCount: 8,
        roomSizeRange: [5, 12],
      });

      if (!config.success) throw new Error("Config failed");

      const elapsed = measure(() => {
        DungeonManager.generateFromSeedSync(12345, config.value);
      }, 5);

      expect(elapsed).toBeLessThan(BASELINES.bsp_60x30);
      console.log(
        `bsp 60x30: ${elapsed.toFixed(2)}ms (baseline: ${BASELINES.bsp_60x30}ms)`,
      );
    });

    test("bsp 120x90 generates within baseline", () => {
      const config = buildDungeonConfig({
        width: 120,
        height: 90,
        algorithm: "bsp",
        roomCount: 12,
        roomSizeRange: [5, 12],
      });

      if (!config.success) throw new Error("Config failed");

      const elapsed = measure(() => {
        DungeonManager.generateFromSeedSync(12345, config.value);
      }, 3);

      expect(elapsed).toBeLessThan(BASELINES.bsp_120x90);
      console.log(
        `bsp 120x90: ${elapsed.toFixed(2)}ms (baseline: ${BASELINES.bsp_120x90}ms)`,
      );
    });
  });

  describe("Grid Operations", () => {
    test("1000x1000 grid fill within baseline", () => {
      const grid = new Grid({ width: 1000, height: 1000 });

      const elapsed = measure(() => {
        grid.clear(CellType.WALL);
        for (let y = 100; y < 900; y++) {
          for (let x = 100; x < 900; x++) {
            grid.setCell(x, y, CellType.FLOOR);
          }
        }
      }, 3);

      expect(elapsed).toBeLessThan(BASELINES.grid_1000x1000_fill);
      console.log(
        `grid 1000x1000 fill: ${elapsed.toFixed(2)}ms (baseline: ${BASELINES.grid_1000x1000_fill}ms)`,
      );
    });

    test("flood fill 500x500 within baseline", () => {
      const grid = new Grid({ width: 500, height: 500 });

      const elapsed = measure(() => {
        // Reset grid for each iteration
        grid.clear(CellType.FLOOR);
        const regions = FloodFill.findRegions(grid, CellType.FLOOR, 1, false);
        expect(regions.length).toBeGreaterThan(0);
      }, 3);

      expect(elapsed).toBeLessThan(BASELINES.floodfill_500x500);
      console.log(
        `floodfill 500x500: ${elapsed.toFixed(2)}ms (baseline: ${BASELINES.floodfill_500x500}ms)`,
      );
    });
  });

  describe("RNG Operations", () => {
    test("1M random operations within baseline", () => {
      const rng = new SeededRandom(12345);

      const elapsed = measure(() => {
        for (let i = 0; i < 1000000; i++) {
          rng.next();
        }
      }, 3);

      expect(elapsed).toBeLessThan(BASELINES.rng_1M_operations);
      console.log(
        `rng 1M ops: ${elapsed.toFixed(2)}ms (baseline: ${BASELINES.rng_1M_operations}ms)`,
      );
    });
  });

  describe("Scalability", () => {
    test("generation time scales reasonably with size", () => {
      const sizes = [
        { w: 30, h: 20 },
        { w: 60, h: 40 },
        { w: 120, h: 80 },
      ];

      const times: number[] = [];

      for (const { w, h } of sizes) {
        const config = buildDungeonConfig({
          width: w,
          height: h,
          algorithm: "bsp",
          roomCount: Math.floor((w * h) / 200),
          roomSizeRange: [5, 12],
        });

        if (!config.success) throw new Error("Config failed");

        const elapsed = measure(() => {
          DungeonManager.generateFromSeedSync(12345, config.value);
        }, 3);

        times.push(elapsed);
        console.log(`${w}x${h}: ${elapsed.toFixed(2)}ms`);
      }

      // Time should scale roughly with area (O(n^2) is acceptable)
      // But not worse than O(n^3)
      const areaRatio = (sizes[2].w * sizes[2].h) / (sizes[0].w * sizes[0].h);
      const timeRatio = times[2] / times[0];

      // Allow up to cubic scaling (generous margin)
      expect(timeRatio).toBeLessThan(areaRatio * areaRatio);
    });
  });

  describe("Memory Efficiency", () => {
    test("large grid doesn't cause excessive allocations", () => {
      // This test ensures our numeric key optimization is working
      const grid = new Grid({ width: 2000, height: 2000 }, CellType.WALL);

      // Fill with vertical stripe pattern - 100 disconnected regions
      for (let x = 0; x < 2000; x += 20) {
        for (let y = 0; y < 2000; y++) {
          grid.setCell(x, y, CellType.FLOOR);
        }
      }

      const start = performance.now();
      const regions = FloodFill.findRegions(grid, CellType.FLOOR, 1, false);
      const elapsed = performance.now() - start;

      // Should complete in reasonable time (< 1000ms for 4M cells)
      expect(elapsed).toBeLessThan(1000);
      expect(regions.length).toBe(100); // 100 vertical stripes

      console.log(
        `2000x2000 region finding: ${elapsed.toFixed(2)}ms, ${regions.length} regions`,
      );
    });
  });
});
