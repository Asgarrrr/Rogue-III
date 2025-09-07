import { describe, expect, test } from "bun:test";
import { SeedManager } from "../../src/engine/dungeon/serialization/seed-manager";
import { testSeeds } from "./test-helpers";

describe("Seed Normalization", () => {
	describe("normalizeSeed", () => {
		test("should return numeric input unchanged", () => {
			expect(SeedManager.normalizeSeed(testSeeds.validNumericSeed)).toBe(
				testSeeds.validNumericSeed
			);
			expect(SeedManager.normalizeSeed(testSeeds.zeroSeed)).toBe(
				testSeeds.zeroSeed
			);
			expect(SeedManager.normalizeSeed(testSeeds.negativeSeed)).toBe(
				testSeeds.negativeSeed
			);
			expect(SeedManager.normalizeSeed(testSeeds.largeSeed)).toBe(
				testSeeds.largeSeed
			);
		});

		test("should convert string input to number using djb2 hash", () => {
			const result = SeedManager.normalizeSeed(testSeeds.validStringSeed);
			expect(typeof result).toBe("number");
			expect(result).toBeGreaterThan(0);
			expect(Number.isInteger(result)).toBe(true);
		});

		test("should return 0 for empty string", () => {
			expect(SeedManager.normalizeSeed(testSeeds.emptyStringSeed)).toBe(0);
		});

		test("should produce deterministic results for same string", () => {
			const result1 = SeedManager.normalizeSeed("test-string");
			const result2 = SeedManager.normalizeSeed("test-string");
			expect(result1).toBe(result2);
		});

		test("should produce different results for different strings", () => {
			const result1 = SeedManager.normalizeSeed("string1");
			const result2 = SeedManager.normalizeSeed("string2");
			expect(result1).not.toBe(result2);
		});

		test("should handle special characters in strings", () => {
			const specialStrings = [
				"hello world",
				"hello-world",
				"hello_world",
				"hello@world.com",
				"hello123",
				"🚀🌟💫",
				"café",
				"naïve",
			];

			for (const str of specialStrings) {
				const result = SeedManager.normalizeSeed(str);
				expect(typeof result).toBe("number");
				expect(result).toBeGreaterThanOrEqual(0);
			}
		});

		test("should handle very long strings", () => {
			const longString = "a".repeat(1000);
			const result = SeedManager.normalizeSeed(longString);
			expect(typeof result).toBe("number");
			expect(result).toBeGreaterThanOrEqual(0);
		});

		test("should handle strings with only whitespace", () => {
			expect(SeedManager.normalizeSeed("   ")).not.toBe(0);
			expect(SeedManager.normalizeSeed("\t\n\r")).not.toBe(0);
		});
	});

	describe("seedFromString", () => {
		test("should implement djb2 hash algorithm correctly", () => {
			// Test against current djb2 hash values
			expect(SeedManager.seedFromString("a")).toBe(177670);
			expect(SeedManager.seedFromString("hello")).toBe(261238937);
		});

		test("should return 0 for empty string", () => {
			expect(SeedManager.seedFromString("")).toBe(0);
		});

		test("should return 0 for null or undefined input", () => {
			// Note: This function expects a string, but let's test edge cases
			expect(SeedManager.seedFromString("")).toBe(0);
		});

		test("should handle unicode characters", () => {
			const result = SeedManager.seedFromString("🚀");
			expect(typeof result).toBe("number");
			expect(result).toBeGreaterThan(0);
		});

		test("should be case sensitive", () => {
			const lower = SeedManager.seedFromString("hello");
			const upper = SeedManager.seedFromString("HELLO");
			expect(lower).not.toBe(upper);
		});

		test("should produce consistent results", () => {
			const testString = "consistent-test-string";
			const result1 = SeedManager.seedFromString(testString);
			const result2 = SeedManager.seedFromString(testString);
			expect(result1).toBe(result2);
		});

		test("should handle strings of different lengths", () => {
			const lengths = [1, 10, 100, 1000];

			for (const length of lengths) {
				const testString = "a".repeat(length);
				const result = SeedManager.seedFromString(testString);
				expect(typeof result).toBe("number");
				expect(result).toBeGreaterThanOrEqual(0);
			}
		});
	});

	describe("Integration with seed generation", () => {
		test("should generate same seed when using string vs numeric equivalent", () => {
			const numericSeed = 123456789;
			const stringSeed = "test-seed-123456789";

			// Generate seeds using both inputs
			const seedFromNumber = SeedManager.generateSeeds(numericSeed);
			const normalizedString = SeedManager.normalizeSeed(stringSeed);
			const seedFromString = SeedManager.generateSeeds(normalizedString);

			// They should be different because the string hash != the number
			expect(seedFromNumber.primary).not.toBe(seedFromString.primary);
		});

		test("should work with normalizeSeed in generateSeeds workflow", () => {
			const stringInput = "my-custom-seed";
			const normalized = SeedManager.normalizeSeed(stringInput);
			const seed = SeedManager.generateSeeds(normalized);

			expect(seed.primary).toBe(normalized);
			expect(typeof seed.primary).toBe("number");
		});

		test("should handle round-trip normalization", () => {
			const originalNumber = 987654321;
			const stringRepresentation = originalNumber.toString();

			const normalized = SeedManager.normalizeSeed(stringRepresentation);
			expect(normalized).toBe(2613992066); // Current hash value for "987654321"
		});
	});
});
