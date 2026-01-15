/**
 * Core Constants
 *
 * Named constants for magic numbers used across the procgen-v2 core modules.
 */

// =============================================================================
// PATHFINDING
// =============================================================================

/** Diagonal movement cost (√2 ≈ 1.414) */
export const DIAGONAL_COST = Math.SQRT2;

/** Orthogonal (cardinal) movement cost */
export const ORTHOGONAL_COST = 1;

/** Flee map inversion multiplier for inverse Dijkstra maps */
export const FLEE_MAP_INVERSION_MULTIPLIER = -1.2;

// =============================================================================
// FLOATING POINT PRECISION
// =============================================================================

/** Epsilon for floating-point comparisons in Delaunay triangulation */
export const DELAUNAY_EPSILON = 1e-10;

/** Epsilon for trait vector equality comparisons */
export const TRAIT_EPSILON = 1e-10;

// =============================================================================
// BLENDING DEFAULTS
// =============================================================================

/** Default blending value for smoothstep and mix functions */
export const DEFAULT_BLEND_VALUE = 0.5;

/** Noise center offset for balanced noise application */
export const NOISE_CENTER_OFFSET = 0.5;

// =============================================================================
// HASH CONSTANTS
// =============================================================================

/** FNV-64 offset basis constant */
export const FNV64_OFFSET_BASIS = 14695981039346656037n;

/** FNV-64 prime constant */
export const FNV64_PRIME = 1099511628211n;

/** FNV-1a 32-bit offset basis */
export const FNV32_OFFSET_BASIS = 2166136261;

/** FNV-1a 32-bit prime */
export const FNV32_PRIME = 16777619;

/** UTF-8 single-byte character boundary */
export const UTF8_SINGLE_BYTE_BOUNDARY = 128;

// =============================================================================
// BIT OPERATIONS
// =============================================================================

/** Bits per Uint32 element for bit grids */
export const BITS_PER_ELEMENT = 32;

// =============================================================================
// ENCODING
// =============================================================================

/** Base-62 encoding alphabet size */
export const BASE62_RADIX = 62n;

/** Seed encoding version number */
export const SEED_ENCODING_VERSION = 1;

/** Padding length for base-62 seed encoding */
export const BASE62_PADDING_LENGTH = 6;
