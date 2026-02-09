/**
 * Seed Creation Utilities
 *
 * Functions for creating and managing dungeon seeds.
 */

import {
  createValidatedSeed,
  type DungeonSeed,
  randomUint32,
} from "@rogue/contracts";
import {
  buildSeedFromPrimary,
  NORMALIZED_SEED_TIMESTAMP,
} from "./core/seed/derivation";

/**
 * Create a dungeon seed from a numeric value.
 *
 * Note: Timestamp is NOT included in the seed to ensure deterministic
 * serialization and comparison. Use createSeedWithTimestamp if you need
 * to track when the seed was created.
 */
export function createSeed(input: number): DungeonSeed {
  return buildSeedFromPrimary(input, NORMALIZED_SEED_TIMESTAMP);
}

/**
 * Create a dungeon seed with timestamp (for tracking purposes)
 */
export function createSeedWithTimestamp(input: number): DungeonSeed {
  return buildSeedFromPrimary(input, Date.now());
}

/**
 * Create a dungeon seed from a string
 */
export function createSeedFromString(input: string): DungeonSeed {
  // DJB2 hash function for strings
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  return createSeed(hash);
}

/**
 * Normalize a seed by removing the timestamp while preserving all seed values.
 * Use this when loading a saved seed to ensure exact reproduction and deterministic comparison.
 *
 * If the saved seed's sub-seeds don't match what would be derived from
 * the primary seed, we preserve the saved values (they may have been intentionally
 * modified for testing or special generation modes).
 */
export function normalizeSeed(saved: DungeonSeed): DungeonSeed {
  // Return a clean seed with the saved values (ignoring timestamp)
  return createValidatedSeed({
    primary: saved.primary,
    layout: saved.layout,
    rooms: saved.rooms,
    connections: saved.connections,
    details: saved.details,
    version: saved.version,
    timestamp: NORMALIZED_SEED_TIMESTAMP,
  });
}

/**
 * Check if two seeds will produce identical output
 */
export function seedsAreEquivalent(a: DungeonSeed, b: DungeonSeed): boolean {
  return (
    a.primary === b.primary &&
    a.layout === b.layout &&
    a.rooms === b.rooms &&
    a.connections === b.connections &&
    a.details === b.details
  );
}

/**
 * Create a random dungeon seed using system randomness.
 * Useful for quick testing or when reproducibility is not needed.
 *
 * @returns A new DungeonSeed with random primary value
 * @example
 * ```typescript
 * const seed = randomSeed();
 * const dungeon = generate({ width: 80, height: 50, seed });
 * ```
 */
export function randomSeed(): DungeonSeed {
  return createSeed(randomUint32());
}

/**
 * Serialize a seed to a JSON-safe plain object.
 * Useful for saving seeds to localStorage or sending over network.
 *
 * @param seed - The seed to serialize
 * @returns Plain object that can be JSON.stringify'd
 */
export function serializeSeed(seed: DungeonSeed): {
  primary: number;
  layout: number;
  rooms: number;
  connections: number;
  details: number;
  version: string;
} {
  return {
    primary: seed.primary,
    layout: seed.layout,
    rooms: seed.rooms,
    connections: seed.connections,
    details: seed.details,
    version: seed.version,
  };
}
