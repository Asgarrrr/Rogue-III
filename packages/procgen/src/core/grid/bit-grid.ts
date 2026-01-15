/**
 * BitGrid - Memory-efficient boolean grid using bit packing.
 * Uses 32 cells per Uint32 element.
 */

import type { Dimensions, Point } from "../geometry/types";

/**
 * Memory-efficient boolean grid using bit packing.
 * Ideal for masks, visited arrays, and other binary data.
 */
export class BitGrid {
  readonly width: number;
  readonly height: number;
  private readonly data: Uint32Array;

  constructor(width: number, height: number) {
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
    if (!this.isInBounds(x, y)) return;
    const index = y * this.width + x;
    const arrayIndex = index >>> 5;
    const bitIndex = index & 31;
    const current = this.data[arrayIndex];
    if (current === undefined) return;

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
    if (!this.isInBounds(x, y)) return;
    const index = y * this.width + x;
    const arrayIndex = index >>> 5;
    const bitIndex = index & 31;
    const current = this.data[arrayIndex];
    if (current === undefined) return;
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
}
