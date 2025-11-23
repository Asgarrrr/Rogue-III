import { describe, expect, test } from "bun:test";
import { DungeonManager } from "../../src/engine/dungeon";

const baseConfig = {
  width: 50,
  height: 35,
  roomCount: 6,
  roomSizeRange: [5, 12] as [number, number],
  algorithm: "cellular" as const,
};

describe("DungeonManager abort and timeout handling", () => {
  test("returns timeout error when AbortSignal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort("manual abort");

    const result = await DungeonManager.generateFromSeedAsync(
      1337,
      baseConfig,
      undefined,
      { signal: controller.signal },
    );

    expect(result.isErr()).toBeTrue();
    expect(result.error?.code).toBe("GENERATION_TIMEOUT");
  });

  test("returns timeout error when timeoutMs is non-positive", async () => {
    const result = await DungeonManager.generateFromSeedAsync(
      42,
      baseConfig,
      undefined,
      { timeoutMs: 0 },
    );

    expect(result.isErr()).toBeTrue();
    expect(result.error?.code).toBe("GENERATION_TIMEOUT");
  });
});
