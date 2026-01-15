/**
 * Room Traits Assignment Pass
 *
 * Assigns trait vectors to rooms based on:
 * 1. Base profiles per room type
 * 2. Room characteristics (size, connections, distance)
 * 3. Trait propagation through connections (creates "zones")
 * 4. Random mutation for variety
 *
 * @example
 * ```typescript
 * const pass = createAssignRoomTraitsPass({
 *   propagationStrength: 0.2, // 20% trait sharing
 *   mutationIntensity: 0.15, // 15% random variation
 * });
 *
 * const result = pass.run(dungeonState, ctx);
 * // result.rooms now have traits assigned
 * ```
 */

import type { TraitVector } from "../../core/traits";
import {
  blendTraits,
  createTraitVector,
  mutateTraits,
  traitVectorToObject,
} from "../../core/traits";
import type {
  Connection,
  DungeonStateArtifact,
  Pass,
  Room,
} from "../../pipeline/types";
import {
  calculateConnectionCounts,
  calculateRoomDistances,
} from "../connectivity/graph-algorithms";
import {
  applyModifiers,
  getProfileForRoomType,
  type RoomModifierContext,
  STANDARD_MODIFIERS,
  type TraitModifier,
} from "./profiles";

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Configuration for room traits assignment
 */
export interface AssignRoomTraitsConfig {
  /**
   * How much traits propagate between connected rooms.
   * 0 = no propagation, 1 = full propagation.
   * @default 0.2
   */
  readonly propagationStrength?: number;

  /**
   * How many propagation iterations to run.
   * More iterations = smoother gradients.
   * @default 3
   */
  readonly propagationIterations?: number;

  /**
   * Random mutation intensity after propagation.
   * 0 = no mutation, 1 = full random.
   * @default 0.15
   */
  readonly mutationIntensity?: number;

  /**
   * Custom modifiers to apply instead of/in addition to standard ones.
   * If not provided, uses STANDARD_MODIFIERS.
   */
  readonly modifiers?: readonly TraitModifier[];

  /**
   * Whether to add standard modifiers when custom modifiers are provided.
   * @default false
   */
  readonly includeStandardModifiers?: boolean;

  /**
   * Enable trace logging.
   * @default false
   */
  readonly trace?: boolean;
}

/**
 * Default configuration
 */
export const DEFAULT_TRAITS_CONFIG: Required<AssignRoomTraitsConfig> = {
  propagationStrength: 0.2,
  propagationIterations: 3,
  mutationIntensity: 0.15,
  modifiers: STANDARD_MODIFIERS,
  includeStandardModifiers: false,
  trace: false,
};

// =============================================================================
// PASS IMPLEMENTATION
// =============================================================================

/**
 * Create the room traits assignment pass
 */
export function createAssignRoomTraitsPass(
  config: AssignRoomTraitsConfig = {},
): Pass<DungeonStateArtifact, DungeonStateArtifact> {
  const options = { ...DEFAULT_TRAITS_CONFIG, ...config };

  return {
    id: "traits.assign-room-traits",
    inputType: "dungeon-state",
    outputType: "dungeon-state",

    run(input, ctx) {
      const rng = ctx.streams.details;

      // Calculate room metadata for modifiers
      const metadata = calculateTraitRoomMetadata(
        input.rooms,
        input.connections,
      );

      // Step 1: Assign base traits from profiles + modifiers
      const roomTraits = new Map<number, TraitVector>();
      for (const room of input.rooms) {
        const baseProfile = getProfileForRoomType(room.type);
        const meta = metadata.get(room.id);

        if (meta) {
          const modifiers = options.includeStandardModifiers
            ? [...(options.modifiers ?? []), ...STANDARD_MODIFIERS]
            : (options.modifiers ?? []);

          const withModifiers = applyModifiers(
            traitVectorToObject(baseProfile),
            meta,
            modifiers,
          );
          roomTraits.set(room.id, createTraitVector(withModifiers));
        } else {
          roomTraits.set(room.id, baseProfile);
        }
      }

      // Step 2: Propagate traits through connections
      if (
        options.propagationStrength > 0 &&
        options.propagationIterations > 0
      ) {
        propagateTraits(
          roomTraits,
          input.connections,
          options.propagationStrength,
          options.propagationIterations,
        );
      }

      // Step 3: Apply random mutation for variety
      if (options.mutationIntensity > 0) {
        for (const [roomId, traits] of roomTraits) {
          const mutated = mutateTraits(traits, options.mutationIntensity, () =>
            rng.next(),
          );
          roomTraits.set(roomId, mutated);
        }
      }

      // Step 4: Create new rooms with traits assigned
      const newRooms = input.rooms.map((room) => ({
        ...room,
        traits: roomTraits.get(room.id),
      }));

      // Trace logging
      if (options.trace) {
        const traitsAssigned = newRooms.filter((r) => r.traits).length;
        ctx.trace.decision(
          "traits.assign-room-traits",
          "Assigned room traits",
          [
            `${input.rooms.length} rooms`,
            `propagation: ${options.propagationStrength}`,
            `mutation: ${options.mutationIntensity}`,
          ],
          `${traitsAssigned} rooms with traits`,
          `Propagation iterations: ${options.propagationIterations}`,
        );
      }

      return {
        ...input,
        rooms: newRooms,
      };
    },
  };
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Calculate metadata for each room used by modifiers.
 * Uses shared utilities from connectivity/graph-algorithms.
 */
function calculateTraitRoomMetadata(
  rooms: readonly Room[],
  connections: readonly Connection[],
): Map<number, RoomModifierContext> {
  const metadata = new Map<number, RoomModifierContext>();

  // Find entrance for distance calculation
  const entrance = rooms.find((r) => r.type === "entrance");
  const entranceId = entrance?.id ?? 0;

  // Use shared utilities
  const distances = calculateRoomDistances(rooms, connections, entranceId);
  const connectionCounts = calculateConnectionCounts(rooms, connections);
  const maxDistance = Math.max(...Array.from(distances.values()), 1);

  // Create metadata for each room
  for (const room of rooms) {
    const connectionCount = connectionCounts.get(room.id) ?? 0;
    const distance = distances.get(room.id) ?? 0;

    metadata.set(room.id, {
      area: room.width * room.height,
      width: room.width,
      height: room.height,
      connectionCount,
      distanceFromStart: distance,
      normalizedDistance: distance / maxDistance,
      isDeadEnd: connectionCount === 1,
      isHub: connectionCount >= 3,
    });
  }

  return metadata;
}

/**
 * Propagate traits between connected rooms.
 *
 * Uses iterative relaxation: each room's traits blend slightly with neighbors.
 * This creates natural "zones" where nearby rooms have similar traits.
 */
function propagateTraits(
  roomTraits: Map<number, TraitVector>,
  connections: readonly Connection[],
  strength: number,
  iterations: number,
): void {
  // Build adjacency map
  const adjacency = new Map<number, number[]>();
  for (const roomId of roomTraits.keys()) {
    adjacency.set(roomId, []);
  }
  for (const conn of connections) {
    adjacency.get(conn.fromRoomId)?.push(conn.toRoomId);
    adjacency.get(conn.toRoomId)?.push(conn.fromRoomId);
  }

  // Iterative relaxation
  for (let iter = 0; iter < iterations; iter++) {
    const newTraits = new Map<number, TraitVector>();

    for (const [roomId, traits] of roomTraits) {
      const neighbors = adjacency.get(roomId) ?? [];

      if (neighbors.length === 0) {
        newTraits.set(roomId, traits);
        continue;
      }

      // Calculate average of neighbor traits
      let blended = traits;
      for (const neighborId of neighbors) {
        const neighborTraits = roomTraits.get(neighborId);
        if (neighborTraits) {
          // Blend current traits toward neighbor traits by strength/neighborCount
          const blendAmount = strength / neighbors.length;
          blended = blendTraits(blended, neighborTraits, blendAmount);
        }
      }

      newTraits.set(roomId, blended);
    }

    // Update for next iteration
    for (const [roomId, traits] of newTraits) {
      roomTraits.set(roomId, traits);
    }
  }
}

// =============================================================================
// UTILITY EXPORTS
// =============================================================================

/**
 * Quick function to assign traits to rooms without creating a pass
 */
export function assignRoomTraits(
  rooms: readonly Room[],
  connections: readonly Connection[],
  config: AssignRoomTraitsConfig = {},
  rng: () => number,
): readonly Room[] {
  const options = { ...DEFAULT_TRAITS_CONFIG, ...config };
  const metadata = calculateTraitRoomMetadata(rooms, connections);

  // Step 1: Base traits
  const roomTraits = new Map<number, TraitVector>();
  for (const room of rooms) {
    const baseProfile = getProfileForRoomType(room.type);
    const meta = metadata.get(room.id);

    if (meta) {
      const modifiers = options.includeStandardModifiers
        ? [...(options.modifiers ?? []), ...STANDARD_MODIFIERS]
        : (options.modifiers ?? []);

      const withModifiers = applyModifiers(
        traitVectorToObject(baseProfile),
        meta,
        modifiers,
      );
      roomTraits.set(room.id, createTraitVector(withModifiers));
    } else {
      roomTraits.set(room.id, baseProfile);
    }
  }

  // Step 2: Propagation
  if (options.propagationStrength > 0 && options.propagationIterations > 0) {
    propagateTraits(
      roomTraits,
      connections,
      options.propagationStrength,
      options.propagationIterations,
    );
  }

  // Step 3: Mutation
  if (options.mutationIntensity > 0) {
    for (const [roomId, traits] of roomTraits) {
      const mutated = mutateTraits(traits, options.mutationIntensity, rng);
      roomTraits.set(roomId, mutated);
    }
  }

  // Return rooms with traits
  return rooms.map((room) => ({
    ...room,
    traits: roomTraits.get(room.id),
  }));
}
