/**
 * Generator Chaining
 *
 * Enables composing generators and adding post-processing transformations.
 *
 * @example
 * ```typescript
 * import { chain, transform, postProcess } from "@rogue/procgen-v2";
 *
 * // Chain generators with transformations
 * const result = chain(config)
 *   .useGenerator("bsp")
 *   .transform(addDoors)
 *   .transform(addTraps)
 *   .run();
 *
 * // Use transformers
 * const enhanced = transform(dungeon)
 *   .mapRooms(room => ({ ...room, type: categorizeRoom(room) }))
 *   .filterConnections(c => c.path.length < 20)
 *   .addSpawns(generateDecorations)
 *   .build();
 * ```
 */

import { type DungeonSeed, SeededRandom } from "@rogue/contracts";
import type {
  Connection,
  DungeonArtifact,
  GenerationConfig,
  Generator,
  PipelineOptions,
  PipelineResult,
  Room,
  RoomType,
  SpawnPoint,
} from "./types";
import { createEmptyArtifact } from "./types";

// =============================================================================
// POST-PROCESSORS
// =============================================================================

/**
 * Post-processor function type
 */
export type PostProcessor = (
  dungeon: DungeonArtifact,
  seed: DungeonSeed,
) => DungeonArtifact;

/**
 * Async post-processor function type
 */
export type AsyncPostProcessor = (
  dungeon: DungeonArtifact,
  seed: DungeonSeed,
) => Promise<DungeonArtifact>;

// =============================================================================
// TRANSFORMER BUILDER
// =============================================================================

/**
 * Room transformer function
 */
export type RoomTransformer = (room: Room, index: number) => Room;

/**
 * Room filter function
 */
export type RoomFilter = (room: Room, index: number) => boolean;

/**
 * Connection transformer function
 */
export type ConnectionTransformer = (
  connection: Connection,
  index: number,
) => Connection;

/**
 * Connection filter function
 */
export type ConnectionFilter = (
  connection: Connection,
  index: number,
) => boolean;

/**
 * Spawn generator function
 */
export type SpawnGenerator = (
  dungeon: DungeonArtifact,
  seed: DungeonSeed,
) => readonly SpawnPoint[];

/**
 * Transformer builder for fluent dungeon modifications
 */
export class DungeonTransformer {
  private dungeon: DungeonArtifact;
  private readonly seed: DungeonSeed;

  constructor(dungeon: DungeonArtifact, seed?: DungeonSeed) {
    this.dungeon = dungeon;
    this.seed = seed ?? dungeon.seed;
  }

  /**
   * Transform all rooms
   */
  mapRooms(transformer: RoomTransformer): this {
    const newRooms = this.dungeon.rooms.map(transformer);
    this.dungeon = { ...this.dungeon, rooms: newRooms };
    return this;
  }

  /**
   * Filter rooms
   */
  filterRooms(predicate: RoomFilter): this {
    const newRooms = this.dungeon.rooms.filter(predicate);
    this.dungeon = { ...this.dungeon, rooms: newRooms };
    return this;
  }

  /**
   * Set room type by predicate
   */
  setRoomTypes(predicate: (room: Room) => boolean, type: RoomType): this {
    return this.mapRooms((room) =>
      predicate(room) ? { ...room, type } : room,
    );
  }

  /**
   * Transform all connections
   */
  mapConnections(transformer: ConnectionTransformer): this {
    const newConnections = this.dungeon.connections.map(transformer);
    this.dungeon = { ...this.dungeon, connections: newConnections };
    return this;
  }

  /**
   * Filter connections
   */
  filterConnections(predicate: ConnectionFilter): this {
    const newConnections = this.dungeon.connections.filter(predicate);
    this.dungeon = { ...this.dungeon, connections: newConnections };
    return this;
  }

  /**
   * Add additional spawn points
   */
  addSpawns(generator: SpawnGenerator): this {
    const newSpawns = generator(this.dungeon, this.seed);
    this.dungeon = {
      ...this.dungeon,
      spawns: [...this.dungeon.spawns, ...newSpawns],
    };
    return this;
  }

  /**
   * Filter spawn points
   */
  filterSpawns(predicate: (spawn: SpawnPoint, index: number) => boolean): this {
    const newSpawns = this.dungeon.spawns.filter(predicate);
    this.dungeon = { ...this.dungeon, spawns: newSpawns };
    return this;
  }

  /**
   * Apply a post-processor function
   */
  apply(processor: PostProcessor): this {
    this.dungeon = processor(this.dungeon, this.seed);
    return this;
  }

  /**
   * Build the final dungeon
   */
  build(): DungeonArtifact {
    return this.dungeon;
  }
}

/**
 * Create a dungeon transformer for fluent modifications
 */
export function transform(
  dungeon: DungeonArtifact,
  seed?: DungeonSeed,
): DungeonTransformer {
  return new DungeonTransformer(dungeon, seed);
}

// =============================================================================
// GENERATOR CHAIN BUILDER
// =============================================================================

/**
 * Generator registry type (will be passed in)
 */
type GeneratorRegistry = Record<string, Generator>;

/**
 * Chain builder for composing generators with post-processors
 */
export class GeneratorChainBuilder {
  private readonly config: GenerationConfig;
  private readonly generators: GeneratorRegistry;
  private generatorId: string | null = null;
  private postProcessors: PostProcessor[] = [];
  private asyncPostProcessors: AsyncPostProcessor[] = [];

  constructor(config: GenerationConfig, generators: GeneratorRegistry) {
    this.config = config;
    this.generators = generators;
  }

  /**
   * Select the generator to use
   */
  useGenerator(id: string): this {
    if (!this.generators[id]) {
      throw new Error(`Unknown generator: ${id}`);
    }
    this.generatorId = id;
    return this;
  }

  /**
   * Add a synchronous post-processor
   */
  transform(processor: PostProcessor): this {
    this.postProcessors.push(processor);
    return this;
  }

  /**
   * Add an async post-processor
   */
  transformAsync(processor: AsyncPostProcessor): this {
    this.asyncPostProcessors.push(processor);
    return this;
  }

  /**
   * Convenience: Add doors to connections
   */
  addDoors(
    doorPlacer: (conn: Connection, dungeon: DungeonArtifact) => SpawnPoint[],
  ): this {
    return this.transform((dungeon, _seed) => {
      const doorSpawns: SpawnPoint[] = [];
      for (const conn of dungeon.connections) {
        doorSpawns.push(...doorPlacer(conn, dungeon));
      }
      return {
        ...dungeon,
        spawns: [...dungeon.spawns, ...doorSpawns],
      };
    });
  }

  /**
   * Convenience: Add decorations to rooms
   */
  addDecorations(
    decorator: (room: Room, dungeon: DungeonArtifact) => SpawnPoint[],
  ): this {
    return this.transform((dungeon, _seed) => {
      const decorations: SpawnPoint[] = [];
      for (const room of dungeon.rooms) {
        decorations.push(...decorator(room, dungeon));
      }
      return {
        ...dungeon,
        spawns: [...dungeon.spawns, ...decorations],
      };
    });
  }

  /**
   * Run the chain synchronously
   */
  run(
    options?: Omit<PipelineOptions, "signal">,
  ): PipelineResult<DungeonArtifact> {
    const id = this.generatorId ?? this.config.algorithm ?? "bsp";
    const generator = this.generators[id];

    if (!generator) {
      return {
        success: false,
        error: new Error(`Unknown generator: ${id}`),
        durationMs: 0,
      };
    }

    const startTime = performance.now();
    const pipeline = generator.createPipeline(this.config);
    const result = pipeline.runSync(
      createEmptyArtifact(),
      this.config.seed,
      options,
    );

    if (!result.success || !result.artifact) {
      return result;
    }

    // Apply sync post-processors
    let artifact = result.artifact;
    try {
      for (const processor of this.postProcessors) {
        artifact = processor(artifact, this.config.seed);
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        durationMs: performance.now() - startTime,
      };
    }

    return {
      ...result,
      artifact,
      durationMs: performance.now() - startTime,
    };
  }

  /**
   * Run the chain asynchronously
   */
  async runAsync(
    options?: PipelineOptions,
  ): Promise<PipelineResult<DungeonArtifact>> {
    const id = this.generatorId ?? this.config.algorithm ?? "bsp";
    const generator = this.generators[id];

    if (!generator) {
      return {
        success: false,
        error: new Error(`Unknown generator: ${id}`),
        durationMs: 0,
      };
    }

    const startTime = performance.now();
    const pipeline = generator.createPipeline(this.config);
    const result = await pipeline.run(
      createEmptyArtifact(),
      this.config.seed,
      options,
    );

    if (!result.success || !result.artifact) {
      return result;
    }

    // Apply sync post-processors first
    let artifact = result.artifact;
    try {
      for (const processor of this.postProcessors) {
        artifact = processor(artifact, this.config.seed);
      }

      // Then apply async post-processors
      for (const processor of this.asyncPostProcessors) {
        artifact = await processor(artifact, this.config.seed);
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        durationMs: performance.now() - startTime,
      };
    }

    return {
      ...result,
      artifact,
      durationMs: performance.now() - startTime,
    };
  }
}

// =============================================================================
// CHAIN FACTORY - Created in index.ts with access to generators
// =============================================================================

/**
 * Create a chain factory function (used internally with generator registry)
 */
export function createChainFactory(
  generators: GeneratorRegistry,
): (config: GenerationConfig) => GeneratorChainBuilder {
  return (config: GenerationConfig) =>
    new GeneratorChainBuilder(config, generators);
}

// =============================================================================
// COMMON POST-PROCESSORS
// =============================================================================

/**
 * Add random treasure spawns to rooms
 */
export function createTreasureProcessor(
  treasureChance: number = 0.3,
): PostProcessor {
  return (dungeon, seed) => {
    const newSpawns: SpawnPoint[] = [];
    const rng = new SeededRandom(seed.details);

    for (const room of dungeon.rooms) {
      const roll = rng.next();

      if (roll < treasureChance && room.type !== "entrance") {
        newSpawns.push({
          position: { x: room.centerX, y: room.centerY },
          roomId: room.id,
          type: "treasure",
          tags: ["generated"],
          weight: 1,
          distanceFromStart: 0,
        });
      }
    }

    return {
      ...dungeon,
      spawns: [...dungeon.spawns, ...newSpawns],
    };
  };
}

/**
 * Add enemy spawns based on room distance from entrance
 */
export function createEnemyProcessor(
  baseEnemies: number = 1,
  maxEnemies: number = 5,
): PostProcessor {
  return (dungeon, seed) => {
    const newSpawns: SpawnPoint[] = [];
    const entrance = dungeon.spawns.find((s) => s.type === "entrance");
    if (!entrance) return dungeon;

    // Find entrance room
    const entranceRoom = dungeon.rooms.find((r) => r.id === entrance.roomId);
    if (!entranceRoom) return dungeon;

    const rng = new SeededRandom(seed.details);

    for (const room of dungeon.rooms) {
      if (room.id === entranceRoom.id) continue;

      // Calculate rough distance
      const dx = room.centerX - entranceRoom.centerX;
      const dy = room.centerY - entranceRoom.centerY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const normalizedDist = Math.min(dist / 100, 1);

      // More enemies further from entrance
      const enemyCount = Math.min(
        maxEnemies,
        Math.floor(baseEnemies + normalizedDist * (maxEnemies - baseEnemies)),
      );

      for (let i = 0; i < enemyCount; i++) {
        // Generate random offset within room using SeededRandom
        const ox = Math.floor(rng.next() * room.width) - Math.floor(room.width / 2);
        const oy = Math.floor(rng.next() * room.height) - Math.floor(room.height / 2);

        newSpawns.push({
          position: {
            x: room.centerX + Math.floor(ox / 2),
            y: room.centerY + Math.floor(oy / 2),
          },
          roomId: room.id,
          type: "enemy",
          tags: ["generated"],
          weight: 1 + normalizedDist,
          distanceFromStart: dist,
        });
      }
    }

    return {
      ...dungeon,
      spawns: [...dungeon.spawns, ...newSpawns],
    };
  };
}

/**
 * Mark rooms at dead-ends as treasure rooms
 */
export function createDeadEndTreasureProcessor(): PostProcessor {
  return (dungeon, _seed) => {
    // Count connections per room
    const connectionCount = new Map<number, number>();
    for (const room of dungeon.rooms) {
      connectionCount.set(room.id, 0);
    }
    for (const conn of dungeon.connections) {
      connectionCount.set(
        conn.fromRoomId,
        (connectionCount.get(conn.fromRoomId) ?? 0) + 1,
      );
      connectionCount.set(
        conn.toRoomId,
        (connectionCount.get(conn.toRoomId) ?? 0) + 1,
      );
    }

    // Mark dead-ends as treasure rooms
    const entrance = dungeon.spawns.find((s) => s.type === "entrance");
    const exit = dungeon.spawns.find((s) => s.type === "exit");

    const newRooms = dungeon.rooms.map((room) => {
      const count = connectionCount.get(room.id) ?? 0;
      const isDeadEnd = count === 1;
      const isEntrance = room.id === entrance?.roomId;
      const isExit = room.id === exit?.roomId;

      if (isDeadEnd && !isEntrance && !isExit && room.type === "normal") {
        return { ...room, type: "treasure" as const };
      }
      return room;
    });

    return { ...dungeon, rooms: newRooms };
  };
}
