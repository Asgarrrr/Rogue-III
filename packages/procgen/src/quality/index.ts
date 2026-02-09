/**
 * Quality Assurance Utilities
 *
 * Statistical quality checks for detecting degenerate dungeon outputs.
 * These checks help ensure generated dungeons meet aesthetic and playability standards.
 */

import { BitGridPool, CellType, floodFillBFS, Grid } from "../core/grid";
import type {
  DungeonArtifact,
  QualityAssessment,
  QualityCheck,
  QualityThresholds,
  Room,
} from "../pipeline/types";
import { DEFAULT_QUALITY_THRESHOLDS } from "../pipeline/types";

// Re-export for convenience
export { DEFAULT_QUALITY_THRESHOLDS } from "../pipeline/types";

/**
 * Assess the quality of a generated dungeon.
 *
 * Performs multiple checks against configurable thresholds and returns
 * a detailed assessment with individual check results and an overall score.
 *
 * @example
 * ```typescript
 * const result = generate(config);
 * if (result.success) {
 *   const qa = assessQuality(result.artifact);
 *   if (!qa.success) {
 *     console.warn(`Quality score: ${qa.score}/100`);
 *     qa.checks.filter(c => !c.success).forEach(c => console.warn(c.message));
 *   }
 * }
 * ```
 */
export function assessQuality(
  dungeon: DungeonArtifact,
  thresholds: Partial<QualityThresholds> = {},
): QualityAssessment {
  const opts = { ...DEFAULT_QUALITY_THRESHOLDS, ...thresholds };
  const checks: QualityCheck[] = [];

  // Reconstruct grid for connectivity checks
  const grid = Grid.fromTerrain(dungeon.width, dungeon.height, dungeon.terrain);

  // Check 1: Room count
  const roomCount = dungeon.rooms.length;
  checks.push({
    name: "room-count-min",
    success: roomCount >= opts.minRooms,
    value: roomCount,
    threshold: opts.minRooms,
    message:
      roomCount >= opts.minRooms
        ? `Room count (${roomCount}) meets minimum (${opts.minRooms})`
        : `Room count (${roomCount}) below minimum (${opts.minRooms})`,
  });

  checks.push({
    name: "room-count-max",
    success: roomCount <= opts.maxRooms,
    value: roomCount,
    threshold: opts.maxRooms,
    message:
      roomCount <= opts.maxRooms
        ? `Room count (${roomCount}) within maximum (${opts.maxRooms})`
        : `Room count (${roomCount}) exceeds maximum (${opts.maxRooms})`,
  });

  // Check 2: Floor ratio
  const totalCells = dungeon.width * dungeon.height;
  const floorCells = countFloorCells(dungeon.terrain);
  const floorRatio = totalCells > 0 ? floorCells / totalCells : 0;

  checks.push({
    name: "floor-ratio-min",
    success: floorRatio >= opts.minFloorRatio,
    value: floorRatio,
    threshold: opts.minFloorRatio,
    message:
      floorRatio >= opts.minFloorRatio
        ? `Floor ratio (${(floorRatio * 100).toFixed(1)}%) meets minimum`
        : `Floor ratio (${(floorRatio * 100).toFixed(1)}%) too low (min: ${(opts.minFloorRatio * 100).toFixed(1)}%)`,
  });

  checks.push({
    name: "floor-ratio-max",
    success: floorRatio <= opts.maxFloorRatio,
    value: floorRatio,
    threshold: opts.maxFloorRatio,
    message:
      floorRatio <= opts.maxFloorRatio
        ? `Floor ratio (${(floorRatio * 100).toFixed(1)}%) within maximum`
        : `Floor ratio (${(floorRatio * 100).toFixed(1)}%) too high (max: ${(opts.maxFloorRatio * 100).toFixed(1)}%)`,
  });

  // Check 3: Average room size
  const avgRoomSize = calculateAvgRoomSize(dungeon.rooms);
  checks.push({
    name: "avg-room-size",
    success: avgRoomSize >= opts.minAvgRoomSize,
    value: avgRoomSize,
    threshold: opts.minAvgRoomSize,
    message:
      avgRoomSize >= opts.minAvgRoomSize
        ? `Average room size (${avgRoomSize.toFixed(1)}) meets minimum`
        : `Average room size (${avgRoomSize.toFixed(1)}) too small (min: ${opts.minAvgRoomSize})`,
  });

  // Check 4: Dead-end ratio (rooms with only 1 connection)
  const deadEndRatio = calculateDeadEndRatio(
    dungeon.rooms,
    dungeon.connections,
  );
  checks.push({
    name: "dead-end-ratio",
    success: deadEndRatio <= opts.maxDeadEndRatio,
    value: deadEndRatio,
    threshold: opts.maxDeadEndRatio,
    message:
      deadEndRatio <= opts.maxDeadEndRatio
        ? `Dead-end ratio (${(deadEndRatio * 100).toFixed(1)}%) within limit`
        : `Dead-end ratio (${(deadEndRatio * 100).toFixed(1)}%) too high (max: ${(opts.maxDeadEndRatio * 100).toFixed(1)}%)`,
  });

  // Check 5: Entrance->Exit path length sanity
  const entranceExitPathChecks = checkEntranceExitPathLength(
    grid,
    dungeon,
    floorCells,
    opts,
  );
  checks.push(...entranceExitPathChecks);

  // Check 6: Full connectivity
  if (opts.requireFullConnectivity && dungeon.rooms.length > 0) {
    const connectivityResult = checkFullConnectivity(grid, dungeon);
    checks.push(connectivityResult);
  }

  // Calculate overall score (0-100)
  let passedChecks = 0;
  for (const check of checks) {
    if (check.success) {
      passedChecks++;
    }
  }
  const score = Math.round((passedChecks / checks.length) * 100);

  return {
    success: passedChecks === checks.length,
    checks,
    score,
  };
}

function checkEntranceExitPathLength(
  grid: Grid,
  dungeon: DungeonArtifact,
  floorCells: number,
  thresholds: QualityThresholds,
): QualityCheck[] {
  const entrance = dungeon.spawns.find((s) => s.type === "entrance");
  const exit = dungeon.spawns.find((s) => s.type === "exit");

  if (!entrance || !exit) {
    return [
      {
        name: "entrance-exit-path-min",
        success: true,
        value: 0,
        threshold: thresholds.minEntranceExitPathLength,
        message: "Skipped: entrance or exit spawn is missing",
      },
      {
        name: "entrance-exit-path-max",
        success: true,
        value: 0,
        threshold: 0,
        message: "Skipped: entrance or exit spawn is missing",
      },
    ];
  }

  const pathLength = shortestPathLength(
    grid,
    entrance.position.x,
    entrance.position.y,
    exit.position.x,
    exit.position.y,
  );

  if (pathLength === null) {
    return [
      {
        name: "entrance-exit-path-min",
        success: false,
        value: 0,
        threshold: thresholds.minEntranceExitPathLength,
        message: "No walkable path between entrance and exit",
      },
      {
        name: "entrance-exit-path-max",
        success: false,
        value: 0,
        threshold: 0,
        message: "No walkable path between entrance and exit",
      },
    ];
  }

  const maxAllowed = Math.max(
    thresholds.minEntranceExitPathLength,
    Math.floor(floorCells * thresholds.maxEntranceExitPathFloorRatio),
  );

  return [
    {
      name: "entrance-exit-path-min",
      success: pathLength >= thresholds.minEntranceExitPathLength,
      value: pathLength,
      threshold: thresholds.minEntranceExitPathLength,
      message:
        pathLength >= thresholds.minEntranceExitPathLength
          ? `Entrance->exit path length (${pathLength}) meets minimum`
          : `Entrance->exit path length (${pathLength}) below minimum (${thresholds.minEntranceExitPathLength})`,
    },
    {
      name: "entrance-exit-path-max",
      success: pathLength <= maxAllowed,
      value: pathLength,
      threshold: maxAllowed,
      message:
        pathLength <= maxAllowed
          ? `Entrance->exit path length (${pathLength}) within maximum (${maxAllowed})`
          : `Entrance->exit path length (${pathLength}) exceeds maximum (${maxAllowed})`,
    },
  ];
}

/**
 * Count floor cells in terrain array
 */
function countFloorCells(terrain: Uint8Array): number {
  let count = 0;
  for (let i = 0; i < terrain.length; i++) {
    if (terrain[i] === CellType.FLOOR) count++;
  }
  return count;
}

/**
 * Calculate average room size
 */
function calculateAvgRoomSize(rooms: readonly Room[]): number {
  if (rooms.length === 0) return 0;
  let totalSize = 0;
  for (const room of rooms) {
    totalSize += room.width * room.height;
  }
  return totalSize / rooms.length;
}

/**
 * Calculate ratio of dead-end rooms (rooms with only 1 connection)
 */
function calculateDeadEndRatio(
  rooms: readonly Room[],
  connections: readonly { fromRoomId: number; toRoomId: number }[],
): number {
  if (rooms.length <= 1) return 0;

  const connectionCount = new Map<number, number>();
  for (const room of rooms) {
    connectionCount.set(room.id, 0);
  }

  for (const conn of connections) {
    connectionCount.set(
      conn.fromRoomId,
      (connectionCount.get(conn.fromRoomId) ?? 0) + 1,
    );
    connectionCount.set(
      conn.toRoomId,
      (connectionCount.get(conn.toRoomId) ?? 0) + 1,
    );
  }

  let deadEnds = 0;
  for (const count of connectionCount.values()) {
    if (count === 1) {
      deadEnds++;
    }
  }
  return deadEnds / rooms.length;
}

/**
 * Check if all rooms are reachable from entrance
 */
function checkFullConnectivity(
  grid: Grid,
  dungeon: DungeonArtifact,
): QualityCheck {
  const entrance = dungeon.spawns.find((s) => s.type === "entrance");
  if (!entrance) {
    return {
      name: "full-connectivity",
      success: false,
      value: 0,
      threshold: 1,
      message: "No entrance spawn point found",
    };
  }

  const entranceIsFloor =
    grid.get(entrance.position.x, entrance.position.y) === CellType.FLOOR;
  const reachable = entranceIsFloor
    ? floodFillBFS(
        dungeon.width,
        dungeon.height,
        entrance.position.x,
        entrance.position.y,
        (x, y) => grid.getUnsafe(x, y) === CellType.FLOOR,
      )
    : null;

  // Check each room has at least one reachable floor tile
  let reachableRooms = 0;
  try {
    for (const room of dungeon.rooms) {
      let roomReachable = false;
      if (reachable) {
        for (let y = room.y; y < room.y + room.height && !roomReachable; y++) {
          for (let x = room.x; x < room.x + room.width && !roomReachable; x++) {
            if (grid.get(x, y) === CellType.FLOOR && reachable.get(x, y)) {
              roomReachable = true;
            }
          }
        }
      }
      if (roomReachable) reachableRooms++;
    }
  } finally {
    if (reachable) {
      BitGridPool.release(reachable);
    }
  }

  const connectivityRatio =
    dungeon.rooms.length > 0 ? reachableRooms / dungeon.rooms.length : 1;

  return {
    name: "full-connectivity",
    success: connectivityRatio === 1,
    value: connectivityRatio,
    threshold: 1,
    message:
      connectivityRatio === 1
        ? `All ${dungeon.rooms.length} rooms are reachable`
        : `Only ${reachableRooms}/${dungeon.rooms.length} rooms are reachable`,
  };
}

function shortestPathLength(
  grid: Grid,
  startX: number,
  startY: number,
  goalX: number,
  goalY: number,
): number | null {
  if (!grid.isInBounds(startX, startY) || !grid.isInBounds(goalX, goalY)) {
    return null;
  }
  if (
    grid.get(startX, startY) !== CellType.FLOOR ||
    grid.get(goalX, goalY) !== CellType.FLOOR
  ) {
    return null;
  }
  if (startX === goalX && startY === goalY) {
    return 0;
  }

  const width = grid.width;
  const height = grid.height;
  const totalCells = width * height;
  const visited = new Uint8Array(totalCells);
  const queueIndex = new Int32Array(totalCells);
  const queueDist = new Int32Array(totalCells);
  const goalIndex = goalY * width + goalX;

  const startIndex = startY * width + startX;
  visited[startIndex] = 1;
  queueIndex[0] = startIndex;
  queueDist[0] = 0;

  let head = 0;
  let tail = 1;

  while (head < tail) {
    const index = queueIndex[head];
    const dist = queueDist[head];
    head++;

    if (index === undefined || dist === undefined) continue;

    const y = (index / width) | 0;
    const x = index - y * width;

    const nextDist = dist + 1;

    // N
    if (y > 0) {
      const ny = y - 1;
      const index = ny * width + x;
      if (visited[index] === 0 && grid.getUnsafe(x, ny) === CellType.FLOOR) {
        if (index === goalIndex) return nextDist;
        visited[index] = 1;
        queueIndex[tail] = index;
        queueDist[tail] = nextDist;
        tail++;
      }
    }

    // E
    if (x < width - 1) {
      const nx = x + 1;
      const index = y * width + nx;
      if (visited[index] === 0 && grid.getUnsafe(nx, y) === CellType.FLOOR) {
        if (index === goalIndex) return nextDist;
        visited[index] = 1;
        queueIndex[tail] = index;
        queueDist[tail] = nextDist;
        tail++;
      }
    }

    // S
    if (y < height - 1) {
      const ny = y + 1;
      const index = ny * width + x;
      if (visited[index] === 0 && grid.getUnsafe(x, ny) === CellType.FLOOR) {
        if (index === goalIndex) return nextDist;
        visited[index] = 1;
        queueIndex[tail] = index;
        queueDist[tail] = nextDist;
        tail++;
      }
    }

    // W
    if (x > 0) {
      const nx = x - 1;
      const index = y * width + nx;
      if (visited[index] === 0 && grid.getUnsafe(nx, y) === CellType.FLOOR) {
        if (index === goalIndex) return nextDist;
        visited[index] = 1;
        queueIndex[tail] = index;
        queueDist[tail] = nextDist;
        tail++;
      }
    }
  }

  return null;
}
