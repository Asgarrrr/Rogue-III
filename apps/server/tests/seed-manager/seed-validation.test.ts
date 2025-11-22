import { describe, expect, test } from "bun:test";
import { SeedManager } from "../../src/engine/dungeon/serialization/seed-manager";
import { createMockSeed } from "./test-helpers";
import type { DungeonSeed } from "../../src/engine/dungeon/core/types/dungeon.types";

describe("Seed Validation", () => {
	describe("Schema validation", () => {
		test("should accept valid seed format", () => {
			const validSeed = createMockSeed();
			const encoded = SeedManager.encodeSeed(validSeed);
			if (encoded.isErr()) throw new Error(encoded.error.message);

			const decoded = SeedManager.decodeSeed(encoded.value);

			expect(decoded.isOk()).toBe(true);
			if (decoded.isErr()) throw new Error(decoded.error.message);
			expect(decoded.value).toEqual(validSeed);
		});

		test("should validate version format", () => {
			const validVersions = ["1.0.0", "2.1.3", "0.1.0", "10.99.999"];
			const invalidVersions = ["1.0", "1.0.0.0", "abc", "1.0.a", ""];

			for (const version of validVersions) {
				const seed = createMockSeed({ version });
				const encoded = SeedManager.encodeSeed(seed);
				if (encoded.isErr()) throw new Error(encoded.error.message);

				const decoded = SeedManager.decodeSeed(encoded.value);
				expect(decoded.isOk()).toBe(true);
				if (decoded.isErr()) throw new Error(decoded.error.message);
			}
		});

		test("should handle timestamp validation", () => {
			const validTimestamps = [
				1,
				1000000000,
				Date.now(),
				Number.MAX_SAFE_INTEGER,
			];
			const invalidTimestamps = [-1, -1000000, 0];

			for (const timestamp of validTimestamps) {
				const seed = createMockSeed({ timestamp });
				const encoded = SeedManager.encodeSeed(seed);
				if (encoded.isErr()) throw new Error(encoded.error.message);

				const decoded = SeedManager.decodeSeed(encoded.value);

				if (decoded.isErr()) {
					throw new Error(decoded.error.message);
				}

				expect(decoded.value).not.toBeNull();
				expect(decoded.value.timestamp).toBe(timestamp);
			}

			// Test invalid timestamps (should fail validation)
			for (const timestamp of invalidTimestamps) {
				const seed = createMockSeed({ timestamp });
				const encoded = SeedManager.encodeSeed(seed);
				expect(encoded.isErr()).toBe(true); // Should fail at encoding step
			}
		});
	});

	describe("Error handling", () => {
		test("should handle null decode results gracefully", () => {
			const invalidEncodedStrings = [
				"",
				"invalid",
				"not-base64!",
				"123", // Too few parts
				"123|456|789|012|345|678|901|234", // Too many parts
			];

			for (const invalidString of invalidEncodedStrings) {
				const result = SeedManager.decodeSeed(invalidString);
				expect(result.isErr()).toBe(true);
			}
		});

		test("should handle malformed JSON/data gracefully", () => {
			const malformedData = [
				"not-a-number|456|789|012|345|678",
				"123|not-a-number|789|012|345|678",
				"123|456|not-a-number|012|345|678",
				"123|456|789|not-a-number|345|678",
				"123|456|789|012|not-a-number|678",
				"123|456|789|012|345|not-a-number",
			];

			for (const data of malformedData) {
				// Manually call the internal functions that would be tested
				const result = SeedManager.decodeSeed(data);
				expect(result.isErr()).toBe(true);
			}
		});

		test("should handle edge cases in base64url conversion", () => {
			const edgeCases = [
				"A", // Minimal valid input
				"A".repeat(100), // Very long input
				"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_", // All valid chars
			];

			for (const edgeCase of edgeCases) {
				// These should not throw exceptions, even if they return null
				expect(() => {
					SeedManager.decodeSeed(edgeCase);
				}).not.toThrow();
			}
		});

		test("should handle concurrent operations safely", async () => {
			const operations = Array.from({ length: 100 }, async (_, i) => {
				const seed = SeedManager.generateSeeds(1000 + i);
				const encoded = SeedManager.encodeSeed(seed);
				if (encoded.isErr()) throw new Error(encoded.error.message);

				const decoded = SeedManager.decodeSeed(encoded.value);

				if (decoded.isErr()) throw new Error(decoded.error.message);

				return decoded.value.primary === seed.primary;
			});

			const results = await Promise.all(operations);
			const allSuccessful = results.every((result) => result);
			expect(allSuccessful).toBe(true);
		});
	});

	describe("Data integrity", () => {
		test("should detect corrupted encoded data", () => {
			const originalSeed = createMockSeed();
			const encoded = SeedManager.encodeSeed(originalSeed);
			if (encoded.isErr()) throw new Error(encoded.error.message);

			// Corrupt the encoded string more significantly by replacing multiple characters
			const corrupted =
				encoded.value.substring(0, 5) + "XXXXX" + encoded.value.substring(10);
			const decoded = SeedManager.decodeSeed(corrupted);

			expect(decoded.isErr()).toBe(true);
		});

		test("should handle truncated encoded strings", () => {
			const originalSeed = createMockSeed();
			const encoded = SeedManager.encodeSeed(originalSeed);
			if (encoded.isErr()) throw new Error(encoded.error.message);

			for (let i = 1; i < Math.min(encoded.value.length, 20); i++) {
				const truncated = encoded.value.substring(0, i);
				const decoded = SeedManager.decodeSeed(truncated);
				expect(decoded.isErr()).toBe(true);
			}
		});

		test("should validate seed part ranges", () => {
			const extremeSeeds = [
				createMockSeed({ rooms: 1 }),
				createMockSeed({ connections: 1 }),
				createMockSeed({ details: 1 }),
				createMockSeed({ rooms: Number.MAX_SAFE_INTEGER }),
				createMockSeed({ connections: Number.MAX_SAFE_INTEGER }),
				createMockSeed({ details: Number.MAX_SAFE_INTEGER }),
			];

			for (const seed of extremeSeeds) {
				const encoded = SeedManager.encodeSeed(seed);
				if (encoded.isErr()) throw new Error(encoded.error.message);

				const decoded = SeedManager.decodeSeed(encoded.value);
				expect(decoded.isOk()).toBe(true);
				if (decoded.isErr()) throw new Error(decoded.error.message);
				expect(decoded.value).toEqual(seed);
			}
		});

		test("should handle integer values in seed parts", () => {
			// Create a seed with large integer values
			const largeSeed: DungeonSeed = {
				primary: 123456789,
				layout: 456789012,
				rooms: 1000000123,
				connections: 2000000456,
				details: 3000000789,
				version: "1.0.0",
				timestamp: 1640995200000,
			};

			const encoded = SeedManager.encodeSeed(largeSeed);
			if (encoded.isErr()) throw new Error(encoded.error.message);

			const decoded = SeedManager.decodeSeed(encoded.value);

			if (decoded.isErr()) {
				throw new Error(decoded.error.message);
			}

			expect(decoded.value).not.toBeNull();
			// Values should be preserved as integers
			expect(decoded.value.primary).toBe(123456789);
			expect(decoded.value.layout).toBe(456789012);
			expect(decoded.value.rooms).toBe(1000000123);
			expect(decoded.value.connections).toBe(2000000456);
			expect(decoded.value.details).toBe(3000000789);
			expect(decoded.value.timestamp).toBe(1640995200000);
		});
	});

	describe("Performance and limits", () => {
		test("should handle large encoded strings", () => {
			// Create a seed with large numeric values
			const largeSeed = createMockSeed({
				primary: Number.MAX_SAFE_INTEGER,
				layout: Number.MAX_SAFE_INTEGER - 1,
				rooms: Number.MAX_SAFE_INTEGER - 2,
				connections: Number.MAX_SAFE_INTEGER - 3,
				details: Number.MAX_SAFE_INTEGER - 4,
				timestamp: Number.MAX_SAFE_INTEGER - 5,
			});

			const encoded = SeedManager.encodeSeed(largeSeed);
			if (encoded.isErr()) throw new Error(encoded.error.message);

			const decoded = SeedManager.decodeSeed(encoded.value);

			expect(decoded.isOk()).toBe(true);
			if (decoded.isErr()) throw new Error(decoded.error.message);
			expect(decoded.value).toEqual(largeSeed);
		});

		test("should handle rapid successive operations", () => {
			const iterations = 1000;

			for (let i = 0; i < iterations; i++) {
				const seed = SeedManager.generateSeeds(i + 1); // Start from 1 to avoid negative values
				const encoded = SeedManager.encodeSeed(seed);
				if (encoded.isErr()) throw new Error(encoded.error.message);

				const decoded = SeedManager.decodeSeed(encoded.value);

				if (decoded.isErr()) {
					throw new Error(decoded.error.message);
				}

				expect(decoded.value).not.toBeNull();
				expect(decoded.value.primary).toBe(i + 1);
			}
		});
	});
});
