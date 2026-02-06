/**
 * Lock-and-Key Pattern Tests
 */

import { describe, expect, it } from "bun:test";
import {
  applyProgressionToSpawns,
  generateLockAndKeyProgression,
} from "../src/passes/progression/lock-and-key";
import type { Connection, Room } from "../src/pipeline/types";

// Simple seeded RNG for testing
function createTestRng(seed: number) {
  let s = seed;
  return {
    next(): number {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    },
  };
}

function createTestRooms(count: number): Room[] {
  const rooms: Room[] = [];
  for (let i = 0; i < count; i++) {
    rooms.push({
      id: i,
      x: i * 10,
      y: 0,
      width: 8,
      height: 8,
      centerX: i * 10 + 4,
      centerY: 4,
      type: i === 0 ? "entrance" : i === count - 1 ? "exit" : "normal",
      seed: i,
    });
  }
  return rooms;
}

function createLinearConnections(roomCount: number): Connection[] {
  const connections: Connection[] = [];
  for (let i = 0; i < roomCount - 1; i++) {
    connections.push({
      fromRoomId: i,
      toRoomId: i + 1,
      path: [
        { x: i * 10 + 8, y: 4 },
        { x: (i + 1) * 10, y: 4 },
      ],
    });
  }
  return connections;
}

describe("generateLockAndKeyProgression", () => {
  it("generates empty progression for single room", () => {
    const rooms = createTestRooms(1);
    const connections: Connection[] = [];
    const rng = createTestRng(42);

    const result = generateLockAndKeyProgression(rooms, connections, {}, rng);

    expect(result.locks).toHaveLength(0);
    expect(result.keys).toHaveLength(0);
    expect(result.solvable).toBe(true);
  });

  it("generates empty progression when no entrance", () => {
    const rooms: Room[] = [
      {
        id: 0,
        x: 0,
        y: 0,
        width: 8,
        height: 8,
        centerX: 4,
        centerY: 4,
        type: "normal",
        seed: 0,
      },
    ];
    const rng = createTestRng(42);

    const result = generateLockAndKeyProgression(rooms, [], {}, rng);

    expect(result.locks).toHaveLength(0);
    expect(result.keys).toHaveLength(0);
    expect(result.solvable).toBe(true);
  });

  it("respects minDistanceFromStart", () => {
    const rooms = createTestRooms(5);
    const connections = createLinearConnections(5);
    const rng = createTestRng(42);

    const result = generateLockAndKeyProgression(
      rooms,
      connections,
      { minDistanceFromStart: 3, lockProbability: 1.0 },
      rng,
    );

    // Locks should only appear on connections at distance 3 or more
    for (const lock of result.locks) {
      const conn = connections[lock.connectionIndex]!;
      // Both rooms should be at distance >= 2 from entrance
      expect(conn.fromRoomId).toBeGreaterThanOrEqual(2);
    }
  });

  it("respects maxLocks", () => {
    const rooms = createTestRooms(10);
    const connections = createLinearConnections(10);
    const rng = createTestRng(42);

    const result = generateLockAndKeyProgression(
      rooms,
      connections,
      { maxLocks: 2, lockProbability: 1.0, minDistanceFromStart: 0 },
      rng,
    );

    expect(result.locks.length).toBeLessThanOrEqual(2);
  });

  it("places keys before their locks (solvable)", () => {
    const rooms = createTestRooms(6);
    const connections = createLinearConnections(6);
    const rng = createTestRng(123);

    const result = generateLockAndKeyProgression(
      rooms,
      connections,
      { lockProbability: 1.0, minDistanceFromStart: 1, maxLocks: 2 },
      rng,
    );

    // Should always be solvable
    expect(result.solvable).toBe(true);

    // Each key should be in a room before its lock
    for (const key of result.keys) {
      const lock = result.locks.find((l) => l.type === key.type);
      if (lock) {
        // Key room ID should be less than the locked connection's rooms
        const conn = connections[lock.connectionIndex]!;
        expect(key.roomId).toBeLessThan(
          Math.min(conn.fromRoomId, conn.toRoomId) + 1,
        );
      }
    }
  });

  it("matches keys to locks by type", () => {
    const rooms = createTestRooms(6);
    const connections = createLinearConnections(6);
    const rng = createTestRng(456);

    const result = generateLockAndKeyProgression(
      rooms,
      connections,
      {
        keyTypes: ["red_key", "blue_key"],
        lockProbability: 1.0,
        minDistanceFromStart: 1,
        maxLocks: 2,
      },
      rng,
    );

    // Every lock should have a matching key
    for (const lock of result.locks) {
      const matchingKey = result.keys.find((k) => k.type === lock.type);
      expect(matchingKey).toBeDefined();
    }

    // Every key should have a matching lock
    for (const key of result.keys) {
      const matchingLock = result.locks.find((l) => l.type === key.type);
      expect(matchingLock).toBeDefined();
    }
  });

  it("uses provided key types in order", () => {
    const rooms = createTestRooms(8);
    const connections = createLinearConnections(8);
    const rng = createTestRng(789);

    const result = generateLockAndKeyProgression(
      rooms,
      connections,
      {
        keyTypes: ["gold", "silver", "bronze"],
        lockProbability: 1.0,
        minDistanceFromStart: 1,
        maxLocks: 3,
      },
      rng,
    );

    // Keys should be used in order
    const usedTypes = result.keys.map((k) => k.type);
    if (usedTypes.length >= 2) {
      expect(usedTypes[0]).toBe("gold");
      if (usedTypes.length >= 2) expect(usedTypes[1]).toBe("silver");
      if (usedTypes.length >= 3) expect(usedTypes[2]).toBe("bronze");
    }
  });

  it("calculates critical path", () => {
    const rooms = createTestRooms(5);
    const connections = createLinearConnections(5);
    const rng = createTestRng(101);

    const result = generateLockAndKeyProgression(
      rooms,
      connections,
      { lockProbability: 0.5, minDistanceFromStart: 1 },
      rng,
    );

    // Critical path should start at entrance (room 0) and end at exit (room 4)
    if (result.criticalPath.length > 0) {
      expect(result.criticalPath[0]).toBe(0);
      expect(result.criticalPath[result.criticalPath.length - 1]).toBe(4);
    }
  });

  it("counts keys by type correctly", () => {
    const rooms = createTestRooms(6);
    const connections = createLinearConnections(6);
    const rng = createTestRng(202);

    const result = generateLockAndKeyProgression(
      rooms,
      connections,
      {
        keyTypes: ["red", "blue"],
        lockProbability: 1.0,
        minDistanceFromStart: 1,
        maxLocks: 2,
      },
      rng,
    );

    // keyCountsByType should match actual keys
    let totalFromCounts = 0;
    for (const type of Object.keys(result.keyCountsByType)) {
      totalFromCounts += result.keyCountsByType[type]!;
    }
    expect(totalFromCounts).toBe(result.keys.length);
  });
});

describe("applyProgressionToSpawns", () => {
  it("creates spawn points for keys", () => {
    const progression = {
      locks: [
        {
          id: "lock1",
          type: "red",
          connectionIndex: 0,
          variant: "door" as const,
        },
      ],
      keys: [
        {
          id: "key1",
          type: "red",
          roomId: 0,
          position: { x: 5, y: 5 },
          variant: "key" as const,
        },
      ],
      solvable: true,
      criticalPath: [0, 1],
      keyCountsByType: { red: 1 },
    };

    const spawns = applyProgressionToSpawns(progression);

    expect(spawns).toHaveLength(1);
    expect(spawns[0]?.type).toBe("key");
    expect(spawns[0]?.position).toEqual({ x: 5, y: 5 });
    expect(spawns[0]?.data.keyType).toBe("red");
  });

  it("handles empty progression", () => {
    const progression = {
      locks: [],
      keys: [],
      solvable: true,
      criticalPath: [],
      keyCountsByType: {},
    };

    const spawns = applyProgressionToSpawns(progression);

    expect(spawns).toHaveLength(0);
  });

  it("creates multiple key spawns", () => {
    const progression = {
      locks: [
        {
          id: "lock1",
          type: "red",
          connectionIndex: 0,
          variant: "door" as const,
        },
        {
          id: "lock2",
          type: "blue",
          connectionIndex: 1,
          variant: "door" as const,
        },
      ],
      keys: [
        {
          id: "key1",
          type: "red",
          roomId: 0,
          position: { x: 5, y: 5 },
          variant: "key" as const,
        },
        {
          id: "key2",
          type: "blue",
          roomId: 1,
          position: { x: 15, y: 5 },
          variant: "key" as const,
        },
      ],
      solvable: true,
      criticalPath: [0, 1, 2],
      keyCountsByType: { red: 1, blue: 1 },
    };

    const spawns = applyProgressionToSpawns(progression);

    expect(spawns).toHaveLength(2);
    expect(spawns.map((s) => s.data.keyType).sort()).toEqual(["blue", "red"]);
  });
});

describe("progression solvability", () => {
  it("generates solvable progressions consistently", () => {
    // Run multiple seeds and verify all are solvable
    for (let seed = 0; seed < 100; seed++) {
      const rooms = createTestRooms(8);
      const connections = createLinearConnections(8);
      const rng = createTestRng(seed);

      const result = generateLockAndKeyProgression(
        rooms,
        connections,
        { lockProbability: 0.5, minDistanceFromStart: 1, maxLocks: 3 },
        rng,
      );

      expect(result.solvable).toBe(true);
    }
  });

  it("handles branching dungeons", () => {
    // Create a dungeon with branches
    const rooms: Room[] = [
      {
        id: 0,
        x: 0,
        y: 0,
        width: 8,
        height: 8,
        centerX: 4,
        centerY: 4,
        type: "entrance",
        seed: 0,
      },
      {
        id: 1,
        x: 10,
        y: 0,
        width: 8,
        height: 8,
        centerX: 14,
        centerY: 4,
        type: "normal",
        seed: 1,
      },
      {
        id: 2,
        x: 20,
        y: -10,
        width: 8,
        height: 8,
        centerX: 24,
        centerY: -6,
        type: "treasure",
        seed: 2,
      },
      {
        id: 3,
        x: 20,
        y: 10,
        width: 8,
        height: 8,
        centerX: 24,
        centerY: 14,
        type: "normal",
        seed: 3,
      },
      {
        id: 4,
        x: 30,
        y: 0,
        width: 8,
        height: 8,
        centerX: 34,
        centerY: 4,
        type: "exit",
        seed: 4,
      },
    ];

    const connections: Connection[] = [
      { fromRoomId: 0, toRoomId: 1, path: [] },
      { fromRoomId: 1, toRoomId: 2, path: [] },
      { fromRoomId: 1, toRoomId: 3, path: [] },
      { fromRoomId: 3, toRoomId: 4, path: [] },
    ];

    for (let seed = 0; seed < 50; seed++) {
      const rng = createTestRng(seed);

      const result = generateLockAndKeyProgression(
        rooms,
        connections,
        { lockProbability: 0.7, minDistanceFromStart: 1, maxLocks: 2 },
        rng,
      );

      expect(result.solvable).toBe(true);
    }
  });
});
