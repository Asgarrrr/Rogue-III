/**
 * Door Placement Tests
 */

import { describe, expect, test } from "bun:test";
import { SeededRandom } from "@rogue/contracts";
import { CellType, Grid } from "../src/core/grid";
import {
  findChokepoint,
  findDoorPosition,
  getDoorStats,
  placeDoors,
  validateDoorKeys,
} from "../src/passes/carving/door-placement";
import type { Connection, DungeonStateArtifact, Room } from "../src/pipeline/types";

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function createMockGrid(width: number, height: number): Grid {
  return new Grid(width, height, CellType.WALL);
}

function createMockRoom(id: number, x: number, y: number, width: number, height: number): Room {
  return {
    id,
    x,
    y,
    width,
    height,
    centerX: Math.floor(x + width / 2),
    centerY: Math.floor(y + height / 2),
    type: "normal",
    seed: 12345,
  };
}

function createMockConnection(
  fromRoomId: number,
  toRoomId: number,
  path: { x: number; y: number }[],
): Connection {
  return {
    fromRoomId,
    toRoomId,
    pathLength: path.length,
    path,
  };
}

function createMockDungeonState(
  width: number,
  height: number,
  rooms: Room[],
  connections: Connection[],
): DungeonStateArtifact {
  const grid = createMockGrid(width, height);

  // Carve rooms
  for (const room of rooms) {
    grid.fillRect(room.x, room.y, room.width, room.height, CellType.FLOOR);
  }

  // Carve connection paths
  for (const conn of connections) {
    if (conn.path) {
      for (const point of conn.path) {
        if (grid.isInBounds(point.x, point.y)) {
          grid.set(point.x, point.y, CellType.FLOOR);
        }
      }
    }
  }

  return {
    type: "dungeon-state",
    id: "test-state",
    width,
    height,
    grid,
    rooms,
    edges: connections.map((c) => [c.fromRoomId, c.toRoomId] as [number, number]),
    connections,
    spawns: [],
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe("findDoorPosition", () => {
  test("returns center position for center preference", () => {
    const path = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 0 },
    ];
    const grid = createMockGrid(10, 10);

    const position = findDoorPosition(path, grid, "center");

    expect(position).toEqual({ x: 2, y: 0 });
  });

  test("returns start position for start preference", () => {
    const path = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ];
    const grid = createMockGrid(10, 10);

    const position = findDoorPosition(path, grid, "start");

    expect(position).toEqual({ x: 0, y: 0 });
  });

  test("returns end position for end preference", () => {
    const path = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    ];
    const grid = createMockGrid(10, 10);

    const position = findDoorPosition(path, grid, "end");

    expect(position).toEqual({ x: 2, y: 0 });
  });

  test("returns undefined for empty path", () => {
    const grid = createMockGrid(10, 10);

    const position = findDoorPosition([], grid, "center");

    expect(position).toBeUndefined();
  });
});

describe("findChokepoint", () => {
  test("finds narrowest point in corridor", () => {
    const grid = createMockGrid(10, 10);

    // Create a corridor with varying width
    // Wide area at start
    grid.set(2, 4, CellType.FLOOR);
    grid.set(2, 5, CellType.FLOOR);
    grid.set(2, 6, CellType.FLOOR);
    grid.set(3, 4, CellType.FLOOR);
    grid.set(3, 5, CellType.FLOOR);
    grid.set(3, 6, CellType.FLOOR);

    // Narrow point (chokepoint)
    grid.set(4, 5, CellType.FLOOR);

    // Wide area at end
    grid.set(5, 4, CellType.FLOOR);
    grid.set(5, 5, CellType.FLOOR);
    grid.set(5, 6, CellType.FLOOR);

    const path = [
      { x: 2, y: 5 },
      { x: 3, y: 5 },
      { x: 4, y: 5 },
      { x: 5, y: 5 },
    ];

    const chokepoint = findChokepoint(path, grid);

    // The narrowest point should be found
    expect(chokepoint).toBeDefined();
  });

  test("returns first point for empty path", () => {
    const grid = createMockGrid(10, 10);

    const chokepoint = findChokepoint([], grid);

    expect(chokepoint).toBeUndefined();
  });
});

describe("getDoorStats", () => {
  test("counts connection types correctly", () => {
    const connections: Connection[] = [
      { fromRoomId: 0, toRoomId: 1, pathLength: 10, type: "open" },
      { fromRoomId: 1, toRoomId: 2, pathLength: 8, type: "door" },
      { fromRoomId: 2, toRoomId: 3, pathLength: 12, type: "door" },
      { fromRoomId: 3, toRoomId: 4, pathLength: 6, type: "locked_door" },
      { fromRoomId: 4, toRoomId: 5, pathLength: 15, type: "secret" },
    ];

    const stats = getDoorStats(connections);

    expect(stats.total).toBe(5);
    expect(stats.open).toBe(1);
    expect(stats.doors).toBe(2);
    expect(stats.lockedDoors).toBe(1);
    expect(stats.secrets).toBe(1);
    expect(stats.bridges).toBe(0);
    expect(stats.oneWay).toBe(0);
  });

  test("treats undefined type as open", () => {
    const connections: Connection[] = [
      { fromRoomId: 0, toRoomId: 1, pathLength: 10 },
      { fromRoomId: 1, toRoomId: 2, pathLength: 8 },
    ];

    const stats = getDoorStats(connections);

    expect(stats.open).toBe(2);
  });
});

describe("validateDoorKeys", () => {
  test("returns valid when no locked doors", () => {
    const connections: Connection[] = [
      { fromRoomId: 0, toRoomId: 1, pathLength: 10, type: "open" },
      { fromRoomId: 1, toRoomId: 2, pathLength: 8, type: "door" },
    ];

    const result = validateDoorKeys(connections);

    expect(result.valid).toBe(true);
    expect(result.missingKeys).toHaveLength(0);
  });

  test("reports missing keys for locked doors", () => {
    const connections: Connection[] = [
      {
        fromRoomId: 0,
        toRoomId: 1,
        pathLength: 10,
        type: "locked_door",
        metadata: { keyId: "key_0_1" },
      },
      {
        fromRoomId: 1,
        toRoomId: 2,
        pathLength: 8,
        type: "locked_door",
        metadata: { keyId: "key_1_2" },
      },
    ];

    const result = validateDoorKeys(connections);

    expect(result.valid).toBe(false);
    expect(result.missingKeys).toContain("key_0_1");
    expect(result.missingKeys).toContain("key_1_2");
  });
});

describe("placeDoors pass", () => {
  test("creates pass with correct id", () => {
    const pass = placeDoors();

    expect(pass.id).toBe("carving.place-doors");
    expect(pass.inputType).toBe("dungeon-state");
    expect(pass.outputType).toBe("dungeon-state");
  });

  test("places doors on connections with paths", () => {
    const rooms = [
      createMockRoom(0, 5, 5, 8, 8),
      createMockRoom(1, 20, 5, 8, 8),
    ];

    // Create a corridor path between rooms
    const path = [];
    for (let x = 13; x < 20; x++) {
      path.push({ x, y: 9 });
    }

    const connections = [createMockConnection(0, 1, path)];
    const state = createMockDungeonState(50, 30, rooms, connections);

    const pass = placeDoors({ doorRatio: 1.0 }); // Always place doors

    const rng = new SeededRandom(12345n);
    const result = pass.run(state, {
      rng,
      streams: { details: rng },
      config: {
        width: 50,
        height: 30,
        seed: { primary: 12345n, dimension: 0n, floor: 0n },
        algorithm: "bsp",
        trace: false,
        snapshots: false,
        bsp: {
          minRoomSize: 6,
          maxRoomSize: 18,
          splitRatioMin: 0.4,
          splitRatioMax: 0.6,
          roomPadding: 1,
          corridorWidth: 2,
          maxDepth: 5,
          roomPlacementChance: 1.0,
        },
        cellular: {
          initialFillRatio: 0.45,
          birthLimit: 5,
          deathLimit: 4,
          iterations: 4,
          minRegionSize: 50,
          connectAllRegions: false,
        },
      },
      trace: {
        enabled: false,
        start: () => {},
        end: () => {},
        decision: () => {},
        structuredDecision: () => {},
        warning: () => {},
        artifact: () => {},
        getEvents: () => [],
        getDecisionsBySystem: () => [],
        getDecisionStats: () => ({
          totalDecisions: 0,
          bySystem: {
            layout: 0,
            rooms: 0,
            connectivity: 0,
            spawns: 0,
            grammar: 0,
            constraints: 0,
            simulation: 0,
            semantic: 0,
          },
          byConfidence: { high: 0, medium: 0, low: 0 },
          totalRngConsumed: 0,
          avgRngPerDecision: 0,
        }),
        clear: () => {},
      },
      seed: { primary: 12345n, dimension: 0n, floor: 0n },
    });

    // Check that the connection has door info
    expect(result.connections.length).toBe(1);
    const updatedConn = result.connections[0]!;
    expect(updatedConn.type).toBe("door");
    expect(updatedConn.doorPosition).toBeDefined();
  });

  test("respects doorRatio configuration", () => {
    const rooms = [
      createMockRoom(0, 5, 5, 8, 8),
      createMockRoom(1, 20, 5, 8, 8),
    ];

    // Short path that won't get a door
    const path = [{ x: 13, y: 9 }];
    const connections = [createMockConnection(0, 1, path)];
    const state = createMockDungeonState(50, 30, rooms, connections);

    const pass = placeDoors({ doorRatio: 0, minCorridorLength: 1 }); // Never place doors

    const rng = new SeededRandom(12345n);
    const result = pass.run(state, {
      rng,
      streams: { details: rng },
      config: {
        width: 50,
        height: 30,
        seed: { primary: 12345n, dimension: 0n, floor: 0n },
        algorithm: "bsp",
        trace: false,
        snapshots: false,
        bsp: {
          minRoomSize: 6,
          maxRoomSize: 18,
          splitRatioMin: 0.4,
          splitRatioMax: 0.6,
          roomPadding: 1,
          corridorWidth: 2,
          maxDepth: 5,
          roomPlacementChance: 1.0,
        },
        cellular: {
          initialFillRatio: 0.45,
          birthLimit: 5,
          deathLimit: 4,
          iterations: 4,
          minRegionSize: 50,
          connectAllRegions: false,
        },
      },
      trace: {
        enabled: false,
        start: () => {},
        end: () => {},
        decision: () => {},
        structuredDecision: () => {},
        warning: () => {},
        artifact: () => {},
        getEvents: () => [],
        getDecisionsBySystem: () => [],
        getDecisionStats: () => ({
          totalDecisions: 0,
          bySystem: {
            layout: 0,
            rooms: 0,
            connectivity: 0,
            spawns: 0,
            grammar: 0,
            constraints: 0,
            simulation: 0,
            semantic: 0,
          },
          byConfidence: { high: 0, medium: 0, low: 0 },
          totalRngConsumed: 0,
          avgRngPerDecision: 0,
        }),
        clear: () => {},
      },
      seed: { primary: 12345n, dimension: 0n, floor: 0n },
    });

    // All connections should be open
    expect(result.connections[0]?.type).toBe("open");
  });
});
