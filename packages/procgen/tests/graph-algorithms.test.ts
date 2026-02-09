import { describe, expect, it } from "bun:test";
import {
  addExtraEdges,
  bfsDistances,
  buildAdjacencyFromConnections,
  buildCompleteGraph,
  buildMST,
  calculateConnectionCounts,
  calculateRoomDistances,
  calculateRoomMetadata,
  type RoomEdge,
} from "../src/passes/connectivity/graph-algorithms";
import type { Connection, Room } from "../src/pipeline/types";

// Helper to create mock rooms
function createRoom(
  id: number,
  x: number,
  y: number,
  distanceFromEntrance: number = 1,
): Room {
  return {
    id,
    x,
    y,
    width: 10,
    height: 10,
    centerX: x + 5,
    centerY: y + 5,
    type: "normal",
    seed: id,
    distanceFromEntrance,
  };
}

// Helper to create connections
function createConnection(fromRoomId: number, toRoomId: number): Connection {
  return {
    fromRoomId,
    toRoomId,
    pathLength: 0,
  };
}

describe("Graph Algorithms", () => {
  describe("buildCompleteGraph", () => {
    it("creates edges between all room pairs", () => {
      const rooms = [
        createRoom(0, 0, 0),
        createRoom(1, 10, 0),
        createRoom(2, 0, 10),
      ];

      const edges = buildCompleteGraph(rooms);

      // For 3 rooms, we should have 3 edges (n * (n-1) / 2)
      expect(edges.length).toBe(3);

      // Check all pairs exist
      const pairs = edges.map((e) => [e.from, e.to].sort());
      expect(pairs).toContainEqual([0, 1]);
      expect(pairs).toContainEqual([0, 2]);
      expect(pairs).toContainEqual([1, 2]);
    });

    it("calculates Manhattan distances correctly", () => {
      const rooms = [
        createRoom(0, 0, 0), // center at (5, 5)
        createRoom(1, 10, 0), // center at (15, 5)
      ];

      const edges = buildCompleteGraph(rooms);

      expect(edges.length).toBe(1);
      // Distance: |15-5| + |5-5| = 10
      expect(edges[0]?.weight).toBe(10);
    });

    it("handles single room", () => {
      const rooms = [createRoom(0, 0, 0)];
      const edges = buildCompleteGraph(rooms);
      expect(edges.length).toBe(0);
    });

    it("handles empty room list", () => {
      const edges = buildCompleteGraph([]);
      expect(edges.length).toBe(0);
    });

    it("creates correct number of edges for multiple rooms", () => {
      const rooms = [
        createRoom(0, 0, 0),
        createRoom(1, 10, 0),
        createRoom(2, 0, 10),
        createRoom(3, 10, 10),
        createRoom(4, 20, 0),
      ];

      const edges = buildCompleteGraph(rooms);

      // For n=5 rooms: 5 * 4 / 2 = 10 edges
      expect(edges.length).toBe(10);
    });

    it("stores room IDs correctly in edges", () => {
      const rooms = [createRoom(10, 0, 0), createRoom(20, 10, 0)];

      const edges = buildCompleteGraph(rooms);

      expect(edges[0]?.from).toBe(10);
      expect(edges[0]?.to).toBe(20);
    });
  });

  describe("buildMST", () => {
    it("returns empty array for single node", () => {
      const edges: RoomEdge[] = [];
      const mst = buildMST(1, edges);
      expect(mst.length).toBe(0);
    });

    it("returns empty array for zero nodes", () => {
      const edges: RoomEdge[] = [];
      const mst = buildMST(0, edges);
      expect(mst.length).toBe(0);
    });

    it("returns correct edge count (n-1) for connected graph", () => {
      const edges: RoomEdge[] = [
        { from: 0, to: 1, weight: 5 },
        { from: 1, to: 2, weight: 3 },
        { from: 0, to: 2, weight: 8 },
      ];

      const mst = buildMST(3, edges);

      // For 3 nodes, MST should have 2 edges
      expect(mst.length).toBe(2);
    });

    it("selects minimum weight edges", () => {
      const edges: RoomEdge[] = [
        { from: 0, to: 1, weight: 10 },
        { from: 1, to: 2, weight: 1 },
        { from: 0, to: 2, weight: 5 },
      ];

      const mst = buildMST(3, edges);

      // MST should include edges with weights 1 and 5, not 10
      expect(mst.length).toBe(2);

      const mstSet = new Set(
        mst.map(([a, b]) => `${Math.min(a, b)},${Math.max(a, b)}`),
      );
      expect(mstSet.has("1,2")).toBe(true); // weight 1
      expect(mstSet.has("0,2")).toBe(true); // weight 5
    });

    it("avoids creating cycles", () => {
      const edges: RoomEdge[] = [
        { from: 0, to: 1, weight: 1 },
        { from: 1, to: 2, weight: 2 },
        { from: 2, to: 3, weight: 3 },
        { from: 3, to: 0, weight: 4 },
        { from: 0, to: 2, weight: 5 },
      ];

      const mst = buildMST(4, edges);

      // For 4 nodes, MST should have exactly 3 edges
      expect(mst.length).toBe(3);
    });

    it("handles disconnected components", () => {
      const edges: RoomEdge[] = [
        { from: 0, to: 1, weight: 1 },
        { from: 2, to: 3, weight: 2 },
      ];

      const mst = buildMST(4, edges);

      // Should include both edges
      expect(mst.length).toBe(2);
    });

    it("works with non-sequential room IDs", () => {
      const edges: RoomEdge[] = [
        { from: 10, to: 20, weight: 5 },
        { from: 20, to: 30, weight: 3 },
        { from: 10, to: 30, weight: 8 },
      ];

      const mst = buildMST(3, edges);

      expect(mst.length).toBe(2);
      // Should preserve original room IDs
      const ids = new Set([...mst.flat()]);
      expect(ids.has(10)).toBe(true);
      expect(ids.has(20)).toBe(true);
      expect(ids.has(30)).toBe(true);
    });
  });

  describe("addExtraEdges", () => {
    it("adds no extra edges when ratio is 0", () => {
      const mstEdges: [number, number][] = [
        [0, 1],
        [1, 2],
      ];
      const allEdges: RoomEdge[] = [
        { from: 0, to: 1, weight: 1 },
        { from: 1, to: 2, weight: 2 },
        { from: 0, to: 2, weight: 3 },
      ];

      const result = addExtraEdges(mstEdges, allEdges, 0, () => 0.5);

      expect(result.length).toBe(2);
    });

    it("respects the extra ratio parameter", () => {
      const mstEdges: [number, number][] = [
        [0, 1],
        [1, 2],
        [2, 3],
      ];
      const allEdges: RoomEdge[] = [
        { from: 0, to: 1, weight: 1 },
        { from: 1, to: 2, weight: 2 },
        { from: 2, to: 3, weight: 3 },
        { from: 0, to: 2, weight: 4 },
        { from: 0, to: 3, weight: 5 },
        { from: 1, to: 3, weight: 6 },
      ];

      // Non-MST edges: 3 edges
      // With ratio 1.0, should try to add all 3
      const result = addExtraEdges(mstEdges, allEdges, 1.0, () => 0.1);

      // Result should have 3 MST edges + some extra edges
      expect(result.length).toBeGreaterThan(3);
    });

    it("uses RNG to determine which edges to add", () => {
      const mstEdges: [number, number][] = [[0, 1]];
      const allEdges: RoomEdge[] = [
        { from: 0, to: 1, weight: 1 },
        { from: 0, to: 2, weight: 2 },
      ];

      // RNG always returns > 0.5, so no edges should be added
      const resultNoAdd = addExtraEdges(mstEdges, allEdges, 1.0, () => 0.9);
      expect(resultNoAdd.length).toBe(1);

      // RNG always returns < 0.5, so extra edge should be added
      const resultAdd = addExtraEdges(mstEdges, allEdges, 1.0, () => 0.1);
      expect(resultAdd.length).toBe(2);
    });

    it("does not add edges already in MST", () => {
      const mstEdges: [number, number][] = [
        [0, 1],
        [1, 2],
      ];
      const allEdges: RoomEdge[] = [
        { from: 0, to: 1, weight: 1 },
        { from: 1, to: 2, weight: 2 },
        { from: 0, to: 2, weight: 3 },
      ];

      const result = addExtraEdges(mstEdges, allEdges, 1.0, () => 0.1);

      // Should have 2 MST edges + 1 extra edge = 3 total
      expect(result.length).toBe(3);

      // Check that the extra edge is [0, 2]
      const hasExtraEdge = result.some(
        ([a, b]) => (a === 0 && b === 2) || (a === 2 && b === 0),
      );
      expect(hasExtraEdge).toBe(true);
    });

    it("prefers lower weight non-MST edges", () => {
      const mstEdges: [number, number][] = [[0, 1]];
      const allEdges: RoomEdge[] = [
        { from: 0, to: 1, weight: 1 },
        { from: 0, to: 2, weight: 2 },
        { from: 0, to: 3, weight: 10 },
      ];

      const result = addExtraEdges(mstEdges, allEdges, 0.5, () => 0.1);

      // Should prefer edge with weight 2 over weight 10
      const hasLowWeightEdge = result.some(
        ([a, b]) => (a === 0 && b === 2) || (a === 2 && b === 0),
      );
      expect(hasLowWeightEdge).toBe(true);
    });
  });

  describe("bfsDistances", () => {
    it("calculates correct distances in linear graph", () => {
      const edges: [number, number][] = [
        [0, 1],
        [1, 2],
        [2, 3],
      ];

      const distances = bfsDistances(4, edges, 0);

      expect(distances.get(0)).toBe(0);
      expect(distances.get(1)).toBe(1);
      expect(distances.get(2)).toBe(2);
      expect(distances.get(3)).toBe(3);
    });

    it("handles graph with loops", () => {
      const edges: [number, number][] = [
        [0, 1],
        [1, 2],
        [2, 0],
      ];

      const distances = bfsDistances(3, edges, 0);

      expect(distances.get(0)).toBe(0);
      expect(distances.get(1)).toBe(1);
      expect(distances.get(2)).toBe(1); // Direct connection via loop
    });

    it("handles single node", () => {
      const distances = bfsDistances(1, [], 0);

      expect(distances.get(0)).toBe(0);
    });

    it("handles disconnected graph", () => {
      const edges: [number, number][] = [
        [0, 1],
        [2, 3],
      ];

      const distances = bfsDistances(4, edges, 0);

      expect(distances.get(0)).toBe(0);
      expect(distances.get(1)).toBe(1);
      // Nodes 2 and 3 are not reachable from 0
      expect(distances.has(2)).toBe(false);
      expect(distances.has(3)).toBe(false);
    });

    it("calculates shortest paths correctly", () => {
      const edges: [number, number][] = [
        [0, 1],
        [1, 2],
        [0, 2], // Shorter path to 2
      ];

      const distances = bfsDistances(3, edges, 0);

      expect(distances.get(0)).toBe(0);
      expect(distances.get(1)).toBe(1);
      expect(distances.get(2)).toBe(1); // Direct path, not via node 1
    });
  });

  describe("buildAdjacencyFromConnections", () => {
    it("builds correct adjacency list", () => {
      const rooms = [
        createRoom(0, 0, 0),
        createRoom(1, 10, 0),
        createRoom(2, 0, 10),
      ];
      const connections = [createConnection(0, 1), createConnection(1, 2)];

      const adjacency = buildAdjacencyFromConnections(rooms, connections);

      expect(adjacency.get(0)).toEqual([1]);
      expect(adjacency.get(1)).toEqual([0, 2]);
      expect(adjacency.get(2)).toEqual([1]);
    });

    it("handles rooms with no connections", () => {
      const rooms = [createRoom(0, 0, 0), createRoom(1, 10, 0)];
      const connections: Connection[] = [];

      const adjacency = buildAdjacencyFromConnections(rooms, connections);

      expect(adjacency.get(0)).toEqual([]);
      expect(adjacency.get(1)).toEqual([]);
    });

    it("handles bidirectional connections correctly", () => {
      const rooms = [createRoom(0, 0, 0), createRoom(1, 10, 0)];
      const connections = [createConnection(0, 1)];

      const adjacency = buildAdjacencyFromConnections(rooms, connections);

      // Both directions should exist
      expect(adjacency.get(0)).toContain(1);
      expect(adjacency.get(1)).toContain(0);
    });
  });

  describe("calculateRoomDistances", () => {
    it("calculates BFS distances from start room", () => {
      const rooms = [
        createRoom(0, 0, 0),
        createRoom(1, 10, 0),
        createRoom(2, 20, 0),
        createRoom(3, 30, 0),
      ];
      const connections = [
        createConnection(0, 1),
        createConnection(1, 2),
        createConnection(2, 3),
      ];

      const distances = calculateRoomDistances(rooms, connections, 0);

      expect(distances.get(0)).toBe(0);
      expect(distances.get(1)).toBe(1);
      expect(distances.get(2)).toBe(2);
      expect(distances.get(3)).toBe(3);
    });

    it("handles unreachable rooms", () => {
      const rooms = [
        createRoom(0, 0, 0),
        createRoom(1, 10, 0),
        createRoom(2, 20, 0), // Disconnected
      ];
      const connections = [createConnection(0, 1)];

      const distances = calculateRoomDistances(rooms, connections, 0);

      expect(distances.get(0)).toBe(0);
      expect(distances.get(1)).toBe(1);
      // Unreachable room gets max distance + 1
      expect(distances.get(2)).toBe(2); // maxDist (1) + 1
    });

    it("finds shortest paths in graphs with loops", () => {
      const rooms = [
        createRoom(0, 0, 0),
        createRoom(1, 10, 0),
        createRoom(2, 20, 0),
      ];
      const connections = [
        createConnection(0, 1),
        createConnection(1, 2),
        createConnection(0, 2), // Direct path
      ];

      const distances = calculateRoomDistances(rooms, connections, 0);

      expect(distances.get(0)).toBe(0);
      expect(distances.get(1)).toBe(1);
      expect(distances.get(2)).toBe(1); // Direct path, not through room 1
    });

    it("handles single room", () => {
      const rooms = [createRoom(0, 0, 0)];
      const connections: Connection[] = [];

      const distances = calculateRoomDistances(rooms, connections, 0);

      expect(distances.get(0)).toBe(0);
    });
  });

  describe("calculateConnectionCounts", () => {
    it("counts connections correctly", () => {
      const rooms = [
        createRoom(0, 0, 0),
        createRoom(1, 10, 0),
        createRoom(2, 0, 10),
      ];
      const connections = [createConnection(0, 1), createConnection(1, 2)];

      const counts = calculateConnectionCounts(rooms, connections);

      expect(counts.get(0)).toBe(1); // One connection
      expect(counts.get(1)).toBe(2); // Two connections
      expect(counts.get(2)).toBe(1); // One connection
    });

    it("handles rooms with no connections", () => {
      const rooms = [createRoom(0, 0, 0), createRoom(1, 10, 0)];
      const connections: Connection[] = [];

      const counts = calculateConnectionCounts(rooms, connections);

      expect(counts.get(0)).toBe(0);
      expect(counts.get(1)).toBe(0);
    });

    it("counts hub rooms correctly", () => {
      const rooms = [
        createRoom(0, 0, 0),
        createRoom(1, 10, 0),
        createRoom(2, 0, 10),
        createRoom(3, 10, 10),
      ];
      const connections = [
        createConnection(0, 1),
        createConnection(0, 2),
        createConnection(0, 3),
      ];

      const counts = calculateConnectionCounts(rooms, connections);

      expect(counts.get(0)).toBe(3); // Hub with 3 connections
      expect(counts.get(1)).toBe(1);
      expect(counts.get(2)).toBe(1);
      expect(counts.get(3)).toBe(1);
    });
  });

  describe("calculateRoomMetadata", () => {
    it("combines distances and connection counts", () => {
      const rooms = [
        createRoom(0, 0, 0, 0),
        createRoom(1, 10, 0),
        createRoom(2, 20, 0),
      ];
      const connections = [createConnection(0, 1), createConnection(1, 2)];

      const metadata = calculateRoomMetadata(rooms, connections);

      const room0 = metadata.get(0);
      expect(room0?.distance).toBe(0);
      expect(room0?.connectionCount).toBe(1);

      const room1 = metadata.get(1);
      expect(room1?.distance).toBe(1);
      expect(room1?.connectionCount).toBe(2);

      const room2 = metadata.get(2);
      expect(room2?.distance).toBe(2);
      expect(room2?.connectionCount).toBe(1);
    });

    it("calculates normalized distances correctly", () => {
      const rooms = [
        createRoom(0, 0, 0, 0),
        createRoom(1, 10, 0),
        createRoom(2, 20, 0),
      ];
      const connections = [createConnection(0, 1), createConnection(1, 2)];

      const metadata = calculateRoomMetadata(rooms, connections);

      expect(metadata.get(0)?.normalizedDistance).toBe(0); // 0/2
      expect(metadata.get(1)?.normalizedDistance).toBe(0.5); // 1/2
      expect(metadata.get(2)?.normalizedDistance).toBe(1); // 2/2
    });

    it("identifies dead-end rooms correctly", () => {
      const rooms = [
        createRoom(0, 0, 0, 0),
        createRoom(1, 10, 0),
        createRoom(2, 20, 0),
      ];
      const connections = [createConnection(0, 1), createConnection(1, 2)];

      const metadata = calculateRoomMetadata(rooms, connections);

      expect(metadata.get(0)?.isDeadEnd).toBe(true); // 1 connection
      expect(metadata.get(1)?.isDeadEnd).toBe(false); // 2 connections
      expect(metadata.get(2)?.isDeadEnd).toBe(true); // 1 connection
    });

    it("identifies hub rooms correctly", () => {
      const rooms = [
        createRoom(0, 0, 0, 0),
        createRoom(1, 10, 0),
        createRoom(2, 0, 10),
        createRoom(3, 10, 10),
      ];
      const connections = [
        createConnection(0, 1),
        createConnection(0, 2),
        createConnection(0, 3),
      ];

      const metadata = calculateRoomMetadata(rooms, connections);

      expect(metadata.get(0)?.isHub).toBe(true); // 3 connections
      expect(metadata.get(1)?.isHub).toBe(false); // 1 connection
      expect(metadata.get(2)?.isHub).toBe(false); // 1 connection
      expect(metadata.get(3)?.isHub).toBe(false); // 1 connection
    });

    it("uses provided entrance room ID", () => {
      const rooms = [
        createRoom(0, 0, 0, 1),
        createRoom(1, 10, 0, 0), // distanceFromEntrance=0 marks this as entrance
        createRoom(2, 20, 0, 2),
      ];
      const connections = [createConnection(0, 1), createConnection(1, 2)];

      // Calculate from room 1 instead of room 0
      const metadata = calculateRoomMetadata(rooms, connections, 1);

      expect(metadata.get(1)?.distance).toBe(0);
      expect(metadata.get(0)?.distance).toBe(1);
      expect(metadata.get(2)?.distance).toBe(1);
    });

    it("defaults to room with distanceFromEntrance=0 when no ID provided", () => {
      const rooms = [
        createRoom(0, 0, 0, 1),
        createRoom(1, 10, 0, 0), // distanceFromEntrance=0 marks this as entrance
        createRoom(2, 20, 0, 2),
      ];
      const connections = [createConnection(0, 1), createConnection(1, 2)];

      const metadata = calculateRoomMetadata(rooms, connections);

      // Should use room 1 (distanceFromEntrance=0) as start
      expect(metadata.get(1)?.distance).toBe(0);
    });

    it("handles single room", () => {
      const rooms = [createRoom(0, 0, 0, 0)];
      const connections: Connection[] = [];

      const metadata = calculateRoomMetadata(rooms, connections);

      const room0 = metadata.get(0);
      expect(room0?.distance).toBe(0);
      expect(room0?.connectionCount).toBe(0);
      expect(room0?.normalizedDistance).toBe(0);
      expect(room0?.isDeadEnd).toBe(false); // 0 connections, not 1
      expect(room0?.isHub).toBe(false);
    });
  });
});
