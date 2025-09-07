import { DungeonConfig, DungeonSeed } from "./core/types";
import { SeedManager } from "./serialization";
import { DungeonGenerator } from "./generators/base/dungeon-generator";
import { CellularGenerator } from "./generators/algorithms/cellular-generator";
import { Dungeon } from "./entities";
import { DungeonConfigSchema } from "./schema/dungeon";
import { z } from "zod";

export class DungeonManager {
	static async generateFromSeedAsync(
		seedInput: string | number,
		config: DungeonConfig,
		onProgress?: (progress: number) => void
	): Promise<Dungeon | z.ZodError> {
		const configValidation = DungeonConfigSchema.safeParse(config);

		if (!configValidation.success) {
			const errorMessages = configValidation.error.issues
				.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
				.join(", ");

			return configValidation.error;
		}

		const validatedConfig = configValidation.data;
		const primarySeed = SeedManager.normalizeSeed(seedInput);
		const seeds = SeedManager.generateSeeds(primarySeed);
		const generator = this.createGenerator(validatedConfig, seeds);

		return generator.generateAsync(onProgress);
	}

	static generateFromSeedSync(
		seedInput: string | number,
		config: DungeonConfig
	): Dungeon {
		const primarySeed = SeedManager.normalizeSeed(seedInput);

		const seeds = SeedManager.generateSeeds(primarySeed);
		const generator = this.createGenerator(config, seeds);

		return generator.generate();
	}

	/**
	 * Regenerates the exact same dungeon from a share code.
	 * -> Useful for loading saved dungeons or sharing between players.
	 */
	static regenerateFromCode(
		dungeonCode: string,
		config: DungeonConfig
	): Dungeon | null {
		const seeds = SeedManager.decodeSeed(dungeonCode);
		if (seeds instanceof z.ZodError) {
			return null; // Return null instead of throwing for invalid codes
		}

		return this.createGenerator(config, seeds).generate();
	}

	/**
	 * Gets a shareable code for a dungeon.
	 * Encodes all seeds needed to recreate the exact dungeon.
	 */
	static getDungeonShareCode(dungeon: Dungeon): string {
		const encoded = SeedManager.encodeSeed(dungeon.seeds);
		if (encoded instanceof z.ZodError) {
			throw new Error(`Failed to encode dungeon seeds: ${encoded.message}`);
		}
		return encoded;
	}

	/**
	 * Validates that a generator produces deterministic results.
	 * Useful for testing and quality assurance.
	 */
	static validateDeterminism(generator: DungeonGenerator): boolean {
		return generator.validateDeterminism();
	}

	/**
	 * Creates the appropriate dungeon generator based on the configured algorithm.
	 * Centralizes algorithm instantiation logic for maintainability.
	 */
	private static createGenerator(
		config: DungeonConfig,
		seeds: DungeonSeed
	): DungeonGenerator {
		switch (config.algorithm) {
			case "BSP":
				// TODO: Implement BSP (Binary Space Partitioning) generator
				throw new Error("BSP generator not implemented yet");
			case "cellular":
				return new CellularGenerator(config, seeds);
			default:
				return new CellularGenerator(config, seeds);
		}
	}
}
