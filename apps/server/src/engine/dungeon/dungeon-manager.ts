import { z } from "zod";
import type { DungeonConfig } from "./core/types";
import type { Dungeon } from "./entities";
import type { DungeonGenerator } from "./generators/base/dungeon-generator";
import { createGeneratorFromRegistry } from "./generators/registry";
import { DungeonConfigSchema } from "./schema/dungeon";
import { SeedManager } from "./serialization";

async function generateFromSeedAsync(
  seedInput: string | number,
  config: DungeonConfig,
  onProgress?: (progress: number) => void,
): Promise<Dungeon | z.ZodError> {
  const configValidation = DungeonConfigSchema.safeParse(config);

  if (!configValidation.success) {
    return configValidation.error;
  }

  const validatedConfig = configValidation.data;
  const primarySeed = SeedManager.normalizeSeed(seedInput);
  const seeds = SeedManager.generateSeeds(primarySeed);
  const generator = createGeneratorFromRegistry(validatedConfig, seeds);

  return generator.generateAsync(onProgress);
}

function generateFromSeedSync(
  seedInput: string | number,
  config: DungeonConfig,
): Dungeon {
  const primarySeed = SeedManager.normalizeSeed(seedInput);

  const seeds = SeedManager.generateSeeds(primarySeed);
  const generator = createGeneratorFromRegistry(config, seeds);

  return generator.generate();
}

function regenerateFromCode(
  dungeonCode: string,
  config: DungeonConfig,
): Dungeon | null {
  const seeds = SeedManager.decodeSeed(dungeonCode);
  if (seeds instanceof z.ZodError) {
    return null;
  }

  return createGeneratorFromRegistry(config, seeds).generate();
}

function getDungeonShareCode(dungeon: Dungeon): string {
  const encoded = SeedManager.encodeSeed(dungeon.seeds);
  if (encoded instanceof z.ZodError) {
    throw new Error(`Failed to encode dungeon seeds: ${encoded.message}`);
  }
  return encoded;
}

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
