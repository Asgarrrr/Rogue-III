/**
 * Generation Metrics Collector
 *
 * Collects and analyzes statistics about generated dungeons.
 */

import { CellType } from "../core/grid";
import type { DungeonArtifact } from "../pipeline/types";

/**
 * Spatial metrics about dungeon layout
 */
export interface SpatialMetrics {
  /** Total number of rooms */
  readonly roomCount: number;
  /** Room size distribution */
  readonly roomSizes: {
    readonly min: number;
    readonly max: number;
    readonly avg: number;
    readonly stdDev: number;
  };
  /** Total number of connections/corridors */
  readonly connectionCount: number;
  /** Corridor length distribution */
  readonly corridorLengths: {
    readonly min: number;
    readonly max: number;
    readonly avg: number;
    readonly total: number;
  };
  /** Floor/wall ratio */
  readonly floorRatio: number;
  /** Total floor tiles */
  readonly floorTileCount: number;
  /** Total wall tiles */
  readonly wallTileCount: number;
}

/**
 * Connectivity metrics about room graph
 */
export interface ConnectivityMetrics {
  /** Graph density (edges / max possible edges) */
  readonly graphDensity: number;
  /** Average path length between rooms */
  readonly averagePathLength: number;
  /** Longest shortest path (graph diameter) */
  readonly diameter: number;
  /** Number of dead-end rooms (degree 1) */
  readonly deadEndCount: number;
  /** Number of hub rooms (degree >= 3) */
  readonly hubCount: number;
  /** Whether all rooms are connected */
  readonly isFullyConnected: boolean;
}

/**
 * Content distribution metrics
 */
export interface ContentMetrics {
  /** Total spawn count */
  readonly totalSpawns: number;
  /** Spawns by type */
  readonly spawnsByType: Readonly<Record<string, number>>;
  /** Rooms by type */
  readonly roomsByType: Readonly<Record<string, number>>;
  /** Average spawns per room */
  readonly avgSpawnsPerRoom: number;
}

/**
 * Complete generation metrics
 */
export interface GenerationMetrics {
  /** Dungeon dimensions */
  readonly width: number;
  readonly height: number;
  /** Spatial layout metrics */
  readonly spatial: SpatialMetrics;
  /** Connectivity metrics */
  readonly connectivity: ConnectivityMetrics;
  /** Content distribution metrics */
  readonly content: ContentMetrics;
  /** Generation metadata */
  readonly meta: {
    readonly checksum: string;
    readonly seed: string;
  };
}

/**
 * Collect comprehensive metrics from a dungeon artifact
 */
export function collectMetrics(artifact: DungeonArtifact): GenerationMetrics {
  return {
    width: artifact.width,
    height: artifact.height,
    spatial: collectSpatialMetrics(artifact),
    connectivity: collectConnectivityMetrics(artifact),
    content: collectContentMetrics(artifact),
    meta: {
      checksum: artifact.checksum,
      seed: String(artifact.seed.primary),
    },
  };
}

/**
 * Collect spatial layout metrics
 */
function collectSpatialMetrics(artifact: DungeonArtifact): SpatialMetrics {
  // Room sizes
  const roomAreas = artifact.rooms.map((r) => r.width * r.height);
  const roomSizeStats = calculateStats(roomAreas);

  // Corridor lengths
  const corridorLengths = artifact.connections.map((c) => c.path.length);
  const corridorStats = calculateStats(corridorLengths);

  // Floor/wall counts
  let floorCount = 0;
  let wallCount = 0;
  for (let i = 0; i < artifact.terrain.length; i++) {
    if (artifact.terrain[i] === CellType.FLOOR) {
      floorCount++;
    } else {
      wallCount++;
    }
  }

  const total = artifact.width * artifact.height;

  return {
    roomCount: artifact.rooms.length,
    roomSizes: {
      min: roomSizeStats.min,
      max: roomSizeStats.max,
      avg: roomSizeStats.avg,
      stdDev: roomSizeStats.stdDev,
    },
    connectionCount: artifact.connections.length,
    corridorLengths: {
      min: corridorStats.min,
      max: corridorStats.max,
      avg: corridorStats.avg,
      total: corridorStats.sum,
    },
    floorRatio: floorCount / total,
    floorTileCount: floorCount,
    wallTileCount: wallCount,
  };
}

/**
 * Collect connectivity metrics
 */
function collectConnectivityMetrics(
  artifact: DungeonArtifact,
): ConnectivityMetrics {
  const { rooms, connections } = artifact;

  if (rooms.length === 0) {
    return {
      graphDensity: 0,
      averagePathLength: 0,
      diameter: 0,
      deadEndCount: 0,
      hubCount: 0,
      isFullyConnected: true,
    };
  }

  // Build adjacency list
  const adjacency = new Map<number, Set<number>>();
  for (const room of rooms) {
    adjacency.set(room.id, new Set());
  }

  for (const conn of connections) {
    adjacency.get(conn.fromRoomId)?.add(conn.toRoomId);
    adjacency.get(conn.toRoomId)?.add(conn.fromRoomId);
  }

  // Calculate degree distribution
  const degrees = rooms.map((r) => adjacency.get(r.id)?.size ?? 0);
  const deadEndCount = degrees.filter((d) => d === 1).length;
  const hubCount = degrees.filter((d) => d >= 3).length;

  // Graph density
  const maxEdges = (rooms.length * (rooms.length - 1)) / 2;
  const graphDensity = maxEdges > 0 ? connections.length / maxEdges : 0;

  // Calculate shortest paths (BFS from each room)
  const distances: number[] = [];
  let maxDistance = 0;

  for (const startRoom of rooms) {
    const visited = new Map<number, number>();
    const queue: Array<{ id: number; dist: number }> = [
      { id: startRoom.id, dist: 0 },
    ];
    visited.set(startRoom.id, 0);

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) break;

      for (const neighbor of adjacency.get(current.id) ?? []) {
        if (!visited.has(neighbor)) {
          const newDist = current.dist + 1;
          visited.set(neighbor, newDist);
          distances.push(newDist);
          maxDistance = Math.max(maxDistance, newDist);
          queue.push({ id: neighbor, dist: newDist });
        }
      }
    }
  }

  const avgPathLength =
    distances.length > 0
      ? distances.reduce((a, b) => a + b, 0) / distances.length
      : 0;

  // Check connectivity
  const firstRoomId = rooms[0]?.id;
  const reachable = new Set<number>();
  if (firstRoomId !== undefined) {
    const queue = [firstRoomId];
    reachable.add(firstRoomId);

    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) break;
      for (const neighbor of adjacency.get(current) ?? []) {
        if (!reachable.has(neighbor)) {
          reachable.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
  }

  const isFullyConnected = reachable.size === rooms.length;

  return {
    graphDensity,
    averagePathLength: avgPathLength,
    diameter: maxDistance,
    deadEndCount,
    hubCount,
    isFullyConnected,
  };
}

/**
 * Collect content distribution metrics
 */
function collectContentMetrics(artifact: DungeonArtifact): ContentMetrics {
  const spawnsByType: Record<string, number> = {};
  for (const spawn of artifact.spawns) {
    spawnsByType[spawn.type] = (spawnsByType[spawn.type] ?? 0) + 1;
  }

  const roomsByType: Record<string, number> = {};
  for (const room of artifact.rooms) {
    roomsByType[room.type] = (roomsByType[room.type] ?? 0) + 1;
  }

  const avgSpawnsPerRoom =
    artifact.rooms.length > 0
      ? artifact.spawns.length / artifact.rooms.length
      : 0;

  return {
    totalSpawns: artifact.spawns.length,
    spawnsByType,
    roomsByType,
    avgSpawnsPerRoom,
  };
}

/**
 * Calculate basic statistics for an array of numbers
 */
function calculateStats(values: readonly number[]): {
  min: number;
  max: number;
  avg: number;
  stdDev: number;
  sum: number;
} {
  if (values.length === 0) {
    return { min: 0, max: 0, avg: 0, stdDev: 0, sum: 0 };
  }

  let min = Infinity;
  let max = -Infinity;
  let sum = 0;

  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
    sum += v;
  }

  const avg = sum / values.length;

  let variance = 0;
  for (const v of values) {
    variance += (v - avg) ** 2;
  }
  variance /= values.length;

  return {
    min,
    max,
    avg,
    stdDev: Math.sqrt(variance),
    sum,
  };
}

/**
 * Format metrics as a human-readable string
 */
export function formatMetrics(metrics: GenerationMetrics): string {
  const lines: string[] = [];

  lines.push(`=== Dungeon Metrics ===`);
  lines.push(`Dimensions: ${metrics.width}x${metrics.height}`);
  lines.push(`Checksum: ${metrics.meta.checksum}`);
  lines.push(``);

  lines.push(`--- Spatial ---`);
  lines.push(`Rooms: ${metrics.spatial.roomCount}`);
  lines.push(
    `Room sizes: min=${metrics.spatial.roomSizes.min}, max=${metrics.spatial.roomSizes.max}, avg=${metrics.spatial.roomSizes.avg.toFixed(1)}`,
  );
  lines.push(`Connections: ${metrics.spatial.connectionCount}`);
  lines.push(
    `Corridor lengths: min=${metrics.spatial.corridorLengths.min}, max=${metrics.spatial.corridorLengths.max}, total=${metrics.spatial.corridorLengths.total}`,
  );
  lines.push(`Floor ratio: ${(metrics.spatial.floorRatio * 100).toFixed(1)}%`);
  lines.push(``);

  lines.push(`--- Connectivity ---`);
  lines.push(
    `Graph density: ${(metrics.connectivity.graphDensity * 100).toFixed(1)}%`,
  );
  lines.push(
    `Avg path length: ${metrics.connectivity.averagePathLength.toFixed(2)}`,
  );
  lines.push(`Diameter: ${metrics.connectivity.diameter}`);
  lines.push(`Dead ends: ${metrics.connectivity.deadEndCount}`);
  lines.push(`Hubs: ${metrics.connectivity.hubCount}`);
  lines.push(
    `Fully connected: ${metrics.connectivity.isFullyConnected ? "yes" : "no"}`,
  );
  lines.push(``);

  lines.push(`--- Content ---`);
  lines.push(`Total spawns: ${metrics.content.totalSpawns}`);
  lines.push(`Spawns by type: ${JSON.stringify(metrics.content.spawnsByType)}`);
  lines.push(`Rooms by type: ${JSON.stringify(metrics.content.roomsByType)}`);
  lines.push(`Avg spawns/room: ${metrics.content.avgSpawnsPerRoom.toFixed(2)}`);

  return lines.join("\n");
}

/**
 * Compare two metrics and return differences
 */
export function compareMetrics(
  a: GenerationMetrics,
  b: GenerationMetrics,
): Record<string, { a: number; b: number; diff: number }> {
  const result: Record<string, { a: number; b: number; diff: number }> = {};

  const compareValue = (path: string, va: number, vb: number) => {
    if (va !== vb) {
      result[path] = { a: va, b: vb, diff: vb - va };
    }
  };

  compareValue("spatial.roomCount", a.spatial.roomCount, b.spatial.roomCount);
  compareValue(
    "spatial.connectionCount",
    a.spatial.connectionCount,
    b.spatial.connectionCount,
  );
  compareValue(
    "spatial.floorRatio",
    a.spatial.floorRatio,
    b.spatial.floorRatio,
  );

  compareValue(
    "connectivity.graphDensity",
    a.connectivity.graphDensity,
    b.connectivity.graphDensity,
  );
  compareValue(
    "connectivity.diameter",
    a.connectivity.diameter,
    b.connectivity.diameter,
  );
  compareValue(
    "connectivity.deadEndCount",
    a.connectivity.deadEndCount,
    b.connectivity.deadEndCount,
  );

  compareValue(
    "content.totalSpawns",
    a.content.totalSpawns,
    b.content.totalSpawns,
  );

  return result;
}
