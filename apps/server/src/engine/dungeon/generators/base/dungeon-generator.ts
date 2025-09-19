import { SeededRandom } from "../../core/random/seeded-random";
import { DungeonConfig, DungeonSeed } from "../../core/types";
import { Dungeon } from "../../entities";

/**
 * Abstract base class for all dungeon generators.
 * Provides the core structure with multi-seed management for reproducible generation.
 *
 * This class ensures that dungeon generation is completely deterministic by using
 * separate seeded random number generators for different aspects of generation
 * idk if it's useful ^^"
 * (layout, rooms, connections, details).
 *
 * @abstract
 */
export abstract class DungeonGenerator {
  protected readonly seeds: DungeonSeed;
  protected readonly config: DungeonConfig;
  protected readonly layoutRng: SeededRandom;
  protected readonly roomsRng: SeededRandom;
  protected readonly connectionsRng: SeededRandom;
  protected readonly detailsRng: SeededRandom;

  private readonly initialStates: {
    layout: [number, number, number, number];
    rooms: [number, number, number, number];
    connections: [number, number, number, number];
    details: [number, number, number, number];
  };

  constructor(config: DungeonConfig, seeds: DungeonSeed) {
    this.config = config;
    this.seeds = seeds;

    // Each aspect uses its own PRNG instance for isolation
    this.layoutRng = new SeededRandom(seeds.layout);
    this.roomsRng = new SeededRandom(seeds.rooms);
    this.connectionsRng = new SeededRandom(seeds.connections);
    this.detailsRng = new SeededRandom(seeds.details);

    // Save initial states for determinism validation
    this.initialStates = {
      layout: this.layoutRng.getState(),
      rooms: this.roomsRng.getState(),
      connections: this.connectionsRng.getState(),
      details: this.detailsRng.getState(),
    };
  }

  /**
   * Generates a complete dungeon using the configured algorithm.
   * This method must be implemented by concrete generator classes.
   *
   * @returns A fully generated dungeon with rooms, connections, and metadata
   * @abstract
   */
  abstract generate(): Dungeon;

  /**
   * Generates a dungeon asynchronously with yielding for better responsiveness.
   * Default implementation falls back to synchronous generation.
   *
   * @param onProgress - Optional callback for progress updates (0-100)
   * @returns A promise that resolves to the generated dungeon
   */
  async generateAsync(
    onProgress?: (progress: number) => void,
  ): Promise<Dungeon> {
    // Default implementation — override in subclasses for async behavior
    const dungeon = this.generate();
    onProgress?.(100);
    return dungeon;
  }

  /**
   * Validates that the generation is deterministic by generating twice and comparing results.
   *
   * This method ensures that the generator produces identical results when called
   * multiple times with the same seeds, which is crucial for reproducible dungeons.
   *
   * @returns True if generation is deterministic, false otherwise
   */
  validateDeterminism(): boolean {
    const dungeon1 = this.generate();

    // Reset PRNGs to their initial state
    this.layoutRng.setState(this.initialStates.layout);
    this.roomsRng.setState(this.initialStates.rooms);
    this.connectionsRng.setState(this.initialStates.connections);
    this.detailsRng.setState(this.initialStates.details);

    const dungeon2 = this.generate();

    return this.compareDungeons(dungeon1, dungeon2);
  }

  /**
   * Compares two dungeons for equality (can be extended for more detailed comparison
   * but I dont need it for now)
   *
   * @param d1 - First dungeon to compare
   * @param d2 - Second dungeon to compare
   * @returns True if dungeons are identical, false otherwise
   */
  private compareDungeons(d1: Dungeon, d2: Dungeon): boolean {
    return d1.getChecksum() === d2.getChecksum();
  }
}
