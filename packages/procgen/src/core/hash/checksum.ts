/**
 * Dungeon Checksum Calculator
 *
 * Computes deterministic checksums for dungeon artifacts.
 * Used to verify generation determinism across runs.
 *
 * ## Versioning
 *
 * Checksums are prefixed with a version identifier to allow backward compatibility
 * when the checksum algorithm changes. Format: "v{version}:{hash}"
 *
 * Version history:
 * - v1: Initial FNV64 implementation (pre-versioning, 16-char hex)
 * - v2: Added version prefix, includes spawn tags in hash
 */

import type { Connection, Room, SpawnPoint } from "../../pipeline/types";
import type { Grid } from "../grid/grid";
import { createFNV64Hasher } from "./fnv64";

/**
 * Current checksum algorithm version.
 * Increment when changing what data is hashed or how.
 */
export const CHECKSUM_VERSION = 2;

/**
 * Parse a versioned checksum into its components.
 * Returns null for legacy (unversioned) checksums.
 */
export function parseChecksum(checksum: string): {
  version: number;
  hash: string;
} | null {
  const match = checksum.match(/^v(\d+):(.+)$/);
  if (!match || !match[1] || !match[2]) return null;
  return {
    version: parseInt(match[1], 10),
    hash: match[2],
  };
}

/**
 * Check if two checksums are compatible (same version or both legacy).
 */
export function checksumsAreCompatible(a: string, b: string): boolean {
  const parsedA = parseChecksum(a);
  const parsedB = parseChecksum(b);

  // Both legacy: direct comparison
  if (!parsedA && !parsedB) return a === b;

  // Both versioned: compare if same version
  if (parsedA && parsedB) {
    if (parsedA.version !== parsedB.version) {
      console.warn(
        `Checksum version mismatch: v${parsedA.version} vs v${parsedB.version}`,
      );
      return false;
    }
    return parsedA.hash === parsedB.hash;
  }

  // Mixed: one legacy, one versioned - not compatible
  console.warn("Cannot compare legacy checksum with versioned checksum");
  return false;
}

/**
 * Calculate a deterministic checksum for dungeon data.
 *
 * The checksum includes:
 * - Version prefix for backward compatibility
 * - Terrain grid data
 * - Room positions and sizes
 * - Connection endpoints
 * - Spawn positions, types, and tags
 *
 * @param grid - The terrain grid
 * @param rooms - Room definitions
 * @param connections - Corridor connections
 * @param spawns - Spawn points
 * @returns Versioned checksum string (format: "v{version}:{hash}")
 */
export function calculateChecksum(
  grid: Grid,
  rooms: readonly Room[],
  connections: readonly Connection[],
  spawns: readonly SpawnPoint[],
): string {
  const hasher = createFNV64Hasher();

  // Include version in hash to detect algorithm changes
  hasher.updateInt32(CHECKSUM_VERSION);

  // Hash terrain (use copy to ensure immutability)
  hasher.updateBytes(grid.getRawDataCopy());

  // Hash rooms (position and size only - stable across changes)
  for (const room of rooms) {
    hasher.updateInt32(room.x);
    hasher.updateInt32(room.y);
    hasher.updateInt32(room.width);
    hasher.updateInt32(room.height);
  }

  // Hash connections (endpoints only - path may vary)
  for (const conn of connections) {
    hasher.updateInt32(conn.fromRoomId);
    hasher.updateInt32(conn.toRoomId);
  }

  // Hash spawns (including tags for completeness)
  for (const spawn of spawns) {
    hasher.updateInt32(spawn.position.x);
    hasher.updateInt32(spawn.position.y);
    hasher.updateInt32(spawn.roomId);
    hasher.updateString(spawn.type);
    // Hash tags in sorted order for stability
    const sortedTags = [...spawn.tags].sort();
    for (const tag of sortedTags) {
      hasher.updateString(tag);
    }
  }

  return `v${CHECKSUM_VERSION}:${hasher.digest()}`;
}

/**
 * Calculate checksum from a DungeonArtifact-like object.
 * @returns Versioned checksum string (format: "v{version}:{hash}")
 */
export function calculateArtifactChecksum(artifact: {
  terrain: Uint8Array;
  rooms: readonly Room[];
  connections: readonly Connection[];
  spawns: readonly SpawnPoint[];
}): string {
  const hasher = createFNV64Hasher();

  // Include version in hash
  hasher.updateInt32(CHECKSUM_VERSION);

  // Hash terrain
  hasher.updateBytes(artifact.terrain);

  // Hash rooms
  for (const room of artifact.rooms) {
    hasher.updateInt32(room.x);
    hasher.updateInt32(room.y);
    hasher.updateInt32(room.width);
    hasher.updateInt32(room.height);
  }

  // Hash connections
  for (const conn of artifact.connections) {
    hasher.updateInt32(conn.fromRoomId);
    hasher.updateInt32(conn.toRoomId);
  }

  // Hash spawns (including tags)
  for (const spawn of artifact.spawns) {
    hasher.updateInt32(spawn.position.x);
    hasher.updateInt32(spawn.position.y);
    hasher.updateInt32(spawn.roomId);
    hasher.updateString(spawn.type);
    const sortedTags = [...spawn.tags].sort();
    for (const tag of sortedTags) {
      hasher.updateString(tag);
    }
  }

  return `v${CHECKSUM_VERSION}:${hasher.digest()}`;
}
