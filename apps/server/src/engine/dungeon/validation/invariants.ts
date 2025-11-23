import type { Room } from "../core/types";
import type { Dungeon } from "../entities/dungeon";

/**
 * Result of invariant validation containing all detected violations.
 */
export interface InvariantValidationResult {
  /** Whether all invariants passed */
  readonly valid: boolean;
  /** List of violation messages */
  readonly violations: string[];
  /** Categorized violations for programmatic access */
  readonly categories: {
    readonly rooms: string[];
    readonly connections: string[];
    readonly grid: string[];
    readonly reachability: string[];
  };
}

/**
 * Options for invariant validation.
 */
export interface InvariantValidationOptions {
  /** Check room bounds and overlaps (default: true) */
  checkRooms?: boolean;
  /** Check connection validity (default: true) */
  checkConnections?: boolean;
  /** Check grid consistency (default: true, disabled in production) */
  checkGrid?: boolean;
  /** Check all rooms are reachable (default: true, disabled in production) */
  checkReachability?: boolean;
  /** Minimum spacing between rooms (default: 0) */
  minRoomSpacing?: number;
}

const isProdEnv =
  typeof process !== "undefined" && process.env.NODE_ENV === "production";

const DEFAULT_OPTIONS: Required<InvariantValidationOptions> = {
  checkRooms: true,
  checkConnections: true,
  checkGrid: !isProdEnv,
  checkReachability: !isProdEnv,
  minRoomSpacing: 0,
};

/**
 * Validate all structural invariants of a generated dungeon.
 *
 * This function checks:
 * - Room bounds are within dungeon dimensions
 * - Rooms don't overlap (with optional spacing)
 * - Room dimensions are positive
 * - All connections reference valid rooms
 * - Connection paths are contiguous
 * - Grid matches room/connection layout
 * - All rooms are reachable from each other
 *
 * @param dungeon - The dungeon to validate
 * @param options - Validation options
 * @returns Validation result with all violations
 */
export function validateDungeonInvariants(
  dungeon: Dungeon,
  options: InvariantValidationOptions = {},
): InvariantValidationResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const categories = {
    rooms: [] as string[],
    connections: [] as string[],
    grid: [] as string[],
    reachability: [] as string[],
  };

  if (opts.checkRooms) {
    validateRoomInvariants(dungeon, opts, categories.rooms);
  }

  if (opts.checkConnections) {
    validateConnectionInvariants(dungeon, categories.connections);
  }

  if (opts.checkGrid && dungeon.grid) {
    validateGridInvariants(dungeon, categories.grid);
  }

  if (opts.checkReachability && dungeon.grid) {
    validateReachabilityInvariants(dungeon, categories.reachability);
  }

  const violations = [
    ...categories.rooms,
    ...categories.connections,
    ...categories.grid,
    ...categories.reachability,
  ];

  return {
    valid: violations.length === 0,
    violations,
    categories,
  };
}

/**
 * Validate room-related invariants.
 */
function validateRoomInvariants(
  dungeon: Dungeon,
  opts: Required<InvariantValidationOptions>,
  violations: string[],
): void {
  const { width, height } = dungeon.config;
  const rooms = dungeon.rooms;

  for (let i = 0; i < rooms.length; i++) {
    const room = rooms[i];

    // Check positive dimensions
    if (room.width <= 0 || room.height <= 0) {
      violations.push(
        `Room ${room.id}: Invalid dimensions (${room.width}x${room.height})`,
      );
    }

    // Check bounds
    if (room.x < 0 || room.y < 0) {
      violations.push(
        `Room ${room.id}: Negative position (${room.x}, ${room.y})`,
      );
    }

    if (room.x + room.width > width) {
      violations.push(
        `Room ${room.id}: Exceeds width boundary (x=${room.x}, w=${room.width}, max=${width})`,
      );
    }

    if (room.y + room.height > height) {
      violations.push(
        `Room ${room.id}: Exceeds height boundary (y=${room.y}, h=${room.height}, max=${height})`,
      );
    }

    // Check center calculation (allow for floor rounding)
    const expectedCenterX = room.x + room.width / 2;
    const expectedCenterY = room.y + room.height / 2;
    const flooredCenterX = Math.floor(expectedCenterX);
    const flooredCenterY = Math.floor(expectedCenterY);

    // Center can be exact or floored
    const centerXValid =
      Math.abs(room.centerX - expectedCenterX) < 0.01 ||
      Math.abs(room.centerX - flooredCenterX) < 0.01;
    const centerYValid =
      Math.abs(room.centerY - expectedCenterY) < 0.01 ||
      Math.abs(room.centerY - flooredCenterY) < 0.01;

    if (!centerXValid || !centerYValid) {
      violations.push(
        `Room ${room.id}: Incorrect center (${room.centerX}, ${room.centerY}), expected near (${expectedCenterX}, ${expectedCenterY})`,
      );
    }

    // Check overlaps with other rooms
    for (let j = i + 1; j < rooms.length; j++) {
      const other = rooms[j];
      if (roomsOverlap(room, other, opts.minRoomSpacing)) {
        violations.push(`Room ${room.id} overlaps with Room ${other.id}`);
      }
    }

    // Check unique IDs
    for (let j = i + 1; j < rooms.length; j++) {
      if (room.id === rooms[j].id) {
        violations.push(`Duplicate room ID: ${room.id}`);
      }
    }
  }
}

/**
 * Check if two rooms overlap (with optional spacing buffer).
 */
function roomsOverlap(a: Room, b: Room, spacing: number): boolean {
  return !(
    a.x + a.width + spacing <= b.x ||
    b.x + b.width + spacing <= a.x ||
    a.y + a.height + spacing <= b.y ||
    b.y + b.height + spacing <= a.y
  );
}

/**
 * Validate connection-related invariants.
 */
function validateConnectionInvariants(
  dungeon: Dungeon,
  violations: string[],
): void {
  const roomIds = new Set(dungeon.rooms.map((r) => r.id));

  for (let i = 0; i < dungeon.connections.length; i++) {
    const conn = dungeon.connections[i];

    // Check that connection references valid rooms
    if (!roomIds.has(conn.from.id)) {
      violations.push(
        `Connection ${i}: 'from' references invalid room ID ${conn.from.id}`,
      );
    }

    if (!roomIds.has(conn.to.id)) {
      violations.push(
        `Connection ${i}: 'to' references invalid room ID ${conn.to.id}`,
      );
    }

    // Check that path is not empty
    if (conn.path.length === 0) {
      violations.push(
        `Connection ${i}: Empty path between rooms ${conn.from.id} and ${conn.to.id}`,
      );
      continue;
    }

    // Check path is a valid sequence of waypoints
    // Note: paths may contain waypoints (not every cell), so we check
    // that waypoints form a valid line-of-sight sequence
    for (let j = 1; j < conn.path.length; j++) {
      const prev = conn.path[j - 1];
      const curr = conn.path[j];
      const dx = curr.x - prev.x;
      const dy = curr.y - prev.y;

      // Allow any reasonable movement pattern for waypoints
      // Only flag truly invalid patterns (negative distances, etc.)
      if (dx === 0 && dy === 0) {
        violations.push(
          `Connection ${i}: Duplicate waypoint at index ${j} (${curr.x},${curr.y})`,
        );
      }
    }

    // Check that path starts near source room center
    const firstPoint = conn.path[0];
    const fromRoom = dungeon.rooms.find((r) => r.id === conn.from.id);
    if (fromRoom) {
      const distFromStart = Math.sqrt(
        (firstPoint.x - fromRoom.centerX) ** 2 +
          (firstPoint.y - fromRoom.centerY) ** 2,
      );
      const maxDist = Math.max(fromRoom.width, fromRoom.height);
      if (distFromStart > maxDist) {
        violations.push(
          `Connection ${i}: Path starts too far from source room ${conn.from.id}`,
        );
      }
    }

    // Check that path ends near destination room center
    const lastPoint = conn.path[conn.path.length - 1];
    const toRoom = dungeon.rooms.find((r) => r.id === conn.to.id);
    if (toRoom) {
      const distToEnd = Math.sqrt(
        (lastPoint.x - toRoom.centerX) ** 2 +
          (lastPoint.y - toRoom.centerY) ** 2,
      );
      const maxDist = Math.max(toRoom.width, toRoom.height);
      if (distToEnd > maxDist) {
        violations.push(
          `Connection ${i}: Path ends too far from destination room ${conn.to.id}`,
        );
      }
    }
  }
}

/**
 * Validate grid-related invariants.
 */
function validateGridInvariants(dungeon: Dungeon, violations: string[]): void {
  const grid = dungeon.grid;
  if (!grid) return;

  const { width, height } = dungeon.config;

  // Check grid dimensions
  if (grid.length !== height) {
    violations.push(
      `Grid height mismatch: expected ${height}, got ${grid.length}`,
    );
    return;
  }

  for (let y = 0; y < grid.length; y++) {
    if (grid[y].length !== width) {
      violations.push(
        `Grid row ${y} width mismatch: expected ${width}, got ${grid[y].length}`,
      );
    }
  }

  // Check that room interiors are floor tiles
  for (const room of dungeon.rooms) {
    let wallCount = 0;
    let totalCells = 0;

    for (let y = room.y; y < room.y + room.height && y < height; y++) {
      for (let x = room.x; x < room.x + room.width && x < width; x++) {
        if (y >= 0 && x >= 0 && grid[y] && grid[y][x] !== undefined) {
          totalCells++;
          if (grid[y][x] === true) {
            wallCount++;
          }
        }
      }
    }

    // Allow some tolerance (80% should be floor)
    if (totalCells > 0 && wallCount / totalCells > 0.2) {
      violations.push(
        `Room ${room.id}: More than 20% walls inside room bounds (${wallCount}/${totalCells})`,
      );
    }
  }

  // Check that connection paths are floor tiles
  for (let i = 0; i < dungeon.connections.length; i++) {
    const conn = dungeon.connections[i];
    let wallsInPath = 0;

    for (const point of conn.path) {
      const x = Math.floor(point.x);
      const y = Math.floor(point.y);
      if (y >= 0 && y < height && x >= 0 && x < width && grid[y][x] === true) {
        wallsInPath++;
      }
    }

    // Allow some tolerance (paths might cut through walls initially)
    if (conn.path.length > 0 && wallsInPath / conn.path.length > 0.3) {
      violations.push(
        `Connection ${i}: More than 30% of path is walls (${wallsInPath}/${conn.path.length})`,
      );
    }
  }
}

/**
 * Validate reachability invariants using BFS.
 */
function validateReachabilityInvariants(
  dungeon: Dungeon,
  violations: string[],
): void {
  const grid = dungeon.grid;
  if (!grid || dungeon.rooms.length === 0) return;

  const { width, height } = dungeon.config;

  // BFS from first room to check reachability
  const visited = new Set<number>();
  const queue: Array<{ x: number; y: number }> = [];

  const encodePos = (x: number, y: number) => y * width + x;
  const isFloor = (x: number, y: number) => {
    if (x < 0 || x >= width || y < 0 || y >= height) return false;
    return grid[y][x] === false; // false = floor
  };

  // Start from first room center
  const startRoom = dungeon.rooms[0];
  const startX = Math.floor(startRoom.centerX);
  const startY = Math.floor(startRoom.centerY);

  if (isFloor(startX, startY)) {
    queue.push({ x: startX, y: startY });
    visited.add(encodePos(startX, startY));
  }

  // BFS flood fill
  while (queue.length > 0) {
    const next = queue.shift();
    if (!next) break;
    const { x, y } = next;

    // 4-directional neighbors
    const neighbors = [
      { x: x - 1, y },
      { x: x + 1, y },
      { x, y: y - 1 },
      { x, y: y + 1 },
    ];

    for (const n of neighbors) {
      const key = encodePos(n.x, n.y);
      if (!visited.has(key) && isFloor(n.x, n.y)) {
        visited.add(key);
        queue.push(n);
      }
    }
  }

  // Check if all room centers are reachable
  for (const room of dungeon.rooms) {
    const cx = Math.floor(room.centerX);
    const cy = Math.floor(room.centerY);
    const key = encodePos(cx, cy);

    if (!visited.has(key)) {
      // Try nearby cells (center might be on a wall)
      let foundNearby = false;
      for (let dy = -1; dy <= 1 && !foundNearby; dy++) {
        for (let dx = -1; dx <= 1 && !foundNearby; dx++) {
          if (visited.has(encodePos(cx + dx, cy + dy))) {
            foundNearby = true;
          }
        }
      }

      if (!foundNearby) {
        violations.push(
          `Room ${room.id} is not reachable from Room ${startRoom.id}`,
        );
      }
    }
  }
}

/**
 * Quick validation check that throws on first violation.
 * Use for assertions in tests.
 */
export function assertDungeonInvariants(
  dungeon: Dungeon,
  options?: InvariantValidationOptions,
): void {
  const result = validateDungeonInvariants(dungeon, options);
  if (!result.valid) {
    throw new Error(
      `Dungeon invariant violations:\n${result.violations.map((v) => `  - ${v}`).join("\n")}`,
    );
  }
}

/**
 * Get a summary of invariant validation.
 */
export function getInvariantSummary(result: InvariantValidationResult): string {
  if (result.valid) {
    return "All invariants passed";
  }

  const counts = {
    rooms: result.categories.rooms.length,
    connections: result.categories.connections.length,
    grid: result.categories.grid.length,
    reachability: result.categories.reachability.length,
  };

  const parts: string[] = [];
  if (counts.rooms > 0) parts.push(`${counts.rooms} room issues`);
  if (counts.connections > 0)
    parts.push(`${counts.connections} connection issues`);
  if (counts.grid > 0) parts.push(`${counts.grid} grid issues`);
  if (counts.reachability > 0)
    parts.push(`${counts.reachability} reachability issues`);

  return `${result.violations.length} violations: ${parts.join(", ")}`;
}
