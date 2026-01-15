/**
 * Grid types for procedural generation.
 */

import type { Bounds, Point } from "../geometry/types";

/**
 * Cell types for dungeon grids
 */
export const CellType = {
  FLOOR: 0,
  WALL: 1,
  DOOR: 2,
  WATER: 3,
  LAVA: 4,
} as const;

export type CellType = (typeof CellType)[keyof typeof CellType];

/**
 * Region represents a connected area in the grid
 */
export interface Region {
  readonly id: number;
  readonly points: readonly Point[];
  readonly bounds: Bounds;
  readonly size: number;
}

/**
 * Flood fill configuration
 */
export interface FloodFillConfig {
  readonly maxSize?: number;
  readonly targetValue?: CellType;
  readonly diagonal?: boolean;
}
