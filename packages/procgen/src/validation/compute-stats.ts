import { CellType } from "../core/grid";
import type { DungeonArtifact } from "../pipeline/types";

/**
 * Generation statistics for analyzing dungeons
 */
export interface GenerationStats {
  readonly roomCount: number;
  readonly avgRoomSize: number;
  readonly minRoomSize: number;
  readonly maxRoomSize: number;
  readonly totalFloorTiles: number;
  readonly totalWallTiles: number;
  readonly floorRatio: number;
  readonly connectionCount: number;
  readonly avgCorridorLength: number;
  readonly spawnCounts: Record<string, number>;
  readonly roomTypeCounts: Record<string, number>;
  readonly dungeonDensity: number;
}

/**
 * Compute statistics for a generated dungeon
 */
export function computeStats(dungeon: DungeonArtifact): GenerationStats {
  const rooms = dungeon.rooms;
  const connections = dungeon.connections;
  const terrain = dungeon.terrain;
  const totalTiles = dungeon.width * dungeon.height;

  // Count floor/wall tiles
  let floorCount = 0;
  let wallCount = 0;
  for (let i = 0; i < terrain.length; i++) {
    if (terrain[i] === CellType.FLOOR) {
      floorCount++;
    } else {
      wallCount++;
    }
  }

  // Room size statistics
  let totalRoomArea = 0;
  let minRoomSize = Number.POSITIVE_INFINITY;
  let maxRoomSize = 0;
  for (const room of rooms) {
    const size = room.width * room.height;
    totalRoomArea += size;
    if (size < minRoomSize) minRoomSize = size;
    if (size > maxRoomSize) maxRoomSize = size;
  }
  if (rooms.length === 0) {
    minRoomSize = 0;
  }
  const avgRoomSize = rooms.length > 0 ? totalRoomArea / rooms.length : 0;

  // Corridor lengths (approximate from connection paths)
  let totalCorridorLength = 0;
  for (const conn of connections) {
    totalCorridorLength += conn.pathLength ?? conn.path?.length ?? 0;
  }
  const avgCorridorLength =
    connections.length > 0 ? totalCorridorLength / connections.length : 0;

  // Spawn counts by type
  const spawnCounts: Record<string, number> = {};
  for (const spawn of dungeon.spawns) {
    spawnCounts[spawn.type] = (spawnCounts[spawn.type] ?? 0) + 1;
  }

  // Room type counts
  const roomTypeCounts: Record<string, number> = {};
  for (const room of rooms) {
    roomTypeCounts[room.type] = (roomTypeCounts[room.type] ?? 0) + 1;
  }

  const floorRatio = totalTiles > 0 ? floorCount / totalTiles : 0;

  return {
    roomCount: rooms.length,
    avgRoomSize,
    minRoomSize,
    maxRoomSize,
    totalFloorTiles: floorCount,
    totalWallTiles: wallCount,
    floorRatio,
    connectionCount: connections.length,
    avgCorridorLength,
    spawnCounts,
    roomTypeCounts,
    dungeonDensity: floorRatio,
  };
}
