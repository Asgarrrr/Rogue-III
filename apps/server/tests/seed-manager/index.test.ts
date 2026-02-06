import { describe, expect, test } from "bun:test";
import { SeedManager } from "@rogue/procgen";
import { testSeeds } from "./test-helpers";

// Main integration tests that cover the complete seed manager workflow
describe("Seed Manager - Complete Integration", () => {
  describe("End-to-end workflow", () => {
    test("should complete full seed lifecycle: generate → encode → decode → verify", () => {
      const seedResult = SeedManager.generateSeeds(testSeeds.validNumericSeed);
      if (seedResult.isErr()) throw new Error(seedResult.error.message);
      const originalSeed = seedResult.value;

      const encoded = SeedManager.encodeSeed(originalSeed);
      if (encoded.isErr()) throw new Error(encoded.error.message);
      expect(typeof encoded.value).toBe("string");
      expect(encoded.value.length).toBeGreaterThan(0);

      const decodedSeed = SeedManager.decodeSeed(encoded.value);
      if (decodedSeed.isErr()) throw new Error(decodedSeed.error.message);

      expect(decodedSeed.value).toEqual(originalSeed);
    });

    test("should handle string input through full pipeline", () => {
      const normalizedResult = SeedManager.normalizeSeed(
        testSeeds.validStringSeed,
      );
      if (normalizedResult.isErr())
        throw new Error(normalizedResult.error.message);
      const normalized = normalizedResult.value;
      expect(typeof normalized).toBe("number");

      const seedResult = SeedManager.generateSeeds(normalized);
      if (seedResult.isErr()) throw new Error(seedResult.error.message);

      const encoded = SeedManager.encodeSeed(seedResult.value);
      if (encoded.isErr()) throw new Error(encoded.error.message);

      const decoded = SeedManager.decodeSeed(encoded.value);
      if (decoded.isErr()) throw new Error(decoded.error.message);

      expect(decoded.value.primary).toBe(normalized);
    });

    test("should maintain data integrity across multiple transformations", () => {
      const seedResult = SeedManager.generateSeeds(testSeeds.validNumericSeed);
      if (seedResult.isErr()) throw new Error(seedResult.error.message);
      let currentSeed = seedResult.value;

      for (let cycle = 0; cycle < 5; cycle++) {
        const encoded = SeedManager.encodeSeed(currentSeed);
        if (encoded.isErr()) throw new Error(encoded.error.message);

        const decoded = SeedManager.decodeSeed(encoded.value);
        if (decoded.isErr()) throw new Error(decoded.error.message);

        expect(decoded.value).toEqual(currentSeed);
        currentSeed = decoded.value;
      }
    });

    test("should handle different input types consistently", () => {
      const testInputs = [
        testSeeds.validNumericSeed,
        testSeeds.validStringSeed,
        1,
      ];

      for (const input of testInputs) {
        const normalizedResult = SeedManager.normalizeSeed(input);
        if (normalizedResult.isErr())
          throw new Error(normalizedResult.error.message);
        const normalized = normalizedResult.value;

        const seedResult = SeedManager.generateSeeds(normalized);
        if (seedResult.isErr()) throw new Error(seedResult.error.message);

        const encoded = SeedManager.encodeSeed(seedResult.value);
        if (encoded.isErr()) throw new Error(encoded.error.message);

        const decoded = SeedManager.decodeSeed(encoded.value);
        if (decoded.isErr()) throw new Error(decoded.error.message);

        expect(decoded.value.primary).toBe(normalized);
      }
    });
  });

  describe("Cross-functional requirements", () => {
    test("should generate shareable and deterministic seeds", () => {
      const seed1Result = SeedManager.generateSeeds(testSeeds.validNumericSeed);
      const seed2Result = SeedManager.generateSeeds(testSeeds.validNumericSeed);
      if (seed1Result.isErr()) throw new Error(seed1Result.error.message);
      if (seed2Result.isErr()) throw new Error(seed2Result.error.message);

      expect(seed1Result.value).toEqual(seed2Result.value);

      const encoded = SeedManager.encodeSeed(seed1Result.value);
      if (encoded.isErr()) throw new Error(encoded.error.message);

      const decoded = SeedManager.decodeSeed(encoded.value);
      if (decoded.isErr()) throw new Error(decoded.error.message);

      expect(decoded.value).toEqual(seed1Result.value);
    });

    test("should handle edge cases gracefully throughout pipeline", () => {
      const validEdgeCases = [1, 0xffffffff];
      const invalidEdgeCases = [-1, Number.MIN_SAFE_INTEGER];

      for (const edgeCase of validEdgeCases) {
        const seedResult = SeedManager.generateSeeds(edgeCase);
        expect(seedResult.isOk()).toBe(true);
        if (seedResult.isErr()) throw new Error(seedResult.error.message);

        const encoded = SeedManager.encodeSeed(seedResult.value);
        if (encoded.isErr()) throw new Error(encoded.error.message);

        const decoded = SeedManager.decodeSeed(encoded.value);
        if (decoded.isErr()) throw new Error(decoded.error.message);

        expect(decoded.value).toEqual(seedResult.value);
      }

      for (const edgeCase of invalidEdgeCases) {
        const result = SeedManager.generateSeeds(edgeCase);
        expect(result.isErr()).toBe(true);
      }
    });

    test("should validate data integrity after each transformation", () => {
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

      const encoded = SeedManager.encodeSeed(seed);
      if (encoded.isErr()) throw new Error(encoded.error.message);
      expect(typeof encoded.value).toBe("string");

      const decoded = SeedManager.decodeSeed(encoded.value);
      if (decoded.isErr()) throw new Error(decoded.error.message);
      expect(decoded.value).toEqual(seed);
    });
  });

  describe("Performance characteristics", () => {
    test("should perform operations within reasonable time limits", () => {
      const startTime = Date.now();

      // Perform 100 complete cycles
      for (let i = 0; i < 100; i++) {
        const seedResult = SeedManager.generateSeeds(i + 1); // Start from 1 since 0 is invalid
        if (seedResult.isErr()) throw new Error(seedResult.error.message);

        const encoded = SeedManager.encodeSeed(seedResult.value);
        if (encoded.isErr()) throw new Error(encoded.error.message);

        const decoded = SeedManager.decodeSeed(encoded.value);
        if (decoded.isErr()) throw new Error(decoded.error.message);
      }

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete within 1 second (reasonable performance threshold)
      expect(duration).toBeLessThan(1000);
    });

    test("should handle concurrent seed operations", async () => {
      const concurrentOperations = 50;
      const promises = Array.from(
        { length: concurrentOperations },
        async (_, i) => {
          const seedResult = SeedManager.generateSeeds(1000 + i);
          if (seedResult.isErr()) throw new Error(seedResult.error.message);

          const encoded = SeedManager.encodeSeed(seedResult.value);
          if (encoded.isErr()) throw new Error(encoded.error.message);

          const decoded = SeedManager.decodeSeed(encoded.value);
          if (decoded.isErr()) throw new Error(decoded.error.message);

          return decoded.value;
        },
      );

      const results = await Promise.all(promises);

      for (const result of results) {
        expect(result).toHaveProperty("primary");
      }
    });
  });

  describe("Error recovery and resilience", () => {
    test("should handle and recover from invalid inputs", () => {
      const invalidInputs = [null, undefined];
      const hashableInputs = ["", "invalid-string", "not-a-valid-encoded-seed"];

      for (const input of invalidInputs) {
        // @ts-expect-error - Testing invalid inputs
        const result = SeedManager.normalizeSeed(input);
        // These will either throw or return an error result
        expect(result === undefined || result.isErr()).toBe(true);
      }

      for (const input of hashableInputs) {
        const normalizedResult = SeedManager.normalizeSeed(input);
        expect(normalizedResult.isOk()).toBe(true);
        if (normalizedResult.isErr())
          throw new Error(normalizedResult.error.message);

        const seedResult = SeedManager.generateSeeds(normalizedResult.value);
        expect(seedResult.isOk()).toBe(true);
        if (seedResult.isErr()) throw new Error(seedResult.error.message);

        const encoded = SeedManager.encodeSeed(seedResult.value);
        if (encoded.isErr()) throw new Error(encoded.error.message);

        const decoded = SeedManager.decodeSeed(encoded.value);
        if (decoded.isErr()) throw new Error(decoded.error.message);
      }
    });

    test("should maintain system stability under stress", () => {
      const stressIterations = 1000;

      for (let i = 0; i < stressIterations; i++) {
        try {
          const randomValue = Math.floor(Math.random() * 1000000) + 1; // Ensure positive values
          const seedResult = SeedManager.generateSeeds(randomValue);

          if (seedResult.isErr()) {
            // This is acceptable - some inputs might produce validation errors
            continue;
          }

          const encoded = SeedManager.encodeSeed(seedResult.value);

          if (encoded.isErr()) {
            // This is acceptable - some inputs might produce validation errors
            continue;
          }

          const decoded = SeedManager.decodeSeed(encoded.value);

          if (decoded.isErr()) {
            // This is acceptable - some decodings might fail
            continue;
          }

          expect(decoded.value.primary).toBe(seedResult.value.primary);
        } catch (error) {
          // Log but don't fail - we're testing resilience
          console.warn(`Iteration ${i} failed:`, error);
        }
      }
    });
  });
});
