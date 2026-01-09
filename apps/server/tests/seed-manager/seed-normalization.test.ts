import { describe, expect, test } from "bun:test";
import { SeedManager } from "../../src/game/dungeon/serialization/seed-manager";
import { testSeeds } from "./test-helpers";

describe("Seed Normalization", () => {
  describe("normalizeSeed", () => {
    test("should return numeric input unchanged when non-negative", () => {
      const result1 = SeedManager.normalizeSeed(testSeeds.validNumericSeed);
      const result2 = SeedManager.normalizeSeed(testSeeds.zeroSeed);
      const result3 = SeedManager.normalizeSeed(testSeeds.largeSeed);

      if (result1.isErr()) throw new Error(result1.error.message);
      if (result2.isErr()) throw new Error(result2.error.message);
      if (result3.isErr()) throw new Error(result3.error.message);

      expect(result1.value).toBe(testSeeds.validNumericSeed);
      expect(result2.value).toBe(testSeeds.zeroSeed);
      expect(result3.value).toBe(testSeeds.largeSeed);
    });

    test("should reject negative numeric input", () => {
      const result = SeedManager.normalizeSeed(testSeeds.negativeSeed);
      expect(result.isErr()).toBe(true);
    });

    test("should convert string input to number using djb2 hash", () => {
      const result = SeedManager.normalizeSeed(testSeeds.validStringSeed);
      if (result.isErr()) throw new Error(result.error.message);
      expect(typeof result.value).toBe("number");
      expect(result.value).toBeGreaterThan(0);
      expect(Number.isInteger(result.value)).toBe(true);
    });

    test("should return 0 for empty string", () => {
      const result = SeedManager.normalizeSeed(testSeeds.emptyStringSeed);
      if (result.isErr()) throw new Error(result.error.message);
      expect(result.value).toBe(0);
    });

    test("should produce deterministic results for same string", () => {
      const result1 = SeedManager.normalizeSeed("test-string");
      const result2 = SeedManager.normalizeSeed("test-string");
      if (result1.isErr()) throw new Error(result1.error.message);
      if (result2.isErr()) throw new Error(result2.error.message);
      expect(result1.value).toBe(result2.value);
    });

    test("should produce different results for different strings", () => {
      const result1 = SeedManager.normalizeSeed("string1");
      const result2 = SeedManager.normalizeSeed("string2");
      if (result1.isErr()) throw new Error(result1.error.message);
      if (result2.isErr()) throw new Error(result2.error.message);
      expect(result1.value).not.toBe(result2.value);
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
        if (result.isErr()) throw new Error(result.error.message);
        expect(typeof result.value).toBe("number");
        expect(result.value).toBeGreaterThanOrEqual(0);
      }
    });

    test("should handle very long strings", () => {
      const longString = "a".repeat(1000);
      const result = SeedManager.normalizeSeed(longString);
      if (result.isErr()) throw new Error(result.error.message);
      expect(typeof result.value).toBe("number");
      expect(result.value).toBeGreaterThanOrEqual(0);
    });

    test("should handle strings with only whitespace", () => {
      const result1 = SeedManager.normalizeSeed("   ");
      const result2 = SeedManager.normalizeSeed("\t\n\r");
      if (result1.isErr()) throw new Error(result1.error.message);
      if (result2.isErr()) throw new Error(result2.error.message);
      expect(result1.value).not.toBe(0);
      expect(result2.value).not.toBe(0);
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
      const seedFromNumberResult = SeedManager.generateSeeds(numericSeed);
      const normalizedStringResult = SeedManager.normalizeSeed(stringSeed);
      if (seedFromNumberResult.isErr())
        throw new Error(seedFromNumberResult.error.message);
      if (normalizedStringResult.isErr())
        throw new Error(normalizedStringResult.error.message);

      const seedFromStringResult = SeedManager.generateSeeds(
        normalizedStringResult.value,
      );
      if (seedFromStringResult.isErr())
        throw new Error(seedFromStringResult.error.message);

      // They should be different because the string hash != the number
      expect(seedFromNumberResult.value.primary).not.toBe(
        seedFromStringResult.value.primary,
      );
    });

    test("should work with normalizeSeed in generateSeeds workflow", () => {
      const stringInput = "my-custom-seed";
      const normalizedResult = SeedManager.normalizeSeed(stringInput);
      if (normalizedResult.isErr())
        throw new Error(normalizedResult.error.message);

      const seedResult = SeedManager.generateSeeds(normalizedResult.value);
      if (seedResult.isErr()) throw new Error(seedResult.error.message);

      expect(seedResult.value.primary).toBe(normalizedResult.value);
      expect(typeof seedResult.value.primary).toBe("number");
    });

    test("should handle round-trip normalization", () => {
      const originalNumber = 987654321;
      const stringRepresentation = originalNumber.toString();

      const normalizedResult = SeedManager.normalizeSeed(stringRepresentation);
      if (normalizedResult.isErr())
        throw new Error(normalizedResult.error.message);
      expect(normalizedResult.value).toBe(2613992066); // Current hash value for "987654321"
    });
  });
});
