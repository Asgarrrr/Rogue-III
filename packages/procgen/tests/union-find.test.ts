import { describe, expect, it } from "bun:test";
import { UnionFind } from "../src/core/algorithms/union-find";

describe("UnionFind", () => {
  describe("Constructor", () => {
    it("creates UnionFind with correct size", () => {
      const uf = new UnionFind(5);
      // Each element should be its own parent initially
      for (let i = 0; i < 5; i++) {
        expect(uf.find(i)).toBe(i);
      }
    });

    it("handles single element", () => {
      const uf = new UnionFind(1);
      expect(uf.find(0)).toBe(0);
    });

    it("handles large sets", () => {
      const uf = new UnionFind(1000);
      expect(uf.find(0)).toBe(0);
      expect(uf.find(999)).toBe(999);
    });
  });

  describe("find()", () => {
    it("returns correct root for element", () => {
      const uf = new UnionFind(5);
      expect(uf.find(0)).toBe(0);
      expect(uf.find(1)).toBe(1);
      expect(uf.find(4)).toBe(4);
    });

    it("returns same root after union", () => {
      const uf = new UnionFind(5);
      uf.union(0, 1);
      const root = uf.find(0);
      expect(uf.find(1)).toBe(root);
    });

    it("implements path compression", () => {
      const uf = new UnionFind(10);
      // Create a chain: 0 <- 1 <- 2 <- 3
      uf.union(0, 1);
      uf.union(1, 2);
      uf.union(2, 3);

      const root = uf.find(3);
      // After find(3), path compression should flatten the tree
      // All elements should have the same root
      expect(uf.find(0)).toBe(root);
      expect(uf.find(1)).toBe(root);
      expect(uf.find(2)).toBe(root);
      expect(uf.find(3)).toBe(root);
    });

    it("returns element itself for out of bounds", () => {
      const uf = new UnionFind(5);
      // Out of bounds elements return themselves
      expect(uf.find(10)).toBe(10);
      expect(uf.find(100)).toBe(100);
    });
  });

  describe("union()", () => {
    it("merges two different sets", () => {
      const uf = new UnionFind(5);
      const result = uf.union(0, 1);
      expect(result).toBe(true);
      expect(uf.connected(0, 1)).toBe(true);
    });

    it("returns false when elements are already in same set", () => {
      const uf = new UnionFind(5);
      uf.union(0, 1);
      const result = uf.union(0, 1);
      expect(result).toBe(false);
    });

    it("returns false when uniting already connected elements indirectly", () => {
      const uf = new UnionFind(5);
      uf.union(0, 1);
      uf.union(1, 2);
      // 0 and 2 are already connected through 1
      const result = uf.union(0, 2);
      expect(result).toBe(false);
    });

    it("merges multiple disjoint sets correctly", () => {
      const uf = new UnionFind(10);
      uf.union(0, 1);
      uf.union(2, 3);
      uf.union(4, 5);

      expect(uf.connected(0, 1)).toBe(true);
      expect(uf.connected(2, 3)).toBe(true);
      expect(uf.connected(4, 5)).toBe(true);
      expect(uf.connected(0, 2)).toBe(false);
      expect(uf.connected(0, 4)).toBe(false);
    });

    it("merges sets with union by rank", () => {
      const uf = new UnionFind(8);
      // Create two trees of different ranks
      uf.union(0, 1);
      uf.union(2, 3);
      uf.union(0, 2); // Merges two rank-1 trees

      uf.union(4, 5);
      uf.union(6, 7);
      uf.union(4, 6); // Connect second group

      // Now merge the two groups
      uf.union(0, 4);

      // All should be connected
      expect(uf.connected(0, 7)).toBe(true);
    });

    it("returns false for out of bounds elements", () => {
      const uf = new UnionFind(5);
      const result = uf.union(0, 10);
      expect(result).toBe(false);
    });

    it("handles self-union", () => {
      const uf = new UnionFind(5);
      const result = uf.union(2, 2);
      expect(result).toBe(false);
    });
  });

  describe("connected()", () => {
    it("returns true for elements in same set", () => {
      const uf = new UnionFind(5);
      uf.union(0, 1);
      expect(uf.connected(0, 1)).toBe(true);
      expect(uf.connected(1, 0)).toBe(true);
    });

    it("returns false for elements in different sets", () => {
      const uf = new UnionFind(5);
      expect(uf.connected(0, 1)).toBe(false);
      expect(uf.connected(2, 4)).toBe(false);
    });

    it("returns true for element with itself", () => {
      const uf = new UnionFind(5);
      expect(uf.connected(0, 0)).toBe(true);
      expect(uf.connected(3, 3)).toBe(true);
    });

    it("returns true for transitively connected elements", () => {
      const uf = new UnionFind(5);
      uf.union(0, 1);
      uf.union(1, 2);
      uf.union(2, 3);

      expect(uf.connected(0, 3)).toBe(true);
      expect(uf.connected(1, 3)).toBe(true);
      expect(uf.connected(0, 2)).toBe(true);
    });

    it("handles complex connectivity patterns", () => {
      const uf = new UnionFind(10);
      // Create two separate components
      uf.union(0, 1);
      uf.union(1, 2);
      uf.union(2, 3);

      uf.union(5, 6);
      uf.union(6, 7);
      uf.union(7, 8);

      // Within components
      expect(uf.connected(0, 3)).toBe(true);
      expect(uf.connected(5, 8)).toBe(true);

      // Across components
      expect(uf.connected(0, 5)).toBe(false);
      expect(uf.connected(3, 8)).toBe(false);

      // Single element not connected to any
      expect(uf.connected(4, 0)).toBe(false);
      expect(uf.connected(4, 5)).toBe(false);
    });
  });

  describe("Edge Cases", () => {
    it("handles empty UnionFind (size 0)", () => {
      const uf = new UnionFind(0);
      expect(uf.find(0)).toBe(0);
      expect(uf.union(0, 1)).toBe(false);
    });

    it("handles single element set", () => {
      const uf = new UnionFind(1);
      expect(uf.find(0)).toBe(0);
      expect(uf.connected(0, 0)).toBe(true);
      expect(uf.union(0, 0)).toBe(false);
    });

    it("handles large number of elements", () => {
      const size = 10000;
      const uf = new UnionFind(size);

      // Union all elements into one set
      for (let i = 1; i < size; i++) {
        uf.union(0, i);
      }

      // All elements should be connected
      expect(uf.connected(0, size - 1)).toBe(true);
      expect(uf.connected(1, size - 1)).toBe(true);
    });

    it("handles many unions and finds efficiently", () => {
      const uf = new UnionFind(1000);

      // Create 100 components of 10 elements each
      for (let i = 0; i < 100; i++) {
        for (let j = 1; j < 10; j++) {
          uf.union(i * 10, i * 10 + j);
        }
      }

      // Verify components
      for (let i = 0; i < 100; i++) {
        const start = i * 10;
        const end = start + 9;
        expect(uf.connected(start, end)).toBe(true);
        if (i < 99) {
          expect(uf.connected(start, start + 10)).toBe(false);
        }
      }
    });

    it("handles worst-case path compression scenario", () => {
      const uf = new UnionFind(100);

      // Create a long chain
      for (let i = 0; i < 99; i++) {
        uf.union(i, i + 1);
      }

      // All elements should be connected
      expect(uf.connected(0, 99)).toBe(true);

      // Path compression should have flattened the tree
      const root = uf.find(99);
      for (let i = 0; i < 100; i++) {
        expect(uf.find(i)).toBe(root);
      }
    });
  });

  describe("Integration Tests", () => {
    it("simulates maze generation use case", () => {
      // Common use case: connecting cells in a grid
      const rows = 5;
      const cols = 5;
      const uf = new UnionFind(rows * cols);

      const getIndex = (r: number, c: number) => r * cols + c;

      // Connect some cells
      uf.union(getIndex(0, 0), getIndex(0, 1));
      uf.union(getIndex(0, 1), getIndex(1, 1));
      uf.union(getIndex(1, 1), getIndex(2, 1));

      expect(uf.connected(getIndex(0, 0), getIndex(2, 1))).toBe(true);
      expect(uf.connected(getIndex(0, 0), getIndex(3, 3))).toBe(false);
    });

    it("simulates minimum spanning tree use case", () => {
      const uf = new UnionFind(6);

      // Add edges in order (simulating Kruskal's algorithm)
      const edges = [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 4],
        [4, 5],
      ];

      let edgesAdded = 0;
      for (const [u, v] of edges) {
        if (uf.union(u, v)) {
          edgesAdded++;
        }
      }

      // Should have added all edges (tree with 6 nodes has 5 edges)
      expect(edgesAdded).toBe(5);
      expect(uf.connected(0, 5)).toBe(true);
    });

    it("detects cycles in graph", () => {
      const uf = new UnionFind(4);

      // Add edges to form a cycle
      expect(uf.union(0, 1)).toBe(true); // New edge
      expect(uf.union(1, 2)).toBe(true); // New edge
      expect(uf.union(2, 3)).toBe(true); // New edge
      expect(uf.union(3, 0)).toBe(false); // Creates cycle, returns false
    });
  });
});
