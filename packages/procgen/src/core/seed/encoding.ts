/**
 * Seed Encoding
 *
 * Compact, URL-safe encoding for dungeon seeds.
 * Converts a DungeonSeed to a shareable string and back.
 *
 * @example
 * ```typescript
 * import { createSeed, encodeSeed, decodeSeed } from "@rogue/procgen-v2";
 *
 * const seed = createSeed(12345);
 * const encoded = encodeSeed(seed);  // "3D7kX9mP"
 *
 * const decoded = decodeSeed(encoded);
 * // decoded.primary === seed.primary
 * ```
 */

import { type DungeonSeed, SeededRandom } from "@rogue/contracts";

// =============================================================================
// BASE62 ENCODING
// =============================================================================

/**
 * Base62 alphabet (URL-safe, no special characters)
 */
const BASE62_ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const BASE = 62n;

/**
 * Encode a BigInt to base62 string
 */
function encodeBase62(value: bigint): string {
  if (value === 0n) return "0";

  let result = "";
  let remaining = value;

  while (remaining > 0n) {
    const index = Number(remaining % BASE);
    result = BASE62_ALPHABET[index] + result;
    remaining = remaining / BASE;
  }

  return result;
}

/**
 * Decode a base62 string to BigInt
 */
function decodeBase62(encoded: string): bigint {
  let result = 0n;

  for (let i = 0; i < encoded.length; i++) {
    const char = encoded[i];
    if (!char) {
      throw new Error("Invalid base62 string: contains empty character");
    }
    const index = BASE62_ALPHABET.indexOf(char);

    if (index === -1) {
      throw new Error(`Invalid base62 character: ${char}`);
    }

    result = result * BASE + BigInt(index);
  }

  return result;
}

// =============================================================================
// SEED ENCODING
// =============================================================================

/**
 * Seed encoding version (for future compatibility)
 */
const ENCODING_VERSION = 1;

/**
 * Encode a DungeonSeed to a compact, URL-safe string.
 *
 * Format: <version><primary>
 * - Version: 1 character (allows up to 62 versions)
 * - Primary: Base62 encoded uint32
 *
 * Since sub-seeds are derived from primary, we only need to encode primary.
 *
 * @param seed - The dungeon seed to encode
 * @returns URL-safe encoded string (7-8 characters)
 */
export function encodeSeed(seed: DungeonSeed): string {
  const versionChar = BASE62_ALPHABET[ENCODING_VERSION];
  if (!versionChar) {
    throw new Error(`Invalid encoding version: ${ENCODING_VERSION}`);
  }
  const primaryEncoded = encodeBase62(BigInt(seed.primary >>> 0));

  // Pad to ensure consistent length (max uint32 = 4294967295 = "4GFfc3" in base62 = 6 chars)
  const paddedPrimary = primaryEncoded.padStart(6, "0");

  return versionChar + paddedPrimary;
}

/**
 * Decode a seed string back to a DungeonSeed.
 *
 * @param encoded - The encoded seed string
 * @returns The reconstructed DungeonSeed
 * @throws Error if the string is invalid
 */
export function decodeSeed(encoded: string): DungeonSeed {
  if (encoded.length < 2) {
    throw new Error("Invalid seed encoding: too short");
  }

  // Extract version
  const versionChar = encoded[0];
  if (!versionChar) {
    throw new Error("Invalid seed encoding: missing version character");
  }
  const version = BASE62_ALPHABET.indexOf(versionChar);

  if (version === -1 || version < 1) {
    throw new Error(`Invalid seed encoding version: ${versionChar}`);
  }

  if (version !== ENCODING_VERSION) {
    throw new Error(`Unsupported seed encoding version: ${version}`);
  }

  // Extract and decode primary
  const primaryEncoded = encoded.slice(1);
  const primary = Number(decodeBase62(primaryEncoded));

  if (primary < 0 || primary > 0xffffffff) {
    throw new Error(`Invalid primary seed value: ${primary}`);
  }

  // Reconstruct full seed from primary
  return reconstructSeed(primary);
}

/**
 * Reconstruct a full DungeonSeed from just the primary value.
 * This must match the logic in createSeed().
 */
function reconstructSeed(primary: number): DungeonSeed {
  // Use the same algorithm as createSeed to derive sub-seeds
  const rng = new SeededRandom(primary >>> 0);

  return {
    primary: primary >>> 0,
    layout: Math.floor(rng.next() * 0xffffffff),
    rooms: Math.floor(rng.next() * 0xffffffff),
    connections: Math.floor(rng.next() * 0xffffffff),
    details: Math.floor(rng.next() * 0xffffffff),
    version: "2.0.0",
    timestamp: 0,
  };
}

/**
 * Validate an encoded seed string without decoding.
 *
 * @param encoded - The string to validate
 * @returns true if the string is a valid encoded seed
 */
export function isValidEncodedSeed(encoded: string): boolean {
  if (typeof encoded !== "string") return false;
  if (encoded.length < 2 || encoded.length > 8) return false;

  // Check version
  const versionChar = encoded[0];
  if (!versionChar) return false;
  const version = BASE62_ALPHABET.indexOf(versionChar);
  if (version < 1) return false;

  // Check all characters are valid base62
  for (let i = 1; i < encoded.length; i++) {
    const char = encoded[i];
    if (!char || BASE62_ALPHABET.indexOf(char) === -1) {
      return false;
    }
  }

  return true;
}

/**
 * Generate a random encoded seed.
 *
 * @returns A random encoded seed string
 */
export function randomEncodedSeed(): string {
  const primary = Math.floor(Math.random() * 0xffffffff);
  return encodeSeed({ primary } as DungeonSeed);
}

// =============================================================================
// HUMAN-FRIENDLY FORMAT
// =============================================================================

/**
 * Encode a seed with a human-friendly prefix.
 *
 * @param seed - The dungeon seed
 * @param prefix - Optional prefix (default: "DNG")
 * @returns Formatted string like "DNG-1Abc23"
 */
export function encodeSeedPretty(
  seed: DungeonSeed,
  prefix: string = "DNG",
): string {
  return `${prefix}-${encodeSeed(seed)}`;
}

/**
 * Decode a pretty-formatted seed string.
 *
 * @param pretty - The formatted string (e.g., "DNG-1Abc23")
 * @returns The decoded DungeonSeed
 */
export function decodeSeedPretty(pretty: string): DungeonSeed {
  const parts = pretty.split("-");
  if (parts.length !== 2) {
    throw new Error("Invalid pretty seed format: expected PREFIX-CODE");
  }

  const code = parts[1];
  if (!code) {
    throw new Error("Invalid pretty seed format: missing code part");
  }

  return decodeSeed(code);
}

// =============================================================================
// URL HELPERS
// =============================================================================

/**
 * Create a URL path segment for a seed.
 *
 * @param seed - The dungeon seed
 * @returns URL-safe path segment
 */
export function seedToPath(seed: DungeonSeed): string {
  return encodeSeed(seed);
}

/**
 * Parse a seed from a URL path segment.
 *
 * @param path - The URL path segment
 * @returns The decoded DungeonSeed
 */
export function pathToSeed(path: string): DungeonSeed {
  return decodeSeed(path);
}

/**
 * Create query parameters for a seed.
 *
 * @param seed - The dungeon seed
 * @returns URLSearchParams with seed data
 */
export function seedToQueryParams(seed: DungeonSeed): URLSearchParams {
  return new URLSearchParams({
    seed: encodeSeed(seed),
  });
}

/**
 * Parse a seed from query parameters.
 *
 * @param params - The URLSearchParams
 * @returns The decoded DungeonSeed or null if not present
 */
export function queryParamsToSeed(params: URLSearchParams): DungeonSeed | null {
  const encoded = params.get("seed");
  if (!encoded) return null;

  try {
    return decodeSeed(encoded);
  } catch {
    return null;
  }
}
