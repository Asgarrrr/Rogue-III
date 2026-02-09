/**
 * Secret Passages Tests
 */

import { describe, expect, test } from "bun:test";
import { SeededRandom } from "@rogue/contracts";
import { CellType, Grid } from "../src/core/grid";
import {
  addSecretPassages,
  areSecretlyConnected,
  findSecretCandidates,
  getSecretConnections,
  revealSecret,
} from "../src/passes/carving/secret-passages";
import type { Connection, DungeonStateArtifact, Room } from "../src/pipeline/types";

function createRoom(id: number, x: number, y: number, width = 4, height = 4): Room {
  return {
    id,
    x,
    y,
    width,
    height,
    centerX: Math.floor(x + width / 2),
    centerY: Math.floor(y + height / 2),
    type: "normal",
    seed: id + 1,
  };
}

function createState(
  width: number,
  height: number,
  rooms: readonly Room[],
  connections: readonly Connection[],
): DungeonStateArtifact {
  const grid = new Grid(width, height, CellType.WALL);

  for (const room of rooms) {
    grid.fillRect(room.x, room.y, room.width, room.height, CellType.FLOOR);
  }

  for (const connection of connections) {
    for (const point of connection.path ?? []) {
      if (grid.isInBounds(point.x, point.y)) {
        grid.set(point.x, point.y, CellType.FLOOR);
      }
    }
  }

  return {
    type: "dungeon-state",
    id: "secret-test-state",
    width,
    height,
    grid,
    rooms: [...rooms],
    edges: connections.map((c) => [c.fromRoomId, c.toRoomId] as [number, number]),
    connections: [...connections],
    spawns: [],
  };
}

function createContext(seedValue: bigint = 12345n) {
  const rng = new SeededRandom(seedValue);
  const seed = { primary: seedValue, dimension: 0n, floor: 0n };

  return {
    rng,
    streams: { details: rng },
    config: {
      width: 40,
      height: 30,
      seed,
      algorithm: "bsp" as const,
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
    seed,
  };
}

describe("findSecretCandidates", () => {
  test("excludes already connected rooms and applies dead-end filter", () => {
    const room0 = createRoom(0, 2, 2);
    const room1 = createRoom(1, 12, 2);
    const room2 = { ...createRoom(2, 22, 2), isDeadEnd: true } satisfies Room;
    const rooms: Room[] = [room0, room1, room2];
    const connections: Connection[] = [{ fromRoomId: 0, toRoomId: 1, pathLength: 10 }];

    const candidates = findSecretCandidates(rooms, connections, {
      secretRatio: 1,
      minDistance: 1,
      maxDistance: 50,
      skipDeadEnds: true,
      maxSecrets: 3,
      carvePassages: false,
      passageWidth: 1,
    });

    expect(candidates.some((c) => c.fromRoom.id === 0 && c.toRoom.id === 1)).toBe(false);
    expect(candidates.some((c) => c.fromRoom.id === 2 || c.toRoom.id === 2)).toBe(false);
  });
});

describe("addSecretPassages", () => {
  test("adds metadata-only secret connection when carvePassages=false", () => {
    const rooms = [createRoom(0, 2, 2), createRoom(1, 14, 2)];
    const state = createState(30, 20, rooms, []);
    const midX = 10;
    const midY = rooms[0]?.centerY ?? 4;
    const before = state.grid.get(midX, midY);

    const pass = addSecretPassages({
      secretRatio: 1,
      maxSecrets: 1,
      minDistance: 1,
      maxDistance: 50,
      carvePassages: false,
    });

    const result = pass.run(state, createContext()) as DungeonStateArtifact;
    const secrets = getSecretConnections(result.connections);

    expect(secrets.length).toBe(1);
    expect(secrets[0]?.type).toBe("secret");
    expect(secrets[0]?.metadata?.visible).toBe(false);
    expect((secrets[0]?.path?.length ?? 0) > 0).toBe(true);
    expect(result.grid.get(midX, midY)).toBe(before);
  });

  test("carves secret passage into grid when carvePassages=true", () => {
    const rooms = [createRoom(0, 2, 2), createRoom(1, 14, 2)];
    const state = createState(30, 20, rooms, []);
    const midX = 10;
    const midY = rooms[0]?.centerY ?? 4;

    const pass = addSecretPassages({
      secretRatio: 1,
      maxSecrets: 1,
      minDistance: 1,
      maxDistance: 50,
      carvePassages: true,
      passageWidth: 1,
    });

    const result = pass.run(state, createContext(67890n)) as DungeonStateArtifact;
    const secrets = getSecretConnections(result.connections);

    expect(secrets.length).toBe(1);
    expect(result.grid.get(midX, midY)).toBe(CellType.FLOOR);
  });
});

describe("secret utilities", () => {
  test("reveals secret and reports connectivity", () => {
    const secret: Connection = {
      fromRoomId: 1,
      toRoomId: 2,
      pathLength: 4,
      type: "secret",
      metadata: { visible: false, tags: ["secret"] },
    };

    const revealed = revealSecret(secret);

    expect(revealed.metadata?.visible).toBe(true);
    expect(revealed.metadata?.tags?.includes("revealed")).toBe(true);
    expect(areSecretlyConnected(1, 2, [revealed])).toBe(true);
    expect(areSecretlyConnected(2, 1, [revealed])).toBe(true);
    expect(areSecretlyConnected(1, 3, [revealed])).toBe(false);
  });
});

