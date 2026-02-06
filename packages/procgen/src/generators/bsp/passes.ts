/**
 * BSP Generator Passes
 *
 * Individual passes for the BSP dungeon generation pipeline.
 * Uses DungeonStateArtifact to carry full state through the pipeline.
 */

import { range } from "@rogue/contracts";
import { MAX_UINT32 } from "../../core";
import {
  buildMSTFromEdges,
  delaunayTriangulation,
} from "../../core/geometry/delaunay";
import type { Point } from "../../core/geometry/types";
import { CellType } from "../../core/grid";
import {
  carveCorridor,
  carveLShapedCorridorFast,
} from "../../passes/carving/corridor-carvers";
import {
  createInitializeStatePass,
  createPlaceEntranceExitPass,
} from "../../passes/common";
import type {
  BSPNode,
  Connection,
  DungeonStateArtifact,
  EmptyArtifact,
  Pass,
  Room,
} from "../../pipeline/types";
import {
  ALL_TEMPLATES,
  getTemplateCenter,
  SIGNATURE_PREFABS,
  selectTemplateForLeaf,
} from "../../prefabs";
import {
  RANDOM_DIRECTION_THRESHOLD,
  SPLIT_PREFERENCE_RATIO,
} from "./constants";

// Combined templates: basic shapes + signature rooms
const COMBINED_TEMPLATES = [...ALL_TEMPLATES, ...SIGNATURE_PREFABS];

// =============================================================================
// INITIALIZE STATE PASS
// =============================================================================

/**
 * Creates initial dungeon state with wall-filled grid
 */
export function initializeState(): Pass<
  EmptyArtifact,
  DungeonStateArtifact,
  never
> {
  return createInitializeStatePass("bsp");
}

// =============================================================================
// PARTITION BSP PASS
// =============================================================================

/**
 * Partitions space using BSP algorithm
 */
export function partitionBSP(): Pass<
  DungeonStateArtifact,
  DungeonStateArtifact,
  "layout"
> {
  return {
    id: "bsp.partition",
    inputType: "dungeon-state",
    outputType: "dungeon-state",
    requiredStreams: ["layout"] as const,
    run(input, ctx) {
      // Config is pre-validated with all defaults resolved
      const config = ctx.config.bsp;
      const rng = ctx.streams.layout; // Use layout RNG stream

      // Create root node
      const root: BSPNode = {
        id: 0,
        x: 0,
        y: 0,
        width: input.width,
        height: input.height,
      };

      let nextId = 1;
      const leaves: BSPNode[] = [];

      // Recursive partition function
      function partition(node: BSPNode, depth: number): BSPNode {
        const maxDepth = config.maxDepth;
        const minSize = config.minRoomSize * 2 + config.roomPadding * 2;

        // Check if we should stop splitting
        if (depth >= maxDepth) {
          leaves.push(node);
          ctx.trace.decision(
            "bsp.partition",
            `Stop splitting node ${node.id}?`,
            ["yes", "no"],
            "yes",
            `Reached max depth ${maxDepth}`,
          );
          return node;
        }

        // Determine if we can split horizontally or vertically
        const canSplitH = node.height >= minSize;
        const canSplitV = node.width >= minSize;

        if (!canSplitH && !canSplitV) {
          leaves.push(node);
          ctx.trace.decision(
            "bsp.partition",
            `Stop splitting node ${node.id}?`,
            ["yes", "no"],
            "yes",
            `Node too small: ${node.width}x${node.height}, min size needed: ${minSize}`,
          );
          return node;
        }

        // Choose split direction
        let splitHorizontally: boolean;
        let directionReason: string;

        if (canSplitH && canSplitV) {
          // Prefer splitting along the longer axis
          if (node.width > node.height * SPLIT_PREFERENCE_RATIO) {
            splitHorizontally = false;
            directionReason = `Width ${node.width} > height*${SPLIT_PREFERENCE_RATIO} (${(node.height * SPLIT_PREFERENCE_RATIO).toFixed(0)})`;
          } else if (node.height > node.width * SPLIT_PREFERENCE_RATIO) {
            splitHorizontally = true;
            directionReason = `Height ${node.height} > width*${SPLIT_PREFERENCE_RATIO} (${(node.width * SPLIT_PREFERENCE_RATIO).toFixed(0)})`;
          } else {
            const randomVal = rng.next();
            splitHorizontally = randomVal > RANDOM_DIRECTION_THRESHOLD;
            directionReason = `Random choice (${randomVal.toFixed(3)} ${splitHorizontally ? ">" : "<="} ${RANDOM_DIRECTION_THRESHOLD})`;
          }
        } else {
          splitHorizontally = canSplitH;
          directionReason = `Only can split ${splitHorizontally ? "horizontally" : "vertically"}`;
        }

        ctx.trace.decision(
          "bsp.partition",
          `Split direction for node ${node.id}?`,
          ["horizontal", "vertical"],
          splitHorizontally ? "horizontal" : "vertical",
          directionReason,
        );

        // Calculate split position
        const ratio =
          config.splitRatioMin +
          rng.next() * (config.splitRatioMax - config.splitRatioMin);

        ctx.trace.decision(
          "bsp.partition",
          `Split ratio for node ${node.id}?`,
          [config.splitRatioMin, config.splitRatioMax],
          ratio,
          `Random ratio between ${config.splitRatioMin} and ${config.splitRatioMax}`,
        );

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

        // Recursively partition children
        const partitionedLeft = partition(leftChild, depth + 1);
        const partitionedRight = partition(rightChild, depth + 1);

        return {
          ...node,
          leftChild: partitionedLeft,
          rightChild: partitionedRight,
        };
      }

      const partitionedRoot = partition(root, 0);

      return {
        ...input,
        bspTree: partitionedRoot,
        bspLeaves: leaves,
      };
    },
  };
}

// =============================================================================
// PLACE ROOMS PASS
// =============================================================================

/**
 * Places rooms within BSP leaves
 */
export function placeRooms(): Pass<
  DungeonStateArtifact,
  DungeonStateArtifact,
  "rooms"
> {
  return {
    id: "bsp.place-rooms",
    inputType: "dungeon-state",
    outputType: "dungeon-state",
    requiredStreams: ["rooms"] as const,
    run(input, ctx) {
      // Config is pre-validated with all defaults resolved
      const config = ctx.config.bsp;
      const rng = ctx.streams.rooms; // Use rooms RNG stream
      const rooms: Room[] = [];

      const leaves = input.bspLeaves ?? [];

      const roomPlacementChance = config.roomPlacementChance;

      for (const leaf of leaves) {
        // Check room placement probability
        if (roomPlacementChance < 1.0) {
          const roll = rng.next();
          if (roll > roomPlacementChance) {
            ctx.trace.decision(
              "bsp.place-rooms",
              `Place room in leaf ${leaf.id}?`,
              ["yes", "no"],
              "no",
              `Roll ${roll.toFixed(3)} > ${roomPlacementChance} (roomPlacementChance)`,
            );
            continue;
          }
        }

        // Calculate maximum room size that fits in this leaf
        const maxWidth = leaf.width - config.roomPadding * 2;
        const maxHeight = leaf.height - config.roomPadding * 2;

        // Skip if leaf is too small
        if (maxWidth < config.minRoomSize || maxHeight < config.minRoomSize) {
          ctx.trace.warning(
            "bsp.place-rooms",
            `Skipping leaf ${leaf.id}: too small (${maxWidth}x${maxHeight}), need ${config.minRoomSize}x${config.minRoomSize}`,
          );
          continue;
        }

        // Try to select a template (70% chance for variety)
        // Templates define their own minLeafSize requirements
        const template = selectTemplateForLeaf(
          COMBINED_TEMPLATES,
          maxWidth,
          maxHeight,
          () => rng.next(),
          { templateChance: 0.7 },
        );

        let roomWidth: number;
        let roomHeight: number;
        let roomX: number;
        let roomY: number;
        let centerX: number;
        let centerY: number;

        if (template) {
          // Use template dimensions
          roomWidth = template.width;
          roomHeight = template.height;

          // Random position within leaf (with padding)
          roomX =
            leaf.x +
            config.roomPadding +
            range(() => rng.next(), 0, Math.max(0, maxWidth - roomWidth));
          roomY =
            leaf.y +
            config.roomPadding +
            range(() => rng.next(), 0, Math.max(0, maxHeight - roomHeight));

          // Calculate center from template
          const center = getTemplateCenter(template, roomX, roomY);
          centerX = center.x;
          centerY = center.y;

          ctx.trace.decision(
            "bsp.place-rooms",
            `Template in leaf ${leaf.id}?`,
            ["rectangle", template.shape],
            template.shape,
            `Using template ${template.id} (${roomWidth}x${roomHeight})`,
          );
        } else {
          // Random room size within constraints (rectangle)
          roomWidth = range(
            () => rng.next(),
            config.minRoomSize,
            Math.min(maxWidth, config.maxRoomSize),
          );
          roomHeight = range(
            () => rng.next(),
            config.minRoomSize,
            Math.min(maxHeight, config.maxRoomSize),
          );

          // Random position within leaf (with padding)
          roomX =
            leaf.x +
            config.roomPadding +
            range(() => rng.next(), 0, maxWidth - roomWidth);
          roomY =
            leaf.y +
            config.roomPadding +
            range(() => rng.next(), 0, maxHeight - roomHeight);

          centerX = Math.floor(roomX + roomWidth / 2);
          centerY = Math.floor(roomY + roomHeight / 2);
        }

        const room: Room = {
          id: rooms.length,
          x: roomX,
          y: roomY,
          width: roomWidth,
          height: roomHeight,
          centerX,
          centerY,
          type: "normal",
          seed: Math.floor(rng.next() * MAX_UINT32),
          template: template ?? undefined,
        };

        rooms.push(room);

        ctx.trace.decision(
          "bsp.place-rooms",
          `Room size in leaf ${leaf.id}?`,
          [
            `${config.minRoomSize}x${config.minRoomSize}`,
            `${config.maxRoomSize}x${config.maxRoomSize}`,
          ],
          `${roomWidth}x${roomHeight}`,
          `Placed room ${room.id} at (${roomX}, ${roomY})${template ? ` with template ${template.id}` : ""}`,
        );
      }

      ctx.trace.decision(
        "bsp.place-rooms",
        "Total rooms placed",
        [],
        rooms.length,
        `${rooms.length} rooms from ${leaves.length} leaves`,
      );

      return {
        ...input,
        rooms,
      };
    },
  };
}

// =============================================================================
// BUILD CONNECTIVITY PASS (MST with Delaunay Triangulation)
// =============================================================================

/**
 * Builds room connectivity graph using Minimum Spanning Tree.
 * Uses Delaunay triangulation for O(n) edges instead of O(n²) complete graph.
 */
export function buildConnectivity(): Pass<
  DungeonStateArtifact,
  DungeonStateArtifact,
  never
> {
  return {
    id: "bsp.build-connectivity",
    inputType: "dungeon-state",
    outputType: "dungeon-state",
    requiredStreams: [] as const,
    run(input, ctx) {
      const rooms = input.rooms;

      if (rooms.length <= 1) {
        return {
          ...input,
          edges: [],
        };
      }

      // Extract room centers for triangulation
      const centers: Point[] = rooms.map((room) => ({
        x: room.centerX,
        y: room.centerY,
      }));

      // Use Delaunay triangulation for O(n) edges instead of O(n²) complete graph
      const delaunayEdges = delaunayTriangulation(centers);

      ctx.trace.decision(
        "bsp.build-connectivity",
        "Delaunay triangulation",
        [],
        delaunayEdges.length,
        `Delaunay produced ${delaunayEdges.length} edges for ${rooms.length} rooms (vs ${(rooms.length * (rooms.length - 1)) / 2} for complete graph)`,
      );

      // Build MST from Delaunay edges
      const mstEdges = buildMSTFromEdges(centers, delaunayEdges);

      // Calculate total weight for tracing
      let totalWeight = 0;
      for (const [from, to] of mstEdges) {
        const roomA = rooms[from];
        const roomB = rooms[to];
        if (roomA && roomB) {
          totalWeight +=
            Math.abs(roomA.centerX - roomB.centerX) +
            Math.abs(roomA.centerY - roomB.centerY);
        }
      }

      ctx.trace.decision(
        "bsp.build-connectivity",
        "MST construction",
        [],
        mstEdges.length,
        `${mstEdges.length} edges connecting ${rooms.length} rooms, total weight: ${totalWeight}`,
      );

      return {
        ...input,
        edges: mstEdges,
      };
    },
  };
}

// =============================================================================
// COMPUTE ROOM METADATA PASS
// =============================================================================

/**
 * Computes structural metadata for rooms.
 * Calculates connectionCount, isDeadEnd, and distanceFromEntrance.
 * Does NOT assign game-specific types - that's the game layer's job.
 */
export function computeRoomMetadata(): Pass<
  DungeonStateArtifact,
  DungeonStateArtifact,
  never
> {
  return {
    id: "bsp.compute-room-metadata",
    inputType: "dungeon-state",
    outputType: "dungeon-state",
    requiredStreams: [] as const,
    run(input, ctx) {
      const rooms = input.rooms;
      const edges = input.edges;

      if (rooms.length === 0) {
        return input;
      }

      // Build adjacency map for connectivity analysis
      const adjacency = new Map<number, Set<number>>();
      for (const room of rooms) {
        adjacency.set(room.id, new Set());
      }
      for (const [fromId, toId] of edges) {
        adjacency.get(fromId)?.add(toId);
        adjacency.get(toId)?.add(fromId);
      }

      // Find entrance room (closest to top-left corner)
      let entranceRoom = rooms[0];
      if (!entranceRoom) return input;

      let minCornerDist = entranceRoom.x + entranceRoom.y;
      for (const room of rooms) {
        const dist = room.x + room.y;
        if (dist < minCornerDist) {
          minCornerDist = dist;
          entranceRoom = room;
        }
      }

      // Calculate distances from entrance using BFS
      const distances = new Map<number, number>();
      const queue: number[] = [entranceRoom.id];
      let queueHead = 0;
      distances.set(entranceRoom.id, 0);

      while (queueHead < queue.length) {
        const current = queue[queueHead++];
        if (current === undefined) break;
        const currentDist = distances.get(current) ?? 0;

        for (const neighbor of adjacency.get(current) ?? []) {
          if (!distances.has(neighbor)) {
            distances.set(neighbor, currentDist + 1);
            queue.push(neighbor);
          }
        }
      }

      // Add structural metadata to each room
      const roomsWithMetadata: Room[] = rooms.map((room) => {
        const connectionCount = adjacency.get(room.id)?.size ?? 0;
        const isDeadEnd = connectionCount === 1;
        const distanceFromEntrance = distances.get(room.id) ?? 0;

        return {
          ...room,
          connectionCount,
          isDeadEnd,
          distanceFromEntrance,
        };
      });

      const deadEndCount = roomsWithMetadata.filter((r) => r.isDeadEnd).length;
      const maxDistance = Math.max(
        ...roomsWithMetadata.map((r) => r.distanceFromEntrance ?? 0),
      );

      ctx.trace.decision(
        "bsp.compute-room-metadata",
        "Room metadata computed",
        ["connectionCount", "isDeadEnd", "distanceFromEntrance"],
        {
          totalRooms: rooms.length,
          deadEnds: deadEndCount,
          maxDistance,
        },
        `Computed metadata for ${rooms.length} rooms: ${deadEndCount} dead-ends, max distance ${maxDistance}`,
      );

      return {
        ...input,
        rooms: roomsWithMetadata,
      };
    },
  };
}

// =============================================================================
// CARVE ROOMS PASS
// =============================================================================

/**
 * Carves rooms into the grid
 */
export function carveRooms(): Pass<
  DungeonStateArtifact,
  DungeonStateArtifact,
  never
> {
  return {
    id: "bsp.carve-rooms",
    inputType: "dungeon-state",
    outputType: "dungeon-state",
    requiredStreams: [] as const,
    run(input, ctx) {
      const grid = input.grid;
      let templatedCount = 0;

      for (const room of input.rooms) {
        if (room.template) {
          // Carve template cells
          for (const cell of room.template.cells) {
            const x = room.x + cell.dx;
            const y = room.y + cell.dy;
            if (grid.isInBounds(x, y)) {
              grid.set(x, y, CellType.FLOOR);
            }
          }
          templatedCount++;
        } else {
          // Fallback to rectangle
          grid.fillRect(
            room.x,
            room.y,
            room.width,
            room.height,
            CellType.FLOOR,
          );
        }
      }

      ctx.trace.decision(
        "bsp.carve-rooms",
        "Rooms carved",
        [],
        input.rooms.length,
        `Carved ${input.rooms.length} rooms (${templatedCount} templated, ${input.rooms.length - templatedCount} rectangular)`,
      );

      return input;
    },
  };
}

// =============================================================================
// CARVE CORRIDORS PASS
// =============================================================================

/**
 * Carves corridors between connected rooms
 */
export function carveCorridors(): Pass<
  DungeonStateArtifact,
  DungeonStateArtifact,
  "connections"
> {
  return {
    id: "bsp.carve-corridors",
    inputType: "dungeon-state",
    outputType: "dungeon-state",
    requiredStreams: ["connections"] as const,
    run(input, ctx) {
      // Config is pre-validated with all defaults resolved
      const config = ctx.config.bsp;
      const rng = ctx.streams.connections; // Use connections RNG stream
      const grid = input.grid;
      const rooms = input.rooms;
      const edges = input.edges;

      const roomMap = new Map(rooms.map((r) => [r.id, r]));
      const connections: Connection[] = [];

      for (const [fromId, toId] of edges) {
        const fromRoom = roomMap.get(fromId);
        const toRoom = roomMap.get(toId);
        if (!fromRoom || !toRoom) continue;

        const from: Point = { x: fromRoom.centerX, y: fromRoom.centerY };
        const to: Point = { x: toRoom.centerX, y: toRoom.centerY };

        const randomVal = rng.next();
        const horizontalFirst = randomVal > 0.5;
        const corridorStyle = config.corridorStyle;

        ctx.trace.decision(
          "bsp.carve-corridors",
          `Corridor direction for rooms ${fromId}->${toId}?`,
          ["horizontal-first", "vertical-first"],
          horizontalFirst ? "horizontal-first" : "vertical-first",
          `Random: ${randomVal.toFixed(3)}`,
        );

        let pathLength: number;
        if (corridorStyle === "l-shaped") {
          pathLength = carveLShapedCorridorFast(
            grid,
            from,
            to,
            config.corridorWidth,
            horizontalFirst,
          );
        } else {
          const path = carveCorridor(
            grid,
            from,
            to,
            {
              width: config.corridorWidth,
              style: corridorStyle,
            },
            horizontalFirst,
          );
          pathLength = path.length;
        }

        connections.push({
          fromRoomId: fromId,
          toRoomId: toId,
          pathLength,
        });
      }

      ctx.trace.decision(
        "bsp.carve-corridors",
        "Corridors carved",
        [],
        connections.length,
        `Carved ${connections.length} ${config.corridorStyle} corridors with width ${config.corridorWidth}`,
      );

      return {
        ...input,
        connections,
      };
    },
  };
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
  never
> {
  return createPlaceEntranceExitPass("bsp");
}

// =============================================================================
// EXPORT ALL PASSES
// =============================================================================

export const BSPPasses = {
  initializeState,
  partitionBSP,
  placeRooms,
  buildConnectivity,
  computeRoomMetadata,
  carveRooms,
  carveCorridors,
  placeEntranceExit,
} as const;
