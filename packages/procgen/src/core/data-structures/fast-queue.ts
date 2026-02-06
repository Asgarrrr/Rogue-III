/**
 * Fast Queue - O(1) enqueue/dequeue operations
 *
 * Uses index-based iteration to avoid O(n) array.shift() operations.
 * For BFS and other queue-based algorithms.
 */

/**
 * A fast FIFO queue using index-based dequeue.
 *
 * @example
 * ```typescript
 * const queue = new FastQueue<number>();
 * queue.enqueue(1);
 * queue.enqueue(2);
 * queue.dequeue(); // 1
 * queue.dequeue(); // 2
 * ```
 */
export class FastQueue<T> {
  private items: T[] = [];
  private head = 0;

  /**
   * Number of items currently in the queue.
   */
  get length(): number {
    return this.items.length - this.head;
  }

  /**
   * Whether the queue is empty.
   */
  get isEmpty(): boolean {
    return this.length === 0;
  }

  /**
   * Add an item to the end of the queue.
   * O(1) amortized.
   */
  enqueue(item: T): void {
    this.items.push(item);
  }

  /**
   * Remove and return the first item from the queue.
   * O(1).
   */
  dequeue(): T | undefined {
    if (this.isEmpty) return undefined;

    const item = this.items[this.head];
    this.head++;

    // Compact when head exceeds threshold to prevent memory leak
    if (this.head > 1000 && this.head > this.items.length / 2) {
      this.items = this.items.slice(this.head);
      this.head = 0;
    }

    return item;
  }

  /**
   * Peek at the first item without removing it.
   * O(1).
   */
  peek(): T | undefined {
    if (this.isEmpty) return undefined;
    return this.items[this.head];
  }

  /**
   * Clear all items from the queue.
   */
  clear(): void {
    this.items = [];
    this.head = 0;
  }

  /**
   * Create a queue initialized with items.
   */
  static from<T>(items: Iterable<T>): FastQueue<T> {
    const queue = new FastQueue<T>();
    for (const item of items) {
      queue.enqueue(item);
    }
    return queue;
  }
}

/**
 * Coordinate key utilities for replacing string-based coordinate keys.
 *
 * Instead of `${x},${y}` (string allocation + hashing),
 * use `coordKey(x, y, width)` for O(1) numeric key.
 */

/**
 * Convert (x, y) coordinates to a single numeric key.
 * Assumes y values are within reasonable bounds for the grid width.
 *
 * @param x - X coordinate
 * @param y - Y coordinate
 * @param width - Grid width (for encoding)
 * @returns A unique numeric key
 */
export function coordKey(x: number, y: number, width: number): number {
  return y * width + x;
}

/**
 * Decode a coordinate key back to (x, y).
 *
 * @param key - The encoded key
 * @param width - Grid width (used for encoding)
 * @returns The decoded coordinates
 */
export function coordFromKey(
  key: number,
  width: number,
): { x: number; y: number } {
  return {
    x: key % width,
    y: Math.floor(key / width),
  };
}

/**
 * Create a BitSet-based visited tracker for grid coordinates.
 * More memory-efficient than Set<string> for dense grids.
 */
export class CoordSet {
  private readonly bits: Uint32Array;
  private readonly width: number;

  constructor(width: number, height: number) {
    this.width = width;
    const totalBits = width * height;
    const arrayLength = Math.ceil(totalBits / 32);
    this.bits = new Uint32Array(arrayLength);
  }

  has(x: number, y: number): boolean {
    const key = y * this.width + x;
    const index = key >>> 5; // key / 32
    const bit = 1 << (key & 31); // key % 32
    const value = this.bits[index];
    return value !== undefined && (value & bit) !== 0;
  }

  add(x: number, y: number): void {
    const key = y * this.width + x;
    const index = key >>> 5;
    const bit = 1 << (key & 31);
    const current = this.bits[index];
    if (current !== undefined) {
      this.bits[index] = current | bit;
    }
  }

  delete(x: number, y: number): void {
    const key = y * this.width + x;
    const index = key >>> 5;
    const bit = 1 << (key & 31);
    const current = this.bits[index];
    if (current !== undefined) {
      this.bits[index] = current & ~bit;
    }
  }

  clear(): void {
    this.bits.fill(0);
  }
}
