/**
 * BSP Generator Constants
 *
 * Named constants for magic numbers used in BSP dungeon generation.
 */

// =============================================================================
// DIMENSION CONSTRAINTS
// =============================================================================

/** Minimum width/height for BSP-generated dungeons */
export const MIN_DUNGEON_DIMENSION = 20;

/** Minimum room size in tiles */
export const MIN_ROOM_SIZE = 3;

// =============================================================================
// BSP PARTITIONING
// =============================================================================

/** Maximum recursion depth for BSP tree partitioning */
export const MAX_BSP_DEPTH = 8;

/** Aspect ratio threshold for preferring split direction */
export const SPLIT_PREFERENCE_RATIO = 1.25;

/** Minimum split ratio (left/top portion) */
export const SPLIT_RATIO_MIN = 0.2;

/** Maximum split ratio (left/top portion) */
export const SPLIT_RATIO_MAX = 0.8;

/** Threshold for random direction selection when aspect ratio is balanced */
export const RANDOM_DIRECTION_THRESHOLD = 0.5;

// =============================================================================
// ROOM TYPE ASSIGNMENT
// =============================================================================

/** Distance weight multiplier for boss room scoring */
export const BOSS_DISTANCE_WEIGHT = 10;

/** Probability threshold for library room assignment */
export const LIBRARY_SPAWN_CHANCE = 0.1;

/** Probability threshold for armory room assignment */
export const ARMORY_SPAWN_CHANCE = 0.2;

// =============================================================================
// CORRIDORS
// =============================================================================

/** Divisor to calculate corridor half-width */
export const CORRIDOR_HALF_WIDTH_DIVISOR = 2;

// =============================================================================
// SPAWN PLACEMENT
// =============================================================================

/** Random offset range for treasure placement (±tiles from center) */
export const TREASURE_OFFSET_RANGE = 2;

/** Padding from room edges for spawn placement */
export const SPAWN_EDGE_PADDING = 1;

// =============================================================================
// NUMERIC LIMITS
// =============================================================================

/** Maximum uint32 value for seed generation */
export const MAX_UINT32 = 0xffffffff;
