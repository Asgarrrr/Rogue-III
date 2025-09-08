import { Grid } from "./grid";
import {
	Point,
	CellType,
	DIRECTIONS_4,
	DIRECTIONS_8,
	FloodFillConfig,
	Region,
} from "./types";

/**
 * High-performance flood fill implementations using scanline algorithm
 * and optimized data structures to minimize memory allocations.
 */
export class FloodFill {
	private static readonly DEFAULT_CONFIG: Required<FloodFillConfig> = {
		maxSize: Number.MAX_SAFE_INTEGER,
		targetValue: CellType.FLOOR,
		fillValue: CellType.WALL,
		diagonal: false,
	};

	/**
	 * Scanline flood fill - most efficient for large connected areas
	 */
	static scanlineFill(
		grid: Grid,
		startX: number,
		startY: number,
		config: FloodFillConfig = {}
	): Point[] {
		const cfg = { ...this.DEFAULT_CONFIG, ...config };
		const points: Point[] = [];

		if (
			!grid.isInBounds(startX, startY) ||
			grid.getCell(startX, startY) !== cfg.targetValue
		) {
			return points;
		}

		const visited = new Set<string>();
		const stack: { x: number; y: number }[] = [{ x: startX, y: startY }];

		while (stack.length > 0 && points.length < cfg.maxSize) {
			const { x, y } = stack.pop()!;
			const key = `${x},${y}`;

			if (
				visited.has(key) ||
				!grid.isInBounds(x, y) ||
				grid.getCell(x, y) !== cfg.targetValue
			) {
				continue;
			}

			// Scanline: find the extent of this horizontal line
			let leftX = x;
			let rightX = x;

			// Extend left
			while (
				leftX > 0 &&
				grid.getCell(leftX - 1, y) === cfg.targetValue &&
				!visited.has(`${leftX - 1},${y}`)
			) {
				leftX--;
			}

			// Extend right
			while (
				rightX < grid.width - 1 &&
				grid.getCell(rightX + 1, y) === cfg.targetValue &&
				!visited.has(`${rightX + 1},${y}`)
			) {
				rightX++;
			}

			// Fill the scanline and mark as visited
			for (let scanX = leftX; scanX <= rightX; scanX++) {
				const scanKey = `${scanX},${y}`;
				if (!visited.has(scanKey)) {
					visited.add(scanKey);
					points.push({ x: scanX, y });
					grid.setCell(scanX, y, cfg.fillValue);
				}
			}

			// Check lines above and below for connected areas
			for (const dy of [-1, 1]) {
				const checkY = y + dy;
				if (checkY >= 0 && checkY < grid.height) {
					for (let scanX = leftX; scanX <= rightX; scanX++) {
						if (
							grid.getCell(scanX, checkY) === cfg.targetValue &&
							!visited.has(`${scanX},${checkY}`)
						) {
							stack.push({ x: scanX, y: checkY });
						}
					}
				}
			}
		}

		return points;
	}

	/**
	 * Standard flood fill with 4 or 8 connectivity
	 */
	static standardFill(
		grid: Grid,
		startX: number,
		startY: number,
		config: FloodFillConfig = {}
	): Point[] {
		const cfg = { ...this.DEFAULT_CONFIG, ...config };
		const points: Point[] = [];

		if (
			!grid.isInBounds(startX, startY) ||
			grid.getCell(startX, startY) !== cfg.targetValue
		) {
			return points;
		}

		const visited = new Set<string>();
		const queue: Point[] = [{ x: startX, y: startY }];
		const directions = cfg.diagonal ? DIRECTIONS_8 : DIRECTIONS_4;

		let queueIndex = 0;
		while (queueIndex < queue.length && points.length < cfg.maxSize) {
			const current = queue[queueIndex++];
			const key = `${current.x},${current.y}`;

			if (visited.has(key)) continue;

			visited.add(key);
			points.push(current);
			grid.setCell(current.x, current.y, cfg.fillValue);

			// Check all neighbors
			for (const dir of directions) {
				const nx = current.x + dir.x;
				const ny = current.y + dir.y;
				const neighborKey = `${nx},${ny}`;

				if (
					!visited.has(neighborKey) &&
					grid.isInBounds(nx, ny) &&
					grid.getCell(nx, ny) === cfg.targetValue
				) {
					queue.push({ x: nx, y: ny });
				}
			}
		}

		return points;
	}

	/**
	 * Find all connected regions without modifying the grid
	 */
	static findRegions(
		grid: Grid,
		targetType: CellType = CellType.FLOOR,
		minSize: number = 1,
		diagonal: boolean = false
	): Region[] {
		const regions: Region[] = [];
		const visited = new Set<string>();
		const directions = diagonal ? DIRECTIONS_8 : DIRECTIONS_4;
		let regionId = 0;

		for (let y = 0; y < grid.height; y++) {
			for (let x = 0; x < grid.width; x++) {
				const key = `${x},${y}`;

				if (visited.has(key) || grid.getCell(x, y) !== targetType) {
					continue;
				}

				// Found a new region - explore it
				const regionPoints: Point[] = [];
				const queue: Point[] = [{ x, y }];
				let queueIndex = 0;

				let minX = x,
					maxX = x,
					minY = y,
					maxY = y;

				while (queueIndex < queue.length) {
					const current = queue[queueIndex++];
					const currentKey = `${current.x},${current.y}`;

					if (visited.has(currentKey)) continue;

					visited.add(currentKey);
					regionPoints.push(current);

					// Update bounds
					minX = Math.min(minX, current.x);
					maxX = Math.max(maxX, current.x);
					minY = Math.min(minY, current.y);
					maxY = Math.max(maxY, current.y);

					// Check neighbors
					for (const dir of directions) {
						const nx = current.x + dir.x;
						const ny = current.y + dir.y;
						const neighborKey = `${nx},${ny}`;

						if (
							!visited.has(neighborKey) &&
							grid.isInBounds(nx, ny) &&
							grid.getCell(nx, ny) === targetType
						) {
							queue.push({ x: nx, y: ny });
						}
					}
				}

				if (regionPoints.length >= minSize) {
					regions.push({
						id: regionId++,
						points: regionPoints,
						bounds: { minX, minY, maxX, maxY },
						size: regionPoints.length,
					});
				}
			}
		}

		return regions;
	}

	/**
	 * Find the largest connected region
	 */
	static findLargestRegion(
		grid: Grid,
		targetType: CellType = CellType.FLOOR,
		diagonal: boolean = false
	): Region | null {
		const regions = this.findRegions(grid, targetType, 1, diagonal);

		if (regions.length === 0) return null;

		return regions.reduce((largest, current) =>
			current.size > largest.size ? current : largest
		);
	}

	/**
	 * Check if two points are connected
	 */
	static areConnected(
		grid: Grid,
		point1: Point,
		point2: Point,
		targetType: CellType = CellType.FLOOR,
		diagonal: boolean = false
	): boolean {
		if (
			grid.getCell(point1.x, point1.y) !== targetType ||
			grid.getCell(point2.x, point2.y) !== targetType
		) {
			return false;
		}

		const visited = new Set<string>();
		const queue: Point[] = [point1];
		const directions = diagonal ? DIRECTIONS_8 : DIRECTIONS_4;
		let queueIndex = 0;

		while (queueIndex < queue.length) {
			const current = queue[queueIndex++];
			const key = `${current.x},${current.y}`;

			if (visited.has(key)) continue;

			if (current.x === point2.x && current.y === point2.y) {
				return true;
			}

			visited.add(key);

			for (const dir of directions) {
				const nx = current.x + dir.x;
				const ny = current.y + dir.y;
				const neighborKey = `${nx},${ny}`;

				if (
					!visited.has(neighborKey) &&
					grid.isInBounds(nx, ny) &&
					grid.getCell(nx, ny) === targetType
				) {
					queue.push({ x: nx, y: ny });
				}
			}
		}

		return false;
	}
}
