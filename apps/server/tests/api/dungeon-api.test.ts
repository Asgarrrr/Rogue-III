import { describe, expect, test } from "bun:test";
import { createApp } from "../../src/app";

const app = createApp();

const baseConfig = {
  width: 40,
  height: 30,
  roomCount: 5,
  roomSizeRange: [5, 10] as [number, number],
  algorithm: "bsp" as const,
};

const postDungeon = (payload: unknown) =>
  app.handle(
    new Request("http://localhost/api/dungeon", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }),
  );

describe("Dungeon API", () => {
  test("POST /api/dungeon returns deterministic dungeon for a seed", async () => {
    const response = await postDungeon({
      seed: 1234,
      config: baseConfig,
    });

    expect(response.status).toBe(200);
    const json = (await response.json()) as Record<string, unknown>;
    expect(json.ok).toBeTrue();
    expect(typeof json.checksum).toBe("string");
    expect(Array.isArray(json.rooms)).toBeTrue();
    expect((json.rooms as unknown[]).length).toBeGreaterThan(0);
    expect(typeof json.shareCode).toBe("string");
  });

  test("share codes regenerate identical dungeons", async () => {
    const firstResponse = await postDungeon({
      seed: 98765,
      config: baseConfig,
    });
    const first = (await firstResponse.json()) as {
      ok: boolean;
      checksum: string;
      shareCode?: string;
      config: typeof baseConfig;
    };
    expect(first.ok).toBeTrue();
    expect(typeof first.shareCode).toBe("string");

    const secondResponse = await postDungeon({
      shareCode: first.shareCode,
      config: baseConfig,
    });
    const second = (await secondResponse.json()) as {
      ok: boolean;
      checksum: string;
    };

    expect(second.ok).toBeTrue();
    expect(second.checksum).toBe(first.checksum);
  });

  test("invalid configuration returns 400", async () => {
    const response = await postDungeon({
      seed: 1,
      config: { width: 5, height: 5, algorithm: "cellular" },
    });

    expect(response.status).toBe(400);
    const json = (await response.json()) as Record<string, unknown>;
    expect(json.ok).toBeFalse();
    expect(json.error).toBe("CONFIG_INVALID");
  });
});
