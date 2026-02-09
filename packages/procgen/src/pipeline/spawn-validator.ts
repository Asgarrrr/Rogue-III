/**
 * Spawn Validation
 *
 * Utilities for validating and fixing spawn point positions.
 * This ensures spawns remain on valid floor tiles even after
 * post-processors modify the terrain.
 */

import { Grid } from "../core/grid/grid";
import { CellType } from "../core/grid/types";
import type { DungeonArtifact, SpawnPoint } from "./types";

/**
 * Result of spawn validation
 */
export interface SpawnValidationResult {
  /** Validated spawns (all on floor tiles) */
  readonly validSpawns: readonly SpawnPoint[];
  /** Number of spawns that were invalid */
  readonly invalidCount: number;
  /** Number of spawns that were relocated */
  readonly relocatedCount: number;
  /** Number of spawns that were removed (couldn't relocate) */
  readonly removedCount: number;
  /** Details of what happened to each invalid spawn */
  readonly fixes: readonly SpawnFix[];
}

/**
 * Information about how an invalid spawn was handled
 */
export interface SpawnFix {
  readonly originalSpawn: SpawnPoint;
  readonly action: "kept" | "relocated" | "removed";
  readonly newPosition?: { x: number; y: number };
  readonly reason: string;
}

/**
 * Options for spawn validation
 */
export interface SpawnValidationOptions {
  /** Whether to try relocating invalid spawns (default: true) */
  readonly relocateInvalid?: boolean;
  /** Maximum distance to search for valid position (default: 10) */
  readonly maxRelocationDistance?: number;
  /** Whether to log warnings for removed spawns (default: false) */
  readonly warnOnRemoval?: boolean;
}

const DEFAULT_OPTIONS: Required<SpawnValidationOptions> = {
  relocateInvalid: true,
  maxRelocationDistance: 10,
  warnOnRemoval: false,
};

/**
 * Find the nearest floor tile to a given position using breadth-first search.
 *
 * @param grid - The grid to search
 * @param startX - Starting X coordinate
 * @param startY - Starting Y coordinate
 * @param maxDistance - Maximum search radius
 * @returns Position of nearest floor tile, or null if none found
 */
export function findNearestFloorForSpawn(
  grid: Grid,
  startX: number,
  startY: number,
  maxDistance: number = 10,
): { x: number; y: number } | null {
  // If already on floor, return immediately
  if (grid.get(startX, startY) === CellType.FLOOR) {
    return { x: startX, y: startY };
  }

  // BFS to find nearest floor (allocation-free neighbor expansion)
  const width = grid.width;
  const height = grid.height;
  const visited = new Uint8Array(width * height);
  const queueX: number[] = [startX];
  const queueY: number[] = [startY];
  const queueDist: number[] = [0];
  visited[startY * width + startX] = 1;
  let queueHead = 0;

  while (queueHead < queueX.length) {
    const x = queueX[queueHead];
    const y = queueY[queueHead];
    const dist = queueDist[queueHead];
    queueHead++;
    if (x === undefined || y === undefined || dist === undefined) break;

    // Check if we've exceeded max distance
    if (dist >= maxDistance) {
      continue;
    }

    const nextDist = dist + 1;

    // Check all 4-connected neighbors in deterministic N, E, S, W order.
    // This preserves existing tie-breaking behavior from DIRECTIONS_4.

    // North
    if (y > 0) {
      const ny = y - 1;
      const index = ny * width + x;
      if (visited[index] === 0) {
        visited[index] = 1;
        if (grid.getUnsafe(x, ny) === CellType.FLOOR) {
          return { x, y: ny };
        }
        queueX.push(x);
        queueY.push(ny);
        queueDist.push(nextDist);
      }
    }

    // East
    if (x < width - 1) {
      const nx = x + 1;
      const index = y * width + nx;
      if (visited[index] === 0) {
        visited[index] = 1;
        if (grid.getUnsafe(nx, y) === CellType.FLOOR) {
          return { x: nx, y };
        }
        queueX.push(nx);
        queueY.push(y);
        queueDist.push(nextDist);
      }
    }

    // South
    if (y < height - 1) {
      const ny = y + 1;
      const index = ny * width + x;
      if (visited[index] === 0) {
        visited[index] = 1;
        if (grid.getUnsafe(x, ny) === CellType.FLOOR) {
          return { x, y: ny };
        }
        queueX.push(x);
        queueY.push(ny);
        queueDist.push(nextDist);
      }
    }

    // West
    if (x > 0) {
      const nx = x - 1;
      const index = y * width + nx;
      if (visited[index] === 0) {
        visited[index] = 1;
        if (grid.getUnsafe(nx, y) === CellType.FLOOR) {
          return { x: nx, y };
        }
        queueX.push(nx);
        queueY.push(y);
        queueDist.push(nextDist);
      }
    }
  }

  return null;
}

/**
 * Validate and fix spawn positions in a dungeon artifact.
 *
 * This should be called after any post-processor that modifies terrain
 * to ensure all spawns remain on valid floor tiles.
 *
 * @param dungeon - The dungeon to validate
 * @param options - Validation options
 * @returns Validation result with fixed spawns
 */
export function validateAndFixSpawns(
  dungeon: DungeonArtifact,
  options: SpawnValidationOptions = {},
): SpawnValidationResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Create grid from terrain
  const grid = new Grid(dungeon.width, dungeon.height, CellType.WALL);
  const terrain = dungeon.terrain;
  for (let y = 0; y < dungeon.height; y++) {
    for (let x = 0; x < dungeon.width; x++) {
      const cell = terrain[y * dungeon.width + x];
      if (cell !== undefined) {
        grid.set(x, y, cell as CellType);
      }
    }
  }

  const validSpawns: SpawnPoint[] = [];
  const fixes: SpawnFix[] = [];
  let invalidCount = 0;
  let relocatedCount = 0;
  let removedCount = 0;

  for (const spawn of dungeon.spawns) {
    const { x, y } = spawn.position;
    const index = y * dungeon.width + x;
    const cellType = dungeon.terrain[index];

    // Check if spawn is on a floor tile
    if (cellType === CellType.FLOOR) {
      validSpawns.push(spawn);
      continue;
    }

    // Spawn is invalid
    invalidCount++;

    if (opts.relocateInvalid) {
      // Try to find nearest floor tile
      const newPosition = findNearestFloorForSpawn(
        grid,
        x,
        y,
        opts.maxRelocationDistance,
      );

      if (newPosition) {
        // Relocate spawn
        const relocatedSpawn: SpawnPoint = {
          ...spawn,
          position: newPosition,
        };
        validSpawns.push(relocatedSpawn);
        relocatedCount++;

        fixes.push({
          originalSpawn: spawn,
          action: "relocated",
          newPosition,
          reason: `Original position (${x}, ${y}) was not floor, relocated to (${newPosition.x}, ${newPosition.y})`,
        });
      } else {
        // Couldn't find valid position, remove spawn
        removedCount++;

        fixes.push({
          originalSpawn: spawn,
          action: "removed",
          reason: `Original position (${x}, ${y}) was not floor and no valid position found within ${opts.maxRelocationDistance} tiles`,
        });

        if (opts.warnOnRemoval) {
          console.warn(
            `[procgen] Removed invalid spawn '${spawn.type}' at (${x}, ${y}) - no valid position found`,
          );
        }
      }
    } else {
      // Not relocating, just remove
      removedCount++;

      fixes.push({
        originalSpawn: spawn,
        action: "removed",
        reason: `Original position (${x}, ${y}) was not floor (relocation disabled)`,
      });
    }
  }

  return {
    validSpawns,
    invalidCount,
    relocatedCount,
    removedCount,
    fixes,
  };
}

/**
 * Re-validate spawns in a dungeon and return a new dungeon with fixed spawns.
 *
 * Convenience function that applies validateAndFixSpawns and returns the updated dungeon.
 *
 * @param dungeon - The dungeon to validate
 * @param options - Validation options
 * @returns New dungeon artifact with validated spawns
 */
export function revalidateSpawns(
  dungeon: DungeonArtifact,
  options: SpawnValidationOptions = {},
): DungeonArtifact {
  const result = validateAndFixSpawns(dungeon, options);

  return {
    ...dungeon,
    spawns: result.validSpawns,
  };
}
