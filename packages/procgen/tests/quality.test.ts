/**
 * Quality Assessment Tests
 *
 * Comprehensive test suite for dungeon quality assessment utilities.
 */

import { describe, expect, it } from "bun:test";
import { createSeed, generate } from "../src";
import { CellType } from "../src/core/grid";
import type {
  Connection,
  DungeonArtifact,
  Room,
  SpawnPoint,
} from "../src/pipeline/types";
import { assessQuality, DEFAULT_QUALITY_THRESHOLDS } from "../src/quality";

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Create a minimal dungeon artifact for testing
 */
function createMinimalDungeon(
  width: number = 20,
  height: number = 20,
  rooms: Room[] = [],
  connections: Connection[] = [],
  spawns: SpawnPoint[] = [],
): DungeonArtifact {
  const terrain = new Uint8Array(width * height);
  terrain.fill(CellType.WALL);

  return {
    type: "dungeon",
    id: "test-dungeon",
    width,
    height,
    terrain,
    rooms,
    connections,
    spawns,
    checksum: "test-checksum",
    seed: createSeed(12345),
  };
}

/**
 * Create a simple room definition
 */
function createRoom(
  id: number,
  x: number,
  y: number,
  width: number,
  height: number,
): Room {
  return {
    id,
    x,
    y,
    width,
    height,
    centerX: x + Math.floor(width / 2),
    centerY: y + Math.floor(height / 2),
    type: "normal",
    seed: id,
  };
}

/**
 * Create a connection between two rooms
 */
function createConnection(fromRoomId: number, toRoomId: number): Connection {
  return {
    fromRoomId,
    toRoomId,
    pathLength: 2,
    path: [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
    ],
  };
}

/**
 * Create a spawn point
 */
function createSpawn(
  x: number,
  y: number,
  type: "entrance" | "exit" = "entrance",
  roomId: number = 0,
): SpawnPoint {
  return {
    position: { x, y },
    roomId,
    type,
    tags: [],
    weight: 1.0,
    distanceFromStart: 0,
  };
}

/**
 * Fill dungeon terrain with floor tiles in specified rooms
 */
function fillRoomsWithFloor(dungeon: DungeonArtifact): DungeonArtifact {
  const terrain = new Uint8Array(dungeon.terrain);

  for (const room of dungeon.rooms) {
    for (let y = room.y; y < room.y + room.height; y++) {
      for (let x = room.x; x < room.x + room.width; x++) {
        terrain[y * dungeon.width + x] = CellType.FLOOR;
      }
    }
  }

  return { ...dungeon, terrain };
}

// =============================================================================
// TESTS
// =============================================================================

describe("assessQuality", () => {
  describe("basic functionality", () => {
    it("returns QualityAssessment with score", () => {
      const dungeon = createMinimalDungeon();
      const result = assessQuality(dungeon);

      expect(result).toBeDefined();
      expect(result.success).toBeDefined();
      expect(result.checks).toBeDefined();
      expect(result.score).toBeDefined();
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    });

    it("returns individual check results", () => {
      const dungeon = createMinimalDungeon();
      const result = assessQuality(dungeon);

      expect(result.checks.length).toBeGreaterThan(0);
      for (const check of result.checks) {
        expect(check).toHaveProperty("name");
        expect(check).toHaveProperty("success");
        expect(check).toHaveProperty("value");
        expect(check).toHaveProperty("threshold");
        expect(check).toHaveProperty("message");
      }
    });

    it("calculates score as percentage of passed checks", () => {
      const rooms = [
        createRoom(0, 2, 2, 5, 5),
        createRoom(1, 10, 2, 5, 5),
        createRoom(2, 2, 10, 5, 5),
      ];
      const connections = [createConnection(0, 1), createConnection(1, 2)];
      const spawns = [createSpawn(3, 3, "entrance", 0)];

      let dungeon = createMinimalDungeon(20, 20, rooms, connections, spawns);
      dungeon = fillRoomsWithFloor(dungeon);

      const result = assessQuality(dungeon);

      const passedChecks = result.checks.filter((c) => c.success).length;
      const expectedScore = Math.round(
        (passedChecks / result.checks.length) * 100,
      );

      expect(result.score).toBe(expectedScore);
    });
  });

  describe("room count checks", () => {
    it("passes when room count is within range", () => {
      const rooms = [
        createRoom(0, 2, 2, 5, 5),
        createRoom(1, 10, 2, 5, 5),
        createRoom(2, 2, 10, 5, 5),
        createRoom(3, 10, 10, 5, 5),
      ];

      const dungeon = createMinimalDungeon(20, 20, rooms);
      const result = assessQuality(dungeon);

      const minCheck = result.checks.find((c) => c.name === "room-count-min");
      const maxCheck = result.checks.find((c) => c.name === "room-count-max");

      expect(minCheck?.success).toBe(true);
      expect(maxCheck?.success).toBe(true);
    });

    it("fails when room count is below minimum", () => {
      const rooms = [createRoom(0, 2, 2, 5, 5)]; // Only 1 room
      const dungeon = createMinimalDungeon(20, 20, rooms);
      const result = assessQuality(dungeon);

      const minCheck = result.checks.find((c) => c.name === "room-count-min");

      expect(minCheck?.success).toBe(false);
      expect(minCheck?.value).toBe(1);
      expect(minCheck?.threshold).toBe(DEFAULT_QUALITY_THRESHOLDS.minRooms);
      expect(minCheck?.message).toContain("below minimum");
    });

    it("fails when room count exceeds maximum", () => {
      const rooms = Array.from({ length: 150 }, (_, i) =>
        createRoom(i, 0, 0, 1, 1),
      );
      const dungeon = createMinimalDungeon(200, 200, rooms);
      const result = assessQuality(dungeon);

      const maxCheck = result.checks.find((c) => c.name === "room-count-max");

      expect(maxCheck?.success).toBe(false);
      expect(maxCheck?.value).toBe(150);
      expect(maxCheck?.threshold).toBe(DEFAULT_QUALITY_THRESHOLDS.maxRooms);
      expect(maxCheck?.message).toContain("exceeds maximum");
    });
  });

  describe("floor ratio checks", () => {
    it("passes when floor ratio is within range", () => {
      const rooms = [
        createRoom(0, 2, 2, 8, 8),
        createRoom(1, 12, 2, 8, 8),
        createRoom(2, 2, 12, 8, 8),
        createRoom(3, 12, 12, 8, 8),
      ];

      let dungeon = createMinimalDungeon(40, 40, rooms);
      dungeon = fillRoomsWithFloor(dungeon);

      const result = assessQuality(dungeon);

      const minCheck = result.checks.find((c) => c.name === "floor-ratio-min");
      const maxCheck = result.checks.find((c) => c.name === "floor-ratio-max");

      expect(minCheck?.success).toBe(true);
      expect(maxCheck?.success).toBe(true);
    });

    it("fails when floor ratio is too low", () => {
      const rooms = [createRoom(0, 2, 2, 2, 2)]; // Very small room
      let dungeon = createMinimalDungeon(100, 100, rooms);
      dungeon = fillRoomsWithFloor(dungeon);

      const result = assessQuality(dungeon);

      const minCheck = result.checks.find((c) => c.name === "floor-ratio-min");

      expect(minCheck?.success).toBe(false);
      expect(minCheck?.message).toContain("too low");
    });

    it("fails when floor ratio is too high", () => {
      const rooms = [createRoom(0, 0, 0, 90, 90)]; // Almost entire dungeon
      let dungeon = createMinimalDungeon(100, 100, rooms);
      dungeon = fillRoomsWithFloor(dungeon);

      const result = assessQuality(dungeon);

      const maxCheck = result.checks.find((c) => c.name === "floor-ratio-max");

      expect(maxCheck?.success).toBe(false);
      expect(maxCheck?.message).toContain("too high");
    });

    it("handles empty dungeon (no floor tiles)", () => {
      const dungeon = createMinimalDungeon();
      const result = assessQuality(dungeon);

      const minCheck = result.checks.find((c) => c.name === "floor-ratio-min");

      expect(minCheck?.value).toBe(0);
    });
  });

  describe("average room size check", () => {
    it("passes when average room size meets minimum", () => {
      const rooms = [
        createRoom(0, 2, 2, 5, 5), // 25 tiles
        createRoom(1, 10, 2, 4, 4), // 16 tiles
        createRoom(2, 2, 10, 6, 6), // 36 tiles
      ]; // Average: (25 + 16 + 36) / 3 = 25.67

      const dungeon = createMinimalDungeon(20, 20, rooms);
      const result = assessQuality(dungeon);

      const check = result.checks.find((c) => c.name === "avg-room-size");

      expect(check?.success).toBe(true);
      expect(check?.value).toBeCloseTo(25.67, 1);
    });

    it("fails when average room size is too small", () => {
      const rooms = [
        createRoom(0, 2, 2, 2, 2), // 4 tiles
        createRoom(1, 6, 2, 2, 2), // 4 tiles
        createRoom(2, 10, 2, 2, 2), // 4 tiles
      ]; // Average: 4 tiles (below default minimum of 16)

      const dungeon = createMinimalDungeon(20, 20, rooms);
      const result = assessQuality(dungeon);

      const check = result.checks.find((c) => c.name === "avg-room-size");

      expect(check?.success).toBe(false);
      expect(check?.value).toBe(4);
      expect(check?.message).toContain("too small");
    });

    it("returns 0 for dungeon with no rooms", () => {
      const dungeon = createMinimalDungeon();
      const result = assessQuality(dungeon);

      const check = result.checks.find((c) => c.name === "avg-room-size");

      expect(check?.value).toBe(0);
    });
  });

  describe("dead-end ratio check", () => {
    it("passes when dead-end ratio is acceptable", () => {
      const rooms = [
        createRoom(0, 2, 2, 5, 5),
        createRoom(1, 10, 2, 5, 5),
        createRoom(2, 2, 10, 5, 5),
        createRoom(3, 10, 10, 5, 5),
      ];
      const connections = [
        createConnection(0, 1),
        createConnection(1, 2),
        createConnection(2, 3),
        createConnection(3, 0), // Creates a cycle, no dead-ends
      ];

      const dungeon = createMinimalDungeon(20, 20, rooms, connections);
      const result = assessQuality(dungeon);

      const check = result.checks.find((c) => c.name === "dead-end-ratio");

      expect(check?.success).toBe(true);
      expect(check?.value).toBe(0); // No dead-ends
    });

    it("fails when dead-end ratio is too high", () => {
      const rooms = [
        createRoom(0, 2, 2, 5, 5),
        createRoom(1, 10, 2, 5, 5),
        createRoom(2, 2, 10, 5, 5),
        createRoom(3, 10, 10, 5, 5),
      ];
      const connections = [
        createConnection(0, 1), // Room 0: 1 connection (dead-end)
        createConnection(1, 2), // Room 1: 2 connections
        createConnection(1, 3), // Room 2: 1 connection (dead-end)
        // Room 3: 1 connection (dead-end)
      ]; // 3 out of 4 rooms are dead-ends = 75%

      const dungeon = createMinimalDungeon(20, 20, rooms, connections);
      const result = assessQuality(dungeon);

      const check = result.checks.find((c) => c.name === "dead-end-ratio");

      expect(check?.success).toBe(false);
      expect(check?.value).toBe(0.75);
      expect(check?.message).toContain("too high");
    });

    it("returns 0 for single room or no rooms", () => {
      const dungeon = createMinimalDungeon(20, 20, [createRoom(0, 2, 2, 5, 5)]);
      const result = assessQuality(dungeon);

      const check = result.checks.find((c) => c.name === "dead-end-ratio");

      expect(check?.value).toBe(0);
    });

    it("correctly counts connections for each room", () => {
      const rooms = [
        createRoom(0, 2, 2, 5, 5),
        createRoom(1, 10, 2, 5, 5),
        createRoom(2, 2, 10, 5, 5),
      ];
      const connections = [
        createConnection(0, 1),
        createConnection(0, 2),
        // Room 0: 2 connections
        // Room 1: 1 connection (dead-end)
        // Room 2: 1 connection (dead-end)
      ]; // 2 out of 3 rooms are dead-ends = 66.67%

      const dungeon = createMinimalDungeon(20, 20, rooms, connections);
      const result = assessQuality(dungeon);

      const check = result.checks.find((c) => c.name === "dead-end-ratio");

      expect(check?.value).toBeCloseTo(0.667, 2);
    });
  });

  describe("full connectivity check", () => {
    it("passes when all rooms are reachable from entrance", () => {
      const rooms = [
        createRoom(0, 2, 2, 5, 5),
        createRoom(1, 9, 2, 5, 5),
        createRoom(2, 2, 9, 5, 5),
      ];
      const connections = [createConnection(0, 1), createConnection(1, 2)];
      const spawns = [createSpawn(4, 4, "entrance", 0)];

      let dungeon = createMinimalDungeon(20, 20, rooms, connections, spawns);
      dungeon = fillRoomsWithFloor(dungeon);

      // Add corridor connections
      for (let x = 7; x < 9; x++) {
        dungeon.terrain[4 * dungeon.width + x] = CellType.FLOOR;
      }
      for (let y = 7; y < 9; y++) {
        dungeon.terrain[y * dungeon.width + 4] = CellType.FLOOR;
      }

      const result = assessQuality(dungeon);

      const check = result.checks.find((c) => c.name === "full-connectivity");

      expect(check).toBeDefined();
      expect(check?.success).toBe(true);
      expect(check?.value).toBe(1);
      expect(check?.message).toContain("reachable");
    });

    it("fails when some rooms are unreachable", () => {
      const rooms = [
        createRoom(0, 2, 2, 5, 5),
        createRoom(1, 12, 12, 5, 5), // Isolated room
      ];
      const spawns = [createSpawn(4, 4, "entrance", 0)];

      let dungeon = createMinimalDungeon(20, 20, rooms, [], spawns);
      dungeon = fillRoomsWithFloor(dungeon);

      const result = assessQuality(dungeon);

      const check = result.checks.find((c) => c.name === "full-connectivity");

      expect(check).toBeDefined();
      expect(check?.success).toBe(false);
      expect(check?.value).toBeLessThan(1);
      expect(check?.message).toContain("Only");
    });

    it("fails when no entrance spawn point exists", () => {
      const rooms = [createRoom(0, 2, 2, 5, 5)];
      const dungeon = createMinimalDungeon(20, 20, rooms);

      const result = assessQuality(dungeon);

      const check = result.checks.find((c) => c.name === "full-connectivity");

      expect(check).toBeDefined();
      expect(check?.success).toBe(false);
      expect(check?.message).toContain("No entrance");
    });

    it("is not checked when requireFullConnectivity is false", () => {
      const dungeon = createMinimalDungeon();
      const result = assessQuality(dungeon, {
        requireFullConnectivity: false,
      });

      const check = result.checks.find((c) => c.name === "full-connectivity");

      expect(check).toBeUndefined();
    });
  });

  describe("entrance/exit path length checks", () => {
    it("passes when entrance->exit path length is within bounds", () => {
      const rooms = [createRoom(0, 1, 1, 18, 18)];
      const spawns = [
        createSpawn(2, 2, "entrance", 0),
        createSpawn(17, 17, "exit", 0),
      ];

      let dungeon = createMinimalDungeon(20, 20, rooms, [], spawns);
      dungeon = fillRoomsWithFloor(dungeon);

      const result = assessQuality(dungeon);

      const minCheck = result.checks.find(
        (c) => c.name === "entrance-exit-path-min",
      );
      const maxCheck = result.checks.find(
        (c) => c.name === "entrance-exit-path-max",
      );

      expect(minCheck?.success).toBe(true);
      expect(maxCheck?.success).toBe(true);
    });

    it("fails when entrance->exit path is too short", () => {
      const rooms = [createRoom(0, 1, 1, 18, 18)];
      const spawns = [
        createSpawn(2, 2, "entrance", 0),
        createSpawn(3, 2, "exit", 0),
      ];

      let dungeon = createMinimalDungeon(20, 20, rooms, [], spawns);
      dungeon = fillRoomsWithFloor(dungeon);

      const result = assessQuality(dungeon);
      const minCheck = result.checks.find(
        (c) => c.name === "entrance-exit-path-min",
      );

      expect(minCheck?.success).toBe(false);
      expect(minCheck?.value).toBe(1);
    });

    it("fails when entrance and exit are disconnected", () => {
      const rooms = [createRoom(0, 2, 2, 5, 5), createRoom(1, 12, 12, 5, 5)];
      const spawns = [
        createSpawn(3, 3, "entrance", 0),
        createSpawn(13, 13, "exit", 1),
      ];

      let dungeon = createMinimalDungeon(20, 20, rooms, [], spawns);
      dungeon = fillRoomsWithFloor(dungeon);

      const result = assessQuality(dungeon);
      const minCheck = result.checks.find(
        (c) => c.name === "entrance-exit-path-min",
      );

      expect(minCheck?.success).toBe(false);
      expect(minCheck?.message).toContain("No walkable path");
    });

    it("respects custom maxEntranceExitPathFloorRatio threshold", () => {
      const rooms = [createRoom(0, 1, 1, 18, 18)];
      const spawns = [
        createSpawn(2, 2, "entrance", 0),
        createSpawn(17, 17, "exit", 0),
      ];

      let dungeon = createMinimalDungeon(20, 20, rooms, [], spawns);
      dungeon = fillRoomsWithFloor(dungeon);

      const result = assessQuality(dungeon, {
        maxEntranceExitPathFloorRatio: 0.05,
      });
      const maxCheck = result.checks.find(
        (c) => c.name === "entrance-exit-path-max",
      );

      expect(maxCheck?.success).toBe(false);
    });
  });

  describe("custom thresholds", () => {
    it("uses custom minRooms threshold", () => {
      const rooms = [createRoom(0, 2, 2, 5, 5)];
      const dungeon = createMinimalDungeon(20, 20, rooms);

      const result = assessQuality(dungeon, { minRooms: 1 });

      const check = result.checks.find((c) => c.name === "room-count-min");

      expect(check?.success).toBe(true);
      expect(check?.threshold).toBe(1);
    });

    it("uses custom maxRooms threshold", () => {
      const rooms = Array.from({ length: 50 }, (_, i) =>
        createRoom(i, 0, 0, 1, 1),
      );
      const dungeon = createMinimalDungeon(100, 100, rooms);

      const result = assessQuality(dungeon, { maxRooms: 60 });

      const check = result.checks.find((c) => c.name === "room-count-max");

      expect(check?.success).toBe(true);
      expect(check?.threshold).toBe(60);
    });

    it("uses custom minFloorRatio threshold", () => {
      const rooms = [createRoom(0, 2, 2, 3, 3)]; // 9 tiles in 10000 = 0.0009
      let dungeon = createMinimalDungeon(100, 100, rooms);
      dungeon = fillRoomsWithFloor(dungeon);

      const result = assessQuality(dungeon, { minFloorRatio: 0.0001 });

      const check = result.checks.find((c) => c.name === "floor-ratio-min");

      expect(check?.success).toBe(true);
      expect(check?.threshold).toBe(0.0001);
    });

    it("uses custom maxFloorRatio threshold", () => {
      const rooms = [createRoom(0, 0, 0, 90, 90)];
      let dungeon = createMinimalDungeon(100, 100, rooms);
      dungeon = fillRoomsWithFloor(dungeon);

      const result = assessQuality(dungeon, { maxFloorRatio: 0.9 });

      const check = result.checks.find((c) => c.name === "floor-ratio-max");

      expect(check?.success).toBe(true);
      expect(check?.threshold).toBe(0.9);
    });

    it("uses custom minAvgRoomSize threshold", () => {
      const rooms = [
        createRoom(0, 2, 2, 2, 2),
        createRoom(1, 6, 2, 2, 2),
        createRoom(2, 10, 2, 2, 2),
      ];
      const dungeon = createMinimalDungeon(20, 20, rooms);

      const result = assessQuality(dungeon, { minAvgRoomSize: 4 });

      const check = result.checks.find((c) => c.name === "avg-room-size");

      expect(check?.success).toBe(true);
      expect(check?.threshold).toBe(4);
    });

    it("uses custom maxDeadEndRatio threshold", () => {
      const rooms = [createRoom(0, 2, 2, 5, 5), createRoom(1, 10, 2, 5, 5)];
      const connections = [createConnection(0, 1)];
      const dungeon = createMinimalDungeon(20, 20, rooms, connections);

      const result = assessQuality(dungeon, { maxDeadEndRatio: 1.0 });

      const check = result.checks.find((c) => c.name === "dead-end-ratio");

      expect(check?.success).toBe(true);
      expect(check?.threshold).toBe(1.0);
    });

    it("merges custom thresholds with defaults", () => {
      const dungeon = createMinimalDungeon();
      const result = assessQuality(dungeon, { minRooms: 1 });

      const maxRoomsCheck = result.checks.find(
        (c) => c.name === "room-count-max",
      );

      // Other thresholds should still use defaults
      expect(maxRoomsCheck?.threshold).toBe(
        DEFAULT_QUALITY_THRESHOLDS.maxRooms,
      );
    });
  });

  describe("passing dungeon", () => {
    it("passes all checks for well-formed dungeon", () => {
      const rooms = [
        createRoom(0, 2, 2, 6, 6),
        createRoom(1, 10, 2, 6, 6),
        createRoom(2, 2, 10, 6, 6),
        createRoom(3, 10, 10, 6, 6),
      ];
      const connections = [
        createConnection(0, 1),
        createConnection(1, 2),
        createConnection(2, 3),
        createConnection(3, 0),
      ];
      const spawns = [createSpawn(5, 5, "entrance", 0)];

      let dungeon = createMinimalDungeon(20, 20, rooms, connections, spawns);
      dungeon = fillRoomsWithFloor(dungeon);

      // Add corridor connections
      for (let x = 8; x < 10; x++) {
        dungeon.terrain[5 * dungeon.width + x] = CellType.FLOOR;
      }
      for (let y = 8; y < 10; y++) {
        dungeon.terrain[y * dungeon.width + 5] = CellType.FLOOR;
      }
      for (let x = 8; x < 10; x++) {
        dungeon.terrain[13 * dungeon.width + x] = CellType.FLOOR;
      }
      for (let y = 8; y < 10; y++) {
        dungeon.terrain[y * dungeon.width + 13] = CellType.FLOOR;
      }

      const result = assessQuality(dungeon);

      expect(result.success).toBe(true);
      expect(result.score).toBe(100);
      expect(result.checks.every((c) => c.success)).toBe(true);
    });
  });

  describe("failing dungeon", () => {
    it("fails checks for poorly-formed dungeon", () => {
      const rooms = [createRoom(0, 2, 2, 2, 2)]; // Too few, too small
      const dungeon = createMinimalDungeon(100, 100, rooms);

      const result = assessQuality(dungeon);

      expect(result.success).toBe(false);
      expect(result.score).toBeLessThan(100);

      const failedChecks = result.checks.filter((c) => !c.success);
      expect(failedChecks.length).toBeGreaterThan(0);
    });
  });

  describe("edge cases", () => {
    it("handles minimal dungeon (1x1)", () => {
      const dungeon = createMinimalDungeon(1, 1);
      const result = assessQuality(dungeon);

      expect(result).toBeDefined();
      expect(result.checks).toBeDefined();
      expect(result.score).toBeGreaterThanOrEqual(0);
    });

    it("handles empty dungeon (no rooms)", () => {
      const dungeon = createMinimalDungeon();
      const result = assessQuality(dungeon);

      expect(result).toBeDefined();
      expect(result.success).toBe(false);

      const roomCountCheck = result.checks.find(
        (c) => c.name === "room-count-min",
      );
      expect(roomCountCheck?.success).toBe(false);
      expect(roomCountCheck?.value).toBe(0);
    });

    it("handles dungeon with very small terrain", () => {
      const dungeon = createMinimalDungeon(1, 1);
      const result = assessQuality(dungeon);

      expect(result).toBeDefined();

      const floorRatioCheck = result.checks.find(
        (c) => c.name === "floor-ratio-min",
      );
      // No floor tiles in a 1x1 dungeon with no rooms
      expect(floorRatioCheck?.value).toBe(0);
    });

    it("handles large dungeon", () => {
      const rooms = Array.from({ length: 50 }, (_, i) =>
        createRoom(i, (i % 10) * 10, Math.floor(i / 10) * 10, 5, 5),
      );
      const dungeon = createMinimalDungeon(200, 200, rooms);

      const result = assessQuality(dungeon);

      expect(result).toBeDefined();
      expect(result.checks).toBeDefined();
    });
  });

  describe("integration with generate()", () => {
    it("assesses quality of generated BSP dungeon", () => {
      const config = {
        width: 60,
        height: 40,
        seed: createSeed(12345),
        algorithm: "bsp" as const,
      };

      const genResult = generate(config);

      expect(genResult.success).toBe(true);
      if (!genResult.success) return;

      const qaResult = assessQuality(genResult.artifact);

      expect(qaResult).toBeDefined();
      expect(qaResult.checks.length).toBeGreaterThan(0);
      expect(qaResult.score).toBeGreaterThanOrEqual(0);
      expect(qaResult.score).toBeLessThanOrEqual(100);
    });

    it("assesses quality of generated cellular dungeon", () => {
      const config = {
        width: 60,
        height: 40,
        seed: createSeed(54321),
        algorithm: "cellular" as const,
      };

      const genResult = generate(config);

      expect(genResult.success).toBe(true);
      if (!genResult.success) return;

      const qaResult = assessQuality(genResult.artifact);

      expect(qaResult).toBeDefined();
      expect(qaResult.checks.length).toBeGreaterThan(0);
    });

    it("generated dungeons typically pass quality checks", () => {
      const config = {
        width: 80,
        height: 60,
        seed: createSeed(99999),
        algorithm: "bsp" as const,
      };

      const genResult = generate(config);

      expect(genResult.success).toBe(true);
      if (!genResult.success) return;

      const qaResult = assessQuality(genResult.artifact);

      // Generated dungeons should generally pass quality checks
      // (though we don't enforce 100% success to allow for edge cases)
      expect(qaResult.score).toBeGreaterThan(50);
    });
  });
});
