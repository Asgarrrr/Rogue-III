import { DungeonError } from "@rogue/contracts";
import { CellType, type Grid, type Region } from "../../../core/grid";
import type { DungeonConfig, DungeonSeed } from "../../../core/types";
import {
  type ConnectionImpl,
  DungeonImpl,
  type RoomImpl,
} from "../../../entities";
import {
  getInvariantSummary,
  validateDungeonInvariants,
} from "../../../validation";
import { DungeonGenerator } from "../../base/dungeon-generator";
import {
  type GenContext,
  type Pipeline,
  PipelineRunner,
  type PipelineStep,
} from "../../pipeline";
import {
  type AutomatonConfig,
  AutomatonRules,
  DEFAULT_AUTOMATON_CONFIG,
} from "./automaton-rules";
import {
  type CavernAnalysisConfig,
  CavernAnalyzer,
  DEFAULT_CAVERN_CONFIG,
} from "./cavern-analyzer";
import {
  DEFAULT_PATHFINDING_CONFIG,
  PathFinder,
  type PathfindingConfig,
} from "./path-finder";
import {
  DEFAULT_ROOM_PLACEMENT_CONFIG,
  type RoomPlacementConfig,
  RoomPlacer,
} from "./room-placer";

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
      this.layoutRng,
    );
    this.cavernAnalyzer = new CavernAnalyzer(this.cellularConfig.caverns);
    this.roomPlacer = new RoomPlacer(this.cellularConfig.rooms, this.roomsRng);
    this.pathFinder = new PathFinder(this.cellularConfig.pathfinding);
  }

  /**
   * Generate dungeon synchronously
   */
  generate(): DungeonImpl {
    const { grid, rooms, connections } = this.runPipeline();
    const safeRooms = Array.isArray(rooms) ? rooms : [];
    const safeConnections = Array.isArray(connections) ? connections : [];

    const checksum = this.calculateChecksum(safeRooms, safeConnections);
    const dungeon = new DungeonImpl({
      rooms: safeRooms,
      connections: safeConnections,
      config: this.config,
      seeds: this.seeds,
      checksum,
      grid: grid.toBooleanGrid(),
    });

    const validation = validateDungeonInvariants(dungeon);
    if (!validation.valid) {
      throw DungeonError.generationFailed(
        "Dungeon failed invariant validation",
        {
          violations: validation.violations,
          summary: getInvariantSummary(validation),
        },
      );
    }

    return dungeon;
  }

  /**
   * Generate dungeon asynchronously with progress tracking
   */
  async generateAsync(
    onProgress?: (progress: number) => void,
    signal?: AbortSignal,
  ): Promise<DungeonImpl> {
    let currentProgress = 0;

    const updateProgress = (increment: number) => {
      currentProgress += increment;
      onProgress?.(Math.min(currentProgress, 100));
    };

    // Start with initial progress report
    onProgress?.(0);
    this.throwIfAborted(signal);

    // Phase 1: Generate and evolve cellular grid (30%)
    const grid = this.generateCellularGrid();
    this.throwIfAborted(signal);
    updateProgress(30);
    await this.yield(signal);

    // Phase 2: Analyze cavern structure (25%)
    const caverns = this.analyzeCaverns(grid);
    this.throwIfAborted(signal);
    updateProgress(25);
    await this.yield(signal);

    // Phase 3: Place rooms in suitable caverns (25%)
    const rooms = this.placeRooms(caverns, grid);
    this.throwIfAborted(signal);
    updateProgress(25);
    await this.yield(signal);

    // Phase 4: Create connections between rooms (15%)
    const connections = this.createConnections(rooms, grid);
    this.throwIfAborted(signal);
    updateProgress(10);
    await this.yield(signal);

    // Phase 4.5: Carve rooms and paths into the grid for navigation (5%)
    this.integrateRoomsAndPathsIntoGrid(rooms, connections, grid);
    updateProgress(5);
    await this.yield(signal);

    // Phase 5: Generate final dungeon (5%)
    const checksum = this.calculateChecksum(rooms, connections);
    this.throwIfAborted(signal);
    const dungeon = new DungeonImpl({
      rooms,
      connections,
      config: this.config,
      seeds: this.seeds,
      checksum,
      grid: grid.toBooleanGrid(),
    });
    updateProgress(5);

    const validation = validateDungeonInvariants(dungeon);
    if (!validation.valid) {
      throw DungeonError.generationFailed(
        "Dungeon failed invariant validation",
        {
          violations: validation.violations,
          summary: getInvariantSummary(validation),
        },
      );
    }

    this.throwIfAborted(signal);

    return dungeon;
  }

  /**
   * Generate and evolve the cellular automaton grid
   */
  private generateCellularGrid(): Grid {
    // Initialize with random noise
    let grid = this.automatonRules.initializeGrid(
      this.config.width,
      this.config.height,
    );

    // Apply cellular automaton evolution
    grid = this.automatonRules.evolveGrid(grid);

    // Apply variant-specific rules
    if (this.cellularConfig.variant !== "standard") {
      grid = this.automatonRules.applyVariantRules(
        grid,
        this.cellularConfig.variant,
      );
    }

    // Post-process if enabled
    if (this.cellularConfig.postProcessing) {
      grid = this.automatonRules.postProcess(grid);
    }

    return grid;
  }

  /**
   * Pipeline adapter: run the existing phases through a simple pipeline runner
   */
  private runPipeline(): {
    grid: Grid;
    caverns: Region[];
    rooms: RoomImpl[];
    connections: ConnectionImpl[];
  } {
    const steps: PipelineStep[] = [];
    let grid!: Grid;
    let caverns!: Region[];
    let rooms!: RoomImpl[];
    let connections!: ConnectionImpl[];

    steps.push({
      id: "cellular.grid",
      io: { reads: [], writes: ["grid.base"] },
      run: (ctx) => {
        grid = this.generateCellularGrid();
        // expose in context for future composed pipelines
        ctx.grid.base = grid;
      },
    });

    steps.push({
      id: "cellular.caverns",
      io: { reads: ["grid.base"], writes: ["graphs.regions"] },
      dependsOn: ["cellular.grid"],
      run: (ctx) => {
        caverns = this.analyzeCaverns(grid);
        ctx.graphs.regions = caverns;
      },
    });

    steps.push({
      id: "cellular.rooms",
      io: { reads: ["graphs.regions"], writes: ["graphs.rooms"] },
      dependsOn: ["cellular.caverns"],
      run: (ctx) => {
        rooms = this.placeRooms(caverns, grid);
        ctx.graphs.rooms = rooms;
      },
    });

    steps.push({
      id: "cellular.paths",
      io: {
        reads: ["graphs.rooms", "grid.base"],
        writes: ["graphs.connections"],
      },
      dependsOn: ["cellular.rooms"],
      run: (ctx) => {
        connections = this.createConnections(rooms, grid);
        ctx.graphs.connections = connections;
      },
    });

    // Compose: carve rooms and paths onto the base grid so downstream steps use the navigable map
    steps.push({
      id: "cellular.compose",
      io: {
        reads: ["grid.base", "graphs.rooms", "graphs.connections"],
        writes: ["grid.base"],
      },
      dependsOn: ["cellular.paths"],
      run: (ctx) => {
        this.integrateRoomsAndPathsIntoGrid(rooms, connections, grid);
        ctx.grid.base = grid;
      },
    });

    // Validate and collect metrics for debugging/QA
    steps.push({
      id: "cellular.validate",
      io: {
        reads: ["grid.base", "graphs.rooms", "graphs.connections"],
        writes: [],
      },
      dependsOn: ["cellular.compose"],
      run: (ctx) => {
        const width = this.config.width;
        const height = this.config.height;
        const index = (x: number, y: number) => y * width + x;
        const isFloor = (x: number, y: number) =>
          grid.getCell(x, y) === CellType.FLOOR;
        const visited = new Uint8Array(width * height);
        const qx: number[] = [];
        const qy: number[] = [];

        let reachableRooms = 0;
        if (rooms.length > 0) {
          const sx = Math.floor(rooms[0].centerX);
          const sy = Math.floor(rooms[0].centerY);
          if (isFloor(sx, sy)) {
            visited[index(sx, sy)] = 1;
            qx.push(sx);
            qy.push(sy);
          }

          for (let qi = 0; qi < qx.length; qi++) {
            const cx = qx[qi];
            const cy = qy[qi];
            // 4-neighbors
            if (cx > 0) {
              const nx = cx - 1,
                ny = cy;
              const idx = index(nx, ny);
              if (!visited[idx] && isFloor(nx, ny)) {
                visited[idx] = 1;
                qx.push(nx);
                qy.push(ny);
              }
            }
            if (cx + 1 < width) {
              const nx = cx + 1,
                ny = cy;
              const idx = index(nx, ny);
              if (!visited[idx] && isFloor(nx, ny)) {
                visited[idx] = 1;
                qx.push(nx);
                qy.push(ny);
              }
            }
            if (cy > 0) {
              const nx = cx,
                ny = cy - 1;
              const idx = index(nx, ny);
              if (!visited[idx] && isFloor(nx, ny)) {
                visited[idx] = 1;
                qx.push(nx);
                qy.push(ny);
              }
            }
            if (cy + 1 < height) {
              const nx = cx,
                ny = cy + 1;
              const idx = index(nx, ny);
              if (!visited[idx] && isFloor(nx, ny)) {
                visited[idx] = 1;
                qx.push(nx);
                qy.push(ny);
              }
            }
          }

          for (const r of rooms) {
            const rx = Math.floor(r.centerX);
            const ry = Math.floor(r.centerY);
            reachableRooms += visited[index(rx, ry)] ? 1 : 0;
          }
        }

        const validation = {
          totalRooms: rooms.length,
          reachableRooms,
          allRoomsReachable:
            rooms.length === 0 ? true : reachableRooms === rooms.length,
          connections: connections.length,
        };
        ctx.meta.set("validation", validation);
      },
    });

    const pipeline: Pipeline = { steps };
    const ctx: GenContext = {
      grid: { base: undefined as unknown as Grid, layers: new Map() },
      graphs: { rooms: [], connections: [], regions: [] },
      config: this.config,
      meta: new Map(),
    };

    const runner = new PipelineRunner(pipeline);
    // Run synchronously (steps are sync today)
    runner.runSync(ctx as unknown as GenContext);
    return { grid, caverns, rooms, connections };
  }

  /**
   * Analyze cavern structure using Union-Find
   */
  private analyzeCaverns(grid: Grid): Region[] {
    // Use Union-Find for maximum performance
    const caverns = this.cavernAnalyzer.findCavernsUnionFind(grid);

    // Filter caverns suitable for room placement
    const suitableCaverns = this.cavernAnalyzer.findRoomSuitableCaverns(
      caverns,
      this.cellularConfig.rooms.minRoomSize,
    );

    return suitableCaverns as Region[];
  }

  /**
   * Place rooms in suitable caverns using spatial hashing
   */
  private placeRooms(caverns: Region[], grid: Grid) {
    const rooms = this.roomPlacer.placeRooms(caverns, grid);

    // Optional: Optimize placement using simulated annealing
    if (
      rooms.length > 0 &&
      rooms.length < this.cellularConfig.rooms.roomCount
    ) {
      return this.roomPlacer.optimizeRoomPlacement(rooms, caverns, grid);
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
   * Integrate rooms and connection paths into the grid to create walkable areas
   */
  private integrateRoomsAndPathsIntoGrid(
    rooms: RoomImpl[],
    connections: ConnectionImpl[],
    grid: Grid,
  ): void {
    // First, carve all rooms into the grid
    for (const room of rooms) {
      for (let y = room.y; y < room.y + room.height; y++) {
        for (let x = room.x; x < room.x + room.width; x++) {
          if (grid.isInBounds(x, y)) {
            grid.setCell(x, y, CellType.FLOOR);
          }
        }
      }
    }

    // Then, carve all connection paths into the grid with corridor width
    for (const connection of connections) {
      for (const point of connection.path) {
        const x = Math.floor(point.x);
        const y = Math.floor(point.y);
        const radius = Math.max(
          0,
          Math.floor((this.cellularConfig.pathfinding.corridorWidth - 1) / 2),
        );
        for (let dy = -radius; dy <= radius; dy++) {
          for (let dx = -radius; dx <= radius; dx++) {
            const cx = x + dx;
            const cy = y + dy;
            if (grid.isInBounds(cx, cy)) {
              grid.setCell(cx, cy, CellType.FLOOR);
            }
          }
        }
      }
    }
  }

  /**
   * Calculate deterministic checksum for the dungeon
   */
  private calculateChecksum(
    rooms: RoomImpl[],
    connections: ConnectionImpl[],
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
      (a, b) => a.from.id - b.from.id || a.to.id - b.to.id,
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
