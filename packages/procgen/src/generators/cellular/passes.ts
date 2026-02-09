/**
 * Cellular Automata Generator Passes
 *
 * Individual passes for cave-like dungeon generation using cellular automata.
 * Uses DungeonStateArtifact to carry full state through the pipeline.
 */

import { MAX_UINT32 } from "../../core";
import type { Point } from "../../core/geometry/types";
import { CellType, Grid } from "../../core/grid";
import {
  findLargestRegion,
  findRegions,
  forEachRegionPoint,
  regionGetPointAt,
} from "../../core/grid/flood-fill";
import type { Region } from "../../core/grid/types";
import type {
  Connection,
  DungeonStateArtifact,
  EmptyArtifact,
  Pass,
  Room,
  SpawnPoint,
} from "../../pipeline/types";
import {
  MIN_CONNECTIVITY_REGION_SIZE,
  REGION_CONNECTION_SAMPLE_SIZE,
} from "./constants";

// =============================================================================
// INITIALIZE RANDOM PASS
// =============================================================================

/**
 * Creates initial dungeon state with randomly filled grid
 */
export function initializeRandom(): Pass<
  EmptyArtifact,
  DungeonStateArtifact,
  "layout"
> {
  return {
    id: "cellular.initialize-random",
    inputType: "empty",
    outputType: "dungeon-state",
    requiredStreams: ["layout"] as const,
    run(_input, ctx) {
      // Config is pre-validated with all defaults resolved
      const config = ctx.config.cellular;
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
  DungeonStateArtifact,
  never
> {
  return {
    id: "cellular.apply-rules",
    inputType: "dungeon-state",
    outputType: "dungeon-state",
    requiredStreams: [] as const,
    run(input, ctx) {
      // Config is pre-validated with all defaults resolved
      const config = ctx.config.cellular;
      let currentGrid = input.grid;

      // Use double buffering to avoid allocation
      let bufferGrid = new Grid(input.width, input.height, CellType.WALL);
      let appliedIterations = 0;

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
        appliedIterations = i + 1;

        const floorCount = currentGrid.countCells(CellType.FLOOR);
        const stabilized = currentGrid.equals(bufferGrid);
        ctx.trace.decision(
          "cellular.apply-rules",
          `Iteration ${i + 1}/${config.iterations}`,
          ["birth", "death"],
          `${floorCount} floors`,
          `Applied rules: birth=${config.birthLimit}, death=${config.deathLimit}${stabilized ? " (stable)" : ""}`,
        );

        if (stabilized) {
          ctx.trace.decision(
            "cellular.apply-rules",
            "Stable state reached",
            [],
            appliedIterations,
            `No cell changes after iteration ${appliedIterations}; stopping early`,
          );
          break;
        }
      }

      ctx.trace.decision(
        "cellular.apply-rules",
        "Cellular automata complete",
        [],
        appliedIterations,
        `${appliedIterations}/${config.iterations} iterations applied`,
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
  DungeonStateArtifact,
  "rooms"
> {
  return {
    id: "cellular.keep-largest-region",
    inputType: "dungeon-state",
    outputType: "dungeon-state",
    requiredStreams: ["rooms"] as const,
    run(input, ctx) {
      // Config is pre-validated with all defaults resolved
      const config = ctx.config.cellular;
      const grid = input.grid;
      const connectAllRegions = config.connectAllRegions;

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
            forEachRegionPoint(region, (x, y) => {
              grid.set(x, y, CellType.WALL);
            });
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
            seed: Math.floor(ctx.streams.rooms.next() * MAX_UINT32),
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
        // Fill all non-largest regions with walls
        // Note: regions are disjoint by definition from flood-fill, so no Set lookup needed
        let removedCount = 0;
        for (const region of regions) {
          if (region.id === largest?.id) continue;

          forEachRegionPoint(region, (x, y) => {
            grid.set(x, y, CellType.WALL);
            removedCount++;
          });
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
            seed: Math.floor(ctx.streams.rooms.next() * MAX_UINT32),
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
  DungeonStateArtifact,
  "connections"
> {
  return {
    id: "cellular.connect-regions",
    inputType: "dungeon-state",
    outputType: "dungeon-state",
    requiredStreams: ["connections"] as const,
    run(input, ctx) {
      const grid = input.grid;
      const rng = ctx.streams.connections;

      // Find all remaining floor regions
      const regions = findRegions(grid, CellType.FLOOR, {
        minSize: MIN_CONNECTIVITY_REGION_SIZE,
      });

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
        let bestFrom: Region | null = null;
        let bestTo: Region | null = null;
        let bestFromPoint: Point | null = null;
        let bestToPoint: Point | null = null;

        // First pass: find closest region pair by center distance
        let bestCenterDist = Infinity;
        for (const connectedIdx of connected) {
          const connRegion = regions[connectedIdx];
          if (!connRegion) continue;
          const connCenter = {
            x: Math.floor(
              (connRegion.bounds.minX + connRegion.bounds.maxX) / 2,
            ),
            y: Math.floor(
              (connRegion.bounds.minY + connRegion.bounds.maxY) / 2,
            ),
          };

          for (const unconnectedIdx of unconnected) {
            const uncRegion = regions[unconnectedIdx];
            if (!uncRegion) continue;
            const uncCenter = {
              x: Math.floor(
                (uncRegion.bounds.minX + uncRegion.bounds.maxX) / 2,
              ),
              y: Math.floor(
                (uncRegion.bounds.minY + uncRegion.bounds.maxY) / 2,
              ),
            };

            const dist =
              Math.abs(connCenter.x - uncCenter.x) +
              Math.abs(connCenter.y - uncCenter.y);
            if (dist < bestCenterDist) {
              bestCenterDist = dist;
              bestFrom = connRegion;
              bestTo = uncRegion;
            }
          }
        }

        if (!bestFrom || !bestTo) break;

        // Second pass: find actual closest points between the two closest regions
        let bestDist = Infinity;
        const sampleSize = Math.min(
          REGION_CONNECTION_SAMPLE_SIZE,
          bestFrom.size,
          bestTo.size,
        );

        for (let i = 0; i < sampleSize; i++) {
          const fromIdx = Math.floor(rng.next() * bestFrom.size);
          const toIdx = Math.floor(rng.next() * bestTo.size);
          const fromPoint = regionGetPointAt(bestFrom, fromIdx);
          const toPoint = regionGetPointAt(bestTo, toIdx);

          if (!fromPoint || !toPoint) continue;

          const dist =
            Math.abs(fromPoint.x - toPoint.x) +
            Math.abs(fromPoint.y - toPoint.y);

          if (dist < bestDist) {
            bestDist = dist;
            bestFromPoint = fromPoint;
            bestToPoint = toPoint;
          }
        }

        if (bestFrom && bestTo && bestFromPoint && bestToPoint) {
          // Carve tunnel between the two closest points
          const path = carveTunnel(grid, bestFromPoint, bestToPoint);

          connections.push({
            fromRoomId: bestFrom.id,
            toRoomId: bestTo.id,
            pathLength: path.length,
            path,
          });

          edges.push([bestFrom.id, bestTo.id]);

          // Find the index of bestTo in the regions array
          const bestToIndex = regions.indexOf(bestTo);
          connected.add(bestToIndex);
          unconnected.delete(bestToIndex);

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
// PLACE ENTRANCE/EXIT PASS
// =============================================================================

/**
 * Places entrance and exit spawn points only.
 * Game content (enemies, treasures) should be handled by the game layer.
 */
export function placeEntranceExit(): Pass<
  DungeonStateArtifact,
  DungeonStateArtifact,
  "details"
> {
  return {
    id: "cellular.place-entrance-exit",
    inputType: "dungeon-state",
    outputType: "dungeon-state",
    requiredStreams: ["details"] as const,
    run(input, ctx) {
      const { grid, width, height, rooms } = input;
      const rng = ctx.streams.details;
      const spawns: SpawnPoint[] = [];

      // Collect all floor tiles
      const floorTiles: Point[] = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          if (grid.get(x, y) === CellType.FLOOR) {
            floorTiles.push({ x, y });
          }
        }
      }

      if (floorTiles.length === 0) {
        ctx.trace.warning(
          "cellular.place-entrance-exit",
          "No floor tiles available",
        );
        return { ...input, spawns: [] };
      }

      // Entrance: random floor tile
      const entranceIdx = Math.floor(rng.next() * floorTiles.length);
      const entrance = floorTiles[entranceIdx]!;
      const entranceRoomId = rooms.length > 0 ? (rooms[0]?.id ?? 0) : 0;

      spawns.push({
        position: { x: entrance.x, y: entrance.y },
        roomId: entranceRoomId,
        type: "entrance",
        tags: ["spawn", "entrance"],
        weight: 1,
        distanceFromStart: 0,
      });

      // Exit: floor tile furthest from entrance
      let maxDist = 0;
      let exit = entrance;

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
        roomId: entranceRoomId,
        type: "exit",
        tags: ["exit"],
        weight: 1,
        distanceFromStart: maxDist,
      });

      ctx.trace.decision(
        "cellular.place-entrance-exit",
        "Placed entrance and exit",
        [],
        2,
        `Entrance at (${entrance.x}, ${entrance.y}), Exit at (${exit.x}, ${exit.y}) (distance: ${maxDist})`,
      );

      return { ...input, spawns };
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
  placeEntranceExit,
} as const;
