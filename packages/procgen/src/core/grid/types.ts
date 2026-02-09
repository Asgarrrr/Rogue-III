/**
 * Grid types for procedural generation.
 */

import type { Bounds } from "../geometry/types";

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
 * Region represents a connected area in the grid.
 * Points are stored in packed format (y << 16 | x) for memory efficiency.
 * Use regionGetPoints() or forEachRegionPoint() to access individual points.
 */
export interface Region {
  readonly id: number;
  /** Packed coordinates: (y << 16) | x. Use regionGetPoints() to unpack. */
  readonly packedPoints: Uint32Array;
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

// =============================================================================
// GRID INTERFACES
// =============================================================================

import type { Dimensions, Point } from "../geometry/types";

/**
 * Read-only grid interface.
 *
 * Use this type when a function only needs to read from a grid,
 * providing compile-time enforcement against accidental mutation.
 *
 * @example
 * ```typescript
 * // Function that only reads from grid
 * function countFloors(grid: ReadonlyGrid): number {
 *   return grid.countCells(CellType.FLOOR);
 * }
 *
 * // Compile error: Property 'set' does not exist on type 'ReadonlyGrid'
 * function wouldFail(grid: ReadonlyGrid) {
 *   grid.set(0, 0, CellType.WALL); // Error!
 * }
 * ```
 */
export interface ReadonlyGrid {
  readonly width: number;
  readonly height: number;

  // Bounds checking
  isInBounds(x: number, y: number): boolean;
  containsPoint(p: Point): boolean;

  // Cell access (read-only)
  get(x: number, y: number): CellType;
  getAt(p: Point): CellType;
  getUnsafe(x: number, y: number): CellType;

  // Neighbor operations
  countNeighbors4(x: number, y: number, targetType?: CellType): number;
  countNeighbors8(x: number, y: number, targetType?: CellType): number;
  getNeighbors4(x: number, y: number): Point[];
  getNeighbors8(x: number, y: number): Point[];
  forEachNeighbor4(
    x: number,
    y: number,
    callback: (nx: number, ny: number, cell: CellType) => void,
  ): void;
  forEachNeighbor8(
    x: number,
    y: number,
    callback: (nx: number, ny: number, cell: CellType) => void,
  ): void;

  // Region queries
  countInRect(
    x: number,
    y: number,
    width: number,
    height: number,
    cellType: CellType,
  ): number;

  // Utility (read-only)
  getRawDataCopy(): Uint8Array;
  getDimensions(): Dimensions;
  forEach(callback: (x: number, y: number, value: CellType) => void): void;
  countCells(cellType: CellType): number;
  findAll(cellType: CellType): Point[];
  getRow(y: number): CellType[];
  getColumn(x: number): CellType[];
}

/**
 * Mutable grid interface.
 *
 * Extends ReadonlyGrid with mutation methods. Use this type when a function
 * needs to modify grid cells. The `Grid` class implements this interface.
 *
 * @remarks
 * In artifacts, `grid` is typed as `Grid` (mutable) even though the field is
 * marked `readonly`. The `readonly` modifier only prevents reassigning the
 * reference (`artifact.grid = newGrid`), but the grid's internal cells can
 * still be mutated via `grid.set()`. This is intentional for performance
 * reasons - passes mutate the grid in place rather than creating copies.
 *
 * @example
 * ```typescript
 * // Function that mutates the grid
 * function carveRoom(grid: MutableGrid, x: number, y: number, w: number, h: number) {
 *   grid.fillRect(x, y, w, h, CellType.FLOOR);
 * }
 *
 * // Read-only function uses ReadonlyGrid
 * function analyzeGrid(grid: ReadonlyGrid): number {
 *   return grid.countCells(CellType.FLOOR);
 * }
 * ```
 */
export interface MutableGrid extends ReadonlyGrid {
  // Single cell mutation
  set(x: number, y: number, value: CellType): void;
  setAt(p: Point, value: CellType): void;
  setUnsafe(x: number, y: number, value: CellType): void;

  // Bulk mutation
  fillRect(
    x: number,
    y: number,
    width: number,
    height: number,
    value: CellType,
  ): void;
}
