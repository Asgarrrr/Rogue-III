/**
 * Cellular Automata Generator Constants
 *
 * Named constants for magic numbers used in cellular automata dungeon generation.
 */

// =============================================================================
// DIMENSION CONSTRAINTS
// =============================================================================

/** Minimum width/height for cellular automata dungeons */
export const MIN_DUNGEON_DIMENSION = 30;

// =============================================================================
// AUTOMATA PARAMETERS
// =============================================================================

/** Minimum initial fill ratio (floor vs wall probability) */
export const MIN_INITIAL_FILL_RATIO = 0.3;

/** Maximum initial fill ratio */
export const MAX_INITIAL_FILL_RATIO = 0.7;

/** Minimum birth/death limit value */
export const MIN_AUTOMATA_LIMIT = 1;

/** Maximum birth/death limit value */
export const MAX_AUTOMATA_LIMIT = 8;

/** Maximum iteration count before warning */
export const MAX_SAFE_ITERATIONS = 10;

// =============================================================================
// REGION ANALYSIS
// =============================================================================

/** Minimum region size for playable areas */
export const MIN_REGION_SIZE = 10;

/** Minimum region size for connectivity analysis */
export const MIN_CONNECTIVITY_REGION_SIZE = 10;

/** Sample size for pathfinding between regions */
export const REGION_CONNECTION_SAMPLE_SIZE = 50;

// =============================================================================
// SPAWN PLACEMENT
// =============================================================================

/** Enemy spawn density (percentage of floor tiles) */
export const ENEMY_SPAWN_DENSITY = 0.01;

/** Treasure spawn density (percentage of floor tiles) */
export const TREASURE_SPAWN_DENSITY = 0.002;

/** Maximum attempts to find valid spawn position */
export const MAX_SPAWN_PLACEMENT_ATTEMPTS = 10;
