import {
	Grid,
	CellType,
	FloodFill,
	Region,
	UnionFind,
} from "../../../core/grid";

/**
 * Configuration for cavern analysis
 */
export interface CavernAnalysisConfig {
	readonly minCavernSize: number;
	readonly maxCavernSize: number;
	readonly connectivityMode: "4" | "8";
}

/**
 * Default configuration for cavern analysis
 */
export const DEFAULT_CAVERN_CONFIG: CavernAnalysisConfig = {
	minCavernSize: 25,
	maxCavernSize: 10000,
	connectivityMode: "4",
};

/**
 * Analyzes cellular automaton grids to identify and classify cavern systems.
 * Uses Union-Find for efficient connected component analysis.
 */
export class CavernAnalyzer {
	private readonly config: CavernAnalysisConfig;

	constructor(config: CavernAnalysisConfig = DEFAULT_CAVERN_CONFIG) {
		this.config = config;
	}

	/**
	 * Find all caverns in the grid using optimized flood fill
	 */
	findCaverns(grid: Grid): Region[] {
		const diagonal = this.config.connectivityMode === "8";
		return FloodFill.findRegions(
			grid,
			CellType.FLOOR,
			this.config.minCavernSize,
			diagonal
		);
	}

	/**
	 * Find caverns using Union-Find for maximum performance
	 */
	findCavernsUnionFind(grid: Grid): Region[] {
		const width = grid.width;
		const height = grid.height;
		const uf = new UnionFind(width * height);

		// Convert 2D coordinates to 1D index
		const getIndex = (x: number, y: number) => y * width + x;

		// Connect adjacent floor cells
		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				if (grid.getCell(x, y) !== CellType.FLOOR) continue;

				const currentIndex = getIndex(x, y);

				// Check right neighbor
				if (x < width - 1 && grid.getCell(x + 1, y) === CellType.FLOOR) {
					uf.union(currentIndex, getIndex(x + 1, y));
				}

				// Check bottom neighbor
				if (y < height - 1 && grid.getCell(x, y + 1) === CellType.FLOOR) {
					uf.union(currentIndex, getIndex(x, y + 1));
				}

				// For 8-connectivity, check diagonal neighbors
				if (this.config.connectivityMode === "8") {
					// Bottom-right diagonal
					if (
						x < width - 1 &&
						y < height - 1 &&
						grid.getCell(x + 1, y + 1) === CellType.FLOOR
					) {
						uf.union(currentIndex, getIndex(x + 1, y + 1));
					}

					// Bottom-left diagonal
					if (
						x > 0 &&
						y < height - 1 &&
						grid.getCell(x - 1, y + 1) === CellType.FLOOR
					) {
						uf.union(currentIndex, getIndex(x - 1, y + 1));
					}
				}
			}
		}

		// Group cells by component
		const components = new Map<number, { x: number; y: number }[]>();

		for (let y = 0; y < height; y++) {
			for (let x = 0; x < width; x++) {
				if (grid.getCell(x, y) !== CellType.FLOOR) continue;

				const index = getIndex(x, y);
				const root = uf.find(index);

				if (!components.has(root)) {
					components.set(root, []);
				}
				components.get(root)!.push({ x, y });
			}
		}

		// Convert to regions
		const regions: Region[] = [];
		let regionId = 0;

		for (const points of components.values()) {
			if (
				points.length >= this.config.minCavernSize &&
				points.length <= this.config.maxCavernSize
			) {
				// Calculate bounds
				let minX = points[0].x,
					maxX = points[0].x;
				let minY = points[0].y,
					maxY = points[0].y;

				for (const point of points) {
					minX = Math.min(minX, point.x);
					maxX = Math.max(maxX, point.x);
					minY = Math.min(minY, point.y);
					maxY = Math.max(maxY, point.y);
				}

				regions.push({
					id: regionId++,
					points,
					bounds: { minX, minY, maxX, maxY },
					size: points.length,
				});
			}
		}

		return regions.sort((a, b) => b.size - a.size); // Sort by size, largest first
	}

	/**
	 * Classify caverns by their characteristics
	 */
	classifyCaverns(caverns: Region[]): {
		large: Region[];
		medium: Region[];
		small: Region[];
		elongated: Region[];
		compact: Region[];
	} {
		const large: Region[] = [];
		const medium: Region[] = [];
		const small: Region[] = [];
		const elongated: Region[] = [];
		const compact: Region[] = [];

		for (const cavern of caverns) {
			// Size classification
			if (cavern.size > 500) {
				large.push(cavern);
			} else if (cavern.size > 100) {
				medium.push(cavern);
			} else {
				small.push(cavern);
			}

			// Shape classification
			const aspectRatio = this.calculateAspectRatio(cavern);
			if (aspectRatio > 2.5) {
				elongated.push(cavern);
			} else {
				compact.push(cavern);
			}
		}

		return { large, medium, small, elongated, compact };
	}

	/**
	 * Calculate aspect ratio of a cavern
	 */
	private calculateAspectRatio(cavern: Region): number {
		const width = cavern.bounds.maxX - cavern.bounds.minX + 1;
		const height = cavern.bounds.maxY - cavern.bounds.minY + 1;
		return Math.max(width, height) / Math.min(width, height);
	}

	/**
	 * Find the main cavern (largest connected floor area)
	 */
	findMainCavern(grid: Grid): Region | null {
		const caverns = this.findCavernsUnionFind(grid);
		return caverns.length > 0 ? caverns[0] : null;
	}

	/**
	 * Calculate cavern density (ratio of floor to total area in bounds)
	 */
	calculateCavernDensity(cavern: Region): number {
		const boundsArea =
			(cavern.bounds.maxX - cavern.bounds.minX + 1) *
			(cavern.bounds.maxY - cavern.bounds.minY + 1);
		return cavern.size / boundsArea;
	}

	/**
	 * Find caverns suitable for room placement
	 */
	findRoomSuitableCaverns(caverns: Region[], minRoomSize: number): Region[] {
		return caverns.filter((cavern) => {
			const width = cavern.bounds.maxX - cavern.bounds.minX + 1;
			const height = cavern.bounds.maxY - cavern.bounds.minY + 1;

			// Must be large enough for minimum room size plus padding
			const minRequiredSize = (minRoomSize + 2) * (minRoomSize + 2);

			return (
				cavern.size >= minRequiredSize &&
				width >= minRoomSize + 4 &&
				height >= minRoomSize + 4
			);
		});
	}

	/**
	 * Analyze cavern connectivity patterns
	 */
	analyzeCavernConnectivity(
		caverns: Region[],
		grid: Grid
	): {
		isolatedCaverns: Region[];
		connectedGroups: Region[][];
		mainNetwork: Region[];
	} {
		const isolatedCaverns: Region[] = [];
		const connectedGroups: Region[][] = [];
		const connectionGraph = this.buildCavernConnectionGraph(caverns, grid);

		// Find connected components in the cavern graph
		const visited = new Set<number>();

		for (const cavern of caverns) {
			if (visited.has(cavern.id)) continue;

			const group = this.findConnectedCavernGroup(
				cavern.id,
				connectionGraph,
				visited
			);

			if (group.length === 1) {
				isolatedCaverns.push(caverns.find((c) => c.id === group[0])!);
			} else {
				const cavernGroup = group.map(
					(id) => caverns.find((c) => c.id === id)!
				);
				connectedGroups.push(cavernGroup);
			}
		}

		// Find the largest connected group as the main network
		const mainNetwork =
			connectedGroups.length > 0
				? connectedGroups.reduce((largest, current) =>
						current.length > largest.length ? current : largest
					)
				: [];

		return { isolatedCaverns, connectedGroups, mainNetwork };
	}

	/**
	 * Build a graph of cavern connections
	 */
	private buildCavernConnectionGraph(
		caverns: Region[],
		grid: Grid
	): Map<number, number[]> {
		const graph = new Map<number, number[]>();

		// Initialize graph
		for (const cavern of caverns) {
			graph.set(cavern.id, []);
		}

		// Check connections between all pairs of caverns
		for (let i = 0; i < caverns.length; i++) {
			for (let j = i + 1; j < caverns.length; j++) {
				if (this.areCavernsConnected(caverns[i], caverns[j], grid)) {
					graph.get(caverns[i].id)!.push(caverns[j].id);
					graph.get(caverns[j].id)!.push(caverns[i].id);
				}
			}
		}

		return graph;
	}

	/**
	 * Check if two caverns are connected by floor tiles
	 */
	private areCavernsConnected(
		cavern1: Region,
		cavern2: Region,
		grid: Grid
	): boolean {
		// Simple heuristic: check if there's a floor path between closest points
		const point1 = this.findClosestPoint(cavern1, cavern2);
		const point2 = this.findClosestPoint(cavern2, cavern1);

		return FloodFill.areConnected(grid, point1, point2, CellType.FLOOR, false);
	}

	/**
	 * Find the closest point in cavern1 to cavern2
	 */
	private findClosestPoint(
		cavern1: Region,
		cavern2: Region
	): { x: number; y: number } {
		let closestPoint = cavern1.points[0];
		let minDistance = Infinity;

		const center2 = {
			x: (cavern2.bounds.minX + cavern2.bounds.maxX) / 2,
			y: (cavern2.bounds.minY + cavern2.bounds.maxY) / 2,
		};

		for (const point of cavern1.points) {
			const distance = (point.x - center2.x) ** 2 + (point.y - center2.y) ** 2;

			if (distance < minDistance) {
				minDistance = distance;
				closestPoint = point;
			}
		}

		return closestPoint;
	}

	/**
	 * Find connected cavern group using DFS
	 */
	private findConnectedCavernGroup(
		startId: number,
		graph: Map<number, number[]>,
		visited: Set<number>
	): number[] {
		const group: number[] = [];
		const stack = [startId];

		while (stack.length > 0) {
			const currentId = stack.pop()!;

			if (visited.has(currentId)) continue;

			visited.add(currentId);
			group.push(currentId);

			const neighbors = graph.get(currentId) || [];
			for (const neighborId of neighbors) {
				if (!visited.has(neighborId)) {
					stack.push(neighborId);
				}
			}
		}

		return group;
	}

	/**
	 * Generate statistics about the cavern system
	 */
	generateCavernStatistics(caverns: Region[]): {
		totalCaverns: number;
		totalFloorArea: number;
		averageCavernSize: number;
		largestCavernSize: number;
		smallestCavernSize: number;
		averageAspectRatio: number;
	} {
		if (caverns.length === 0) {
			return {
				totalCaverns: 0,
				totalFloorArea: 0,
				averageCavernSize: 0,
				largestCavernSize: 0,
				smallestCavernSize: 0,
				averageAspectRatio: 0,
			};
		}

		const totalFloorArea = caverns.reduce(
			(sum, cavern) => sum + cavern.size,
			0
		);
		const sizes = caverns.map((c) => c.size);
		const aspectRatios = caverns.map((c) => this.calculateAspectRatio(c));

		return {
			totalCaverns: caverns.length,
			totalFloorArea,
			averageCavernSize: totalFloorArea / caverns.length,
			largestCavernSize: Math.max(...sizes),
			smallestCavernSize: Math.min(...sizes),
			averageAspectRatio:
				aspectRatios.reduce((sum, ratio) => sum + ratio, 0) /
				aspectRatios.length,
		};
	}
}
