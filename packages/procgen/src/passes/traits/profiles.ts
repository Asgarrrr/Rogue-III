/**
 * Room Trait Profiles
 *
 * Configurable trait system for room personalities.
 * Traits are semantic HINTS that the game layer interprets.
 *
 * The trait system is 100% configurable - define your own dimensions
 * that make sense for your game.
 */

import type { TraitData, TraitVector } from "../../core/traits";
import { createTraitVector } from "../../core/traits";
import type { RoomType } from "../../pipeline/types";

// =============================================================================
// TRAIT DIMENSIONS (CONFIGURABLE)
// =============================================================================

/**
 * Default trait dimensions - these are EXAMPLES, not requirements.
 * Override with your own dimensions via TraitConfig.
 *
 * @example
 * ```typescript
 * // For a sci-fi game:
 * const MY_DIMENSIONS = ["radiation", "tech", "alien", "secure"] as const;
 *
 * // For a horror game:
 * const MY_DIMENSIONS = ["dread", "decay", "haunted", "bloody"] as const;
 * ```
 */
export const DEFAULT_TRAIT_DIMENSIONS = [
  "dangerous",
  "ancient",
  "mysterious",
  "cursed",
  "sacred",
  "wealthy",
  "claustrophobic",
  "natural",
] as const;

/**
 * @deprecated Use DEFAULT_TRAIT_DIMENSIONS or define your own
 */
export const ROOM_TRAIT_DIMENSIONS = DEFAULT_TRAIT_DIMENSIONS;

export type RoomTraitDimension = string; // Now accepts any string

// =============================================================================
// TRAIT PROFILES BY ROOM TYPE
// =============================================================================

/**
 * Base trait profiles for each room type.
 * These define the "personality" of rooms based on their purpose.
 */
export const ROOM_TYPE_PROFILES: Record<RoomType, TraitData> = {
  entrance: {
    dangerous: 0.1,
    ancient: 0.2,
    mysterious: 0.1,
    cursed: 0.0,
    sacred: 0.3,
    wealthy: 0.0,
    claustrophobic: 0.1,
    natural: 0.2,
  },

  exit: {
    dangerous: 0.3,
    ancient: 0.4,
    mysterious: 0.3,
    cursed: 0.1,
    sacred: 0.0,
    wealthy: 0.0,
    claustrophobic: 0.2,
    natural: 0.3,
  },

  normal: {
    dangerous: 0.3,
    ancient: 0.3,
    mysterious: 0.2,
    cursed: 0.1,
    sacred: 0.1,
    wealthy: 0.1,
    claustrophobic: 0.3,
    natural: 0.2,
  },

  treasure: {
    dangerous: 0.4,
    ancient: 0.3,
    mysterious: 0.4,
    cursed: 0.2,
    sacred: 0.0,
    wealthy: 1.0,
    claustrophobic: 0.4,
    natural: 0.1,
  },

  boss: {
    dangerous: 1.0,
    ancient: 0.6,
    mysterious: 0.5,
    cursed: 0.7,
    sacred: 0.0,
    wealthy: 0.3,
    claustrophobic: 0.0,
    natural: 0.2,
  },

  cavern: {
    dangerous: 0.4,
    ancient: 0.5,
    mysterious: 0.3,
    cursed: 0.1,
    sacred: 0.0,
    wealthy: 0.2,
    claustrophobic: 0.2,
    natural: 1.0,
  },

  library: {
    dangerous: 0.2,
    ancient: 0.8,
    mysterious: 0.6,
    cursed: 0.1,
    sacred: 0.3,
    wealthy: 0.2,
    claustrophobic: 0.5,
    natural: 0.0,
  },

  armory: {
    dangerous: 0.5,
    ancient: 0.4,
    mysterious: 0.1,
    cursed: 0.2,
    sacred: 0.0,
    wealthy: 0.4,
    claustrophobic: 0.4,
    natural: 0.0,
  },
};

/**
 * Get the base trait vector for a room type
 */
export function getProfileForRoomType(roomType: RoomType): TraitVector {
  const profile = ROOM_TYPE_PROFILES[roomType];
  return createTraitVector(profile);
}

// =============================================================================
// TRAIT MODIFIERS
// =============================================================================

/**
 * Modifiers that can be applied based on room characteristics
 */
export interface TraitModifier {
  /** Modifier name for debugging */
  readonly name: string;
  /** Traits to adjust (additive, clamped to 0-1) */
  readonly adjustments: Partial<Record<RoomTraitDimension, number>>;
  /** Condition function to check if modifier applies */
  readonly condition: (room: RoomModifierContext) => boolean;
}

/**
 * Context for evaluating trait modifiers
 */
export interface RoomModifierContext {
  readonly area: number;
  readonly width: number;
  readonly height: number;
  readonly connectionCount: number;
  readonly distanceFromStart: number;
  readonly normalizedDistance: number;
  readonly isDeadEnd: boolean;
  readonly isHub: boolean;
}

/**
 * Standard trait modifiers based on room characteristics
 */
export const STANDARD_MODIFIERS: readonly TraitModifier[] = [
  {
    name: "dead-end-isolation",
    adjustments: {
      claustrophobic: 0.2,
      mysterious: 0.1,
      dangerous: 0.15,
    },
    condition: (room) => room.isDeadEnd,
  },
  {
    name: "hub-activity",
    adjustments: {
      claustrophobic: -0.2,
      dangerous: -0.1,
      sacred: 0.1,
    },
    condition: (room) => room.isHub,
  },
  {
    name: "far-from-entrance",
    adjustments: {
      dangerous: 0.2,
      ancient: 0.15,
      cursed: 0.1,
    },
    condition: (room) => room.normalizedDistance > 0.7,
  },
  {
    name: "near-entrance",
    adjustments: {
      dangerous: -0.15,
      sacred: 0.1,
    },
    condition: (room) => room.normalizedDistance < 0.3,
  },
  {
    name: "large-room",
    adjustments: {
      claustrophobic: -0.3,
      wealthy: 0.1,
    },
    condition: (room) => room.area > 100,
  },
  {
    name: "small-room",
    adjustments: {
      claustrophobic: 0.2,
      mysterious: 0.1,
    },
    condition: (room) => room.area < 36,
  },
  {
    name: "long-corridor-like",
    adjustments: {
      claustrophobic: 0.15,
      dangerous: 0.1,
    },
    condition: (room) => {
      const ratio =
        Math.max(room.width, room.height) / Math.min(room.width, room.height);
      return ratio > 2.5;
    },
  },
];

/**
 * Apply modifiers to a trait data object
 */
export function applyModifiers(
  base: TraitData,
  context: RoomModifierContext,
  modifiers: readonly TraitModifier[] = STANDARD_MODIFIERS,
): TraitData {
  const result = { ...base };

  for (const modifier of modifiers) {
    if (modifier.condition(context)) {
      for (const [trait, adjustment] of Object.entries(modifier.adjustments)) {
        const current = result[trait] ?? 0.5;
        const adjusted = current + (adjustment ?? 0);
        result[trait] = Math.max(0, Math.min(1, adjusted));
      }
    }
  }

  return result;
}
