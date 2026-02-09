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
import { CellType, type MutableGrid } from "./types";

declare const process: { env: { NODE_ENV?: string } };
const DEV_MODE = process.env.NODE_ENV !== "production";

/**
 * 2D grid with efficient cell access and neighbor operations.
 * Optimized for cellular automata and spatial algorithms.
 *
 * Implements both ReadonlyGrid and MutableGrid interfaces.
 *
 * @remarks
 * This class is internally mutable - cells can be modified via `set()`,
 * `fillRect()`, etc. When used in artifacts, the `readonly grid: Grid`
 * field prevents reassigning the reference but allows cell mutation.
 * This is intentional for performance (avoids copying large grids).
 *
 * For read-only contexts, use the `ReadonlyGrid` type instead.
 */
export class Grid implements MutableGrid {
  readonly width: number;
  readonly height: number;
  private readonly data: Uint8Array;

  constructor(
    width: number,
    height: number,
    initialValue: CellType = CellType.FLOOR,
  ) {
    if (width <= 0 || height <= 0) {
      throw new Error(`Invalid grid dimensions: ${width}x${height}`);
    }

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

  /**
   * Create a wall-initialized grid and copy terrain bytes into it.
   *
   * If terrain is shorter than expected, remaining cells stay as WALL.
   * If terrain is longer than expected, extra data is ignored.
   */
  static fromTerrain(
    width: number,
    height: number,
    terrain: Uint8Array,
  ): Grid {
    const grid = new Grid(width, height, CellType.WALL);
    const data = grid._unsafeGetInternalData();
    const expectedLength = width * height;
    const copyLength = Math.min(expectedLength, terrain.length);
    data.set(terrain.subarray(0, copyLength), 0);
    return grid;
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
    if (!this.isInBounds(x, y)) {
      if (DEV_MODE) {
        console.warn(
          `Grid.set: out of bounds (${x}, ${y}) for grid ${this.width}x${this.height}`,
        );
      }
      return;
    }
    this.data[y * this.width + x] = value;
  }

  /**
   * Set cell at point
   */
  setAt(p: Point, value: CellType): void {
    if (!this.isInBounds(p.x, p.y)) {
      if (DEV_MODE) {
        console.warn(
          `Grid.setAt: out of bounds (${p.x}, ${p.y}) for grid ${this.width}x${this.height}`,
        );
      }
      return;
    }
    this.data[p.y * this.width + p.x] = value;
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

  /**
   * Iterate over 4-directional neighbors without allocation.
   * @param x - Center x coordinate
   * @param y - Center y coordinate
   * @param callback - Called for each valid neighbor with (nx, ny, cellType)
   */
  forEachNeighbor4(
    x: number,
    y: number,
    callback: (nx: number, ny: number, cell: CellType) => void,
  ): void {
    if (x > 0) callback(x - 1, y, this.getUnsafe(x - 1, y));
    if (x < this.width - 1) callback(x + 1, y, this.getUnsafe(x + 1, y));
    if (y > 0) callback(x, y - 1, this.getUnsafe(x, y - 1));
    if (y < this.height - 1) callback(x, y + 1, this.getUnsafe(x, y + 1));
  }

  /**
   * Iterate over 8-directional neighbors without allocation.
   * @param x - Center x coordinate
   * @param y - Center y coordinate
   * @param callback - Called for each valid neighbor with (nx, ny, cellType)
   */
  forEachNeighbor8(
    x: number,
    y: number,
    callback: (nx: number, ny: number, cell: CellType) => void,
  ): void {
    const minX = Math.max(0, x - 1);
    const maxX = Math.min(this.width - 1, x + 1);
    const minY = Math.max(0, y - 1);
    const maxY = Math.min(this.height - 1, y + 1);

    for (let ny = minY; ny <= maxY; ny++) {
      for (let nx = minX; nx <= maxX; nx++) {
        if (nx !== x || ny !== y) {
          callback(nx, ny, this.getUnsafe(nx, ny));
        }
      }
    }
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
   *
   * Optimization: Skip border cells (always walls per INVARIANTS.md) and
   * remove bounds checks for interior cells where all 8 neighbors are guaranteed in-bounds.
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

    // Process interior cells only (skip borders)
    // Interior cells have all 8 neighbors guaranteed in-bounds, no bounds checks needed
    for (let y = 1; y < height - 1; y++) {
      const yOff = y * width;
      const yOffM1 = (y - 1) * width;
      const yOffP1 = (y + 1) * width;

      for (let x = 1; x < width - 1; x++) {
        // Direct neighbor count without bounds checks
        let neighbors = 0;

        // Row y-1 (above)
        if (srcData[yOffM1 + x - 1] === CellType.WALL) neighbors++;
        if (srcData[yOffM1 + x] === CellType.WALL) neighbors++;
        if (srcData[yOffM1 + x + 1] === CellType.WALL) neighbors++;

        // Row y (same row, left and right)
        if (srcData[yOff + x - 1] === CellType.WALL) neighbors++;
        if (srcData[yOff + x + 1] === CellType.WALL) neighbors++;

        // Row y+1 (below)
        if (srcData[yOffP1 + x - 1] === CellType.WALL) neighbors++;
        if (srcData[yOffP1 + x] === CellType.WALL) neighbors++;
        if (srcData[yOffP1 + x + 1] === CellType.WALL) neighbors++;

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

    // Ensure borders remain walls (INVARIANTS.md: "Border: Edge cells remain WALL")
    // Top and bottom rows
    for (let x = 0; x < width; x++) {
      dstData[x] = CellType.WALL;
      dstData[(height - 1) * width + x] = CellType.WALL;
    }
    // Left and right columns (excluding corners already set)
    for (let y = 1; y < height - 1; y++) {
      dstData[y * width] = CellType.WALL;
      dstData[y * width + width - 1] = CellType.WALL;
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

  /**
   * Find all coordinates containing the specified cell type.
   * @param cellType - The cell type to search for
   * @returns Array of points containing that cell type
   */
  findAll(cellType: CellType): Point[] {
    const points: Point[] = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.get(x, y) === cellType) {
          points.push({ x, y });
        }
      }
    }
    return points;
  }

  /**
   * Check if this grid equals another grid.
   * @param other - The grid to compare with
   * @returns True if grids have same dimensions and cell values
   */
  equals(other: Grid): boolean {
    if (this.width !== other.width || this.height !== other.height) {
      return false;
    }
    for (let i = 0; i < this.data.length; i++) {
      if (this.data[i] !== other.data[i]) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get all cell values in a row.
   * @param y - The row index
   * @returns Array of cell types in that row, or empty if out of bounds
   */
  getRow(y: number): CellType[] {
    if (y < 0 || y >= this.height) return [];
    const row: CellType[] = [];
    for (let x = 0; x < this.width; x++) {
      row.push(this.data[y * this.width + x] as CellType);
    }
    return row;
  }

  /**
   * Get all cell values in a column.
   * @param x - The column index
   * @returns Array of cell types in that column, or empty if out of bounds
   */
  getColumn(x: number): CellType[] {
    if (x < 0 || x >= this.width) return [];
    const col: CellType[] = [];
    for (let y = 0; y < this.height; y++) {
      col.push(this.data[y * this.width + x] as CellType);
    }
    return col;
  }
}
