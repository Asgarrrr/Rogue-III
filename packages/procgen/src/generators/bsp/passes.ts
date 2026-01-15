/**
 * BSP Generator Passes
 *
 * Individual passes for the BSP dungeon generation pipeline.
 * Uses DungeonStateArtifact to carry full state through the pipeline.
 */

import { range, SeededRandom } from "@rogue/contracts";
import {
  buildMSTFromEdges,
  delaunayTriangulation,
} from "../../core/geometry/delaunay";
import type { Point } from "../../core/geometry/types";
import { CellType, Grid } from "../../core/grid";
import { calculateChecksum } from "../../core/hash";
import type {
  BSPNode,
  Connection,
  DungeonArtifact,
  DungeonStateArtifact,
  EmptyArtifact,
  Pass,
  Room,
  RoomType,
  SpawnPoint,
} from "../../pipeline/types";
import { DEFAULT_BSP_CONFIG } from "../../pipeline/types";
import {
  ALL_TEMPLATES,
  getTemplateCenter,
  selectTemplateForLeaf,
  SIGNATURE_PREFABS,
} from "../../prefabs";

// Combined templates: basic shapes + signature rooms
const COMBINED_TEMPLATES = [...ALL_TEMPLATES, ...SIGNATURE_PREFABS];

// =============================================================================
// INITIALIZE STATE PASS
// =============================================================================

/**
 * Creates initial dungeon state with wall-filled grid
 */
export function initializeState(): Pass<EmptyArtifact, DungeonStateArtifact> {
  return {
    id: "bsp.initialize-state",
    inputType: "empty",
    outputType: "dungeon-state",
    run(_input, ctx) {
      const grid = new Grid(ctx.config.width, ctx.config.height, CellType.WALL);

      ctx.trace.decision(
        "bsp.initialize-state",
        "Initialize grid",
        ["walls", "floors"],
        "walls",
        `Created ${ctx.config.width}x${ctx.config.height} grid filled with walls`,
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
// PARTITION BSP PASS
// =============================================================================

/**
 * Partitions space using BSP algorithm
 */
export function partitionBSP(): Pass<
  DungeonStateArtifact,
  DungeonStateArtifact
> {
  return {
    id: "bsp.partition",
    inputType: "dungeon-state",
    outputType: "dungeon-state",
    run(input, ctx) {
      const config = { ...DEFAULT_BSP_CONFIG, ...ctx.config.bsp };
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
        const maxDepth = config.maxDepth ?? 8;
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
          if (node.width > node.height * 1.25) {
            splitHorizontally = false;
            directionReason = `Width ${node.width} > height*1.25 (${(node.height * 1.25).toFixed(0)})`;
          } else if (node.height > node.width * 1.25) {
            splitHorizontally = true;
            directionReason = `Height ${node.height} > width*1.25 (${(node.width * 1.25).toFixed(0)})`;
          } else {
            const randomVal = rng.next();
            splitHorizontally = randomVal > 0.5;
            directionReason = `Random choice (${randomVal.toFixed(3)} ${splitHorizontally ? ">" : "<="} 0.5)`;
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
export function placeRooms(): Pass<DungeonStateArtifact, DungeonStateArtifact> {
  return {
    id: "bsp.place-rooms",
    inputType: "dungeon-state",
    outputType: "dungeon-state",
    run(input, ctx) {
      const config = { ...DEFAULT_BSP_CONFIG, ...ctx.config.bsp };
      const rng = ctx.streams.rooms; // Use rooms RNG stream
      const rooms: Room[] = [];

      const leaves = input.bspLeaves ?? [];

      const roomPlacementChance = config.roomPlacementChance ?? 1.0;

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
        const template = selectTemplateForLeaf(
          COMBINED_TEMPLATES,
          maxWidth,
          maxHeight,
          () => rng.next(),
          { templateChance: 0.7, minLeafSize: 8 },
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
          seed: Math.floor(rng.next() * 0xffffffff),
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
  DungeonStateArtifact
> {
  return {
    id: "bsp.build-connectivity",
    inputType: "dungeon-state",
    outputType: "dungeon-state",
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
// ASSIGN ROOM TYPES PASS
// =============================================================================

/**
 * Assigns semantic types to rooms based on position, size, and distance.
 * Entrance is the starting room (first or closest to corner).
 * Exit is the room furthest from entrance.
 * Boss room is large and near the exit.
 * Treasure rooms are small and off the main path.
 */
export function assignRoomTypes(): Pass<
  DungeonStateArtifact,
  DungeonStateArtifact
> {
  return {
    id: "bsp.assign-room-types",
    inputType: "dungeon-state",
    outputType: "dungeon-state",
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

      // Find entrance (room closest to top-left corner)
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

      // Calculate distances from entrance using BFS (index-based for O(1) dequeue)
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

      // Find exit (furthest room from entrance)
      let exitRoom = entranceRoom;
      let maxDist = 0;
      for (const room of rooms) {
        const dist = distances.get(room.id) ?? 0;
        if (dist > maxDist) {
          maxDist = dist;
          exitRoom = room;
        }
      }

      // Find boss room (second furthest, preferably large)
      let bossRoom: Room | null = null;
      let bossScore = -1;
      for (const room of rooms) {
        if (room.id === entranceRoom.id || room.id === exitRoom.id) continue;
        const dist = distances.get(room.id) ?? 0;
        const size = room.width * room.height;
        const score = dist * 10 + size; // Prefer far and large
        if (score > bossScore) {
          bossScore = score;
          bossRoom = room;
        }
      }

      // Identify dead-end rooms for treasure (rooms with only 1 connection)
      const treasureRooms = new Set<number>();
      for (const room of rooms) {
        if (room.id === entranceRoom.id || room.id === exitRoom.id) continue;
        if (room.id === bossRoom?.id) continue;
        const connections = adjacency.get(room.id)?.size ?? 0;
        if (connections === 1) {
          treasureRooms.add(room.id);
        }
      }

      // Use room seed for deterministic secondary type assignment
      const specialRooms = new Set<number>();

      // Assign types based on analysis
      const typedRooms: Room[] = rooms.map((room) => {
        let roomType: RoomType = "normal";

        if (room.id === entranceRoom.id) {
          roomType = "entrance";
          specialRooms.add(room.id);
        } else if (room.id === exitRoom.id) {
          roomType = "exit";
          specialRooms.add(room.id);
        } else if (room.id === bossRoom?.id) {
          roomType = "boss";
          specialRooms.add(room.id);
        } else if (treasureRooms.has(room.id)) {
          roomType = "treasure";
          specialRooms.add(room.id);
        } else {
          // Use room seed for secondary types (library, armory)
          const rng = new SeededRandom(room.seed);
          const roll = rng.next();
          if (roll < 0.1) {
            roomType = "library";
          } else if (roll < 0.2) {
            roomType = "armory";
          }
        }

        return {
          ...room,
          type: roomType,
        };
      });

      ctx.trace.decision(
        "bsp.assign-room-types",
        "Room types assigned",
        ["entrance", "exit", "boss", "treasure", "library", "armory", "normal"],
        {
          entrance: entranceRoom.id,
          exit: exitRoom.id,
          boss: bossRoom?.id,
          treasure: treasureRooms.size,
        },
        `Entrance: room ${entranceRoom.id}, Exit: room ${exitRoom.id}, Boss: room ${bossRoom?.id}, Treasures: ${treasureRooms.size}`,
      );

      return {
        ...input,
        rooms: typedRooms,
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
export function carveRooms(): Pass<DungeonStateArtifact, DungeonStateArtifact> {
  return {
    id: "bsp.carve-rooms",
    inputType: "dungeon-state",
    outputType: "dungeon-state",
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
  DungeonStateArtifact
> {
  return {
    id: "bsp.carve-corridors",
    inputType: "dungeon-state",
    outputType: "dungeon-state",
    run(input, ctx) {
      const config = { ...DEFAULT_BSP_CONFIG, ...ctx.config.bsp };
      const rng = ctx.streams.connections; // Use connections RNG stream
      const grid = input.grid;
      const rooms = input.rooms;
      const edges = input.edges;

      const roomMap = new Map(rooms.map((r) => [r.id, r]));
      const connections: Connection[] = [];
      const halfWidth = Math.floor(config.corridorWidth / 2);

      for (const [fromId, toId] of edges) {
        const fromRoom = roomMap.get(fromId);
        const toRoom = roomMap.get(toId);
        if (!fromRoom || !toRoom) continue;

        const from: Point = { x: fromRoom.centerX, y: fromRoom.centerY };
        const to: Point = { x: toRoom.centerX, y: toRoom.centerY };

        const path: Point[] = [];
        const randomVal = rng.next();
        const horizontalFirst = randomVal > 0.5;

        ctx.trace.decision(
          "bsp.carve-corridors",
          `Corridor direction for rooms ${fromId}->${toId}?`,
          ["horizontal-first", "vertical-first"],
          horizontalFirst ? "horizontal-first" : "vertical-first",
          `Random: ${randomVal.toFixed(3)}`,
        );

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

        connections.push({
          fromRoomId: fromId,
          toRoomId: toId,
          path,
        });
      }

      ctx.trace.decision(
        "bsp.carve-corridors",
        "Corridors carved",
        [],
        connections.length,
        `Carved ${connections.length} corridors with width ${config.corridorWidth}`,
      );

      return {
        ...input,
        connections,
      };
    },
  };
}

// =============================================================================
// CALCULATE SPAWNS PASS
// =============================================================================

/**
 * Calculates spawn points for entrance, exit, enemies, and treasure
 */
export function calculateSpawns(): Pass<
  DungeonStateArtifact,
  DungeonStateArtifact
> {
  return {
    id: "bsp.calculate-spawns",
    inputType: "dungeon-state",
    outputType: "dungeon-state",
    run(input, ctx) {
      const rooms = input.rooms;
      const grid = input.grid;

      if (rooms.length === 0) {
        return {
          ...input,
          spawns: [],
        };
      }

      const rng = ctx.streams.details; // Use details RNG stream
      const spawns: SpawnPoint[] = [];

      // Find entrance (first room)
      const entranceRoom = rooms[0];
      if (!entranceRoom) return { ...input, spawns: [] };

      spawns.push({
        position: { x: entranceRoom.centerX, y: entranceRoom.centerY },
        roomId: entranceRoom.id,
        type: "entrance",
        tags: ["spawn", "entrance"],
        weight: 1,
        distanceFromStart: 0,
      });

      // Find exit (furthest room from entrance)
      let maxDist = 0;
      let exitRoom: Room | null = null;

      for (const room of rooms) {
        if (room.id === entranceRoom.id) continue;
        const dist =
          Math.abs(room.centerX - entranceRoom.centerX) +
          Math.abs(room.centerY - entranceRoom.centerY);
        if (dist > maxDist) {
          maxDist = dist;
          exitRoom = room;
        }
      }

      // If no other room, use the entrance as exit too
      if (!exitRoom) {
        exitRoom = entranceRoom;
      }

      spawns.push({
        position: { x: exitRoom.centerX, y: exitRoom.centerY },
        roomId: exitRoom.id,
        type: "exit",
        tags: ["exit"],
        weight: 1,
        distanceFromStart: maxDist,
      });

      ctx.trace.decision(
        "bsp.calculate-spawns",
        "Exit room selection",
        rooms.map((r) => r.id),
        exitRoom.id,
        `Room ${exitRoom.id} is furthest from entrance (distance: ${maxDist})`,
      );

      // Add enemy and treasure spawns in other rooms
      for (const room of rooms) {
        if (room.id === entranceRoom.id || room.id === exitRoom.id) continue;

        const dist =
          Math.abs(room.centerX - entranceRoom.centerX) +
          Math.abs(room.centerY - entranceRoom.centerY);

        // Enemy spawn (70% chance)
        const enemyRoll = rng.next();
        if (enemyRoll < 0.7) {
          spawns.push({
            position: { x: room.centerX, y: room.centerY },
            roomId: room.id,
            type: "enemy",
            tags: ["enemy"],
            weight: maxDist > 0 ? dist / maxDist : 0,
            distanceFromStart: dist,
          });

          ctx.trace.decision(
            "bsp.calculate-spawns",
            `Spawn enemy in room ${room.id}?`,
            ["yes", "no"],
            "yes",
            `Roll ${enemyRoll.toFixed(3)} < 0.7`,
          );
        }

        // Treasure spawn (30% chance) - verify position is on floor
        const treasureRoll = rng.next();
        if (treasureRoll < 0.3) {
          const offsetX = range(() => rng.next(), -2, 2);
          const offsetY = range(() => rng.next(), -2, 2);

          // Calculate spawn position, clamping to room bounds
          const spawnX = Math.max(
            room.x + 1,
            Math.min(room.x + room.width - 2, room.centerX + offsetX),
          );
          const spawnY = Math.max(
            room.y + 1,
            Math.min(room.y + room.height - 2, room.centerY + offsetY),
          );

          // Only add if position is valid floor
          if (grid.get(spawnX, spawnY) === CellType.FLOOR) {
            spawns.push({
              position: { x: spawnX, y: spawnY },
              roomId: room.id,
              type: "treasure",
              tags: ["treasure", "loot"],
              weight: maxDist > 0 ? 1 - dist / maxDist : 1,
              distanceFromStart: dist,
            });

            ctx.trace.decision(
              "bsp.calculate-spawns",
              `Spawn treasure in room ${room.id}?`,
              ["yes", "no"],
              "yes",
              `Roll ${treasureRoll.toFixed(3)} < 0.3, position (${spawnX}, ${spawnY})`,
            );
          }
        }
      }

      ctx.trace.decision(
        "bsp.calculate-spawns",
        "Total spawn points",
        [],
        spawns.length,
        `${spawns.length} spawn points created`,
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
    id: "bsp.finalize",
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
        "bsp.finalize",
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

export const BSPPasses = {
  initializeState,
  partitionBSP,
  placeRooms,
  buildConnectivity,
  assignRoomTypes,
  carveRooms,
  carveCorridors,
  calculateSpawns,
  finalizeDungeon,
} as const;
