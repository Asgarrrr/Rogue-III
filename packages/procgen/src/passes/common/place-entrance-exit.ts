/**
 * Common Entrance/Exit Placement Pass
 *
 * Shared structural spawn placement for room-based generators.
 */

import type { Point } from "../../core/geometry/types";
import { CellType, type Grid } from "../../core/grid";
import type { DungeonStateArtifact, Pass, Room, SpawnPoint } from "../../pipeline/types";

/**
 * Find a spawn position on FLOOR for a room.
 * Prefers center, then nearest floor inside room bounds, then nearest global floor.
 */
export function resolveSpawnPositionInRoom(grid: Grid, room: Room): Point {
  if (grid.get(room.centerX, room.centerY) === CellType.FLOOR) {
    return { x: room.centerX, y: room.centerY };
  }

  // Find nearest floor within room bounds (deterministic tie-break by scan order)
  const minX = Math.max(0, room.x);
  const minY = Math.max(0, room.y);
  const maxX = Math.min(grid.width, room.x + room.width);
  const maxY = Math.min(grid.height, room.y + room.height);

  let bestX = room.centerX;
  let bestY = room.centerY;
  let bestDistance = Infinity;

  for (let y = minY; y < maxY; y++) {
    for (let x = minX; x < maxX; x++) {
      if (grid.getUnsafe(x, y) !== CellType.FLOOR) continue;
      const dist = Math.abs(x - room.centerX) + Math.abs(y - room.centerY);
      if (dist < bestDistance) {
        bestDistance = dist;
        bestX = x;
        bestY = y;
      }
    }
  }

  if (bestDistance !== Infinity) {
    return { x: bestX, y: bestY };
  }

  // Fallback: nearest floor tile globally from room center
  const width = grid.width;
  const height = grid.height;
  const maxDistance = width + height;
  const startX = Math.max(0, Math.min(width - 1, room.centerX));
  const startY = Math.max(0, Math.min(height - 1, room.centerY));
  const visited = new Uint8Array(width * height);
  const queueX: number[] = [startX];
  const queueY: number[] = [startY];
  const queueDist: number[] = [0];
  visited[startY * width + startX] = 1;
  let head = 0;

  while (head < queueX.length) {
    const x = queueX[head];
    const y = queueY[head];
    const dist = queueDist[head];
    head++;
    if (x === undefined || y === undefined || dist === undefined) break;
    if (dist > maxDistance) continue;

    if (grid.getUnsafe(x, y) === CellType.FLOOR) {
      return { x, y };
    }

    const nextDist = dist + 1;

    // N
    if (y > 0) {
      const ny = y - 1;
      const index = ny * width + x;
      if (visited[index] === 0) {
        visited[index] = 1;
        queueX.push(x);
        queueY.push(ny);
        queueDist.push(nextDist);
      }
    }

    // E
    if (x < width - 1) {
      const nx = x + 1;
      const index = y * width + nx;
      if (visited[index] === 0) {
        visited[index] = 1;
        queueX.push(nx);
        queueY.push(y);
        queueDist.push(nextDist);
      }
    }

    // S
    if (y < height - 1) {
      const ny = y + 1;
      const index = ny * width + x;
      if (visited[index] === 0) {
        visited[index] = 1;
        queueX.push(x);
        queueY.push(ny);
        queueDist.push(nextDist);
      }
    }

    // W
    if (x > 0) {
      const nx = x - 1;
      const index = y * width + nx;
      if (visited[index] === 0) {
        visited[index] = 1;
        queueX.push(nx);
        queueY.push(y);
        queueDist.push(nextDist);
      }
    }
  }

  return { x: startX, y: startY };
}

/**
 * Create a room-based entrance/exit placement pass for a given namespace.
 */
export function createPlaceEntranceExitPass(
  namespace: string,
): Pass<DungeonStateArtifact, DungeonStateArtifact, never> {
  const passId = `${namespace}.place-entrance-exit`;

  return {
    id: passId,
    inputType: "dungeon-state",
    outputType: "dungeon-state",
    requiredStreams: [] as const,
    run(input, ctx) {
      const { rooms } = input;
      const spawns: SpawnPoint[] = [];

      if (rooms.length === 0) {
        ctx.trace.warning(passId, "No rooms available");
        return { ...input, spawns: [] };
      }

      // Entrance: first room (typically top-left area)
      const entranceRoom = rooms[0]!;
      const entrancePosition = resolveSpawnPositionInRoom(input.grid, entranceRoom);
      spawns.push({
        position: entrancePosition,
        roomId: entranceRoom.id,
        type: "entrance",
        tags: ["spawn", "entrance"],
        weight: 1,
        distanceFromStart: 0,
      });

      // Exit: room furthest from entrance (Manhattan distance)
      let maxDist = 0;
      let exitRoom = entranceRoom;

      for (const room of rooms) {
        const dist =
          Math.abs(room.centerX - entranceRoom.centerX) +
          Math.abs(room.centerY - entranceRoom.centerY);
        if (dist > maxDist) {
          maxDist = dist;
          exitRoom = room;
        }
      }

      const exitPosition = resolveSpawnPositionInRoom(input.grid, exitRoom);
      spawns.push({
        position: exitPosition,
        roomId: exitRoom.id,
        type: "exit",
        tags: ["exit"],
        weight: 1,
        distanceFromStart: maxDist,
      });

      ctx.trace.decision(
        passId,
        "Placed entrance and exit",
        [],
        2,
        `Entrance at room ${entranceRoom.id}, Exit at room ${exitRoom.id} (distance: ${maxDist})`,
      );

      return { ...input, spawns };
    },
  };
}

