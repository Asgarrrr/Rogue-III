import { z } from "zod";
import { SeededRandom } from "../core/random/seeded-random";
import type { DungeonSeed } from "../core/types/dungeon.types";
import {
  DungeonSeedSchema,
  EncodedSeedSchema,
  SeedPartsSchema,
} from "../schema/seed";

const MAGIC_NUMBERS = {
  LAYOUT: 0x9e3779b9,
  ROOMS: 0x85ebca6b,
  CONNECTIONS: 0xc2b2ae35,
  DETAILS: 0x27d4eb2f,
} as const;

const DEFAULT_VERSION = "1.0.0";

function generateSeeds(
  primarySeed: number,
  version: string = DEFAULT_VERSION,
): DungeonSeed {
  const rng = new SeededRandom(primarySeed);
  return {
    primary: primarySeed,
    layout: Math.abs(primarySeed ^ MAGIC_NUMBERS.LAYOUT),
    rooms: rng.range(1000000, 9999999),
    connections: rng.range(1000000, 9999999),
    details: rng.range(1000000, 9999999),
    version,
    timestamp: Date.now(),
  };
}

function normalizeSeed(seedInput: string | number): number {
  return typeof seedInput === "string" ? seedFromString(seedInput) : seedInput;
}

function seedFromString(input: string): number {
  if (!input || input.length === 0) return 0;
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) + hash + char;
    hash = hash >>> 0;
  }
  return hash >>> 0;
}

function toBase64Url(base64: string): string {
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function fromBase64Url(base64Url: string): string {
  let base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4 !== 0) base64 += "=";
  return base64;
}

function createSeedFromParts(parts: number[]): DungeonSeed {
  return {
    primary: parts[0],
    layout: parts[1],
    rooms: parts[2],
    connections: parts[3],
    details: parts[4],
    version: DEFAULT_VERSION,
    timestamp: parts[5],
  };
}

function encodeSeed(seed: DungeonSeed): string | z.ZodError {
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
    return toBase64Url(btoa(data.join("|")));
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

function decodeSeed(encoded: string): DungeonSeed | z.ZodError {
  const inputValidation = EncodedSeedSchema.safeParse(encoded);
  if (!inputValidation.success) return inputValidation.error;
  try {
    const decodedString = atob(fromBase64Url(encoded));
    const parts = decodedString.split("|").map(Number);
    const partsValidation = SeedPartsSchema.safeParse(parts);
    if (!partsValidation.success) return partsValidation.error;
    const seedValidation = DungeonSeedSchema.safeParse(
      createSeedFromParts(parts),
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

export const SeedManager = {
  generateSeeds,
  normalizeSeed,
  seedFromString,
  encodeSeed,
  decodeSeed,
} as const;
