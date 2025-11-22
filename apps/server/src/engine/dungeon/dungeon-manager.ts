import type { DungeonConfig } from "./core/types";
import type { Dungeon } from "./entities";
import type { DungeonGenerator } from "./generators/base/dungeon-generator";
import { createGeneratorFromRegistry } from "./generators/registry";
import { DungeonConfigSchema } from "./schema/dungeon";
import { SeedManager } from "./serialization";
import { Result, Ok, Err, DungeonError } from "@rogue/contracts";

/**
 * Generate a dungeon asynchronously with progress tracking.
 */
async function generateFromSeedAsync(
  seedInput: string | number,
  config: DungeonConfig,
  onProgress?: (progress: number) => void,
): Promise<Result<Dungeon, DungeonError>> {
  const configResult = DungeonConfigSchema.safeParse(config);

  if (!configResult.success) {
    return Err(
      DungeonError.configInvalid("Invalid dungeon configuration", {
        errors: configResult.error.issues,
      }),
    );
  }

  const validatedConfig = configResult.data;
  const primarySeed = SeedManager.normalizeSeed(seedInput);
  const seeds = SeedManager.generateSeeds(primarySeed);
  const generator = createGeneratorFromRegistry(validatedConfig, seeds);

  const dungeon = await generator.generateAsync(onProgress);
  return Ok(dungeon);
}

/**
 * Generate a dungeon synchronously.
 */
function generateFromSeedSync(
  seedInput: string | number,
  config: DungeonConfig,
): Result<Dungeon, DungeonError> {
  const configResult = DungeonConfigSchema.safeParse(config);

  if (!configResult.success) {
    return Err(
      DungeonError.configInvalid("Invalid dungeon configuration", {
        errors: configResult.error.issues,
      }),
    );
  }

  const validatedConfig = configResult.data;
  const primarySeed = SeedManager.normalizeSeed(seedInput);
  const seeds = SeedManager.generateSeeds(primarySeed);
  const generator = createGeneratorFromRegistry(validatedConfig, seeds);

  return Ok(generator.generate());
}

/**
 * Regenerate a dungeon from a share code.
 */
function regenerateFromCode(
  dungeonCode: string,
  config: DungeonConfig,
): Result<Dungeon, DungeonError> {
  const seedsResult = SeedManager.decodeSeed(dungeonCode);

  if (seedsResult.isErr()) {
    return Err(seedsResult.error);
  }

  const configResult = DungeonConfigSchema.safeParse(config);
  if (!configResult.success) {
    return Err(
      DungeonError.configInvalid("Invalid dungeon configuration", {
        errors: configResult.error.issues,
      }),
    );
  }

  return Ok(createGeneratorFromRegistry(configResult.data, seedsResult.value).generate());
}

/**
 * Get a shareable code for a dungeon.
 */
function getDungeonShareCode(
  dungeon: Dungeon,
): Result<string, DungeonError> {
  return SeedManager.encodeSeed(dungeon.seeds);
}

/**
 * Validate that a generator produces deterministic results.
 */
function validateDeterminism(generator: DungeonGenerator): boolean {
  return generator.validateDeterminism();
}

export const DungeonManager = {
  generateFromSeedAsync,
  generateFromSeedSync,
  regenerateFromCode,
  getDungeonShareCode,
  validateDeterminism,
} as const;
