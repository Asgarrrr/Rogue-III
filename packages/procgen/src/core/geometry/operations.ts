/**
 * Geometry operations - pure functions for geometric calculations.
 * All functions are deterministic and side-effect free.
 */

import type { Bounds, Dimensions, Point, Rect, Segment } from "./types";

// =============================================================================
// POINT OPERATIONS
// =============================================================================

/**
 * Create a point
 */
export function point(x: number, y: number): Point {
  return { x, y };
}

/**
 * Add two points
 */
export function addPoints(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

/**
 * Subtract point b from point a
 */
export function subtractPoints(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

/**
 * Scale a point by a factor
 */
export function scalePoint(p: Point, factor: number): Point {
  return { x: p.x * factor, y: p.y * factor };
}

/**
 * Manhattan distance between two points
 */
export function manhattanDistance(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * Euclidean distance between two points
 */
export function euclideanDistance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Alias for euclideanDistance
 */
export const distance = euclideanDistance;

/**
 * Squared euclidean distance (faster, no sqrt)
 */
export function squaredDistance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/**
 * Chebyshev distance (max of dx, dy)
 */
export function chebyshevDistance(a: Point, b: Point): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/**
 * Check if two points are equal
 */
export function pointsEqual(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

/**
 * Linear interpolation between two points
 */
export function lerpPoint(a: Point, b: Point, t: number): Point {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
  };
}

// =============================================================================
// RECT OPERATIONS
// =============================================================================

/**
 * Create a rect
 */
export function rect(
  x: number,
  y: number,
  width: number,
  height: number,
): Rect {
  return { x, y, width, height };
}

/**
 * Get the center point of a rect
 */
export function rectCenter(r: Rect): Point {
  return {
    x: r.x + Math.floor(r.width / 2),
    y: r.y + Math.floor(r.height / 2),
  };
}

/**
 * Get the area of a rect
 */
export function rectArea(r: Rect): number {
  return r.width * r.height;
}

/**
 * Check if a point is inside a rect
 */
export function rectContainsPoint(r: Rect, p: Point): boolean {
  return (
    p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height
  );
}

/**
 * Check if two rects overlap
 */
export function rectsOverlap(a: Rect, b: Rect): boolean {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

/**
 * Check if two rects overlap with padding
 */
export function rectsOverlapWithPadding(
  a: Rect,
  b: Rect,
  padding: number,
): boolean {
  return (
    a.x - padding < b.x + b.width + padding &&
    a.x + a.width + padding > b.x - padding &&
    a.y - padding < b.y + b.height + padding &&
    a.y + a.height + padding > b.y - padding
  );
}

/**
 * Get the intersection of two rects (or null if no overlap)
 */
export function rectIntersection(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const width = Math.min(a.x + a.width, b.x + b.width) - x;
  const height = Math.min(a.y + a.height, b.y + b.height) - y;

  if (width <= 0 || height <= 0) return null;
  return { x, y, width, height };
}

/**
 * Check if outer rect fully contains inner rect
 */
export function rectContains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

/**
 * Expand a rect by padding on all sides
 */
export function expandRect(r: Rect, padding: number): Rect {
  return {
    x: r.x - padding,
    y: r.y - padding,
    width: r.width + padding * 2,
    height: r.height + padding * 2,
  };
}

/**
 * Shrink a rect by padding on all sides
 */
export function shrinkRect(r: Rect, padding: number): Rect {
  return {
    x: r.x + padding,
    y: r.y + padding,
    width: Math.max(0, r.width - padding * 2),
    height: Math.max(0, r.height - padding * 2),
  };
}

/**
 * Convert rect to bounds
 */
export function rectToBounds(r: Rect): Bounds {
  return {
    minX: r.x,
    minY: r.y,
    maxX: r.x + r.width - 1,
    maxY: r.y + r.height - 1,
  };
}

/**
 * Convert bounds to rect
 */
export function boundsToRect(b: Bounds): Rect {
  return {
    x: b.minX,
    y: b.minY,
    width: b.maxX - b.minX + 1,
    height: b.maxY - b.minY + 1,
  };
}

// =============================================================================
// BOUNDS OPERATIONS
// =============================================================================

/**
 * Create bounds from points
 */
export function boundsFromPoints(points: readonly Point[]): Bounds | null {
  if (points.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  return { minX, minY, maxX, maxY };
}

/**
 * Check if bounds contain a point
 */
export function boundsContainPoint(b: Bounds, p: Point): boolean {
  return p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;
}

/**
 * Merge two bounds
 */
export function mergeBounds(a: Bounds, b: Bounds): Bounds {
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

// =============================================================================
// SEGMENT OPERATIONS
// =============================================================================

/**
 * Create a segment
 */
export function segment(start: Point, end: Point): Segment {
  return { start, end };
}

/**
 * Get the length of a segment
 */
export function segmentLength(s: Segment): number {
  return euclideanDistance(s.start, s.end);
}

/**
 * Get all integer points along a segment (Bresenham's line algorithm)
 */
export function segmentPoints(s: Segment): Point[] {
  const points: Point[] = [];
  let x0 = s.start.x;
  let y0 = s.start.y;
  const x1 = s.end.x;
  const y1 = s.end.y;

  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    points.push({ x: x0, y: y0 });

    if (x0 === x1 && y0 === y1) break;

    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }

  return points;
}

/**
 * Bresenham's line algorithm - takes two points directly
 */
export function bresenhamLine(from: Point, to: Point): Point[] {
  return segmentPoints({ start: from, end: to });
}

// =============================================================================
// DIMENSION OPERATIONS
// =============================================================================

/**
 * Check if a point is within dimensions
 */
export function isInBounds(p: Point, dim: Dimensions): boolean {
  return p.x >= 0 && p.x < dim.width && p.y >= 0 && p.y < dim.height;
}

/**
 * Clamp a point to dimensions
 */
export function clampToBounds(p: Point, dim: Dimensions): Point {
  return {
    x: Math.max(0, Math.min(dim.width - 1, p.x)),
    y: Math.max(0, Math.min(dim.height - 1, p.y)),
  };
}

/**
 * Convert 2D coordinates to 1D index (row-major)
 */
export function toIndex(x: number, y: number, width: number): number {
  return y * width + x;
}

/**
 * Convert 1D index to 2D coordinates (row-major)
 */
export function fromIndex(index: number, width: number): Point {
  return {
    x: index % width,
    y: Math.floor(index / width),
  };
}
