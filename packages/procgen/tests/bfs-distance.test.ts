/**
 * BFS Distance Calculation unit tests
 */

import { describe, expect, it } from "bun:test";
import {
  calculateBFSDistances,
  calculateRoomGraphDistances,
  calculateStringGraphDistances,
} from "../src/core/graph/bfs-distance";

describe("calculateBFSDistances", () => {
  it("calculates distances from start node in simple graph", () => {
    // Graph: 0 -> 1 -> 2 -> 3
    const adjacency = new Map<number, number[]>([
      [0, [1]],
      [1, [2]],
      [2, [3]],
      [3, []],
    ]);

    const { distances, maxDistance } = calculateBFSDistances(
      0,
      (nodeId) => adjacency.get(nodeId) ?? [],
    );

    expect(distances.get(0)).toBe(0);
    expect(distances.get(1)).toBe(1);
    expect(distances.get(2)).toBe(2);
    expect(distances.get(3)).toBe(3);
    expect(maxDistance).toBe(3);
  });

  it("calculates distances in branching graph", () => {
    // Graph:     0
    //           / \
    //          1   2
    //         /     \
    //        3       4
    const adjacency = new Map<number, number[]>([
      [0, [1, 2]],
      [1, [3]],
      [2, [4]],
      [3, []],
      [4, []],
    ]);

    const { distances, maxDistance } = calculateBFSDistances(
      0,
      (nodeId) => adjacency.get(nodeId) ?? [],
    );

    expect(distances.get(0)).toBe(0);
    expect(distances.get(1)).toBe(1);
    expect(distances.get(2)).toBe(1);
    expect(distances.get(3)).toBe(2);
    expect(distances.get(4)).toBe(2);
    expect(maxDistance).toBe(2);
  });

  it("finds shortest path in graph with loops", () => {
    // Graph with cycle: 0 -> 1 -> 2 -> 3
    //                        \_____|
    const adjacency = new Map<number, number[]>([
      [0, [1]],
      [1, [2]],
      [2, [3, 1]], // Back edge to create loop
      [3, []],
    ]);

    const { distances, maxDistance } = calculateBFSDistances(
      0,
      (nodeId) => adjacency.get(nodeId) ?? [],
    );

    // Should find shortest path (not go through loop)
    expect(distances.get(0)).toBe(0);
    expect(distances.get(1)).toBe(1);
    expect(distances.get(2)).toBe(2);
    expect(distances.get(3)).toBe(3);
    expect(maxDistance).toBe(3);
  });

  it("finds shortest path in complex graph with multiple routes", () => {
    // Graph: 0 -> 1 -> 3
    //        |         |
    //        v         v
    //        2 ------> 4
    const adjacency = new Map<number, number[]>([
      [0, [1, 2]],
      [1, [3]],
      [2, [4]],
      [3, [4]],
      [4, []],
    ]);

    const { distances, maxDistance } = calculateBFSDistances(
      0,
      (nodeId) => adjacency.get(nodeId) ?? [],
    );

    expect(distances.get(0)).toBe(0);
    expect(distances.get(1)).toBe(1);
    expect(distances.get(2)).toBe(1);
    expect(distances.get(3)).toBe(2);
    expect(distances.get(4)).toBe(2); // Shortest path is 0->2->4, not 0->1->3->4
    expect(maxDistance).toBe(2);
  });

  it("handles disconnected nodes", () => {
    // Graph: 0 -> 1    2 -> 3  (disconnected)
    const adjacency = new Map<number, number[]>([
      [0, [1]],
      [1, []],
      [2, [3]],
      [3, []],
    ]);

    const { distances, maxDistance } = calculateBFSDistances(
      0,
      (nodeId) => adjacency.get(nodeId) ?? [],
    );

    // Only reachable nodes from 0
    expect(distances.get(0)).toBe(0);
    expect(distances.get(1)).toBe(1);
    expect(distances.has(2)).toBe(false);
    expect(distances.has(3)).toBe(false);
    expect(maxDistance).toBe(1);
  });

  it("handles single node graph", () => {
    const adjacency = new Map<number, number[]>([[0, []]]);

    const { distances, maxDistance } = calculateBFSDistances(
      0,
      (nodeId) => adjacency.get(nodeId) ?? [],
    );

    expect(distances.get(0)).toBe(0);
    expect(distances.size).toBe(1);
    expect(maxDistance).toBe(0);
  });

  it("handles empty graph (no neighbors)", () => {
    const adjacency = new Map<number, number[]>();

    const { distances, maxDistance } = calculateBFSDistances(
      0,
      (nodeId) => adjacency.get(nodeId) ?? [],
    );

    // Only the start node itself
    expect(distances.get(0)).toBe(0);
    expect(distances.size).toBe(1);
    expect(maxDistance).toBe(0);
  });

  it("handles bidirectional edges correctly", () => {
    // Graph: 0 <-> 1 <-> 2
    const adjacency = new Map<number, number[]>([
      [0, [1]],
      [1, [0, 2]],
      [2, [1]],
    ]);

    const { distances, maxDistance } = calculateBFSDistances(
      0,
      (nodeId) => adjacency.get(nodeId) ?? [],
    );

    expect(distances.get(0)).toBe(0);
    expect(distances.get(1)).toBe(1);
    expect(distances.get(2)).toBe(2);
    expect(maxDistance).toBe(2);
  });

  it("handles fully connected graph", () => {
    // Complete graph with 4 nodes
    const adjacency = new Map<number, number[]>([
      [0, [1, 2, 3]],
      [1, [0, 2, 3]],
      [2, [0, 1, 3]],
      [3, [0, 1, 2]],
    ]);

    const { distances, maxDistance } = calculateBFSDistances(
      0,
      (nodeId) => adjacency.get(nodeId) ?? [],
    );

    expect(distances.get(0)).toBe(0);
    expect(distances.get(1)).toBe(1);
    expect(distances.get(2)).toBe(1);
    expect(distances.get(3)).toBe(1);
    expect(maxDistance).toBe(1);
  });

  it("handles linear chain graph", () => {
    // Linear: 0 -> 1 -> 2 -> 3 -> 4 -> 5
    const adjacency = new Map<number, number[]>([
      [0, [1]],
      [1, [2]],
      [2, [3]],
      [3, [4]],
      [4, [5]],
      [5, []],
    ]);

    const { distances, maxDistance } = calculateBFSDistances(
      0,
      (nodeId) => adjacency.get(nodeId) ?? [],
    );

    // Distances should increase linearly
    for (let i = 0; i <= 5; i++) {
      expect(distances.get(i)).toBe(i);
    }
    expect(maxDistance).toBe(5);
  });

  it("handles start node with no outgoing edges", () => {
    const adjacency = new Map<number, number[]>([
      [0, []],
      [1, [2]],
      [2, []],
    ]);

    const { distances, maxDistance } = calculateBFSDistances(
      0,
      (nodeId) => adjacency.get(nodeId) ?? [],
    );

    expect(distances.get(0)).toBe(0);
    expect(distances.size).toBe(1);
    expect(maxDistance).toBe(0);
  });
});

describe("calculateStringGraphDistances", () => {
  it("works with string node IDs", () => {
    const adjacency = new Map<string, string[]>([
      ["start", ["middle"]],
      ["middle", ["end"]],
      ["end", []],
    ]);

    const { distances, maxDistance } = calculateStringGraphDistances(
      "start",
      adjacency,
    );

    expect(distances.get("start")).toBe(0);
    expect(distances.get("middle")).toBe(1);
    expect(distances.get("end")).toBe(2);
    expect(maxDistance).toBe(2);
  });

  it("handles experience-like graph structure", () => {
    // Simulating experience nodes
    const adjacency = new Map<string, string[]>([
      ["entrance", ["corridor1", "corridor2"]],
      ["corridor1", ["room1"]],
      ["corridor2", ["room2"]],
      ["room1", ["exit"]],
      ["room2", ["exit"]],
      ["exit", []],
    ]);

    const { distances, maxDistance } = calculateStringGraphDistances(
      "entrance",
      adjacency,
    );

    expect(distances.get("entrance")).toBe(0);
    expect(distances.get("corridor1")).toBe(1);
    expect(distances.get("corridor2")).toBe(1);
    expect(distances.get("room1")).toBe(2);
    expect(distances.get("room2")).toBe(2);
    expect(distances.get("exit")).toBe(3);
    expect(maxDistance).toBe(3);
  });

  it("handles empty adjacency map", () => {
    const adjacency = new Map<string, string[]>();

    const { distances, maxDistance } = calculateStringGraphDistances(
      "start",
      adjacency,
    );

    expect(distances.get("start")).toBe(0);
    expect(distances.size).toBe(1);
    expect(maxDistance).toBe(0);
  });

  it("handles disconnected string graph", () => {
    const adjacency = new Map<string, string[]>([
      ["a", ["b"]],
      ["b", []],
      ["c", ["d"]],
      ["d", []],
    ]);

    const { distances, maxDistance } = calculateStringGraphDistances(
      "a",
      adjacency,
    );

    expect(distances.get("a")).toBe(0);
    expect(distances.get("b")).toBe(1);
    expect(distances.has("c")).toBe(false);
    expect(distances.has("d")).toBe(false);
    expect(maxDistance).toBe(1);
  });
});

describe("calculateRoomGraphDistances", () => {
  it("works with room number IDs", () => {
    const adjacency = new Map<number, number[]>([
      [0, [1]],
      [1, [2]],
      [2, []],
    ]);

    const { distances, maxDistance } = calculateRoomGraphDistances(
      0,
      adjacency,
    );

    expect(distances.get(0)).toBe(0);
    expect(distances.get(1)).toBe(1);
    expect(distances.get(2)).toBe(2);
    expect(maxDistance).toBe(2);
  });

  it("handles room adjacency structure", () => {
    // Simulating dungeon rooms
    const adjacency = new Map<number, number[]>([
      [0, [1, 2]], // Entrance room connects to 2 rooms
      [1, [3]], // Room 1 to room 3
      [2, [3]], // Room 2 to room 3
      [3, [4]], // Room 3 to boss room
      [4, []], // Boss room (dead end)
    ]);

    const { distances, maxDistance } = calculateRoomGraphDistances(
      0,
      adjacency,
    );

    expect(distances.get(0)).toBe(0);
    expect(distances.get(1)).toBe(1);
    expect(distances.get(2)).toBe(1);
    expect(distances.get(3)).toBe(2);
    expect(distances.get(4)).toBe(3);
    expect(maxDistance).toBe(3);
  });

  it("handles empty room adjacency", () => {
    const adjacency = new Map<number, number[]>();

    const { distances, maxDistance } = calculateRoomGraphDistances(
      100,
      adjacency,
    );

    expect(distances.get(100)).toBe(0);
    expect(distances.size).toBe(1);
    expect(maxDistance).toBe(0);
  });

  it("handles disconnected room graph", () => {
    const adjacency = new Map<number, number[]>([
      [0, [1]],
      [1, [2]],
      [2, []],
      [10, [11]],
      [11, []],
    ]);

    const { distances, maxDistance } = calculateRoomGraphDistances(
      0,
      adjacency,
    );

    expect(distances.get(0)).toBe(0);
    expect(distances.get(1)).toBe(1);
    expect(distances.get(2)).toBe(2);
    expect(distances.has(10)).toBe(false);
    expect(distances.has(11)).toBe(false);
    expect(maxDistance).toBe(2);
  });

  it("handles large room IDs", () => {
    const adjacency = new Map<number, number[]>([
      [1000, [2000]],
      [2000, [3000]],
      [3000, []],
    ]);

    const { distances, maxDistance } = calculateRoomGraphDistances(
      1000,
      adjacency,
    );

    expect(distances.get(1000)).toBe(0);
    expect(distances.get(2000)).toBe(1);
    expect(distances.get(3000)).toBe(2);
    expect(maxDistance).toBe(2);
  });

  it("handles room graph with loops and shortcuts", () => {
    // Complex dungeon: main path and shortcut
    // 0 -> 1 -> 2 -> 3
    //      |_________|  (shortcut)
    const adjacency = new Map<number, number[]>([
      [0, [1]],
      [1, [2, 3]], // Has shortcut to room 3
      [2, [3]],
      [3, []],
    ]);

    const { distances, maxDistance } = calculateRoomGraphDistances(
      0,
      adjacency,
    );

    expect(distances.get(0)).toBe(0);
    expect(distances.get(1)).toBe(1);
    expect(distances.get(2)).toBe(2);
    expect(distances.get(3)).toBe(2); // Shortcut makes it distance 2, not 3
    expect(maxDistance).toBe(2);
  });
});

describe("edge cases and special graphs", () => {
  it("handles self-loop correctly", () => {
    const adjacency = new Map<number, number[]>([
      [0, [0, 1]], // Node 0 has self-loop
      [1, []],
    ]);

    const { distances, maxDistance } = calculateBFSDistances(
      0,
      (nodeId) => adjacency.get(nodeId) ?? [],
    );

    expect(distances.get(0)).toBe(0);
    expect(distances.get(1)).toBe(1);
    expect(maxDistance).toBe(1);
  });

  it("handles very large graphs efficiently", () => {
    // Create a large linear graph
    const adjacency = new Map<number, number[]>();
    const size = 1000;

    for (let i = 0; i < size - 1; i++) {
      adjacency.set(i, [i + 1]);
    }
    adjacency.set(size - 1, []);

    const { distances, maxDistance } = calculateBFSDistances(
      0,
      (nodeId) => adjacency.get(nodeId) ?? [],
    );

    expect(distances.size).toBe(size);
    expect(distances.get(0)).toBe(0);
    expect(distances.get(size - 1)).toBe(size - 1);
    expect(maxDistance).toBe(size - 1);
  });

  it("handles star-shaped graph", () => {
    // Central node connected to all others
    const adjacency = new Map<number, number[]>([
      [0, [1, 2, 3, 4, 5]], // Center
      [1, []],
      [2, []],
      [3, []],
      [4, []],
      [5, []],
    ]);

    const { distances, maxDistance } = calculateBFSDistances(
      0,
      (nodeId) => adjacency.get(nodeId) ?? [],
    );

    expect(distances.get(0)).toBe(0);
    expect(distances.get(1)).toBe(1);
    expect(distances.get(2)).toBe(1);
    expect(distances.get(3)).toBe(1);
    expect(distances.get(4)).toBe(1);
    expect(distances.get(5)).toBe(1);
    expect(maxDistance).toBe(1);
  });

  it("handles diamond-shaped graph", () => {
    // Graph:   0
    //         / \
    //        1   2
    //         \ /
    //          3
    const adjacency = new Map<number, number[]>([
      [0, [1, 2]],
      [1, [3]],
      [2, [3]],
      [3, []],
    ]);

    const { distances, maxDistance } = calculateBFSDistances(
      0,
      (nodeId) => adjacency.get(nodeId) ?? [],
    );

    expect(distances.get(0)).toBe(0);
    expect(distances.get(1)).toBe(1);
    expect(distances.get(2)).toBe(1);
    expect(distances.get(3)).toBe(2);
    expect(maxDistance).toBe(2);
  });
});
