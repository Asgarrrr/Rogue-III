/**
 * Delaunay Triangulation Implementation
 *
 * Uses Bowyer-Watson incremental algorithm for O(n log n) triangulation.
 * Produces approximately 3n edges instead of n(n-1)/2 for complete graph.
 */

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
export function delaunayTriangulation(points: readonly Point[]): Edge[] {
  if (points.length < 2) {
    return [];
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
    const polygon: [number, number][] = [];

    for (const tri of badTriangles) {
      const edges: [number, number][] = [
        [tri.p1, tri.p2],
        [tri.p2, tri.p3],
        [tri.p3, tri.p1],
      ];

      for (const edge of edges) {
        // Check if this edge is shared with another bad triangle
        let isShared = false;
        for (const other of badTriangles) {
          if (other === tri) continue;
          const otherEdges: [number, number][] = [
            [other.p1, other.p2],
            [other.p2, other.p3],
            [other.p3, other.p1],
          ];
          for (const otherEdge of otherEdges) {
            if (
              (edge[0] === otherEdge[0] && edge[1] === otherEdge[1]) ||
              (edge[0] === otherEdge[1] && edge[1] === otherEdge[0])
            ) {
              isShared = true;
              break;
            }
          }
          if (isShared) break;
        }

        if (!isShared) {
          polygon.push(edge);
        }
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
  const edgeSet = new Set<string>();
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
      const key = from < to ? `${from},${to}` : `${to},${from}`;
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
  const parent = new Map<number, number>();
  const rank = new Map<number, number>();

  for (let i = 0; i < points.length; i++) {
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

  for (const edge of weightedEdges) {
    if (union(edge.from, edge.to)) {
      mst.push([edge.from, edge.to]);
      if (mst.length === points.length - 1) break;
    }
  }

  return mst;
}
