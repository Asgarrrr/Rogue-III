/**
 * Flood fill algorithms for region detection and connectivity.
 */

import type { Bounds, Point } from "../geometry/types";
import { type BitGrid, BitGridPool } from "./bit-grid";
import type { Grid } from "./grid";
import type { CellType, FloodFillConfig, Region } from "./types";

const BFS_DIRECTIONS_4: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [1, 0],
  [0, -1],
  [-1, 0],
] as const;

// ============================================================================
// Packed Coordinate Utilities
// ============================================================================

/**
 * Pack x,y coordinates into a single number.
 * Format: (y << 16) | x - supports coordinates up to 65535.
 */
export function packCoord(x: number, y: number): number {
  return (y << 16) | x;
}

/**
 * Unpack x coordinate from packed value.
 */
export function unpackX(packed: number): number {
  return packed & 0xffff;
}

/**
 * Unpack y coordinate from packed value.
 */
export function unpackY(packed: number): number {
  return packed >>> 16;
}

/**
 * Unpack packed coordinate to Point object.
 */
export function unpackToPoint(packed: number): Point {
  return { x: packed & 0xffff, y: packed >>> 16 };
}

/**
 * Iterate over packed coordinates without allocating Point objects.
 */
export function forEachPackedCoord(
  packed: Uint32Array,
  callback: (x: number, y: number, index: number) => void,
): void {
  for (let i = 0; i < packed.length; i++) {
    const p = packed[i]!;
    callback(p & 0xffff, p >>> 16, i);
  }
}

/**
 * Convert packed coordinate array to Point array.
 * Use only when Point[] is required by API.
 */
export function packedToPoints(packed: Uint32Array): Point[] {
  const points: Point[] = new Array(packed.length);
  for (let i = 0; i < packed.length; i++) {
    const p = packed[i]!;
    points[i] = { x: p & 0xffff, y: p >>> 16 };
  }
  return points;
}

// ============================================================================
// Region Helper Functions
// ============================================================================

/**
 * Get all points from a Region as Point[] array.
 * Unpacks the packedPoints on demand.
 */
export function regionGetPoints(region: Region): Point[] {
  return packedToPoints(region.packedPoints);
}

/**
 * Iterate over Region points without allocating Point objects.
 */
export function forEachRegionPoint(
  region: Region,
  callback: (x: number, y: number, index: number) => void,
): void {
  forEachPackedCoord(region.packedPoints, callback);
}

/**
 * Get a specific point from a Region by index.
 */
export function regionGetPointAt(region: Region, index: number): Point {
  const p = region.packedPoints[index]!;
  return { x: p & 0xffff, y: p >>> 16 };
}

/**
 * Get x,y coordinates from Region at index without creating Point object.
 */
export function regionGetCoordsAt(
  region: Region,
  index: number,
): { x: number; y: number } {
  const p = region.packedPoints[index]!;
  return { x: p & 0xffff, y: p >>> 16 };
}

/**
 * Scanline flood fill returning packed coordinates (Uint32Array).
 * More memory-efficient than Point[] - use when you only need to iterate or count.
 * Format: (y << 16) | x
 */
export function floodFillScanlinePacked(
  grid: Grid,
  startX: number,
  startY: number,
  targetValue: CellType,
  visited: BitGrid,
): Uint32Array {
  if (!grid.isInBounds(startX, startY)) return new Uint32Array(0);
  if (grid.get(startX, startY) !== targetValue) return new Uint32Array(0);
  if (visited.get(startX, startY)) return new Uint32Array(0);

  // Growable typed buffer to avoid number[] + Uint32Array.from intermediate allocs.
  const maxCells = grid.width * grid.height;
  let packed = new Uint32Array(Math.min(256, Math.max(1, maxCells)));
  let packedCount = 0;
  const stack: number[] = [(startY << 16) | startX];

  const pushPacked = (value: number): void => {
    if (packedCount >= packed.length) {
      const grown = new Uint32Array(
        Math.min(maxCells, Math.max(packed.length * 2, packed.length + 1)),
      );
      grown.set(packed);
      packed = grown;
    }
    packed[packedCount++] = value;
  };

  while (stack.length > 0) {
    const coord = stack.pop();
    if (coord === undefined) break;
    const x = coord & 0xffff;
    const y = coord >>> 16;

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
        pushPacked((y << 16) | px);

        // Check above
        if (y > 0) {
          const aboveMatch =
            grid.get(px, y - 1) === targetValue && !visited.get(px, y - 1);
          if (aboveMatch && !checkAbove) {
            stack.push(((y - 1) << 16) | px);
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
            stack.push(((y + 1) << 16) | px);
            checkBelow = true;
          } else if (!belowMatch) {
            checkBelow = false;
          }
        }
      }
    }
  }

  if (packedCount === packed.length) {
    return packed;
  }
  return packed.slice(0, packedCount);
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

  // Acquire BitGrid from pool instead of allocating new one
  const visited = BitGridPool.acquire(grid.width, grid.height);
  const points: Point[] = [];
  const width = grid.width;

  // Use packed integers instead of Point objects to reduce GC pressure
  const stack: number[] = [startY * width + startX];

  while (stack.length > 0 && points.length < maxSize) {
    const coord = stack.pop();
    if (coord === undefined) break;

    // Unpack coordinates
    const x = coord % width;
    const y = Math.floor(coord / width);

    if (
      !grid.isInBounds(x, y) ||
      visited.get(x, y) ||
      grid.get(x, y) !== startValue
    ) {
      continue;
    }

    visited.set(x, y, true);
    points.push({ x, y });

    // Add neighbors using callback pattern with packed coordinates
    const addNeighbor = (nx: number, ny: number) => {
      if (!visited.get(nx, ny)) {
        stack.push(ny * width + nx);
      }
    };

    if (diagonal) {
      grid.forEachNeighbor8(x, y, addNeighbor);
    } else {
      grid.forEachNeighbor4(x, y, addNeighbor);
    }
  }

  // Release BitGrid back to pool for reuse
  BitGridPool.release(visited);

  return points;
}

/**
 * Convert Point[] to packed Uint32Array.
 */
function pointsToPacked(points: readonly Point[]): Uint32Array {
  const packed = new Uint32Array(points.length);
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    packed[i] = (p.y << 16) | p.x;
  }
  return packed;
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
  // Acquire BitGrid from pool instead of allocating new one
  const visited = BitGridPool.acquire(grid.width, grid.height);
  const regions: Region[] = [];
  let nextId = 0;

  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (visited.get(x, y)) continue;
      if (grid.get(x, y) !== targetValue) continue;

      if (diagonal) {
        // Diagonal mode: use standard flood fill, then convert to packed
        const points = floodFill(grid, x, y, { targetValue, diagonal: true });
        for (const p of points) {
          visited.set(p.x, p.y, true);
        }
        if (points.length >= minSize) {
          const bounds = computeBounds(points);
          const packedPoints = pointsToPacked(points);
          regions.push({
            id: nextId++,
            packedPoints,
            bounds,
            size: points.length,
          });
        }
      } else {
        // Non-diagonal: use packed version directly
        const packedPoints = floodFillScanlinePacked(
          grid,
          x,
          y,
          targetValue,
          visited,
        );
        if (packedPoints.length >= minSize) {
          const bounds = computeBoundsPacked(packedPoints);
          regions.push({
            id: nextId++,
            packedPoints,
            bounds,
            size: packedPoints.length,
          });
        }
      }
    }
  }

  // Release BitGrid back to pool for reuse
  BitGridPool.release(visited);

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

/**
 * Compute bounding box for packed coordinates (Uint32Array).
 * Format: (y << 16) | x
 */
function computeBoundsPacked(packed: Uint32Array): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < packed.length; i++) {
    const p = packed[i]!;
    const x = p & 0xffff;
    const y = p >>> 16;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  return { minX, minY, maxX, maxY };
}

/**
 * Generic flood fill using BFS with configurable predicate.
 * Uses BitGrid and index-based queue for O(n) performance.
 *
 * @param width - Grid width
 * @param height - Grid height
 * @param startX - Starting X coordinate
 * @param startY - Starting Y coordinate
 * @param canVisit - Predicate to test if a cell can be visited
 * @param globalVisited - Optional global visited BitGrid to mark cells in (for region finding)
 * @param onVisit - Optional callback invoked for each visited cell
 * @returns BitGrid marking visited cells (caller should release via BitGridPool.release())
 */
export function floodFillBFS(
  width: number,
  height: number,
  startX: number,
  startY: number,
  canVisit: (x: number, y: number) => boolean,
  globalVisited?: BitGrid,
  onVisit?: (x: number, y: number) => void,
): BitGrid {
  // Acquire BitGrid from pool (caller must release when done)
  const visited = BitGridPool.acquire(width, height);
  const queue: number[] = [startY * width + startX];
  let queueHead = 0;

  visited.set(startX, startY, true);
  globalVisited?.set(startX, startY, true);

  while (queueHead < queue.length) {
    const coord = queue[queueHead++]!;
    const x = coord % width;
    const y = Math.floor(coord / width);
    onVisit?.(x, y);

    for (const [dx, dy] of BFS_DIRECTIONS_4) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

      if (visited.get(nx, ny)) continue;
      if (!canVisit(nx, ny)) continue;

      visited.set(nx, ny, true);
      globalVisited?.set(nx, ny, true);
      queue.push(ny * width + nx);
    }
  }

  return visited;
}

/**
 * Find all connected regions of a specific cell type using optimized BFS.
 *
 * @param grid - Grid to analyze
 * @param targetType - Cell type to find regions for
 * @returns Array of regions, each represented as a BitGrid (caller should release via BitGridPool.release())
 */
export function findAllRegions(
  grid: Grid,
  targetType: CellType,
): Array<BitGrid> {
  // Acquire BitGrid from pool for visited tracking
  const visited = BitGridPool.acquire(grid.width, grid.height);
  const regions: Array<BitGrid> = [];
  const { width, height } = grid;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (visited.get(x, y)) continue;
      if (grid.get(x, y) !== targetType) continue;

      // Found a new region - flood fill it and mark cells in visited simultaneously
      // Note: floodFillBFS acquires from pool; returned regions must be released by caller
      const region = floodFillBFS(
        width,
        height,
        x,
        y,
        (nx, ny) => grid.get(nx, ny) === targetType,
        visited, // Pass visited grid to mark cells during flood fill
      );

      regions.push(region);
    }
  }

  // Release the visited BitGrid back to pool
  BitGridPool.release(visited);

  return regions;
}
