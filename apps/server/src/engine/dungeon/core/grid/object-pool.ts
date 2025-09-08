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
		maxSize: number = 1000
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
			return this.pool.pop()!;
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
export class PointPool {
	private static readonly pool = new ObjectPool(
		() => ({ x: 0, y: 0 }),
		(point) => {
			point.x = 0;
			point.y = 0;
		},
		5000
	);

	static acquire(x: number = 0, y: number = 0): { x: number; y: number } {
		const point = this.pool.acquire();
		point.x = x;
		point.y = y;
		return point;
	}

	static release(point: { x: number; y: number }): void {
		this.pool.release(point);
	}

	static preFill(count: number = 1000): void {
		this.pool.preFill(count);
	}
}

export class ArrayPool<T> {
	private static readonly pools = new Map<number, ObjectPool<any[]>>();

	static getPool(capacity: number): ObjectPool<T[]> {
		if (!this.pools.has(capacity)) {
			this.pools.set(
				capacity,
				new ObjectPool(
					() => new Array(capacity),
					(arr) => {
						arr.length = 0;
					},
					100
				)
			);
		}
		return this.pools.get(capacity)!;
	}

	static acquire<T>(capacity: number): T[] {
		return this.getPool(capacity).acquire();
	}

	static release<T>(arr: T[], capacity: number): void {
		this.getPool(capacity).release(arr);
	}
}

/**
 * Pool for coordinate sets (used in flood fill)
 */
export class CoordinateSetPool {
	private static readonly pool = new ObjectPool(
		() => new Set<string>(),
		(set) => set.clear(),
		50
	);

	static acquire(): Set<string> {
		return this.pool.acquire();
	}

	static release(set: Set<string>): void {
		this.pool.release(set);
	}
}
