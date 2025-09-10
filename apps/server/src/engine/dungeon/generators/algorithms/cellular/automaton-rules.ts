import { Grid, CellType } from "../../../core/grid";
import { SeededRandom } from "../../../core/random/seeded-random";

/**
 * Configuration for cellular automaton rules
 */
export interface AutomatonConfig {
	readonly wallProbability: number;
	readonly iterations: number;
	readonly survivalMin: number;
	readonly birthMin: number;
}

/**
 * Default configuration optimized for cave-like structures with multiple separate caverns
 */
export const DEFAULT_AUTOMATON_CONFIG: AutomatonConfig = {
	wallProbability: 0.48, // Increased to create more separation between caverns
	iterations: 3, // Back to 3 for more irregular shapes
	survivalMin: 4,
	birthMin: 5,
};

/**
 * Cellular automaton rule engine for generating organic cave structures.
 * Implements optimized Conway's Game of Life-style rules with customizable parameters.
 */
export class AutomatonRules {
	private readonly config: AutomatonConfig;
	private readonly rng: SeededRandom;

	constructor(config: AutomatonConfig, rng: SeededRandom) {
		this.config = config;
		this.rng = rng;
	}

	/**
	 * Initialize grid with random noise based on wall probability
	 */
	initializeGrid(width: number, height: number): Grid {
		const grid = new Grid({ width, height }, CellType.FLOOR);

		// Add border walls for stability
		this.addBorderWalls(grid);

		// Fill interior with random noise
		for (let y = 1; y < height - 1; y++) {
			for (let x = 1; x < width - 1; x++) {
				if (this.rng.next() < this.config.wallProbability) {
					grid.setCell(x, y, CellType.WALL);
				}
			}
		}

		return grid;
	}

	/**
	 * Apply cellular automaton rules for specified iterations
	 */
	evolveGrid(grid: Grid): Grid {
		let currentGrid = grid;

		for (let i = 0; i < this.config.iterations; i++) {
			currentGrid = this.applySingleIteration(currentGrid);
		}

		return currentGrid;
	}

	/**
	 * Apply one iteration of cellular automaton rules
	 */
	private applySingleIteration(grid: Grid): Grid {
		return grid.applyCellularAutomata(
			this.config.survivalMin,
			this.config.birthMin
		);
	}

	/**
	 * Add border walls to prevent caves from extending to edges
	 */
	private addBorderWalls(grid: Grid): void {
		const width = grid.width;
		const height = grid.height;

		// Top and bottom borders
		for (let x = 0; x < width; x++) {
			grid.setCell(x, 0, CellType.WALL);
			grid.setCell(x, height - 1, CellType.WALL);
		}

		// Left and right borders
		for (let y = 0; y < height; y++) {
			grid.setCell(0, y, CellType.WALL);
			grid.setCell(width - 1, y, CellType.WALL);
		}
	}

	/**
	 * Smooth grid by removing isolated walls and filling small holes
	 */
	smoothGrid(grid: Grid): Grid {
		const smoothed = grid.clone();

		for (let y = 1; y < grid.height - 1; y++) {
			for (let x = 1; x < grid.width - 1; x++) {
				const wallNeighbors = grid.countNeighbors8(x, y, CellType.WALL);
				const currentCell = grid.getCell(x, y);

				// Remove isolated walls (walls with few neighbors)
				if (currentCell === CellType.WALL && wallNeighbors <= 2) {
					smoothed.setCell(x, y, CellType.FLOOR);
				}

				// Fill small holes (floors surrounded by walls)
				if (currentCell === CellType.FLOOR && wallNeighbors >= 6) {
					smoothed.setCell(x, y, CellType.WALL);
				}
			}
		}

		return smoothed;
	}

	/**
	 * Apply multiple rule variants for different cave styles
	 */
	applyVariantRules(grid: Grid, variant: "dense" | "sparse" | "maze"): Grid {
		switch (variant) {
			case "dense":
				return this.applyDenseRules(grid);
			case "sparse":
				return this.applySparseRules(grid);
			case "maze":
				return this.applyMazeRules(grid);
			default:
				return grid;
		}
	}

	/**
	 * Dense cave variant - more walls, smaller caverns
	 */
	private applyDenseRules(grid: Grid): Grid {
		return grid.applyCellularAutomata(3, 4); // Easier for walls to survive and be born
	}

	/**
	 * Sparse cave variant - fewer walls, larger caverns
	 */
	private applySparseRules(grid: Grid): Grid {
		return grid.applyCellularAutomata(5, 6); // Harder for walls to survive and be born
	}

	/**
	 * Maze-like variant - creates more corridor-like structures
	 */
	private applyMazeRules(grid: Grid): Grid {
		// First pass: standard rules
		let result = grid.applyCellularAutomata(
			this.config.survivalMin,
			this.config.birthMin
		);

		// Second pass: corridor enhancement
		const enhanced = result.clone();
		for (let y = 2; y < grid.height - 2; y += 2) {
			for (let x = 2; x < grid.width - 2; x += 2) {
				// Create corridors by selectively removing walls
				if (
					result.getCell(x, y) === CellType.WALL &&
					this.hasCorridorPotential(result, x, y)
				) {
					enhanced.setCell(x, y, CellType.FLOOR);
				}
			}
		}

		return enhanced;
	}

	/**
	 * Check if a wall position has potential to become a corridor
	 */
	private hasCorridorPotential(grid: Grid, x: number, y: number): boolean {
		// Look for patterns that suggest corridor formation
		const horizontalClear =
			grid.getCell(x - 1, y) === CellType.FLOOR &&
			grid.getCell(x + 1, y) === CellType.FLOOR;

		const verticalClear =
			grid.getCell(x, y - 1) === CellType.FLOOR &&
			grid.getCell(x, y + 1) === CellType.FLOOR;

		return horizontalClear || verticalClear;
	}

	/**
	 * Post-process grid to ensure connectivity and remove artifacts
	 */
	postProcess(grid: Grid): Grid {
		let processed = this.smoothGrid(grid);
		processed = this.removeSmallWallClusters(processed);
		processed = this.ensureMinimumOpenSpace(processed);
		return processed;
	}

	/**
	 * Remove small isolated wall clusters
	 */
	private removeSmallWallClusters(grid: Grid): Grid {
		// This would use Union-Find to identify small wall clusters and remove them
		// For now, using a simplified approach
		const result = grid.clone();

		for (let y = 1; y < grid.height - 1; y++) {
			for (let x = 1; x < grid.width - 1; x++) {
				if (grid.getCell(x, y) === CellType.WALL) {
					const connectedWalls = this.countConnectedWalls(grid, x, y);
					if (connectedWalls < 3) {
						result.setCell(x, y, CellType.FLOOR);
					}
				}
			}
		}

		return result;
	}

	/**
	 * Count connected walls in a small area
	 */
	private countConnectedWalls(grid: Grid, x: number, y: number): number {
		let count = 0;
		for (let dy = -1; dy <= 1; dy++) {
			for (let dx = -1; dx <= 1; dx++) {
				if (dx === 0 && dy === 0) continue;
				if (grid.getCell(x + dx, y + dy) === CellType.WALL) {
					count++;
				}
			}
		}
		return count;
	}

	/**
	 * Ensure minimum amount of open space
	 */
	private ensureMinimumOpenSpace(grid: Grid): Grid {
		const totalCells = grid.width * grid.height;
		const floorCells = this.countFloorCells(grid);
		const floorRatio = floorCells / totalCells;

		// If less than 30% open space, remove some walls
		if (floorRatio < 0.3) {
			return this.openMoreSpace(grid);
		}

		return grid;
	}

	/**
	 * Count total floor cells
	 */
	private countFloorCells(grid: Grid): number {
		let count = 0;
		for (let y = 0; y < grid.height; y++) {
			for (let x = 0; x < grid.width; x++) {
				if (grid.getCell(x, y) === CellType.FLOOR) {
					count++;
				}
			}
		}
		return count;
	}

	/**
	 * Remove some walls to create more open space
	 */
	private openMoreSpace(grid: Grid): Grid {
		const result = grid.clone();

		// Remove walls that have many floor neighbors
		for (let y = 1; y < grid.height - 1; y++) {
			for (let x = 1; x < grid.width - 1; x++) {
				if (grid.getCell(x, y) === CellType.WALL) {
					const floorNeighbors = 8 - grid.countNeighbors8(x, y, CellType.WALL);
					if (floorNeighbors >= 4) {
						result.setCell(x, y, CellType.FLOOR);
					}
				}
			}
		}

		return result;
	}
}
