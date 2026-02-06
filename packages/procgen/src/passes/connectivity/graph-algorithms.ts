/**
 * Graph Connectivity Algorithms
 *
 * Reusable graph algorithms for room connectivity.
 */

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

  // Sort edges by weight
  const sortedEdges = [...edges].sort((a, b) => a.weight - b.weight);

  // Union-Find
  const parent = new Map<number, number>();
  const rank = new Map<number, number>();

  for (let i = 0; i < nodeCount; i++) {
    parent.set(i, i);
    rank.set(i, 0);
  }

  function find(x: number): number {
    const px = parent.get(x);
    if (px === undefined) return x;
    if (px !== x) {
      const root = find(px);
      parent.set(x, root);
      return root;
    }
    return px;
  }

  function union(x: number, y: number): boolean {
    const px = find(x);
    const py = find(y);
    if (px === py) return false;

    const rx = rank.get(px) ?? 0;
    const ry = rank.get(py) ?? 0;

    if (rx < ry) {
      parent.set(px, py);
    } else if (rx > ry) {
      parent.set(py, px);
    } else {
      parent.set(py, px);
      rank.set(px, rx + 1);
    }
    return true;
  }

  // Build MST
  const mst: [number, number][] = [];

  for (const edge of sortedEdges) {
    if (union(edge.from, edge.to)) {
      mst.push([edge.from, edge.to]);
      if (mst.length === nodeCount - 1) break;
    }
  }

  return mst;
}

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
  const mstSet = new Set(
    mstEdges.map(([a, b]) => `${Math.min(a, b)},${Math.max(a, b)}`),
  );

  // Filter edges not in MST
  const nonMstEdges = allEdges.filter((e) => {
    const key = `${Math.min(e.from, e.to)},${Math.max(e.from, e.to)}`;
    return !mstSet.has(key);
  });

  // Sort by weight and add some extra edges
  nonMstEdges.sort((a, b) => a.weight - b.weight);

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
  const adjacency = new Map<number, Set<number>>();

  for (let i = 0; i < nodeCount; i++) {
    adjacency.set(i, new Set());
  }

  for (const [from, to] of edges) {
    adjacency.get(from)?.add(to);
    adjacency.get(to)?.add(from);
  }

  const distances = new Map<number, number>();
  const queue: number[] = [startNode];
  let queueHead = 0;
  distances.set(startNode, 0);

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
  const adjacency = new Map<number, number[]>();

  for (const room of rooms) {
    adjacency.set(room.id, []);
  }

  for (const conn of connections) {
    adjacency.get(conn.fromRoomId)?.push(conn.toRoomId);
    adjacency.get(conn.toRoomId)?.push(conn.fromRoomId);
  }

  return adjacency;
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
  const distances = new Map<number, number>();

  const queue: Array<{ id: number; dist: number }> = [
    { id: startRoomId, dist: 0 },
  ];
  let queueHead = 0;
  distances.set(startRoomId, 0);

  while (queueHead < queue.length) {
    const current = queue[queueHead++];
    if (!current) break;

    const neighbors = adjacency.get(current.id) ?? [];
    for (const neighborId of neighbors) {
      if (!distances.has(neighborId)) {
        const newDist = current.dist + 1;
        distances.set(neighborId, newDist);
        queue.push({ id: neighborId, dist: newDist });
      }
    }
  }

  // Set unreachable rooms to max distance + 1
  const maxDist = Math.max(...Array.from(distances.values()), 0);
  for (const room of rooms) {
    if (!distances.has(room.id)) {
      distances.set(room.id, maxDist + 1);
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

  // Find entrance if not provided
  const startId =
    entranceRoomId ?? rooms.find((r) => r.type === "entrance")?.id ?? 0;

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
