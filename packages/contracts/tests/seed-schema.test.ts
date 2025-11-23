import { describe, expect, it } from "bun:test";
import { DungeonSeedSchema, EncodedSeedSchema, SeedPartsSchema } from "../src";

describe("Seed Schemas", () => {
  it("validates a correct seed", () => {
    const res = DungeonSeedSchema.safeParse({
      primary: 1,
      layout: 2,
      rooms: 3,
      connections: 4,
      details: 5,
      version: "1.0.0",
      timestamp: 123456,
    });
    expect(res.success).toBe(true);
  });

  it("rejects bad encoded seed", () => {
    const res = EncodedSeedSchema.safeParse("");
    expect(res.success).toBe(false);
  });

  it("validates parts length", () => {
    // SeedPartsSchema expects 7 elements: primary, layout, rooms, connections, details, timestamp, crc
    const res = SeedPartsSchema.safeParse([1, 2, 3, 4, 5, 123456, 789]);
    expect(res.success).toBe(true);
  });
});
