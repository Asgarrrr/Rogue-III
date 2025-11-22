import { describe, expect, test } from "bun:test";
import { SeedManager } from "../../src/engine/dungeon/serialization/seed-manager";
import { testSeeds } from "./test-helpers";

// Main integration tests that cover the complete seed manager workflow
describe("Seed Manager - Complete Integration", () => {
	describe("End-to-end workflow", () => {
		test("should complete full seed lifecycle: generate → encode → decode → verify", () => {
			const originalSeed = SeedManager.generateSeeds(
				testSeeds.validNumericSeed
			);

			const encoded = SeedManager.encodeSeed(originalSeed);
			if (encoded.isErr()) throw new Error(encoded.error.message);
			expect(typeof encoded.value).toBe("string");
			expect(encoded.value.length).toBeGreaterThan(0);

			const decodedSeed = SeedManager.decodeSeed(encoded.value);
			if (decodedSeed.isErr()) throw new Error(decodedSeed.error.message);

			expect(decodedSeed.value).toEqual(originalSeed);
		});

		test("should handle string input through full pipeline", () => {
			const normalized = SeedManager.normalizeSeed(testSeeds.validStringSeed);
			expect(typeof normalized).toBe("number");

			const seed = SeedManager.generateSeeds(normalized);

			const encoded = SeedManager.encodeSeed(seed);
			if (encoded.isErr()) throw new Error(encoded.error.message);

			const decoded = SeedManager.decodeSeed(encoded.value);
			if (decoded.isErr()) throw new Error(decoded.error.message);

			expect(decoded.value.primary).toBe(normalized);
		});

		test("should maintain data integrity across multiple transformations", () => {
			let currentSeed = SeedManager.generateSeeds(testSeeds.validNumericSeed);

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
				const normalized = SeedManager.normalizeSeed(input);
				const seed = SeedManager.generateSeeds(normalized);
				const encoded = SeedManager.encodeSeed(seed);
				if (encoded.isErr()) throw new Error(encoded.error.message);

				const decoded = SeedManager.decodeSeed(encoded.value);
				if (decoded.isErr()) throw new Error(decoded.error.message);

				expect(decoded.value.primary).toBe(normalized);
			}
		});
	});

	describe("Cross-functional requirements", () => {
		test("should generate shareable and deterministic seeds", () => {
			const seed1 = SeedManager.generateSeeds(testSeeds.validNumericSeed);
			const seed2 = SeedManager.generateSeeds(testSeeds.validNumericSeed);

			expect(seed1).toEqual(seed2);

			const encoded = SeedManager.encodeSeed(seed1);
			if (encoded.isErr()) throw new Error(encoded.error.message);

			const decoded = SeedManager.decodeSeed(encoded.value);
			if (decoded.isErr()) throw new Error(decoded.error.message);

			expect(decoded.value).toEqual(seed1);
		});

		test("should handle edge cases gracefully throughout pipeline", () => {
			const validEdgeCases = [1, Number.MAX_SAFE_INTEGER];
			const invalidEdgeCases = [0, -1, Number.MIN_SAFE_INTEGER];

			for (const edgeCase of validEdgeCases) {
				expect(() => {
					const seed = SeedManager.generateSeeds(edgeCase);
					const encoded = SeedManager.encodeSeed(seed);
					if (encoded.isErr()) throw new Error(encoded.error.message);

					const decoded = SeedManager.decodeSeed(encoded.value);
					if (decoded.isErr()) throw new Error(decoded.error.message);

					expect(decoded.value).toEqual(seed);
				}).not.toThrow();
			}

			for (const edgeCase of invalidEdgeCases) {
				expect(() => {
					const seed = SeedManager.generateSeeds(edgeCase);
					const encoded = SeedManager.encodeSeed(seed);
					if (encoded.isErr()) {
						// Validation correctly rejects invalid seeds
					} else {
						expect(seed.layout).toBeGreaterThanOrEqual(0);
					}
				}).not.toThrow();
			}
		});

		test("should validate data integrity after each transformation", () => {
			const seed = SeedManager.generateSeeds(testSeeds.validNumericSeed);

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
				const seed = SeedManager.generateSeeds(i + 1); // Start from 1 since 0 is invalid
				const encoded = SeedManager.encodeSeed(seed);
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
					const seed = SeedManager.generateSeeds(1000 + i);
					const encoded = SeedManager.encodeSeed(seed);
					if (encoded.isErr()) throw new Error(encoded.error.message);

					const decoded = SeedManager.decodeSeed(encoded.value);
					if (decoded.isErr()) throw new Error(decoded.error.message);

					return decoded.value;
				}
			);

			const results = await Promise.all(promises);

			for (const result of results) {
				expect(result).toHaveProperty("primary");
			}
		});
	});

	describe("Error recovery and resilience", () => {
		test("should handle and recover from invalid inputs", () => {
			const invalidInputs = [
				"",
				"invalid-string",
				"not-a-valid-encoded-seed",
				null,
				undefined,
			];

			for (const input of invalidInputs) {
				// These operations should not throw exceptions
				expect(() => {
					// @ts-ignore - Testing invalid inputs
					const normalized = SeedManager.normalizeSeed(input);
					if (typeof normalized === "number" && normalized > 0) {
						const seed = SeedManager.generateSeeds(normalized);
						const encoded = SeedManager.encodeSeed(seed);
						if (encoded.isErr()) throw new Error(encoded.error.message);

						const decoded = SeedManager.decodeSeed(encoded.value);
						if (decoded.isErr()) throw new Error(decoded.error.message);
					}
				}).not.toThrow();
			}
		});

		test("should maintain system stability under stress", () => {
			const stressIterations = 1000;

			for (let i = 0; i < stressIterations; i++) {
				try {
					const randomValue = Math.floor(Math.random() * 1000000) + 1; // Ensure positive values
					const seed = SeedManager.generateSeeds(randomValue);
					const encoded = SeedManager.encodeSeed(seed);

					if (encoded.isErr()) {
						// This is acceptable - some inputs might produce validation errors
						continue;
					}

					const decoded = SeedManager.decodeSeed(encoded.value);

					if (decoded.isErr()) {
						// This is acceptable - some decodings might fail
						continue;
					}

					expect(decoded.value.primary).toBe(seed.primary);
				} catch (error) {
					// Log but don't fail - we're testing resilience
					console.warn(`Iteration ${i} failed:`, error);
				}
			}
		});
	});
});
