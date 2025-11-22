import { DungeonError, Err, Ok, type Result } from "@rogue/contracts";
import { SeededRandom } from "../core/random/seeded-random";
import type { DungeonSeed } from "../core/types/dungeon.types";
import {
  DungeonSeedSchema,
  EncodedSeedSchema,
  SeedPartsSchema,
} from "../schema/seed";

/**
 * Golden ratio-derived constants for seed mixing.
 * These are well-known hash constants from MurmurHash and other algorithms.
 * Using different constants for each seed ensures decorrelated random streams.
 *
 * - LAYOUT: Golden ratio (f) as 32-bit integer - produces well-distributed hashes
 * - ROOMS: MurmurHash3 constant - good avalanche properties
 * - CONNECTIONS: Second MurmurHash3 constant - different bit patterns
 * - DETAILS: Third MurmurHash3 constant - completes the decorrelation
 */
const MAGIC_NUMBERS = {
  LAYOUT: 0x9e3779b9, // (2^32) / f - Golden ratio constant
  ROOMS: 0x85ebca6b, // MurmurHash3 mixing constant 1
  CONNECTIONS: 0xc2b2ae35, // MurmurHash3 mixing constant 2
  DETAILS: 0x27d4eb2f, // MurmurHash3 finalization constant
} as const;

const DEFAULT_VERSION = "1.0.0";
const DEFAULT_TIMESTAMP_MAX = 0x7fffffff; // Keep timestamps portable/int32-safe

type SeedGenerationOptions = {
  version?: string;
  /**
   * When true (default), timestamp is deterministic so share codes are stable.
   * When false, the current time is injected for observability.
   */
  deterministicTimestamp?: boolean;
  /**
   * Explicit timestamp override (must be positive).
   */
  timestamp?: number;
};

function deriveDeterministicTimestamp(primarySeed: number): number {
  const mixSeed = (primarySeed ^ MAGIC_NUMBERS.DETAILS) >>> 0;
  const rng = new SeededRandom(mixSeed);
  return rng.range(1, DEFAULT_TIMESTAMP_MAX);
}

function generateSeeds(
  primarySeed: number,
  options: SeedGenerationOptions | string = {},
): DungeonSeed {
  const normalizedOptions: SeedGenerationOptions =
    typeof options === "string" ? { version: options } : options;

  const version = normalizedOptions.version ?? DEFAULT_VERSION;
  const deterministicTimestamp = normalizedOptions.deterministicTimestamp ?? true;
  const normalizedSeed = primarySeed >>> 0;
  const rng = new SeededRandom(normalizedSeed);

  const timestamp =
    normalizedOptions.timestamp ??
    (deterministicTimestamp
      ? deriveDeterministicTimestamp(normalizedSeed)
      : Date.now());

  return {
    primary: normalizedSeed,
    layout: (normalizedSeed ^ MAGIC_NUMBERS.LAYOUT) >>> 0,
    rooms: rng.range(1_000_000, 9_999_999),
    connections: rng.range(1_000_000, 9_999_999),
    details: rng.range(1_000_000, 9_999_999),
    version,
    timestamp,
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

function encodeSeed(seed: DungeonSeed): Result<string, DungeonError> {
  const validation = DungeonSeedSchema.safeParse(seed);
  if (!validation.success) {
    return Err(
      DungeonError.create("SEED_ENCODE_FAILED", "Invalid seed structure", {
        errors: validation.error.issues,
      }),
    );
  }
  try {
    const data = [
      seed.primary,
      seed.layout,
      seed.rooms,
      seed.connections,
      seed.details,
      seed.timestamp,
    ];
    return Ok(toBase64Url(btoa(data.join("|"))));
  } catch (error) {
    return Err(
      DungeonError.create("SEED_ENCODE_FAILED", "Encoding failed", {
        reason: error instanceof Error ? error.message : "Unknown error",
      }),
    );
  }
}

function decodeSeed(encoded: string): Result<DungeonSeed, DungeonError> {
  const inputValidation = EncodedSeedSchema.safeParse(encoded);
  if (!inputValidation.success) {
    return Err(
      DungeonError.seedDecodeFailed("Invalid encoded seed format", {
        errors: inputValidation.error.issues,
      }),
    );
  }
  try {
    const decodedString = atob(fromBase64Url(encoded));
    const parts = decodedString.split("|").map(Number);
    const partsValidation = SeedPartsSchema.safeParse(parts);
    if (!partsValidation.success) {
      return Err(
        DungeonError.seedDecodeFailed("Invalid seed parts", {
          errors: partsValidation.error.issues,
        }),
      );
    }
    const seedValidation = DungeonSeedSchema.safeParse(
      createSeedFromParts(parts),
    );
    if (!seedValidation.success) {
      return Err(
        DungeonError.seedDecodeFailed("Invalid seed structure", {
          errors: seedValidation.error.issues,
        }),
      );
    }
    return Ok(seedValidation.data);
  } catch (error) {
    return Err(
      DungeonError.seedDecodeFailed("Base64 decoding failed", {
        reason: error instanceof Error ? error.message : "Unknown error",
      }),
    );
  }
}

export const SeedManager = {
  generateSeeds,
  normalizeSeed,
  seedFromString,
  encodeSeed,
  decodeSeed,
} as const;
