/**
 * Grid Utilities
 *
 * Helper functions for grid operations.
 */

import { CoordSet, FastQueue } from "../data-structures";
import type { Point } from "../geometry/types";
import type { Grid } from "./grid";
import { CellType } from "./types";

/**
 * Find the nearest floor tile to a given point using BFS spiral search.
 *
 * @param grid - The grid to search
 * @param x - Starting X coordinate
 * @param y - Starting Y coordinate
 * @param maxRadius - Maximum search radius (default: 50)
 * @returns The nearest floor point, or null if none found within radius
 */
export function findNearestFloor(
  grid: Grid,
  x: number,
  y: number,
  maxRadius: number = 50,
): Point | null {
  // If the point itself is floor, return it immediately
  if (grid.isInBounds(x, y) && grid.get(x, y) === CellType.FLOOR) {
    return { x, y };
  }

  // BFS with distance tracking using fast queue and coord set
  const visited = new CoordSet(grid.width, grid.height);
  const queue = new FastQueue<{ x: number; y: number; dist: number }>();
  queue.enqueue({ x, y, dist: 0 });

  // Cardinal directions for BFS
  const directions: ReadonlyArray<readonly [number, number]> = [
    [0, 1],
    [1, 0],
    [0, -1],
    [-1, 0],
  ];

  while (!queue.isEmpty) {
    const current = queue.dequeue();
    if (!current) break;

    if (visited.has(current.x, current.y)) continue;
    visited.add(current.x, current.y);

    if (current.dist > maxRadius) continue;

    // Check if this is a floor tile
    if (
      grid.isInBounds(current.x, current.y) &&
      grid.get(current.x, current.y) === CellType.FLOOR
    ) {
      return { x: current.x, y: current.y };
    }

    // Add neighbors to queue
    for (const [dx, dy] of directions) {
      if (dx === undefined || dy === undefined) continue;
      const nx = current.x + dx;
      const ny = current.y + dy;

      if (!visited.has(nx, ny) && grid.isInBounds(nx, ny)) {
        queue.enqueue({ x: nx, y: ny, dist: current.dist + 1 });
      }
    }
  }

  return null;
}

/**
 * Find the geometric center of a region and return the nearest walkable point.
 * Useful for cellular automata caves where the geometric center may be a wall.
 *
 * @param grid - The grid
 * @param bounds - The bounding box
 * @returns Walkable center point
 */
export function findWalkableCenter(
  grid: Grid,
  bounds: { minX: number; minY: number; maxX: number; maxY: number },
): Point {
  const geometricX = Math.floor((bounds.minX + bounds.maxX) / 2);
  const geometricY = Math.floor((bounds.minY + bounds.maxY) / 2);

  const walkable = findNearestFloor(grid, geometricX, geometricY);

  // Fallback to geometric center if no floor found (shouldn't happen in valid dungeons)
  return walkable ?? { x: geometricX, y: geometricY };
}
