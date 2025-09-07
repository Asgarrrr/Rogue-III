import { describe, expect, test } from "bun:test";
import { SeedManager } from "../../src/engine/dungeon/serialization/seed-manager";
import { testSeeds } from "./test-helpers";

describe("Seed Generation", () => {
	describe("generateSeeds", () => {
		test("should generate a complete seed with all required properties", () => {
			const seed = SeedManager.generateSeeds(testSeeds.validNumericSeed);

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
			const seed = SeedManager.generateSeeds(testSeeds.validNumericSeed);
			expect(seed.primary).toBe(testSeeds.validNumericSeed);
		});

		test("should generate deterministic layout seed using XOR with magic number", () => {
			const seed1 = SeedManager.generateSeeds(testSeeds.validNumericSeed);
			const seed2 = SeedManager.generateSeeds(testSeeds.validNumericSeed);

			expect(seed1.layout).toBe(seed2.layout);
			expect(seed1.layout).toBe(
				Math.abs(testSeeds.validNumericSeed ^ 0x9e3779b9)
			);
		});

		test("should generate room, connection, and detail seeds within expected ranges", () => {
			const seed = SeedManager.generateSeeds(testSeeds.validNumericSeed);

			expect(seed.rooms).toBeGreaterThanOrEqual(1000000);
			expect(seed.rooms).toBeLessThanOrEqual(9999999);

			expect(seed.connections).toBeGreaterThanOrEqual(1000000);
			expect(seed.connections).toBeLessThanOrEqual(9999999);

			expect(seed.details).toBeGreaterThanOrEqual(1000000);
			expect(seed.details).toBeLessThanOrEqual(9999999);
		});

		test("should use default version when not specified", () => {
			const seed = SeedManager.generateSeeds(testSeeds.validNumericSeed);
			expect(seed.version).toBe("1.0.0");
		});

		test("should use custom version when provided", () => {
			const customVersion = "2.1.0";
			const seed = SeedManager.generateSeeds(
				testSeeds.validNumericSeed,
				customVersion
			);
			expect(seed.version).toBe(customVersion);
		});

		test("should generate recent timestamp", () => {
			const before = Date.now();
			const seed = SeedManager.generateSeeds(testSeeds.validNumericSeed);
			const after = Date.now();

			expect(seed.timestamp).toBeGreaterThanOrEqual(before);
			expect(seed.timestamp).toBeLessThanOrEqual(after);
		});

		test("should handle edge case seeds", () => {
			expect(() => SeedManager.generateSeeds(testSeeds.zeroSeed)).not.toThrow();
			expect(() =>
				SeedManager.generateSeeds(testSeeds.negativeSeed)
			).not.toThrow();
			expect(() =>
				SeedManager.generateSeeds(testSeeds.largeSeed)
			).not.toThrow();
			expect(() =>
				SeedManager.generateSeeds(testSeeds.smallSeed)
			).not.toThrow();
		});

		test("should generate different seeds for different inputs", () => {
			const seed1 = SeedManager.generateSeeds(111111111);
			const seed2 = SeedManager.generateSeeds(222222222);

			expect(seed1.primary).not.toBe(seed2.primary);
			expect(seed1.layout).not.toBe(seed2.layout);
			// Note: rooms, connections, details will likely be different due to different RNG seeds
		});

		test("should generate identical seeds for same input", () => {
			const seed1 = SeedManager.generateSeeds(testSeeds.validNumericSeed);
			const seed2 = SeedManager.generateSeeds(testSeeds.validNumericSeed);

			expect(seed1.primary).toBe(seed2.primary);
			expect(seed1.layout).toBe(seed2.layout);
			expect(seed1.rooms).toBe(seed2.rooms);
			expect(seed1.connections).toBe(seed2.connections);
			expect(seed1.details).toBe(seed2.details);
			expect(seed1.version).toBe(seed2.version);
		});
	});
});
