/**
 * Cellular Automata Generator Passes
 *
 * Individual passes for cave-like dungeon generation using cellular automata.
 * Uses DungeonStateArtifact to carry full state through the pipeline.
 */

import type { Point } from "../../core/geometry/types";
import { CellType, Grid } from "../../core/grid";
import { findLargestRegion, findRegions } from "../../core/grid/flood-fill";
import type { Region } from "../../core/grid/types";
import { calculateChecksum } from "../../core/hash";
import type {
  Connection,
  DungeonArtifact,
  DungeonStateArtifact,
  EmptyArtifact,
  Pass,
  Room,
  SpawnPoint,
} from "../../pipeline/types";
import { DEFAULT_CELLULAR_CONFIG } from "../../pipeline/types";

// =============================================================================
// INITIALIZE RANDOM PASS
// =============================================================================

/**
 * Creates initial dungeon state with randomly filled grid
 */
export function initializeRandom(): Pass<EmptyArtifact, DungeonStateArtifact> {
  return {
    id: "cellular.initialize-random",
    inputType: "empty",
    outputType: "dungeon-state",
    run(_input, ctx) {
      const config = { ...DEFAULT_CELLULAR_CONFIG, ...ctx.config.cellular };
      const rng = ctx.streams.layout;
      const grid = new Grid(ctx.config.width, ctx.config.height, CellType.WALL);

      // Fill randomly based on fillRatio
      let floorCount = 0;
      let wallCount = 0;

      for (let y = 0; y < ctx.config.height; y++) {
        for (let x = 0; x < ctx.config.width; x++) {
          // Keep edges as walls for containment
          if (
            x === 0 ||
            y === 0 ||
            x === ctx.config.width - 1 ||
            y === ctx.config.height - 1
          ) {
            grid.set(x, y, CellType.WALL);
            wallCount++;
          } else if (rng.next() < config.initialFillRatio) {
            grid.set(x, y, CellType.FLOOR);
            floorCount++;
          } else {
            grid.set(x, y, CellType.WALL);
            wallCount++;
          }
        }
      }

      ctx.trace.decision(
        "cellular.initialize-random",
        "Initial random fill",
        [`${(config.initialFillRatio * 100).toFixed(0)}% floor ratio`],
        `${floorCount}/${floorCount + wallCount}`,
        `Created ${ctx.config.width}x${ctx.config.height} grid with ${floorCount} floor tiles (${((floorCount / (floorCount + wallCount)) * 100).toFixed(1)}%)`,
      );

      return {
        type: "dungeon-state",
        id: "dungeon-state",
        width: ctx.config.width,
        height: ctx.config.height,
        grid,
        rooms: [],
        edges: [],
        connections: [],
        spawns: [],
      };
    },
  };
}

// =============================================================================
// APPLY CELLULAR RULES PASS
// =============================================================================

/**
 * Applies cellular automata rules for multiple iterations
 */
export function applyCellularRules(): Pass<
  DungeonStateArtifact,
  DungeonStateArtifact
> {
  return {
    id: "cellular.apply-rules",
    inputType: "dungeon-state",
    outputType: "dungeon-state",
    run(input, ctx) {
      const config = { ...DEFAULT_CELLULAR_CONFIG, ...ctx.config.cellular };
      let currentGrid = input.grid;

      // Use double buffering to avoid allocation
      let bufferGrid = new Grid(input.width, input.height, CellType.WALL);

      for (let i = 0; i < config.iterations; i++) {
        // Apply rules: wall survives if >= birthLimit neighbors, floor becomes wall if >= deathLimit neighbors
        // Note: The Grid's applyCellularAutomata uses different convention:
        // - survivalMin: wall stays wall if neighbors >= this
        // - birthMin: floor becomes wall if neighbors >= this
        currentGrid.applyCellularAutomataInto(
          config.birthLimit,
          config.deathLimit,
          bufferGrid,
        );

        // Swap buffers
        const temp = currentGrid;
        currentGrid = bufferGrid;
        bufferGrid = temp;

        const floorCount = currentGrid.countCells(CellType.FLOOR);
        ctx.trace.decision(
          "cellular.apply-rules",
          `Iteration ${i + 1}/${config.iterations}`,
          ["birth", "death"],
          `${floorCount} floors`,
          `Applied rules: birth=${config.birthLimit}, death=${config.deathLimit}`,
        );
      }

      ctx.trace.decision(
        "cellular.apply-rules",
        "Cellular automata complete",
        [],
        config.iterations,
        `${config.iterations} iterations applied`,
      );

      return {
        ...input,
        grid: currentGrid,
      };
    },
  };
}

// =============================================================================
// FIND LARGEST REGION PASS
// =============================================================================

/**
 * Finds the largest connected floor region and removes smaller ones.
 * If connectAllRegions is true, keeps all regions instead of just the largest.
 */
export function keepLargestRegion(): Pass<
  DungeonStateArtifact,
  DungeonStateArtifact
> {
  return {
    id: "cellular.keep-largest-region",
    inputType: "dungeon-state",
    outputType: "dungeon-state",
    run(input, ctx) {
      const config = { ...DEFAULT_CELLULAR_CONFIG, ...ctx.config.cellular };
      const grid = input.grid;
      const connectAllRegions = config.connectAllRegions ?? false;

      // Find all floor regions
      const regions = findRegions(grid, CellType.FLOOR, { minSize: 1 });

      if (regions.length === 0) {
        ctx.trace.warning(
          "cellular.keep-largest-region",
          "No floor regions found!",
        );
        return input;
      }

      // Find largest region
      const largest = findLargestRegion(grid, CellType.FLOOR);

      if (!largest || largest.size < config.minRegionSize) {
        ctx.trace.warning(
          "cellular.keep-largest-region",
          `Largest region (${largest?.size ?? 0}) is smaller than minimum (${config.minRegionSize})`,
        );
      }

      const rooms: Room[] = [];

      if (connectAllRegions) {
        // Keep all regions that meet minimum size
        const validRegions = regions.filter(
          (r) => r.size >= config.minRegionSize,
        );

        // Remove only regions that are too small
        for (const region of regions) {
          if (region.size < config.minRegionSize) {
            for (const point of region.points) {
              grid.set(point.x, point.y, CellType.WALL);
            }
          }
        }

        // Create a room for each valid region
        for (const region of validRegions) {
          const bounds = region.bounds;
          rooms.push({
            id: region.id,
            x: bounds.minX,
            y: bounds.minY,
            width: bounds.maxX - bounds.minX + 1,
            height: bounds.maxY - bounds.minY + 1,
            centerX: Math.floor((bounds.minX + bounds.maxX) / 2),
            centerY: Math.floor((bounds.minY + bounds.maxY) / 2),
            type: "cavern",
            seed: Math.floor(ctx.streams.rooms.next() * 0xffffffff),
          });
        }

        ctx.trace.decision(
          "cellular.keep-largest-region",
          "Region selection (connectAllRegions=true)",
          regions.map((r) => `${r.id}: ${r.size}`),
          `${validRegions.length} regions kept`,
          `Kept ${validRegions.length} regions (>= ${config.minRegionSize} tiles), removed ${regions.length - validRegions.length} small regions`,
        );
      } else {
        // Original behavior: keep only the largest region
        // Create a set of points in the largest region for fast lookup
        const largestSet = new Set(
          largest?.points.map((p) => `${p.x},${p.y}`) ?? [],
        );

        // Fill all other floor tiles with walls
        let removedCount = 0;
        for (const region of regions) {
          if (region.id === largest?.id) continue;

          for (const point of region.points) {
            const key = `${point.x},${point.y}`;
            if (!largestSet.has(key)) {
              grid.set(point.x, point.y, CellType.WALL);
              removedCount++;
            }
          }
        }

        ctx.trace.decision(
          "cellular.keep-largest-region",
          "Region selection",
          regions.map((r) => `${r.id}: ${r.size}`),
          `Region ${largest?.id}: ${largest?.size}`,
          `Kept largest region (${largest?.size} tiles), removed ${regions.length - 1} smaller regions (${removedCount} tiles)`,
        );

        // Create a pseudo-room representing the entire cavern
        if (largest && largest.size >= config.minRegionSize) {
          const bounds = largest.bounds;
          rooms.push({
            id: 0,
            x: bounds.minX,
            y: bounds.minY,
            width: bounds.maxX - bounds.minX + 1,
            height: bounds.maxY - bounds.minY + 1,
            centerX: Math.floor((bounds.minX + bounds.maxX) / 2),
            centerY: Math.floor((bounds.minY + bounds.maxY) / 2),
            type: "cavern",
            seed: Math.floor(ctx.streams.rooms.next() * 0xffffffff),
          });
        }
      }

      return {
        ...input,
        rooms,
      };
    },
  };
}

// =============================================================================
// CONNECT REGIONS PASS (for advanced multi-region support)
// =============================================================================

/**
 * Connects disconnected regions with tunnels
 * For cellular automata, this is optional as we typically keep only the largest region
 */
export function connectRegions(): Pass<
  DungeonStateArtifact,
  DungeonStateArtifact
> {
  return {
    id: "cellular.connect-regions",
    inputType: "dungeon-state",
    outputType: "dungeon-state",
    run(input, ctx) {
      const grid = input.grid;
      const rng = ctx.streams.connections;

      // Find all remaining floor regions
      const regions = findRegions(grid, CellType.FLOOR, { minSize: 10 });

      if (regions.length <= 1) {
        ctx.trace.decision(
          "cellular.connect-regions",
          "Regions to connect",
          [],
          regions.length,
          `${regions.length} region(s), no connections needed`,
        );
        return {
          ...input,
          edges: [],
          connections: [],
        };
      }

      // Find closest points between regions and connect them
      const connections: Connection[] = [];
      const edges: [number, number][] = [];

      // Connect each region to the next closest unconnected region
      const connected = new Set<number>([0]);
      const unconnected = new Set(regions.slice(1).map((_, i) => i + 1));

      while (unconnected.size > 0) {
        let bestDist = Infinity;
        let bestFrom: Region | null = null;
        let bestTo: Region | null = null;
        let bestFromPoint: Point | null = null;
        let bestToPoint: Point | null = null;

        // Find the closest pair of points between connected and unconnected regions
        for (const connectedIdx of connected) {
          const fromRegion = regions[connectedIdx];
          if (!fromRegion) continue;

          for (const unconnectedIdx of unconnected) {
            const toRegion = regions[unconnectedIdx];
            if (!toRegion) continue;

            // Sample points from both regions to find closest pair
            // Use a sample instead of all points for performance
            const sampleSize = Math.min(
              50,
              fromRegion.points.length,
              toRegion.points.length,
            );

            for (let i = 0; i < sampleSize; i++) {
              const fromIdx = Math.floor(rng.next() * fromRegion.points.length);
              const toIdx = Math.floor(rng.next() * toRegion.points.length);
              const fromPoint = fromRegion.points[fromIdx];
              const toPoint = toRegion.points[toIdx];

              if (!fromPoint || !toPoint) continue;

              const dist =
                Math.abs(fromPoint.x - toPoint.x) +
                Math.abs(fromPoint.y - toPoint.y);

              if (dist < bestDist) {
                bestDist = dist;
                bestFrom = fromRegion;
                bestTo = toRegion;
                bestFromPoint = fromPoint;
                bestToPoint = toPoint;
              }
            }
          }
        }

        if (bestFrom && bestTo && bestFromPoint && bestToPoint) {
          // Carve tunnel between the two closest points
          const path = carveTunnel(grid, bestFromPoint, bestToPoint);

          connections.push({
            fromRoomId: bestFrom.id,
            toRoomId: bestTo.id,
            path,
          });

          edges.push([bestFrom.id, bestTo.id]);

          connected.add(bestTo.id);
          unconnected.delete(bestTo.id);

          ctx.trace.decision(
            "cellular.connect-regions",
            `Connect regions ${bestFrom.id} and ${bestTo.id}`,
            [],
            `${path.length} tiles`,
            `Carved ${path.length}-tile tunnel between regions`,
          );
        } else {
          // Couldn't find connection, break to avoid infinite loop
          break;
        }
      }

      ctx.trace.decision(
        "cellular.connect-regions",
        "Connections made",
        [],
        connections.length,
        `Connected ${regions.length} regions with ${connections.length} tunnels`,
      );

      return {
        ...input,
        edges,
        connections,
      };
    },
  };
}

/**
 * Carve a tunnel between two points using an L-shaped path.
 * Uses orthogonal movement only (no diagonals) to ensure connectivity.
 */
function carveTunnel(grid: Grid, from: Point, to: Point): Point[] {
  const path: Point[] = [];

  // Carve a 3x3 area at a position
  const carveArea = (cx: number, cy: number): void => {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const nx = cx + dx;
        const ny = cy + dy;
        if (grid.isInBounds(nx, ny)) {
          grid.set(nx, ny, CellType.FLOOR);
          path.push({ x: nx, y: ny });
        }
      }
    }
  };

  // Move horizontally first
  let x = from.x;
  const y1 = from.y;

  while (x !== to.x) {
    carveArea(x, y1);
    if (x < to.x) x++;
    else x--;
  }

  // Then move vertically
  let y = y1;
  while (y !== to.y) {
    carveArea(x, y);
    if (y < to.y) y++;
    else y--;
  }

  // Carve the final position
  carveArea(to.x, to.y);

  return path;
}

// =============================================================================
// CALCULATE SPAWNS PASS
// =============================================================================

/**
 * Calculates spawn points for entrance, exit, enemies, and treasure
 * For cellular caves, we pick random floor tiles in the main cavern
 */
export function calculateSpawns(): Pass<
  DungeonStateArtifact,
  DungeonStateArtifact
> {
  return {
    id: "cellular.calculate-spawns",
    inputType: "dungeon-state",
    outputType: "dungeon-state",
    run(input, ctx) {
      const grid = input.grid;
      const rng = ctx.streams.details;
      const spawns: SpawnPoint[] = [];

      // Find all floor tiles
      const floorTiles: Point[] = [];
      for (let y = 0; y < input.height; y++) {
        for (let x = 0; x < input.width; x++) {
          if (grid.get(x, y) === CellType.FLOOR) {
            floorTiles.push({ x, y });
          }
        }
      }

      if (floorTiles.length < 2) {
        ctx.trace.warning(
          "cellular.calculate-spawns",
          `Not enough floor tiles: ${floorTiles.length}`,
        );
        return {
          ...input,
          spawns: [],
        };
      }

      // Pick entrance (random floor tile)
      const entranceIdx = Math.floor(rng.next() * floorTiles.length);
      const entrance = floorTiles[entranceIdx];

      if (!entrance) return { ...input, spawns: [] };

      spawns.push({
        position: { x: entrance.x, y: entrance.y },
        roomId: 0,
        type: "entrance",
        tags: ["spawn", "entrance"],
        weight: 1,
        distanceFromStart: 0,
      });

      // Find exit (furthest floor tile from entrance)
      let maxDist = 0;
      let exit: Point = entrance;

      for (const tile of floorTiles) {
        const dist =
          Math.abs(tile.x - entrance.x) + Math.abs(tile.y - entrance.y);
        if (dist > maxDist) {
          maxDist = dist;
          exit = tile;
        }
      }

      spawns.push({
        position: { x: exit.x, y: exit.y },
        roomId: 0,
        type: "exit",
        tags: ["exit"],
        weight: 1,
        distanceFromStart: maxDist,
      });

      ctx.trace.decision(
        "cellular.calculate-spawns",
        "Exit placement",
        [`distance: ${maxDist}`],
        `(${exit.x}, ${exit.y})`,
        `Exit placed ${maxDist} tiles from entrance`,
      );

      // Add enemy spawns (randomly distributed)
      const enemyCount = Math.floor(floorTiles.length * 0.01); // 1% of floor tiles
      const usedTiles = new Set([
        `${entrance.x},${entrance.y}`,
        `${exit.x},${exit.y}`,
      ]);

      for (
        let i = 0;
        i < enemyCount && usedTiles.size < floorTiles.length;
        i++
      ) {
        let attempts = 0;
        while (attempts < 10) {
          const idx = Math.floor(rng.next() * floorTiles.length);
          const tile = floorTiles[idx];
          if (!tile) break;

          const key = `${tile.x},${tile.y}`;
          if (!usedTiles.has(key)) {
            usedTiles.add(key);
            const dist =
              Math.abs(tile.x - entrance.x) + Math.abs(tile.y - entrance.y);
            spawns.push({
              position: { x: tile.x, y: tile.y },
              roomId: 0,
              type: "enemy",
              tags: ["enemy"],
              weight: maxDist > 0 ? dist / maxDist : 0,
              distanceFromStart: dist,
            });
            break;
          }
          attempts++;
        }
      }

      // Add treasure spawns (fewer than enemies)
      const treasureCount = Math.floor(floorTiles.length * 0.002); // 0.2% of floor tiles

      for (
        let i = 0;
        i < treasureCount && usedTiles.size < floorTiles.length;
        i++
      ) {
        let attempts = 0;
        while (attempts < 10) {
          const idx = Math.floor(rng.next() * floorTiles.length);
          const tile = floorTiles[idx];
          if (!tile) break;

          const key = `${tile.x},${tile.y}`;
          if (!usedTiles.has(key)) {
            usedTiles.add(key);
            const dist =
              Math.abs(tile.x - entrance.x) + Math.abs(tile.y - entrance.y);
            spawns.push({
              position: { x: tile.x, y: tile.y },
              roomId: 0,
              type: "treasure",
              tags: ["treasure", "loot"],
              weight: maxDist > 0 ? 1 - dist / maxDist : 1,
              distanceFromStart: dist,
            });
            break;
          }
          attempts++;
        }
      }

      ctx.trace.decision(
        "cellular.calculate-spawns",
        "Total spawn points",
        [],
        spawns.length,
        `${spawns.length} spawn points: 1 entrance, 1 exit, ${spawns.filter((s) => s.type === "enemy").length} enemies, ${spawns.filter((s) => s.type === "treasure").length} treasures`,
      );

      return {
        ...input,
        spawns,
      };
    },
  };
}

// =============================================================================
// FINALIZE DUNGEON PASS
// =============================================================================

/**
 * Converts dungeon state to final dungeon artifact with checksum
 */
export function finalizeDungeon(): Pass<DungeonStateArtifact, DungeonArtifact> {
  return {
    id: "cellular.finalize",
    inputType: "dungeon-state",
    outputType: "dungeon",
    run(input, ctx) {
      const checksum = calculateChecksum(
        input.grid,
        input.rooms,
        input.connections,
        input.spawns,
      );

      ctx.trace.decision(
        "cellular.finalize",
        "Dungeon checksum",
        [],
        checksum,
        `Checksum computed from grid, rooms, connections, and spawns`,
      );

      return {
        type: "dungeon",
        id: "dungeon",
        width: input.width,
        height: input.height,
        terrain: input.grid.getRawDataCopy(), // Use copy for immutability
        rooms: input.rooms,
        connections: input.connections,
        spawns: input.spawns,
        checksum,
        seed: ctx.seed,
      };
    },
  };
}

// =============================================================================
// EXPORT ALL PASSES
// =============================================================================

export const CellularPasses = {
  initializeRandom,
  applyCellularRules,
  keepLargestRegion,
  connectRegions,
  calculateSpawns,
  finalizeDungeon,
} as const;
