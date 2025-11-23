import { describe, expect, test } from "bun:test";
import { DungeonManager } from "../../src/engine/dungeon";
import { CellType, Grid } from "../../src/engine/dungeon/core/grid";
import type { Dungeon, Room } from "../../src/engine/dungeon/entities";

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

function assertRoomsDoNotOverlap(rooms: Room[]) {
  for (let i = 0; i < rooms.length; i++) {
    const a = rooms[i];
    for (let j = i + 1; j < rooms.length; j++) {
      const b = rooms[j];
      const overlaps =
        a.x < b.x + b.width &&
        a.x + a.width > b.x &&
        a.y < b.y + b.height &&
        a.y + a.height > b.y;
      expect(overlaps).toBeFalse();
    }
  }
}

function assertAllRoomsReachable(dungeon: Dungeon, grid: Grid) {
  if (dungeon.rooms.length === 0) return;
  const start = dungeon.rooms[0];
  const startX = Math.floor(start.centerX);
  const startY = Math.floor(start.centerY);
  expect(grid.getCell(startX, startY)).toBe(CellType.FLOOR);

  const visited = new Uint8Array(grid.width * grid.height);
  const qx: number[] = [startX];
  const qy: number[] = [startY];
  const idx = (x: number, y: number) => y * grid.width + x;

  for (let qi = 0; qi < qx.length; qi++) {
    const cx = qx[qi];
    const cy = qy[qi];
    const ci = idx(cx, cy);
    if (visited[ci]) continue;
    visited[ci] = 1;

    // 4-neighborhood traversal
    const neighbors = [
      [cx - 1, cy],
      [cx + 1, cy],
      [cx, cy - 1],
      [cx, cy + 1],
    ];
    for (const [nx, ny] of neighbors) {
      if (
        nx >= 0 &&
        nx < grid.width &&
        ny >= 0 &&
        ny < grid.height &&
        grid.getCell(nx, ny) === CellType.FLOOR
      ) {
        const ni = idx(nx, ny);
        if (!visited[ni]) {
          qx.push(nx);
          qy.push(ny);
        }
      }
    }
  }

  for (const room of dungeon.rooms) {
    const rx = Math.floor(room.centerX);
    const ry = Math.floor(room.centerY);
    expect(visited[idx(rx, ry)]).toBe(1);
  }
}

function assertCarvingMatchesGrid(dungeon: Dungeon, grid: Grid) {
  // All room tiles should be carved as floor
  for (const room of dungeon.rooms) {
    for (let y = room.y; y < room.y + room.height; y++) {
      for (let x = room.x; x < room.x + room.width; x++) {
        expect(grid.getCell(x, y)).toBe(CellType.FLOOR);
      }
    }
  }

  // Connection paths should also be carved as floor
  for (const connection of dungeon.connections) {
    for (const point of connection.path) {
      const x = Math.floor(point.x);
      const y = Math.floor(point.y);
      expect(grid.getCell(x, y)).toBe(CellType.FLOOR);
    }
  }
}

describe("Dungeon invariants", () => {
  const seeds = [12345, 54321];
  const configs = {
    cellular: {
      width: 60,
      height: 40,
      roomCount: 6,
      roomSizeRange: [5, 12] as [number, number],
      algorithm: "cellular" as const,
    },
    bsp: {
      width: 60,
      height: 40,
      roomCount: 8,
      roomSizeRange: [5, 12] as [number, number],
      algorithm: "bsp" as const,
    },
  };

  for (const [algorithm, config] of Object.entries(configs)) {
    describe(`${algorithm} invariants`, () => {
      for (const seed of seeds) {
        test(`rooms non-overlapping and reachable (seed ${seed})`, () => {
          const dungeonResult = DungeonManager.generateFromSeedSync(
            seed,
            config,
          );
          const dungeon = unwrap(dungeonResult);
          expect(dungeon.grid).toBeDefined();
          if (!dungeon.grid) {
            throw new Error("Dungeon grid is missing");
          }
          const grid = Grid.fromBooleanGrid(dungeon.grid);

          assertRoomsDoNotOverlap(dungeon.rooms);
          assertAllRoomsReachable(dungeon, grid);
          assertCarvingMatchesGrid(dungeon, grid);
        });
      }
    });
  }

  test("BSP async generation matches sync output", async () => {
    const config = configs.bsp;
    const seed = seeds[0];

    const sync = unwrap(DungeonManager.generateFromSeedSync(seed, config));
    const asyncResult = await DungeonManager.generateFromSeedAsync(
      seed,
      config,
    );
    const asyncDungeon = unwrap(asyncResult);

    expect(asyncDungeon.checksum).toBe(sync.checksum);
    expect(asyncDungeon.rooms.length).toBe(sync.rooms.length);
    expect(asyncDungeon.connections.length).toBe(sync.connections.length);
  });
});
