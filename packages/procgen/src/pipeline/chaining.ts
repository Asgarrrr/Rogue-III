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

import type { DungeonSeed } from "@rogue/contracts";
import type {
  Connection,
  DungeonArtifact,
  GenerationConfig,
  Generator,
  PipelineFailure,
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
   * Common setup for running the chain
   * Returns either an error result or the generator and timing info
   */
  private setupChainExecution():
    | PipelineFailure
    | { success: true; generator: Generator; id: string; startTime: number } {
    const id = this.generatorId ?? this.config.algorithm ?? "bsp";
    const generator = this.generators[id];

    if (!generator) {
      return {
        success: false,
        error: new Error(`Unknown generator: ${id}`),
        trace: [],
        snapshots: [],
        durationMs: 0,
      };
    }

    return {
      success: true,
      generator,
      id,
      startTime: performance.now(),
    };
  }

  /**
   * Apply synchronous post-processors to an artifact
   */
  private applySyncProcessors(
    artifact: DungeonArtifact,
    startTime: number,
  ): PipelineResult<DungeonArtifact> | DungeonArtifact {
    try {
      let current = artifact;
      for (const processor of this.postProcessors) {
        current = processor(current, this.config.seed);
      }
      return current;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        trace: [],
        snapshots: [],
        durationMs: performance.now() - startTime,
      };
    }
  }

  /**
   * Apply asynchronous post-processors to an artifact
   */
  private async applyAsyncProcessors(
    artifact: DungeonArtifact,
    startTime: number,
  ): Promise<PipelineResult<DungeonArtifact> | DungeonArtifact> {
    try {
      let current = artifact;
      for (const processor of this.asyncPostProcessors) {
        current = await processor(current, this.config.seed);
      }
      return current;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error : new Error(String(error)),
        trace: [],
        snapshots: [],
        durationMs: performance.now() - startTime,
      };
    }
  }

  /**
   * Run the chain synchronously
   */
  run(
    options?: Omit<PipelineOptions, "signal">,
  ): PipelineResult<DungeonArtifact> {
    const setup = this.setupChainExecution();

    // Check if setup failed
    if ("success" in setup && !setup.success) {
      return setup;
    }

    // TypeScript now knows setup is the success case
    const pipeline = setup.generator.createPipeline(this.config);
    const result = pipeline.runSync(
      createEmptyArtifact(),
      this.config.seed,
      options,
    );

    if (!result.success || !result.artifact) {
      return result;
    }

    // Apply sync post-processors
    const processedArtifact = this.applySyncProcessors(
      result.artifact,
      setup.startTime,
    );

    // Check if processing failed
    if (
      typeof processedArtifact === "object" &&
      "success" in processedArtifact
    ) {
      return processedArtifact;
    }

    return {
      ...result,
      artifact: processedArtifact,
      durationMs: performance.now() - setup.startTime,
    };
  }

  /**
   * Run the chain asynchronously
   */
  async runAsync(
    options?: PipelineOptions,
  ): Promise<PipelineResult<DungeonArtifact>> {
    const setup = this.setupChainExecution();

    // Check if setup failed
    if ("success" in setup && !setup.success) {
      return setup;
    }

    // TypeScript now knows setup is the success case
    const pipeline = setup.generator.createPipeline(this.config);
    const result = await pipeline.run(
      createEmptyArtifact(),
      this.config.seed,
      options,
    );

    if (!result.success || !result.artifact) {
      return result;
    }

    // Apply sync post-processors first
    let processedArtifact = this.applySyncProcessors(
      result.artifact,
      setup.startTime,
    );

    // Check if sync processing failed
    if (
      typeof processedArtifact === "object" &&
      "success" in processedArtifact
    ) {
      return processedArtifact;
    }

    // Apply async post-processors
    processedArtifact = await this.applyAsyncProcessors(
      processedArtifact,
      setup.startTime,
    );

    // Check if async processing failed
    if (
      typeof processedArtifact === "object" &&
      "success" in processedArtifact
    ) {
      return processedArtifact;
    }

    return {
      ...result,
      artifact: processedArtifact,
      durationMs: performance.now() - setup.startTime,
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
