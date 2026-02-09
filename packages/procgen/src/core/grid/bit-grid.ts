/**
 * BitGrid - Memory-efficient boolean grid using bit packing.
 * Uses 32 cells per Uint32 element.
 */

import type { Dimensions, Point } from "../geometry/types";

declare const process: { env: { NODE_ENV?: string } };
const DEV_MODE = process.env.NODE_ENV !== "production";

// ============================================================================
// BitGrid Pool - Reuses BitGrid instances to reduce allocation pressure
// ============================================================================

/**
 * Pool of BitGrid instances for reuse.
 * Reduces GC pressure by reusing BitGrids instead of allocating new ones.
 *
 * Thread-safety: This pool is designed for single-threaded use (JS main thread).
 * Determinism: Pool usage order does not affect RNG or generation output.
 */
class BitGridPoolImpl {
  private readonly pool: BitGrid[] = [];
  private readonly maxSize: number;

  constructor(maxSize = 8) {
    this.maxSize = maxSize;
  }

  /**
   * Acquire a BitGrid of the specified dimensions.
   * Returns a pooled instance if available (cleared), or creates a new one.
   */
  acquire(width: number, height: number): BitGrid {
    // Look for a compatible grid in the pool
    for (let i = 0; i < this.pool.length; i++) {
      const grid = this.pool[i]!;
      if (grid.width === width && grid.height === height) {
        // Remove from pool and clear
        this.pool.splice(i, 1);
        grid.clear();
        return grid;
      }
    }
    // No compatible grid found, create new
    return new BitGrid(width, height);
  }

  /**
   * Release a BitGrid back to the pool for reuse.
   * If the pool is full, the grid is discarded (GC'd).
   */
  release(grid: BitGrid): void {
    if (this.pool.length < this.maxSize) {
      this.pool.push(grid);
    }
    // Otherwise let it be garbage collected
  }

  /**
   * Clear all pooled instances (useful for testing or memory pressure).
   */
  clear(): void {
    this.pool.length = 0;
  }

  /**
   * Get current pool size (for debugging/testing).
   */
  get size(): number {
    return this.pool.length;
  }
}

/**
 * Global BitGrid pool instance.
 * Use `BitGridPool.acquire()` and `BitGridPool.release()` for pooled access.
 */
export const BitGridPool = new BitGridPoolImpl();

/**
 * Memory-efficient boolean grid using bit packing.
 * Ideal for masks, visited arrays, and other binary data.
 */
export class BitGrid {
  readonly width: number;
  readonly height: number;
  private readonly data: Uint32Array;

  constructor(width: number, height: number) {
    if (width <= 0 || height <= 0) {
      throw new Error(`Invalid grid dimensions: ${width}x${height}`);
    }

    this.width = width;
    this.height = height;
    // Calculate number of Uint32 elements needed (32 bits each)
    const totalCells = width * height;
    const arrayLength = Math.ceil(totalCells / 32);
    this.data = new Uint32Array(arrayLength);
  }

  /**
   * Create from dimensions
   */
  static fromDimensions(dim: Dimensions): BitGrid {
    return new BitGrid(dim.width, dim.height);
  }

  /**
   * Check if coordinates are within bounds
   */
  isInBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  /**
   * Get bit value at coordinates
   */
  get(x: number, y: number): boolean {
    if (!this.isInBounds(x, y)) return false;
    const index = y * this.width + x;
    const arrayIndex = index >>> 5; // Divide by 32
    const bitIndex = index & 31; // Mod 32
    const value = this.data[arrayIndex];
    if (value === undefined) return false;
    return (value & (1 << bitIndex)) !== 0;
  }

  /**
   * Get bit at point
   */
  getAt(p: Point): boolean {
    return this.get(p.x, p.y);
  }

  /**
   * Set bit value at coordinates
   */
  set(x: number, y: number, value: boolean): void {
    if (!this.isInBounds(x, y)) {
      if (DEV_MODE) {
        console.warn(
          `BitGrid.set: out of bounds (${x}, ${y}) for grid ${this.width}x${this.height}`,
        );
      }
      return;
    }
    const index = y * this.width + x;
    const arrayIndex = index >>> 5;
    const bitIndex = index & 31;
    const current = this.data[arrayIndex];
    if (current === undefined) {
      if (DEV_MODE) {
        console.warn(
          `BitGrid.set: undefined data at array index ${arrayIndex} for coordinates (${x}, ${y})`,
        );
      }
      return;
    }

    if (value) {
      this.data[arrayIndex] = current | (1 << bitIndex);
    } else {
      this.data[arrayIndex] = current & ~(1 << bitIndex);
    }
  }

  /**
   * Set bit at point
   */
  setAt(p: Point, value: boolean): void {
    this.set(p.x, p.y, value);
  }

  /**
   * Toggle bit at coordinates
   */
  toggle(x: number, y: number): void {
    if (!this.isInBounds(x, y)) {
      if (DEV_MODE) {
        console.warn(
          `BitGrid.toggle: out of bounds (${x}, ${y}) for grid ${this.width}x${this.height}`,
        );
      }
      return;
    }
    const index = y * this.width + x;
    const arrayIndex = index >>> 5;
    const bitIndex = index & 31;
    const current = this.data[arrayIndex];
    if (current === undefined) {
      if (DEV_MODE) {
        console.warn(
          `BitGrid.toggle: undefined data at array index ${arrayIndex} for coordinates (${x}, ${y})`,
        );
      }
      return;
    }
    this.data[arrayIndex] = current ^ (1 << bitIndex);
  }

  /**
   * Clear all bits to false
   */
  clear(): void {
    this.data.fill(0);
  }

  /**
   * Set all bits to true
   */
  fill(): void {
    this.data.fill(0xffffffff);
  }

  /**
   * Count number of set bits (only valid cells, not padding)
   */
  count(): number {
    let count = 0;
    const totalCells = this.width * this.height;

    // Count bits in full Uint32 elements
    const fullElements = Math.floor(totalCells / 32);
    for (let i = 0; i < fullElements; i++) {
      let n = this.data[i] ?? 0;
      // Brian Kernighan's algorithm
      while (n) {
        n &= n - 1;
        count++;
      }
    }

    // Count valid bits in the last partial element
    const remainingBits = totalCells % 32;
    if (remainingBits > 0) {
      const lastElement = this.data[fullElements] ?? 0;
      // Mask to only count valid bits
      const mask = (1 << remainingBits) - 1;
      let n = lastElement & mask;
      while (n) {
        n &= n - 1;
        count++;
      }
    }

    return count;
  }

  /**
   * Clone this BitGrid
   */
  clone(): BitGrid {
    const result = new BitGrid(this.width, this.height);
    result.data.set(this.data);
    return result;
  }

  /**
   * Get a copy of the raw data array (safe for external use).
   */
  getRawDataCopy(): Uint32Array {
    return new Uint32Array(this.data);
  }

  /**
   * @internal Only for performance-critical internal operations.
   */
  _unsafeGetInternalData(): Uint32Array {
    return this.data;
  }

  /**
   * Count the number of set (true) bits in the grid.
   * @returns Number of cells set to true
   */
  countSet(): number {
    return this.count(); // Reuse optimized bit counting
  }

  /**
   * Count the number of clear (false) bits in the grid.
   * @returns Number of cells set to false
   */
  countClear(): number {
    return this.width * this.height - this.countSet();
  }

  /**
   * Find all coordinates that are set (true).
   * @returns Array of points that are set
   */
  findSet(): Point[] {
    const points: Point[] = [];
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        if (this.get(x, y)) {
          points.push({ x, y });
        }
      }
    }
    return points;
  }
}
