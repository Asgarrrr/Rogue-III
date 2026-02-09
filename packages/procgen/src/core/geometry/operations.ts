/**
 * Geometry operations - pure functions for geometric calculations.
 * All functions are deterministic and side-effect free.
 */

import type { Bounds, Dimensions, Point, Rect, Segment } from "./types";

// =============================================================================
// POINT OPERATIONS
// =============================================================================

/**
 * Create a Point from x and y coordinates.
 *
 * @param x - The x coordinate
 * @param y - The y coordinate
 * @returns A Point object with the specified coordinates
 * @example
 * ```typescript
 * const p = point(10, 20);
 * // p = { x: 10, y: 20 }
 * ```
 */
export function point(x: number, y: number): Point {
  return { x, y };
}

/**
 * Add two points together component-wise.
 *
 * @param a - The first point
 * @param b - The second point
 * @returns A new Point with the sum of both points' coordinates
 * @example
 * ```typescript
 * const p1 = point(10, 20);
 * const p2 = point(5, 15);
 * const result = addPoints(p1, p2);
 * // result = { x: 15, y: 35 }
 * ```
 */
export function addPoints(a: Point, b: Point): Point {
  return { x: a.x + b.x, y: a.y + b.y };
}

/**
 * Subtract point b from point a component-wise.
 *
 * @param a - The point to subtract from
 * @param b - The point to subtract
 * @returns A new Point with the difference of both points' coordinates
 * @example
 * ```typescript
 * const p1 = point(10, 20);
 * const p2 = point(5, 15);
 * const result = subtractPoints(p1, p2);
 * // result = { x: 5, y: 5 }
 * ```
 */
export function subtractPoints(a: Point, b: Point): Point {
  return { x: a.x - b.x, y: a.y - b.y };
}

/**
 * Scale a point by multiplying both coordinates by a factor.
 *
 * @param p - The point to scale
 * @param factor - The scaling factor to apply to both coordinates
 * @returns A new Point with scaled coordinates
 * @example
 * ```typescript
 * const p = point(10, 20);
 * const scaled = scalePoint(p, 2);
 * // scaled = { x: 20, y: 40 }
 * ```
 */
export function scalePoint(p: Point, factor: number): Point {
  return { x: p.x * factor, y: p.y * factor };
}

/**
 * Calculate the Manhattan distance (taxicab distance) between two points.
 * The sum of the absolute differences of their coordinates.
 *
 * @param a - The first point
 * @param b - The second point
 * @returns The Manhattan distance between the points
 * @example
 * ```typescript
 * const p1 = point(0, 0);
 * const p2 = point(3, 4);
 * const dist = manhattanDistance(p1, p2);
 * // dist = 7 (|3-0| + |4-0|)
 * ```
 */
export function manhattanDistance(a: Point, b: Point): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * Calculate the Euclidean distance between two points.
 * The straight-line distance using the Pythagorean theorem.
 *
 * @param a - The first point
 * @param b - The second point
 * @returns The Euclidean distance between the points
 * @example
 * ```typescript
 * const p1 = point(0, 0);
 * const p2 = point(3, 4);
 * const dist = euclideanDistance(p1, p2);
 * // dist = 5 (sqrt(3² + 4²))
 * ```
 */
export function euclideanDistance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Alias for euclideanDistance. Calculate the straight-line distance between two points.
 *
 * @param a - The first point
 * @param b - The second point
 * @returns The Euclidean distance between the points
 * @example
 * ```typescript
 * const p1 = point(0, 0);
 * const p2 = point(3, 4);
 * const dist = distance(p1, p2);
 * // dist = 5
 * ```
 */
export const distance = euclideanDistance;

/**
 * Calculate the squared Euclidean distance between two points.
 * Faster than euclideanDistance since it avoids the square root operation.
 * Useful for distance comparisons where the actual distance value isn't needed.
 *
 * @param a - The first point
 * @param b - The second point
 * @returns The squared Euclidean distance between the points
 * @example
 * ```typescript
 * const p1 = point(0, 0);
 * const p2 = point(3, 4);
 * const distSq = squaredDistance(p1, p2);
 * // distSq = 25 (3² + 4²)
 * ```
 */
export function squaredDistance(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/**
 * Calculate the Chebyshev distance between two points.
 * The maximum of the absolute differences of their coordinates.
 * Also known as chessboard distance, as it represents the number of king moves in chess.
 *
 * @param a - The first point
 * @param b - The second point
 * @returns The Chebyshev distance between the points
 * @example
 * ```typescript
 * const p1 = point(0, 0);
 * const p2 = point(3, 4);
 * const dist = chebyshevDistance(p1, p2);
 * // dist = 4 (max(|3-0|, |4-0|))
 * ```
 */
export function chebyshevDistance(a: Point, b: Point): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

/**
 * Check if two points have identical coordinates.
 *
 * @param a - The first point
 * @param b - The second point
 * @returns True if both x and y coordinates are equal
 * @example
 * ```typescript
 * const p1 = point(10, 20);
 * const p2 = point(10, 20);
 * const p3 = point(10, 21);
 * pointsEqual(p1, p2); // true
 * pointsEqual(p1, p3); // false
 * ```
 */
export function pointsEqual(a: Point, b: Point): boolean {
  return a.x === b.x && a.y === b.y;
}

/**
 * Linearly interpolate between two points.
 *
 * @param a - The starting point (t=0)
 * @param b - The ending point (t=1)
 * @param t - The interpolation factor (0 to 1, but can be outside this range)
 * @returns A point interpolated between a and b
 * @example
 * ```typescript
 * const p1 = point(0, 0);
 * const p2 = point(10, 20);
 * const mid = lerpPoint(p1, p2, 0.5);
 * // mid = { x: 5, y: 10 }
 * const quarter = lerpPoint(p1, p2, 0.25);
 * // quarter = { x: 2.5, y: 5 }
 * ```
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
 * Create a Rect from position and dimensions.
 *
 * @param x - The x coordinate of the top-left corner
 * @param y - The y coordinate of the top-left corner
 * @param width - The width of the rectangle
 * @param height - The height of the rectangle
 * @returns A Rect object with the specified position and dimensions
 * @example
 * ```typescript
 * const r = rect(10, 20, 100, 50);
 * // r = { x: 10, y: 20, width: 100, height: 50 }
 * ```
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
 * Get the center point of a rectangle.
 * Uses floor division, so the center of odd-dimensioned rects is biased toward the top-left.
 *
 * @param r - The rectangle
 * @returns The center point of the rectangle
 * @example
 * ```typescript
 * const r = rect(0, 0, 10, 10);
 * const center = rectCenter(r);
 * // center = { x: 5, y: 5 }
 * ```
 */
export function rectCenter(r: Rect): Point {
  return {
    x: r.x + Math.floor(r.width / 2),
    y: r.y + Math.floor(r.height / 2),
  };
}

/**
 * Calculate the area of a rectangle.
 *
 * @param r - The rectangle
 * @returns The area (width × height)
 * @example
 * ```typescript
 * const r = rect(0, 0, 10, 20);
 * const area = rectArea(r);
 * // area = 200
 * ```
 */
export function rectArea(r: Rect): number {
  return r.width * r.height;
}

/**
 * Check if a point is inside a rectangle (inclusive of left/top edges, exclusive of right/bottom).
 *
 * @param r - The rectangle
 * @param p - The point to test
 * @returns True if the point is inside the rectangle
 * @example
 * ```typescript
 * const r = rect(0, 0, 10, 10);
 * rectContainsPoint(r, point(5, 5)); // true
 * rectContainsPoint(r, point(0, 0)); // true (top-left corner)
 * rectContainsPoint(r, point(10, 10)); // false (bottom-right corner is exclusive)
 * rectContainsPoint(r, point(15, 5)); // false
 * ```
 */
export function rectContainsPoint(r: Rect, p: Point): boolean {
  return (
    p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height
  );
}

/**
 * Check if two rectangles overlap at all.
 *
 * @param a - The first rectangle
 * @param b - The second rectangle
 * @returns True if the rectangles have any overlapping area
 * @example
 * ```typescript
 * const r1 = rect(0, 0, 10, 10);
 * const r2 = rect(5, 5, 10, 10);
 * const r3 = rect(20, 20, 10, 10);
 * rectsOverlap(r1, r2); // true
 * rectsOverlap(r1, r3); // false
 * ```
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
 * Check if two rectangles overlap when both are expanded by a padding amount.
 * Useful for collision detection with a safety margin.
 *
 * @param a - The first rectangle
 * @param b - The second rectangle
 * @param padding - The padding amount to add around both rectangles
 * @returns True if the padded rectangles overlap
 * @example
 * ```typescript
 * const r1 = rect(0, 0, 10, 10);
 * const r2 = rect(12, 0, 10, 10);
 * rectsOverlap(r1, r2); // false
 * rectsOverlapWithPadding(r1, r2, 2); // true (with 2 units padding they touch)
 * ```
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
 * Calculate the intersection of two rectangles.
 * Returns the overlapping rectangle or null if they don't overlap.
 *
 * @param a - The first rectangle
 * @param b - The second rectangle
 * @returns The intersection rectangle, or null if no overlap
 * @example
 * ```typescript
 * const r1 = rect(0, 0, 10, 10);
 * const r2 = rect(5, 5, 10, 10);
 * const intersection = rectIntersection(r1, r2);
 * // intersection = { x: 5, y: 5, width: 5, height: 5 }
 *
 * const r3 = rect(20, 20, 10, 10);
 * const noIntersection = rectIntersection(r1, r3);
 * // noIntersection = null
 * ```
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
 * Check if one rectangle fully contains another rectangle.
 *
 * @param outer - The potentially containing rectangle
 * @param inner - The potentially contained rectangle
 * @returns True if outer fully contains inner
 * @example
 * ```typescript
 * const outer = rect(0, 0, 20, 20);
 * const inner = rect(5, 5, 10, 10);
 * const partial = rect(15, 15, 10, 10);
 * rectContains(outer, inner); // true
 * rectContains(outer, partial); // false (extends beyond outer)
 * ```
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
 * Expand a rectangle by adding padding on all sides.
 * The rectangle grows outward in all directions.
 *
 * @param r - The rectangle to expand
 * @param padding - The amount to expand on each side
 * @returns A new rectangle expanded by the padding amount
 * @example
 * ```typescript
 * const r = rect(10, 10, 20, 20);
 * const expanded = expandRect(r, 5);
 * // expanded = { x: 5, y: 5, width: 30, height: 30 }
 * ```
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
 * Shrink a rectangle by removing padding from all sides.
 * The rectangle shrinks inward. Dimensions are clamped to 0 if padding exceeds size.
 *
 * @param r - The rectangle to shrink
 * @param padding - The amount to remove from each side
 * @returns A new rectangle shrunk by the padding amount
 * @example
 * ```typescript
 * const r = rect(10, 10, 20, 20);
 * const shrunk = shrinkRect(r, 5);
 * // shrunk = { x: 15, y: 15, width: 10, height: 10 }
 *
 * const tooMuch = shrinkRect(r, 15);
 * // tooMuch = { x: 25, y: 25, width: 0, height: 0 }
 * ```
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
 * Convert a Rect to Bounds representation.
 * Bounds use inclusive min/max coordinates instead of position/dimensions.
 *
 * @param r - The rectangle to convert
 * @returns A Bounds object representing the same area
 * @example
 * ```typescript
 * const r = rect(10, 20, 5, 8);
 * const bounds = rectToBounds(r);
 * // bounds = { minX: 10, minY: 20, maxX: 14, maxY: 27 }
 * ```
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
 * Convert Bounds to a Rect representation.
 * Transforms inclusive min/max coordinates to position/dimensions format.
 *
 * @param b - The bounds to convert
 * @returns A Rect object representing the same area
 * @example
 * ```typescript
 * const bounds = { minX: 10, minY: 20, maxX: 14, maxY: 27 };
 * const r = boundsToRect(bounds);
 * // r = { x: 10, y: 20, width: 5, height: 8 }
 * ```
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
 * Create bounds that encompass all given points.
 * Finds the minimum bounding box containing all points.
 *
 * @param points - An array of points to bound
 * @returns Bounds containing all points, or null if the array is empty
 * @example
 * ```typescript
 * const points = [
 *   point(5, 10),
 *   point(15, 3),
 *   point(8, 20)
 * ];
 * const bounds = boundsFromPoints(points);
 * // bounds = { minX: 5, minY: 3, maxX: 15, maxY: 20 }
 *
 * boundsFromPoints([]); // null
 * ```
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
 * Check if a point is within bounds (inclusive).
 *
 * @param b - The bounds
 * @param p - The point to test
 * @returns True if the point is within the bounds (inclusive of boundaries)
 * @example
 * ```typescript
 * const bounds = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
 * boundsContainPoint(bounds, point(5, 5)); // true
 * boundsContainPoint(bounds, point(0, 0)); // true
 * boundsContainPoint(bounds, point(10, 10)); // true
 * boundsContainPoint(bounds, point(11, 5)); // false
 * ```
 */
export function boundsContainPoint(b: Bounds, p: Point): boolean {
  return p.x >= b.minX && p.x <= b.maxX && p.y >= b.minY && p.y <= b.maxY;
}

/**
 * Merge two bounds into the smallest bounds that contain both.
 * Creates a bounding box that encompasses both input bounds.
 *
 * @param a - The first bounds
 * @param b - The second bounds
 * @returns Bounds that contain both input bounds
 * @example
 * ```typescript
 * const b1 = { minX: 0, minY: 0, maxX: 10, maxY: 10 };
 * const b2 = { minX: 5, minY: 5, maxX: 15, maxY: 15 };
 * const merged = mergeBounds(b1, b2);
 * // merged = { minX: 0, minY: 0, maxX: 15, maxY: 15 }
 * ```
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
 * Create a Segment from start and end points.
 * A segment represents a line between two points.
 *
 * @param start - The starting point of the segment
 * @param end - The ending point of the segment
 * @returns A Segment object with the specified endpoints
 * @example
 * ```typescript
 * const seg = segment(point(0, 0), point(10, 10));
 * // seg = { start: { x: 0, y: 0 }, end: { x: 10, y: 10 } }
 * ```
 */
export function segment(start: Point, end: Point): Segment {
  return { start, end };
}

/**
 * Calculate the length of a segment using Euclidean distance.
 *
 * @param s - The segment
 * @returns The straight-line distance between the segment's endpoints
 * @example
 * ```typescript
 * const seg = segment(point(0, 0), point(3, 4));
 * const length = segmentLength(seg);
 * // length = 5
 * ```
 */
export function segmentLength(s: Segment): number {
  return euclideanDistance(s.start, s.end);
}

/**
 * Get all integer points along a segment using Bresenham's line algorithm.
 * Returns a continuous path of grid points from start to end (inclusive).
 *
 * @param s - The segment to rasterize
 * @returns An array of points forming a line from start to end
 * @example
 * ```typescript
 * const seg = segment(point(0, 0), point(3, 0));
 * const points = segmentPoints(seg);
 * // points = [
 * //   { x: 0, y: 0 },
 * //   { x: 1, y: 0 },
 * //   { x: 2, y: 0 },
 * //   { x: 3, y: 0 }
 * // ]
 * ```
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
 * Generate a line of points between two points using Bresenham's algorithm.
 * Convenience function that takes points directly instead of a segment.
 *
 * @param from - The starting point
 * @param to - The ending point
 * @returns An array of points forming a line from start to end
 * @example
 * ```typescript
 * const line = bresenhamLine(point(0, 0), point(2, 2));
 * // line = [
 * //   { x: 0, y: 0 },
 * //   { x: 1, y: 1 },
 * //   { x: 2, y: 2 }
 * // ]
 * ```
 */
export function bresenhamLine(from: Point, to: Point): Point[] {
  return segmentPoints({ start: from, end: to });
}

// =============================================================================
// DIMENSION OPERATIONS
// =============================================================================

/**
 * Check if a point is within the bounds of given dimensions.
 * Dimensions start at (0, 0) and extend to (width-1, height-1).
 *
 * @param p - The point to test
 * @param dim - The dimensions defining the valid area
 * @returns True if the point is within the dimensions
 * @example
 * ```typescript
 * const dim = { width: 10, height: 10 };
 * isInBounds(point(5, 5), dim); // true
 * isInBounds(point(0, 0), dim); // true
 * isInBounds(point(9, 9), dim); // true
 * isInBounds(point(10, 5), dim); // false
 * isInBounds(point(-1, 5), dim); // false
 * ```
 */
export function isInBounds(p: Point, dim: Dimensions): boolean {
  return p.x >= 0 && p.x < dim.width && p.y >= 0 && p.y < dim.height;
}

/**
 * Clamp a point to be within the given dimensions.
 * Out-of-bounds coordinates are clamped to the nearest valid position.
 *
 * @param p - The point to clamp
 * @param dim - The dimensions defining the valid area
 * @returns A new point clamped to [0, width-1] × [0, height-1]
 * @example
 * ```typescript
 * const dim = { width: 10, height: 10 };
 * clampToBounds(point(5, 5), dim); // { x: 5, y: 5 }
 * clampToBounds(point(15, 5), dim); // { x: 9, y: 5 }
 * clampToBounds(point(-5, 5), dim); // { x: 0, y: 5 }
 * ```
 */
export function clampToBounds(p: Point, dim: Dimensions): Point {
  return {
    x: Math.max(0, Math.min(dim.width - 1, p.x)),
    y: Math.max(0, Math.min(dim.height - 1, p.y)),
  };
}

/**
 * Convert 2D grid coordinates to a 1D array index using row-major ordering.
 * Useful for mapping grid positions to flat array indices.
 *
 * @param x - The x coordinate
 * @param y - The y coordinate
 * @param width - The width of the grid
 * @returns The 1D index corresponding to the 2D position
 * @example
 * ```typescript
 * // In a 10-wide grid:
 * toIndex(0, 0, 10); // 0
 * toIndex(5, 0, 10); // 5
 * toIndex(0, 1, 10); // 10
 * toIndex(3, 2, 10); // 23 (2 * 10 + 3)
 * ```
 */
export function toIndex(x: number, y: number, width: number): number {
  return y * width + x;
}

/**
 * Convert a 1D array index to 2D grid coordinates using row-major ordering.
 * The inverse operation of toIndex.
 *
 * @param index - The 1D array index
 * @param width - The width of the grid
 * @returns A Point with the 2D coordinates
 * @example
 * ```typescript
 * // In a 10-wide grid:
 * fromIndex(0, 10); // { x: 0, y: 0 }
 * fromIndex(5, 10); // { x: 5, y: 0 }
 * fromIndex(10, 10); // { x: 0, y: 1 }
 * fromIndex(23, 10); // { x: 3, y: 2 }
 * ```
 */
export function fromIndex(index: number, width: number): Point {
  return {
    x: index % width,
    y: Math.floor(index / width),
  };
}
