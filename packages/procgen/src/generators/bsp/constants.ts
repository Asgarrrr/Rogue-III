/**
 * BSP Generator Constants
 *
 * Named constants for magic numbers used in BSP dungeon generation.
 */

// =============================================================================
// BSP PARTITIONING
// =============================================================================

/** Maximum recursion depth for BSP tree partitioning */
export const MAX_BSP_DEPTH = 8;

/** Aspect ratio threshold for preferring split direction */
export const SPLIT_PREFERENCE_RATIO = 1.25;

/** Threshold for random direction selection when aspect ratio is balanced */
export const RANDOM_DIRECTION_THRESHOLD = 0.5;
