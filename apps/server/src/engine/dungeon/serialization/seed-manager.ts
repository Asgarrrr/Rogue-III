import { crc32, DungeonError, Err, Ok, type Result } from "@rogue/contracts";
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
 * References:
 * - Golden ratio: https://en.wikipedia.org/wiki/Golden_ratio
 * - MurmurHash3: https://github.com/aappleby/smhasher/blob/master/src/MurmurHash3.cpp
 *
 * - LAYOUT: Golden ratio (φ) as 32-bit integer - produces well-distributed hashes
 * - ROOMS: MurmurHash3 mixing constant c1 (line 68)
 * - CONNECTIONS: MurmurHash3 mixing constant c2 (line 69)
 * - DETAILS: MurmurHash3 finalization constant (line 81)
 */
const MAGIC_NUMBERS = {
  LAYOUT: 0x9e3779b9, // floor(2^32 / φ) - Golden ratio constant
  ROOMS: 0x85ebca6b, // MurmurHash3 fmix32 constant 1
  CONNECTIONS: 0xc2b2ae35, // MurmurHash3 fmix32 constant 2
  DETAILS: 0x27d4eb2f, // MurmurHash3 finalization constant
} as const;

const DEFAULT_VERSION = "1.0.0";
const UINT32_MAX = 0xffffffff;
/**
 * Maximum value for derived timestamps in share codes.
 * This is NOT a Unix timestamp - it's a deterministic value derived from the seed
 * for reproducibility. We use int32 max (2^31 - 1) to stay within JavaScript's
 * safe integer arithmetic bounds and avoid overflow in range calculations.
 */
const DERIVED_TIMESTAMP_MAX = 0x7fffffff;

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

const seedToPayloadParts = (seed: DungeonSeed): number[] => [
  seed.primary,
  seed.layout,
  seed.rooms,
  seed.connections,
  seed.details,
  seed.timestamp,
];

const computeSeedChecksum = (parts: number[]): number => crc32(parts.join("|"));

function sanitizePrimarySeed(
  primarySeed: number,
): Result<number, DungeonError> {
  if (!Number.isFinite(primarySeed)) {
    return Err(
      DungeonError.create("SEED_INVALID", "Seed must be a finite number", {
        seed: primarySeed,
      }),
    );
  }
  if (Number.isNaN(primarySeed)) {
    return Err(DungeonError.create("SEED_INVALID", "Seed must not be NaN"));
  }
  if (primarySeed < 0) {
    return Err(
      DungeonError.create("SEED_INVALID", "Seed must be non-negative", {
        seed: primarySeed,
      }),
    );
  }

  const normalized = Math.trunc(primarySeed);
  return Ok(Math.min(normalized, UINT32_MAX) >>> 0);
}

function deriveDeterministicTimestamp(primarySeed: number): number {
  const mixSeed = (primarySeed ^ MAGIC_NUMBERS.DETAILS) >>> 0;
  const rng = new SeededRandom(mixSeed);
  return rng.range(1, DERIVED_TIMESTAMP_MAX);
}

function generateSeeds(
  primarySeed: number,
  options: SeedGenerationOptions | string = {},
): Result<DungeonSeed, DungeonError> {
  const normalizedOptions: SeedGenerationOptions =
    typeof options === "string" ? { version: options } : options;

  const version = normalizedOptions.version ?? DEFAULT_VERSION;
  const deterministicTimestamp =
    normalizedOptions.deterministicTimestamp ?? true;

  const sanitizeResult = sanitizePrimarySeed(primarySeed);
  if (sanitizeResult.isErr()) {
    return Err(sanitizeResult.error);
  }
  const normalizedSeed = sanitizeResult.value;
  const rng = new SeededRandom(normalizedSeed);

  if (
    normalizedOptions.timestamp !== undefined &&
    normalizedOptions.timestamp <= 0
  ) {
    return Err(
      DungeonError.create(
        "SEED_INVALID",
        "Timestamp override must be positive",
        {
          timestamp: normalizedOptions.timestamp,
        },
      ),
    );
  }

  const timestamp =
    normalizedOptions.timestamp ??
    (deterministicTimestamp
      ? deriveDeterministicTimestamp(normalizedSeed)
      : Date.now());

  return Ok({
    primary: normalizedSeed,
    layout: (normalizedSeed ^ MAGIC_NUMBERS.LAYOUT) >>> 0,
    rooms: rng.range(1_000_000, 9_999_999),
    connections: rng.range(1_000_000, 9_999_999),
    details: rng.range(1_000_000, 9_999_999),
    version,
    timestamp,
  });
}

function normalizeSeed(
  seedInput: string | number,
): Result<number, DungeonError> {
  if (typeof seedInput === "string") {
    return Ok(seedFromString(seedInput));
  }
  return sanitizePrimarySeed(seedInput);
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
    const payload = seedToPayloadParts(seed);
    const checksum = computeSeedChecksum(payload);
    const data = [...payload, checksum];
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

    const [
      primary,
      layout,
      rooms,
      connections,
      details,
      timestamp,
      crcFromEncoding,
    ] = partsValidation.data;
    const payload = [primary, layout, rooms, connections, details, timestamp];
    const crcFromPayload = computeSeedChecksum(payload);
    const receivedCrc = crcFromEncoding;
    if (crcFromPayload !== receivedCrc) {
      return Err(
        DungeonError.seedDecodeFailed("Seed integrity check failed", {
          expectedCrc: crcFromPayload,
          receivedCrc,
        }),
      );
    }

    const seedValidation = DungeonSeedSchema.safeParse(
      createSeedFromParts(payload),
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
