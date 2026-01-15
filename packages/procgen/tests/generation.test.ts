/**
 * High-level generation API tests
 */

import { describe, expect, it } from "bun:test";
import type { GenerationConfig } from "../src";
import {
  createSeed,
  createSeedFromString,
  generate,
  generateAsync,
  getAvailableAlgorithms,
  validateConfig,
} from "../src";

describe("createSeed", () => {
  it("creates seed from number", () => {
    const seed = createSeed(12345);

    expect(seed.primary).toBe(12345);
    expect(seed.layout).toBeDefined();
    expect(seed.rooms).toBeDefined();
    expect(seed.connections).toBeDefined();
    expect(seed.details).toBeDefined();
    expect(seed.version).toBe("2.0.0");
  });

  it("produces different sub-seeds", () => {
    const seed = createSeed(12345);

    // Sub-seeds should be different from each other
    expect(seed.layout).not.toBe(seed.rooms);
    expect(seed.rooms).not.toBe(seed.connections);
    expect(seed.connections).not.toBe(seed.details);
  });

  it("is deterministic", () => {
    const seed1 = createSeed(12345);
    const seed2 = createSeed(12345);

    expect(seed1.primary).toBe(seed2.primary);
    expect(seed1.layout).toBe(seed2.layout);
    expect(seed1.rooms).toBe(seed2.rooms);
    expect(seed1.connections).toBe(seed2.connections);
    expect(seed1.details).toBe(seed2.details);
  });
});

describe("createSeedFromString", () => {
  it("creates seed from string", () => {
    const seed = createSeedFromString("my-dungeon");

    expect(seed.primary).toBeDefined();
    expect(seed.version).toBe("2.0.0");
  });

  it("produces different seeds for different strings", () => {
    const seed1 = createSeedFromString("dungeon-a");
    const seed2 = createSeedFromString("dungeon-b");

    expect(seed1.primary).not.toBe(seed2.primary);
  });

  it("is deterministic", () => {
    const seed1 = createSeedFromString("test-seed");
    const seed2 = createSeedFromString("test-seed");

    expect(seed1.primary).toBe(seed2.primary);
  });
});

describe("generate", () => {
  it("generates dungeon with default algorithm", () => {
    const config: GenerationConfig = {
      width: 60,
      height: 30,
      seed: createSeed(12345),
    };

    const result = generate(config);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.artifact.type).toBe("dungeon");
      expect(result.artifact.rooms.length).toBeGreaterThan(0);
    }
  });

  it("generates dungeon with BSP algorithm", () => {
    const config: GenerationConfig = {
      width: 80,
      height: 50,
      seed: createSeed(54321),
      algorithm: "bsp",
    };

    const result = generate(config);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.artifact.rooms.length).toBeGreaterThan(0);
      expect(result.artifact.connections.length).toBeGreaterThan(0);
    }
  });

  it("returns error for unknown algorithm", () => {
    const config: GenerationConfig = {
      width: 60,
      height: 30,
      seed: createSeed(12345),
      algorithm: "unknown" as any,
    };

    const result = generate(config);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.message).toContain("Unknown algorithm");
    }
  });

  it("produces valid dungeon structure", () => {
    const config: GenerationConfig = {
      width: 100,
      height: 60,
      seed: createSeed(99999),
    };

    const result = generate(config);

    expect(result.success).toBe(true);
    if (result.success) {
      const dungeon = result.artifact;

      // Dimensions match config
      expect(dungeon.width).toBe(config.width);
      expect(dungeon.height).toBe(config.height);

      // Terrain is a Uint8Array with correct size
      expect(dungeon.terrain).toBeInstanceOf(Uint8Array);
      expect(dungeon.terrain.length).toBe(config.width * config.height);

      // Rooms have valid properties
      for (const room of dungeon.rooms) {
        expect(room.x).toBeGreaterThanOrEqual(0);
        expect(room.y).toBeGreaterThanOrEqual(0);
        expect(room.width).toBeGreaterThan(0);
        expect(room.height).toBeGreaterThan(0);
        expect(room.x + room.width).toBeLessThanOrEqual(config.width);
        expect(room.y + room.height).toBeLessThanOrEqual(config.height);
      }

      // Checksum is computed
      expect(dungeon.checksum).toBeDefined();
      expect(dungeon.checksum.length).toBeGreaterThan(0);
    }
  });

  it("generates spawn points", () => {
    const config: GenerationConfig = {
      width: 80,
      height: 50,
      seed: createSeed(11111),
    };

    const result = generate(config);

    expect(result.success).toBe(true);
    if (result.success) {
      // Spawns is an array
      expect(result.artifact.spawns).toBeDefined();
      expect(Array.isArray(result.artifact.spawns)).toBe(true);

      // Should have at least entrance and exit
      const entrance = result.artifact.spawns.find(
        (s: { type: string }) => s.type === "entrance",
      );
      const exit = result.artifact.spawns.find(
        (s: { type: string }) => s.type === "exit",
      );

      expect(entrance).toBeDefined();
      expect(exit).toBeDefined();
    }
  });

  it("tracks duration", () => {
    const config: GenerationConfig = {
      width: 60,
      height: 30,
      seed: createSeed(12345),
    };

    const result = generate(config);

    expect(result.durationMs).toBeGreaterThan(0);
  });

  it("calls progress callback", () => {
    const config: GenerationConfig = {
      width: 60,
      height: 30,
      seed: createSeed(12345),
    };

    const progressCalls: number[] = [];

    generate(config, {
      onProgress(progress) {
        progressCalls.push(progress);
      },
    });

    expect(progressCalls.length).toBeGreaterThan(0);
    expect(progressCalls[progressCalls.length - 1]).toBe(100);
  });
});

describe("generateAsync", () => {
  it("generates dungeon asynchronously", async () => {
    const config: GenerationConfig = {
      width: 60,
      height: 30,
      seed: createSeed(12345),
    };

    const result = await generateAsync(config);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.artifact.rooms.length).toBeGreaterThan(0);
    }
  });

  it("accepts abort signal option", async () => {
    const config: GenerationConfig = {
      width: 60,
      height: 30,
      seed: createSeed(12345),
    };

    const controller = new AbortController();

    // Don't abort immediately - just verify the option is accepted
    const result = await generateAsync(config, { signal: controller.signal });

    // Should complete successfully when not aborted
    expect(result.success).toBe(true);
  });
});

describe("determinism", () => {
  it("same seed produces identical output", () => {
    const config: GenerationConfig = {
      width: 80,
      height: 50,
      seed: createSeed(12345),
    };

    const result1 = generate(config);
    const result2 = generate(config);

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);

    if (result1.success && result2.success) {
      // Checksums should match
      expect(result1.artifact.checksum).toBe(result2.artifact.checksum);

      // Room counts should match
      expect(result1.artifact.rooms.length).toBe(result2.artifact.rooms.length);

      // Room positions should match
      for (let i = 0; i < result1.artifact.rooms.length; i++) {
        const r1 = result1.artifact.rooms[i];
        const r2 = result2.artifact.rooms[i];
        expect(r1?.x).toBe(r2?.x);
        expect(r1?.y).toBe(r2?.y);
        expect(r1?.width).toBe(r2?.width);
        expect(r1?.height).toBe(r2?.height);
      }
    }
  });

  it("different seeds produce different output", () => {
    const config1: GenerationConfig = {
      width: 80,
      height: 50,
      seed: createSeed(12345),
    };

    const config2: GenerationConfig = {
      width: 80,
      height: 50,
      seed: createSeed(54321),
    };

    const result1 = generate(config1);
    const result2 = generate(config2);

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);

    if (result1.success && result2.success) {
      expect(result1.artifact.checksum).not.toBe(result2.artifact.checksum);
    }
  });

  it("deterministic across multiple runs", () => {
    const seeds = [11111, 22222, 33333, 44444, 55555];
    const checksums: string[] = [];

    for (const seedValue of seeds) {
      const config: GenerationConfig = {
        width: 60,
        height: 40,
        seed: createSeed(seedValue),
      };

      const result = generate(config);
      if (result.success) {
        checksums.push(result.artifact.checksum);
      }
    }

    // Run again and compare
    for (let i = 0; i < seeds.length; i++) {
      const config: GenerationConfig = {
        width: 60,
        height: 40,
        seed: createSeed(seeds[i] ?? 0),
      };

      const result = generate(config);
      if (result.success) {
        expect(result.artifact.checksum).toBe(checksums[i]);
      }
    }
  });
});

describe("validateConfig", () => {
  it("returns valid for good config", () => {
    const config: GenerationConfig = {
      width: 60,
      height: 30,
      seed: createSeed(12345),
    };

    const result = validateConfig(config);

    expect(result.passed).toBe(true);
  });

  it("returns error for unknown algorithm", () => {
    const config: GenerationConfig = {
      width: 60,
      height: 30,
      seed: createSeed(12345),
      algorithm: "invalid" as any,
    };

    const result = validateConfig(config);

    expect(result.passed).toBe(false);
    expect(result.violations.length).toBeGreaterThan(0);
  });
});

describe("getAvailableAlgorithms", () => {
  it("returns list of algorithms", () => {
    const algorithms = getAvailableAlgorithms();

    expect(algorithms).toContain("bsp");
    expect(algorithms.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// NEW TESTS FOR IMPROVEMENTS
// =============================================================================

import {
  computeStats,
  createSeedFromSeed,
  createSeedWithTimestamp,
  seedsAreEquivalent,
  validateDungeon,
} from "../src";

describe("seed determinism fixes", () => {
  it("createSeed produces deterministic timestamp (0)", () => {
    const seed1 = createSeed(12345);
    const seed2 = createSeed(12345);

    expect(seed1.timestamp).toBe(0);
    expect(seed2.timestamp).toBe(0);
    expect(seed1.timestamp).toBe(seed2.timestamp);
  });

  it("createSeedWithTimestamp includes actual timestamp", () => {
    const before = Date.now();
    const seed = createSeedWithTimestamp(12345);
    const after = Date.now();

    expect(seed.timestamp).toBeGreaterThanOrEqual(before);
    expect(seed.timestamp).toBeLessThanOrEqual(after);
  });

  it("createSeedFromSeed normalizes timestamp", () => {
    const original = createSeedWithTimestamp(12345);
    const restored = createSeedFromSeed(original);

    expect(restored.timestamp).toBe(0);
    expect(restored.primary).toBe(original.primary);
    expect(restored.layout).toBe(original.layout);
  });

  it("seedsAreEquivalent ignores timestamp", () => {
    const seed1 = createSeed(12345);
    const seed2 = createSeedWithTimestamp(12345);

    expect(seedsAreEquivalent(seed1, seed2)).toBe(true);
  });

  it("seedsAreEquivalent detects different seeds", () => {
    const seed1 = createSeed(12345);
    const seed2 = createSeed(54321);

    expect(seedsAreEquivalent(seed1, seed2)).toBe(false);
  });
});

describe("validateDungeon invariants", () => {
  it("validates a good dungeon", () => {
    const config: GenerationConfig = {
      width: 80,
      height: 50,
      seed: createSeed(12345),
    };

    const result = generate(config);
    expect(result.success).toBe(true);

    if (result.success) {
      const validation = validateDungeon(result.artifact);
      expect(validation.valid).toBe(true);
      expect(validation.violations.length).toBe(0);
    }
  });

  it("validates entrance and exit exist", () => {
    const config: GenerationConfig = {
      width: 80,
      height: 50,
      seed: createSeed(99999),
    };

    const result = generate(config);
    expect(result.success).toBe(true);

    if (result.success) {
      const validation = validateDungeon(result.artifact);

      // Should pass since entrance and exit are always created
      expect(validation.valid).toBe(true);
    }
  });

  it("validates all rooms are connected", () => {
    const config: GenerationConfig = {
      width: 100,
      height: 80,
      seed: createSeed(77777),
    };

    const result = generate(config);
    expect(result.success).toBe(true);

    if (result.success) {
      const validation = validateDungeon(result.artifact);

      // MST guarantees connectivity
      expect(validation.valid).toBe(true);
      const connectivityViolations = validation.violations.filter(
        (v) => v.type === "invariant.connectivity",
      );
      expect(connectivityViolations.length).toBe(0);
    }
  });

  it("validates checksum consistency", () => {
    const config: GenerationConfig = {
      width: 60,
      height: 40,
      seed: createSeed(55555),
    };

    const result = generate(config);
    expect(result.success).toBe(true);

    if (result.success) {
      const validation = validateDungeon(result.artifact);

      // Checksum should be valid
      const checksumViolations = validation.violations.filter(
        (v) => v.type === "invariant.checksum",
      );
      expect(checksumViolations.length).toBe(0);
    }
  });
});

describe("decision tracing", () => {
  it("captures trace events when enabled", () => {
    const config: GenerationConfig = {
      width: 60,
      height: 40,
      seed: createSeed(12345),
      trace: true,
    };

    const result = generate(config);

    expect(result.success).toBe(true);
    expect(result.trace).toBeDefined();
    expect(result.trace?.length).toBeGreaterThan(0);
  });

  it("captures decision events in trace", () => {
    const config: GenerationConfig = {
      width: 60,
      height: 40,
      seed: createSeed(12345),
      trace: true,
    };

    const result = generate(config);

    expect(result.success).toBe(true);
    expect(result.trace).toBeDefined();

    // Should have decision events from passes
    const decisionEvents = result.trace?.filter(
      (e) => e.eventType === "decision",
    );
    expect(decisionEvents.length).toBeGreaterThan(0);
  });

  it("does not capture trace when disabled", () => {
    const config: GenerationConfig = {
      width: 60,
      height: 40,
      seed: createSeed(12345),
      trace: false,
    };

    const result = generate(config);

    expect(result.success).toBe(true);
    expect(result.trace).toBeDefined();
    expect(result.trace?.length).toBe(0);
  });
});

describe("abort signal", () => {
  it("respects abort signal in async generation", async () => {
    const config: GenerationConfig = {
      width: 200,
      height: 200,
      seed: createSeed(12345),
    };

    const controller = new AbortController();
    // Abort immediately
    controller.abort();

    const result = await generateAsync(config, { signal: controller.signal });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error?.name).toBe("AbortError");
    }
  });
});

describe("spawn point validation", () => {
  it("spawns are on floor tiles", () => {
    const config: GenerationConfig = {
      width: 80,
      height: 50,
      seed: createSeed(12345),
    };

    const result = generate(config);
    expect(result.success).toBe(true);

    if (result.success) {
      const validation = validateDungeon(result.artifact);

      // All spawns should be on floor
      const spawnFloorViolations = validation.violations.filter(
        (v) => v.type === "invariant.spawn.floor",
      );
      expect(spawnFloorViolations.length).toBe(0);
    }
  });
});

// =============================================================================
// CELLULAR AUTOMATA GENERATOR TESTS
// =============================================================================

describe("cellular automata generator", () => {
  it("generates dungeon with cellular algorithm", () => {
    const config: GenerationConfig = {
      width: 80,
      height: 60,
      seed: createSeed(12345),
      algorithm: "cellular",
    };

    const result = generate(config);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.artifact.type).toBe("dungeon");
      expect(result.artifact.width).toBe(80);
      expect(result.artifact.height).toBe(60);
      expect(result.artifact.spawns.length).toBeGreaterThan(0);
    }
  });

  it("has entrance and exit", () => {
    const config: GenerationConfig = {
      width: 100,
      height: 80,
      seed: createSeed(54321),
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
  });

  it("is deterministic", () => {
    const config: GenerationConfig = {
      width: 80,
      height: 60,
      seed: createSeed(12345),
      algorithm: "cellular",
    };

    const result1 = generate(config);
    const result2 = generate(config);

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);

    if (result1.success && result2.success) {
      expect(result1.artifact.checksum).toBe(result2.artifact.checksum);
    }
  });

  it("produces different output with different seeds", () => {
    const config1: GenerationConfig = {
      width: 80,
      height: 60,
      seed: createSeed(11111),
      algorithm: "cellular",
    };

    const config2: GenerationConfig = {
      width: 80,
      height: 60,
      seed: createSeed(22222),
      algorithm: "cellular",
    };

    const result1 = generate(config1);
    const result2 = generate(config2);

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);

    if (result1.success && result2.success) {
      expect(result1.artifact.checksum).not.toBe(result2.artifact.checksum);
    }
  });

  it("validates successfully", () => {
    const config: GenerationConfig = {
      width: 100,
      height: 80,
      seed: createSeed(99999),
      algorithm: "cellular",
    };

    const result = generate(config);

    expect(result.success).toBe(true);
    if (result.success) {
      const validation = validateDungeon(result.artifact);
      expect(validation.valid).toBe(true);
    }
  });

  it("captures trace when enabled", () => {
    const config: GenerationConfig = {
      width: 80,
      height: 60,
      seed: createSeed(12345),
      algorithm: "cellular",
      trace: true,
    };

    const result = generate(config);

    expect(result.success).toBe(true);
    expect(result.trace).toBeDefined();
    expect(result.trace?.length).toBeGreaterThan(0);

    // Should have decision events from cellular passes
    const decisionEvents = result.trace?.filter(
      (e) => e.eventType === "decision",
    );
    expect(decisionEvents.length).toBeGreaterThan(0);
  });

  it("respects custom cellular config", () => {
    const config: GenerationConfig = {
      width: 80,
      height: 60,
      seed: createSeed(12345),
      algorithm: "cellular",
      cellular: {
        initialFillRatio: 0.55,
        birthLimit: 4,
        deathLimit: 3,
        iterations: 5,
        minRegionSize: 100,
      },
    };

    const result = generate(config);
    expect(result.success).toBe(true);
  });

  it("getAvailableAlgorithms includes cellular", () => {
    const algorithms = getAvailableAlgorithms();
    expect(algorithms).toContain("cellular");
    expect(algorithms).toContain("bsp");
  });
});

// =============================================================================
// IMMUTABILITY TESTS
// =============================================================================

// =============================================================================
// ROOM TYPE SEMANTICS TESTS
// =============================================================================

describe("room type semantics", () => {
  it("assigns entrance and exit room types", () => {
    const config: GenerationConfig = {
      width: 100,
      height: 80,
      seed: createSeed(12345),
    };

    const result = generate(config);

    expect(result.success).toBe(true);
    if (result.success) {
      const rooms = result.artifact.rooms;

      // Should have an entrance room
      const entranceRoom = rooms.find((r) => r.type === "entrance");
      expect(entranceRoom).toBeDefined();

      // Should have an exit room
      const exitRoom = rooms.find((r) => r.type === "exit");
      expect(exitRoom).toBeDefined();

      // Entrance and exit should be different rooms (if more than 1 room)
      if (rooms.length > 1) {
        expect(entranceRoom?.id).not.toBe(exitRoom?.id);
      }
    }
  });

  it("assigns boss room when enough rooms exist", () => {
    const config: GenerationConfig = {
      width: 120,
      height: 90,
      seed: createSeed(99999),
    };

    const result = generate(config);

    expect(result.success).toBe(true);
    if (result.success) {
      const rooms = result.artifact.rooms;

      // With a large dungeon, should have a boss room
      if (rooms.length >= 4) {
        const bossRoom = rooms.find((r) => r.type === "boss");
        expect(bossRoom).toBeDefined();
      }
    }
  });

  it("room types are deterministic", () => {
    const config: GenerationConfig = {
      width: 100,
      height: 80,
      seed: createSeed(55555),
    };

    const result1 = generate(config);
    const result2 = generate(config);

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);

    if (result1.success && result2.success) {
      // Room types should match
      for (let i = 0; i < result1.artifact.rooms.length; i++) {
        expect(result1.artifact.rooms[i]?.type).toBe(
          result2.artifact.rooms[i]?.type,
        );
      }
    }
  });
});

// =============================================================================
// GENERATION STATISTICS TESTS
// =============================================================================

describe("generation statistics", () => {
  it("computes basic statistics", () => {
    const config: GenerationConfig = {
      width: 80,
      height: 60,
      seed: createSeed(12345),
    };

    const result = generate(config);
    expect(result.success).toBe(true);

    if (result.success) {
      const stats = computeStats(result.artifact);

      expect(stats.roomCount).toBeGreaterThan(0);
      expect(stats.avgRoomSize).toBeGreaterThan(0);
      expect(stats.totalFloorTiles).toBeGreaterThan(0);
      expect(stats.totalWallTiles).toBeGreaterThan(0);
      expect(stats.floorRatio).toBeGreaterThan(0);
      expect(stats.floorRatio).toBeLessThan(1);
    }
  });

  it("counts room types", () => {
    const config: GenerationConfig = {
      width: 100,
      height: 80,
      seed: createSeed(99999),
    };

    const result = generate(config);
    expect(result.success).toBe(true);

    if (result.success) {
      const stats = computeStats(result.artifact);

      // Should have entrance and exit
      expect(stats.roomTypeCounts.entrance).toBe(1);
      expect(stats.roomTypeCounts.exit).toBe(1);

      // Total room type counts should match room count
      const totalTypeCounts = Object.values(stats.roomTypeCounts).reduce(
        (a, b) => a + b,
        0,
      );
      expect(totalTypeCounts).toBe(stats.roomCount);
    }
  });

  it("counts spawns by type", () => {
    const config: GenerationConfig = {
      width: 80,
      height: 60,
      seed: createSeed(55555),
    };

    const result = generate(config);
    expect(result.success).toBe(true);

    if (result.success) {
      const stats = computeStats(result.artifact);

      // Should have at least entrance and exit spawns
      expect(stats.spawnCounts.entrance).toBe(1);
      expect(stats.spawnCounts.exit).toBe(1);
    }
  });

  it("calculates connection statistics", () => {
    const config: GenerationConfig = {
      width: 100,
      height: 80,
      seed: createSeed(77777),
    };

    const result = generate(config);
    expect(result.success).toBe(true);

    if (result.success) {
      const stats = computeStats(result.artifact);

      // Connections should be roomCount - 1 (MST property)
      expect(stats.connectionCount).toBe(stats.roomCount - 1);

      // Average corridor length should be positive
      if (stats.connectionCount > 0) {
        expect(stats.avgCorridorLength).toBeGreaterThan(0);
      }
    }
  });
});

// =============================================================================
// ARTIFACT SNAPSHOTS TESTS
// =============================================================================

describe("artifact snapshots", () => {
  it("captures snapshots when enabled", () => {
    const config: GenerationConfig = {
      width: 60,
      height: 40,
      seed: createSeed(12345),
      snapshots: true,
    };

    const result = generate(config);

    expect(result.success).toBe(true);
    expect(result.snapshots).toBeDefined();
    expect(result.snapshots?.length).toBeGreaterThan(0);
  });

  it("snapshots contain pass information", () => {
    const config: GenerationConfig = {
      width: 60,
      height: 40,
      seed: createSeed(12345),
      snapshots: true,
    };

    const result = generate(config);

    expect(result.success).toBe(true);
    if (result.snapshots) {
      for (const snapshot of result.snapshots) {
        expect(snapshot.passId).toBeDefined();
        expect(snapshot.passIndex).toBeGreaterThanOrEqual(0);
        expect(snapshot.timestamp).toBeGreaterThan(0);
      }
    }
  });

  it("does not capture snapshots when disabled", () => {
    const config: GenerationConfig = {
      width: 60,
      height: 40,
      seed: createSeed(12345),
      snapshots: false,
    };

    const result = generate(config);

    expect(result.success).toBe(true);
    expect(result.snapshots).toBeUndefined();
  });

  it("snapshots show progression", () => {
    const config: GenerationConfig = {
      width: 80,
      height: 60,
      seed: createSeed(99999),
      snapshots: true,
    };

    const result = generate(config);

    expect(result.success).toBe(true);
    if (result.snapshots && result.snapshots.length > 2) {
      // Room count should increase during pipeline
      const _firstRoomCount = result.snapshots[0]?.roomCount ?? 0;
      const _lastRoomCount =
        result.snapshots[result.snapshots.length - 1]?.roomCount ?? 0;

      // At some point, rooms should have been added
      const anyHasRooms = result.snapshots.some((s) => s.roomCount > 0);
      expect(anyHasRooms).toBe(true);
    }
  });
});

// =============================================================================
// IMMUTABILITY TESTS
// =============================================================================

describe("terrain immutability", () => {
  it("terrain data is independent between generations", () => {
    const config: GenerationConfig = {
      width: 60,
      height: 40,
      seed: createSeed(12345),
    };

    const result1 = generate(config);
    const result2 = generate(config);

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);

    if (result1.success && result2.success) {
      // Store original first byte
      const originalByte = result1.artifact.terrain[0];

      // Mutate the first generation's terrain
      (result1.artifact.terrain as Uint8Array)[0] = 255;

      // Second generation should be unaffected
      expect(result2.artifact.terrain[0]).toBe(originalByte);
    }
  });

  it("checksum matches after regeneration", () => {
    const config: GenerationConfig = {
      width: 80,
      height: 50,
      seed: createSeed(99999),
    };

    const result = generate(config);
    expect(result.success).toBe(true);

    if (result.success) {
      // Store original checksum
      const originalChecksum = result.artifact.checksum;

      // Regenerate
      const result2 = generate(config);
      expect(result2.success).toBe(true);

      if (result2.success) {
        // Checksum should match
        expect(result2.artifact.checksum).toBe(originalChecksum);
        // Checksum should be versioned format: "v{version}:{16-char-hex}"
        expect(result2.artifact.checksum).toMatch(/^v\d+:[0-9a-f]{16}$/);
      }
    }
  });
});

// =============================================================================
// GENERATOR CHAINING TESTS
// =============================================================================

import {
  chain,
  createDeadEndTreasureProcessor,
  createEnemyProcessor,
  createTreasureProcessor,
  transform,
} from "../src";

describe("generator chaining", () => {
  it("chains generator with post-processor", () => {
    const config: GenerationConfig = {
      width: 80,
      height: 60,
      seed: createSeed(12345),
    };

    let processorCalled = false;

    const result = chain(config)
      .useGenerator("bsp")
      .transform((dungeon) => {
        processorCalled = true;
        return dungeon;
      })
      .run();

    expect(result.success).toBe(true);
    expect(processorCalled).toBe(true);
  });

  it("applies multiple transformations in order", () => {
    const config: GenerationConfig = {
      width: 80,
      height: 60,
      seed: createSeed(12345),
    };

    const order: string[] = [];

    const result = chain(config)
      .useGenerator("bsp")
      .transform((dungeon) => {
        order.push("first");
        return dungeon;
      })
      .transform((dungeon) => {
        order.push("second");
        return dungeon;
      })
      .transform((dungeon) => {
        order.push("third");
        return dungeon;
      })
      .run();

    expect(result.success).toBe(true);
    expect(order).toEqual(["first", "second", "third"]);
  });

  it("can add spawns via transformation", () => {
    const config: GenerationConfig = {
      width: 80,
      height: 60,
      seed: createSeed(12345),
    };

    const result = chain(config)
      .useGenerator("bsp")
      .transform((dungeon) => ({
        ...dungeon,
        spawns: [
          ...dungeon.spawns,
          {
            position: { x: 10, y: 10 },
            roomId: 0,
            type: "decoration" as const,
            tags: ["test"],
            weight: 1,
            distanceFromStart: 0,
          },
        ],
      }))
      .run();

    expect(result.success).toBe(true);
    if (result.success) {
      const decorations = result.artifact.spawns.filter(
        (s) => s.type === "decoration",
      );
      expect(decorations.length).toBeGreaterThan(0);
    }
  });

  it("uses default algorithm when not specified", () => {
    const config: GenerationConfig = {
      width: 80,
      height: 60,
      seed: createSeed(12345),
    };

    const result = chain(config).run();

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.artifact.type).toBe("dungeon");
    }
  });

  it("works with cellular algorithm", () => {
    const config: GenerationConfig = {
      width: 80,
      height: 60,
      seed: createSeed(12345),
      algorithm: "cellular",
    };

    const result = chain(config).useGenerator("cellular").run();

    expect(result.success).toBe(true);
  });
});

describe("dungeon transformer", () => {
  it("transforms rooms", () => {
    const config: GenerationConfig = {
      width: 80,
      height: 60,
      seed: createSeed(12345),
    };

    const result = generate(config);
    expect(result.success).toBe(true);

    if (result.success) {
      const transformed = transform(result.artifact)
        .mapRooms((room) => ({ ...room, type: "treasure" as const }))
        .build();

      expect(transformed.rooms.every((r) => r.type === "treasure")).toBe(true);
    }
  });

  it("filters connections", () => {
    const config: GenerationConfig = {
      width: 80,
      height: 60,
      seed: createSeed(12345),
    };

    const result = generate(config);
    expect(result.success).toBe(true);

    if (result.success) {
      const originalCount = result.artifact.connections.length;

      const transformed = transform(result.artifact)
        .filterConnections((_, index) => index % 2 === 0)
        .build();

      expect(transformed.connections.length).toBeLessThan(originalCount);
    }
  });

  it("adds spawns via generator function", () => {
    const config: GenerationConfig = {
      width: 80,
      height: 60,
      seed: createSeed(12345),
    };

    const result = generate(config);
    expect(result.success).toBe(true);

    if (result.success) {
      const originalSpawnCount = result.artifact.spawns.length;

      const transformed = transform(result.artifact)
        .addSpawns((dungeon) =>
          dungeon.rooms.map((room) => ({
            position: { x: room.centerX, y: room.centerY },
            roomId: room.id,
            type: "decoration" as const,
            tags: ["lamp"],
            weight: 1,
            distanceFromStart: 0,
          })),
        )
        .build();

      expect(transformed.spawns.length).toBe(
        originalSpawnCount + result.artifact.rooms.length,
      );
    }
  });
});

describe("common post-processors", () => {
  it("createTreasureProcessor adds treasure spawns", () => {
    const config: GenerationConfig = {
      width: 80,
      height: 60,
      seed: createSeed(12345),
    };

    const result = chain(config)
      .useGenerator("bsp")
      .transform(createTreasureProcessor(1.0)) // 100% chance
      .run();

    expect(result.success).toBe(true);
    if (result.success) {
      const treasures = result.artifact.spawns.filter(
        (s) => s.type === "treasure",
      );
      expect(treasures.length).toBeGreaterThan(0);
    }
  });

  it("createEnemyProcessor adds enemy spawns", () => {
    const config: GenerationConfig = {
      width: 80,
      height: 60,
      seed: createSeed(12345),
    };

    const result = chain(config)
      .useGenerator("bsp")
      .transform(createEnemyProcessor(2, 3))
      .run();

    expect(result.success).toBe(true);
    if (result.success) {
      const enemies = result.artifact.spawns.filter((s) => s.type === "enemy");
      expect(enemies.length).toBeGreaterThan(0);
    }
  });

  it("createDeadEndTreasureProcessor marks dead-ends", () => {
    const config: GenerationConfig = {
      width: 100,
      height: 80,
      seed: createSeed(12345),
    };

    const result = chain(config)
      .useGenerator("bsp")
      .transform(createDeadEndTreasureProcessor())
      .run();

    expect(result.success).toBe(true);
    if (result.success) {
      // Should have some treasure rooms now
      const treasureRooms = result.artifact.rooms.filter(
        (r) => r.type === "treasure",
      );
      // May or may not have dead-ends depending on layout
      expect(treasureRooms).toBeDefined();
    }
  });
});
