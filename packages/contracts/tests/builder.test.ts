import { describe, expect, it } from "bun:test";
import { buildDungeonConfig } from "../src";

describe("buildDungeonConfig", () => {
  it("applies defaults and clamps", () => {
    const res = buildDungeonConfig({ algorithm: "cellular" });
    if (!res.success) throw new Error("unexpected error");
    expect(res.value.algorithm).toBe("cellular");
    expect(res.value.roomCount).toBe(0);
    expect(res.value.width).toBeGreaterThan(0);
  });
});
