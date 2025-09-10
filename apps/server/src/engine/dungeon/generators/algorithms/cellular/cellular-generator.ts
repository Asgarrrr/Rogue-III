import { DungeonGenerator } from "../../base/dungeon-generator";
import { DungeonConfig, DungeonSeed } from "../../../core/types";
import { RoomImpl, ConnectionImpl, DungeonImpl } from "../../../entities";
import { Grid, CellType } from "../../../core/grid";
import {
	AutomatonRules,
	DEFAULT_AUTOMATON_CONFIG,
	AutomatonConfig,
} from "./automaton-rules";
import {
	CavernAnalyzer,
	DEFAULT_CAVERN_CONFIG,
	CavernAnalysisConfig,
} from "./cavern-analyzer";
import {
	RoomPlacer,
	DEFAULT_ROOM_PLACEMENT_CONFIG,
	RoomPlacementConfig,
} from "./room-placer";
import {
	PathFinder,
	DEFAULT_PATHFINDING_CONFIG,
	PathfindingConfig,
} from "./path-finder";

/**
 * Configuration for the cellular automaton generator
 */
export interface CellularGeneratorConfig {
	readonly automaton: AutomatonConfig;
	readonly caverns: CavernAnalysisConfig;
	readonly rooms: RoomPlacementConfig;
	readonly pathfinding: PathfindingConfig;
	readonly variant: "standard" | "dense" | "sparse" | "maze";
	readonly postProcessing: boolean;
}

/**
 * Default configuration optimized for performance and quality
 */
export const DEFAULT_CELLULAR_CONFIG: CellularGeneratorConfig = {
	automaton: DEFAULT_AUTOMATON_CONFIG,
	caverns: DEFAULT_CAVERN_CONFIG,
	rooms: {
		...DEFAULT_ROOM_PLACEMENT_CONFIG,
		roomCount: 8, // Will be overridden by DungeonConfig
	},
	pathfinding: DEFAULT_PATHFINDING_CONFIG,
	variant: "standard",
	postProcessing: true,
};

/**
 * High-performance cellular automaton dungeon generator.
 *
 * This generator uses a modular architecture with specialized components:
 * - AutomatonRules: Handles cellular automaton evolution
 * - CavernAnalyzer: Finds and analyzes connected regions using Union-Find
 * - RoomPlacer: Places rooms using spatial hashing for collision detection
 * - PathFinder: Creates connections using optimized A* pathfinding
 *
 * Key optimizations:
 * - Flat array storage with Uint8Array for better cache locality
 * - Union-Find for O(α(n)) connected component analysis
 * - Spatial hashing for O(1) average collision detection
 * - Scanline flood fill for efficient region detection
 * - Object pooling to reduce garbage collection pressure
 */
export class CellularGenerator extends DungeonGenerator {
	private readonly cellularConfig: CellularGeneratorConfig;
	private readonly automatonRules: AutomatonRules;
	private readonly cavernAnalyzer: CavernAnalyzer;
	private readonly roomPlacer: RoomPlacer;
	private readonly pathFinder: PathFinder;

	constructor(dungeonConfig: DungeonConfig, seeds: DungeonSeed) {
		super(dungeonConfig, seeds);

		// Merge room count from dungeon config
		this.cellularConfig = {
			...DEFAULT_CELLULAR_CONFIG,
			rooms: {
				...DEFAULT_CELLULAR_CONFIG.rooms,
				roomCount: dungeonConfig.roomCount,
				minRoomSize: dungeonConfig.roomSizeRange[0],
				maxRoomSize: dungeonConfig.roomSizeRange[1],
			},
		};

		// Initialize specialized components
		this.automatonRules = new AutomatonRules(
			this.cellularConfig.automaton,
			this.layoutRng
		);
		this.cavernAnalyzer = new CavernAnalyzer(this.cellularConfig.caverns);
		this.roomPlacer = new RoomPlacer(this.cellularConfig.rooms, this.roomsRng);
		this.pathFinder = new PathFinder(this.cellularConfig.pathfinding);
	}

	/**
	 * Generate dungeon synchronously
	 */
	generate(): DungeonImpl {
		console.log(
			`🔄 Generating cellular dungeon (${this.config.width}x${this.config.height})`
		);
		console.log(`📊 Seeds: L=${this.seeds.layout}, R=${this.seeds.rooms}`);

		const startTime = performance.now();

		// Phase 1: Generate and evolve cellular grid
		const grid = this.generateCellularGrid();
		console.log(`✅ Grid generated (${performance.now() - startTime}ms)`);

		// Phase 2: Analyze cavern structure
		const caverns = this.analyzeCaverns(grid);
		console.log(
			`✅ Found ${caverns.length} caverns (${performance.now() - startTime}ms)`
		);

		// Phase 3: Place rooms in suitable caverns
		const rooms = this.placeRooms(caverns, grid);
		console.log(
			`✅ Placed ${rooms.length} rooms (${performance.now() - startTime}ms)`
		);

		// Phase 4: Create connections between rooms
		const connections = this.createConnections(rooms, grid);
		console.log(
			`✅ Created ${connections.length} connections (${
				performance.now() - startTime
			}ms)`
		);

		// Phase 4.5: Carve connection paths into the grid
		this.carveConnectionPaths(connections, grid);
		console.log(
			`✅ Carved connection paths (${performance.now() - startTime}ms)`
		);

		// Phase 5: Generate final dungeon
		const checksum = this.calculateChecksum(rooms, connections);
		const dungeon = new DungeonImpl({
			rooms,
			connections,
			config: this.config,
			seeds: this.seeds,
			checksum,
		});

		const totalTime = performance.now() - startTime;
		console.log(`🎉 Cellular dungeon generated in ${totalTime.toFixed(2)}ms`);

		return dungeon;
	}

	/**
	 * Generate dungeon asynchronously with progress tracking
	 */
	async generateAsync(
		onProgress?: (progress: number) => void
	): Promise<DungeonImpl> {
		console.log(
			`🔄 Generating cellular dungeon asynchronously (${this.config.width}x${this.config.height})`
		);

		const startTime = performance.now();
		let currentProgress = 0;

		const updateProgress = (increment: number) => {
			currentProgress += increment;
			onProgress?.(Math.min(currentProgress, 100));
		};

		// Phase 1: Generate and evolve cellular grid (30%)
		updateProgress(5);
		const grid = this.generateCellularGrid();
		console.log(`✅ Grid generated (${performance.now() - startTime}ms)`);
		updateProgress(25);
		await this.yield();

		// Phase 2: Analyze cavern structure (25%)
		const caverns = this.analyzeCaverns(grid);
		console.log(
			`✅ Found ${caverns.length} caverns (${performance.now() - startTime}ms)`
		);
		updateProgress(25);
		await this.yield();

		// Phase 3: Place rooms in suitable caverns (25%)
		const rooms = this.placeRooms(caverns, grid);
		console.log(
			`✅ Placed ${rooms.length} rooms (${performance.now() - startTime}ms)`
		);
		updateProgress(25);
		await this.yield();

		// Phase 4: Create connections between rooms (15%)
		const connections = this.createConnections(rooms, grid);
		console.log(
			`✅ Created ${connections.length} connections (${
				performance.now() - startTime
			}ms)`
		);
		updateProgress(10);
		await this.yield();

		// Phase 4.5: Carve connection paths into the grid
		this.carveConnectionPaths(connections, grid);
		console.log(
			`✅ Carved connection paths (${performance.now() - startTime}ms)`
		);
		updateProgress(5);
		await this.yield();

		// Phase 5: Generate final dungeon (5%)
		const checksum = this.calculateChecksum(rooms, connections);
		const dungeon = new DungeonImpl({
			rooms,
			connections,
			config: this.config,
			seeds: this.seeds,
			checksum,
		});
		updateProgress(5);

		const totalTime = performance.now() - startTime;
		console.log(
			`🎉 Cellular dungeon generated asynchronously in ${totalTime.toFixed(
				2
			)}ms`
		);

		return dungeon;
	}

	/**
	 * Generate and evolve the cellular automaton grid
	 */
	private generateCellularGrid(): Grid {
		// Initialize with random noise
		let grid = this.automatonRules.initializeGrid(
			this.config.width,
			this.config.height
		);

		// Apply cellular automaton evolution
		grid = this.automatonRules.evolveGrid(grid);

		// Apply variant-specific rules
		if (this.cellularConfig.variant !== "standard") {
			grid = this.automatonRules.applyVariantRules(
				grid,
				this.cellularConfig.variant
			);
		}

		// Post-process if enabled
		if (this.cellularConfig.postProcessing) {
			grid = this.automatonRules.postProcess(grid);
		}

		return grid;
	}

	/**
	 * Analyze cavern structure using Union-Find
	 */
	private analyzeCaverns(grid: Grid) {
		// Use Union-Find for maximum performance
		const caverns = this.cavernAnalyzer.findCavernsUnionFind(grid);

		// Filter caverns suitable for room placement
		const suitableCaverns = this.cavernAnalyzer.findRoomSuitableCaverns(
			caverns,
			this.cellularConfig.rooms.minRoomSize
		);

		// Generate statistics for debugging
		const stats = this.cavernAnalyzer.generateCavernStatistics(caverns);
		console.log(`📈 Cavern stats:`, {
			total: stats.totalCaverns,
			suitable: suitableCaverns.length,
			avgSize: Math.round(stats.averageCavernSize),
			largest: stats.largestCavernSize,
		});

		return suitableCaverns;
	}

	/**
	 * Place rooms in suitable caverns using spatial hashing
	 */
	private placeRooms(caverns: any[], grid: Grid) {
		const rooms = this.roomPlacer.placeRooms(caverns, grid);

		// Carve rooms into the grid
		this.carveRoomsIntoGrid(rooms, grid);

		// Optional: Optimize placement using simulated annealing
		if (
			rooms.length > 0 &&
			rooms.length < this.cellularConfig.rooms.roomCount
		) {
			console.log(`🔧 Optimizing room placement...`);
			const optimizedRooms = this.roomPlacer.optimizeRoomPlacement(rooms, caverns, grid);
			// Re-carve optimized rooms
			this.carveRoomsIntoGrid(optimizedRooms, grid);
			return optimizedRooms;
		}

		return rooms;
	}

	/**
	 * Create connections between rooms using optimized pathfinding
	 */
	private createConnections(rooms: RoomImpl[], grid: Grid) {
		return this.pathFinder.createConnections(rooms, grid);
	}

	/**
	 * Carve rooms into the grid to ensure they are walkable
	 */
	private carveRoomsIntoGrid(rooms: RoomImpl[], grid: Grid): void {
		for (const room of rooms) {
			// Carve the entire room area as floor
			for (let y = room.y; y < room.y + room.height; y++) {
				for (let x = room.x; x < room.x + room.width; x++) {
					if (grid.isInBounds(x, y)) {
						grid.setCell(x, y, CellType.FLOOR);
					}
				}
			}
		}
	}

	/**
	 * Carve connection paths into the grid to create walkable corridors
	 */
	private carveConnectionPaths(connections: ConnectionImpl[], grid: Grid): void {
		for (const connection of connections) {
			// Carve each point in the connection path
			for (const point of connection.path) {
				const x = Math.floor(point.x);
				const y = Math.floor(point.y);
				
				// Ensure the path point is within bounds
				if (grid.isInBounds(x, y)) {
					// Set corridor cell to floor
					grid.setCell(x, y, CellType.FLOOR);
				}
			}
		}
	}

	/**
	 * Calculate deterministic checksum for the dungeon
	 */
	private calculateChecksum(
		rooms: RoomImpl[],
		connections: ConnectionImpl[]
	): string {
		let hash = 5381; // djb2 initial value

		// Hash rooms in deterministic order
		const sortedRooms = [...rooms].sort((a, b) => a.id - b.id);
		for (const room of sortedRooms) {
			const roomData = `${room.x},${room.y},${room.width},${room.height},${room.type}`;
			hash = this.updateHash(hash, roomData);
		}

		// Hash connections in deterministic order
		const sortedConnections = [...connections].sort(
			(a, b) => a.from.id - b.from.id || a.to.id - b.to.id
		);
		for (const connection of sortedConnections) {
			const connectionData = `${connection.from.id}-${connection.to.id}`;
			hash = this.updateHash(hash, connectionData);
		}

		// Include configuration hash for complete determinism
		const configData = `${this.cellularConfig.automaton.wallProbability},${this.cellularConfig.automaton.iterations}`;
		hash = this.updateHash(hash, configData);

		return Math.abs(hash >>> 0).toString(36);
	}

	/**
	 * Update hash incrementally using djb2 algorithm
	 */
	private updateHash(currentHash: number, data: string): number {
		let hash = currentHash;
		for (let i = 0; i < data.length; i++) {
			const char = data.charCodeAt(i);
			hash = (hash * 33) ^ char;
		}
		return hash;
	}

	/**
	 * Yield control to prevent blocking the event loop
	 */
	private async yield(): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, 0));
	}

	/**
	 * Get grid representation for debugging/visualization
	 */
	getGridRepresentation(): boolean[][] {
		const grid = this.generateCellularGrid();
		return grid.toBooleanGrid();
	}

	/**
	 * Get detailed generation statistics
	 */
	getGenerationStats() {
		const grid = this.generateCellularGrid();
		const caverns = this.analyzeCaverns(grid);
		const stats = this.cavernAnalyzer.generateCavernStatistics(caverns);

		return {
			gridSize: {
				width: this.config.width,
				height: this.config.height,
				totalCells: this.config.width * this.config.height,
			},
			caverns: {
				total: stats.totalCaverns,
				totalFloorArea: stats.totalFloorArea,
				averageSize: Math.round(stats.averageCavernSize),
				largest: stats.largestCavernSize,
				smallest: stats.smallestCavernSize,
				averageAspectRatio: stats.averageAspectRatio.toFixed(2),
			},
			configuration: {
				variant: this.cellularConfig.variant,
				wallProbability: this.cellularConfig.automaton.wallProbability,
				iterations: this.cellularConfig.automaton.iterations,
				minCavernSize: this.cellularConfig.caverns.minCavernSize,
				roomCount: this.cellularConfig.rooms.roomCount,
			},
		};
	}
}
