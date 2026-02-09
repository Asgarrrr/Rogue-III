import { createValidatedSeed, type DungeonSeed, SeededRandom } from "@rogue/contracts";

/**
 * Keep this value stable for backward compatibility with existing seeds.
 */
const SEED_VERSION = "2.0.0";

/**
 * Validation requires a strictly positive timestamp. We normalize deterministic
 * seeds to this constant to keep serialization/comparison stable.
 */
export const NORMALIZED_SEED_TIMESTAMP = 1;

/**
 * Derive all sub-seed components from a primary seed.
 *
 * Note: we intentionally use `0xffffffff` (not `0x100000000`) to preserve the
 * historical sequence already used by saved seeds and tests.
 */
export function deriveSeedComponents(primaryInput: number): {
  readonly primary: number;
  readonly layout: number;
  readonly rooms: number;
  readonly connections: number;
  readonly details: number;
} {
  const primary = primaryInput >>> 0;
  const rng = new SeededRandom(primary);

  return {
    primary,
    layout: Math.floor(rng.next() * 0xffffffff),
    rooms: Math.floor(rng.next() * 0xffffffff),
    connections: Math.floor(rng.next() * 0xffffffff),
    details: Math.floor(rng.next() * 0xffffffff),
  };
}

/**
 * Build a validated DungeonSeed from a primary seed and timestamp.
 */
export function buildSeedFromPrimary(
  primaryInput: number,
  timestamp: number = NORMALIZED_SEED_TIMESTAMP,
): DungeonSeed {
  const components = deriveSeedComponents(primaryInput);
  return createValidatedSeed({
    ...components,
    version: SEED_VERSION,
    timestamp,
  });
}

