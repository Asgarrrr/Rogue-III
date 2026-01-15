/**
 * Flood fill algorithms for region detection and connectivity.
 */

import type { Bounds, Point } from "../geometry/types";
import { BitGrid } from "./bit-grid";
import type { Grid } from "./grid";
import type { CellType, FloodFillConfig, Region } from "./types";

/**
 * Scanline flood fill - efficient for large areas
 */
export function floodFillScanline(
  grid: Grid,
  startX: number,
  startY: number,
  targetValue: CellType,
  visited: BitGrid,
): Point[] {
  if (!grid.isInBounds(startX, startY)) return [];
  if (grid.get(startX, startY) !== targetValue) return [];
  if (visited.get(startX, startY)) return [];

  const points: Point[] = [];
  const stack: [number, number][] = [[startX, startY]];

  while (stack.length > 0) {
    const item = stack.pop();
    if (!item) break;
    const [x, y] = item;

    // Find left boundary
    let left = x;
    while (
      left > 0 &&
      grid.get(left - 1, y) === targetValue &&
      !visited.get(left - 1, y)
    ) {
      left--;
    }

    // Find right boundary
    let right = x;
    while (
      right < grid.width - 1 &&
      grid.get(right + 1, y) === targetValue &&
      !visited.get(right + 1, y)
    ) {
      right++;
    }

    // Mark the entire span and check above/below
    let checkAbove = false;
    let checkBelow = false;

    for (let px = left; px <= right; px++) {
      if (!visited.get(px, y)) {
        visited.set(px, y, true);
        points.push({ x: px, y });

        // Check above
        if (y > 0) {
          const aboveMatch =
            grid.get(px, y - 1) === targetValue && !visited.get(px, y - 1);
          if (aboveMatch && !checkAbove) {
            stack.push([px, y - 1]);
            checkAbove = true;
          } else if (!aboveMatch) {
            checkAbove = false;
          }
        }

        // Check below
        if (y < grid.height - 1) {
          const belowMatch =
            grid.get(px, y + 1) === targetValue && !visited.get(px, y + 1);
          if (belowMatch && !checkBelow) {
            stack.push([px, y + 1]);
            checkBelow = true;
          } else if (!belowMatch) {
            checkBelow = false;
          }
        }
      }
    }
  }

  return points;
}

/**
 * Standard flood fill with configurable connectivity
 */
export function floodFill(
  grid: Grid,
  startX: number,
  startY: number,
  config: FloodFillConfig = {},
): Point[] {
  const { maxSize = Infinity, targetValue, diagonal = false } = config;

  if (!grid.isInBounds(startX, startY)) return [];

  const startValue = targetValue ?? grid.get(startX, startY);
  if (grid.get(startX, startY) !== startValue) return [];

  const visited = new BitGrid(grid.width, grid.height);
  const points: Point[] = [];
  const stack: Point[] = [{ x: startX, y: startY }];

  while (stack.length > 0 && points.length < maxSize) {
    const p = stack.pop();
    if (!p) break;

    if (
      !grid.isInBounds(p.x, p.y) ||
      visited.get(p.x, p.y) ||
      grid.get(p.x, p.y) !== startValue
    ) {
      continue;
    }

    visited.set(p.x, p.y, true);
    points.push(p);

    // Add neighbors
    const neighbors = diagonal
      ? grid.getNeighbors8(p.x, p.y)
      : grid.getNeighbors4(p.x, p.y);

    for (const n of neighbors) {
      if (!visited.get(n.x, n.y)) {
        stack.push(n);
      }
    }
  }

  return points;
}

/**
 * Find all connected regions of a specific cell type
 */
export function findRegions(
  grid: Grid,
  targetValue: CellType,
  config: { minSize?: number; diagonal?: boolean } = {},
): Region[] {
  const { minSize = 1, diagonal = false } = config;
  const visited = new BitGrid(grid.width, grid.height);
  const regions: Region[] = [];
  let nextId = 0;

  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (visited.get(x, y)) continue;
      if (grid.get(x, y) !== targetValue) continue;

      const points = diagonal
        ? floodFill(grid, x, y, { targetValue, diagonal: true })
        : floodFillScanline(grid, x, y, targetValue, visited);

      // Mark as visited for non-scanline fill
      if (diagonal) {
        for (const p of points) {
          visited.set(p.x, p.y, true);
        }
      }

      if (points.length >= minSize) {
        const bounds = computeBounds(points);
        regions.push({
          id: nextId++,
          points,
          bounds,
          size: points.length,
        });
      }
    }
  }

  return regions;
}

/**
 * Find the largest region of a specific cell type
 */
export function findLargestRegion(
  grid: Grid,
  targetValue: CellType,
  diagonal = false,
): Region | null {
  const regions = findRegions(grid, targetValue, { diagonal });

  if (regions.length === 0) return null;

  let largest: Region | null = null;
  for (const region of regions) {
    if (largest === null || region.size > largest.size) {
      largest = region;
    }
  }

  return largest;
}

/**
 * Check if two points are connected (same region)
 */
export function areConnected(
  grid: Grid,
  a: Point,
  b: Point,
  targetValue: CellType,
  diagonal = false,
): boolean {
  if (grid.get(a.x, a.y) !== targetValue) return false;
  if (grid.get(b.x, b.y) !== targetValue) return false;

  const region = floodFill(grid, a.x, a.y, { targetValue, diagonal });

  return region.some((p) => p.x === b.x && p.y === b.y);
}

/**
 * Compute bounding box for a set of points
 */
function computeBounds(points: readonly Point[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  return { minX, minY, maxX, maxY };
}
