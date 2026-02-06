/**
 * Dungeon Checksum Calculator
 *
 * Computes deterministic checksums for dungeon artifacts.
 * Used to verify generation determinism across runs.
 *
 * Checksum format: "v{version}:{hash}"
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
 * Hash stable dungeon payload parts shared by both checksum entry points.
 */
function hashChecksumPayload(
  terrain: Uint8Array,
  rooms: readonly Room[],
  connections: readonly Connection[],
  spawns: readonly SpawnPoint[],
): string {
  const hasher = createFNV64Hasher();

  // Include version in hash to detect algorithm changes
  hasher.updateInt32(CHECKSUM_VERSION);

  // Hash terrain
  hasher.updateBytes(terrain);

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

  return hasher.digest();
}

/**
 * Calculate a deterministic checksum for dungeon data.
 *
 * Includes: terrain, room positions/sizes, connections, spawns with tags.
 *
 * @returns Checksum string (format: "v{version}:{hash}")
 */
export function calculateChecksum(
  grid: Grid,
  rooms: readonly Room[],
  connections: readonly Connection[],
  spawns: readonly SpawnPoint[],
): string {
  const digest = hashChecksumPayload(
    grid.getRawDataCopy(),
    rooms,
    connections,
    spawns,
  );
  return `v${CHECKSUM_VERSION}:${digest}`;
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
  const digest = hashChecksumPayload(
    artifact.terrain,
    artifact.rooms,
    artifact.connections,
    artifact.spawns,
  );
  return `v${CHECKSUM_VERSION}:${digest}`;
}
