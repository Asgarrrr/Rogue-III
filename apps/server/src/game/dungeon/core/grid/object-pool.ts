/**
 * Pool statistics for monitoring and optimization.
 */
export interface PoolStats {
  /** Current number of objects in the pool */
  readonly poolSize: number;
  /** Maximum pool capacity */
  readonly maxSize: number;
  /** Total number of acquire operations */
  readonly acquireCount: number;
  /** Total number of release operations */
  readonly releaseCount: number;
  /** Number of times a new object was created (cache miss) */
  readonly createCount: number;
  /** Number of times an object was reused (cache hit) */
  readonly reuseCount: number;
  /** Cache hit rate (0-1) */
  readonly hitRate: number;
  /** Number of objects dropped due to pool being full */
  readonly droppedCount: number;
}

/**
 * Generic object pool for reducing garbage collection pressure.
 * Reuses objects instead of creating new ones repeatedly.
 *
 * Includes comprehensive metrics for monitoring pool efficiency.
 */
export class ObjectPool<T> {
  private readonly factory: () => T;
  private readonly reset: (obj: T) => void;
  private readonly pool: T[] = [];
  private readonly maxSize: number;

  // Metrics tracking
  private _acquireCount = 0;
  private _releaseCount = 0;
  private _createCount = 0;
  private _reuseCount = 0;
  private _droppedCount = 0;

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
   * Get comprehensive pool statistics.
   */
  getStats(): PoolStats {
    const totalRequests = this._reuseCount + this._createCount;
    return {
      poolSize: this.pool.length,
      maxSize: this.maxSize,
      acquireCount: this._acquireCount,
      releaseCount: this._releaseCount,
      createCount: this._createCount,
      reuseCount: this._reuseCount,
      hitRate: totalRequests > 0 ? this._reuseCount / totalRequests : 0,
      droppedCount: this._droppedCount,
    };
  }

  /**
   * Reset all metrics to zero.
   */
  resetStats(): void {
    this._acquireCount = 0;
    this._releaseCount = 0;
    this._createCount = 0;
    this._reuseCount = 0;
    this._droppedCount = 0;
  }

  /**
   * Get an object from the pool or create a new one
   */
  acquire(): T {
    this._acquireCount++;

    if (this.pool.length > 0) {
      const obj = this.pool.pop();
      if (obj !== undefined) {
        this._reuseCount++;
        return obj;
      }
    }

    this._createCount++;
    return this.factory();
  }

  /**
   * Return an object to the pool for reuse
   */
  release(obj: T): void {
    this._releaseCount++;

    if (this.pool.length < this.maxSize) {
      this.reset(obj);
      this.pool.push(obj);
    } else {
      this._droppedCount++;
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
  getStats(): PoolStats {
    return pointPool.getStats();
  },
  resetStats(): void {
    pointPool.resetStats();
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
  getStats(): PoolStats {
    return coordinateSetPool.getStats();
  },
  resetStats(): void {
    coordinateSetPool.resetStats();
  },
} as const;

/**
 * Get aggregated stats from all pools for monitoring.
 */
export function getAllPoolStats(): Record<string, PoolStats> {
  return {
    point: pointPool.getStats(),
    coordinateSet: coordinateSetPool.getStats(),
  };
}
