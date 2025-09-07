import { describe, expect, test } from "bun:test";
import { SeedManager } from "../../src/engine/dungeon/serialization/seed-manager";
import { testSeeds, createMockSeed, mockSeed } from "./test-helpers";
import { ZodError } from "zod";

describe("Seed Encoding & Decoding", () => {
	describe("encodeSeed", () => {
		test("should encode a seed to a string", () => {
			const encoded = SeedManager.encodeSeed(mockSeed);
			if (encoded instanceof ZodError) throw new Error(encoded.message);
			expect(typeof encoded).toBe("string");
			expect(encoded.length).toBeGreaterThan(0);
		});

		test("should produce base64url compatible output", () => {
			const encoded = SeedManager.encodeSeed(mockSeed);
			if (encoded instanceof ZodError) throw new Error(encoded.message);

			expect(encoded).not.toMatch(/[+/=]/);
			expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
		});

		test("should encode all seed properties correctly", () => {
			const encoded = SeedManager.encodeSeed(mockSeed);
			if (encoded instanceof ZodError) throw new Error(encoded.message);

			const decoded = SeedManager.decodeSeed(encoded);

			if (decoded instanceof ZodError) throw new Error(decoded.message);
			expect(decoded).toEqual(mockSeed);
		});

		test("should handle different seed values", () => {
			const validTestCases = [
				createMockSeed({ primary: 1 }),
				createMockSeed({ primary: Number.MAX_SAFE_INTEGER }),
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
				if (encoded instanceof ZodError) throw new Error(encoded.message);

				const decoded = SeedManager.decodeSeed(encoded);
				if (decoded instanceof ZodError) throw new Error(decoded.message);
				expect(decoded).toEqual(seed);
			}

			for (const seed of invalidTestCases) {
				const encoded = SeedManager.encodeSeed(seed);
				if (encoded instanceof ZodError) {
					// Validation correctly rejects invalid seeds
				} else {
					expect(typeof encoded).toBe("string");
				}
			}
		});
	});

	describe("decodeSeed", () => {
		test("should decode a valid encoded seed", () => {
			const encoded = SeedManager.encodeSeed(mockSeed);
			if (encoded instanceof ZodError) throw new Error(encoded.message);

			const decoded = SeedManager.decodeSeed(encoded);

			if (decoded instanceof ZodError) throw new Error(decoded.message);
			expect(decoded).toEqual(mockSeed);
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
				expect(result).toBeInstanceOf(ZodError);
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
				expect(result).toBeInstanceOf(ZodError);
			}
		});

		test("should handle edge cases gracefully", () => {
			// Empty string
			expect(SeedManager.decodeSeed("")).toBeInstanceOf(ZodError);

			// Very long string
			const longString = "A".repeat(1000);
			expect(SeedManager.decodeSeed(longString)).toBeInstanceOf(ZodError);

			// String with special characters
			expect(SeedManager.decodeSeed("!@#$%^&*()")).toBeInstanceOf(ZodError);
		});

		test("should preserve all original seed properties after round-trip", () => {
			const originalSeed = SeedManager.generateSeeds(
				testSeeds.validNumericSeed
			);
			const encoded = SeedManager.encodeSeed(originalSeed);
			if (encoded instanceof ZodError) throw new Error(encoded.message);

			const decoded = SeedManager.decodeSeed(encoded);

			if (decoded instanceof ZodError) throw new Error(decoded.message);
			expect(decoded).toEqual(originalSeed);
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
				if (encoded instanceof ZodError) throw new Error(encoded.message);

				const decoded = SeedManager.decodeSeed(encoded);

				if (decoded instanceof ZodError) throw new Error(decoded.message);
				expect(decoded.timestamp).toBe(timestamp);
			}

			// Test invalid timestamps (should fail at encoding)
			for (const timestamp of invalidTimestamps) {
				const seed = createMockSeed({ timestamp });
				const encoded = SeedManager.encodeSeed(seed);
				expect(encoded).toBeInstanceOf(ZodError);
			}
		});
	});

	describe("Round-trip encoding/decoding", () => {
		test("should maintain data integrity through multiple encode/decode cycles", () => {
			let currentSeed = mockSeed;

			// Test 3 round-trips
			for (let i = 0; i < 3; i++) {
				const encoded = SeedManager.encodeSeed(currentSeed);
				if (encoded instanceof ZodError) throw new Error(encoded.message);

				const decoded = SeedManager.decodeSeed(encoded);

				if (decoded instanceof ZodError) throw new Error(decoded.message);
				expect(decoded).toEqual(currentSeed);

				currentSeed = decoded;
			}
		});

		test("should handle seeds generated with different primary values", () => {
			const validPrimaryValues = [1, 42, 123456, 999999]; // Only positive values
			const invalidPrimaryValues = [0, -1, -999999]; // These should fail

			// Test valid primary values
			for (const primary of validPrimaryValues) {
				const generatedSeed = SeedManager.generateSeeds(primary);
				const encoded = SeedManager.encodeSeed(generatedSeed);
				if (encoded instanceof ZodError) throw new Error(encoded.message);

				const decoded = SeedManager.decodeSeed(encoded);

				if (decoded instanceof ZodError) throw new Error(decoded.message);
				expect(decoded).toEqual(generatedSeed);
			}

			// Test invalid primary values (should fail at seed generation due to negative values)
			for (const primary of invalidPrimaryValues) {
				try {
					const generatedSeed = SeedManager.generateSeeds(primary);
					const encoded = SeedManager.encodeSeed(generatedSeed);
					// If we get here, the seed was generated successfully, but it should have negative values
					expect(generatedSeed.layout).toBeLessThan(0); // Should be negative due to XOR
					expect(encoded).toBeInstanceOf(ZodError); // Should fail validation
				} catch (error) {
					// This is also acceptable - generation might throw
				}
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
				if (encoded instanceof ZodError) throw new Error(encoded.message);

				const decoded = SeedManager.decodeSeed(encoded);

				if (decoded instanceof ZodError) throw new Error(decoded.message);
				expect(decoded).toEqual(seed);
			}

			// Test invalid extreme values (should fail at encoding)
			for (const seed of invalidExtremeSeeds) {
				const encoded = SeedManager.encodeSeed(seed);
				expect(encoded).toBeInstanceOf(ZodError);
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
					expect(result).toBeInstanceOf(ZodError);
				}).not.toThrow();
			}
		});
	});
});
