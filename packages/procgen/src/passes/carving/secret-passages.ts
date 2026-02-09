/**
 * Secret Passages Pass
 *
 * Adds hidden connections between rooms that are close but not directly connected.
 * These passages are marked as `type: "secret"` and are not visible by default.
 *
 * @example
 * ```typescript
 * import { addSecretPassages } from "@rogue/procgen/passes/carving/secret-passages";
 *
 * // Add secret passages to a pipeline
 * const pipeline = createPipeline()
 *   .pipe(carveCorridors())
 *   .pipe(addSecretPassages({ secretRatio: 0.1 }));
 * ```
 */

import type { Point } from "../../core/geometry/types";
import { bresenhamLine } from "../../core/geometry/operations";
import type {
  Connection,
  DungeonStateArtifact,
  Pass,
  Room,
} from "../../pipeline/types";
import { carveBresenhamCorridor } from "./corridor-carvers";

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Secret passage configuration
 */
export interface SecretPassageConfig {
  /** Ratio of potential secret passages to add (0-1). Default: 0.1 */
  readonly secretRatio?: number;
  /** Maximum distance (Manhattan) between room centers for secret passage. Default: 15 */
  readonly maxDistance?: number;
  /** Minimum distance to consider (avoids very short secrets). Default: 5 */
  readonly minDistance?: number;
  /** Don't add secrets to dead-end rooms. Default: false */
  readonly skipDeadEnds?: boolean;
  /** Maximum number of secret passages to add. Default: 3 */
  readonly maxSecrets?: number;
  /** Carve the secret passage into the grid. Default: false (just metadata) */
  readonly carvePassages?: boolean;
  /** Width of carved secret passages. Default: 1 */
  readonly passageWidth?: number;
}

/**
 * Default secret passage configuration
 */
export const DEFAULT_SECRET_CONFIG: Required<SecretPassageConfig> = {
  secretRatio: 0.1,
  maxDistance: 15,
  minDistance: 5,
  skipDeadEnds: false,
  maxSecrets: 3,
  carvePassages: false,
  passageWidth: 1,
};

// =============================================================================
// SECRET PASSAGE DETECTION
// =============================================================================

/**
 * Candidate pair of rooms for a secret passage
 */
interface SecretCandidate {
  readonly fromRoom: Room;
  readonly toRoom: Room;
  readonly distance: number;
}

/**
 * Find potential room pairs for secret passages.
 * Returns rooms that are close but not already connected.
 */
export function findSecretCandidates(
  rooms: readonly Room[],
  existingConnections: readonly Connection[],
  config: Required<SecretPassageConfig>,
): SecretCandidate[] {
  // Build set of existing connections
  const connected = new Set<string>();
  for (const conn of existingConnections) {
    const key1 = `${conn.fromRoomId}-${conn.toRoomId}`;
    const key2 = `${conn.toRoomId}-${conn.fromRoomId}`;
    connected.add(key1);
    connected.add(key2);
  }

  const candidates: SecretCandidate[] = [];

  for (let i = 0; i < rooms.length; i++) {
    const roomA = rooms[i];
    if (!roomA) continue;

    // Skip dead ends if configured
    if (config.skipDeadEnds && roomA.isDeadEnd) continue;

    for (let j = i + 1; j < rooms.length; j++) {
      const roomB = rooms[j];
      if (!roomB) continue;

      // Skip dead ends if configured
      if (config.skipDeadEnds && roomB.isDeadEnd) continue;

      // Skip if already connected
      const key = `${roomA.id}-${roomB.id}`;
      if (connected.has(key)) continue;

      // Calculate Manhattan distance
      const distance =
        Math.abs(roomA.centerX - roomB.centerX) +
        Math.abs(roomA.centerY - roomB.centerY);

      // Check distance constraints
      if (distance >= config.minDistance && distance <= config.maxDistance) {
        candidates.push({
          fromRoom: roomA,
          toRoom: roomB,
          distance,
        });
      }
    }
  }

  // Sort by distance (shorter secrets are more interesting)
  candidates.sort((a, b) => a.distance - b.distance);

  return candidates;
}

// =============================================================================
// SECRET PASSAGE PASS
// =============================================================================

/**
 * Creates a pass that adds secret passages between close rooms.
 */
export function addSecretPassages(
  config: SecretPassageConfig = {},
): Pass<DungeonStateArtifact, DungeonStateArtifact, "details"> {
  const resolvedConfig: Required<SecretPassageConfig> = {
    ...DEFAULT_SECRET_CONFIG,
    ...config,
  };

  return {
    id: "carving.add-secret-passages",
    inputType: "dungeon-state",
    outputType: "dungeon-state",
    requiredStreams: ["details"] as const,
    run(input, ctx) {
      const rng = ctx.streams.details;
      const { grid, rooms, connections } = input;

      // Find candidate room pairs
      const candidates = findSecretCandidates(rooms, connections, resolvedConfig);

      if (candidates.length === 0) {
        ctx.trace.decision(
          "carving.add-secret-passages",
          "No secret passage candidates found",
          [],
          0,
          "No room pairs within distance constraints",
        );
        return input;
      }

      const newConnections: Connection[] = [...connections];
      let secretsAdded = 0;

      for (const candidate of candidates) {
        // Check if we've reached the maximum
        if (secretsAdded >= resolvedConfig.maxSecrets) break;

        // Random check based on ratio
        if (rng.next() >= resolvedConfig.secretRatio) continue;

        const from: Point = {
          x: candidate.fromRoom.centerX,
          y: candidate.fromRoom.centerY,
        };
        const to: Point = {
          x: candidate.toRoom.centerX,
          y: candidate.toRoom.centerY,
        };

        let path: Point[];

        if (resolvedConfig.carvePassages) {
          // Reuse corridor carving implementation for consistency with normal corridors.
          path = carveBresenhamCorridor(
            grid,
            from,
            to,
            resolvedConfig.passageWidth,
            true,
          );
        } else {
          // Compute theoretical path without mutating the grid.
          path = bresenhamLine(from, to);
        }

        // Find the midpoint for the secret door/trigger position
        const midIdx = Math.floor(path.length / 2);
        const doorPosition = path[midIdx];

        const secretConnection: Connection = {
          fromRoomId: candidate.fromRoom.id,
          toRoomId: candidate.toRoom.id,
          pathLength: path.length,
          path,
          type: "secret",
          doorPosition,
          metadata: {
            visible: false, // Hidden by default
            tags: ["secret", "discoverable"],
          },
        };

        newConnections.push(secretConnection);
        secretsAdded++;

        ctx.trace.decision(
          "carving.add-secret-passages",
          `Secret passage ${candidate.fromRoom.id}->${candidate.toRoom.id}`,
          ["skip", "add"],
          "add",
          `Distance: ${candidate.distance}, carved: ${resolvedConfig.carvePassages}`,
        );
      }

      ctx.trace.decision(
        "carving.add-secret-passages",
        "Secret passages added",
        [],
        secretsAdded,
        `Added ${secretsAdded} secret passages from ${candidates.length} candidates`,
      );

      return {
        ...input,
        connections: newConnections,
      };
    },
  };
}

// =============================================================================
// SECRET PASSAGE UTILITIES
// =============================================================================

/**
 * Get all secret connections from a list of connections
 */
export function getSecretConnections(
  connections: readonly Connection[],
): Connection[] {
  return connections.filter((c) => c.type === "secret");
}

/**
 * Reveal a secret connection (mark as visible)
 */
export function revealSecret(connection: Connection): Connection {
  if (connection.type !== "secret") return connection;

  return {
    ...connection,
    metadata: {
      ...connection.metadata,
      visible: true,
      tags: [...(connection.metadata?.tags ?? []), "revealed"],
    },
  };
}

/**
 * Check if two rooms are secretly connected
 */
export function areSecretlyConnected(
  roomAId: number,
  roomBId: number,
  connections: readonly Connection[],
): boolean {
  return connections.some(
    (c) =>
      c.type === "secret" &&
      ((c.fromRoomId === roomAId && c.toRoomId === roomBId) ||
        (c.fromRoomId === roomBId && c.toRoomId === roomAId)),
  );
}
