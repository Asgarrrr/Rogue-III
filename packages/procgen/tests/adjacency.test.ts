/**
 * Adjacency building utilities unit tests
 */

import { describe, expect, it } from "bun:test";
import {
  buildRoomAdjacency,
  buildStringGraphAdjacency,
} from "../src/core/graph/adjacency";
import type { Connection, Room } from "../src/pipeline/types";

// Helper to create minimal Room objects
function createRoom(id: number): Room {
  return {
    id,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    centerX: 5,
    centerY: 5,
    type: "normal",
    seed: 0,
  };
}

// Helper to create Connection objects
function createConnection(fromRoomId: number, toRoomId: number): Connection {
  return {
    fromRoomId,
    toRoomId,
    path: [],
    pathLength: 0,
  };
}

describe("buildRoomAdjacency", () => {
  it("creates adjacency map from rooms and connections", () => {
    const rooms = [createRoom(1), createRoom(2), createRoom(3)];
    const connections = [createConnection(1, 2), createConnection(2, 3)];

    const adjacency = buildRoomAdjacency(rooms, connections);

    expect(adjacency.size).toBe(3);
    expect(adjacency.get(1)).toEqual([2]);
    expect(adjacency.get(2)).toEqual([1, 3]);
    expect(adjacency.get(3)).toEqual([2]);
  });

  it("creates bidirectional connections (A->B means B->A)", () => {
    const rooms = [createRoom(1), createRoom(2)];
    const connections = [createConnection(1, 2)];

    const adjacency = buildRoomAdjacency(rooms, connections);

    expect(adjacency.get(1)).toContain(2);
    expect(adjacency.get(2)).toContain(1);
  });

  it("handles multiple connections per room", () => {
    const rooms = [createRoom(1), createRoom(2), createRoom(3), createRoom(4)];
    const connections = [
      createConnection(1, 2),
      createConnection(1, 3),
      createConnection(1, 4),
    ];

    const adjacency = buildRoomAdjacency(rooms, connections);

    expect(adjacency.get(1)).toEqual([2, 3, 4]);
    expect(adjacency.get(2)).toEqual([1]);
    expect(adjacency.get(3)).toEqual([1]);
    expect(adjacency.get(4)).toEqual([1]);
  });

  it("handles rooms with no connections", () => {
    const rooms = [createRoom(1), createRoom(2), createRoom(3)];
    const connections = [createConnection(1, 2)];

    const adjacency = buildRoomAdjacency(rooms, connections);

    expect(adjacency.get(3)).toEqual([]);
  });

  it("handles empty input (no rooms, no connections)", () => {
    const adjacency = buildRoomAdjacency([], []);

    expect(adjacency.size).toBe(0);
  });

  it("handles single room with no connections", () => {
    const rooms = [createRoom(1)];
    const connections: Connection[] = [];

    const adjacency = buildRoomAdjacency(rooms, connections);

    expect(adjacency.size).toBe(1);
    expect(adjacency.get(1)).toEqual([]);
  });

  it("prevents duplicate connections", () => {
    const rooms = [createRoom(1), createRoom(2)];
    // Same connection defined multiple times
    const connections = [
      createConnection(1, 2),
      createConnection(1, 2),
      createConnection(2, 1), // Reverse (should not add duplicate)
    ];

    const adjacency = buildRoomAdjacency(rooms, connections);

    expect(adjacency.get(1)).toEqual([2]);
    expect(adjacency.get(2)).toEqual([1]);
  });

  it("handles complex graph topology", () => {
    // Create a diamond-shaped graph: 1 connects to 2 and 3, both connect to 4
    const rooms = [createRoom(1), createRoom(2), createRoom(3), createRoom(4)];
    const connections = [
      createConnection(1, 2),
      createConnection(1, 3),
      createConnection(2, 4),
      createConnection(3, 4),
    ];

    const adjacency = buildRoomAdjacency(rooms, connections);

    expect(adjacency.get(1)).toEqual([2, 3]);
    expect(adjacency.get(2)).toEqual([1, 4]);
    expect(adjacency.get(3)).toEqual([1, 4]);
    expect(adjacency.get(4)).toEqual([2, 3]);
  });

  it("adds connections to non-existent rooms if specified", () => {
    const rooms = [createRoom(1), createRoom(2)];
    const connections = [
      createConnection(1, 2),
      createConnection(2, 999), // Room 999 doesn't exist
    ];

    const adjacency = buildRoomAdjacency(rooms, connections);

    // Both initialized rooms exist
    expect(adjacency.get(1)).toEqual([2]);
    expect(adjacency.get(2)).toEqual([1, 999]);
    // Non-existent room is not initialized but is added as neighbor
    expect(adjacency.get(999)).toBeUndefined();
  });

  it("handles linear chain of rooms", () => {
    const rooms = [
      createRoom(1),
      createRoom(2),
      createRoom(3),
      createRoom(4),
      createRoom(5),
    ];
    const connections = [
      createConnection(1, 2),
      createConnection(2, 3),
      createConnection(3, 4),
      createConnection(4, 5),
    ];

    const adjacency = buildRoomAdjacency(rooms, connections);

    expect(adjacency.get(1)).toEqual([2]);
    expect(adjacency.get(2)).toEqual([1, 3]);
    expect(adjacency.get(3)).toEqual([2, 4]);
    expect(adjacency.get(4)).toEqual([3, 5]);
    expect(adjacency.get(5)).toEqual([4]);
  });

  it("handles fully connected graph", () => {
    const rooms = [createRoom(1), createRoom(2), createRoom(3)];
    const connections = [
      createConnection(1, 2),
      createConnection(1, 3),
      createConnection(2, 3),
    ];

    const adjacency = buildRoomAdjacency(rooms, connections);

    expect(adjacency.get(1)?.sort()).toEqual([2, 3]);
    expect(adjacency.get(2)?.sort()).toEqual([1, 3]);
    expect(adjacency.get(3)?.sort()).toEqual([1, 2]);
  });
});

describe("buildStringGraphAdjacency", () => {
  it("creates adjacency map for string-keyed nodes", () => {
    const nodes = [{ id: "A" }, { id: "B" }, { id: "C" }];
    const edges = [
      { from: "A", to: "B" },
      { from: "B", to: "C" },
    ];

    const adjacency = buildStringGraphAdjacency(nodes, edges);

    expect(adjacency.size).toBe(3);
    expect(adjacency.get("A")).toEqual(["B"]);
    expect(adjacency.get("B")).toEqual(["A", "C"]);
    expect(adjacency.get("C")).toEqual(["B"]);
  });

  it("creates bidirectional connections by default", () => {
    const nodes = [{ id: "A" }, { id: "B" }];
    const edges = [{ from: "A", to: "B" }];

    const adjacency = buildStringGraphAdjacency(nodes, edges);

    expect(adjacency.get("A")).toContain("B");
    expect(adjacency.get("B")).toContain("A");
  });

  it("respects bidirectional flag when false", () => {
    const nodes = [{ id: "A" }, { id: "B" }];
    const edges = [{ from: "A", to: "B", bidirectional: false }];

    const adjacency = buildStringGraphAdjacency(nodes, edges);

    expect(adjacency.get("A")).toEqual(["B"]);
    expect(adjacency.get("B")).toEqual([]);
  });

  it("respects bidirectional flag when true", () => {
    const nodes = [{ id: "A" }, { id: "B" }];
    const edges = [{ from: "A", to: "B", bidirectional: true }];

    const adjacency = buildStringGraphAdjacency(nodes, edges);

    expect(adjacency.get("A")).toEqual(["B"]);
    expect(adjacency.get("B")).toEqual(["A"]);
  });

  it("handles mixed bidirectional and unidirectional edges", () => {
    const nodes = [{ id: "A" }, { id: "B" }, { id: "C" }];
    const edges = [
      { from: "A", to: "B", bidirectional: true },
      { from: "B", to: "C", bidirectional: false },
    ];

    const adjacency = buildStringGraphAdjacency(nodes, edges);

    expect(adjacency.get("A")).toEqual(["B"]);
    expect(adjacency.get("B")).toEqual(["A", "C"]);
    expect(adjacency.get("C")).toEqual([]);
  });

  it("handles multiple connections per node", () => {
    const nodes = [{ id: "A" }, { id: "B" }, { id: "C" }, { id: "D" }];
    const edges = [
      { from: "A", to: "B" },
      { from: "A", to: "C" },
      { from: "A", to: "D" },
    ];

    const adjacency = buildStringGraphAdjacency(nodes, edges);

    expect(adjacency.get("A")).toEqual(["B", "C", "D"]);
    expect(adjacency.get("B")).toEqual(["A"]);
    expect(adjacency.get("C")).toEqual(["A"]);
    expect(adjacency.get("D")).toEqual(["A"]);
  });

  it("handles nodes with no connections", () => {
    const nodes = [{ id: "A" }, { id: "B" }, { id: "isolated" }];
    const edges = [{ from: "A", to: "B" }];

    const adjacency = buildStringGraphAdjacency(nodes, edges);

    expect(adjacency.get("isolated")).toEqual([]);
  });

  it("handles empty input", () => {
    const adjacency = buildStringGraphAdjacency([], []);

    expect(adjacency.size).toBe(0);
  });

  it("handles single node with no connections", () => {
    const nodes = [{ id: "alone" }];
    const edges: Array<{ from: string; to: string }> = [];

    const adjacency = buildStringGraphAdjacency(nodes, edges);

    expect(adjacency.size).toBe(1);
    expect(adjacency.get("alone")).toEqual([]);
  });

  it("prevents duplicate connections", () => {
    const nodes = [{ id: "A" }, { id: "B" }];
    const edges = [
      { from: "A", to: "B" },
      { from: "A", to: "B" },
      { from: "B", to: "A" }, // Reverse (should not add duplicate)
    ];

    const adjacency = buildStringGraphAdjacency(nodes, edges);

    expect(adjacency.get("A")).toEqual(["B"]);
    expect(adjacency.get("B")).toEqual(["A"]);
  });

  it("handles directed acyclic graph (DAG)", () => {
    const nodes = [{ id: "A" }, { id: "B" }, { id: "C" }, { id: "D" }];
    const edges = [
      { from: "A", to: "B", bidirectional: false },
      { from: "A", to: "C", bidirectional: false },
      { from: "B", to: "D", bidirectional: false },
      { from: "C", to: "D", bidirectional: false },
    ];

    const adjacency = buildStringGraphAdjacency(nodes, edges);

    expect(adjacency.get("A")).toEqual(["B", "C"]);
    expect(adjacency.get("B")).toEqual(["D"]);
    expect(adjacency.get("C")).toEqual(["D"]);
    expect(adjacency.get("D")).toEqual([]);
  });

  it("adds edges to non-existent nodes if specified", () => {
    const nodes = [{ id: "A" }, { id: "B" }];
    const edges = [
      { from: "A", to: "B" },
      { from: "B", to: "nonexistent" },
    ];

    const adjacency = buildStringGraphAdjacency(nodes, edges);

    // Both initialized nodes exist
    expect(adjacency.get("A")).toEqual(["B"]);
    expect(adjacency.get("B")).toEqual(["A", "nonexistent"]);
    // Non-existent node is not initialized but is added as neighbor
    expect(adjacency.get("nonexistent")).toBeUndefined();
  });

  it("handles self-loops", () => {
    const nodes = [{ id: "A" }];
    const edges = [{ from: "A", to: "A" }];

    const adjacency = buildStringGraphAdjacency(nodes, edges);

    expect(adjacency.get("A")).toEqual(["A"]);
  });

  it("handles complex experience graph scenario", () => {
    const nodes = [
      { id: "tutorial" },
      { id: "combat" },
      { id: "puzzle" },
      { id: "boss" },
      { id: "reward" },
    ];
    const edges = [
      { from: "tutorial", to: "combat", bidirectional: false },
      { from: "tutorial", to: "puzzle", bidirectional: false },
      { from: "combat", to: "boss" },
      { from: "puzzle", to: "boss" },
      { from: "boss", to: "reward", bidirectional: false },
    ];

    const adjacency = buildStringGraphAdjacency(nodes, edges);

    expect(adjacency.get("tutorial")).toEqual(["combat", "puzzle"]);
    expect(adjacency.get("combat")).toEqual(["boss"]);
    expect(adjacency.get("puzzle")).toEqual(["boss"]);
    expect(adjacency.get("boss")).toEqual(["combat", "puzzle", "reward"]);
    expect(adjacency.get("reward")).toEqual([]);
  });
});
