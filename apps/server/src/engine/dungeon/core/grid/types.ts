/**
 * Core types for grid operations and spatial data structures
 */

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface GridDimensions {
  readonly width: number;
  readonly height: number;
}

/**
 * Cell types for different grid systems
 */
export enum CellType {
  WALL = 1,
  FLOOR = 0,
}

/**
 * Direction vectors for neighbor calculations
 */
export const DIRECTIONS_4 = [
  { x: 0, y: -1 }, // North
  { x: 1, y: 0 }, // East
  { x: 0, y: 1 }, // South
  { x: -1, y: 0 }, // West
] as const;

export const DIRECTIONS_8 = [
  { x: -1, y: -1 }, // NW
  { x: 0, y: -1 }, // N
  { x: 1, y: -1 }, // NE
  { x: -1, y: 0 }, // W
  { x: 1, y: 0 }, // E
  { x: -1, y: 1 }, // SW
  { x: 0, y: 1 }, // S
  { x: 1, y: 1 }, // SE
] as const;

/**
 * Flood fill configuration
 */
export interface FloodFillConfig {
  readonly maxSize?: number;
  readonly targetValue?: CellType;
  readonly fillValue?: CellType;
  readonly diagonal?: boolean;
}

/**
 * Region represents a connected area in the grid
 */
export interface Region {
  readonly id: number;
  readonly points: readonly Point[];
  readonly bounds: Bounds;
  readonly size: number;
}


