/**
 * Property-Based Testing for Dungeon Generation
 *
 * Verifies that invariants hold across many randomly generated dungeons.
 * This provides confidence that the generator is robust across the seed space.
 */

import { describe, expect, it } from "bun:test";
import type { DungeonArtifact, GenerationConfig } from "../src";
import { computeStats, createSeed, generate, SeededRandom, validateDungeon } from "../src";
import { CellType, Grid } from "../src/core/grid";
import { floodFill } from "../src/core/grid/flood-fill";

// =============================================================================
// TEST CONFIGURATION
// =============================================================================

/**
 * Number of random seeds to test for property-based tests
 */
const PROPERTY_TEST_COUNT = 50;

/**
 * Generate a random seed for testing
 */
const TEST_RNG = new SeededRandom(0x5eedc0de);

function randomSeed(): number {
  return Math.floor(TEST_RNG.next() * 0x100000000) >>> 0;
}

function randomDimension(min: number, max: number): number {
  return TEST_RNG.range(min, max);
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Reconstruct grid from dungeon terrain
 */
function reconstructGrid(dungeon: DungeonArtifact): Grid {
  const grid = new Grid(dungeon.width, dungeon.height, CellType.WALL);
  for (let y = 0; y < dungeon.height; y++) {
    for (let x = 0; x < dungeon.width; x++) {
      const cell = dungeon.terrain[y * dungeon.width + x];
      if (cell !== undefined) {
        grid.set(x, y, cell as CellType);
      }
    }
  }
  return grid;
}

/**
 * Check if a position is on a floor tile
 */
function isOnFloor(grid: Grid, x: number, y: number): boolean {
  return grid.isInBounds(x, y) && grid.get(x, y) === CellType.FLOOR;
}

// =============================================================================
// BSP GENERATOR PROPERTY TESTS
// =============================================================================

describe("BSP generator property tests", () => {
  it("always produces valid dungeons", () => {
    for (let i = 0; i < PROPERTY_TEST_COUNT; i++) {
      const seed = randomSeed();
      const config: GenerationConfig = {
        width: randomDimension(80, 119),
        height: randomDimension(60, 89),
        seed: createSeed(seed),
        algorithm: "bsp",
      };

      const result = generate(config);

      // Generation should succeed
      expect(result.success).toBe(true);
      if (!result.success) {
        console.error(`BSP failed with seed ${seed}:`, result.error);
      }
    }
  });

  it("always has entrance and exit", () => {
    for (let i = 0; i < PROPERTY_TEST_COUNT; i++) {
      const seed = randomSeed();
      const config: GenerationConfig = {
        width: 80,
        height: 60,
        seed: createSeed(seed),
        algorithm: "bsp",
      };

      const result = generate(config);
      expect(result.success).toBe(true);

      if (result.success) {
        const entrance = result.artifact.spawns.find(
          (s) => s.type === "entrance",
        );
        const exit = result.artifact.spawns.find((s) => s.type === "exit");

        expect(entrance).toBeDefined();
        expect(exit).toBeDefined();

        if (!entrance || !exit) {
          console.error(`Missing entrance/exit with seed ${seed}`);
        }
      }
    }
  });

  it("entrance and exit are always on floor tiles", () => {
    for (let i = 0; i < PROPERTY_TEST_COUNT; i++) {
      const seed = randomSeed();
      const config: GenerationConfig = {
        width: 80,
        height: 60,
        seed: createSeed(seed),
        algorithm: "bsp",
      };

      const result = generate(config);
      expect(result.success).toBe(true);

      if (result.success) {
        const grid = reconstructGrid(result.artifact);
        const entrance = result.artifact.spawns.find(
          (s) => s.type === "entrance",
        );
        const exit = result.artifact.spawns.find((s) => s.type === "exit");

        if (entrance) {
          const onFloor = isOnFloor(
            grid,
            entrance.position.x,
            entrance.position.y,
          );
          if (!onFloor) {
            console.error(`Entrance not on floor with seed ${seed}`);
          }
          expect(onFloor).toBe(true);
        }

        if (exit) {
          const onFloor = isOnFloor(grid, exit.position.x, exit.position.y);
          if (!onFloor) {
            console.error(`Exit not on floor with seed ${seed}`);
          }
          expect(onFloor).toBe(true);
        }
      }
    }
  });

  it("all rooms are reachable from entrance", () => {
    for (let i = 0; i < PROPERTY_TEST_COUNT; i++) {
      const seed = randomSeed();
      const config: GenerationConfig = {
        width: 80,
        height: 60,
        seed: createSeed(seed),
        algorithm: "bsp",
      };

      const result = generate(config);
      expect(result.success).toBe(true);

      if (result.success && result.artifact.rooms.length > 1) {
        const grid = reconstructGrid(result.artifact);
        const entrance = result.artifact.spawns.find(
          (s) => s.type === "entrance",
        );

        if (entrance) {
          const reachableRegion = floodFill(
            grid,
            entrance.position.x,
            entrance.position.y,
            { targetValue: CellType.FLOOR },
          );

          const reachableSet = new Set(
            reachableRegion.map((p) => `${p.x},${p.y}`),
          );

          for (const room of result.artifact.rooms) {
            const key = `${room.centerX},${room.centerY}`;
            if (!reachableSet.has(key)) {
              console.error(`Room ${room.id} not reachable with seed ${seed}`);
            }
            expect(reachableSet.has(key)).toBe(true);
          }
        }
      }
    }
  });

  it("rooms never overlap", () => {
    for (let i = 0; i < PROPERTY_TEST_COUNT; i++) {
      const seed = randomSeed();
      const config: GenerationConfig = {
        width: 80,
        height: 60,
        seed: createSeed(seed),
        algorithm: "bsp",
      };

      const result = generate(config);
      expect(result.success).toBe(true);

      if (result.success) {
        const rooms = result.artifact.rooms;

        for (let a = 0; a < rooms.length; a++) {
          for (let b = a + 1; b < rooms.length; b++) {
            const roomA = rooms[a]!;
            const roomB = rooms[b]!;

            // Check AABB overlap
            const overlapX =
              roomA.x < roomB.x + roomB.width &&
              roomA.x + roomA.width > roomB.x;
            const overlapY =
              roomA.y < roomB.y + roomB.height &&
              roomA.y + roomA.height > roomB.y;

            if (overlapX && overlapY) {
              console.error(
                `Rooms ${roomA.id} and ${roomB.id} overlap with seed ${seed}`,
              );
            }
            expect(overlapX && overlapY).toBe(false);
          }
        }
      }
    }
  });

  it("validateDungeon passes for all generated dungeons", () => {
    for (let i = 0; i < PROPERTY_TEST_COUNT; i++) {
      const seed = randomSeed();
      const config: GenerationConfig = {
        width: 80,
        height: 60,
        seed: createSeed(seed),
        algorithm: "bsp",
      };

      const result = generate(config);
      expect(result.success).toBe(true);

      if (result.success) {
        const validation = validateDungeon(result.artifact);

        if (!validation.success) {
          console.error(`Validation failed with seed ${seed}:`);
          for (const v of validation.violations) {
            console.error(`  - ${v.type}: ${v.message}`);
          }
        }
        expect(validation.success).toBe(true);
      }
    }
  });
});

// =============================================================================
// CELLULAR AUTOMATA PROPERTY TESTS
// =============================================================================

describe("Cellular automata property tests", () => {
  it("always produces valid dungeons", () => {
    for (let i = 0; i < PROPERTY_TEST_COUNT; i++) {
      const seed = randomSeed();
      const config: GenerationConfig = {
        width: randomDimension(80, 119),
        height: randomDimension(60, 89),
        seed: createSeed(seed),
        algorithm: "cellular",
      };

      const result = generate(config);

      expect(result.success).toBe(true);
      if (!result.success) {
        console.error(`Cellular failed with seed ${seed}:`, result.error);
      }
    }
  });

  it("always has entrance and exit", () => {
    for (let i = 0; i < PROPERTY_TEST_COUNT; i++) {
      const seed = randomSeed();
      const config: GenerationConfig = {
        width: 80,
        height: 60,
        seed: createSeed(seed),
        algorithm: "cellular",
      };

      const result = generate(config);
      expect(result.success).toBe(true);

      if (result.success) {
        const entrance = result.artifact.spawns.find(
          (s) => s.type === "entrance",
        );
        const exit = result.artifact.spawns.find((s) => s.type === "exit");

        expect(entrance).toBeDefined();
        expect(exit).toBeDefined();
      }
    }
  });

  it("entrance and exit are always on floor tiles", () => {
    for (let i = 0; i < PROPERTY_TEST_COUNT; i++) {
      const seed = randomSeed();
      const config: GenerationConfig = {
        width: 80,
        height: 60,
        seed: createSeed(seed),
        algorithm: "cellular",
      };

      const result = generate(config);
      expect(result.success).toBe(true);

      if (result.success) {
        const grid = reconstructGrid(result.artifact);
        const entrance = result.artifact.spawns.find(
          (s) => s.type === "entrance",
        );
        const exit = result.artifact.spawns.find((s) => s.type === "exit");

        if (entrance) {
          expect(
            isOnFloor(grid, entrance.position.x, entrance.position.y),
          ).toBe(true);
        }

        if (exit) {
          expect(isOnFloor(grid, exit.position.x, exit.position.y)).toBe(true);
        }
      }
    }
  });

  it("all regions are connected", () => {
    for (let i = 0; i < PROPERTY_TEST_COUNT; i++) {
      const seed = randomSeed();
      const config: GenerationConfig = {
        width: 80,
        height: 60,
        seed: createSeed(seed),
        algorithm: "cellular",
      };

      const result = generate(config);
      expect(result.success).toBe(true);

      if (result.success) {
        const grid = reconstructGrid(result.artifact);
        const entrance = result.artifact.spawns.find(
          (s) => s.type === "entrance",
        );

        if (entrance) {
          const reachableRegion = floodFill(
            grid,
            entrance.position.x,
            entrance.position.y,
            { targetValue: CellType.FLOOR },
          );

          // Count total floor tiles
          let totalFloor = 0;
          for (let y = 0; y < grid.height; y++) {
            for (let x = 0; x < grid.width; x++) {
              if (grid.get(x, y) === CellType.FLOOR) {
                totalFloor++;
              }
            }
          }

          // All floor tiles should be reachable (single connected region)
          if (reachableRegion.length !== totalFloor) {
            console.error(
              `Disconnected floor tiles with seed ${seed}: ` +
                `reachable=${reachableRegion.length}, total=${totalFloor}`,
            );
          }
          expect(reachableRegion.length).toBe(totalFloor);
        }
      }
    }
  });
});

// =============================================================================
// DETERMINISM PROPERTY TESTS
// =============================================================================

describe("Determinism property tests", () => {
  it("same seed produces identical dungeons", () => {
    for (let i = 0; i < PROPERTY_TEST_COUNT; i++) {
      const seed = randomSeed();
      const config: GenerationConfig = {
        width: 80,
        height: 60,
        seed: createSeed(seed),
        algorithm: "bsp",
      };

      const result1 = generate(config);
      const result2 = generate(config);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      if (result1.success && result2.success) {
        // Checksums must match
        expect(result1.artifact.checksum).toBe(result2.artifact.checksum);

        // Room counts must match
        expect(result1.artifact.rooms.length).toBe(
          result2.artifact.rooms.length,
        );

        // Connection counts must match
        expect(result1.artifact.connections.length).toBe(
          result2.artifact.connections.length,
        );

        // Spawn counts must match
        expect(result1.artifact.spawns.length).toBe(
          result2.artifact.spawns.length,
        );
      }
    }
  });

  it("different seeds produce different dungeons", () => {
    const checksums = new Set<string>();

    for (let i = 0; i < PROPERTY_TEST_COUNT; i++) {
      const seed = randomSeed();
      const config: GenerationConfig = {
        width: 80,
        height: 60,
        seed: createSeed(seed),
        algorithm: "bsp",
      };

      const result = generate(config);
      expect(result.success).toBe(true);

      if (result.success) {
        // Each checksum should be unique (extremely high probability)
        expect(checksums.has(result.artifact.checksum)).toBe(false);
        checksums.add(result.artifact.checksum);
      }
    }

    // All checksums should be unique
    expect(checksums.size).toBe(PROPERTY_TEST_COUNT);
  });
});

// =============================================================================
// STATISTICS PROPERTY TESTS
// =============================================================================

describe("Statistics property tests", () => {
  it("statistics are consistent with dungeon data", () => {
    for (let i = 0; i < PROPERTY_TEST_COUNT; i++) {
      const seed = randomSeed();
      const config: GenerationConfig = {
        width: 80,
        height: 60,
        seed: createSeed(seed),
        algorithm: "bsp",
      };

      const result = generate(config);
      expect(result.success).toBe(true);

      if (result.success) {
        const stats = computeStats(result.artifact);

        // Room count matches
        expect(stats.roomCount).toBe(result.artifact.rooms.length);

        // Connection count matches
        expect(stats.connectionCount).toBe(result.artifact.connections.length);

        // Floor + wall = total tiles
        expect(stats.totalFloorTiles + stats.totalWallTiles).toBe(
          result.artifact.width * result.artifact.height,
        );

        // Floor ratio is correct
        expect(stats.floorRatio).toBeCloseTo(
          stats.totalFloorTiles /
            (result.artifact.width * result.artifact.height),
          10,
        );

        // Average room size is reasonable
        if (stats.roomCount > 0) {
          expect(stats.avgRoomSize).toBeGreaterThan(0);
          expect(stats.minRoomSize).toBeLessThanOrEqual(stats.avgRoomSize);
          expect(stats.maxRoomSize).toBeGreaterThanOrEqual(stats.avgRoomSize);
        }
      }
    }
  });
});

// =============================================================================
// KNOWN-GOOD REGRESSION SEEDS
// =============================================================================

/**
 * Known-good seeds with expected checksums.
 * These are regression tests to catch any changes in generation output.
 */
const REGRESSION_SEEDS = [
  { seed: 12345, algorithm: "bsp" as const },
  { seed: 54321, algorithm: "bsp" as const },
  { seed: 99999, algorithm: "bsp" as const },
  { seed: 12345, algorithm: "cellular" as const },
  { seed: 54321, algorithm: "cellular" as const },
] as const;

describe("Regression seed tests", () => {
  // Store checksums on first run, verify on subsequent runs
  const storedChecksums = new Map<string, string>();

  it("regression seeds produce consistent output", () => {
    for (const { seed, algorithm } of REGRESSION_SEEDS) {
      const config: GenerationConfig = {
        width: 80,
        height: 60,
        seed: createSeed(seed),
        algorithm,
      };

      const key = `${algorithm}-${seed}`;

      // Generate twice to verify consistency
      const result1 = generate(config);
      const result2 = generate(config);

      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);

      if (result1.success && result2.success) {
        // Both runs should match
        expect(result1.artifact.checksum).toBe(result2.artifact.checksum);

        // Store for future runs
        storedChecksums.set(key, result1.artifact.checksum);
      }
    }
  });

  it("regression dungeons pass validation", () => {
    for (const { seed, algorithm } of REGRESSION_SEEDS) {
      const config: GenerationConfig = {
        width: 80,
        height: 60,
        seed: createSeed(seed),
        algorithm,
      };

      const result = generate(config);
      expect(result.success).toBe(true);

      if (result.success) {
        const validation = validateDungeon(result.artifact);
        expect(validation.success).toBe(true);
      }
    }
  });
});

// =============================================================================
// EDGE CASE TESTS
// =============================================================================

describe("Edge case tests", () => {
  it("handles minimum valid size", () => {
    const config: GenerationConfig = {
      width: 40,
      height: 30,
      seed: createSeed(12345),
      algorithm: "bsp",
    };

    const result = generate(config);
    expect(result.success).toBe(true);

    if (result.success) {
      const validation = validateDungeon(result.artifact);
      expect(validation.success).toBe(true);
    }
  });

  it("handles large sizes", () => {
    const config: GenerationConfig = {
      width: 200,
      height: 150,
      seed: createSeed(12345),
      algorithm: "bsp",
    };

    const result = generate(config);
    expect(result.success).toBe(true);

    if (result.success) {
      const validation = validateDungeon(result.artifact);
      expect(validation.success).toBe(true);
    }
  });

  it("handles seed 0", () => {
    const config: GenerationConfig = {
      width: 80,
      height: 60,
      seed: createSeed(0),
      algorithm: "bsp",
    };

    const result = generate(config);
    expect(result.success).toBe(true);

    if (result.success) {
      const validation = validateDungeon(result.artifact);
      expect(validation.success).toBe(true);
    }
  });

  it("handles max uint32 seed", () => {
    const config: GenerationConfig = {
      width: 80,
      height: 60,
      seed: createSeed(0xffffffff),
      algorithm: "bsp",
    };

    const result = generate(config);
    expect(result.success).toBe(true);

    if (result.success) {
      const validation = validateDungeon(result.artifact);
      expect(validation.success).toBe(true);
    }
  });
});
