/**
 * Graph Connectivity Algorithms
 *
 * Reusable graph algorithms for room connectivity.
 */

import { UnionFind } from "../../core/algorithms";
import { buildRoomAdjacency, calculateBFSDistances } from "../../core/graph";
import type { Connection, Room } from "../../pipeline/types";

/**
 * Edge in the room connectivity graph
 */
export interface RoomEdge {
  readonly from: number;
  readonly to: number;
  readonly weight: number;
}

/**
 * Build complete graph from room centers
 */
export function buildCompleteGraph(rooms: readonly Room[]): RoomEdge[] {
  const edges: RoomEdge[] = [];

  for (let i = 0; i < rooms.length; i++) {
    for (let j = i + 1; j < rooms.length; j++) {
      const a = rooms[i];
      const b = rooms[j];
      if (!a || !b) continue;

      const dist =
        Math.abs(a.centerX - b.centerX) + Math.abs(a.centerY - b.centerY);
      edges.push({ from: a.id, to: b.id, weight: dist });
    }
  }

  return edges;
}

/**
 * Build MST from edges using Kruskal's algorithm with Union-Find
 */
export function buildMST(
  nodeCount: number,
  edges: readonly RoomEdge[],
): [number, number][] {
  if (nodeCount <= 1 || edges.length === 0) return [];

  // Sort edges by weight with deterministic tie-breaking.
  const sortedEdges = [...edges].sort((a, b) => {
    if (a.weight !== b.weight) return a.weight - b.weight;
    if (a.from !== b.from) return a.from - b.from;
    return a.to - b.to;
  });

  // Create mapping from room IDs to sequential indices (0..nodeCount-1)
  const roomIds = new Set<number>();
  for (const edge of edges) {
    roomIds.add(edge.from);
    roomIds.add(edge.to);
  }

  const roomIdToIndex = new Map<number, number>();
  let index = 0;
  for (const roomId of roomIds) {
    roomIdToIndex.set(roomId, index);
    index++;
  }

  const roomCount = roomIdToIndex.size;

  // Union-Find with sequential indices
  const uf = new UnionFind(Math.max(nodeCount, roomCount));
  const targetMstSize = Math.max(0, roomCount - 1);

  // Build MST
  const mst: [number, number][] = [];

  for (const edge of sortedEdges) {
    const fromIndex = roomIdToIndex.get(edge.from);
    const toIndex = roomIdToIndex.get(edge.to);

    if (fromIndex !== undefined && toIndex !== undefined) {
      if (uf.union(fromIndex, toIndex)) {
        // Store original room IDs in the MST
        mst.push([edge.from, edge.to]);
        if (mst.length === targetMstSize) break;
      }
    }
  }

  return mst;
}

/**
 * Create a unique numeric key for an edge
 * Uses a large multiplier to combine two node IDs into a single number
 */
const edgeKey = (a: number, b: number) =>
  `${Math.min(a, b)}:${Math.max(a, b)}`;

/**
 * Add random extra edges to the MST for loops
 */
export function addExtraEdges(
  mstEdges: readonly [number, number][],
  allEdges: readonly RoomEdge[],
  extraRatio: number,
  rng: () => number,
): [number, number][] {
  const result: [number, number][] = [...mstEdges];
  const mstSet = new Set(mstEdges.map(([a, b]) => edgeKey(a, b)));

  // Sort by weight and add some extra edges.
  const nonMstEdges = allEdges.filter((e) => !mstSet.has(edgeKey(e.from, e.to)));
  nonMstEdges.sort((a, b) => {
    if (a.weight !== b.weight) return a.weight - b.weight;
    if (a.from !== b.from) return a.from - b.from;
    return a.to - b.to;
  });

  const extraCount = Math.floor(nonMstEdges.length * extraRatio);
  for (let i = 0; i < extraCount && i < nonMstEdges.length; i++) {
    const edge = nonMstEdges[i];
    if (!edge) continue;
    if (rng() < 0.5) {
      result.push([edge.from, edge.to]);
    }
  }

  return result;
}

/**
 * Calculate BFS distances from a starting node.
 * Uses index-based iteration for O(1) dequeue.
 */
export function bfsDistances(
  nodeCount: number,
  edges: readonly [number, number][],
  startNode: number,
): Map<number, number> {
  const adjacency = new Map<number, number[]>();

  for (let i = 0; i < nodeCount; i++) {
    adjacency.set(i, []);
  }

  for (const [from, to] of edges) {
    const fromNeighbors = adjacency.get(from);
    const toNeighbors = adjacency.get(to);

    if (fromNeighbors && !fromNeighbors.includes(to)) {
      fromNeighbors.push(to);
    }
    if (toNeighbors && !toNeighbors.includes(from)) {
      toNeighbors.push(from);
    }
  }

  const { distances } = calculateBFSDistances(
    startNode,
    (nodeId) => adjacency.get(nodeId) ?? [],
  );
  return distances;
}

// =============================================================================
// ROOM/CONNECTION HELPERS
// =============================================================================

/**
 * Build adjacency map from rooms and connections
 */
export function buildAdjacencyFromConnections(
  rooms: readonly Room[],
  connections: readonly Connection[],
): Map<number, number[]> {
  return buildRoomAdjacency(rooms, connections);
}

/**
 * Calculate distances from a starting room using BFS.
 * Works with Room/Connection types.
 * Uses index-based iteration for O(1) dequeue.
 */
export function calculateRoomDistances(
  rooms: readonly Room[],
  connections: readonly Connection[],
  startRoomId: number,
): Map<number, number> {
  const adjacency = buildAdjacencyFromConnections(rooms, connections);
  const { distances, maxDistance } = calculateBFSDistances(
    startRoomId,
    (roomId) => adjacency.get(roomId) ?? [],
  );

  // Set unreachable rooms to max distance + 1
  for (const room of rooms) {
    if (!distances.has(room.id)) {
      distances.set(room.id, maxDistance + 1);
    }
  }

  return distances;
}

/**
 * Calculate connection count for each room
 */
export function calculateConnectionCounts(
  rooms: readonly Room[],
  connections: readonly Connection[],
): Map<number, number> {
  const counts = new Map<number, number>();

  for (const room of rooms) {
    counts.set(room.id, 0);
  }

  for (const conn of connections) {
    counts.set(conn.fromRoomId, (counts.get(conn.fromRoomId) ?? 0) + 1);
    counts.set(conn.toRoomId, (counts.get(conn.toRoomId) ?? 0) + 1);
  }

  return counts;
}

/**
 * Room metadata for passes that need distance and connection info
 */
export interface RoomMetadata {
  readonly distance: number;
  readonly normalizedDistance: number;
  readonly connectionCount: number;
  readonly isDeadEnd: boolean;
  readonly isHub: boolean;
}

/**
 * Calculate metadata for all rooms (distances, connection counts, etc.)
 */
export function calculateRoomMetadata(
  rooms: readonly Room[],
  connections: readonly Connection[],
  entranceRoomId?: number,
): Map<number, RoomMetadata> {
  const metadata = new Map<number, RoomMetadata>();

  // Find entrance if not provided - use distanceFromEntrance=0 or first room
  const startId =
    entranceRoomId ??
    rooms.find((r) => r.distanceFromEntrance === 0)?.id ??
    rooms[0]?.id ??
    0;

  const distances = calculateRoomDistances(rooms, connections, startId);
  const connectionCounts = calculateConnectionCounts(rooms, connections);

  const maxDistance = Math.max(...Array.from(distances.values()), 1);

  for (const room of rooms) {
    const distance = distances.get(room.id) ?? 0;
    const connectionCount = connectionCounts.get(room.id) ?? 0;

    metadata.set(room.id, {
      distance,
      normalizedDistance: distance / maxDistance,
      connectionCount,
      isDeadEnd: connectionCount === 1,
      isHub: connectionCount >= 3,
    });
  }

  return metadata;
}
