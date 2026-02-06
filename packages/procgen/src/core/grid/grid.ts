/**
 * High-performance Grid implementation for procedural generation.
 * Uses flat Uint8Array storage for cache locality.
 */

import {
  DIRECTIONS_4,
  DIRECTIONS_8,
  type Dimensions,
  type Point,
} from "../geometry/types";
import { CellType } from "./types";

/**
 * 2D grid with efficient cell access and neighbor operations.
 * Optimized for cellular automata and spatial algorithms.
 */
export class Grid {
  readonly width: number;
  readonly height: number;
  private readonly data: Uint8Array;

  constructor(
    width: number,
    height: number,
    initialValue: CellType = CellType.FLOOR,
  ) {
    this.width = width;
    this.height = height;
    this.data = new Uint8Array(width * height);

    if (initialValue !== CellType.FLOOR) {
      this.data.fill(initialValue);
    }
  }

  /**
   * Create grid from dimensions object
   */
  static fromDimensions(
    dim: Dimensions,
    initialValue: CellType = CellType.FLOOR,
  ): Grid {
    return new Grid(dim.width, dim.height, initialValue);
  }

  /**
   * Create grid filled with walls
   */
  static walls(width: number, height: number): Grid {
    return new Grid(width, height, CellType.WALL);
  }

  /**
   * Create grid filled with floors
   */
  static floors(width: number, height: number): Grid {
    return new Grid(width, height, CellType.FLOOR);
  }

  // ===========================================================================
  // BOUNDS CHECKING
  // ===========================================================================

  /**
   * Check if coordinates are within bounds
   */
  isInBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  /**
   * Check if point is within bounds
   */
  containsPoint(p: Point): boolean {
    return this.isInBounds(p.x, p.y);
  }

  // ===========================================================================
  // CELL ACCESS
  // ===========================================================================

  /**
   * Get cell value with bounds checking (returns WALL for out of bounds)
   */
  get(x: number, y: number): CellType {
    if (!this.isInBounds(x, y)) return CellType.WALL;
    return this.data[y * this.width + x] as CellType;
  }

  /**
   * Get cell at point
   */
  getAt(p: Point): CellType {
    return this.get(p.x, p.y);
  }

  /**
   * Set cell value with bounds checking
   */
  set(x: number, y: number, value: CellType): void {
    if (this.isInBounds(x, y)) {
      this.data[y * this.width + x] = value;
    }
  }

  /**
   * Set cell at point
   */
  setAt(p: Point, value: CellType): void {
    this.set(p.x, p.y, value);
  }

  /**
   * Unsafe get (no bounds check) - use only when bounds are guaranteed
   */
  getUnsafe(x: number, y: number): CellType {
    return this.data[y * this.width + x] as CellType;
  }

  /**
   * Unsafe set (no bounds check) - use only when bounds are guaranteed
   */
  setUnsafe(x: number, y: number, value: CellType): void {
    this.data[y * this.width + x] = value;
  }

  // ===========================================================================
  // NEIGHBOR OPERATIONS
  // ===========================================================================

  /**
   * Count neighbors of specific type (4-connectivity)
   */
  countNeighbors4(
    x: number,
    y: number,
    targetType: CellType = CellType.WALL,
  ): number {
    let count = 0;

    // North
    if (y > 0) {
      if (this.data[(y - 1) * this.width + x] === targetType) count++;
    } else {
      count++; // Out of bounds = wall
    }

    // East
    if (x < this.width - 1) {
      if (this.data[y * this.width + (x + 1)] === targetType) count++;
    } else {
      count++;
    }

    // South
    if (y < this.height - 1) {
      if (this.data[(y + 1) * this.width + x] === targetType) count++;
    } else {
      count++;
    }

    // West
    if (x > 0) {
      if (this.data[y * this.width + (x - 1)] === targetType) count++;
    } else {
      count++;
    }

    return count;
  }

  /**
   * Count neighbors of specific type (8-connectivity)
   */
  countNeighbors8(
    x: number,
    y: number,
    targetType: CellType = CellType.WALL,
  ): number {
    let count = 0;

    for (const dir of DIRECTIONS_8) {
      const nx = x + dir.x;
      const ny = y + dir.y;

      if (nx >= 0 && nx < this.width && ny >= 0 && ny < this.height) {
        if (this.data[ny * this.width + nx] === targetType) count++;
      } else {
        count++; // Out of bounds = wall
      }
    }

    return count;
  }

  /**
   * Get neighbor coordinates (4-connectivity)
   */
  getNeighbors4(x: number, y: number): Point[] {
    const neighbors: Point[] = [];

    for (const dir of DIRECTIONS_4) {
      const nx = x + dir.x;
      const ny = y + dir.y;
      if (this.isInBounds(nx, ny)) {
        neighbors.push({ x: nx, y: ny });
      }
    }

    return neighbors;
  }

  /**
   * Get neighbor coordinates (8-connectivity)
   */
  getNeighbors8(x: number, y: number): Point[] {
    const neighbors: Point[] = [];

    for (const dir of DIRECTIONS_8) {
      const nx = x + dir.x;
      const ny = y + dir.y;
      if (this.isInBounds(nx, ny)) {
        neighbors.push({ x: nx, y: ny });
      }
    }

    return neighbors;
  }

  // ===========================================================================
  // REGION OPERATIONS
  // ===========================================================================

  /**
   * Fill rectangular area with value
   */
  fillRect(
    x: number,
    y: number,
    width: number,
    height: number,
    value: CellType,
  ): void {
    const maxX = Math.min(x + width, this.width);
    const maxY = Math.min(y + height, this.height);
    const startX = Math.max(0, x);
    const startY = Math.max(0, y);

    for (let py = startY; py < maxY; py++) {
      for (let px = startX; px < maxX; px++) {
        this.data[py * this.width + px] = value;
      }
    }
  }

  /**
   * Count cells of specific type in rectangular area
   */
  countInRect(
    x: number,
    y: number,
    width: number,
    height: number,
    cellType: CellType,
  ): number {
    let count = 0;
    const maxX = Math.min(x + width, this.width);
    const maxY = Math.min(y + height, this.height);
    const startX = Math.max(0, x);
    const startY = Math.max(0, y);

    for (let py = startY; py < maxY; py++) {
      for (let px = startX; px < maxX; px++) {
        if (this.data[py * this.width + px] === cellType) count++;
      }
    }

    return count;
  }

  // ===========================================================================
  // CELLULAR AUTOMATA
  // ===========================================================================

  /**
   * Apply cellular automata rules, returning a new grid
   */
  applyCellularAutomata(survivalMin: number, birthMin: number): Grid {
    const result = new Grid(this.width, this.height);

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const neighbors = this.countNeighbors8(x, y, CellType.WALL);
        const current = this.getUnsafe(x, y);

        if (current === CellType.WALL) {
          // Wall survival rule
          result.setUnsafe(
            x,
            y,
            neighbors >= survivalMin ? CellType.WALL : CellType.FLOOR,
          );
        } else {
          // Floor birth rule
          result.setUnsafe(
            x,
            y,
            neighbors >= birthMin ? CellType.WALL : CellType.FLOOR,
          );
        }
      }
    }

    return result;
  }

  /**
   * Apply cellular automata into an existing destination grid (no allocation)
   */
  applyCellularAutomataInto(
    survivalMin: number,
    birthMin: number,
    dst: Grid,
  ): Grid {
    const srcData = this.data;
    const dstData = dst._unsafeGetInternalData();
    const width = this.width;
    const height = this.height;

    for (let y = 0; y < height; y++) {
      const yOff = y * width;
      for (let x = 0; x < width; x++) {
        // Manual 8-neighbor count with bounds checks
        let neighbors = 0;
        const xm1 = x - 1;
        const xp1 = x + 1;
        const ym1 = y - 1;
        const yp1 = y + 1;

        // Row y-1
        if (ym1 >= 0) {
          const yOffM1 = ym1 * width;
          if (xm1 >= 0 && srcData[yOffM1 + xm1] === CellType.WALL) neighbors++;
          if (srcData[yOffM1 + x] === CellType.WALL) neighbors++;
          if (xp1 < width && srcData[yOffM1 + xp1] === CellType.WALL)
            neighbors++;
        } else {
          neighbors += 3; // Out of bounds = walls
        }

        // Row y
        if (xm1 >= 0) {
          if (srcData[yOff + xm1] === CellType.WALL) neighbors++;
        } else neighbors++;
        if (xp1 < width) {
          if (srcData[yOff + xp1] === CellType.WALL) neighbors++;
        } else neighbors++;

        // Row y+1
        if (yp1 < height) {
          const yOffP1 = yp1 * width;
          if (xm1 >= 0 && srcData[yOffP1 + xm1] === CellType.WALL) neighbors++;
          if (srcData[yOffP1 + x] === CellType.WALL) neighbors++;
          if (xp1 < width && srcData[yOffP1 + xp1] === CellType.WALL)
            neighbors++;
        } else {
          neighbors += 3;
        }

        const current = srcData[yOff + x] as CellType;
        dstData[yOff + x] =
          current === CellType.WALL
            ? neighbors >= survivalMin
              ? CellType.WALL
              : CellType.FLOOR
            : neighbors >= birthMin
              ? CellType.WALL
              : CellType.FLOOR;
      }
    }

    return dst;
  }

  // ===========================================================================
  // UTILITY
  // ===========================================================================

  /**
   * Clone this grid
   */
  clone(): Grid {
    const result = new Grid(this.width, this.height);
    result.data.set(this.data);
    return result;
  }

  /**
   * Clear grid to specific value
   */
  clear(value: CellType = CellType.FLOOR): void {
    this.data.fill(value);
  }

  /**
   * Get a copy of the raw data array (safe for external use).
   * This ensures the original grid data remains immutable.
   * Use this for artifacts, serialization, and any external consumption.
   */
  getRawDataCopy(): Uint8Array {
    return new Uint8Array(this.data);
  }

  /**
   * Internal access to raw data array for performance-critical operations.
   * @internal Only for use within the grid module (e.g., cellular automata).
   * External code MUST use getRawDataCopy() to prevent mutation bugs.
   */
  _unsafeGetInternalData(): Uint8Array {
    return this.data;
  }

  /**
   * Get dimensions
   */
  getDimensions(): Dimensions {
    return { width: this.width, height: this.height };
  }

  /**
   * Iterate over all cells
   */
  forEach(callback: (x: number, y: number, value: CellType) => void): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        callback(x, y, this.getUnsafe(x, y));
      }
    }
  }

  /**
   * Count total cells of specific type
   */
  countCells(cellType: CellType): number {
    let count = 0;
    for (let i = 0; i < this.data.length; i++) {
      if (this.data[i] === cellType) count++;
    }
    return count;
  }
}
