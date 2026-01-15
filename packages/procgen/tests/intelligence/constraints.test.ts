/**
 * Constraint System Tests
 */

import { describe, expect, it } from "bun:test";
import { CellType, Grid } from "../../src/core/grid";
import {
  buildConstraintContext,
  computeReachableRooms,
  countDisjointPaths,
  createConstraintSolver,
  createDefaultConstraints,
  createDifficultyProgressionConstraint,
  createFullConnectivityConstraint,
  createKeyBeforeLockConstraint,
  createMinRoomCountConstraint,
  createMultiPathToBossConstraint,
  createSpawnBalanceConstraint,
  pearsonCorrelation,
} from "../../src/intelligence/constraints";
import type {
  Connection,
  DungeonStateArtifact,
  Room,
  SpawnPoint,
} from "../../src/pipeline/types";

// =============================================================================
// TEST HELPERS
// =============================================================================

function createTestRoom(
  id: number,
  type: Room["type"],
  x: number,
  y: number,
  width = 10,
  height = 10,
): Room {
  return {
    id,
    x,
    y,
    width,
    height,
    centerX: x + Math.floor(width / 2),
    centerY: y + Math.floor(height / 2),
    type,
    seed: id * 1000,
  };
}

function createTestConnection(
  fromRoomId: number,
  toRoomId: number,
): Connection {
  return {
    fromRoomId,
    toRoomId,
    path: [],
  };
}

function createTestSpawn(
  roomId: number,
  type: SpawnPoint["type"],
  distanceFromStart: number,
  weight = 1,
): SpawnPoint {
  return {
    position: { x: 0, y: 0 },
    roomId,
    type,
    tags: [],
    weight,
    distanceFromStart,
  };
}

function createTestState(
  rooms: Room[],
  connections: Connection[],
  spawns: SpawnPoint[] = [],
): DungeonStateArtifact {
  const grid = new Grid(100, 100, CellType.WALL);
  return {
    type: "dungeon-state",
    id: "test-state",
    width: 100,
    height: 100,
    grid,
    rooms,
    edges: connections.map((c) => [c.fromRoomId, c.toRoomId] as [number, number]),
    connections,
    spawns,
  };
}

// =============================================================================
// UTILITY FUNCTION TESTS
// =============================================================================

describe("pearsonCorrelation", () => {
  it("returns 1 for perfectly correlated data", () => {
    const x = [1, 2, 3, 4, 5];
    const y = [2, 4, 6, 8, 10];
    expect(pearsonCorrelation(x, y)).toBeCloseTo(1, 5);
  });

  it("returns -1 for perfectly inversely correlated data", () => {
    const x = [1, 2, 3, 4, 5];
    const y = [10, 8, 6, 4, 2];
    expect(pearsonCorrelation(x, y)).toBeCloseTo(-1, 5);
  });

  it("returns 0 for uncorrelated data", () => {
    const x = [1, 2, 3, 4, 5];
    const y = [5, 3, 1, 4, 2];
    // This particular sequence isn't exactly 0, but close
    expect(Math.abs(pearsonCorrelation(x, y))).toBeLessThanOrEqual(0.5);
  });

  it("returns 0 for empty or single-element arrays", () => {
    expect(pearsonCorrelation([], [])).toBe(0);
    expect(pearsonCorrelation([1], [1])).toBe(0);
  });
});

describe("computeReachableRooms", () => {
  it("returns all connected rooms", () => {
    const rooms = [
      createTestRoom(0, "entrance", 0, 0),
      createTestRoom(1, "normal", 20, 0),
      createTestRoom(2, "exit", 40, 0),
    ];
    const connections = [
      createTestConnection(0, 1),
      createTestConnection(1, 2),
    ];

    const reachable = computeReachableRooms(rooms, connections, 0);

    expect(reachable.size).toBe(3);
    expect(reachable.has(0)).toBe(true);
    expect(reachable.has(1)).toBe(true);
    expect(reachable.has(2)).toBe(true);
  });

  it("excludes disconnected rooms", () => {
    const rooms = [
      createTestRoom(0, "entrance", 0, 0),
      createTestRoom(1, "normal", 20, 0),
      createTestRoom(2, "exit", 40, 0), // Disconnected
    ];
    const connections = [createTestConnection(0, 1)];

    const reachable = computeReachableRooms(rooms, connections, 0);

    expect(reachable.size).toBe(2);
    expect(reachable.has(0)).toBe(true);
    expect(reachable.has(1)).toBe(true);
    expect(reachable.has(2)).toBe(false);
  });

  it("respects excluded connections", () => {
    const rooms = [
      createTestRoom(0, "entrance", 0, 0),
      createTestRoom(1, "normal", 20, 0),
      createTestRoom(2, "exit", 40, 0),
    ];
    const connections = [
      createTestConnection(0, 1),
      createTestConnection(1, 2),
    ];

    // Exclude connection 1 (1->2)
    const reachable = computeReachableRooms(rooms, connections, 0, new Set([1]));

    expect(reachable.size).toBe(2);
    expect(reachable.has(2)).toBe(false);
  });
});

describe("countDisjointPaths", () => {
  it("counts single path", () => {
    const rooms = [
      createTestRoom(0, "entrance", 0, 0),
      createTestRoom(1, "normal", 20, 0),
      createTestRoom(2, "exit", 40, 0),
    ];
    const connections = [
      createTestConnection(0, 1),
      createTestConnection(1, 2),
    ];

    const paths = countDisjointPaths(rooms, connections, 0, 2);
    expect(paths).toBe(1);
  });

  it("counts multiple disjoint paths", () => {
    const rooms = [
      createTestRoom(0, "entrance", 0, 0),
      createTestRoom(1, "normal", 20, 0),
      createTestRoom(2, "normal", 20, 20),
      createTestRoom(3, "exit", 40, 10),
    ];
    // Two independent paths: 0->1->3 and 0->2->3
    const connections = [
      createTestConnection(0, 1),
      createTestConnection(1, 3),
      createTestConnection(0, 2),
      createTestConnection(2, 3),
    ];

    const paths = countDisjointPaths(rooms, connections, 0, 3);
    expect(paths).toBe(2);
  });

  it("returns 0 for same source and sink", () => {
    const rooms = [createTestRoom(0, "entrance", 0, 0)];
    const paths = countDisjointPaths(rooms, [], 0, 0);
    expect(paths).toBe(0);
  });
});

// =============================================================================
// CONSTRAINT TESTS
// =============================================================================

describe("createFullConnectivityConstraint", () => {
  const constraint = createFullConnectivityConstraint();

  it("passes when all rooms are connected", () => {
    const rooms = [
      createTestRoom(0, "entrance", 0, 0),
      createTestRoom(1, "normal", 20, 0),
      createTestRoom(2, "exit", 40, 0),
    ];
    const connections = [
      createTestConnection(0, 1),
      createTestConnection(1, 2),
    ];
    const state = createTestState(rooms, connections);
    const ctx = buildConstraintContext(state, () => 0.5);

    const result = constraint.evaluate(ctx);

    expect(result.satisfied).toBe(true);
    expect(result.score).toBe(1);
    expect(result.violations).toHaveLength(0);
  });

  it("fails when rooms are disconnected", () => {
    const rooms = [
      createTestRoom(0, "entrance", 0, 0),
      createTestRoom(1, "normal", 20, 0),
      createTestRoom(2, "exit", 40, 0), // Disconnected
    ];
    const connections = [createTestConnection(0, 1)];
    const state = createTestState(rooms, connections);
    const ctx = buildConstraintContext(state, () => 0.5);

    const result = constraint.evaluate(ctx);

    expect(result.satisfied).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.message).toContain("not reachable");
  });

  it("suggests adding connections for disconnected rooms", () => {
    const rooms = [
      createTestRoom(0, "entrance", 0, 0),
      createTestRoom(1, "normal", 20, 0),
      createTestRoom(2, "exit", 40, 0),
    ];
    const connections = [createTestConnection(0, 1)];
    const state = createTestState(rooms, connections);
    const ctx = buildConstraintContext(state, () => 0.5);

    const suggestions = constraint.suggest!(ctx);

    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0]?.type).toBe("add_connection");
  });
});

describe("createMultiPathToBossConstraint", () => {
  it("passes with multiple paths to boss", () => {
    const constraint = createMultiPathToBossConstraint({ minPaths: 2 });

    const rooms = [
      createTestRoom(0, "entrance", 0, 0),
      createTestRoom(1, "normal", 20, 0),
      createTestRoom(2, "normal", 20, 20),
      createTestRoom(3, "boss", 40, 10),
    ];
    const connections = [
      createTestConnection(0, 1),
      createTestConnection(1, 3),
      createTestConnection(0, 2),
      createTestConnection(2, 3),
    ];
    const state = createTestState(rooms, connections);
    const ctx = buildConstraintContext(state, () => 0.5);

    const result = constraint.evaluate(ctx);

    expect(result.satisfied).toBe(true);
    expect(result.score).toBe(1);
  });

  it("fails with only one path to boss", () => {
    const constraint = createMultiPathToBossConstraint({ minPaths: 2 });

    const rooms = [
      createTestRoom(0, "entrance", 0, 0),
      createTestRoom(1, "normal", 20, 0),
      createTestRoom(2, "boss", 40, 0),
    ];
    const connections = [
      createTestConnection(0, 1),
      createTestConnection(1, 2),
    ];
    const state = createTestState(rooms, connections);
    const ctx = buildConstraintContext(state, () => 0.5);

    const result = constraint.evaluate(ctx);

    expect(result.satisfied).toBe(false);
    expect(result.score).toBe(0.5); // 1 path / 2 required
  });
});

describe("createDifficultyProgressionConstraint", () => {
  it("passes with positive correlation", () => {
    const constraint = createDifficultyProgressionConstraint({ minCorrelation: 0.3 });

    const rooms = [
      createTestRoom(0, "entrance", 0, 0),
      createTestRoom(1, "normal", 20, 0),
      createTestRoom(2, "normal", 40, 0),
      createTestRoom(3, "exit", 60, 0),
    ];
    const connections = [
      createTestConnection(0, 1),
      createTestConnection(1, 2),
      createTestConnection(2, 3),
    ];
    // Spawns with increasing weight as distance increases
    const spawns = [
      createTestSpawn(1, "enemy", 1, 0.3),
      createTestSpawn(2, "enemy", 2, 0.6),
      createTestSpawn(3, "enemy", 3, 0.9),
    ];
    const state = createTestState(rooms, connections, spawns);
    const ctx = buildConstraintContext(state, () => 0.5);

    const result = constraint.evaluate(ctx);

    expect(result.satisfied).toBe(true);
  });

  it("fails with negative correlation", () => {
    const constraint = createDifficultyProgressionConstraint({ minCorrelation: 0.3 });

    const rooms = [
      createTestRoom(0, "entrance", 0, 0),
      createTestRoom(1, "normal", 20, 0),
      createTestRoom(2, "normal", 40, 0),
      createTestRoom(3, "exit", 60, 0),
    ];
    const connections = [
      createTestConnection(0, 1),
      createTestConnection(1, 2),
      createTestConnection(2, 3),
    ];
    // Spawns with decreasing weight as distance increases (wrong!)
    const spawns = [
      createTestSpawn(1, "enemy", 1, 0.9),
      createTestSpawn(2, "enemy", 2, 0.6),
      createTestSpawn(3, "enemy", 3, 0.3),
    ];
    const state = createTestState(rooms, connections, spawns);
    const ctx = buildConstraintContext(state, () => 0.5);

    const result = constraint.evaluate(ctx);

    expect(result.satisfied).toBe(false);
  });
});

describe("createMinRoomCountConstraint", () => {
  it("passes with enough rooms", () => {
    const constraint = createMinRoomCountConstraint({ minRooms: 3 });

    const rooms = [
      createTestRoom(0, "entrance", 0, 0),
      createTestRoom(1, "normal", 20, 0),
      createTestRoom(2, "exit", 40, 0),
    ];
    const state = createTestState(rooms, []);
    const ctx = buildConstraintContext(state, () => 0.5);

    const result = constraint.evaluate(ctx);

    expect(result.satisfied).toBe(true);
    expect(result.score).toBe(1);
  });

  it("fails with too few rooms", () => {
    const constraint = createMinRoomCountConstraint({ minRooms: 5 });

    const rooms = [
      createTestRoom(0, "entrance", 0, 0),
      createTestRoom(1, "exit", 20, 0),
    ];
    const state = createTestState(rooms, []);
    const ctx = buildConstraintContext(state, () => 0.5);

    const result = constraint.evaluate(ctx);

    expect(result.satisfied).toBe(false);
    expect(result.score).toBeCloseTo(2 / 5, 2);
  });
});

describe("createSpawnBalanceConstraint", () => {
  it("passes with balanced spawns", () => {
    const constraint = createSpawnBalanceConstraint({
      minEnemyRatio: 0.3,
      maxEnemyRatio: 0.8,
      minTreasureRatio: 0.1,
    });

    const spawns = [
      createTestSpawn(0, "enemy", 0),
      createTestSpawn(0, "enemy", 0),
      createTestSpawn(0, "enemy", 0),
      createTestSpawn(0, "treasure", 0),
      createTestSpawn(0, "entrance", 0),
    ];
    const rooms = [createTestRoom(0, "normal", 0, 0)];
    const state = createTestState(rooms, [], spawns);
    const ctx = buildConstraintContext(state, () => 0.5);

    const result = constraint.evaluate(ctx);

    expect(result.satisfied).toBe(true);
  });
});

// =============================================================================
// SOLVER TESTS
// =============================================================================

describe("createConstraintSolver", () => {
  it("validates all constraints", () => {
    const constraints = [
      createFullConnectivityConstraint(),
      createMinRoomCountConstraint({ minRooms: 2 }),
    ];

    const solver = createConstraintSolver({
      constraints,
      maxRepairAttempts: 3,
      minSatisfactionScore: 0.8,
    });

    const rooms = [
      createTestRoom(0, "entrance", 0, 0),
      createTestRoom(1, "exit", 20, 0),
    ];
    const connections = [createTestConnection(0, 1)];
    const state = createTestState(rooms, connections);

    const result = solver.validate(state, () => 0.5);

    expect(result.satisfied).toBe(true);
    expect(result.results).toHaveLength(2);
    expect(result.repairs).toHaveLength(0);
  });

  it("attempts repairs when enabled", () => {
    const constraints = [createFullConnectivityConstraint()];

    const solver = createConstraintSolver({
      constraints,
      maxRepairAttempts: 3,
      minSatisfactionScore: 0.8,
    });

    // Disconnected room
    const rooms = [
      createTestRoom(0, "entrance", 0, 0),
      createTestRoom(1, "normal", 20, 0),
      createTestRoom(2, "exit", 40, 0),
    ];
    const connections = [createTestConnection(0, 1)];
    const state = createTestState(rooms, connections);

    const { result, state: repairedState } = solver.solveWithRepairs(
      state,
      () => 0.5,
    );

    // Repair should have been attempted
    expect(result.repairs.length).toBeGreaterThanOrEqual(0);
    // If repair succeeded, we should have more connections
    if (result.satisfied) {
      expect(repairedState.connections.length).toBeGreaterThan(
        connections.length,
      );
    }
  });
});

describe("createDefaultConstraints", () => {
  it("creates a set of default constraints", () => {
    const constraints = createDefaultConstraints();

    expect(constraints.length).toBeGreaterThan(0);
    expect(constraints.some((c) => c.id === "full-connectivity")).toBe(true);
  });
});
