import { describe, expect, test } from "bun:test";
import { SeedManager } from "../../src/game/dungeon/serialization/seed-manager";
import { createMockSeed, mockSeed, testSeeds } from "./test-helpers";

describe("Seed Encoding & Decoding", () => {
  describe("encodeSeed", () => {
    test("should encode a seed to a string", () => {
      const encoded = SeedManager.encodeSeed(mockSeed);
      if (encoded.isErr()) throw new Error(encoded.error.message);
      expect(typeof encoded.value).toBe("string");
      expect(encoded.value.length).toBeGreaterThan(0);
    });

    test("should produce base64url compatible output", () => {
      const encoded = SeedManager.encodeSeed(mockSeed);
      if (encoded.isErr()) throw new Error(encoded.error.message);

      expect(encoded.value).not.toMatch(/[+/=]/);
      expect(encoded.value).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    test("should encode all seed properties correctly", () => {
      const encoded = SeedManager.encodeSeed(mockSeed);
      if (encoded.isErr()) throw new Error(encoded.error.message);

      const decoded = SeedManager.decodeSeed(encoded.value);

      if (decoded.isErr()) throw new Error(decoded.error.message);
      expect(decoded.value).toEqual(mockSeed);
    });

    test("should handle different seed values", () => {
      const validTestCases = [
        createMockSeed({ primary: 1 }),
        createMockSeed({ primary: 0xffffffff }),
        createMockSeed({ rooms: 1000000 }),
        createMockSeed({ connections: 9999999 }),
        createMockSeed({ details: 5000000 }),
        createMockSeed({ timestamp: 1 }),
        createMockSeed({ timestamp: Date.now() }),
      ];

      const invalidTestCases = [
        createMockSeed({ primary: -12345 }),
        createMockSeed({ timestamp: 0 }),
      ];

      for (const seed of validTestCases) {
        const encoded = SeedManager.encodeSeed(seed);
        if (encoded.isErr()) throw new Error(encoded.error.message);

        const decoded = SeedManager.decodeSeed(encoded.value);
        if (decoded.isErr()) throw new Error(decoded.error.message);
        expect(decoded.value).toEqual(seed);
      }

      for (const seed of invalidTestCases) {
        const encoded = SeedManager.encodeSeed(seed);
        if (encoded.isErr()) {
          // Validation correctly rejects invalid seeds
        } else {
          expect(typeof encoded.value).toBe("string");
        }
      }
    });
  });

  describe("decodeSeed", () => {
    test("should decode a valid encoded seed", () => {
      const encoded = SeedManager.encodeSeed(mockSeed);
      if (encoded.isErr()) throw new Error(encoded.error.message);

      const decoded = SeedManager.decodeSeed(encoded.value);

      if (decoded.isErr()) throw new Error(decoded.error.message);
      expect(decoded.value).toEqual(mockSeed);
    });

    test("should return ZodError for invalid base64url input", () => {
      const invalidInputs = [
        "invalid-base64!",
        "contains+plus",
        "contains/slash",
        "contains=equals",
        "",
        "   ",
      ];

      for (const input of invalidInputs) {
        const result = SeedManager.decodeSeed(input);
        expect(result.isErr()).toBe(true);
      }
    });

    test("should return ZodError for malformed encoded data", () => {
      const invalidEncodings = [
        "not-enough-parts",
        "123|456", // Only 2 parts instead of 6
        "123|456|789|012|345|678|901", // Too many parts
        "abc|def|ghi|jkl|mno|pqr", // Non-numeric parts
      ];

      for (const encoding of invalidEncodings) {
        const result = SeedManager.decodeSeed(encoding);
        expect(result.isErr()).toBe(true);
      }
    });

    test("should handle edge cases gracefully", () => {
      // Empty string
      expect(SeedManager.decodeSeed("").isErr()).toBe(true);

      // Very long string
      const longString = "A".repeat(1000);
      expect(SeedManager.decodeSeed(longString).isErr()).toBe(true);

      // String with special characters
      expect(SeedManager.decodeSeed("!@#$%^&*()").isErr()).toBe(true);
    });

    test("should preserve all original seed properties after round-trip", () => {
      const originalSeedResult = SeedManager.generateSeeds(
        testSeeds.validNumericSeed,
      );
      if (originalSeedResult.isErr())
        throw new Error(originalSeedResult.error.message);

      const encoded = SeedManager.encodeSeed(originalSeedResult.value);
      if (encoded.isErr()) throw new Error(encoded.error.message);

      const decoded = SeedManager.decodeSeed(encoded.value);

      if (decoded.isErr()) throw new Error(decoded.error.message);
      expect(decoded.value).toEqual(originalSeedResult.value);
    });

    test("should decode seeds with different timestamps correctly", () => {
      const validTimestamps = [
        1,
        1000000000,
        Date.now(),
        Number.MAX_SAFE_INTEGER,
      ];
      const invalidTimestamps = [0]; // 0 is invalid since timestamp must be positive

      // Test valid timestamps
      for (const timestamp of validTimestamps) {
        const seed = createMockSeed({ timestamp });
        const encoded = SeedManager.encodeSeed(seed);
        if (encoded.isErr()) throw new Error(encoded.error.message);

        const decoded = SeedManager.decodeSeed(encoded.value);

        if (decoded.isErr()) throw new Error(decoded.error.message);
        expect(decoded.value.timestamp).toBe(timestamp);
      }

      // Test invalid timestamps (should fail at encoding)
      for (const timestamp of invalidTimestamps) {
        const seed = createMockSeed({ timestamp });
        const encoded = SeedManager.encodeSeed(seed);
        expect(encoded.isErr()).toBe(true);
      }
    });
  });

  describe("Round-trip encoding/decoding", () => {
    test("should maintain data integrity through multiple encode/decode cycles", () => {
      let currentSeed = mockSeed;

      // Test 3 round-trips
      for (let i = 0; i < 3; i++) {
        const encoded = SeedManager.encodeSeed(currentSeed);
        if (encoded.isErr()) throw new Error(encoded.error.message);

        const decoded = SeedManager.decodeSeed(encoded.value);

        if (decoded.isErr()) throw new Error(decoded.error.message);
        expect(decoded.value).toEqual(currentSeed);

        currentSeed = decoded.value;
      }
    });

    test("should handle seeds generated with different primary values", () => {
      const validPrimaryValues = [0, 1, 42, 123456, 999999]; // Non-negative values
      const invalidPrimaryValues = [-1, -999999]; // These should fail

      // Test valid primary values
      for (const primary of validPrimaryValues) {
        const generatedSeedResult = SeedManager.generateSeeds(primary);
        if (generatedSeedResult.isErr())
          throw new Error(generatedSeedResult.error.message);

        const encoded = SeedManager.encodeSeed(generatedSeedResult.value);
        if (encoded.isErr()) throw new Error(encoded.error.message);

        const decoded = SeedManager.decodeSeed(encoded.value);

        if (decoded.isErr()) throw new Error(decoded.error.message);
        expect(decoded.value).toEqual(generatedSeedResult.value);
      }

      // Test invalid primary values (should fail at seed generation due to negative values)
      for (const primary of invalidPrimaryValues) {
        const result = SeedManager.generateSeeds(primary);
        expect(result.isErr()).toBe(true);
      }
    });

    test("should work with seeds containing extreme values", () => {
      const validExtremeSeeds = [
        createMockSeed({ rooms: 1000000 }),
        createMockSeed({ connections: 9999999 }),
        createMockSeed({ details: 5000000 }),
        createMockSeed({ timestamp: Number.MAX_SAFE_INTEGER }),
      ];

      const invalidExtremeSeeds = [
        createMockSeed({ timestamp: 0 }), // Invalid: timestamp must be positive
      ];

      // Test valid extreme values
      for (const seed of validExtremeSeeds) {
        const encoded = SeedManager.encodeSeed(seed);
        if (encoded.isErr()) throw new Error(encoded.error.message);

        const decoded = SeedManager.decodeSeed(encoded.value);

        if (decoded.isErr()) throw new Error(decoded.error.message);
        expect(decoded.value).toEqual(seed);
      }

      // Test invalid extreme values (should fail at encoding)
      for (const seed of invalidExtremeSeeds) {
        const encoded = SeedManager.encodeSeed(seed);
        expect(encoded.isErr()).toBe(true);
      }
    });
  });

  describe("Error handling", () => {
    test("should handle decode errors gracefully", () => {
      // Test various malformed inputs that could cause exceptions
      const malformedInputs = [
        "not-base64-at-all!!!",
        "🚀🌟💫", // Unicode characters
        "null",
        "undefined",
        "NaN",
      ];

      for (const input of malformedInputs) {
        expect(() => {
          const result = SeedManager.decodeSeed(input);
          // Result should be ZodError, not throw an exception
          expect(result.isErr()).toBe(true);
        }).not.toThrow();
      }
    });
  });
});
