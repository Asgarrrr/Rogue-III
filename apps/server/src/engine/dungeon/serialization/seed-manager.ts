import { DungeonSeed } from "../core/types/dungeon.types";
import { SeededRandom } from "../core/random/seeded-random";

export class SeedManager {
	private static readonly MAGIC_NUMBERS = {
		LAYOUT: 0x9e3779b9,
		ROOMS: 0x85ebca6b,
		CONNECTIONS: 0xc2b2ae35,
		DETAILS: 0x27d4eb2f,
	};

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
			layout: primarySeed ^ this.MAGIC_NUMBERS.LAYOUT,
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
	 * Encode a seed into a short shareable string using base64url
	 */
	static encodeSeed(seed: DungeonSeed): string {
		const data = [
			seed.primary,
			seed.layout,
			seed.rooms,
			seed.connections,
			seed.details,
		];

		// Use | separator to avoid conflicts with negative signs
		return btoa(data.join("|"))
			.replace(/\+/g, "-")
			.replace(/\//g, "_")
			.replace(/=/g, "");
	}

	/**
	 * Decode a string back to a seed (base64url compatible)
	 */
	static decodeSeed(encoded: string): DungeonSeed | null {
		try {
			// Convert base64url back to standard base64
			let base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");

			while (base64.length % 4 !== 0) base64 += "=";

			const decoded = atob(base64);
			const parts = decoded.split("|").map(Number);

			if (parts.length !== 5 || parts.some(isNaN)) return null;

			return {
				primary: parts[0],
				layout: parts[1],
				rooms: parts[2],
				connections: parts[3],
				details: parts[4],
				version: "1.0.0",
				timestamp: Date.now(),
			};
		} catch {
			return null;
		}
	}
}
