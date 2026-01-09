import { describe, expect, test } from "bun:test";
import { SeedManager } from "../../src/game/dungeon/serialization/seed-manager";
import { testSeeds } from "./test-helpers";

describe("Seed Generation", () => {
  describe("generateSeeds", () => {
    test("should generate a complete seed with all required properties", () => {
      const seedResult = SeedManager.generateSeeds(testSeeds.validNumericSeed);
      if (seedResult.isErr()) throw new Error(seedResult.error.message);
      const seed = seedResult.value;

      expect(seed).toHaveProperty("primary");
      expect(seed).toHaveProperty("layout");
      expect(seed).toHaveProperty("rooms");
      expect(seed).toHaveProperty("connections");
      expect(seed).toHaveProperty("details");
      expect(seed).toHaveProperty("version");
      expect(seed).toHaveProperty("timestamp");

      expect(typeof seed.primary).toBe("number");
      expect(typeof seed.layout).toBe("number");
      expect(typeof seed.rooms).toBe("number");
      expect(typeof seed.connections).toBe("number");
      expect(typeof seed.details).toBe("number");
      expect(typeof seed.version).toBe("string");
      expect(typeof seed.timestamp).toBe("number");
    });

    test("should use provided primary seed correctly", () => {
      const seedResult = SeedManager.generateSeeds(testSeeds.validNumericSeed);
      if (seedResult.isErr()) throw new Error(seedResult.error.message);
      expect(seedResult.value.primary).toBe(testSeeds.validNumericSeed);
    });

    test("should generate deterministic layout seed using XOR with magic number", () => {
      const seed1Result = SeedManager.generateSeeds(testSeeds.validNumericSeed);
      const seed2Result = SeedManager.generateSeeds(testSeeds.validNumericSeed);
      if (seed1Result.isErr()) throw new Error(seed1Result.error.message);
      if (seed2Result.isErr()) throw new Error(seed2Result.error.message);

      expect(seed1Result.value.layout).toBe(seed2Result.value.layout);
      expect(seed1Result.value.layout >>> 0).toBe(
        (testSeeds.validNumericSeed ^ 0x9e3779b9) >>> 0,
      );
    });

    test("should generate room, connection, and detail seeds within expected ranges", () => {
      const seedResult = SeedManager.generateSeeds(testSeeds.validNumericSeed);
      if (seedResult.isErr()) throw new Error(seedResult.error.message);
      const seed = seedResult.value;

      expect(seed.rooms).toBeGreaterThanOrEqual(1000000);
      expect(seed.rooms).toBeLessThanOrEqual(9999999);

      expect(seed.connections).toBeGreaterThanOrEqual(1000000);
      expect(seed.connections).toBeLessThanOrEqual(9999999);

      expect(seed.details).toBeGreaterThanOrEqual(1000000);
      expect(seed.details).toBeLessThanOrEqual(9999999);
    });

    test("should use default version when not specified", () => {
      const seedResult = SeedManager.generateSeeds(testSeeds.validNumericSeed);
      if (seedResult.isErr()) throw new Error(seedResult.error.message);
      expect(seedResult.value.version).toBe("1.0.0");
    });

    test("should use custom version when provided", () => {
      const customVersion = "2.1.0";
      const seedResult = SeedManager.generateSeeds(testSeeds.validNumericSeed, {
        version: customVersion,
      });
      if (seedResult.isErr()) throw new Error(seedResult.error.message);
      expect(seedResult.value.version).toBe(customVersion);
    });

    test("should produce deterministic timestamp by default", () => {
      const seed1Result = SeedManager.generateSeeds(testSeeds.validNumericSeed);
      const seed2Result = SeedManager.generateSeeds(testSeeds.validNumericSeed);
      if (seed1Result.isErr()) throw new Error(seed1Result.error.message);
      if (seed2Result.isErr()) throw new Error(seed2Result.error.message);

      expect(seed1Result.value.timestamp).toBe(seed2Result.value.timestamp);
      expect(seed1Result.value.timestamp).toBeGreaterThan(0);
    });

    test("can opt into real-time timestamp for observability", () => {
      const before = Date.now();
      const seedResult = SeedManager.generateSeeds(testSeeds.validNumericSeed, {
        deterministicTimestamp: false,
      });
      const after = Date.now();
      if (seedResult.isErr()) throw new Error(seedResult.error.message);

      expect(seedResult.value.timestamp).toBeGreaterThanOrEqual(before);
      expect(seedResult.value.timestamp).toBeLessThanOrEqual(after);
    });

    test("should handle edge case seeds", () => {
      expect(SeedManager.generateSeeds(testSeeds.zeroSeed).isOk()).toBe(true);
      expect(SeedManager.generateSeeds(testSeeds.largeSeed).isOk()).toBe(true);
      expect(SeedManager.generateSeeds(testSeeds.smallSeed).isOk()).toBe(true);
      expect(SeedManager.generateSeeds(testSeeds.negativeSeed).isErr()).toBe(
        true,
      );
    });

    test("should generate different seeds for different inputs", () => {
      const seed1Result = SeedManager.generateSeeds(111111111);
      const seed2Result = SeedManager.generateSeeds(222222222);
      if (seed1Result.isErr()) throw new Error(seed1Result.error.message);
      if (seed2Result.isErr()) throw new Error(seed2Result.error.message);

      expect(seed1Result.value.primary).not.toBe(seed2Result.value.primary);
      expect(seed1Result.value.layout).not.toBe(seed2Result.value.layout);
      // Note: rooms, connections, details will likely be different due to different RNG seeds
    });

    test("should generate identical seeds for same input", () => {
      const seed1Result = SeedManager.generateSeeds(testSeeds.validNumericSeed);
      const seed2Result = SeedManager.generateSeeds(testSeeds.validNumericSeed);
      if (seed1Result.isErr()) throw new Error(seed1Result.error.message);
      if (seed2Result.isErr()) throw new Error(seed2Result.error.message);

      expect(seed1Result.value.primary).toBe(seed2Result.value.primary);
      expect(seed1Result.value.layout).toBe(seed2Result.value.layout);
      expect(seed1Result.value.rooms).toBe(seed2Result.value.rooms);
      expect(seed1Result.value.connections).toBe(seed2Result.value.connections);
      expect(seed1Result.value.details).toBe(seed2Result.value.details);
      expect(seed1Result.value.version).toBe(seed2Result.value.version);
    });
  });
});
