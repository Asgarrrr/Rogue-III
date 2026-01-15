/**
 * Property-Based Invariant Tests
 *
 * These tests verify that dungeon invariants hold over thousands of seeds.
 * They catch edge cases that example-based tests miss.
 */

import { describe, expect, it } from "bun:test";
import type { DungeonArtifact, GenerationConfig } from "../../src";
import { createSeed, generate, validateDungeon } from "../../src";
import { CellType } from "../../src/core/grid/types";

const SEED_COUNT = 1000;
const ALGORITHMS = ["bsp", "cellular"] as const;

// Test configurations for different dungeon sizes
const TEST_SIZES = [
  { width: 40, height: 30, name: "small" },
  { width: 80, height: 60, name: "medium" },
  { width: 120, height: 90, name: "large" },
] as const;

interface TestFailure {
  seed: number;
  violations: string[];
  error?: string;
}

/**
 * Run property test over many seeds and collect failures
 */
function runPropertyTest(
  algorithm: "bsp" | "cellular",
  size: { width: number; height: number },
  seedCount: number,
  validator: (artifact: DungeonArtifact, seed: number) => string | null,
): TestFailure[] {
  const failures: TestFailure[] = [];

  for (let i = 0; i < seedCount; i++) {
    const config: GenerationConfig = {
      width: size.width,
      height: size.height,
      seed: createSeed(i),
      algorithm,
    };

    const result = generate(config);

    if (!result.success) {
      failures.push({
        seed: i,
        violations: [],
        error: result.error.message,
      });
      continue;
    }

    const violation = validator(result.artifact, i);
    if (violation) {
      failures.push({
        seed: i,
        violations: [violation],
      });
    }
  }

  return failures;
}

describe("property: all dungeons pass validation", () => {
  for (const algorithm of ALGORITHMS) {
    for (const size of TEST_SIZES) {
      // Large tests can take longer, especially cellular with complex automata
      const timeout = size.name === "large" ? 60000 : 30000;
      it(
        `${algorithm} ${size.name} (${size.width}x${size.height}): ${SEED_COUNT} seeds`,
        () => {
          const failures = runPropertyTest(
            algorithm,
            size,
            SEED_COUNT,
            (artifact) => {
              const validation = validateDungeon(artifact);
              if (!validation.valid) {
                return validation.violations.map((v) => v.message).join("; ");
              }
              return null;
            },
          );

          if (failures.length > 0) {
            console.error(
              `\nFailed seeds (${failures.length}):`,
              failures.slice(0, 5),
            );
          }

          expect(failures.length).toBe(0);
        },
        { timeout },
      );
    }
  }
});

describe("property: rooms exist in all dungeons", () => {
  for (const algorithm of ALGORITHMS) {
    it(`${algorithm}: all dungeons have at least one room`, () => {
      const failures = runPropertyTest(
        algorithm,
        { width: 80, height: 60 },
        SEED_COUNT,
        (artifact) => {
          if (artifact.rooms.length === 0) {
            return "No rooms generated";
          }
          return null;
        },
      );

      expect(failures.length).toBe(0);
    });
  }
});

describe("property: entrance and exit always exist", () => {
  for (const algorithm of ALGORITHMS) {
    it(`${algorithm}: all dungeons have entrance and exit`, () => {
      const failures = runPropertyTest(
        algorithm,
        { width: 80, height: 60 },
        SEED_COUNT,
        (artifact) => {
          const hasEntrance = artifact.spawns.some(
            (s) => s.type === "entrance",
          );
          const hasExit = artifact.spawns.some((s) => s.type === "exit");

          if (!hasEntrance) return "No entrance spawn";
          if (!hasExit) return "No exit spawn";
          return null;
        },
      );

      expect(failures.length).toBe(0);
    });
  }
});

describe("property: spawns are on floor tiles", () => {
  for (const algorithm of ALGORITHMS) {
    it(`${algorithm}: all spawns are on walkable floor`, () => {
      const failures = runPropertyTest(
        algorithm,
        { width: 80, height: 60 },
        SEED_COUNT,
        (artifact) => {
          for (const spawn of artifact.spawns) {
            const index = spawn.position.y * artifact.width + spawn.position.x;
            const cellType = artifact.terrain[index];

            if (cellType !== CellType.FLOOR) {
              return `Spawn '${spawn.type}' at (${spawn.position.x}, ${spawn.position.y}) is not on floor (cell type: ${cellType})`;
            }
          }
          return null;
        },
      );

      expect(failures.length).toBe(0);
    });
  }
});

describe("property: rooms are within bounds", () => {
  for (const algorithm of ALGORITHMS) {
    it(`${algorithm}: all rooms fit within dungeon bounds`, () => {
      const failures = runPropertyTest(
        algorithm,
        { width: 80, height: 60 },
        SEED_COUNT,
        (artifact) => {
          for (const room of artifact.rooms) {
            if (room.x < 0 || room.y < 0) {
              return `Room ${room.id} has negative position (${room.x}, ${room.y})`;
            }
            if (room.x + room.width > artifact.width) {
              return `Room ${room.id} exceeds width (${room.x + room.width} > ${artifact.width})`;
            }
            if (room.y + room.height > artifact.height) {
              return `Room ${room.id} exceeds height (${room.y + room.height} > ${artifact.height})`;
            }
            if (room.width <= 0 || room.height <= 0) {
              return `Room ${room.id} has invalid size (${room.width}x${room.height})`;
            }
          }
          return null;
        },
      );

      expect(failures.length).toBe(0);
    });
  }
});

describe("property: checksum is consistent", () => {
  it("BSP: checksum format is valid", () => {
    const failures: TestFailure[] = [];

    for (let i = 0; i < SEED_COUNT; i++) {
      const result = generate({
        width: 80,
        height: 60,
        seed: createSeed(i),
        algorithm: "bsp",
      });

      if (!result.success) continue;

      // Checksum should be versioned format: "v{version}:{16-char-hex}"
      if (!/^v\d+:[0-9a-f]{16}$/.test(result.artifact.checksum)) {
        failures.push({
          seed: i,
          violations: [`Invalid checksum format: ${result.artifact.checksum}`],
        });
      }
    }

    expect(failures.length).toBe(0);
  });
});

describe("property: room count is reasonable", () => {
  it("BSP: room count within expected range for size", () => {
    const roomCounts: number[] = [];

    for (let i = 0; i < SEED_COUNT; i++) {
      const result = generate({
        width: 80,
        height: 60,
        seed: createSeed(i),
        algorithm: "bsp",
      });

      if (result.success) {
        roomCounts.push(result.artifact.rooms.length);
      }
    }

    const min = Math.min(...roomCounts);
    const max = Math.max(...roomCounts);
    const avg = roomCounts.reduce((a, b) => a + b, 0) / roomCounts.length;

    console.log(
      `\nBSP room count stats: min=${min}, max=${max}, avg=${avg.toFixed(1)}`,
    );

    // Reasonable bounds for 80x60 dungeon
    // BSP can generate many small rooms depending on partition depth
    expect(min).toBeGreaterThanOrEqual(2);
    expect(max).toBeLessThanOrEqual(60);
    expect(avg).toBeGreaterThanOrEqual(5);
    expect(avg).toBeLessThanOrEqual(40);
  });
});

describe("property: floor ratio is reasonable", () => {
  for (const algorithm of ALGORITHMS) {
    it(`${algorithm}: floor/wall ratio within expected range`, () => {
      const floorRatios: number[] = [];

      for (let i = 0; i < SEED_COUNT; i++) {
        const result = generate({
          width: 80,
          height: 60,
          seed: createSeed(i),
          algorithm,
        });

        if (!result.success) continue;

        let floorCount = 0;
        for (let j = 0; j < result.artifact.terrain.length; j++) {
          if (result.artifact.terrain[j] === CellType.FLOOR) {
            floorCount++;
          }
        }

        const ratio = floorCount / result.artifact.terrain.length;
        floorRatios.push(ratio);
      }

      const avgRatio =
        floorRatios.reduce((a, b) => a + b, 0) / floorRatios.length;
      const minRatio = Math.min(...floorRatios);
      const maxRatio = Math.max(...floorRatios);

      console.log(
        `\n${algorithm} floor ratio stats: min=${(minRatio * 100).toFixed(1)}%, max=${(maxRatio * 100).toFixed(1)}%, avg=${(avgRatio * 100).toFixed(1)}%`,
      );

      // Floor ratio varies significantly by algorithm:
      // - BSP: tends to have more consistent floor coverage (15-50%)
      // - Cellular: can have sparse caves with as little as 1% floor
      const expectedMinRatio = algorithm === "cellular" ? 0.01 : 0.1;
      expect(minRatio).toBeGreaterThanOrEqual(expectedMinRatio);
      expect(maxRatio).toBeLessThanOrEqual(0.7);
    });
  }
});
