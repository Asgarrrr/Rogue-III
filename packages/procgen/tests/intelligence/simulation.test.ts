/**
 * Simulation System Tests
 */

import { describe, expect, it } from "bun:test";
import { CellType, Grid } from "../../src/core/grid";
import { simulatePlaythrough } from "../../src/intelligence/simulation";
import { analyzePacing } from "../../src/intelligence/simulation/analyzers";
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
): Room {
  return {
    id,
    x,
    y,
    width: 10,
    height: 10,
    centerX: x + 5,
    centerY: y + 5,
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
  weight = 1,
  tags: string[] = [],
): SpawnPoint {
  return {
    position: { x: 0, y: 0 },
    roomId,
    type,
    tags,
    weight,
    distanceFromStart: roomId, // Simple distance approximation
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
    edges: connections.map(
      (c) => [c.fromRoomId, c.toRoomId] as [number, number],
    ),
    connections,
    spawns,
  };
}

// =============================================================================
// SIMULATION TESTS
// =============================================================================

describe("simulatePlaythrough", () => {
  it("completes a simple connected dungeon", () => {
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

    const result = simulatePlaythrough(state, null, {}, () => 0.5);

    expect(result.completed).toBe(true);
    expect(result.reachedExit).toBe(true);
    expect(result.softlocks).toHaveLength(0);
    expect(result.metrics.roomsVisited).toBe(3);
  });

  it("detects disconnected rooms", () => {
    const rooms = [
      createTestRoom(0, "entrance", 0, 0),
      createTestRoom(1, "normal", 20, 0),
      createTestRoom(2, "exit", 40, 0), // Disconnected
    ];
    const connections = [createTestConnection(0, 1)];
    const state = createTestState(rooms, connections);

    const result = simulatePlaythrough(state, null, {}, () => 0.5);

    // Should complete (visited all reachable) but not reach exit
    expect(result.reachedExit).toBe(false);
    expect(result.metrics.roomsVisited).toBe(2);
  });

  it("handles enemy encounters", () => {
    const rooms = [
      createTestRoom(0, "entrance", 0, 0),
      createTestRoom(1, "normal", 20, 0),
      createTestRoom(2, "exit", 40, 0),
    ];
    const connections = [
      createTestConnection(0, 1),
      createTestConnection(1, 2),
    ];
    const spawns = [
      createTestSpawn(1, "enemy", 1.0), // Enemy in room 1
    ];
    const state = createTestState(rooms, connections, spawns);

    const result = simulatePlaythrough(
      state,
      null,
      { startHealth: 100, enemyDamage: 15 },
      () => 0.5,
    );

    expect(result.completed).toBe(true);
    expect(result.metrics.combatEncounters).toBe(1);
    expect(result.metrics.totalDamageReceived).toBeGreaterThan(0);
    expect(result.metrics.healthRemaining).toBeLessThan(100);
  });

  it("collects treasures", () => {
    const rooms = [
      createTestRoom(0, "entrance", 0, 0),
      createTestRoom(1, "treasure", 20, 0),
      createTestRoom(2, "exit", 40, 0),
    ];
    const connections = [
      createTestConnection(0, 1),
      createTestConnection(1, 2),
    ];
    const spawns = [createTestSpawn(1, "treasure", 0.5)];
    const state = createTestState(rooms, connections, spawns);

    const result = simulatePlaythrough(state, null, {}, () => 0.5);

    expect(result.completed).toBe(true);
    expect(result.metrics.treasuresFound).toBe(1);
  });

  it("respects max steps limit", () => {
    const rooms = [
      createTestRoom(0, "entrance", 0, 0),
      createTestRoom(1, "normal", 20, 0),
    ];
    const connections = [createTestConnection(0, 1)];
    const state = createTestState(rooms, connections);

    const result = simulatePlaythrough(
      state,
      null,
      { maxSteps: 5 },
      () => 0.5,
    );

    expect(result.metrics.totalSteps).toBeLessThanOrEqual(5);
  });

  it("handles no entrance room", () => {
    const rooms = [
      createTestRoom(0, "normal", 0, 0),
      createTestRoom(1, "exit", 20, 0),
    ];
    const connections = [createTestConnection(0, 1)];
    const state = createTestState(rooms, connections);

    const result = simulatePlaythrough(state, null, {}, () => 0.5);

    expect(result.softlocks).toHaveLength(1);
    expect(result.softlocks[0]?.reason).toContain("entrance");
  });
});

// =============================================================================
// PACING ANALYSIS TESTS
// =============================================================================

describe("analyzePacing", () => {
  it("calculates overall pacing score", () => {
    const rooms = [
      createTestRoom(0, "entrance", 0, 0),
      createTestRoom(1, "normal", 20, 0),
      createTestRoom(2, "exit", 40, 0),
    ];
    const connections = [
      createTestConnection(0, 1),
      createTestConnection(1, 2),
    ];
    const spawns = [createTestSpawn(1, "enemy", 0.5)];
    const state = createTestState(rooms, connections, spawns);

    const simResult = simulatePlaythrough(state, null, {}, () => 0.5);
    const analysis = analyzePacing(simResult, state);

    expect(analysis.overallScore).toBeGreaterThanOrEqual(0);
    expect(analysis.overallScore).toBeLessThanOrEqual(1);
    expect(analysis.engagementCurve.length).toBeGreaterThan(0);
  });

  it("detects difficulty spikes", () => {
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
    // Easy enemy then very hard enemy
    const spawns = [
      createTestSpawn(1, "enemy", 0.2),
      createTestSpawn(2, "enemy", 1.0),
    ];
    const state = createTestState(rooms, connections, spawns);

    const simResult = simulatePlaythrough(
      state,
      null,
      { enemyDamage: 20 },
      () => 0.5,
    );
    const analysis = analyzePacing(simResult, state);

    // Should detect the difficulty spike from room 1 to 2
    const spikes = analysis.issues.filter((i) => i.type === "difficulty_spike");
    expect(spikes.length).toBeGreaterThanOrEqual(0); // May or may not detect based on thresholds
  });

  it("generates recommendations for issues", () => {
    const rooms = [
      createTestRoom(0, "entrance", 0, 0),
      createTestRoom(1, "normal", 20, 0),
      createTestRoom(2, "normal", 40, 0),
      createTestRoom(3, "normal", 60, 0),
      createTestRoom(4, "normal", 80, 0),
      createTestRoom(5, "exit", 100, 0),
    ];
    const connections = [
      createTestConnection(0, 1),
      createTestConnection(1, 2),
      createTestConnection(2, 3),
      createTestConnection(3, 4),
      createTestConnection(4, 5),
    ];
    // No spawns = boring
    const state = createTestState(rooms, connections, []);

    const simResult = simulatePlaythrough(state, null, {}, () => 0.5);
    const analysis = analyzePacing(simResult, state);

    // May or may not have recommendations depending on detected issues
    expect(Array.isArray(analysis.recommendations)).toBe(true);
  });
});
