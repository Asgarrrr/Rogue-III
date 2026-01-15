import { describe, expect, test } from "bun:test";
import { ROOM_DENSITY_DIVISOR } from "@rogue/contracts";
import { DungeonManager } from "@rogue/procgen";

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

describe("Dungeon guardrails", () => {
  test("rejects configurations that exceed the maximum cell budget", () => {
    const config = {
      width: 2000,
      height: 2000,
      roomCount: 10,
      roomSizeRange: [5, 12] as [number, number],
      algorithm: "cellular" as const,
    };

    const result = DungeonManager.generateFromSeedSync(1, config);
    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("CONFIG_DIMENSION_TOO_LARGE");
    }
  });

  test("clamps requested room count to the density budget", () => {
    const config = {
      width: 60,
      height: 60,
      roomCount: 1000,
      roomSizeRange: [5, 10] as [number, number],
      algorithm: "cellular" as const,
    };

    const dungeon = unwrap(DungeonManager.generateFromSeedSync(1, config));
    const expectedMaxRooms = Math.floor(
      (config.width * config.height) / ROOM_DENSITY_DIVISOR,
    );

    expect(dungeon.config.roomCount).toBeLessThanOrEqual(expectedMaxRooms);
  });

  test("returns GENERATION_TIMEOUT when the deadline elapses", async () => {
    const config = {
      width: 60,
      height: 60,
      roomCount: 8,
      roomSizeRange: [5, 10] as [number, number],
      algorithm: "cellular" as const,
    };

    const result = await DungeonManager.generateFromSeedAsync(
      123,
      config,
      undefined,
      { timeoutMs: 0 },
    );

    expect(result.isErr()).toBe(true);
    if (result.isErr()) {
      expect(result.error.code).toBe("GENERATION_TIMEOUT");
    }
  });
});
