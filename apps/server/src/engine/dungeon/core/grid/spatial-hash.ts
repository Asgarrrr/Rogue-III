import { Point, Bounds } from "./types";

/**
 * Spatial hash for fast 2D spatial queries.
 * Divides space into uniform grid cells and maps objects to cells for O(1) average lookup.
 */
export class SpatialHash<T> {
	private readonly cellSize: number;
	private readonly cells: Map<string, T[]>;
	private readonly bounds: Bounds;

	constructor(cellSize: number, bounds: Bounds) {
		this.cellSize = cellSize;
		this.cells = new Map();
		this.bounds = bounds;
	}

	/**
	 * Convert world coordinates to cell key
	 */
	private getCellKey(x: number, y: number): string {
		const cellX = Math.floor(x / this.cellSize);
		const cellY = Math.floor(y / this.cellSize);
		return `${cellX},${cellY}`;
	}

	/**
	 * Get all cell keys that intersect with a rectangular area
	 */
	private getCellKeysInRect(
		x: number,
		y: number,
		width: number,
		height: number
	): string[] {
		const keys: string[] = [];
		const startCellX = Math.floor(x / this.cellSize);
		const startCellY = Math.floor(y / this.cellSize);
		const endCellX = Math.floor((x + width - 1) / this.cellSize);
		const endCellY = Math.floor((y + height - 1) / this.cellSize);

		for (let cellY = startCellY; cellY <= endCellY; cellY++) {
			for (let cellX = startCellX; cellX <= endCellX; cellX++) {
				keys.push(`${cellX},${cellY}`);
			}
		}

		return keys;
	}

	/**
	 * Insert an object at a specific point
	 */
	insert(point: Point, object: T): void {
		const key = this.getCellKey(point.x, point.y);
		if (!this.cells.has(key)) {
			this.cells.set(key, []);
		}
		this.cells.get(key)!.push(object);
	}

	/**
	 * Insert an object in a rectangular area
	 */
	insertRect(
		x: number,
		y: number,
		width: number,
		height: number,
		object: T
	): void {
		const keys = this.getCellKeysInRect(x, y, width, height);
		for (const key of keys) {
			if (!this.cells.has(key)) {
				this.cells.set(key, []);
			}
			this.cells.get(key)!.push(object);
		}
	}

	/**
	 * Query objects near a point
	 */
	queryPoint(point: Point): T[] {
		const key = this.getCellKey(point.x, point.y);
		return this.cells.get(key) || [];
	}

	/**
	 * Query objects in a rectangular area
	 */
	queryRect(x: number, y: number, width: number, height: number): T[] {
		const objects = new Set<T>();
		const keys = this.getCellKeysInRect(x, y, width, height);

		for (const key of keys) {
			const cellObjects = this.cells.get(key);
			if (cellObjects) {
				cellObjects.forEach((obj) => objects.add(obj));
			}
		}

		return Array.from(objects);
	}

	/**
	 * Query objects within radius of a point
	 */
	queryRadius(center: Point, radius: number): T[] {
		const radiusSquared = radius * radius;
		const objects = this.queryRect(
			center.x - radius,
			center.y - radius,
			radius * 2,
			radius * 2
		);

		// Filter by actual distance
		return objects.filter((obj) => {
			if (typeof obj === "object" && obj !== null && "x" in obj && "y" in obj) {
				const point = obj as unknown as Point;
				const dx = point.x - center.x;
				const dy = point.y - center.y;
				return dx * dx + dy * dy <= radiusSquared;
			}
			return true; // Include non-point objects
		});
	}

	/**
	 * Remove an object from a specific point
	 */
	remove(point: Point, object: T): boolean {
		const key = this.getCellKey(point.x, point.y);
		const cell = this.cells.get(key);
		if (!cell) return false;

		const index = cell.indexOf(object);
		if (index === -1) return false;

		cell.splice(index, 1);
		if (cell.length === 0) {
			this.cells.delete(key);
		}
		return true;
	}

	/**
	 * Clear all objects
	 */
	clear(): void {
		this.cells.clear();
	}

	/**
	 * Get all objects in the hash
	 */
	getAllObjects(): T[] {
		const objects = new Set<T>();
		for (const cell of this.cells.values()) {
			cell.forEach((obj) => objects.add(obj));
		}
		return Array.from(objects);
	}

	/**
	 * Get statistics about the spatial hash
	 */
	getStats(): {
		totalCells: number;
		totalObjects: number;
		averageObjectsPerCell: number;
		maxObjectsPerCell: number;
	} {
		let totalObjects = 0;
		let maxObjectsPerCell = 0;

		for (const cell of this.cells.values()) {
			totalObjects += cell.length;
			maxObjectsPerCell = Math.max(maxObjectsPerCell, cell.length);
		}

		return {
			totalCells: this.cells.size,
			totalObjects,
			averageObjectsPerCell:
				this.cells.size > 0 ? totalObjects / this.cells.size : 0,
			maxObjectsPerCell,
		};
	}
}
