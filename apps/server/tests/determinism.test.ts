import { beforeEach, describe, expect, test } from "bun:test";
import { DungeonManager } from "../src/engine/dungeon";
import { SeededRandom } from "../src/engine/dungeon/core/random/seeded-random";
import type { Dungeon } from "../src/engine/dungeon/entities";
import { CellularGenerator } from "../src/engine/dungeon/generators/algorithms/cellular";

// Test constants
const TEST_SEED = 123456789;
const DETERMINISM_ITERATIONS = 100;
const PERFORMANCE_ITERATIONS = 10;

// Test configurations
const baseConfig = {
  width: 80,
  height: 60,
  roomCount: 8,
  roomSizeRange: [6, 15] as [number, number],
  algorithm: "cellular" as const,
};

const largeConfig = {
  width: 200,
  height: 150,
  roomCount: 20,
  roomSizeRange: [8, 25] as [number, number],
  algorithm: "cellular" as const,
};

// Helper to unwrap Result or throw
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

describe("Dungeon Generation Determinism Suite", () => {
  let referenceDungeon: Dungeon;

  beforeEach(() => {
    // Generate reference dungeon for all tests
    const result = DungeonManager.generateFromSeedSync(TEST_SEED, baseConfig);
    referenceDungeon = unwrap(result);
  });

  describe("Core Determinism", () => {
    test("should produce identical results across multiple generations", () => {
      const results = Array.from({ length: DETERMINISM_ITERATIONS }, (_, i) => {
        const result = DungeonManager.generateFromSeedSync(
          TEST_SEED,
          baseConfig,
        );
        const dungeon = unwrap(result);
        return {
          checksum: dungeon.checksum,
          roomCount: dungeon.rooms.length,
          connectionCount: dungeon.connections.length,
          iteration: i + 1,
        };
      });

      // All checksums should be identical
      const checksums = results.map((r) => r.checksum);
      const uniqueChecksums = new Set(checksums);

      expect(uniqueChecksums.size).toBe(1);
      expect(checksums[0]).toBe(referenceDungeon.checksum);

      // All structural properties should be identical
      results.forEach((result) => {
        expect(result.roomCount).toBe(referenceDungeon.rooms.length);
        expect(result.connectionCount).toBe(
          referenceDungeon.connections.length,
        );
      });
    });

    test("should maintain determinism for numeric seeds", () => {
      const numericSeeds = [TEST_SEED, TEST_SEED];

      const checksums = numericSeeds.map((seed) => {
        const result = DungeonManager.generateFromSeedSync(seed, baseConfig);
        return unwrap(result).checksum;
      });

      // Same numeric seed should produce identical results
      const uniqueChecksums = new Set(checksums);
      expect(uniqueChecksums.size).toBe(1);
    });

    test("should produce different results with different seeds", () => {
      const differentSeeds = [TEST_SEED, TEST_SEED + 1, TEST_SEED + 2];
      const checksums = differentSeeds.map((seed) => {
        const result = DungeonManager.generateFromSeedSync(seed, baseConfig);
        return unwrap(result).checksum;
      });

      // All checksums should be different
      const uniqueChecksums = new Set(checksums);
      expect(uniqueChecksums.size).toBe(differentSeeds.length);
    });
  });

  describe("Async vs Sync Consistency", () => {
    test("should produce identical results for sync and async generation", async () => {
      const syncResult = DungeonManager.generateFromSeedSync(
        TEST_SEED,
        baseConfig,
      );
      const syncDungeon = unwrap(syncResult);

      const asyncResult = await DungeonManager.generateFromSeedAsync(
        TEST_SEED,
        baseConfig,
      );
      const asyncDungeon = unwrap(asyncResult);

      expect(asyncDungeon.checksum).toBe(syncDungeon.checksum);
      expect(asyncDungeon.rooms.length).toBe(syncDungeon.rooms.length);
      expect(asyncDungeon.connections.length).toBe(
        syncDungeon.connections.length,
      );
    });

    test("should provide proper progress updates during async generation", async () => {
      const progressUpdates: number[] = [];
      let updateCount = 0;

      const result = await DungeonManager.generateFromSeedAsync(
        TEST_SEED,
        baseConfig,
        (progress) => {
          progressUpdates.push(progress);
          updateCount++;
        },
      );
      const dungeon = unwrap(result);

      // Should have progress updates
      expect(updateCount).toBeGreaterThan(0);
      expect(progressUpdates[0]).toBe(0);
      expect(progressUpdates[progressUpdates.length - 1]).toBe(100);

      // Progress should be monotonically increasing
      for (let i = 1; i < progressUpdates.length; i++) {
        expect(progressUpdates[i]).toBeGreaterThanOrEqual(
          progressUpdates[i - 1],
        );
      }

      // Result should still be valid
      expect(dungeon.checksum).toBe(referenceDungeon.checksum);
    });
  });

  describe("Structural Integrity", () => {
    test("should generate valid dungeon structure", () => {
      expect(referenceDungeon).toBeDefined();
      expect(referenceDungeon.config).toEqual(baseConfig);
      expect(referenceDungeon.seeds.primary).toBeDefined();
      expect(typeof referenceDungeon.checksum).toBe("string");
      expect(referenceDungeon.checksum.length).toBeGreaterThan(0);
    });

    test("should generate rooms within dungeon bounds", () => {
      referenceDungeon.rooms.forEach((room) => {
        expect(room.x).toBeGreaterThanOrEqual(0);
        expect(room.y).toBeGreaterThanOrEqual(0);
        expect(room.x + room.width).toBeLessThanOrEqual(baseConfig.width);
        expect(room.y + room.height).toBeLessThanOrEqual(baseConfig.height);
        expect(room.width).toBeGreaterThanOrEqual(baseConfig.roomSizeRange[0]);
        expect(room.height).toBeGreaterThanOrEqual(baseConfig.roomSizeRange[0]);
        expect(room.width).toBeLessThanOrEqual(baseConfig.roomSizeRange[1]);
        expect(room.height).toBeLessThanOrEqual(baseConfig.roomSizeRange[1]);
      });
    });

    test("should generate valid connections between rooms", () => {
      referenceDungeon.connections.forEach((connection) => {
        expect(connection.from).toBeDefined();
        expect(connection.to).toBeDefined();
        expect(connection.path).toBeDefined();
        expect(connection.path.length).toBeGreaterThan(0);
      });
    });
  });

  describe("Generator Validation", () => {
    test("should pass internal determinism validation", () => {
      // Create generator instance for internal validation
      const result = DungeonManager.generateFromSeedSync(TEST_SEED, baseConfig);
      const dungeon = unwrap(result);
      const generator = new CellularGenerator(baseConfig, dungeon.seeds);

      const isDeterministic = DungeonManager.validateDeterminism(generator);
      expect(isDeterministic).toBe(true);
    });

    test("should handle edge case configurations", () => {
      const edgeConfigs = [
        { ...baseConfig, width: 40, height: 30, roomCount: 3 },
        { ...baseConfig, width: 32, height: 24, roomCount: 2 },
        { ...baseConfig, roomSizeRange: [5, 8] as [number, number] },
      ];

      edgeConfigs.forEach((config) => {
        const result = DungeonManager.generateFromSeedSync(TEST_SEED, config);
        const dungeon = unwrap(result);
        expect(dungeon).toBeDefined();
        expect(dungeon.rooms.length).toBeGreaterThanOrEqual(0);
        expect(dungeon.checksum).toBeDefined();
      });
    });
  });

  describe("Performance Characteristics", () => {
    test("should maintain consistent generation time", () => {
      const times: number[] = [];

      for (let i = 0; i < PERFORMANCE_ITERATIONS; i++) {
        const start = performance.now();
        const result = DungeonManager.generateFromSeedSync(
          TEST_SEED,
          baseConfig,
        );
        unwrap(result);
        const end = performance.now();
        times.push(end - start);
      }

      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      const variance =
        times.reduce((sum, time) => sum + (time - avgTime) ** 2, 0) /
        times.length;
      const stdDev = Math.sqrt(variance);

      // Performance should be relatively consistent (std dev < 50% of mean)
      expect(stdDev / avgTime).toBeLessThan(0.5);
    });

    test("should scale reasonably with dungeon size", () => {
      const smallResult = DungeonManager.generateFromSeedSync(
        TEST_SEED,
        baseConfig,
      );
      const smallDungeon = unwrap(smallResult);

      const mediumResult = DungeonManager.generateFromSeedSync(TEST_SEED, {
        ...baseConfig,
        width: 120,
        height: 90,
        roomCount: 12,
      });
      const mediumDungeon = unwrap(mediumResult);

      const largeResult = DungeonManager.generateFromSeedSync(
        TEST_SEED,
        largeConfig,
      );
      const largeDungeon = unwrap(largeResult);

      // All dungeons should be valid
      expect(smallDungeon).toBeDefined();
      expect(mediumDungeon).toBeDefined();
      expect(largeDungeon).toBeDefined();

      // Large dungeon should have correct dimensions
      expect(largeDungeon.config.width).toBe(200);
      expect(largeDungeon.config.height).toBe(150);

      // Checksums should be different (different configurations)
      const checksums = [
        smallDungeon.checksum,
        mediumDungeon.checksum,
        largeDungeon.checksum,
      ];
      expect(new Set(checksums).size).toBe(3); // All different
    });
  });

  describe("Serialization & Sharing", () => {
    test("should generate, serialize, and regenerate dungeon identically", () => {
      // Generate a dungeon with a random seed
      const rng = new SeededRandom(TEST_SEED);
      const randomSeed = rng.range(100000, 999999);
      const originalResult = DungeonManager.generateFromSeedSync(
        randomSeed,
        baseConfig,
      );
      const originalDungeon = unwrap(originalResult);

      // Create a share code from the dungeon
      const shareCodeResult =
        DungeonManager.getDungeonShareCode(originalDungeon);
      const shareCode = unwrap(shareCodeResult);

      // Verify that the code is valid
      expect(shareCode).toBeDefined();
      expect(typeof shareCode).toBe("string");
      expect(shareCode.length).toBeGreaterThan(0);

      // Recreate the dungeon from the code
      const regeneratedResult = DungeonManager.regenerateFromCode(
        shareCode,
        baseConfig,
      );
      const regeneratedDungeon = unwrap(regeneratedResult);

      // Verify that regeneration worked
      expect(regeneratedDungeon).toBeDefined();

      // Verify that all elements are identical
      expect(regeneratedDungeon.checksum).toBe(originalDungeon.checksum);
      expect(regeneratedDungeon.config).toEqual(originalDungeon.config);
      expect(regeneratedDungeon.seeds.primary).toBe(
        originalDungeon.seeds.primary,
      );
      expect(regeneratedDungeon.seeds.layout).toBe(
        originalDungeon.seeds.layout,
      );
      expect(regeneratedDungeon.seeds.rooms).toBe(originalDungeon.seeds.rooms);
      expect(regeneratedDungeon.seeds.connections).toBe(
        originalDungeon.seeds.connections,
      );
      expect(regeneratedDungeon.seeds.details).toBe(
        originalDungeon.seeds.details,
      );

      // Verify room structure
      expect(regeneratedDungeon.rooms.length).toBe(
        originalDungeon.rooms.length,
      );
      originalDungeon.rooms.forEach((originalRoom, index) => {
        const regenRoom = regeneratedDungeon.rooms[index];
        expect(regenRoom.x).toBe(originalRoom.x);
        expect(regenRoom.y).toBe(originalRoom.y);
        expect(regenRoom.width).toBe(originalRoom.width);
        expect(regenRoom.height).toBe(originalRoom.height);
        expect(regenRoom.type).toBe(originalRoom.type);
      });

      // Verify connections
      expect(regeneratedDungeon.connections.length).toBe(
        originalDungeon.connections.length,
      );
      originalDungeon.connections.forEach((originalConn, index) => {
        const regenConn = regeneratedDungeon.connections[index];
        expect(regenConn.from).toEqual(originalConn.from);
        expect(regenConn.to).toEqual(originalConn.to);
        expect(regenConn.path.length).toBe(originalConn.path.length);
      });
    });

    test("should handle invalid share codes gracefully", () => {
      const invalidCodes = ["", "invalid", "not-base64!", "12345"];

      invalidCodes.forEach((code) => {
        const result = DungeonManager.regenerateFromCode(code, baseConfig);
        // Should return error for invalid codes
        expect(result.isErr()).toBe(true);
      });
    });

    test("should maintain determinism across serialization round-trip", () => {
      const seeds = [TEST_SEED, TEST_SEED + 1, TEST_SEED + 2];

      seeds.forEach((seed) => {
        // Generate the original dungeon
        const originalResult = DungeonManager.generateFromSeedSync(
          seed,
          baseConfig,
        );
        const original = unwrap(originalResult);

        // Serialize and deserialize
        const shareCodeResult = DungeonManager.getDungeonShareCode(original);
        const shareCode = unwrap(shareCodeResult);
        const regeneratedResult = DungeonManager.regenerateFromCode(
          shareCode,
          baseConfig,
        );
        const regenerated = unwrap(regeneratedResult);

        // Verify consistency
        expect(regenerated).toBeDefined();
        expect(regenerated.checksum).toBe(original.checksum);
        expect(regenerated.rooms.length).toBe(original.rooms.length);
        expect(regenerated.connections.length).toBe(
          original.connections.length,
        );
      });
    });
  });

  describe("Error Handling", () => {
    test("should handle edge configurations", () => {
      const edgeConfigs = [
        { ...baseConfig, width: 40, height: 30, roomCount: 3 },
        { ...baseConfig, width: 32, height: 24, roomCount: 2 },
        largeConfig, // Test large configuration as edge case
      ];

      edgeConfigs.forEach((config) => {
        const result = DungeonManager.generateFromSeedSync(TEST_SEED, config);
        const dungeon = unwrap(result);
        // Should still generate something valid
        expect(dungeon).toBeDefined();
        expect(dungeon.checksum).toBeDefined();
        expect(dungeon.config.width).toBe(config.width);
        expect(dungeon.config.height).toBe(config.height);
      });
    });

    test("should handle extreme seed values", () => {
      const acceptedSeeds = [0, Number.MAX_SAFE_INTEGER];
      const rejectedSeeds = [-1, Number.MIN_SAFE_INTEGER];

      acceptedSeeds.forEach((seed) => {
        const result = DungeonManager.generateFromSeedSync(seed, baseConfig);
        const dungeon = unwrap(result);
        expect(dungeon).toBeDefined();
        expect(dungeon.checksum).toBeDefined();
      });

      rejectedSeeds.forEach((seed) => {
        const result = DungeonManager.generateFromSeedSync(seed, baseConfig);
        expect(result.isErr()).toBeTrue();
        expect(result.error?.code).toBe("SEED_INVALID");
      });
    });
  });
});
