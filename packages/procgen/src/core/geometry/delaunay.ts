/**
 * Delaunay Triangulation Implementation
 *
 * Uses Bowyer-Watson incremental algorithm for O(n log n) triangulation.
 * Produces approximately 3n edges instead of n(n-1)/2 for complete graph.
 */

import { UnionFind } from "../algorithms";
import type { Point } from "./types";

/**
 * Triangle represented by three point indices
 */
export interface Triangle {
  readonly p1: number;
  readonly p2: number;
  readonly p3: number;
}

/**
 * Edge represented by two point indices
 */
export interface Edge {
  readonly from: number;
  readonly to: number;
}

/**
 * Circumcircle of a triangle
 */
interface Circumcircle {
  x: number;
  y: number;
  radiusSq: number;
}

/**
 * Compute circumcircle of a triangle defined by three points
 */
function getCircumcircle(p1: Point, p2: Point, p3: Point): Circumcircle | null {
  const ax = p2.x - p1.x;
  const ay = p2.y - p1.y;
  const bx = p3.x - p1.x;
  const by = p3.y - p1.y;

  const d = 2 * (ax * by - ay * bx);
  if (Math.abs(d) < 1e-10) {
    return null; // Collinear points
  }

  const aSq = ax * ax + ay * ay;
  const bSq = bx * bx + by * by;

  const ux = (by * aSq - ay * bSq) / d;
  const uy = (ax * bSq - bx * aSq) / d;

  return {
    x: p1.x + ux,
    y: p1.y + uy,
    radiusSq: ux * ux + uy * uy,
  };
}

/**
 * Check if a point is inside a circumcircle
 */
function isPointInCircumcircle(point: Point, circle: Circumcircle): boolean {
  const dx = point.x - circle.x;
  const dy = point.y - circle.y;
  return dx * dx + dy * dy < circle.radiusSq;
}

/**
 * Create super-triangle that contains all points
 */
function createSuperTriangle(points: readonly Point[]): [Point, Point, Point] {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  const dx = maxX - minX;
  const dy = maxY - minY;
  const dmax = Math.max(dx, dy) * 2;

  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  return [
    { x: midX - dmax * 2, y: midY - dmax },
    { x: midX, y: midY + dmax * 2 },
    { x: midX + dmax * 2, y: midY - dmax },
  ];
}

/**
 * Compute Delaunay triangulation using Bowyer-Watson algorithm
 *
 * @param points Array of points to triangulate
 * @returns Array of edges forming the triangulation
 */
// Maximum points for edge encoding (allows for efficient numeric keys)
const MAX_POINTS = 65536;

/**
 * Encode an edge as a single numeric key for efficient Set/Map operations
 */
function encodeEdge(p1: number, p2: number): number {
  return p1 < p2 ? p1 * MAX_POINTS + p2 : p2 * MAX_POINTS + p1;
}

/**
 * Decode a numeric edge key back to point indices
 */
function decodeEdge(key: number): [number, number] {
  return [Math.floor(key / MAX_POINTS), key % MAX_POINTS];
}

export function delaunayTriangulation(points: readonly Point[]): Edge[] {
  if (points.length < 2) {
    return [];
  }

  if (points.length > MAX_POINTS) {
    throw new RangeError(
      `delaunayTriangulation supports up to ${MAX_POINTS} points (received ${points.length})`,
    );
  }

  if (points.length === 2) {
    return [{ from: 0, to: 1 }];
  }

  // Create super-triangle
  const superTriangle = createSuperTriangle(points);
  const allPoints: Point[] = [...points, ...superTriangle];
  const superIdx1 = points.length;
  const superIdx2 = points.length + 1;
  const superIdx3 = points.length + 2;

  // Initial triangulation with super-triangle
  interface TriangleWithCircle {
    p1: number;
    p2: number;
    p3: number;
    circle: Circumcircle;
  }

  const initialCircle = getCircumcircle(
    superTriangle[0],
    superTriangle[1],
    superTriangle[2],
  );
  if (!initialCircle) {
    // Fallback to simple edge set if super-triangle is degenerate
    return points.map((_, i) => ({ from: i, to: (i + 1) % points.length }));
  }

  const triangles: TriangleWithCircle[] = [
    {
      p1: superIdx1,
      p2: superIdx2,
      p3: superIdx3,
      circle: initialCircle,
    },
  ];

  // Add each point incrementally
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    if (!point) continue;

    // Find all triangles whose circumcircle contains the point
    const badTriangles: TriangleWithCircle[] = [];
    const goodTriangles: TriangleWithCircle[] = [];

    for (const tri of triangles) {
      if (isPointInCircumcircle(point, tri.circle)) {
        badTriangles.push(tri);
      } else {
        goodTriangles.push(tri);
      }
    }

    // Find the polygon hole boundary
    // Count edge occurrences to find boundary edges in O(k) instead of O(k²)
    const edgeCounts = new Map<number, number>();

    // Count how many times each edge appears across all bad triangles
    for (const tri of badTriangles) {
      const triEdges: [number, number][] = [
        [tri.p1, tri.p2],
        [tri.p2, tri.p3],
        [tri.p3, tri.p1],
      ];
      for (const [a, b] of triEdges) {
        const key = encodeEdge(a, b);
        edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
      }
    }

    // Boundary edges appear exactly once (not shared)
    const polygon: [number, number][] = [];
    for (const [key, count] of edgeCounts) {
      if (count === 1) {
        const [a, b] = decodeEdge(key);
        polygon.push([a, b]);
      }
    }

    // Create new triangles from point to polygon edges
    for (const edge of polygon) {
      const p1 = allPoints[edge[0]];
      const p2 = allPoints[edge[1]];
      const p3 = point;
      if (!p1 || !p2) continue;

      const circle = getCircumcircle(p1, p2, p3);
      if (circle) {
        goodTriangles.push({
          p1: edge[0],
          p2: edge[1],
          p3: i,
          circle,
        });
      }
    }

    triangles.length = 0;
    triangles.push(...goodTriangles);
  }

  // Extract edges from final triangulation, excluding super-triangle vertices
  const edgeSet = new Set<number>();
  const edges: Edge[] = [];

  for (const tri of triangles) {
    // Skip triangles connected to super-triangle
    if (
      tri.p1 >= points.length ||
      tri.p2 >= points.length ||
      tri.p3 >= points.length
    ) {
      continue;
    }

    const triEdges: [number, number][] = [
      [tri.p1, tri.p2],
      [tri.p2, tri.p3],
      [tri.p3, tri.p1],
    ];

    for (const [from, to] of triEdges) {
      // Normalize edge direction for deduplication
      const key = encodeEdge(from, to);
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        edges.push({ from, to });
      }
    }
  }

  return edges;
}

/**
 * Build MST from Delaunay edges using Kruskal's algorithm
 *
 * @param points Array of room centers
 * @param edges Delaunay edges (or any edge set)
 * @returns MST edges as [fromId, toId] tuples
 */
export function buildMSTFromEdges(
  points: readonly Point[],
  edges: readonly Edge[],
): [number, number][] {
  if (points.length <= 1) return [];
  if (edges.length === 0) return [];

  // Calculate weights for all edges
  const weightedEdges = edges.map((e) => {
    const p1 = points[e.from];
    const p2 = points[e.to];
    if (!p1 || !p2) return { ...e, weight: Infinity };
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    return { ...e, weight: Math.sqrt(dx * dx + dy * dy) };
  });

  // Sort by weight
  weightedEdges.sort((a, b) => a.weight - b.weight);

  // Union-Find
  const uf = new UnionFind(points.length);

  // Build MST
  const mst: [number, number][] = [];

  for (const edge of weightedEdges) {
    if (uf.union(edge.from, edge.to)) {
      mst.push([edge.from, edge.to]);
      if (mst.length === points.length - 1) break;
    }
  }

  return mst;
}
