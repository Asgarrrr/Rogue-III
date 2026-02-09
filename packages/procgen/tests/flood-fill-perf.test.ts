/**
 * Performance test for findAllRegions optimization
 */
import { describe, expect, test } from "bun:test";
import { findAllRegions } from "../src/core/grid/flood-fill";
import { CellType, Grid } from "../src/core/grid";

describe("findAllRegions performance", () => {
  test("handles large grid with many regions efficiently", () => {
    const width = 200;
    const height = 200;
    const grid = new Grid(width, height);

    // Create a checkerboard pattern with many regions
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        grid.set(x, y, (x + y) % 2 === 0 ? CellType.WALL : CellType.FLOOR);
      }
    }

    const start = performance.now();
    const regions = findAllRegions(grid, CellType.FLOOR);
    const duration = performance.now() - start;

    console.log(
      `findAllRegions on ${width}x${height} grid: ${duration.toFixed(2)}ms`,
    );
    console.log(`Found ${regions.length} regions`);

    // Should complete in reasonable time (under 100ms for 200x200 grid)
    expect(duration).toBeLessThan(100);
    expect(regions.length).toBeGreaterThan(0);
  });

  test("handles grid with few large regions", () => {
    const width = 200;
    const height = 200;
    const grid = new Grid(width, height);

    // Fill grid with walls first
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        grid.set(x, y, CellType.WALL);
      }
    }

    // Create 2 separate floor regions
    for (let y = 10; y < 90; y++) {
      for (let x = 10; x < 90; x++) {
        grid.set(x, y, CellType.FLOOR);
      }
    }
    for (let y = 110; y < 190; y++) {
      for (let x = 110; x < 190; x++) {
        grid.set(x, y, CellType.FLOOR);
      }
    }

    const start = performance.now();
    const regions = findAllRegions(grid, CellType.FLOOR);
    const duration = performance.now() - start;

    console.log(`findAllRegions with large regions: ${duration.toFixed(2)}ms`);
    console.log(`Found ${regions.length} regions`);

    expect(duration).toBeLessThan(50);
    expect(regions.length).toBe(2);
  });
});
