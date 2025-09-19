/**
 * Generic object pool for reducing garbage collection pressure.
 * Reuses objects instead of creating new ones repeatedly.
 */
export class ObjectPool<T> {
  private readonly factory: () => T;
  private readonly reset: (obj: T) => void;
  private readonly pool: T[] = [];
  private readonly maxSize: number;

  constructor(
    factory: () => T,
    reset: (obj: T) => void,
    maxSize: number = 1000,
  ) {
    this.factory = factory;
    this.reset = reset;
    this.maxSize = maxSize;
  }

  /**
   * Get an object from the pool or create a new one
   */
  acquire(): T {
    if (this.pool.length > 0) {
      const obj = this.pool.pop();
      if (obj !== undefined) return obj;
    }
    return this.factory();
  }

  /**
   * Return an object to the pool for reuse
   */
  release(obj: T): void {
    if (this.pool.length < this.maxSize) {
      this.reset(obj);
      this.pool.push(obj);
    }
  }

  /**
   * Get current pool size
   */
  size(): number {
    return this.pool.length;
  }

  /**
   * Clear the pool
   */
  clear(): void {
    this.pool.length = 0;
  }

  /**
   * Pre-fill the pool with objects
   */
  preFill(count: number): void {
    const fillCount = Math.min(count, this.maxSize);
    for (let i = 0; i < fillCount; i++) {
      this.pool.push(this.factory());
    }
  }
}

/**
 * Specialized pools for common types
 */
const pointPool = new ObjectPool(
  () => ({ x: 0, y: 0 }),
  (point: { x: number; y: number }) => {
    point.x = 0;
    point.y = 0;
  },
  5000,
);

export const PointPool = {
  acquire(x: number = 0, y: number = 0): { x: number; y: number } {
    const point = pointPool.acquire();
    point.x = x;
    point.y = y;
    return point;
  },
  release(point: { x: number; y: number }): void {
    pointPool.release(point);
  },
  preFill(count: number = 1000): void {
    pointPool.preFill(count);
  },
} as const;

const arrayPools = new Map<number, ObjectPool<unknown[]>>();

function getArrayPool<T>(capacity: number): ObjectPool<T[]> {
  if (!arrayPools.has(capacity)) {
    arrayPools.set(
      capacity,
      new ObjectPool(
        () => new Array(capacity),
        (arr) => {
          arr.length = 0;
        },
        100,
      ),
    );
  }
  const pool = arrayPools.get(capacity);
  if (!pool) throw new Error("Array pool not initialized");
  return pool as ObjectPool<T[]>;
}

export const ArrayPool = {
  acquire<T>(capacity: number): T[] {
    return getArrayPool<T>(capacity).acquire();
  },
  release<T>(arr: T[], capacity: number): void {
    getArrayPool<T>(capacity).release(arr);
  },
} as const;

/**
 * Pool for coordinate sets (used in flood fill)
 */
const coordinateSetPool = new ObjectPool<Set<string>>(
  () => new Set<string>(),
  (set) => set.clear(),
  50,
);

export const CoordinateSetPool = {
  acquire(): Set<string> {
    return coordinateSetPool.acquire();
  },
  release(set: Set<string>): void {
    coordinateSetPool.release(set);
  },
} as const;
