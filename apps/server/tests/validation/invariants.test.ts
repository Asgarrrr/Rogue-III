import { describe, expect, test } from "bun:test";
import { DungeonManager } from "@rogue/procgen";
import type {
  Connection,
  Dungeon,
  Room,
} from "@rogue/procgen";
import {
  assertDungeonInvariants,
  getInvariantSummary,
  validateDungeonInvariants,
} from "@rogue/procgen";

function unwrap<T>(result: {
  isErr(): boolean;
  error?: unknown;
  value?: T;
}): T {
  if (result.isErr()) {
    throw result.error;
  }
  return result.value as T;
}

describe("Invariant Validation", () => {
  describe("validateDungeonInvariants", () => {
    test("passes for valid cellular dungeon", () => {
      const dungeon = unwrap(
        DungeonManager.generateFromSeedSync(12345, {
          width: 60,
          height: 40,
          roomCount: 6,
          roomSizeRange: [5, 12],
          algorithm: "cellular",
        }),
      );

      const result = validateDungeonInvariants(dungeon);
      expect(result.valid).toBeTrue();
      expect(result.violations).toHaveLength(0);
    });

    test("passes for valid BSP dungeon", () => {
      const dungeon = unwrap(
        DungeonManager.generateFromSeedSync(54321, {
          width: 60,
          height: 40,
          roomCount: 8,
          roomSizeRange: [5, 12],
          algorithm: "bsp",
        }),
      );

      const result = validateDungeonInvariants(dungeon);
      expect(result.valid).toBeTrue();
      expect(result.violations).toHaveLength(0);
    });

    test("detects room out of bounds", () => {
      const dungeon = createMockDungeon({
        rooms: [
          createRoom(0, 0, 0, 10, 10), // Valid
          createRoom(1, 55, 35, 10, 10), // Out of bounds
        ],
        config: { width: 60, height: 40 },
      });

      const result = validateDungeonInvariants(dungeon);
      expect(result.valid).toBeFalse();
      expect(result.categories.rooms.length).toBeGreaterThan(0);
      expect(result.violations.some((v) => v.includes("boundary"))).toBeTrue();
    });

    test("detects room overlap", () => {
      const dungeon = createMockDungeon({
        rooms: [
          createRoom(0, 10, 10, 20, 20),
          createRoom(1, 15, 15, 20, 20), // Overlaps with room 0
        ],
        config: { width: 60, height: 40 },
      });

      const result = validateDungeonInvariants(dungeon);
      expect(result.valid).toBeFalse();
      expect(
        result.categories.rooms.some((v) => v.includes("overlaps")),
      ).toBeTrue();
    });

    test("detects invalid room dimensions", () => {
      const dungeon = createMockDungeon({
        rooms: [
          createRoom(0, 10, 10, 0, 10), // Zero width
          createRoom(1, 30, 10, 10, -5), // Negative height
        ],
        config: { width: 60, height: 40 },
      });

      const result = validateDungeonInvariants(dungeon);
      expect(result.valid).toBeFalse();
      expect(
        result.categories.rooms.some((v) => v.includes("Invalid dimensions")),
      ).toBeTrue();
    });

    test("detects duplicate room IDs", () => {
      const dungeon = createMockDungeon({
        rooms: [
          createRoom(0, 5, 5, 10, 10),
          createRoom(0, 25, 5, 10, 10), // Duplicate ID
        ],
        config: { width: 60, height: 40 },
      });

      const result = validateDungeonInvariants(dungeon);
      expect(result.valid).toBeFalse();
      expect(
        result.categories.rooms.some((v) => v.includes("Duplicate room ID")),
      ).toBeTrue();
    });

    test("detects invalid connection references", () => {
      const rooms = [createRoom(0, 5, 5, 10, 10), createRoom(1, 25, 5, 10, 10)];

      const dungeon = createMockDungeon({
        rooms,
        connections: [
          {
            from: rooms[0],
            to: { ...rooms[1], id: 999 }, // Invalid room ID
            path: [
              { x: 10, y: 10 },
              { x: 11, y: 10 },
            ],
          },
        ],
        config: { width: 60, height: 40 },
      });

      const result = validateDungeonInvariants(dungeon);
      expect(result.valid).toBeFalse();
      expect(
        result.categories.connections.some((v) =>
          v.includes("invalid room ID"),
        ),
      ).toBeTrue();
    });

    test("detects empty connection path", () => {
      const rooms = [createRoom(0, 5, 5, 10, 10), createRoom(1, 25, 5, 10, 10)];

      const dungeon = createMockDungeon({
        rooms,
        connections: [
          {
            from: rooms[0],
            to: rooms[1],
            path: [], // Empty path
          },
        ],
        config: { width: 60, height: 40 },
      });

      const result = validateDungeonInvariants(dungeon);
      expect(result.valid).toBeFalse();
      expect(
        result.categories.connections.some((v) => v.includes("Empty path")),
      ).toBeTrue();
    });

    test("detects duplicate waypoints", () => {
      const rooms = [createRoom(0, 5, 5, 10, 10), createRoom(1, 25, 5, 10, 10)];

      const dungeon = createMockDungeon({
        rooms,
        connections: [
          {
            from: rooms[0],
            to: rooms[1],
            path: [
              { x: 10, y: 10 },
              { x: 10, y: 10 }, // Duplicate waypoint
              { x: 30, y: 10 },
            ],
          },
        ],
        config: { width: 60, height: 40 },
      });

      const result = validateDungeonInvariants(dungeon);
      expect(result.valid).toBeFalse();
      expect(
        result.categories.connections.some((v) =>
          v.includes("Duplicate waypoint"),
        ),
      ).toBeTrue();
    });

    test("respects minRoomSpacing option", () => {
      const dungeon = createMockDungeon({
        rooms: [
          createRoom(0, 5, 5, 10, 10),
          createRoom(1, 16, 5, 10, 10), // 1 cell gap
        ],
        config: { width: 60, height: 40 },
      });

      // With spacing 0, should pass (disable grid/reachability for mock)
      const resultNoSpacing = validateDungeonInvariants(dungeon, {
        minRoomSpacing: 0,
        checkGrid: false,
        checkReachability: false,
      });
      expect(resultNoSpacing.valid).toBeTrue();

      // With spacing 2, should fail
      const resultWithSpacing = validateDungeonInvariants(dungeon, {
        minRoomSpacing: 2,
        checkGrid: false,
        checkReachability: false,
      });
      expect(resultWithSpacing.valid).toBeFalse();
      expect(
        resultWithSpacing.categories.rooms.some((v) => v.includes("overlaps")),
      ).toBeTrue();
    });

    test("can disable specific checks", () => {
      const dungeon = createMockDungeon({
        rooms: [
          createRoom(0, 55, 35, 10, 10), // Out of bounds
        ],
        config: { width: 60, height: 40 },
      });

      // With room checks enabled (default)
      const resultEnabled = validateDungeonInvariants(dungeon);
      expect(resultEnabled.valid).toBeFalse();

      // With room checks disabled (also disable grid/reachability since mock)
      const resultDisabled = validateDungeonInvariants(dungeon, {
        checkRooms: false,
        checkGrid: false,
        checkReachability: false,
      });
      expect(resultDisabled.valid).toBeTrue();
    });

    test("handles empty dungeon", () => {
      const dungeon = createMockDungeon({
        rooms: [],
        connections: [],
        config: { width: 60, height: 40 },
      });

      const result = validateDungeonInvariants(dungeon);
      expect(result.valid).toBeTrue();
    });

    test("handles single room dungeon", () => {
      const dungeon = createMockDungeon({
        rooms: [createRoom(0, 10, 10, 15, 15)],
        connections: [],
        config: { width: 60, height: 40 },
      });

      const result = validateDungeonInvariants(dungeon);
      expect(result.valid).toBeTrue();
    });
  });

  describe("assertDungeonInvariants", () => {
    test("does not throw for valid dungeon", () => {
      const dungeon = unwrap(
        DungeonManager.generateFromSeedSync(42, {
          width: 60,
          height: 40,
          roomCount: 5,
          roomSizeRange: [5, 10],
          algorithm: "bsp",
        }),
      );

      expect(() => assertDungeonInvariants(dungeon)).not.toThrow();
    });

    test("throws with detailed message for invalid dungeon", () => {
      const dungeon = createMockDungeon({
        rooms: [
          createRoom(0, 55, 35, 10, 10), // Out of bounds
        ],
        config: { width: 60, height: 40 },
      });

      expect(() => assertDungeonInvariants(dungeon)).toThrow(
        /invariant violations/i,
      );
    });
  });

  describe("getInvariantSummary", () => {
    test("returns success message for valid result", () => {
      const result = {
        valid: true,
        violations: [],
        categories: { rooms: [], connections: [], grid: [], reachability: [] },
      };

      expect(getInvariantSummary(result)).toBe("All invariants passed");
    });

    test("returns detailed summary for invalid result", () => {
      const result = {
        valid: false,
        violations: ["error1", "error2", "error3"],
        categories: {
          rooms: ["error1", "error2"],
          connections: ["error3"],
          grid: [],
          reachability: [],
        },
      };

      const summary = getInvariantSummary(result);
      expect(summary).toContain("3 violations");
      expect(summary).toContain("2 room issues");
      expect(summary).toContain("1 connection issues");
    });
  });

  describe("Real dungeon validation", () => {
    const testSeeds = [1, 12345, 54321, 99999, 123456789];

    for (const seed of testSeeds) {
      test(`cellular dungeon with seed ${seed} passes all invariants`, () => {
        const dungeon = unwrap(
          DungeonManager.generateFromSeedSync(seed, {
            width: 80,
            height: 60,
            roomCount: 8,
            roomSizeRange: [5, 15],
            algorithm: "cellular",
          }),
        );

        const result = validateDungeonInvariants(dungeon);
        if (!result.valid) {
          console.error(`Seed ${seed} failed:`, result.violations);
        }
        expect(result.valid).toBeTrue();
      });

      test(`BSP dungeon with seed ${seed} passes all invariants`, () => {
        const dungeon = unwrap(
          DungeonManager.generateFromSeedSync(seed, {
            width: 80,
            height: 60,
            roomCount: 10,
            roomSizeRange: [5, 15],
            algorithm: "bsp",
          }),
        );

        const result = validateDungeonInvariants(dungeon);
        if (!result.valid) {
          console.error(`Seed ${seed} failed:`, result.violations);
        }
        expect(result.valid).toBeTrue();
      });
    }
  });
});

// Helper functions

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
    centerX: x + width / 2,
    centerY: y + height / 2,
  };
}

interface MockDungeonOptions {
  rooms: Room[];
  connections?: Array<{
    from: Room;
    to: Room;
    path: Array<{ x: number; y: number }>;
  }>;
  config: { width: number; height: number };
  grid?: boolean[][];
}

function createMockDungeon(options: MockDungeonOptions): Dungeon {
  const { rooms, connections = [], config } = options;

  // Create grid if not provided
  const grid =
    options.grid || createGridForRooms(rooms, config.width, config.height);

  return {
    rooms,
    connections: connections.map((c) => ({
      from: c.from,
      to: c.to,
      path: c.path,
    })) as Connection[],
    grid,
    checksum: "mock",
    config: {
      width: config.width,
      height: config.height,
      roomCount: rooms.length,
      roomSizeRange: [5, 15],
      algorithm: "bsp",
    },
    seed: {
      version: 1,
      timestamp: Date.now(),
      primary: 0,
      layout: 0,
      room: 0,
      connection: 0,
      detail: 0,
      crc: 0,
    },
  };
}

function createGridForRooms(
  rooms: Room[],
  width: number,
  height: number,
): boolean[][] {
  // Initialize with walls (true)
  const grid: boolean[][] = [];
  for (let y = 0; y < height; y++) {
    grid[y] = new Array(width).fill(true);
  }

  // Carve rooms (false = floor)
  for (const room of rooms) {
    for (
      let y = Math.max(0, room.y);
      y < Math.min(height, room.y + room.height);
      y++
    ) {
      for (
        let x = Math.max(0, room.x);
        x < Math.min(width, room.x + room.width);
        x++
      ) {
        grid[y][x] = false;
      }
    }
  }

  return grid;
}
