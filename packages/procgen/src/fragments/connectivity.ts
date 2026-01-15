/**
 * Connectivity Algorithms Fragment
 *
 * Standalone graph connectivity algorithms for dungeon generation.
 */

import type { Point } from "../core/geometry/types";

/**
 * Weighted edge between two nodes
 */
export interface Edge {
  readonly from: number;
  readonly to: number;
  readonly weight: number;
}

/**
 * Simple RNG interface
 */
interface RNG {
  next(): number;
}

/**
 * Build a complete graph from a set of points
 *
 * Every point is connected to every other point with weight = distance.
 */
export function buildCompleteGraph(points: readonly Point[]): Edge[] {
  const edges: Edge[] = [];

  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const p1 = points[i];
      const p2 = points[j];
      if (!p1 || !p2) continue;
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      edges.push({ from: i, to: j, weight: dist });
    }
  }

  return edges;
}

/**
 * Build a minimum spanning tree using Kruskal's algorithm
 *
 * @param nodeCount - Number of nodes in the graph
 * @param edges - All edges with weights
 * @returns Edges that form the MST
 */
export function buildMST(nodeCount: number, edges: readonly Edge[]): Edge[] {
  // Sort edges by weight
  const sortedEdges = [...edges].sort((a, b) => a.weight - b.weight);

  // Union-Find data structure
  const parent: number[] = Array.from({ length: nodeCount }, (_, i) => i);
  const rank: number[] = Array.from({ length: nodeCount }, () => 0);

  function find(x: number): number {
    const p = parent[x];
    if (p === undefined) return x;
    if (p !== x) {
      parent[x] = find(p);
    }
    return parent[x] ?? x;
  }

  function union(x: number, y: number): boolean {
    const px = find(x);
    const py = find(y);

    if (px === py) return false;

    const rankPx = rank[px] ?? 0;
    const rankPy = rank[py] ?? 0;

    if (rankPx < rankPy) {
      parent[px] = py;
    } else if (rankPx > rankPy) {
      parent[py] = px;
    } else {
      parent[py] = px;
      rank[px] = rankPx + 1;
    }

    return true;
  }

  const mst: Edge[] = [];

  for (const edge of sortedEdges) {
    if (union(edge.from, edge.to)) {
      mst.push(edge);
      if (mst.length === nodeCount - 1) break;
    }
  }

  return mst;
}

/**
 * Add extra edges to an MST for loops/cycles
 *
 * @param mst - Existing MST edges
 * @param allEdges - All possible edges
 * @param extraEdgeRatio - Fraction of remaining edges to add (0-1)
 * @param rng - Random number generator
 * @returns Combined edges (MST + extras)
 */
export function addExtraEdges(
  mst: readonly Edge[],
  allEdges: readonly Edge[],
  extraEdgeRatio: number,
  rng: RNG,
): Edge[] {
  const mstSet = new Set(
    mst.map((e) => `${Math.min(e.from, e.to)},${Math.max(e.from, e.to)}`),
  );

  const nonMstEdges = allEdges.filter((e) => {
    const key = `${Math.min(e.from, e.to)},${Math.max(e.from, e.to)}`;
    return !mstSet.has(key);
  });

  // Sort by weight (prefer shorter edges)
  const sorted = [...nonMstEdges].sort((a, b) => a.weight - b.weight);

  // Select some extra edges
  const extraCount = Math.floor(sorted.length * extraEdgeRatio);
  const extras: Edge[] = [];

  for (let i = 0; i < sorted.length && extras.length < extraCount; i++) {
    const edge = sorted[i];
    if (edge && rng.next() < 0.5) {
      extras.push(edge);
    }
  }

  return [...mst, ...extras];
}

/**
 * Build relative neighborhood graph (RNG)
 *
 * An edge exists between points A and B if there is no point C
 * closer to both A and B than A and B are to each other.
 */
export function buildRelativeNeighborhoodGraph(
  points: readonly Point[],
): Edge[] {
  const edges: Edge[] = [];

  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const p1 = points[i];
      const p2 = points[j];
      if (!p1 || !p2) continue;
      const dist12 = distance(p1, p2);

      let isNeighbor = true;

      for (let k = 0; k < points.length; k++) {
        if (k === i || k === j) continue;

        const pk = points[k];
        if (!pk) continue;
        const dist1k = distance(p1, pk);
        const dist2k = distance(p2, pk);

        // If pk is closer to both p1 and p2 than they are to each other
        if (dist1k < dist12 && dist2k < dist12) {
          isNeighbor = false;
          break;
        }
      }

      if (isNeighbor) {
        edges.push({ from: i, to: j, weight: dist12 });
      }
    }
  }

  return edges;
}

/**
 * Build Gabriel graph
 *
 * An edge exists between points A and B if no other point lies
 * within the circle with diameter AB.
 */
export function buildGabrielGraph(points: readonly Point[]): Edge[] {
  const edges: Edge[] = [];

  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const p1 = points[i];
      const p2 = points[j];
      if (!p1 || !p2) continue;

      // Center of the circle
      const cx = (p1.x + p2.x) / 2;
      const cy = (p1.y + p2.y) / 2;

      // Radius is half the distance
      const radius = distance(p1, p2) / 2;

      let isValid = true;

      for (let k = 0; k < points.length; k++) {
        if (k === i || k === j) continue;

        const pk = points[k];
        if (!pk) continue;
        const distToCenter = distance(pk, { x: cx, y: cy });

        if (distToCenter < radius - 0.001) {
          // epsilon for floating point
          isValid = false;
          break;
        }
      }

      if (isValid) {
        edges.push({ from: i, to: j, weight: distance(p1, p2) });
      }
    }
  }

  return edges;
}

/**
 * Find shortest path using BFS (unweighted graph)
 */
export function findShortestPath(
  adjacency: Map<number, readonly number[]>,
  start: number,
  end: number,
): number[] | null {
  if (start === end) return [start];

  const visited = new Set<number>();
  const parent = new Map<number, number>();
  const queue: number[] = [start];
  visited.add(start);

  while (queue.length > 0) {
    const current = queue.shift();
    if (current === undefined) break;

    for (const neighbor of adjacency.get(current) ?? []) {
      if (visited.has(neighbor)) continue;

      visited.add(neighbor);
      parent.set(neighbor, current);

      if (neighbor === end) {
        // Reconstruct path
        const path: number[] = [end];
        let node = end;
        while (parent.has(node)) {
          const nextNode = parent.get(node);
          if (nextNode === undefined) break;
          node = nextNode;
          path.unshift(node);
        }
        return path;
      }

      queue.push(neighbor);
    }
  }

  return null;
}

/**
 * Calculate graph diameter (longest shortest path)
 */
export function calculateGraphDiameter(
  nodeCount: number,
  edges: readonly Edge[],
): number {
  // Build adjacency list
  const adjacency = new Map<number, number[]>();
  for (let i = 0; i < nodeCount; i++) {
    adjacency.set(i, []);
  }
  for (const edge of edges) {
    adjacency.get(edge.from)?.push(edge.to);
    adjacency.get(edge.to)?.push(edge.from);
  }

  let maxDistance = 0;

  // BFS from each node
  for (let start = 0; start < nodeCount; start++) {
    const distances = new Map<number, number>();
    const queue: number[] = [start];
    distances.set(start, 0);

    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) break;
      const currentDist = distances.get(current) ?? 0;

      for (const neighbor of adjacency.get(current) ?? []) {
        if (!distances.has(neighbor)) {
          distances.set(neighbor, currentDist + 1);
          queue.push(neighbor);
          maxDistance = Math.max(maxDistance, currentDist + 1);
        }
      }
    }
  }

  return maxDistance;
}

/**
 * Find all connected components
 */
export function findConnectedComponents(
  nodeCount: number,
  edges: readonly Edge[],
): number[][] {
  // Build adjacency list
  const adjacency = new Map<number, number[]>();
  for (let i = 0; i < nodeCount; i++) {
    adjacency.set(i, []);
  }
  for (const edge of edges) {
    adjacency.get(edge.from)?.push(edge.to);
    adjacency.get(edge.to)?.push(edge.from);
  }

  const visited = new Set<number>();
  const components: number[][] = [];

  for (let start = 0; start < nodeCount; start++) {
    if (visited.has(start)) continue;

    const component: number[] = [];
    const queue: number[] = [start];
    visited.add(start);

    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) break;
      component.push(current);

      for (const neighbor of adjacency.get(current) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }

    components.push(component);
  }

  return components;
}

/**
 * Helper: Euclidean distance between two points
 */
function distance(a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}
