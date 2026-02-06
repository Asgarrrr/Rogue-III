/**
 * Cellular Automata Fragment
 *
 * Standalone cellular automata operations for cave generation and terrain smoothing.
 */

import { CellType, Grid } from "../core/grid";

/**
 * Cellular automata configuration
 */
export interface CellularConfig {
  /** Number of floor neighbors required to birth a new floor */
  readonly birthLimit: number;
  /** Number of floor neighbors below which a floor dies */
  readonly deathLimit: number;
}

/**
 * Default cellular automata configuration (cave-like)
 */
export const DEFAULT_CELLULAR_CONFIG: CellularConfig = {
  birthLimit: 4,
  deathLimit: 3,
};

/**
 * Simple RNG interface
 */
interface RNG {
  next(): number;
}

/**
 * Initialize a grid with random floor tiles
 *
 * @param width - Grid width
 * @param height - Grid height
 * @param fillRatio - Probability of each cell being floor (0-1)
 * @param rng - Random number generator
 * @returns New grid with random initialization
 */
export function initializeRandomGrid(
  width: number,
  height: number,
  fillRatio: number,
  rng: RNG,
): Grid {
  const grid = new Grid(width, height, CellType.WALL);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (rng.next() < fillRatio) {
        grid.set(x, y, CellType.FLOOR);
      }
    }
  }

  return grid;
}

/**
 * Apply one step of cellular automata rules
 *
 * @param grid - Input grid (not modified)
 * @param config - Cellular automata rules
 * @returns New grid with rules applied
 */
export function cellularStep(
  grid: Grid,
  config: CellularConfig = DEFAULT_CELLULAR_CONFIG,
): Grid {
  const output = new Grid(grid.width, grid.height, CellType.WALL);

  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const neighbors = countFloorNeighbors(grid, x, y);
      const current = grid.get(x, y);

      if (current === CellType.FLOOR) {
        // Survive if enough neighbors
        output.set(
          x,
          y,
          neighbors >= config.deathLimit ? CellType.FLOOR : CellType.WALL,
        );
      } else {
        // Birth if enough neighbors
        output.set(
          x,
          y,
          neighbors >= config.birthLimit ? CellType.FLOOR : CellType.WALL,
        );
      }
    }
  }

  return output;
}

/**
 * Apply multiple iterations of cellular automata
 *
 * @param grid - Input grid (not modified)
 * @param iterations - Number of iterations
 * @param config - Cellular automata rules
 * @returns New grid after all iterations
 */
export function cellularSmooth(
  grid: Grid,
  iterations: number,
  config: CellularConfig = DEFAULT_CELLULAR_CONFIG,
): Grid {
  let current = grid;

  for (let i = 0; i < iterations; i++) {
    current = cellularStep(current, config);
  }

  return current;
}

/**
 * Apply cellular automata in-place (mutates grid)
 */
export function cellularSmoothInPlace(
  grid: Grid,
  iterations: number,
  config: CellularConfig = DEFAULT_CELLULAR_CONFIG,
): void {
  const buffer = new Grid(grid.width, grid.height, CellType.WALL);

  for (let iter = 0; iter < iterations; iter++) {
    // Calculate next state into buffer
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        const neighbors = countFloorNeighbors(grid, x, y);
        const current = grid.get(x, y);

        if (current === CellType.FLOOR) {
          buffer.set(
            x,
            y,
            neighbors >= config.deathLimit ? CellType.FLOOR : CellType.WALL,
          );
        } else {
          buffer.set(
            x,
            y,
            neighbors >= config.birthLimit ? CellType.FLOOR : CellType.WALL,
          );
        }
      }
    }

    // Copy buffer back to grid
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        grid.set(x, y, buffer.get(x, y));
      }
    }
  }
}

/**
 * Add noise to wall edges (rougher cave walls)
 *
 * @param grid - Grid to modify
 * @param noiseRatio - Probability of converting edge walls to floor
 * @param rng - Random number generator
 */
export function addWallNoise(grid: Grid, noiseRatio: number, rng: RNG): void {
  for (let y = 1; y < grid.height - 1; y++) {
    for (let x = 1; x < grid.width - 1; x++) {
      if (grid.get(x, y) !== CellType.WALL) continue;

      // Count floor neighbors
      let floorNeighbors = 0;
      for (const [dx, dy] of [
        [0, 1],
        [1, 0],
        [0, -1],
        [-1, 0],
      ] as const) {
        if (grid.get(x + dx, y + dy) === CellType.FLOOR) {
          floorNeighbors++;
        }
      }

      // Walls adjacent to floors have a chance to become floor
      if (floorNeighbors > 0 && rng.next() < noiseRatio * floorNeighbors) {
        grid.set(x, y, CellType.FLOOR);
      }
    }
  }
}

/**
 * Fill small isolated floor regions (clean up tiny caves)
 *
 * @param grid - Grid to modify
 * @param minRegionSize - Minimum floor tiles to keep a region
 */
export function fillSmallRegions(grid: Grid, minRegionSize: number): void {
  const visited = new Set<string>();

  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const key = `${x},${y}`;
      if (visited.has(key)) continue;
      if (grid.get(x, y) !== CellType.FLOOR) continue;

      // Flood fill to find region
      const region: Array<{ x: number; y: number }> = [];
      const queue: Array<{ x: number; y: number }> = [{ x, y }];
      visited.add(key);

      while (queue.length > 0) {
        const current = queue.shift();
        if (!current) break;
        region.push(current);

        for (const [dx, dy] of [
          [0, 1],
          [1, 0],
          [0, -1],
          [-1, 0],
        ] as const) {
          const nx = current.x + dx;
          const ny = current.y + dy;
          const nkey = `${nx},${ny}`;

          if (
            !visited.has(nkey) &&
            grid.isInBounds(nx, ny) &&
            grid.get(nx, ny) === CellType.FLOOR
          ) {
            visited.add(nkey);
            queue.push({ x: nx, y: ny });
          }
        }
      }

      // Fill if too small
      if (region.length < minRegionSize) {
        for (const cell of region) {
          grid.set(cell.x, cell.y, CellType.WALL);
        }
      }
    }
  }
}

/**
 * Keep only the largest connected floor region
 *
 * @param grid - Grid to modify
 * @returns Size of the largest region kept
 */
export function keepLargestRegion(grid: Grid): number {
  const visited = new Set<string>();
  const regions: Array<Array<{ x: number; y: number }>> = [];

  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const key = `${x},${y}`;
      if (visited.has(key)) continue;
      if (grid.get(x, y) !== CellType.FLOOR) continue;

      // Flood fill to find region
      const region: Array<{ x: number; y: number }> = [];
      const queue: Array<{ x: number; y: number }> = [{ x, y }];
      visited.add(key);

      while (queue.length > 0) {
        const current = queue.shift();
        if (!current) break;
        region.push(current);

        for (const [dx, dy] of [
          [0, 1],
          [1, 0],
          [0, -1],
          [-1, 0],
        ] as const) {
          const nx = current.x + dx;
          const ny = current.y + dy;
          const nkey = `${nx},${ny}`;

          if (
            !visited.has(nkey) &&
            grid.isInBounds(nx, ny) &&
            grid.get(nx, ny) === CellType.FLOOR
          ) {
            visited.add(nkey);
            queue.push({ x: nx, y: ny });
          }
        }
      }

      regions.push(region);
    }
  }

  if (regions.length === 0) return 0;

  // Find largest
  let largestIdx = 0;
  let largestSize = regions[0]?.length ?? 0;

  for (let i = 1; i < regions.length; i++) {
    const regionLength = regions[i]?.length ?? 0;
    if (regionLength > largestSize) {
      largestSize = regionLength;
      largestIdx = i;
    }
  }

  // Fill all non-largest regions
  for (let i = 0; i < regions.length; i++) {
    if (i === largestIdx) continue;
    const region = regions[i];
    if (!region) continue;
    for (const cell of region) {
      grid.set(cell.x, cell.y, CellType.WALL);
    }
  }

  return largestSize;
}

/**
 * Ensure border is always wall
 */
export function ensureWallBorder(grid: Grid): void {
  // Top and bottom
  for (let x = 0; x < grid.width; x++) {
    grid.set(x, 0, CellType.WALL);
    grid.set(x, grid.height - 1, CellType.WALL);
  }

  // Left and right
  for (let y = 0; y < grid.height; y++) {
    grid.set(0, y, CellType.WALL);
    grid.set(grid.width - 1, y, CellType.WALL);
  }
}

/**
 * Count floor neighbors (8-connected)
 */
function countFloorNeighbors(grid: Grid, x: number, y: number): number {
  let count = 0;

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;

      const nx = x + dx;
      const ny = y + dy;

      // Out of bounds counts as wall
      if (!grid.isInBounds(nx, ny)) {
        continue;
      }

      if (grid.get(nx, ny) === CellType.FLOOR) {
        count++;
      }
    }
  }

  return count;
}

/**
 * Get statistics about a grid
 */
export function getGridStats(grid: Grid): {
  floorCount: number;
  wallCount: number;
  floorRatio: number;
  regionCount: number;
  largestRegionSize: number;
} {
  let floorCount = 0;
  let wallCount = 0;

  const visited = new Set<string>();
  let regionCount = 0;
  let largestRegionSize = 0;

  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const cell = grid.get(x, y);

      if (cell === CellType.FLOOR) {
        floorCount++;

        const key = `${x},${y}`;
        if (!visited.has(key)) {
          // New region - flood fill
          regionCount++;
          let regionSize = 0;
          const queue: Array<{ x: number; y: number }> = [{ x, y }];
          visited.add(key);

          while (queue.length > 0) {
            const current = queue.shift();
            if (!current) break;
            regionSize++;

            for (const [dx, dy] of [
              [0, 1],
              [1, 0],
              [0, -1],
              [-1, 0],
            ] as const) {
              const nx = current.x + dx;
              const ny = current.y + dy;
              const nkey = `${nx},${ny}`;

              if (
                !visited.has(nkey) &&
                grid.isInBounds(nx, ny) &&
                grid.get(nx, ny) === CellType.FLOOR
              ) {
                visited.add(nkey);
                queue.push({ x: nx, y: ny });
              }
            }
          }

          largestRegionSize = Math.max(largestRegionSize, regionSize);
        }
      } else {
        wallCount++;
      }
    }
  }

  const total = grid.width * grid.height;

  return {
    floorCount,
    wallCount,
    floorRatio: floorCount / total,
    regionCount,
    largestRegionSize,
  };
}
