import { describe, expect, it } from "bun:test";
import { DungeonConfigSchema } from "../src";

describe("DungeonConfigSchema", () => {
  it("accepts valid cellular config", () => {
    const res = DungeonConfigSchema.safeParse({
      algorithm: "cellular",
      width: 60,
      height: 30,
      roomSizeRange: [5, 12],
      roomCount: 0,
    });
    expect(res.success).toBe(true);
  });

  it("rejects invalid bsp config (roomCount < 1)", () => {
    const res = DungeonConfigSchema.safeParse({
      algorithm: "bsp",
      width: 60,
      height: 30,
      roomSizeRange: [5, 12],
      roomCount: 0,
    });
    expect(res.success).toBe(false);
  });
});
