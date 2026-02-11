/**
 * Hybrid Generator Passes
 *
 * Passes that implement zone-based generation by combining BSP and Cellular algorithms.
 * Each zone is processed with its assigned algorithm, then zones are connected.
 */

import type { SeededRandom } from "@rogue/contracts";
import type { Point } from "../../core/geometry/types";
import { CellType, Grid } from "../../core/grid";
import { findRegions, forEachRegionPoint } from "../../core/grid/flood-fill";
import type {
  BSPNode,
  Connection,
  Pass,
  PassContext,
  Room,
  ValidatedBSPConfig,
} from "../../pipeline/types";

import type { HybridStateArtifact, ZoneDefinition } from "./types";

// =============================================================================
// PROCESS ZONES PASS
// =============================================================================

/**
 * Process each zone with its assigned algorithm (BSP or Cellular)
 * This is the core pass that actually implements zone-based generation
 */
export function processZones(): Pass<
  HybridStateArtifact,
  HybridStateArtifact,
  "layout" | "rooms" | "connections"
> {
  return {
    id: "hybrid.process-zones",
    inputType: "dungeon-state",
    outputType: "dungeon-state",
    requiredStreams: ["layout", "rooms", "connections"] as const,
    run(input, ctx) {
      const zones = input.zones ?? [];

      if (zones.length === 0) {
        ctx.trace.warning(
          "hybrid.process-zones",
          "No zones to process, falling back to empty dungeon",
        );
        return input;
      }

      const zoneGrids = new Map<string, Grid>();
      const zoneRooms = new Map<string, Room[]>();
      let roomIdCounter = 0;

      // Process each zone independently
      for (const zone of zones) {
        ctx.trace.decision(
          "hybrid.process-zones",
          `Processing zone ${zone.id}`,
          ["bsp", "cellular"],
          zone.algorithm,
          `Zone type: ${zone.type}, bounds: ${zone.bounds.width}x${zone.bounds.height} at (${zone.bounds.x},${zone.bounds.y})`,
        );

        if (zone.algorithm === "bsp") {
          const result = processBSPZone(zone, ctx, roomIdCounter);
          zoneGrids.set(zone.id, result.grid);
          zoneRooms.set(zone.id, result.rooms);
          roomIdCounter += result.rooms.length;
        } else if (zone.algorithm === "cellular") {
          const result = processCellularZone(zone, ctx, roomIdCounter);
          zoneGrids.set(zone.id, result.grid);
          zoneRooms.set(zone.id, result.rooms);
          roomIdCounter += result.rooms.length;
        }
      }

      ctx.trace.decision(
        "hybrid.process-zones",
        "Zones processed",
        [],
        zones.length,
        `Processed ${zones.length} zones: ${zones.filter((z) => z.algorithm === "bsp").length} BSP, ${zones.filter((z) => z.algorithm === "cellular").length} Cellular`,
      );

      return {
        ...input,
        zoneGrids,
        zoneRooms,
      };
    },
  };
}

/**
 * Process a zone using BSP algorithm
 */
function processBSPZone(
  zone: ZoneDefinition,
  ctx: PassContext<"layout" | "rooms" | "connections">,
  roomIdOffset: number,
): { grid: Grid; rooms: Room[] } {
  // Config is pre-validated with all defaults resolved
  const config = ctx.config.bsp;
  const rng = ctx.streams.layout;

  // Create a local grid for this zone
  const grid = new Grid(zone.bounds.width, zone.bounds.height, CellType.WALL);

  // Create root BSP node for this zone
  const root: BSPNode = {
    id: 0,
    x: 0,
    y: 0,
    width: zone.bounds.width,
    height: zone.bounds.height,
  };

  // Partition the zone
  const { leaves } = partitionZoneBSP(root, config, rng);

  // Place rooms in leaves
  const rooms = placeRoomsInZone(
    leaves,
    zone,
    config,
    ctx.streams.rooms,
    roomIdOffset,
  );

  // Carve rooms into local grid
  for (const room of rooms) {
    // Adjust coordinates to local zone space
    const localX = room.x - zone.bounds.x;
    const localY = room.y - zone.bounds.y;

    if (room.template) {
      for (const cell of room.template.cells) {
        const x = localX + cell.dx;
        const y = localY + cell.dy;
        if (grid.isInBounds(x, y)) {
          grid.set(x, y, CellType.FLOOR);
        }
      }
    } else {
      // Use local coordinates for the zone grid
      grid.fillRect(localX, localY, room.width, room.height, CellType.FLOOR);
    }
  }

  // Build connectivity and carve corridors
  if (rooms.length > 1) {
    const edges = buildSimpleMST(rooms);
    carveCorridorsInZone(
      grid,
      rooms,
      edges,
      zone,
      config,
      ctx.streams.connections,
    );
  }

  return { grid, rooms };
}

/**
 * Process a zone using Cellular algorithm
 */
function processCellularZone(
  zone: ZoneDefinition,
  ctx: PassContext<"layout" | "rooms" | "connections">,
  roomIdOffset: number,
): { grid: Grid; rooms: Room[] } {
  // Config is pre-validated with all defaults resolved
  const config = ctx.config.cellular;
  const rng = ctx.streams.layout;

  // Create a local grid for this zone
  const grid = new Grid(zone.bounds.width, zone.bounds.height, CellType.WALL);

  // Initialize with random fill
  for (let y = 0; y < zone.bounds.height; y++) {
    for (let x = 0; x < zone.bounds.width; x++) {
      // Keep edges as walls
      if (
        x === 0 ||
        y === 0 ||
        x === zone.bounds.width - 1 ||
        y === zone.bounds.height - 1
      ) {
        grid.set(x, y, CellType.WALL);
      } else if (rng.next() < config.initialFillRatio) {
        grid.set(x, y, CellType.FLOOR);
      } else {
        grid.set(x, y, CellType.WALL);
      }
    }
  }

  // Apply cellular automata rules
  let currentGrid = grid;
  let bufferGrid = new Grid(
    zone.bounds.width,
    zone.bounds.height,
    CellType.WALL,
  );

  for (let i = 0; i < config.iterations; i++) {
    currentGrid.applyCellularAutomataInto(
      config.birthLimit,
      config.deathLimit,
      bufferGrid,
    );

    const temp = currentGrid;
    currentGrid = bufferGrid;
    bufferGrid = temp;
  }

  // Find largest region and remove small ones
  const regions = findRegions(currentGrid, CellType.FLOOR, {
    minSize: config.minRegionSize,
  });

  if (regions.length > 0) {
    // Keep largest region
    const largest = regions.reduce(
      (max, r) => (r.size > max.size ? r : max),
      regions[0]!,
    );

    // Remove other regions
    for (const region of regions) {
      if (region.id !== largest.id) {
        forEachRegionPoint(region, (x, y) => {
          currentGrid.set(x, y, CellType.WALL);
        });
      }
    }

    // Create a pseudo-room for the cavern (in global coordinates)
    const bounds = largest.bounds;
    const rooms: Room[] = [
      {
        id: roomIdOffset,
        x: zone.bounds.x + bounds.minX,
        y: zone.bounds.y + bounds.minY,
        width: bounds.maxX - bounds.minX + 1,
        height: bounds.maxY - bounds.minY + 1,
        centerX: zone.bounds.x + Math.floor((bounds.minX + bounds.maxX) / 2),
        centerY: zone.bounds.y + Math.floor((bounds.minY + bounds.maxY) / 2),
        type: "cavern",
        seed: Math.floor(ctx.streams.rooms.next() * 0xffffffff),
      },
    ];

    return { grid: currentGrid, rooms };
  }

  return { grid: currentGrid, rooms: [] };
}

/**
 * Partition a zone using BSP algorithm (simplified version)
 */
function partitionZoneBSP(
  root: BSPNode,
  config: ValidatedBSPConfig,
  rng: SeededRandom,
): { tree: BSPNode; leaves: BSPNode[] } {
  const leaves: BSPNode[] = [];
  let nextId = 1;

  function partition(node: BSPNode, depth: number): BSPNode {
    const maxDepth = config.maxDepth;
    const minSize = config.minRoomSize * 2 + config.roomPadding * 2;

    if (depth >= maxDepth) {
      leaves.push(node);
      return node;
    }

    const canSplitH = node.height >= minSize;
    const canSplitV = node.width >= minSize;

    if (!canSplitH && !canSplitV) {
      leaves.push(node);
      return node;
    }

    let splitHorizontally: boolean;
    if (canSplitH && canSplitV) {
      splitHorizontally =
        node.height > node.width * 1.2
          ? true
          : node.width > node.height * 1.2
            ? false
            : rng.next() > 0.5;
    } else {
      splitHorizontally = canSplitH;
    }

    const ratio =
      config.splitRatioMin +
      rng.next() * (config.splitRatioMax - config.splitRatioMin);

    let leftChild: BSPNode;
    let rightChild: BSPNode;

    if (splitHorizontally) {
      const splitY = Math.floor(node.y + node.height * ratio);
      leftChild = {
        id: nextId++,
        x: node.x,
        y: node.y,
        width: node.width,
        height: splitY - node.y,
      };
      rightChild = {
        id: nextId++,
        x: node.x,
        y: splitY,
        width: node.width,
        height: node.y + node.height - splitY,
      };
    } else {
      const splitX = Math.floor(node.x + node.width * ratio);
      leftChild = {
        id: nextId++,
        x: node.x,
        y: node.y,
        width: splitX - node.x,
        height: node.height,
      };
      rightChild = {
        id: nextId++,
        x: splitX,
        y: node.y,
        width: node.x + node.width - splitX,
        height: node.height,
      };
    }

    return {
      ...node,
      leftChild: partition(leftChild, depth + 1),
      rightChild: partition(rightChild, depth + 1),
    };
  }

  const tree = partition(root, 0);
  return { tree, leaves };
}

/**
 * Place rooms within BSP leaves (in global coordinates)
 */
function placeRoomsInZone(
  leaves: BSPNode[],
  zone: ZoneDefinition,
  config: ValidatedBSPConfig,
  rng: SeededRandom,
  roomIdOffset: number,
): Room[] {
  const rooms: Room[] = [];

  for (const leaf of leaves) {
    const maxWidth = leaf.width - config.roomPadding * 2;
    const maxHeight = leaf.height - config.roomPadding * 2;

    if (maxWidth < config.minRoomSize || maxHeight < config.minRoomSize) {
      continue;
    }

    // Generate room size
    const roomWidth = Math.floor(
      config.minRoomSize +
        rng.next() *
          (Math.min(maxWidth, config.maxRoomSize) - config.minRoomSize),
    );
    const roomHeight = Math.floor(
      config.minRoomSize +
        rng.next() *
          (Math.min(maxHeight, config.maxRoomSize) - config.minRoomSize),
    );

    // Random position within leaf (local coordinates)
    const localX =
      leaf.x +
      config.roomPadding +
      Math.floor(rng.next() * (maxWidth - roomWidth));
    const localY =
      leaf.y +
      config.roomPadding +
      Math.floor(rng.next() * (maxHeight - roomHeight));

    // Convert to global coordinates
    const globalX = zone.bounds.x + localX;
    const globalY = zone.bounds.y + localY;

    const room: Room = {
      id: roomIdOffset + rooms.length,
      x: globalX,
      y: globalY,
      width: roomWidth,
      height: roomHeight,
      centerX: globalX + Math.floor(roomWidth / 2),
      centerY: globalY + Math.floor(roomHeight / 2),
      type: "normal",
      seed: Math.floor(rng.next() * 0xffffffff),
    };

    rooms.push(room);
  }

  return rooms;
}

/**
 * Build a simple MST from rooms using greedy nearest neighbor
 */
function buildSimpleMST(rooms: Room[]): [number, number][] {
  if (rooms.length <= 1) return [];

  const edges: [number, number][] = [];
  const connected = new Set<number>([0]);
  const unconnected = new Set(rooms.slice(1).map((_, i) => i + 1));

  while (unconnected.size > 0) {
    let bestDist = Infinity;
    let bestFrom = -1;
    let bestTo = -1;

    for (const fromIdx of connected) {
      const fromRoom = rooms[fromIdx]!;
      for (const toIdx of unconnected) {
        const toRoom = rooms[toIdx]!;
        const dist =
          Math.abs(fromRoom.centerX - toRoom.centerX) +
          Math.abs(fromRoom.centerY - toRoom.centerY);

        if (dist < bestDist) {
          bestDist = dist;
          bestFrom = fromIdx;
          bestTo = toIdx;
        }
      }
    }

    if (bestFrom >= 0 && bestTo >= 0) {
      edges.push([bestFrom, bestTo]);
      connected.add(bestTo);
      unconnected.delete(bestTo);
    } else {
      break;
    }
  }

  return edges;
}

/**
 * Carve corridors between rooms in a zone
 * Optimized: bounds checks hoisted outside inner loops
 */
function carveCorridorsInZone(
  grid: Grid,
  rooms: Room[],
  edges: [number, number][],
  zone: ZoneDefinition,
  config: ValidatedBSPConfig,
  rng: SeededRandom,
): void {
  const halfWidth = Math.floor(config.corridorWidth / 2);
  const gridWidth = grid.width;
  const gridHeight = grid.height;

  for (const [fromIdx, toIdx] of edges) {
    const fromRoom = rooms[fromIdx];
    const toRoom = rooms[toIdx];
    if (!fromRoom || !toRoom) continue;

    // Convert to local coordinates
    const fromX = fromRoom.centerX - zone.bounds.x;
    const fromY = fromRoom.centerY - zone.bounds.y;
    const toX = toRoom.centerX - zone.bounds.x;
    const toY = toRoom.centerY - zone.bounds.y;

    const horizontalFirst = rng.next() > 0.5;

    if (horizontalFirst) {
      // Horizontal segment: constant Y (fromY), varying X
      const startX = Math.max(0, Math.min(fromX, toX));
      const endX = Math.min(gridWidth - 1, Math.max(fromX, toX));
      // Pre-calculate valid Y range for the horizontal segment
      const hYMin = Math.max(0, fromY - halfWidth);
      const hYMax = Math.min(gridHeight - 1, fromY + halfWidth);

      for (let x = startX; x <= endX; x++) {
        for (let y = hYMin; y <= hYMax; y++) {
          grid.set(x, y, CellType.FLOOR);
        }
      }

      // Vertical segment: constant X (toX), varying Y
      const startY = Math.max(0, Math.min(fromY, toY));
      const endY = Math.min(gridHeight - 1, Math.max(fromY, toY));
      // Pre-calculate valid X range for the vertical segment
      const vXMin = Math.max(0, toX - halfWidth);
      const vXMax = Math.min(gridWidth - 1, toX + halfWidth);

      for (let y = startY; y <= endY; y++) {
        for (let x = vXMin; x <= vXMax; x++) {
          grid.set(x, y, CellType.FLOOR);
        }
      }
    } else {
      // Vertical segment first: constant X (fromX), varying Y
      const startY = Math.max(0, Math.min(fromY, toY));
      const endY = Math.min(gridHeight - 1, Math.max(fromY, toY));
      // Pre-calculate valid X range for the vertical segment
      const vXMin = Math.max(0, fromX - halfWidth);
      const vXMax = Math.min(gridWidth - 1, fromX + halfWidth);

      for (let y = startY; y <= endY; y++) {
        for (let x = vXMin; x <= vXMax; x++) {
          grid.set(x, y, CellType.FLOOR);
        }
      }

      // Horizontal segment: constant Y (toY), varying X
      const startX = Math.max(0, Math.min(fromX, toX));
      const endX = Math.min(gridWidth - 1, Math.max(fromX, toX));
      // Pre-calculate valid Y range for the horizontal segment
      const hYMin = Math.max(0, toY - halfWidth);
      const hYMax = Math.min(gridHeight - 1, toY + halfWidth);

      for (let x = startX; x <= endX; x++) {
        for (let y = hYMin; y <= hYMax; y++) {
          grid.set(x, y, CellType.FLOOR);
        }
      }
    }
  }
}

// =============================================================================
// MERGE ZONES PASS
// =============================================================================

/**
 * Merge zone grids into the main dungeon grid
 */
export function mergeZones(): Pass<
  HybridStateArtifact,
  HybridStateArtifact,
  never
> {
  return {
    id: "hybrid.merge-zones",
    inputType: "dungeon-state",
    outputType: "dungeon-state",
    requiredStreams: [] as const,
    run(input, ctx) {
      const zones = input.zones ?? [];
      const zoneGrids = input.zoneGrids ?? new Map();
      const zoneRooms = input.zoneRooms ?? new Map();

      // Copy zone grids to main grid
      const mainGrid = input.grid;
      for (const zone of zones) {
        const zoneGrid = zoneGrids.get(zone.id);
        if (!zoneGrid) continue;

        // Bulk copy reduces per-cell call overhead in hot hybrid merges.
        mainGrid.copyFrom(
          zoneGrid,
          0,
          0,
          zone.bounds.x,
          zone.bounds.y,
          zone.bounds.width,
          zone.bounds.height,
        );
      }

      // Collect all rooms
      const allRooms: Room[] = [];
      for (const zone of zones) {
        const rooms = zoneRooms.get(zone.id) ?? [];
        allRooms.push(...rooms);
      }

      ctx.trace.decision(
        "hybrid.merge-zones",
        "Zones merged",
        [],
        zones.length,
        `Merged ${zones.length} zones into main grid, ${allRooms.length} total rooms`,
      );

      return {
        ...input,
        rooms: allRooms,
      };
    },
  };
}

// =============================================================================
// CONNECT ZONES PASS
// =============================================================================

/**
 * Connect zones using the predefined transitions
 */
export function connectZones(): Pass<
  HybridStateArtifact,
  HybridStateArtifact,
  never
> {
  return {
    id: "hybrid.connect-zones",
    inputType: "dungeon-state",
    outputType: "dungeon-state",
    requiredStreams: [] as const,
    run(input, ctx) {
      const transitions = input.transitions ?? [];
      const connections: Connection[] = [...(input.connections ?? [])];

      for (const transition of transitions) {
        // Carve a corridor between the transition points
        const path = carveZoneTransition(
          input.grid,
          transition.fromPoint,
          transition.toPoint,
          transition.width,
        );

        connections.push({
          fromRoomId: -1, // Inter-zone connection
          toRoomId: -1,
          pathLength: path.length,
          path,
        });

        ctx.trace.decision(
          "hybrid.connect-zones",
          `Connect zones ${transition.fromZoneId} -> ${transition.toZoneId}`,
          [],
          path.length,
          `Carved ${path.length}-tile transition corridor`,
        );
      }

      ctx.trace.decision(
        "hybrid.connect-zones",
        "Zone connections",
        [],
        transitions.length,
        `Created ${transitions.length} inter-zone connections`,
      );

      return {
        ...input,
        connections,
      };
    },
  };
}

/**
 * Carve a transition corridor between two points
 * Optimized: bounds checks hoisted outside inner loops
 */
function carveZoneTransition(
  grid: Grid,
  from: Point,
  to: Point,
  width: number,
): Point[] {
  const path: Point[] = [];
  const halfWidth = Math.floor(width / 2);
  const gridWidth = grid.width;
  const gridHeight = grid.height;

  // Carve an area around a point with pre-clamped bounds
  const carveArea = (cx: number, cy: number): void => {
    const xMin = Math.max(0, cx - halfWidth);
    const xMax = Math.min(gridWidth - 1, cx + halfWidth);
    const yMin = Math.max(0, cy - halfWidth);
    const yMax = Math.min(gridHeight - 1, cy + halfWidth);

    for (let x = xMin; x <= xMax; x++) {
      for (let y = yMin; y <= yMax; y++) {
        grid.set(x, y, CellType.FLOOR);
        path.push({ x, y });
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
