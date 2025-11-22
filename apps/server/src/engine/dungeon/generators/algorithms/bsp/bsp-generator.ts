/**
 * BSP Dungeon Generator
 *
 * Generates dungeons using Binary Space Partitioning.
 * The algorithm recursively divides the dungeon space into smaller regions,
 * places rooms within leaf nodes, and connects them with corridors.
 *
 * Features:
 * - Deterministic generation with seed-based RNG
 * - Pipeline-based architecture for extensibility
 * - Configurable partitioning, room placement, and corridor styles
 * - Async generation with progress tracking
 */

import { CellType, Grid } from "../../../core/grid";
import type { DungeonConfig, DungeonSeed } from "../../../core/types";
import { ConnectionImpl } from "../../../entities/connection";
import { DungeonImpl } from "../../../entities/dungeon";
import type { RoomImpl } from "../../../entities/room";
import { DungeonGenerator } from "../../base/dungeon-generator";
import type { PipelineStep } from "../../pipeline";

import {
  type BspGeneratorConfig,
  type BspLeaf,
  type BspNode,
  DEFAULT_BSP_CONFIG,
} from "./config";
import { BspCorridorCarver } from "./corridor-carver";
import { BspPartitioner } from "./partitioner";
import { BspRoomPlacer } from "./room-placer";

/**
 * BSP Dungeon Generator implementation.
 *
 * Uses a modular pipeline architecture:
 * 1. Partition space into BSP tree
 * 2. Place rooms in leaf nodes
 * 3. Create corridor connections
 * 4. Carve into grid
 */
export class BSPGenerator extends DungeonGenerator {
  private readonly bspConfig: BspGeneratorConfig;
  private readonly partitioner: BspPartitioner;
  private readonly roomPlacer: BspRoomPlacer;
  private readonly corridorCarver: BspCorridorCarver;

  constructor(
    config: DungeonConfig,
    seeds: DungeonSeed,
    bspConfig: BspGeneratorConfig = DEFAULT_BSP_CONFIG,
  ) {
    super(config, seeds);
    this.bspConfig = bspConfig;

    // Initialize components with isolated RNGs
    this.partitioner = new BspPartitioner(bspConfig.partition, this.layoutRng);
    this.roomPlacer = new BspRoomPlacer(bspConfig.rooms, this.roomsRng);
    this.corridorCarver = new BspCorridorCarver(
      bspConfig.corridors,
      this.connectionsRng,
    );
  }

  /**
   * Generate dungeon synchronously.
   */
  generate(): DungeonImpl {
    // Create initial grid filled with walls
    const grid = new Grid(
      { width: this.config.width, height: this.config.height },
      CellType.WALL,
    );

    // Phase 1: Partition space
    const bspTree = this.partitioner.partition(
      this.config.width,
      this.config.height,
    );
    const leaves = this.partitioner.collectLeaves(bspTree);
    const siblingPairs = this.partitioner.findSiblingPairs(bspTree);

    // Phase 2: Place rooms in leaves
    const rooms = this.roomPlacer.placeRooms(leaves);

    // Phase 3: Create connections
    const connections = this.corridorCarver.createConnections(
      rooms,
      siblingPairs,
      grid,
    );

    // Phase 4: Carve into grid
    this.carveRoomsIntoGrid(rooms, grid);
    this.carveCorridorsIntoGrid(connections, grid);

    // Calculate checksum for determinism validation
    const checksum = this.calculateChecksum(rooms, connections);

    return new DungeonImpl({
      rooms,
      connections,
      config: this.config,
      seeds: this.seeds,
      checksum,
      grid: grid.toBooleanGrid(),
    });
  }

  /**
   * Generate dungeon asynchronously with progress tracking.
   */
  async generateAsync(
    onProgress?: (progress: number) => void,
  ): Promise<DungeonImpl> {
    const updateProgress = (percent: number) => {
      onProgress?.(Math.min(100, percent));
    };

    updateProgress(0);

    // Create initial grid filled with walls
    const grid = new Grid(
      { width: this.config.width, height: this.config.height },
      CellType.WALL,
    );
    updateProgress(5);
    await this.yield();

    // Phase 1: Partition space (20%)
    const bspTree = this.partitioner.partition(
      this.config.width,
      this.config.height,
    );
    const leaves = this.partitioner.collectLeaves(bspTree);
    const siblingPairs = this.partitioner.findSiblingPairs(bspTree);
    updateProgress(25);
    await this.yield();

    // Phase 2: Place rooms (25%)
    const rooms = this.roomPlacer.placeRooms(leaves);
    updateProgress(50);
    await this.yield();

    // Phase 3: Create connections (20%)
    const connections = this.corridorCarver.createConnections(
      rooms,
      siblingPairs,
      grid,
    );
    updateProgress(70);
    await this.yield();

    // Phase 4: Carve into grid (25%)
    this.carveRoomsIntoGrid(rooms, grid);
    updateProgress(85);
    await this.yield();

    this.carveCorridorsIntoGrid(connections, grid);
    updateProgress(95);
    await this.yield();

    // Calculate checksum
    const checksum = this.calculateChecksum(rooms, connections);
    updateProgress(100);

    return new DungeonImpl({
      rooms,
      connections,
      config: this.config,
      seeds: this.seeds,
      checksum,
      grid: grid.toBooleanGrid(),
    });
  }

  /**
   * Create pipeline steps for this generator.
   * Useful for debugging and future parallelization.
   */
  createPipelineSteps(): PipelineStep[] {
    const steps: PipelineStep[] = [];

    steps.push({
      id: "bsp.partition",
      io: { reads: [], writes: ["bsp.tree", "bsp.leaves", "bsp.siblings"] },
      run: (ctx) => {
        const grid = new Grid(
          { width: this.config.width, height: this.config.height },
          CellType.WALL,
        );
        ctx.grid.base = grid;

        const tree = this.partitioner.partition(
          this.config.width,
          this.config.height,
        );
        ctx.meta.set("bsp.tree", tree);
        ctx.meta.set("bsp.leaves", this.partitioner.collectLeaves(tree));
        ctx.meta.set("bsp.siblings", this.partitioner.findSiblingPairs(tree));
      },
    });

    steps.push({
      id: "bsp.rooms",
      io: { reads: ["bsp.leaves"], writes: ["graphs.rooms"] },
      dependsOn: ["bsp.partition"],
      run: (ctx) => {
        const leaves = ctx.meta.get("bsp.leaves") as BspLeaf[];
        const rooms = this.roomPlacer.placeRooms(leaves);
        ctx.graphs.rooms = rooms;
      },
    });

    steps.push({
      id: "bsp.corridors",
      io: {
        reads: ["graphs.rooms", "bsp.siblings", "grid.base"],
        writes: ["graphs.connections"],
      },
      dependsOn: ["bsp.rooms"],
      run: (ctx) => {
        const rooms = ctx.graphs.rooms;
        const siblings = ctx.meta.get("bsp.siblings") as Array<[BspLeaf, BspLeaf]>;
        const grid = ctx.grid.base;
        const connections = this.corridorCarver.createConnections(
          rooms,
          siblings,
          grid,
        );
        ctx.graphs.connections = connections;
      },
    });

    steps.push({
      id: "bsp.carve",
      io: {
        reads: ["grid.base", "graphs.rooms", "graphs.connections"],
        writes: ["grid.base"],
      },
      dependsOn: ["bsp.corridors"],
      run: (ctx) => {
        const grid = ctx.grid.base;
        const rooms = ctx.graphs.rooms;
        const connections = ctx.graphs.connections;
        this.carveRoomsIntoGrid(rooms, grid);
        this.carveCorridorsIntoGrid(connections, grid);
      },
    });

    return steps;
  }

  /**
   * Carve rooms into the grid as floor tiles.
   */
  private carveRoomsIntoGrid(rooms: RoomImpl[], grid: Grid): void {
    for (const room of rooms) {
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
   * Carve corridors into the grid as floor tiles.
   */
  private carveCorridorsIntoGrid(
    connections: ConnectionImpl[],
    grid: Grid,
  ): void {
    const corridorWidth = this.corridorCarver.corridorWidth;
    const halfWidth = Math.floor(corridorWidth / 2);

    for (const connection of connections) {
      for (const point of connection.path) {
        // Carve corridor with width
        for (let dy = -halfWidth; dy <= halfWidth; dy++) {
          for (let dx = -halfWidth; dx <= halfWidth; dx++) {
            const x = point.x + dx;
            const y = point.y + dy;
            if (grid.isInBounds(x, y)) {
              grid.setCell(x, y, CellType.FLOOR);
            }
          }
        }
      }
    }
  }

  /**
   * Calculate deterministic checksum for the dungeon.
   * Used for verifying generation reproducibility.
   */
  private calculateChecksum(
    rooms: RoomImpl[],
    connections: ConnectionImpl[],
  ): string {
    let hash = 5381; // djb2 initial value

    // Hash rooms in sorted order for determinism
    const sortedRooms = [...rooms].sort((a, b) => a.id - b.id);
    for (const room of sortedRooms) {
      const roomData = `${room.id},${room.x},${room.y},${room.width},${room.height},${room.type},${room.seed}`;
      hash = this.updateHash(hash, roomData);
    }

    // Hash connections in sorted order
    const sortedConnections = [...connections].sort(
      (a, b) => a.from.id - b.from.id || a.to.id - b.to.id,
    );
    for (const connection of sortedConnections) {
      const connData = `${connection.from.id}-${connection.to.id}:${connection.path.length}`;
      hash = this.updateHash(hash, connData);
    }

    // Include configuration in hash
    const configData = [
      this.config.width,
      this.config.height,
      this.bspConfig.partition.minPartitionSize,
      this.bspConfig.partition.maxDepth,
      this.bspConfig.rooms.minRoomRatio,
      this.bspConfig.corridors.algorithm,
    ].join(",");
    hash = this.updateHash(hash, configData);

    // Include seeds
    const seedData = `${this.seeds.primary},${this.seeds.layout},${this.seeds.rooms}`;
    hash = this.updateHash(hash, seedData);

    return Math.abs(hash >>> 0).toString(36);
  }

  /**
   * Update hash with additional data using djb2 algorithm.
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
   * Yield to event loop to prevent blocking.
   */
  private async yield(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 0));
  }
}

// Export components for external use
export { BspPartitioner } from "./partitioner";
export { BspRoomPlacer } from "./room-placer";
export { BspCorridorCarver } from "./corridor-carver";
export * from "./config";
