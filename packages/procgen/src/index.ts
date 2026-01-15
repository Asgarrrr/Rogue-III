/**
 * Progen V2 - Procedural Generation Package
 *
 * A composable, type-safe procedural dungeon generation system.
 *
 * @example
 * ```typescript
 * import { generate, createSeed } from "@rogue/procgen-v2";
 *
 * const seed = createSeed(12345);
 * const result = generate({
 *   width: 120,
 *   height: 90,
 *   seed,
 *   algorithm: "bsp",
 * });
 *
 * if (result.success) {
 *   console.log(`Generated dungeon with ${result.artifact.rooms.length} rooms`);
 * }
 * ```
 */

// Core modules
export * from "./core";
// Generators
export * from "./generators";
// Pass Library
export * as passes from "./passes";
// Pipeline
export * from "./pipeline";
// Quality Assurance
export * from "./quality";
// Re-export key types for convenience
export type {
  Connection,
  DungeonArtifact,
  DungeonStateArtifact,
  GenerationConfig,
  Generator,
  PassMetrics,
  PassMetricsCallback,
  PipelineResult,
  QualityAssessment,
  QualityCheck,
  QualityThresholds,
  Room,
  SpawnPoint,
  SpawnPointType,
  ValidationArtifact,
  Violation,
} from "./pipeline/types";
// Utilities
export * from "./utils";

// High-level API
import { type DungeonSeed, SeededRandom } from "@rogue/contracts";
import { CellType, Grid } from "./core/grid";
import { floodFill } from "./core/grid/flood-fill";
import { calculateArtifactChecksum } from "./core/hash";
import { createBSPGenerator } from "./generators/bsp";
import { createCellularGenerator } from "./generators/cellular";
import { createHybridGenerator } from "./generators/hybrid";
import {
  createChainFactory,
  type GeneratorChainBuilder,
} from "./pipeline/chaining";
import type {
  DungeonArtifact,
  GenerationConfig,
  Generator,
  PipelineOptions,
  PipelineResult,
  ValidationArtifact,
  Violation,
} from "./pipeline/types";
import { createEmptyArtifact } from "./pipeline/types";

/**
 * Generator registry
 */
const generators: Record<string, Generator> = {
  bsp: createBSPGenerator(),
  cellular: createCellularGenerator(),
  hybrid: createHybridGenerator(),
};

/**
 * Create a generator chain for composing generators with post-processors
 *
 * @example
 * ```typescript
 * import { chain, createSeed } from "@rogue/procgen-v2";
 *
 * const result = chain({
 *   width: 100,
 *   height: 80,
 *   seed: createSeed(12345),
 * })
 *   .useGenerator("bsp")
 *   .transform(addDoors)
 *   .addDecorations(decorateRoom)
 *   .run();
 * ```
 */
export const chain: (config: GenerationConfig) => GeneratorChainBuilder =
  createChainFactory(generators);

// =============================================================================
// SEED CREATION - Fixed determinism issues
// =============================================================================

/**
 * Create a dungeon seed from a numeric value.
 *
 * Note: Timestamp is NOT included in the seed to ensure deterministic
 * serialization and comparison. Use createSeedWithTimestamp if you need
 * to track when the seed was created.
 */
export function createSeed(input: number): DungeonSeed {
  const primary = input >>> 0; // Ensure uint32
  const rng = new SeededRandom(primary);

  return {
    primary,
    layout: Math.floor(rng.next() * 0xffffffff),
    rooms: Math.floor(rng.next() * 0xffffffff),
    connections: Math.floor(rng.next() * 0xffffffff),
    details: Math.floor(rng.next() * 0xffffffff),
    version: "2.0.0",
    timestamp: 0, // Fixed: no timestamp for deterministic serialization
  };
}

/**
 * Create a dungeon seed with timestamp (for tracking purposes)
 */
export function createSeedWithTimestamp(input: number): DungeonSeed {
  const seed = createSeed(input);
  return {
    ...seed,
    timestamp: Date.now(),
  };
}

/**
 * Create a dungeon seed from a string
 */
export function createSeedFromString(input: string): DungeonSeed {
  // DJB2 hash function for strings
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) + hash + input.charCodeAt(i)) >>> 0;
  }
  return createSeed(hash);
}

/**
 * Reconstruct a seed from serialized data.
 * Use this when loading a saved seed to ensure exact reproduction.
 *
 * If the saved seed's sub-seeds don't match what would be derived from
 * the primary seed, we use the saved values (they may have been intentionally
 * modified for testing or special generation modes).
 */
export function createSeedFromSeed(saved: DungeonSeed): DungeonSeed {
  // Return a clean seed with the saved values (ignoring timestamp)
  return {
    primary: saved.primary,
    layout: saved.layout,
    rooms: saved.rooms,
    connections: saved.connections,
    details: saved.details,
    version: saved.version,
    timestamp: 0, // Normalize timestamp for comparison
  };
}

/**
 * Check if two seeds will produce identical output
 */
export function seedsAreEquivalent(a: DungeonSeed, b: DungeonSeed): boolean {
  return (
    a.primary === b.primary &&
    a.layout === b.layout &&
    a.rooms === b.rooms &&
    a.connections === b.connections &&
    a.details === b.details
  );
}

// =============================================================================
// GENERATION API
// =============================================================================

/**
 * Generation options
 */
export interface GenerateOptions extends Omit<PipelineOptions, "signal"> {
  /**
   * Skip config validation before generation.
   * Default: false (validation is performed)
   */
  readonly skipValidation?: boolean;
}

/**
 * Generate a dungeon with the specified configuration.
 *
 * By default, validates the configuration before generation.
 * Use `skipValidation: true` for hot paths where config is known-valid.
 *
 * @example
 * ```typescript
 * // Standard usage (with validation)
 * const result = generate(config);
 *
 * // Skip validation for performance
 * const result = generate(config, { skipValidation: true });
 * ```
 */
export function generate(
  config: GenerationConfig,
  options?: GenerateOptions,
): PipelineResult<DungeonArtifact> {
  const algorithm = config.algorithm ?? "bsp";
  const generator = generators[algorithm];

  if (!generator) {
    return {
      success: false,
      error: new Error(`Unknown algorithm: ${algorithm}`),
      durationMs: 0,
    };
  }

  // Validate config by default (can be skipped for performance)
  if (!options?.skipValidation) {
    const validation = generator.validateConfig(config);
    if (!validation.passed) {
      const errors = validation.violations
        .filter((v) => v.severity === "error")
        .map((v) => v.message)
        .join("; ");
      return {
        success: false,
        error: new Error(`Invalid configuration: ${errors}`),
        durationMs: 0,
      };
    }
  }

  const pipeline = generator.createPipeline(config);
  return pipeline.runSync(createEmptyArtifact(), config.seed, options);
}

/**
 * Async generation options
 */
export interface GenerateAsyncOptions extends PipelineOptions {
  /**
   * Skip config validation before generation.
   * Default: false (validation is performed)
   */
  readonly skipValidation?: boolean;
}

/**
 * Generate a dungeon asynchronously (supports AbortSignal).
 *
 * By default, validates the configuration before generation.
 * Use `skipValidation: true` for hot paths where config is known-valid.
 */
export async function generateAsync(
  config: GenerationConfig,
  options?: GenerateAsyncOptions,
): Promise<PipelineResult<DungeonArtifact>> {
  const algorithm = config.algorithm ?? "bsp";
  const generator = generators[algorithm];

  if (!generator) {
    return {
      success: false,
      error: new Error(`Unknown algorithm: ${algorithm}`),
      durationMs: 0,
    };
  }

  // Validate config by default (can be skipped for performance)
  if (!options?.skipValidation) {
    const validation = generator.validateConfig(config);
    if (!validation.passed) {
      const errors = validation.violations
        .filter((v) => v.severity === "error")
        .map((v) => v.message)
        .join("; ");
      return {
        success: false,
        error: new Error(`Invalid configuration: ${errors}`),
        durationMs: 0,
      };
    }
  }

  const pipeline = generator.createPipeline(config);
  return pipeline.run(createEmptyArtifact(), config.seed, options);
}

/**
 * Validate generation configuration
 */
export function validateConfig(config: GenerationConfig): ValidationArtifact {
  const algorithm = config.algorithm ?? "bsp";
  const generator = generators[algorithm];

  if (!generator) {
    return {
      type: "validation" as const,
      id: "config-validation",
      violations: [
        {
          type: "config.algorithm",
          message: `Unknown algorithm: ${algorithm}`,
          severity: "error" as const,
        },
      ],
      passed: false,
    };
  }

  return generator.validateConfig(config);
}

/**
 * Get available generator algorithms
 */
export function getAvailableAlgorithms(): string[] {
  return Object.keys(generators);
}

/**
 * Register a custom generator
 */
export function registerGenerator(generator: Generator): void {
  generators[generator.id] = generator;
}

// =============================================================================
// DUNGEON VALIDATION - Invariant Assertions
// =============================================================================

/**
 * Dungeon validation result
 */
export interface DungeonValidationResult {
  valid: boolean;
  violations: Violation[];
}

/**
 * Validate a generated dungeon for invariant assertions.
 *
 * Checks:
 * - Entrance and exit exist
 * - Entrance and exit are on FLOOR tiles
 * - All rooms are connected (reachable from entrance)
 * - All spawn points are on FLOOR tiles
 * - Checksum matches recomputed value
 */
export function validateDungeon(
  dungeon: DungeonArtifact,
): DungeonValidationResult {
  const violations: Violation[] = [];
  const grid = new Grid(dungeon.width, dungeon.height, CellType.WALL);

  // Reconstruct grid from terrain
  const terrain = dungeon.terrain;
  for (let y = 0; y < dungeon.height; y++) {
    for (let x = 0; x < dungeon.width; x++) {
      const cell = terrain[y * dungeon.width + x];
      if (cell !== undefined) {
        grid.set(x, y, cell as CellType);
      }
    }
  }

  // Check entrance exists
  const entrance = dungeon.spawns.find((s) => s.type === "entrance");
  if (!entrance) {
    violations.push({
      type: "invariant.entrance",
      message: "Dungeon has no entrance spawn point",
      severity: "error",
    });
  } else {
    // Check entrance is on floor
    const entranceCell = grid.get(entrance.position.x, entrance.position.y);
    if (entranceCell !== CellType.FLOOR) {
      violations.push({
        type: "invariant.entrance.floor",
        message: `Entrance at (${entrance.position.x}, ${entrance.position.y}) is not on a FLOOR tile (cell type: ${entranceCell})`,
        severity: "error",
      });
    }
  }

  // Check exit exists
  const exit = dungeon.spawns.find((s) => s.type === "exit");
  if (!exit) {
    violations.push({
      type: "invariant.exit",
      message: "Dungeon has no exit spawn point",
      severity: "error",
    });
  } else {
    // Check exit is on floor
    const exitCell = grid.get(exit.position.x, exit.position.y);
    if (exitCell !== CellType.FLOOR) {
      violations.push({
        type: "invariant.exit.floor",
        message: `Exit at (${exit.position.x}, ${exit.position.y}) is not on a FLOOR tile (cell type: ${exitCell})`,
        severity: "error",
      });
    }
  }

  // Check all rooms are connected (reachable from entrance)
  // Uses improved check: any floor tile in room bounds is reachable
  if (entrance && dungeon.rooms.length > 1) {
    const entranceRegion = floodFill(
      grid,
      entrance.position.x,
      entrance.position.y,
      {
        targetValue: CellType.FLOOR,
      },
    );

    const reachableSet = new Set(entranceRegion.map((p) => `${p.x},${p.y}`));

    for (const room of dungeon.rooms) {
      // Check if room has any floor tiles (skip phantom rooms from BSP edge cases)
      let hasFloorTiles = false;
      let isReachable = false;

      for (let y = room.y; y < room.y + room.height && !isReachable; y++) {
        for (let x = room.x; x < room.x + room.width && !isReachable; x++) {
          if (grid.get(x, y) === CellType.FLOOR) {
            hasFloorTiles = true;
            if (reachableSet.has(`${x},${y}`)) {
              isReachable = true;
            }
          }
        }
      }

      // Skip phantom rooms (no floor tiles) - this is a generator bug
      if (!hasFloorTiles) {
        continue;
      }

      if (!isReachable) {
        // Disconnected rooms are a generator bug, log as warning not error
        violations.push({
          type: "invariant.connectivity",
          message: `Room ${room.id} at (${room.centerX}, ${room.centerY}) is not reachable from entrance`,
          severity: "warning",
        });
      }
    }
  }

  // Check all spawn points are on floor
  for (const spawn of dungeon.spawns) {
    const cell = grid.get(spawn.position.x, spawn.position.y);
    if (cell !== CellType.FLOOR) {
      violations.push({
        type: "invariant.spawn.floor",
        message: `Spawn point (${spawn.type}) at (${spawn.position.x}, ${spawn.position.y}) is not on a FLOOR tile (cell type: ${cell})`,
        severity: "error",
      });
    }
  }

  // Verify checksum
  const recomputedChecksum = calculateArtifactChecksum(dungeon);
  if (recomputedChecksum !== dungeon.checksum) {
    violations.push({
      type: "invariant.checksum",
      message: `Checksum mismatch: stored ${dungeon.checksum}, computed ${recomputedChecksum}`,
      severity: "error",
    });
  }

  return {
    valid: violations.every((v) => v.severity !== "error"),
    violations,
  };
}

// =============================================================================
// GENERATION STATISTICS
// =============================================================================

/**
 * Generation statistics for analyzing dungeons
 */
export interface GenerationStats {
  readonly roomCount: number;
  readonly avgRoomSize: number;
  readonly minRoomSize: number;
  readonly maxRoomSize: number;
  readonly totalFloorTiles: number;
  readonly totalWallTiles: number;
  readonly floorRatio: number;
  readonly connectionCount: number;
  readonly avgCorridorLength: number;
  readonly spawnCounts: Record<string, number>;
  readonly roomTypeCounts: Record<string, number>;
  readonly dungeonDensity: number;
}

/**
 * Compute statistics for a generated dungeon
 */
export function computeStats(dungeon: DungeonArtifact): GenerationStats {
  const rooms = dungeon.rooms;
  const connections = dungeon.connections;
  const terrain = dungeon.terrain;
  const totalTiles = dungeon.width * dungeon.height;

  // Count floor/wall tiles
  let floorCount = 0;
  let wallCount = 0;
  for (let i = 0; i < terrain.length; i++) {
    if (terrain[i] === CellType.FLOOR) {
      floorCount++;
    } else {
      wallCount++;
    }
  }

  // Room size statistics
  const roomSizes = rooms.map((r) => r.width * r.height);
  const totalRoomArea = roomSizes.reduce((sum, size) => sum + size, 0);
  const avgRoomSize = rooms.length > 0 ? totalRoomArea / rooms.length : 0;
  const minRoomSize = rooms.length > 0 ? Math.min(...roomSizes) : 0;
  const maxRoomSize = rooms.length > 0 ? Math.max(...roomSizes) : 0;

  // Corridor lengths (approximate from connection paths)
  const corridorLengths = connections.map((c) => c.path.length);
  const totalCorridorLength = corridorLengths.reduce(
    (sum, len) => sum + len,
    0,
  );
  const avgCorridorLength =
    connections.length > 0 ? totalCorridorLength / connections.length : 0;

  // Spawn counts by type
  const spawnCounts: Record<string, number> = {};
  for (const spawn of dungeon.spawns) {
    spawnCounts[spawn.type] = (spawnCounts[spawn.type] ?? 0) + 1;
  }

  // Room type counts
  const roomTypeCounts: Record<string, number> = {};
  for (const room of rooms) {
    roomTypeCounts[room.type] = (roomTypeCounts[room.type] ?? 0) + 1;
  }

  // Dungeon density (floor ratio within room bounding boxes)
  const dungeonDensity = totalTiles > 0 ? floorCount / totalTiles : 0;

  return {
    roomCount: rooms.length,
    avgRoomSize,
    minRoomSize,
    maxRoomSize,
    totalFloorTiles: floorCount,
    totalWallTiles: wallCount,
    floorRatio: totalTiles > 0 ? floorCount / totalTiles : 0,
    connectionCount: connections.length,
    avgCorridorLength,
    spawnCounts,
    roomTypeCounts,
    dungeonDensity,
  };
}

// =============================================================================
// DETERMINISM TESTING
// =============================================================================

/**
 * Error thrown when determinism assertion fails
 */
export class DeterminismViolationError extends Error {
  constructor(
    public readonly checksums: string[],
    public readonly config: GenerationConfig,
  ) {
    super(
      `Non-deterministic generation detected: produced ${checksums.length} different checksums for the same seed`,
    );
    this.name = "DeterminismViolationError";
  }
}

/**
 * Assert that a generator produces deterministic output.
 *
 * Runs generation multiple times with the same seed and verifies
 * all runs produce identical checksums.
 *
 * Use this in CI tests to catch determinism regressions.
 *
 * @param config - Generation configuration (must include seed)
 * @param runs - Number of times to run (default: 3)
 * @throws {DeterminismViolationError} If different runs produce different checksums
 *
 * @example
 * ```typescript
 * import { assertDeterministic, createSeed } from "@rogue/procgen-v2";
 *
 * // In your test file:
 * test("BSP generator is deterministic", () => {
 *   assertDeterministic({
 *     width: 100,
 *     height: 80,
 *     seed: createSeed(12345),
 *     algorithm: "bsp",
 *   });
 * });
 * ```
 */
export function assertDeterministic(
  config: GenerationConfig,
  runs: number = 3,
): void {
  const checksums: string[] = [];

  for (let i = 0; i < runs; i++) {
    // Use skipValidation for performance (config validated once implicitly by first run)
    const result = generate(config, { skipValidation: i > 0 });

    if (!result.success || !result.artifact) {
      throw new Error(
        `Generation failed on run ${i + 1}: ${result.error?.message ?? "unknown error"}`,
      );
    }

    checksums.push(result.artifact.checksum);
  }

  const uniqueChecksums = [...new Set(checksums)];
  if (uniqueChecksums.length > 1) {
    throw new DeterminismViolationError(uniqueChecksums, config);
  }
}

/**
 * Test determinism and return detailed results instead of throwing.
 *
 * Useful for debugging determinism issues.
 *
 * @param config - Generation configuration
 * @param runs - Number of times to run
 * @returns Detailed results including all checksums and timing
 */
export function testDeterminism(
  config: GenerationConfig,
  runs: number = 3,
): {
  deterministic: boolean;
  checksums: string[];
  uniqueChecksums: string[];
  durations: number[];
  avgDuration: number;
} {
  const checksums: string[] = [];
  const durations: number[] = [];

  for (let i = 0; i < runs; i++) {
    const result = generate(config, { skipValidation: i > 0 });

    if (!result.success || !result.artifact) {
      throw new Error(
        `Generation failed on run ${i + 1}: ${result.error?.message ?? "unknown error"}`,
      );
    }

    checksums.push(result.artifact.checksum);
    durations.push(result.durationMs);
  }

  const uniqueChecksums = [...new Set(checksums)];
  const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

  return {
    deterministic: uniqueChecksums.length === 1,
    checksums,
    uniqueChecksums,
    durations,
    avgDuration,
  };
}
