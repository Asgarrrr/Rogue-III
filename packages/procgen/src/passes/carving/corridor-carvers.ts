/**
 * Corridor Carving Algorithms
 *
 * Reusable corridor carving passes for different dungeon generators.
 */

import type { Point } from "../../core/geometry/types";
import { CellType, type Grid } from "../../core/grid";

/**
 * Corridor style options
 */
export type CorridorStyle = "l-shaped" | "straight" | "bresenham";

/**
 * Corridor carving options
 */
export interface CorridorOptions {
  readonly width: number;
  readonly style: CorridorStyle;
}

/**
 * Carve an L-shaped corridor between two points
 */
export function carveLShapedCorridor(
  grid: Grid,
  from: Point,
  to: Point,
  width: number,
  horizontalFirst: boolean,
): Point[] {
  const path: Point[] = [];
  const halfWidth = Math.floor(width / 2);

  if (horizontalFirst) {
    // Horizontal segment first
    const startX = Math.min(from.x, to.x);
    const endX = Math.max(from.x, to.x);
    for (let x = startX; x <= endX; x++) {
      for (let dy = -halfWidth; dy <= halfWidth; dy++) {
        const y = from.y + dy;
        if (grid.isInBounds(x, y)) {
          grid.set(x, y, CellType.FLOOR);
          path.push({ x, y });
        }
      }
    }

    // Vertical segment
    const startY = Math.min(from.y, to.y);
    const endY = Math.max(from.y, to.y);
    for (let y = startY; y <= endY; y++) {
      for (let dx = -halfWidth; dx <= halfWidth; dx++) {
        const x = to.x + dx;
        if (grid.isInBounds(x, y)) {
          grid.set(x, y, CellType.FLOOR);
          path.push({ x, y });
        }
      }
    }
  } else {
    // Vertical segment first
    const startY = Math.min(from.y, to.y);
    const endY = Math.max(from.y, to.y);
    for (let y = startY; y <= endY; y++) {
      for (let dx = -halfWidth; dx <= halfWidth; dx++) {
        const x = from.x + dx;
        if (grid.isInBounds(x, y)) {
          grid.set(x, y, CellType.FLOOR);
          path.push({ x, y });
        }
      }
    }

    // Horizontal segment
    const startX = Math.min(from.x, to.x);
    const endX = Math.max(from.x, to.x);
    for (let x = startX; x <= endX; x++) {
      for (let dy = -halfWidth; dy <= halfWidth; dy++) {
        const y = to.y + dy;
        if (grid.isInBounds(x, y)) {
          grid.set(x, y, CellType.FLOOR);
          path.push({ x, y });
        }
      }
    }
  }

  return path;
}

/**
 * Carve a straight diagonal corridor using Bresenham's line algorithm
 */
export function carveBresenhamCorridor(
  grid: Grid,
  from: Point,
  to: Point,
  width: number,
): Point[] {
  const path: Point[] = [];
  const halfWidth = Math.floor(width / 2);

  let x0 = from.x;
  let y0 = from.y;
  const x1 = to.x;
  const y1 = to.y;

  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    // Carve a square around the current point
    for (let dx2 = -halfWidth; dx2 <= halfWidth; dx2++) {
      for (let dy2 = -halfWidth; dy2 <= halfWidth; dy2++) {
        const nx = x0 + dx2;
        const ny = y0 + dy2;
        if (grid.isInBounds(nx, ny)) {
          grid.set(nx, ny, CellType.FLOOR);
          path.push({ x: nx, y: ny });
        }
      }
    }

    if (x0 === x1 && y0 === y1) break;

    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }

  return path;
}

/**
 * Carve a corridor using the specified style
 */
export function carveCorridor(
  grid: Grid,
  from: Point,
  to: Point,
  options: CorridorOptions,
  horizontalFirst = true,
): Point[] {
  switch (options.style) {
    case "l-shaped":
      return carveLShapedCorridor(
        grid,
        from,
        to,
        options.width,
        horizontalFirst,
      );
    case "bresenham":
    case "straight":
      return carveBresenhamCorridor(grid, from, to, options.width);
    default:
      return carveLShapedCorridor(
        grid,
        from,
        to,
        options.width,
        horizontalFirst,
      );
  }
}
