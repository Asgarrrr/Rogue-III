import { DungeonSeed } from "../core/types/dungeon.types";
import { SeededRandom } from "../core/random/seeded-random";

import { z } from "zod";
import {
	DungeonSeedSchema,
	SeedPartsSchema,
	EncodedSeedSchema,
} from "../schema/seed";

export class SeedManager {
	private static readonly MAGIC_NUMBERS = {
		LAYOUT: 0x9e3779b9,
		ROOMS: 0x85ebca6b,
		CONNECTIONS: 0xc2b2ae35,
		DETAILS: 0x27d4eb2f,
	};

	private static readonly DEFAULT_VERSION = "1.0.0";
	private static readonly SEED_PARTS_COUNT = 6;

	/**
	 * Generate a set of seeds from a primary seed
	 */
	static generateSeeds(
		primarySeed: number,
		version: string = "1.0.0"
	): DungeonSeed {
		const rng = new SeededRandom(primarySeed);

		return {
			primary: primarySeed,
			layout: Math.abs(primarySeed ^ this.MAGIC_NUMBERS.LAYOUT),
			rooms: rng.range(1000000, 9999999),
			connections: rng.range(1000000, 9999999),
			details: rng.range(1000000, 9999999),
			version,
			timestamp: Date.now(),
		};
	}

	/**
	 * Normalize any seed input (string or number) to a number
	 * Automatically converts strings using djb2 hash for deterministic generation
	 */
	static normalizeSeed(seedInput: string | number): number {
		return typeof seedInput === "string"
			? SeedManager.seedFromString(seedInput)
			: seedInput;
	}

	/**
	 * Create a seed from a string using djb2 hash algorithm
	 */
	static seedFromString(input: string): number {
		if (!input || input.length === 0) return 0;

		let hash = 5381;

		for (let i = 0; i < input.length; i++) {
			const char = input.charCodeAt(i);
			hash = (hash << 5) + hash + char;
			hash = hash >>> 0; // Convert to unsigned 32-bit
		}

		return hash >>> 0;
	}

	/**
	 * Convert standard base64 to base64url format
	 */
	private static toBase64Url(base64: string): string {
		return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
	}

	/**
	 * Convert base64url to standard base64 format
	 */
	private static fromBase64Url(base64Url: string): string {
		let base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
		while (base64.length % 4 !== 0) base64 += "=";
		return base64;
	}

	/**
	 * Create a DungeonSeed object from validated parts
	 */
	private static createSeedFromParts(parts: number[]): DungeonSeed {
		return {
			primary: parts[0],
			layout: parts[1],
			rooms: parts[2],
			connections: parts[3],
			details: parts[4],
			version: this.DEFAULT_VERSION,
			timestamp: parts[5],
		};
	}

	/**
	 * Encode a seed into a short shareable string using base64url
	 */
	static encodeSeed(seed: DungeonSeed): string | z.ZodError {
		const validation = DungeonSeedSchema.safeParse(seed);
		if (!validation.success) return validation.error;

		try {
			const data = [
				seed.primary,
				seed.layout,
				seed.rooms,
				seed.connections,
				seed.details,
				seed.timestamp,
			];
			return this.toBase64Url(btoa(data.join("|")));
		} catch (error) {
			return new z.ZodError([
				{
					message: `Encoding failed: ${error instanceof Error ? error.message : "Unknown error"}`,
					code: "custom",
					path: ["encoding"],
				},
			]);
		}
	}

	/**
	 * Decode a string back to a seed (base64url compatible)
	 */
	static decodeSeed(encoded: string): DungeonSeed | z.ZodError {
		const inputValidation = EncodedSeedSchema.safeParse(encoded);

		if (!inputValidation.success) {
			return inputValidation.error;
		}

		try {
			const decodedString = atob(this.fromBase64Url(encoded));
			const parts = decodedString.split("|").map(Number);

			const partsValidation = SeedPartsSchema.safeParse(parts);

			if (!partsValidation.success) {
				return partsValidation.error;
			}

			const seedValidation = DungeonSeedSchema.safeParse(
				this.createSeedFromParts(parts)
			);
			if (!seedValidation.success) return seedValidation.error;
			return seedValidation.data;
		} catch (error) {
			return new z.ZodError([
				{
					message: `Base64 decoding failed: ${error instanceof Error ? error.message : "Unknown error"}`,
					code: "custom",
					path: ["decoding", "base64"],
				},
			]);
		}
	}
}
