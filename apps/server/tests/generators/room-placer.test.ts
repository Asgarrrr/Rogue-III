import { describe, expect, test } from "bun:test";
import { CellType, Grid, type Region } from "@rogue/procgen";
import { SeededRandom } from "@rogue/procgen";
import {
  DEFAULT_ROOM_PLACEMENT_CONFIG,
  RoomPlacer,
} from "@rogue/procgen";

const makeRectRegion = (
  id: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): Region => {
  const points: Array<{ x: number; y: number }> = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      points.push({ x, y });
    }
  }

  return {
    id,
    points,
    bounds: { minX, minY, maxX, maxY },
    size: points.length,
  };
};

const carveRegion = (grid: Grid, region: Region) => {
  for (const point of region.points) {
    grid.setCell(point.x, point.y, CellType.FLOOR);
  }
};

const noOverlap = (rooms: ReturnType<RoomPlacer["placeRooms"]>) => {
  for (let i = 0; i < rooms.length; i++) {
    const a = rooms[i];
    for (let j = i + 1; j < rooms.length; j++) {
      const b = rooms[j];
      if (
        !(
          a.x + a.width <= b.x ||
          b.x + b.width <= a.x ||
          a.y + a.height <= b.y ||
          b.y + b.height <= a.y
        )
      ) {
        return false;
      }
    }
  }
  return true;
};

describe("RoomPlacer", () => {
  test("rooms stay inside cavern bounds without overlap", () => {
    const grid = new Grid({ width: 60, height: 40 }, CellType.WALL);
    const region = makeRectRegion(1, 5, 5, 50, 30);
    carveRegion(grid, region);

    const placer = new RoomPlacer(
      {
        ...DEFAULT_ROOM_PLACEMENT_CONFIG,
        roomCount: 6,
        minRoomSize: 4,
        maxRoomSize: 8,
      },
      new SeededRandom(12345),
    );

    const rooms = placer.placeRooms([region], grid);

    expect(rooms.length).toBeGreaterThan(0);
    for (const room of rooms) {
      expect(room.x).toBeGreaterThanOrEqual(region.bounds.minX);
      expect(room.y).toBeGreaterThanOrEqual(region.bounds.minY);
      expect(room.x + room.width).toBeLessThanOrEqual(region.bounds.maxX);
      expect(room.y + room.height).toBeLessThanOrEqual(region.bounds.maxY);
    }
    expect(noOverlap(rooms)).toBeTrue();
  });

  test("returns no rooms for caverns that are too small", () => {
    const grid = new Grid({ width: 20, height: 20 }, CellType.WALL);
    const tinyRegion = makeRectRegion(2, 0, 0, 3, 3);
    carveRegion(grid, tinyRegion);

    const placer = new RoomPlacer(
      {
        ...DEFAULT_ROOM_PLACEMENT_CONFIG,
        roomCount: 3,
      },
      new SeededRandom(999),
    );

    const rooms = placer.placeRooms([tinyRegion], grid);
    expect(rooms.length).toBe(0);
  });

  test("distributes rooms across multiple caverns", () => {
    const grid = new Grid({ width: 80, height: 50 }, CellType.WALL);
    const regions = [
      makeRectRegion(1, 2, 2, 25, 25),
      makeRectRegion(2, 30, 10, 60, 35),
    ];
    for (const region of regions) {
      carveRegion(grid, region);
    }

    const placer = new RoomPlacer(
      {
        ...DEFAULT_ROOM_PLACEMENT_CONFIG,
        roomCount: 8,
        minRoomSize: 5,
        maxRoomSize: 10,
      },
      new SeededRandom(2024),
    );

    const rooms = placer.placeRooms(regions, grid);
    expect(rooms.length).toBeGreaterThanOrEqual(5);

    const cavernsUsed = new Set(
      rooms.map((room) => {
        return regions.find(
          (region) =>
            room.x >= region.bounds.minX &&
            room.y >= region.bounds.minY &&
            room.x + room.width <= region.bounds.maxX &&
            room.y + room.height <= region.bounds.maxY,
        )?.id;
      }),
    );

    // Ensure rooms exist in both caverns
    expect(cavernsUsed.has(1)).toBeTrue();
    expect(cavernsUsed.has(2)).toBeTrue();
  });
});
