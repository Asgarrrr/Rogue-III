/**
 * Door Placement Pass
 *
 * Adds doors to corridor connections by detecting chokepoints and
 * room-corridor transitions.
 *
 * @example
 * ```typescript
 * import { placeDoors } from "@rogue/procgen/passes/carving/door-placement";
 *
 * // Add door placement to a pipeline
 * const pipeline = createPipeline()
 *   .pipe(carveCorridors())
 *   .pipe(placeDoors({ doorRatio: 0.5 }));
 * ```
 */

import type { Point } from "../../core/geometry/types";
import { CellType, type Grid } from "../../core/grid";
import type {
  Connection,
  ConnectionType,
  DungeonStateArtifact,
  Pass,
  Room,
} from "../../pipeline/types";

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Door placement configuration
 */
export interface DoorPlacementConfig {
  /** Ratio of connections that should have doors (0-1). Default: 0.5 */
  readonly doorRatio?: number;
  /** Allow locked doors. Default: false */
  readonly allowLockedDoors?: boolean;
  /** Ratio of doors that are locked (0-1). Default: 0.1 */
  readonly lockedDoorRatio?: number;
  /** Minimum corridor length to place a door. Default: 3 */
  readonly minCorridorLength?: number;
  /** Preferred door position: "center", "start", "end", "chokepoint". Default: "chokepoint" */
  readonly preferredPosition?: "center" | "start" | "end" | "chokepoint";
}

/**
 * Default door placement configuration
 */
export const DEFAULT_DOOR_CONFIG: Required<DoorPlacementConfig> = {
  doorRatio: 0.5,
  allowLockedDoors: false,
  lockedDoorRatio: 0.1,
  minCorridorLength: 3,
  preferredPosition: "chokepoint",
};

// =============================================================================
// DOOR DETECTION UTILITIES
// =============================================================================

/**
 * Find the best position for a door along a corridor path
 */
export function findDoorPosition(
  path: readonly Point[],
  grid: Grid,
  preference: "center" | "start" | "end" | "chokepoint",
): Point | undefined {
  if (path.length === 0) return undefined;

  switch (preference) {
    case "start":
      return path[0];
    case "end":
      return path[path.length - 1];
    case "center":
      return path[Math.floor(path.length / 2)];
    case "chokepoint":
      return findChokepoint(path, grid);
    default:
      return path[Math.floor(path.length / 2)];
  }
}

/**
 * Find a chokepoint (narrowest passage) along a corridor path.
 * A chokepoint is where the corridor has the least floor neighbors.
 */
export function findChokepoint(
  path: readonly Point[],
  grid: Grid,
): Point | undefined {
  if (path.length === 0) return undefined;

  let bestPoint = path[0];
  let minNeighbors = Number.POSITIVE_INFINITY;

  // Skip first and last points (they're inside rooms)
  const start = Math.min(2, path.length - 1);
  const end = Math.max(path.length - 2, start);

  for (let i = start; i < end; i++) {
    const point = path[i];
    if (!point) continue;

    const neighbors = countFloorNeighbors(grid, point.x, point.y);
    if (neighbors < minNeighbors) {
      minNeighbors = neighbors;
      bestPoint = point;
    }
  }

  return bestPoint;
}

/**
 * Count floor neighbors around a cell (8-directional)
 */
function countFloorNeighbors(grid: Grid, x: number, y: number): number {
  let count = 0;
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = x + dx;
      const ny = y + dy;
      if (grid.isInBounds(nx, ny) && grid.get(nx, ny) === CellType.FLOOR) {
        count++;
      }
    }
  }
  return count;
}

/**
 * Detect if a point is at the transition between a room and a corridor.
 * Returns true if this cell is adjacent to room cells on one side and corridor/wall on another.
 */
export function isRoomCorridorTransition(
  point: Point,
  _grid: Grid,
  rooms: readonly Room[],
): boolean {
  // Check if point is on the edge of any room
  for (const room of rooms) {
    // Check if point is just outside the room boundary
    const isOnRoomEdge =
      (point.x === room.x - 1 ||
        point.x === room.x + room.width) &&
      point.y >= room.y &&
      point.y < room.y + room.height;
    const isOnRoomEdgeV =
      (point.y === room.y - 1 ||
        point.y === room.y + room.height) &&
      point.x >= room.x &&
      point.x < room.x + room.width;

    if (isOnRoomEdge || isOnRoomEdgeV) {
      return true;
    }
  }
  return false;
}

/**
 * Determine door type based on random value and config
 */
function getDoorType(
  roll: number,
  allowLocked: boolean,
  lockedRatio: number,
): ConnectionType {
  if (allowLocked && roll < lockedRatio) {
    return "locked_door";
  }
  return "door";
}

// =============================================================================
// DOOR PLACEMENT PASS
// =============================================================================

/**
 * Creates a pass that adds door metadata to connections.
 * This pass modifies existing connections to add door positions and types.
 */
export function placeDoors(
  config: DoorPlacementConfig = {},
): Pass<DungeonStateArtifact, DungeonStateArtifact, "details"> {
  const resolvedConfig: Required<DoorPlacementConfig> = {
    ...DEFAULT_DOOR_CONFIG,
    ...config,
  };

  return {
    id: "carving.place-doors",
    inputType: "dungeon-state",
    outputType: "dungeon-state",
    requiredStreams: ["details"] as const,
    run(input, ctx) {
      const rng = ctx.streams.details;
      const { grid, connections } = input;

      const updatedConnections: Connection[] = [];
      let doorsPlaced = 0;
      let lockedDoors = 0;

      for (const conn of connections) {
        // Check if this connection should have a door
        const shouldHaveDoor =
          conn.path &&
          conn.path.length >= resolvedConfig.minCorridorLength &&
          rng.next() < resolvedConfig.doorRatio;

        if (!shouldHaveDoor) {
          // Keep connection as-is (open)
          updatedConnections.push({
            ...conn,
            type: conn.type ?? "open",
          });
          continue;
        }

        // Find door position
        const doorPosition = findDoorPosition(
          conn.path!,
          grid,
          resolvedConfig.preferredPosition,
        );

        if (!doorPosition) {
          updatedConnections.push({
            ...conn,
            type: conn.type ?? "open",
          });
          continue;
        }

        // Determine door type
        const doorType = getDoorType(
          rng.next(),
          resolvedConfig.allowLockedDoors,
          resolvedConfig.lockedDoorRatio,
        );

        doorsPlaced++;
        if (doorType === "locked_door") {
          lockedDoors++;
        }

        updatedConnections.push({
          ...conn,
          type: doorType,
          doorPosition,
          metadata: doorType === "locked_door"
            ? { keyId: `key_${conn.fromRoomId}_${conn.toRoomId}`, visible: true }
            : { visible: true },
        });

        ctx.trace.decision(
          "carving.place-doors",
          `Door for connection ${conn.fromRoomId}->${conn.toRoomId}`,
          ["open", "door", "locked_door"],
          doorType,
          `Placed ${doorType} at (${doorPosition.x}, ${doorPosition.y})`,
        );
      }

      ctx.trace.decision(
        "carving.place-doors",
        "Door placement summary",
        [],
        { total: doorsPlaced, locked: lockedDoors },
        `Placed ${doorsPlaced} doors (${lockedDoors} locked) on ${connections.length} connections`,
      );

      return {
        ...input,
        connections: updatedConnections,
      };
    },
  };
}

// =============================================================================
// DOOR VALIDATION
// =============================================================================

/**
 * Validate that all locked doors have corresponding keys in the dungeon.
 * This is a utility function for game layer validation.
 */
export function validateDoorKeys(connections: readonly Connection[]): {
  valid: boolean;
  missingKeys: string[];
} {
  const lockedDoors = connections.filter((c) => c.type === "locked_door");
  const requiredKeys = lockedDoors
    .map((c) => c.metadata?.keyId)
    .filter((k): k is string => k !== undefined);

  // In this simple implementation, all keys are "missing" since we don't have key placement yet
  // The game layer would need to implement key placement and call this validation
  return {
    valid: requiredKeys.length === 0,
    missingKeys: requiredKeys,
  };
}

/**
 * Get statistics about doors in connections
 */
export function getDoorStats(connections: readonly Connection[]): {
  total: number;
  open: number;
  doors: number;
  lockedDoors: number;
  secrets: number;
  bridges: number;
  oneWay: number;
} {
  const stats = {
    total: connections.length,
    open: 0,
    doors: 0,
    lockedDoors: 0,
    secrets: 0,
    bridges: 0,
    oneWay: 0,
  };

  for (const conn of connections) {
    switch (conn.type) {
      case "door":
        stats.doors++;
        break;
      case "locked_door":
        stats.lockedDoors++;
        break;
      case "secret":
        stats.secrets++;
        break;
      case "bridge":
        stats.bridges++;
        break;
      case "one_way":
        stats.oneWay++;
        break;
      default:
        stats.open++;
    }
  }

  return stats;
}
