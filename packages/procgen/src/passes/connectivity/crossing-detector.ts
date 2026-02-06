/**
 * Corridor Crossing Detection
 *
 * Detects when corridors inadvertently cross, creating unintended connections
 * between rooms that aren't supposed to be directly connected.
 */

import type { Point } from "../../core/geometry/types";
import type { Connection } from "../../pipeline/types";

/**
 * Information about a corridor crossing
 */
export interface CorridorCrossing {
  /** First connection involved in the crossing */
  readonly connection1: Connection;
  /** Second connection involved in the crossing */
  readonly connection2: Connection;
  /** Point(s) where the corridors intersect */
  readonly intersectionPoints: readonly Point[];
  /** Rooms that become implicitly connected due to this crossing */
  readonly implicitConnections: ReadonlyArray<readonly [number, number]>;
}

/**
 * Result of corridor crossing analysis
 */
export interface CrossingAnalysis {
  /** All detected crossings */
  readonly crossings: readonly CorridorCrossing[];
  /** Total number of implicit connections created */
  readonly implicitConnectionCount: number;
  /** Whether the dungeon has any unintended shortcuts */
  readonly hasUnintendedShortcuts: boolean;
  /** The actual connectivity graph including crossings */
  readonly actualGraph: ReadonlyMap<number, ReadonlySet<number>>;
}

/**
 * Detect all corridor crossings in a dungeon
 *
 * @param connections - The dungeon's explicit connections
 * @returns Analysis of corridor crossings
 */
export function detectCorridorCrossings(
  connections: readonly Connection[],
): CrossingAnalysis {
  const crossings: CorridorCrossing[] = [];

  // Build path sets for fast intersection checking
  const pathSets = new Map<Connection, Set<string>>();
  for (const conn of connections) {
    const set = new Set<string>();
    for (const point of conn.path) {
      set.add(`${point.x},${point.y}`);
    }
    pathSets.set(conn, set);
  }

  // Check all pairs of connections for crossings
  for (let i = 0; i < connections.length; i++) {
    for (let j = i + 1; j < connections.length; j++) {
      const c1 = connections[i];
      const c2 = connections[j];
      if (!c1 || !c2) continue;

      // Skip if connections share a room (they're supposed to touch)
      if (connectionsShareRoom(c1, c2)) {
        continue;
      }

      // Find intersection points
      const pathSet = pathSets.get(c1);
      if (!pathSet) continue;
      const intersections = findPathIntersections(pathSet, c2.path);

      if (intersections.length > 0) {
        // Calculate implicit connections created by this crossing
        const implicit = calculateImplicitConnections(c1, c2);

        crossings.push({
          connection1: c1,
          connection2: c2,
          intersectionPoints: intersections,
          implicitConnections: implicit,
        });
      }
    }
  }

  // Build actual connectivity graph
  const actualGraph = buildActualConnectivityGraph(connections, crossings);

  // Count implicit connections
  const implicitConnectionCount = crossings.reduce(
    (sum, c) => sum + c.implicitConnections.length,
    0,
  );

  return {
    crossings,
    implicitConnectionCount,
    hasUnintendedShortcuts: crossings.length > 0,
    actualGraph,
  };
}

/**
 * Check if two connections share a room endpoint
 */
function connectionsShareRoom(c1: Connection, c2: Connection): boolean {
  return (
    c1.fromRoomId === c2.fromRoomId ||
    c1.fromRoomId === c2.toRoomId ||
    c1.toRoomId === c2.fromRoomId ||
    c1.toRoomId === c2.toRoomId
  );
}

/**
 * Find all intersection points between a path set and a path array
 */
function findPathIntersections(
  pathSet: Set<string>,
  path: readonly Point[],
): Point[] {
  const intersections: Point[] = [];

  for (const point of path) {
    const key = `${point.x},${point.y}`;
    if (pathSet.has(key)) {
      intersections.push({ x: point.x, y: point.y });
    }
  }

  return intersections;
}

/**
 * Calculate which rooms become implicitly connected due to a crossing
 */
function calculateImplicitConnections(
  c1: Connection,
  c2: Connection,
): ReadonlyArray<readonly [number, number]> {
  const rooms1 = [c1.fromRoomId, c1.toRoomId];
  const rooms2 = [c2.fromRoomId, c2.toRoomId];
  const implicit: Array<readonly [number, number]> = [];

  // Each room in c1 is now implicitly connected to each room in c2
  for (const r1 of rooms1) {
    for (const r2 of rooms2) {
      if (r1 !== r2) {
        // Normalize edge direction for deduplication
        const edge: readonly [number, number] = r1 < r2 ? [r1, r2] : [r2, r1];
        implicit.push(edge);
      }
    }
  }

  return implicit;
}

/**
 * Build the actual connectivity graph including implicit connections from crossings
 */
function buildActualConnectivityGraph(
  connections: readonly Connection[],
  crossings: readonly CorridorCrossing[],
): ReadonlyMap<number, ReadonlySet<number>> {
  const graph = new Map<number, Set<number>>();

  // Helper to ensure node exists
  const ensureNode = (id: number): Set<number> => {
    let neighbors = graph.get(id);
    if (!neighbors) {
      neighbors = new Set();
      graph.set(id, neighbors);
    }
    return neighbors;
  };

  // Add explicit connections
  for (const conn of connections) {
    ensureNode(conn.fromRoomId).add(conn.toRoomId);
    ensureNode(conn.toRoomId).add(conn.fromRoomId);
  }

  // Add implicit connections from crossings
  for (const crossing of crossings) {
    for (const [r1, r2] of crossing.implicitConnections) {
      ensureNode(r1).add(r2);
      ensureNode(r2).add(r1);
    }
  }

  // Convert to readonly
  const result = new Map<number, ReadonlySet<number>>();
  for (const [id, neighbors] of graph) {
    result.set(id, neighbors);
  }

  return result;
}

/**
 * Validate that crossings don't break intended game progression
 *
 * @param entranceRoomId - The entrance room ID
 * @param exitRoomId - The exit room ID
 * @param intendedGraph - The intended connectivity graph (MST)
 * @param actualGraph - The actual graph including crossings
 * @returns Whether the crossings create problematic shortcuts
 */
export function validateProgressionIntegrity(
  entranceRoomId: number,
  exitRoomId: number,
  intendedGraph: ReadonlyMap<number, ReadonlySet<number>>,
  actualGraph: ReadonlyMap<number, ReadonlySet<number>>,
): { valid: boolean; shortestPathReduction: number } {
  // Calculate shortest path in intended graph
  const intendedPath = bfsShortestPath(
    intendedGraph,
    entranceRoomId,
    exitRoomId,
  );

  // Calculate shortest path in actual graph (with crossings)
  const actualPath = bfsShortestPath(actualGraph, entranceRoomId, exitRoomId);

  const reduction = intendedPath - actualPath;

  return {
    valid: reduction <= 1, // Allow 1 step reduction as acceptable
    shortestPathReduction: reduction,
  };
}

/**
 * BFS to find shortest path length between two nodes.
 * Uses index-based iteration for O(1) dequeue.
 */
function bfsShortestPath(
  graph: ReadonlyMap<number, ReadonlySet<number>>,
  start: number,
  end: number,
): number {
  if (start === end) return 0;

  const visited = new Set<number>();
  const queue: Array<{ node: number; dist: number }> = [
    { node: start, dist: 0 },
  ];
  let queueHead = 0;

  // Guard against infinite loops
  const maxIterations = graph.size * graph.size;
  let iterations = 0;

  while (queueHead < queue.length && iterations++ < maxIterations) {
    const item = queue[queueHead++];
    if (!item) break;
    const { node, dist } = item;

    if (visited.has(node)) continue;
    visited.add(node);

    const neighbors = graph.get(node);
    if (!neighbors) continue;

    for (const neighbor of neighbors) {
      if (neighbor === end) {
        return dist + 1;
      }
      if (!visited.has(neighbor)) {
        queue.push({ node: neighbor, dist: dist + 1 });
      }
    }
  }

  return Infinity; // No path found
}
