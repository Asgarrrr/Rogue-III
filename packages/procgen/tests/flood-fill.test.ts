/**
 * Flood fill algorithm unit tests
 */

import { describe, expect, it } from "bun:test";
import { CellType, Grid } from "../src/core/grid";
import { BitGrid } from "../src/core/grid/bit-grid";
import {
  areConnected,
  findLargestRegion,
  findRegions,
  floodFill,
  floodFillScanline,
} from "../src/core/grid/flood-fill";

describe("floodFill", () => {
  it("fills connected region", () => {
    const grid = new Grid(10, 10, CellType.WALL);
    // Create a 3x3 floor area
    grid.fillRect(2, 2, 3, 3, CellType.FLOOR);

    const points = floodFill(grid, 3, 3, { targetValue: CellType.FLOOR });

    expect(points).toHaveLength(9);
  });

  it("respects walls", () => {
    const grid = new Grid(10, 10, CellType.FLOOR);
    // Add a wall dividing the grid
    for (let y = 0; y < 10; y++) {
      grid.set(5, y, CellType.WALL);
    }

    const points = floodFill(grid, 2, 5, { targetValue: CellType.FLOOR });

    // Should only fill left side (5 * 10 = 50 cells)
    expect(points).toHaveLength(50);
  });

  it("returns empty for out-of-bounds start", () => {
    const grid = new Grid(10, 10);
    const points = floodFill(grid, -1, 0);
    expect(points).toHaveLength(0);
  });

  it("returns empty when start doesn't match target", () => {
    const grid = new Grid(10, 10, CellType.WALL);
    const points = floodFill(grid, 5, 5, { targetValue: CellType.FLOOR });
    expect(points).toHaveLength(0);
  });

  it("respects maxSize limit", () => {
    const grid = new Grid(10, 10, CellType.FLOOR);
    const points = floodFill(grid, 5, 5, {
      targetValue: CellType.FLOOR,
      maxSize: 10,
    });
    expect(points).toHaveLength(10);
  });

  it("supports diagonal connectivity", () => {
    const grid = new Grid(5, 5, CellType.WALL);
    // Create a diagonal line of floor tiles
    grid.set(0, 0, CellType.FLOOR);
    grid.set(1, 1, CellType.FLOOR);
    grid.set(2, 2, CellType.FLOOR);

    // Without diagonal: only 1 cell
    const points4 = floodFill(grid, 0, 0, {
      targetValue: CellType.FLOOR,
      diagonal: false,
    });
    expect(points4).toHaveLength(1);

    // With diagonal: all 3 cells
    const points8 = floodFill(grid, 0, 0, {
      targetValue: CellType.FLOOR,
      diagonal: true,
    });
    expect(points8).toHaveLength(3);
  });
});

describe("floodFillScanline", () => {
  it("fills connected region efficiently", () => {
    const grid = new Grid(100, 100, CellType.FLOOR);
    const visited = new BitGrid(100, 100);

    const points = floodFillScanline(grid, 50, 50, CellType.FLOOR, visited);

    // Should fill entire grid
    expect(points).toHaveLength(10000);
  });

  it("handles narrow corridors", () => {
    const grid = new Grid(20, 10, CellType.WALL);
    // Create a narrow corridor
    for (let x = 0; x < 20; x++) {
      grid.set(x, 5, CellType.FLOOR);
    }

    const visited = new BitGrid(20, 10);
    const points = floodFillScanline(grid, 0, 5, CellType.FLOOR, visited);

    expect(points).toHaveLength(20);
  });

  it("marks cells as visited", () => {
    const grid = new Grid(10, 10, CellType.FLOOR);
    const visited = new BitGrid(10, 10);

    floodFillScanline(grid, 5, 5, CellType.FLOOR, visited);

    // All cells should be visited
    expect(visited.count()).toBe(100);
  });
});

describe("findRegions", () => {
  it("finds all disconnected regions", () => {
    const grid = new Grid(20, 10, CellType.WALL);

    // Create two separate floor regions
    grid.fillRect(1, 1, 3, 3, CellType.FLOOR); // Region 1: 9 cells
    grid.fillRect(10, 1, 5, 5, CellType.FLOOR); // Region 2: 25 cells

    const regions = findRegions(grid, CellType.FLOOR);

    expect(regions).toHaveLength(2);
    expect(regions.map((r) => r.size).sort((a, b) => a - b)).toEqual([9, 25]);
  });

  it("respects minSize filter", () => {
    const grid = new Grid(20, 10, CellType.WALL);

    // Create regions of different sizes
    grid.set(1, 1, CellType.FLOOR); // Size 1
    grid.fillRect(5, 1, 2, 2, CellType.FLOOR); // Size 4
    grid.fillRect(10, 1, 3, 3, CellType.FLOOR); // Size 9

    const regions = findRegions(grid, CellType.FLOOR, { minSize: 5 });

    expect(regions).toHaveLength(1);
    expect(regions[0]?.size).toBe(9);
  });

  it("returns empty array when no regions found", () => {
    const grid = new Grid(10, 10, CellType.WALL);
    const regions = findRegions(grid, CellType.FLOOR);
    expect(regions).toHaveLength(0);
  });

  it("computes correct bounds for each region", () => {
    const grid = new Grid(20, 20, CellType.WALL);
    grid.fillRect(5, 5, 4, 6, CellType.FLOOR);

    const regions = findRegions(grid, CellType.FLOOR);

    expect(regions).toHaveLength(1);
    expect(regions[0]?.bounds).toEqual({
      minX: 5,
      minY: 5,
      maxX: 8,
      maxY: 10,
    });
  });
});

describe("findLargestRegion", () => {
  it("returns largest region", () => {
    const grid = new Grid(30, 10, CellType.WALL);

    grid.fillRect(1, 1, 3, 3, CellType.FLOOR); // 9 cells
    grid.fillRect(10, 1, 5, 5, CellType.FLOOR); // 25 cells
    grid.fillRect(20, 1, 4, 4, CellType.FLOOR); // 16 cells

    const largest = findLargestRegion(grid, CellType.FLOOR);

    expect(largest).not.toBeNull();
    expect(largest?.size).toBe(25);
  });

  it("returns null when no regions exist", () => {
    const grid = new Grid(10, 10, CellType.WALL);
    const largest = findLargestRegion(grid, CellType.FLOOR);
    expect(largest).toBeNull();
  });

  it("returns the region when only one exists", () => {
    const grid = new Grid(10, 10, CellType.WALL);
    grid.fillRect(2, 2, 4, 4, CellType.FLOOR);

    const largest = findLargestRegion(grid, CellType.FLOOR);

    expect(largest).not.toBeNull();
    expect(largest?.size).toBe(16);
  });
});

describe("areConnected", () => {
  it("returns true for connected points", () => {
    const grid = new Grid(10, 10, CellType.FLOOR);

    const connected = areConnected(
      grid,
      { x: 0, y: 0 },
      { x: 9, y: 9 },
      CellType.FLOOR,
    );

    expect(connected).toBe(true);
  });

  it("returns false for disconnected points", () => {
    const grid = new Grid(10, 10, CellType.FLOOR);

    // Add wall dividing grid
    for (let y = 0; y < 10; y++) {
      grid.set(5, y, CellType.WALL);
    }

    const connected = areConnected(
      grid,
      { x: 0, y: 0 },
      { x: 9, y: 9 },
      CellType.FLOOR,
    );

    expect(connected).toBe(false);
  });

  it("returns false when points aren't on target value", () => {
    const grid = new Grid(10, 10, CellType.WALL);
    grid.fillRect(2, 2, 3, 3, CellType.FLOOR);

    const connected = areConnected(
      grid,
      { x: 0, y: 0 }, // On wall
      { x: 3, y: 3 }, // On floor
      CellType.FLOOR,
    );

    expect(connected).toBe(false);
  });

  it("returns true for same point", () => {
    const grid = new Grid(10, 10, CellType.FLOOR);

    const connected = areConnected(
      grid,
      { x: 5, y: 5 },
      { x: 5, y: 5 },
      CellType.FLOOR,
    );

    expect(connected).toBe(true);
  });
});
