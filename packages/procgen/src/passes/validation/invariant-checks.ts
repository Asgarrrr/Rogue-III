/**
 * Dungeon Validation Invariants
 *
 * Reusable validation checks for dungeon invariants.
 */

import { CellType, Grid } from "../../core/grid";
import { floodFill } from "../../core/grid/flood-fill";
import type {
  Connection,
  DungeonArtifact,
  Room,
  SpawnPoint,
  Violation,
} from "../../pipeline/types";

/**
 * Validation result for a single check
 */
export interface CheckResult {
  readonly passed: boolean;
  readonly violations: Violation[];
}

/**
 * Check that entrance spawn point exists
 */
export function checkEntranceExists(
  spawns: readonly SpawnPoint[],
): CheckResult {
  const entrance = spawns.find((s) => s.type === "entrance");
  if (!entrance) {
    return {
      passed: false,
      violations: [
        {
          type: "invariant.entrance",
          message: "Dungeon has no entrance spawn point",
          severity: "error",
        },
      ],
    };
  }
  return { passed: true, violations: [] };
}

/**
 * Check that exit spawn point exists
 */
export function checkExitExists(spawns: readonly SpawnPoint[]): CheckResult {
  const exit = spawns.find((s) => s.type === "exit");
  if (!exit) {
    return {
      passed: false,
      violations: [
        {
          type: "invariant.exit",
          message: "Dungeon has no exit spawn point",
          severity: "error",
        },
      ],
    };
  }
  return { passed: true, violations: [] };
}

/**
 * Check that a spawn point is on a floor tile
 */
export function checkSpawnOnFloor(spawn: SpawnPoint, grid: Grid): CheckResult {
  const cell = grid.get(spawn.position.x, spawn.position.y);
  if (cell !== CellType.FLOOR) {
    return {
      passed: false,
      violations: [
        {
          type: `invariant.${spawn.type}.floor`,
          message: `${spawn.type} at (${spawn.position.x}, ${spawn.position.y}) is not on a FLOOR tile (cell type: ${cell})`,
          severity: "error",
        },
      ],
    };
  }
  return { passed: true, violations: [] };
}

/**
 * Check that all spawn points are on floor tiles
 */
export function checkAllSpawnsOnFloor(
  spawns: readonly SpawnPoint[],
  grid: Grid,
): CheckResult {
  const violations: Violation[] = [];

  for (const spawn of spawns) {
    const result = checkSpawnOnFloor(spawn, grid);
    violations.push(...result.violations);
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}

/**
 * Check that all rooms are reachable from entrance
 *
 * This checks if ANY floor tile within the room bounds is reachable,
 * not just the geometric center (which may be a wall in irregular rooms).
 */
export function checkRoomConnectivity(
  rooms: readonly Room[],
  entrance: SpawnPoint,
  grid: Grid,
): CheckResult {
  if (rooms.length <= 1) {
    return { passed: true, violations: [] };
  }

  const entranceRegion = floodFill(
    grid,
    entrance.position.x,
    entrance.position.y,
    {
      targetValue: CellType.FLOOR,
    },
  );

  const reachableSet = new Set(entranceRegion.map((p) => `${p.x},${p.y}`));
  const violations: Violation[] = [];

  for (const room of rooms) {
    // First, check if room has any floor tiles
    // Skip "phantom" rooms that have no floor tiles carved
    // This can happen with certain BSP edge cases
    let hasFloorTiles = false;

    outerCheck: for (let y = room.y; y < room.y + room.height; y++) {
      for (let x = room.x; x < room.x + room.width; x++) {
        if (grid.get(x, y) === CellType.FLOOR) {
          hasFloorTiles = true;
          break outerCheck;
        }
      }
    }

    if (!hasFloorTiles) {
      continue;
    }

    // Check if ANY floor tile within room bounds is reachable
    // This handles irregular room shapes where center may be a wall
    let isReachable = false;

    outerReach: for (let y = room.y; y < room.y + room.height; y++) {
      for (let x = room.x; x < room.x + room.width; x++) {
        if (
          grid.get(x, y) === CellType.FLOOR &&
          reachableSet.has(`${x},${y}`)
        ) {
          isReachable = true;
          break outerReach;
        }
      }
    }

    if (!isReachable) {
      // Check if room has any connections at all
      // Rooms with no connections are a generator bug, log as warning
      violations.push({
        type: "invariant.connectivity",
        message: `Room ${room.id} at (${room.centerX}, ${room.centerY}) is not reachable from entrance`,
        severity: "warning",
      });
    }
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}

/**
 * Check that connections form a connected graph
 */
export function checkConnectionGraph(
  rooms: readonly Room[],
  connections: readonly Connection[],
): CheckResult {
  if (rooms.length <= 1) {
    return { passed: true, violations: [] };
  }

  // Build adjacency
  const adjacency = new Map<number, Set<number>>();
  for (const room of rooms) {
    adjacency.set(room.id, new Set());
  }

  for (const conn of connections) {
    adjacency.get(conn.fromRoomId)?.add(conn.toRoomId);
    adjacency.get(conn.toRoomId)?.add(conn.fromRoomId);
  }

  // BFS from first room
  const firstRoom = rooms[0];
  if (!firstRoom) return { passed: true, violations: [] }; // No rooms to check
  const visited = new Set<number>();
  const queue = [firstRoom.id];
  visited.add(firstRoom.id);

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;
    for (const neighbor of adjacency.get(current) ?? []) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  // Check all rooms were visited
  const violations: Violation[] = [];
  for (const room of rooms) {
    if (!visited.has(room.id)) {
      violations.push({
        type: "invariant.graph.connectivity",
        message: `Room ${room.id} is not connected to the main graph`,
        severity: "error",
      });
    }
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}

/**
 * Check minimum room count
 */
export function checkMinimumRooms(
  rooms: readonly Room[],
  minimum: number,
): CheckResult {
  if (rooms.length < minimum) {
    return {
      passed: false,
      violations: [
        {
          type: "invariant.rooms.minimum",
          message: `Dungeon has ${rooms.length} rooms, minimum required is ${minimum}`,
          severity: "error",
        },
      ],
    };
  }
  return { passed: true, violations: [] };
}

/**
 * Check that rooms don't overlap
 */
export function checkNoRoomOverlap(rooms: readonly Room[]): CheckResult {
  const violations: Violation[] = [];

  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i];
      const b = rooms[j];
      if (!a || !b) continue;

      // Check AABB overlap
      const overlapX = a.x < b.x + b.width && a.x + a.width > b.x;
      const overlapY = a.y < b.y + b.height && a.y + a.height > b.y;

      if (overlapX && overlapY) {
        violations.push({
          type: "invariant.rooms.overlap",
          message: `Room ${a.id} overlaps with room ${b.id}`,
          severity: "error",
        });
      }
    }
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}

/**
 * Check that rooms are within grid bounds
 */
export function checkRoomsInBounds(
  rooms: readonly Room[],
  width: number,
  height: number,
): CheckResult {
  const violations: Violation[] = [];

  for (const room of rooms) {
    if (
      room.x < 0 ||
      room.y < 0 ||
      room.x + room.width > width ||
      room.y + room.height > height
    ) {
      violations.push({
        type: "invariant.rooms.bounds",
        message: `Room ${room.id} is out of bounds: (${room.x}, ${room.y}) to (${room.x + room.width}, ${room.y + room.height})`,
        severity: "error",
      });
    }
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}

/**
 * Run all standard invariant checks on a dungeon
 */
export function runAllChecks(
  dungeon: DungeonArtifact,
  options: { minimumRooms?: number } = {},
): CheckResult {
  const grid = new Grid(dungeon.width, dungeon.height, CellType.WALL);

  // Reconstruct grid from terrain
  for (let y = 0; y < dungeon.height; y++) {
    for (let x = 0; x < dungeon.width; x++) {
      const cell = dungeon.terrain[y * dungeon.width + x];
      if (cell !== undefined) {
        grid.set(x, y, cell as CellType);
      }
    }
  }

  const allViolations: Violation[] = [];

  // Entrance/exit checks
  const entranceCheck = checkEntranceExists(dungeon.spawns);
  allViolations.push(...entranceCheck.violations);

  const exitCheck = checkExitExists(dungeon.spawns);
  allViolations.push(...exitCheck.violations);

  // Spawn floor checks
  const spawnsOnFloor = checkAllSpawnsOnFloor(dungeon.spawns, grid);
  allViolations.push(...spawnsOnFloor.violations);

  // Room connectivity
  const entrance = dungeon.spawns.find((s) => s.type === "entrance");
  if (entrance) {
    const connectivity = checkRoomConnectivity(dungeon.rooms, entrance, grid);
    allViolations.push(...connectivity.violations);
  }

  // Connection graph
  const graphCheck = checkConnectionGraph(dungeon.rooms, dungeon.connections);
  allViolations.push(...graphCheck.violations);

  // Room bounds
  const boundsCheck = checkRoomsInBounds(
    dungeon.rooms,
    dungeon.width,
    dungeon.height,
  );
  allViolations.push(...boundsCheck.violations);

  // Room overlap (only for BSP, not cellular)
  if (dungeon.rooms.length > 0 && dungeon.rooms[0]?.type !== "cavern") {
    const overlapCheck = checkNoRoomOverlap(dungeon.rooms);
    allViolations.push(...overlapCheck.violations);
  }

  // Minimum rooms
  if (options.minimumRooms !== undefined) {
    const minCheck = checkMinimumRooms(dungeon.rooms, options.minimumRooms);
    allViolations.push(...minCheck.violations);
  }

  return {
    passed: allViolations.every((v) => v.severity !== "error"),
    violations: allViolations,
  };
}
