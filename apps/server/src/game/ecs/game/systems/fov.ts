/**
 * FOV (Field of View) System
 *
 * Calculates visible cells using recursive shadowcasting algorithm.
 * Optimized with caching to avoid recalculation when position hasn't changed.
 */

import { SystemPhase } from "../../types";
import { defineSystem } from "../../core/system";
import type { World } from "../../core/world";
import type { PositionData } from "../components/spatial";
import type { FOVData, VisibleCellsData } from "../components/fov";
import { packCoords, unpackCoords } from "../components/fov";
import type { GameMap } from "../resources/game-map";
import type { EventQueue } from "../../core/events";

// Octant transformation matrices for shadowcasting
const OCTANT_TRANSFORMS = [
  [1, 0, 0, 1], // Octant 0
  [0, 1, 1, 0], // Octant 1
  [0, -1, 1, 0], // Octant 2
  [-1, 0, 0, 1], // Octant 3
  [-1, 0, 0, -1], // Octant 4
  [0, -1, -1, 0], // Octant 5
  [0, 1, -1, 0], // Octant 6
  [1, 0, 0, -1], // Octant 7
];

/**
 * FOV Calculator with caching and pooling.
 */
export class FOVCalculator {
  // Pool of pre-allocated result arrays
  private readonly resultPool: Uint32Array[];
  private poolIndex = 0;

  // Position cache for multiple entities at same location
  private readonly positionCache = new Map<
    bigint,
    { cells: Uint32Array; count: number; version: number }
  >();
  private cacheVersion = 0;

  constructor(
    private readonly maxRadius: number = 20,
    poolSize: number = 10,
  ) {
    // Pre-allocate pool (max size = (2*radius+1)^2)
    const maxCells = (2 * maxRadius + 1) ** 2;
    this.resultPool = Array.from(
      { length: poolSize },
      () => new Uint32Array(maxCells),
    );
  }

  /**
   * Computes FOV with intelligent caching.
   * Returns cached result if position hasn't changed.
   */
  compute(
    gameMap: GameMap,
    x: number,
    y: number,
    radius: number,
    previousResult?: VisibleCellsData,
  ): { cells: Uint32Array; count: number; version: number } {
    // Fast path: position identical -> return cache
    if (
      previousResult &&
      previousResult.centerX === x &&
      previousResult.centerY === y &&
      previousResult.radius === radius &&
      previousResult.version === this.cacheVersion
    ) {
      return {
        cells: previousResult.cells,
        count: previousResult.count,
        version: this.cacheVersion,
      };
    }

    // Check position cache (for multi-entity at same location)
    const posKey = this.makeCacheKey(x, y, radius);
    const cached = this.positionCache.get(posKey);
    if (cached && cached.version === this.cacheVersion) {
      return cached;
    }

    // Actually compute FOV
    const result = this.acquireFromPool();
    const count = this.shadowcast(gameMap, x, y, radius, result);

    const fovResult = { cells: result, count, version: this.cacheVersion };

    // Cache result
    this.positionCache.set(posKey, fovResult);

    return fovResult;
  }

  /**
   * Invalidates the cache (call when terrain changes).
   */
  invalidateCache(): void {
    this.cacheVersion++;
    // Limit cache size
    if (this.positionCache.size > 1000) {
      this.positionCache.clear();
    }
  }

  private acquireFromPool(): Uint32Array {
    const result = this.resultPool[this.poolIndex];
    this.poolIndex = (this.poolIndex + 1) % this.resultPool.length;
    return result;
  }

  private makeCacheKey(x: number, y: number, radius: number): bigint {
    // Use BigInt to avoid key collisions
    const COORD_OFFSET = 32768;
    return (
      (BigInt(x + COORD_OFFSET) << 32n) |
      (BigInt(y + COORD_OFFSET) << 16n) |
      BigInt(radius)
    );
  }

  /**
   * Recursive shadowcasting algorithm.
   * Based on: http://www.roguebasin.com/index.php?title=FOV_using_recursive_shadowcasting
   */
  private shadowcast(
    gameMap: GameMap,
    originX: number,
    originY: number,
    radius: number,
    result: Uint32Array,
  ): number {
    let count = 0;
    const radiusSq = radius * radius;

    // Origin is always visible
    result[count++] = packCoords(originX, originY);

    // Calculate each octant
    for (let octant = 0; octant < 8; octant++) {
      count = this.castOctant(
        gameMap,
        originX,
        originY,
        radius,
        radiusSq,
        1,
        1.0,
        0.0,
        OCTANT_TRANSFORMS[octant],
        result,
        count,
      );
    }

    return count;
  }

  private castOctant(
    gameMap: GameMap,
    originX: number,
    originY: number,
    radius: number,
    radiusSq: number,
    row: number,
    startSlope: number,
    endSlope: number,
    transform: number[],
    result: Uint32Array,
    count: number,
  ): number {
    if (startSlope < endSlope) return count;

    let nextStartSlope = startSlope;

    for (let distance = row; distance <= radius; distance++) {
      let blocked = false;

      for (let col = Math.round(-distance * startSlope); col <= 0; col++) {
        // Transform coordinates based on octant
        const dx = col * transform[0] + distance * transform[1];
        const dy = col * transform[2] + distance * transform[3];
        const mapX = originX + dx;
        const mapY = originY + dy;

        // Check bounds
        if (!gameMap.isInBounds(mapX, mapY)) continue;

        // Check distance (circle)
        const distSq = dx * dx + dy * dy;
        if (distSq > radiusSq) continue;

        const leftSlope = (col - 0.5) / (distance + 0.5);
        const rightSlope = (col + 0.5) / (distance - 0.5);

        if (rightSlope > startSlope) continue;
        if (leftSlope < endSlope) break;

        // Add visible cell
        result[count++] = packCoords(mapX, mapY);

        // Handle walls
        const isWall = gameMap.isOpaque(mapX, mapY);

        if (blocked) {
          if (isWall) {
            nextStartSlope = rightSlope;
          } else {
            blocked = false;
            startSlope = nextStartSlope;
          }
        } else if (isWall && distance < radius) {
          blocked = true;
          count = this.castOctant(
            gameMap,
            originX,
            originY,
            radius,
            radiusSq,
            distance + 1,
            startSlope,
            leftSlope,
            transform,
            result,
            count,
          );
          nextStartSlope = rightSlope;
        }
      }

      if (blocked) break;
    }

    return count;
  }
}

/**
 * Checks if a cell is visible in the given VisibleCells data.
 */
export function isCellVisible(
  visibleCells: { cells: Uint32Array; count: number },
  x: number,
  y: number,
): boolean {
  const packed = packCoords(x, y);
  const { cells, count } = visibleCells;

  // Linear search for small sets, could use binary search for large sets
  for (let i = 0; i < count; i++) {
    if (cells[i] === packed) return true;
  }
  return false;
}

/**
 * FOV System
 *
 * Calculates field of view for entities with FOV component.
 * Uses intelligent caching to avoid recalculation.
 */
export const FOVSystem = defineSystem("FOV")
  .inPhase(SystemPhase.PostUpdate)
  .execute((world: World) => {
    const gameMap = world.resources.get<GameMap>("gameMap");
    const fovCalculator = world.resources.get<FOVCalculator>("fovCalculator");

    if (!gameMap || !fovCalculator) return;

    const query = world.query({ with: ["Position", "FOV"], without: [] });

    for (const entity of query.execute()) {
      const pos = world.getComponent<PositionData>(entity, "Position");
      const fov = world.getComponent<FOVData>(entity, "FOV");

      if (!pos || !fov) continue;

      const x = Math.floor(pos.x);
      const y = Math.floor(pos.y);
      const radius = fov.radius;

      // Get previous result for cache check
      const previousVisible = world.getComponent<VisibleCellsData>(
        entity,
        "VisibleCells",
      );

      // Compute FOV (uses cache if position identical)
      const fovResult = fovCalculator.compute(
        gameMap,
        x,
        y,
        radius,
        previousVisible ?? undefined,
      );

      // Update only if changed
      if (!previousVisible || previousVisible.version !== fovResult.version) {
        world.setComponent(entity, "VisibleCells", {
          cells: fovResult.cells,
          count: fovResult.count,
          centerX: x,
          centerY: y,
          radius,
          version: fovResult.version,
        });

        // Mark tiles as explored
        for (let i = 0; i < fovResult.count; i++) {
          const { x: cx, y: cy } = unpackCoords(fovResult.cells[i]);
          gameMap.setExplored(cx, cy, true);
          gameMap.setVisible(cx, cy, true);
        }
      }
    }
  });

/**
 * Initializes FOV resources in the world.
 */
export function initializeFOVResources(
  world: World,
  maxRadius = 20,
  poolSize = 10,
): void {
  const fovCalculator = new FOVCalculator(maxRadius, poolSize);
  world.resources.register("fovCalculator", fovCalculator);

  // Invalidate cache when terrain changes
  const eventQueue = world.resources.get<EventQueue>("eventQueue");
  if (eventQueue) {
    eventQueue.on("terrain.changed", () => {
      fovCalculator.invalidateCache();
    });
  }
}
