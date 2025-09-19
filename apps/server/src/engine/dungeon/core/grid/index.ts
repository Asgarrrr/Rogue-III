/**
 * High-performance grid utilities for dungeon generation and ECS systems.
 *
 * This module provides optimized data structures and algorithms for:
 * - Grid-based operations with minimal memory allocation
 * - Spatial queries using hash tables
 * - Connected component analysis with Union-Find
 * - Efficient flood fill algorithms
 * - Object pooling for garbage collection optimization
 */

export * from "./types";
export * from "./grid";
export * from "./spatial-hash";
export * from "./union-find";
export * from "./flood-fill";
export * from "./object-pool";

// Re-export commonly used types for convenience
export type {
  Point,
  Bounds,
  GridDimensions,
  Region,
  FloodFillConfig,
} from "./types";
export { CellType, DIRECTIONS_4, DIRECTIONS_8 } from "./types";
