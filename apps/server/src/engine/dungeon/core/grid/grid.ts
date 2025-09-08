import {
	Point,
	GridDimensions,
	CellType,
	DIRECTIONS_4,
	DIRECTIONS_8,
} from "./types";

/**
 * High-performance grid implementation optimized for cellular automata and spatial operations.
 * Uses flat array storage for better cache locality and provides vectorized operations.
 */
export class Grid {
	private readonly data: Uint8Array;
	private readonly dimensions: GridDimensions;

	// Pre-allocated arrays for neighbor calculations to avoid garbage collection
	private readonly neighborBuffer: number[] = new Array(8);
	private readonly pointBuffer: Point[] = new Array(8);

	constructor(
		dimensions: GridDimensions,
		initialValue: CellType = CellType.FLOOR
	) {
		this.dimensions = dimensions;
		this.data = new Uint8Array(dimensions.width * dimensions.height);

		if (initialValue !== CellType.FLOOR) {
			this.data.fill(initialValue);
		}
	}

	/**
	 * Creates a grid from a 2D boolean array (for compatibility with existing code)
	 */
	static fromBooleanGrid(grid: boolean[][]): Grid {
		const height = grid.length;
		const width = height > 0 ? grid[0].length : 0;
		const result = new Grid({ width, height });

		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				result.setCell(x, y, grid[y][x] ? CellType.WALL : CellType.FLOOR);
			}
		}

		return result;
	}

	/**
	 * Converts to 2D boolean array (for compatibility)
	 */
	toBooleanGrid(): boolean[][] {
		const result: boolean[][] = new Array(this.dimensions.height);

		for (let y = 0; y < this.dimensions.height; y++) {
			result[y] = new Array(this.dimensions.width);
			for (let x = 0; x < this.dimensions.width; x++) {
				result[y][x] = this.getCell(x, y) === CellType.WALL;
			}
		}

		return result;
	}

	get width(): number {
		return this.dimensions.width;
	}

	get height(): number {
		return this.dimensions.height;
	}

	/**
	 * Fast inline bounds checking
	 */
	isInBounds(x: number, y: number): boolean {
		return (
			x >= 0 &&
			x < this.dimensions.width &&
			y >= 0 &&
			y < this.dimensions.height
		);
	}

	/**
	 * Get cell value with bounds checking
	 */
	getCell(x: number, y: number): CellType {
		if (!this.isInBounds(x, y)) return CellType.WALL; // Out of bounds = wall
		return this.data[y * this.dimensions.width + x] as CellType;
	}

	/**
	 * Set cell value with bounds checking
	 */
	setCell(x: number, y: number, value: CellType): void {
		if (this.isInBounds(x, y)) {
			this.data[y * this.dimensions.width + x] = value;
		}
	}

	/**
	 * Unsafe but fast cell access (no bounds checking)
	 * Use only when bounds are guaranteed
	 */
	getCellUnsafe(x: number, y: number): CellType {
		return this.data[y * this.dimensions.width + x] as CellType;
	}

	setCellUnsafe(x: number, y: number, value: CellType): void {
		this.data[y * this.dimensions.width + x] = value;
	}

	/**
	 * Count neighbors using 4-connectivity (optimized version)
	 */
	countNeighbors4(
		x: number,
		y: number,
		targetType: CellType = CellType.WALL
	): number {
		let count = 0;

		// Unrolled loop for maximum performance
		// North
		if (y > 0) {
			if (this.data[(y - 1) * this.dimensions.width + x] === targetType)
				count++;
		} else {
			count++; // Out of bounds = wall
		}

		// East
		if (x < this.dimensions.width - 1) {
			if (this.data[y * this.dimensions.width + (x + 1)] === targetType)
				count++;
		} else {
			count++; // Out of bounds = wall
		}

		// South
		if (y < this.dimensions.height - 1) {
			if (this.data[(y + 1) * this.dimensions.width + x] === targetType)
				count++;
		} else {
			count++; // Out of bounds = wall
		}

		// West
		if (x > 0) {
			if (this.data[y * this.dimensions.width + (x - 1)] === targetType)
				count++;
		} else {
			count++; // Out of bounds = wall
		}

		return count;
	}

	/**
	 * Count neighbors using 8-connectivity (optimized version)
	 */
	countNeighbors8(
		x: number,
		y: number,
		targetType: CellType = CellType.WALL
	): number {
		let count = 0;
		const width = this.dimensions.width;

		// Check all 8 directions with manual loop unrolling
		for (const dir of DIRECTIONS_8) {
			const nx = x + dir.x;
			const ny = y + dir.y;

			if (
				nx >= 0 &&
				nx < this.dimensions.width &&
				ny >= 0 &&
				ny < this.dimensions.height
			) {
				if (this.data[ny * width + nx] === targetType) count++;
			} else {
				count++; // Out of bounds = wall
			}
		}

		return count;
	}

	/**
	 * Get all neighbor coordinates (4-connectivity)
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
	 * Get all neighbor coordinates (8-connectivity)
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
	 * Apply cellular automata rules to entire grid (optimized)
	 */
	applyCellularAutomata(survivalMin: number, birthMin: number): Grid {
		const newGrid = new Grid(this.dimensions);
		const width = this.dimensions.width;
		const height = this.dimensions.height;

		// Process all cells
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				const neighbors = this.countNeighbors8(x, y, CellType.WALL);
				const currentCell = this.getCellUnsafe(x, y);

				if (currentCell === CellType.WALL) {
					// Wall survival rule
					newGrid.setCellUnsafe(
						x,
						y,
						neighbors >= survivalMin ? CellType.WALL : CellType.FLOOR
					);
				} else {
					// Floor birth rule
					newGrid.setCellUnsafe(
						x,
						y,
						neighbors >= birthMin ? CellType.WALL : CellType.FLOOR
					);
				}
			}
		}

		return newGrid;
	}

	/**
	 * Fill rectangle area with specified value
	 */
	fillRect(
		x: number,
		y: number,
		width: number,
		height: number,
		value: CellType
	): void {
		const maxX = Math.min(x + width, this.dimensions.width);
		const maxY = Math.min(y + height, this.dimensions.height);
		const startX = Math.max(0, x);
		const startY = Math.max(0, y);

		for (let py = startY; py < maxY; py++) {
			for (let px = startX; px < maxX; px++) {
				this.setCellUnsafe(px, py, value);
			}
		}
	}

	/**
	 * Count cells of specific type in rectangular area
	 */
	countCellsInRect(
		x: number,
		y: number,
		width: number,
		height: number,
		cellType: CellType
	): number {
		let count = 0;
		const maxX = Math.min(x + width, this.dimensions.width);
		const maxY = Math.min(y + height, this.dimensions.height);
		const startX = Math.max(0, x);
		const startY = Math.max(0, y);

		for (let py = startY; py < maxY; py++) {
			for (let px = startX; px < maxX; px++) {
				if (this.getCellUnsafe(px, py) === cellType) count++;
			}
		}

		return count;
	}

	/**
	 * Create a copy of this grid
	 */
	clone(): Grid {
		const newGrid = new Grid(this.dimensions);
		newGrid.data.set(this.data);
		return newGrid;
	}

	/**
	 * Clear entire grid to specified value
	 */
	clear(value: CellType = CellType.FLOOR): void {
		this.data.fill(value);
	}

	/**
	 * Get raw data array (for advanced operations)
	 */
	getRawData(): Uint8Array {
		return this.data;
	}
}
