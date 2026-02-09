import { describe, expect, it } from "bun:test";
import { SeededRandom } from "../src";
import type { Edge } from "../src/core/geometry/delaunay";
import {
  buildMSTFromEdges,
  delaunayTriangulation,
} from "../src/core/geometry/delaunay";
import type { Point } from "../src/core/geometry/types";

describe("Delaunay Triangulation", () => {
  describe("delaunayTriangulation()", () => {
    it("should handle less than 2 points by returning empty array", () => {
      const points: Point[] = [];
      const edges = delaunayTriangulation(points);
      expect(edges).toEqual([]);

      const onePoint: Point[] = [{ x: 0, y: 0 }];
      const edgesOne = delaunayTriangulation(onePoint);
      expect(edgesOne).toEqual([]);
    });

    it("should handle exactly 2 points by returning single edge", () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ];
      const edges = delaunayTriangulation(points);
      expect(edges.length).toBe(1);
      expect(edges[0]).toEqual({ from: 0, to: 1 });
    });

    it("should triangulate a simple triangle (3 points)", () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 10 },
      ];
      const edges = delaunayTriangulation(points);

      // A triangle should have exactly 3 edges
      expect(edges.length).toBe(3);

      // Check that all vertices are connected
      const edgeSet = new Set<string>();
      for (const edge of edges) {
        const key =
          edge.from < edge.to
            ? `${edge.from},${edge.to}`
            : `${edge.to},${edge.from}`;
        edgeSet.add(key);
      }

      // Verify all 3 possible edges exist
      expect(edgeSet.has("0,1")).toBe(true);
      expect(edgeSet.has("0,2")).toBe(true);
      expect(edgeSet.has("1,2")).toBe(true);
    });

    it("should triangulate a square (4 points)", () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ];
      const edges = delaunayTriangulation(points);

      // A square should have 5 edges (4 perimeter + 1 diagonal)
      expect(edges.length).toBe(5);

      // Each vertex should be connected
      const adjacency: Record<number, Set<number>> = {
        0: new Set(),
        1: new Set(),
        2: new Set(),
        3: new Set(),
      };
      for (const edge of edges) {
        adjacency[edge.from]?.add(edge.to);
        adjacency[edge.to]?.add(edge.from);
      }

      // Each vertex should have at least 2 connections
      for (let i = 0; i < 4; i++) {
        expect(adjacency[i]?.size).toBeGreaterThanOrEqual(2);
      }
    });

    it("should triangulate random points", () => {
      const points: Point[] = [
        { x: 2, y: 3 },
        { x: 8, y: 1 },
        { x: 5, y: 7 },
        { x: 1, y: 9 },
        { x: 9, y: 6 },
        { x: 4, y: 4 },
      ];
      const edges = delaunayTriangulation(points);

      // For n points, Delaunay triangulation should have roughly 3n edges
      // For 6 points, expect around 12-18 edges
      expect(edges.length).toBeGreaterThan(0);
      expect(edges.length).toBeLessThanOrEqual(points.length * 3);

      // Verify all edges reference valid point indices
      for (const edge of edges) {
        expect(edge.from).toBeGreaterThanOrEqual(0);
        expect(edge.from).toBeLessThan(points.length);
        expect(edge.to).toBeGreaterThanOrEqual(0);
        expect(edge.to).toBeLessThan(points.length);
        expect(edge.from).not.toBe(edge.to);
      }

      // Verify no duplicate edges
      const edgeSet = new Set<string>();
      for (const edge of edges) {
        const key =
          edge.from < edge.to
            ? `${edge.from},${edge.to}`
            : `${edge.to},${edge.from}`;
        expect(edgeSet.has(key)).toBe(false);
        edgeSet.add(key);
      }
    });

    it("should handle collinear points gracefully", () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 10, y: 0 },
      ];
      const edges = delaunayTriangulation(points);

      // Collinear points may produce edges depending on implementation
      // The important thing is no crash and valid edge indices if edges exist
      expect(Array.isArray(edges)).toBe(true);

      // All edges should reference valid indices
      for (const edge of edges) {
        expect(edge.from).toBeGreaterThanOrEqual(0);
        expect(edge.from).toBeLessThan(points.length);
        expect(edge.to).toBeGreaterThanOrEqual(0);
        expect(edge.to).toBeLessThan(points.length);
      }
    });

    it("should handle duplicate points", () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 0 }, // Duplicate
        { x: 5, y: 10 },
      ];
      const edges = delaunayTriangulation(points);

      // Should produce edges despite duplicates
      expect(edges.length).toBeGreaterThan(0);

      // All edges should reference valid indices
      for (const edge of edges) {
        expect(edge.from).toBeGreaterThanOrEqual(0);
        expect(edge.from).toBeLessThan(points.length);
        expect(edge.to).toBeGreaterThanOrEqual(0);
        expect(edge.to).toBeLessThan(points.length);
      }
    });

    it("should produce connected graph", () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 10 },
        { x: 15, y: 5 },
        { x: 5, y: 5 },
      ];
      const edges = delaunayTriangulation(points);

      // Build adjacency list
      const adjacency: Record<number, Set<number>> = {};
      for (let i = 0; i < points.length; i++) {
        adjacency[i] = new Set();
      }
      for (const edge of edges) {
        adjacency[edge.from]?.add(edge.to);
        adjacency[edge.to]?.add(edge.from);
      }

      // BFS to check connectivity
      const visited = new Set<number>();
      const queue = [0];
      visited.add(0);

      while (queue.length > 0) {
        const current = queue.shift()!;
        const neighbors = adjacency[current];
        if (neighbors) {
          for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
              visited.add(neighbor);
              queue.push(neighbor);
            }
          }
        }
      }

      // All points should be reachable (connected graph)
      expect(visited.size).toBe(points.length);
    });

    it("should handle points in a circle", () => {
      const points: Point[] = [];
      const n = 8;
      const radius = 10;
      for (let i = 0; i < n; i++) {
        const angle = (i * 2 * Math.PI) / n;
        points.push({
          x: radius * Math.cos(angle),
          y: radius * Math.sin(angle),
        });
      }

      const edges = delaunayTriangulation(points);

      // Should create a triangulation
      expect(edges.length).toBeGreaterThan(0);
      expect(edges.length).toBeLessThanOrEqual(n * 3);

      // All edges should be valid
      for (const edge of edges) {
        expect(edge.from).toBeGreaterThanOrEqual(0);
        expect(edge.from).toBeLessThan(points.length);
        expect(edge.to).toBeGreaterThanOrEqual(0);
        expect(edge.to).toBeLessThan(points.length);
        expect(edge.from).not.toBe(edge.to);
      }
    });

    it("should handle larger point set", () => {
      const rng = new SeededRandom(0xdecafbad);
      const points: Point[] = [];
      for (let i = 0; i < 20; i++) {
        points.push({
          x: rng.next() * 100,
          y: rng.next() * 100,
        });
      }

      const edges = delaunayTriangulation(points);

      // Should produce edges
      expect(edges.length).toBeGreaterThan(0);

      // Verify no invalid edges
      for (const edge of edges) {
        expect(edge.from).toBeGreaterThanOrEqual(0);
        expect(edge.from).toBeLessThan(points.length);
        expect(edge.to).toBeGreaterThanOrEqual(0);
        expect(edge.to).toBeLessThan(points.length);
        expect(edge.from).not.toBe(edge.to);
      }

      // Verify no duplicate edges
      const edgeSet = new Set<string>();
      for (const edge of edges) {
        const key =
          edge.from < edge.to
            ? `${edge.from},${edge.to}`
            : `${edge.to},${edge.from}`;
        expect(edgeSet.has(key)).toBe(false);
        edgeSet.add(key);
      }
    });
  });

  describe("buildMSTFromEdges()", () => {
    it("should return empty array for 0 or 1 points", () => {
      const points: Point[] = [];
      const edges: Edge[] = [];
      const mst = buildMSTFromEdges(points, edges);
      expect(mst).toEqual([]);

      const onePoint: Point[] = [{ x: 0, y: 0 }];
      const mstOne = buildMSTFromEdges(onePoint, []);
      expect(mstOne).toEqual([]);
    });

    it("should return empty array when no edges provided", () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 10 },
      ];
      const edges: Edge[] = [];
      const mst = buildMSTFromEdges(points, edges);
      expect(mst).toEqual([]);
    });

    it("should build MST from triangle edges", () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 5, y: 10 },
      ];
      const edges: Edge[] = [
        { from: 0, to: 1 },
        { from: 1, to: 2 },
        { from: 2, to: 0 },
      ];
      const mst = buildMSTFromEdges(points, edges);

      // MST of 3 points should have exactly 2 edges
      expect(mst.length).toBe(2);

      // Verify all edges reference valid points
      for (const [from, to] of mst) {
        expect(from).toBeGreaterThanOrEqual(0);
        expect(from).toBeLessThan(points.length);
        expect(to).toBeGreaterThanOrEqual(0);
        expect(to).toBeLessThan(points.length);
        expect(from).not.toBe(to);
      }

      // Verify MST is connected
      const adjacency: Record<number, Set<number>> = {
        0: new Set(),
        1: new Set(),
        2: new Set(),
      };
      for (const [from, to] of mst) {
        adjacency[from]?.add(to);
        adjacency[to]?.add(from);
      }

      const visited = new Set<number>();
      const queue = [0];
      visited.add(0);

      while (queue.length > 0) {
        const current = queue.shift()!;
        const neighbors = adjacency[current];
        if (neighbors) {
          for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
              visited.add(neighbor);
              queue.push(neighbor);
            }
          }
        }
      }

      expect(visited.size).toBe(points.length);
    });

    it("should build MST with exactly n-1 edges for n points", () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
        { x: 5, y: 5 },
      ];
      const edges = delaunayTriangulation(points);
      const mst = buildMSTFromEdges(points, edges);

      // MST should have exactly n-1 edges
      expect(mst.length).toBe(points.length - 1);
    });

    it("should select minimum weight edges", () => {
      // Create a simple graph where MST is obvious
      const points: Point[] = [
        { x: 0, y: 0 }, // 0
        { x: 1, y: 0 }, // 1 - close to 0
        { x: 100, y: 0 }, // 2 - far from 0 and 1
      ];
      const edges: Edge[] = [
        { from: 0, to: 1 }, // Weight: 1
        { from: 1, to: 2 }, // Weight: 99
        { from: 0, to: 2 }, // Weight: 100
      ];
      const mst = buildMSTFromEdges(points, edges);

      // MST should have 2 edges
      expect(mst.length).toBe(2);

      // MST should include the two shortest edges: 0-1 and 1-2
      const mstSet = new Set<string>();
      for (const [from, to] of mst) {
        const key = from < to ? `${from},${to}` : `${to},${from}`;
        mstSet.add(key);
      }

      expect(mstSet.has("0,1")).toBe(true);
      expect(mstSet.has("1,2")).toBe(true);
      expect(mstSet.has("0,2")).toBe(false); // Longest edge should be excluded
    });

    it("should create spanning tree (all vertices reachable)", () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 5, y: 0 },
        { x: 10, y: 0 },
        { x: 0, y: 5 },
        { x: 5, y: 5 },
        { x: 10, y: 5 },
      ];
      const edges = delaunayTriangulation(points);
      const mst = buildMSTFromEdges(points, edges);

      // Build adjacency list from MST
      const adjacency: Record<number, Set<number>> = {};
      for (let i = 0; i < points.length; i++) {
        adjacency[i] = new Set();
      }
      for (const [from, to] of mst) {
        adjacency[from]?.add(to);
        adjacency[to]?.add(from);
      }

      // BFS to verify all nodes are reachable
      const visited = new Set<number>();
      const queue = [0];
      visited.add(0);

      while (queue.length > 0) {
        const current = queue.shift()!;
        const neighbors = adjacency[current];
        if (neighbors) {
          for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
              visited.add(neighbor);
              queue.push(neighbor);
            }
          }
        }
      }

      expect(visited.size).toBe(points.length);
    });

    it("should have no cycles (tree property)", () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 10, y: 10 },
        { x: 0, y: 10 },
      ];
      const edges = delaunayTriangulation(points);
      const mst = buildMSTFromEdges(points, edges);

      // MST should have exactly n-1 edges (tree property)
      expect(mst.length).toBe(points.length - 1);

      // Verify no cycles using DFS
      const adjacency: Record<number, Set<number>> = {};
      for (let i = 0; i < points.length; i++) {
        adjacency[i] = new Set();
      }
      for (const [from, to] of mst) {
        adjacency[from]?.add(to);
        adjacency[to]?.add(from);
      }

      const visited = new Set<number>();
      function hasCycle(node: number, parent: number): boolean {
        visited.add(node);
        const neighbors = adjacency[node];
        if (!neighbors) return false;

        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            if (hasCycle(neighbor, node)) return true;
          } else if (neighbor !== parent) {
            return true; // Found a cycle
          }
        }
        return false;
      }

      expect(hasCycle(0, -1)).toBe(false);
    });

    it("should handle disconnected edge sets gracefully", () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 100, y: 100 },
        { x: 110, y: 100 },
      ];
      // Only connect within clusters
      const edges: Edge[] = [
        { from: 0, to: 1 },
        { from: 2, to: 3 },
      ];
      const mst = buildMSTFromEdges(points, edges);

      // Should still produce edges (partial MST)
      expect(mst.length).toBeGreaterThan(0);
      expect(mst.length).toBeLessThanOrEqual(points.length - 1);

      // All edges should be valid
      for (const [from, to] of mst) {
        expect(from).toBeGreaterThanOrEqual(0);
        expect(from).toBeLessThan(points.length);
        expect(to).toBeGreaterThanOrEqual(0);
        expect(to).toBeLessThan(points.length);
      }
    });

    it("should work with Delaunay triangulation output", () => {
      const points: Point[] = [
        { x: 2, y: 3 },
        { x: 8, y: 1 },
        { x: 5, y: 7 },
        { x: 1, y: 9 },
        { x: 9, y: 6 },
      ];
      const delaunayEdges = delaunayTriangulation(points);
      const mst = buildMSTFromEdges(points, delaunayEdges);

      // Should produce valid MST
      expect(mst.length).toBe(points.length - 1);

      // All edges should be valid
      for (const [from, to] of mst) {
        expect(from).toBeGreaterThanOrEqual(0);
        expect(from).toBeLessThan(points.length);
        expect(to).toBeGreaterThanOrEqual(0);
        expect(to).toBeLessThan(points.length);
        expect(from).not.toBe(to);
      }

      // Verify connectivity
      const adjacency: Record<number, Set<number>> = {};
      for (let i = 0; i < points.length; i++) {
        adjacency[i] = new Set();
      }
      for (const [from, to] of mst) {
        adjacency[from]?.add(to);
        adjacency[to]?.add(from);
      }

      const visited = new Set<number>();
      const queue = [0];
      visited.add(0);

      while (queue.length > 0) {
        const current = queue.shift()!;
        const neighbors = adjacency[current];
        if (neighbors) {
          for (const neighbor of neighbors) {
            if (!visited.has(neighbor)) {
              visited.add(neighbor);
              queue.push(neighbor);
            }
          }
        }
      }

      expect(visited.size).toBe(points.length);
    });

    it("should handle invalid edge indices gracefully", () => {
      const points: Point[] = [
        { x: 0, y: 0 },
        { x: 10, y: 0 },
      ];
      const edges: Edge[] = [
        { from: 0, to: 1 },
        { from: 1, to: 5 }, // Invalid index
      ];
      const mst = buildMSTFromEdges(points, edges);

      // Should still process valid edges
      expect(mst.length).toBeGreaterThan(0);

      // All returned edges should be valid
      for (const [from, to] of mst) {
        expect(from).toBeGreaterThanOrEqual(0);
        expect(from).toBeLessThan(points.length);
        expect(to).toBeGreaterThanOrEqual(0);
        expect(to).toBeLessThan(points.length);
      }
    });
  });
});
