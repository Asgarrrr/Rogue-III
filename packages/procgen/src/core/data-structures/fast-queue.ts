/**
 * High-performance FIFO queue with O(1) amortized enqueue and dequeue.
 *
 * Uses array-based implementation with periodic compaction to prevent
 * memory leaks from dequeued elements.
 *
 * @template T - The type of elements stored in the queue
 *
 * @example
 * ```typescript
 * const queue = new FastQueue<number>();
 * queue.enqueue(1);
 * queue.enqueue(2);
 * queue.dequeue();  // 1
 * queue.dequeue();  // 2
 * ```
 */
export class FastQueue<T> {
  private items: T[] = [];
  private head = 0;

  /**
   * Number of items currently in the queue.
   *
   * @returns The number of items in the queue
   */
  get length(): number {
    return this.items.length - this.head;
  }

  /**
   * Whether the queue is empty.
   *
   * @returns True if the queue contains no items
   */
  get isEmpty(): boolean {
    return this.length === 0;
  }

  /**
   * Add an item to the end of the queue.
   *
   * Time complexity: O(1) amortized
   *
   * @param item - The item to add to the queue
   */
  enqueue(item: T): void {
    this.items.push(item);
  }

  /**
   * Remove and return the first item from the queue.
   *
   * Automatically compacts the internal array when the number of dequeued
   * items exceeds 1000 and represents more than half of the array length.
   *
   * Time complexity: O(1) amortized
   *
   * @returns The first item in the queue, or undefined if empty
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
   *
   * Time complexity: O(1)
   *
   * @returns The first item in the queue, or undefined if empty
   */
  peek(): T | undefined {
    if (this.isEmpty) return undefined;
    return this.items[this.head];
  }

  /**
   * Clear all items from the queue.
   *
   * Resets the queue to its initial empty state.
   */
  clear(): void {
    this.items = [];
    this.head = 0;
  }

  /**
   * Create a queue initialized with items.
   *
   * @template T - The type of elements in the queue
   * @param items - An iterable of items to add to the queue
   * @returns A new FastQueue containing all items from the iterable
   *
   * @example
   * ```typescript
   * const queue = FastQueue.from([1, 2, 3]);
   * queue.dequeue();  // 1
   * ```
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
 * Convert (x, y) coordinate to a unique numeric key.
 *
 * More efficient than string-based keys like `${x},${y}` as it avoids
 * string allocation and hashing overhead.
 *
 * @param x - X coordinate
 * @param y - Y coordinate
 * @param width - Grid width for key calculation
 * @returns Unique numeric key for the coordinate
 *
 * @example
 * ```typescript
 * const key = coordKey(5, 10, 100);  // Returns 1005
 * ```
 */
export function coordKey(x: number, y: number, width: number): number {
  return y * width + x;
}

/**
 * Convert numeric key back to (x, y) coordinate.
 *
 * @param key - The numeric key
 * @param width - Grid width used in key calculation
 * @returns Object with x and y coordinates
 *
 * @example
 * ```typescript
 * const coord = coordFromKey(1005, 100);  // Returns { x: 5, y: 10 }
 * ```
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
 * Fast coordinate set for grid-based algorithms.
 *
 * Uses numeric keys for O(1) coordinate lookup, optimized for
 * flood fill and pathfinding algorithms. Implements a bit set
 * internally for memory efficiency.
 *
 * More memory-efficient than Set<string> for dense grids, using
 * approximately 1 bit per grid cell instead of string overhead.
 *
 * @example
 * ```typescript
 * const visited = new CoordSet(100, 100);  // For 100x100 grid
 * visited.add(10, 20);
 * visited.has(10, 20);  // true
 * visited.has(5, 5);    // false
 * ```
 */
export class CoordSet {
  private readonly bits: Uint32Array;
  private readonly width: number;

  /**
   * Create a new coordinate set for a grid of the given dimensions.
   *
   * @param width - Grid width
   * @param height - Grid height
   */
  constructor(width: number, height: number) {
    this.width = width;
    const totalBits = width * height;
    const arrayLength = Math.ceil(totalBits / 32);
    this.bits = new Uint32Array(arrayLength);
  }

  /**
   * Check if a coordinate is in the set.
   *
   * Time complexity: O(1)
   *
   * @param x - X coordinate
   * @param y - Y coordinate
   * @returns True if the coordinate is in the set
   */
  has(x: number, y: number): boolean {
    const key = y * this.width + x;
    const index = key >>> 5; // key / 32
    const bit = 1 << (key & 31); // key % 32
    const value = this.bits[index];
    return value !== undefined && (value & bit) !== 0;
  }

  /**
   * Add a coordinate to the set.
   *
   * Time complexity: O(1)
   *
   * @param x - X coordinate
   * @param y - Y coordinate
   */
  add(x: number, y: number): void {
    const key = y * this.width + x;
    const index = key >>> 5;
    const bit = 1 << (key & 31);
    const current = this.bits[index];
    if (current !== undefined) {
      this.bits[index] = current | bit;
    }
  }

  /**
   * Remove a coordinate from the set.
   *
   * Time complexity: O(1)
   *
   * @param x - X coordinate
   * @param y - Y coordinate
   */
  delete(x: number, y: number): void {
    const key = y * this.width + x;
    const index = key >>> 5;
    const bit = 1 << (key & 31);
    const current = this.bits[index];
    if (current !== undefined) {
      this.bits[index] = current & ~bit;
    }
  }

  /**
   * Clear all coordinates from the set.
   *
   * Resets all bits to 0, making the set empty.
   */
  clear(): void {
    this.bits.fill(0);
  }
}
