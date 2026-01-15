/**
 * Core geometry types for procedural generation.
 * All types are immutable value objects.
 */

/**
 * 2D point with integer coordinates
 */
export interface Point {
  readonly x: number;
  readonly y: number;
}

/**
 * Rectangle defined by position and size
 */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Bounding box defined by min/max corners
 */
export interface Bounds {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/**
 * Line segment between two points
 */
export interface Segment {
  readonly start: Point;
  readonly end: Point;
}

/**
 * Grid dimensions
 */
export interface Dimensions {
  readonly width: number;
  readonly height: number;
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

export type Direction4 = (typeof DIRECTIONS_4)[number];
export type Direction8 = (typeof DIRECTIONS_8)[number];
