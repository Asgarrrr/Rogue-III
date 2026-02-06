/**
 * Quality Assurance Utilities
 *
 * Statistical quality checks for detecting degenerate dungeon outputs.
 * These checks help ensure generated dungeons meet aesthetic and playability standards.
 */

import { CellType, Grid } from "../core/grid";
import { floodFill } from "../core/grid/flood-fill";
import type {
  DungeonArtifact,
  QualityAssessment,
  QualityCheck,
  QualityThresholds,
  Room,
} from "../pipeline/types";
import { DEFAULT_QUALITY_THRESHOLDS } from "../pipeline/types";

/**
 * Assess the quality of a generated dungeon.
 *
 * Performs multiple checks against configurable thresholds and returns
 * a detailed assessment with individual check results and an overall score.
 *
 * @example
 * ```typescript
 * const result = generate(config);
 * if (result.success) {
 *   const qa = assessQuality(result.artifact);
 *   if (!qa.passed) {
 *     console.warn(`Quality score: ${qa.score}/100`);
 *     qa.checks.filter(c => !c.passed).forEach(c => console.warn(c.message));
 *   }
 * }
 * ```
 */
export function assessQuality(
  dungeon: DungeonArtifact,
  thresholds: Partial<QualityThresholds> = {},
): QualityAssessment {
  const opts = { ...DEFAULT_QUALITY_THRESHOLDS, ...thresholds };
  const checks: QualityCheck[] = [];

  // Reconstruct grid for connectivity check
  const grid = new Grid(dungeon.width, dungeon.height, CellType.WALL);
  for (let y = 0; y < dungeon.height; y++) {
    for (let x = 0; x < dungeon.width; x++) {
      const cell = dungeon.terrain[y * dungeon.width + x];
      if (cell !== undefined) {
        grid.set(x, y, cell as CellType);
      }
    }
  }

  // Check 1: Room count
  const roomCount = dungeon.rooms.length;
  checks.push({
    name: "room-count-min",
    passed: roomCount >= opts.minRooms,
    value: roomCount,
    threshold: opts.minRooms,
    message:
      roomCount >= opts.minRooms
        ? `Room count (${roomCount}) meets minimum (${opts.minRooms})`
        : `Room count (${roomCount}) below minimum (${opts.minRooms})`,
  });

  checks.push({
    name: "room-count-max",
    passed: roomCount <= opts.maxRooms,
    value: roomCount,
    threshold: opts.maxRooms,
    message:
      roomCount <= opts.maxRooms
        ? `Room count (${roomCount}) within maximum (${opts.maxRooms})`
        : `Room count (${roomCount}) exceeds maximum (${opts.maxRooms})`,
  });

  // Check 2: Floor ratio
  const totalCells = dungeon.width * dungeon.height;
  const floorCells = countFloorCells(dungeon.terrain);
  const floorRatio = totalCells > 0 ? floorCells / totalCells : 0;

  checks.push({
    name: "floor-ratio-min",
    passed: floorRatio >= opts.minFloorRatio,
    value: floorRatio,
    threshold: opts.minFloorRatio,
    message:
      floorRatio >= opts.minFloorRatio
        ? `Floor ratio (${(floorRatio * 100).toFixed(1)}%) meets minimum`
        : `Floor ratio (${(floorRatio * 100).toFixed(1)}%) too low (min: ${(opts.minFloorRatio * 100).toFixed(1)}%)`,
  });

  checks.push({
    name: "floor-ratio-max",
    passed: floorRatio <= opts.maxFloorRatio,
    value: floorRatio,
    threshold: opts.maxFloorRatio,
    message:
      floorRatio <= opts.maxFloorRatio
        ? `Floor ratio (${(floorRatio * 100).toFixed(1)}%) within maximum`
        : `Floor ratio (${(floorRatio * 100).toFixed(1)}%) too high (max: ${(opts.maxFloorRatio * 100).toFixed(1)}%)`,
  });

  // Check 3: Average room size
  const avgRoomSize = calculateAvgRoomSize(dungeon.rooms);
  checks.push({
    name: "avg-room-size",
    passed: avgRoomSize >= opts.minAvgRoomSize,
    value: avgRoomSize,
    threshold: opts.minAvgRoomSize,
    message:
      avgRoomSize >= opts.minAvgRoomSize
        ? `Average room size (${avgRoomSize.toFixed(1)}) meets minimum`
        : `Average room size (${avgRoomSize.toFixed(1)}) too small (min: ${opts.minAvgRoomSize})`,
  });

  // Check 4: Dead-end ratio (rooms with only 1 connection)
  const deadEndRatio = calculateDeadEndRatio(dungeon.rooms, dungeon.connections);
  checks.push({
    name: "dead-end-ratio",
    passed: deadEndRatio <= opts.maxDeadEndRatio,
    value: deadEndRatio,
    threshold: opts.maxDeadEndRatio,
    message:
      deadEndRatio <= opts.maxDeadEndRatio
        ? `Dead-end ratio (${(deadEndRatio * 100).toFixed(1)}%) within limit`
        : `Dead-end ratio (${(deadEndRatio * 100).toFixed(1)}%) too high (max: ${(opts.maxDeadEndRatio * 100).toFixed(1)}%)`,
  });

  // Check 5: Full connectivity
  if (opts.requireFullConnectivity && dungeon.rooms.length > 0) {
    const connectivityResult = checkFullConnectivity(grid, dungeon);
    checks.push(connectivityResult);
  }

  // Calculate overall score (0-100)
  const passedChecks = checks.filter((c) => c.passed).length;
  const score = Math.round((passedChecks / checks.length) * 100);

  return {
    passed: checks.every((c) => c.passed),
    checks,
    score,
  };
}

/**
 * Count floor cells in terrain array
 */
function countFloorCells(terrain: Uint8Array): number {
  let count = 0;
  for (let i = 0; i < terrain.length; i++) {
    if (terrain[i] === CellType.FLOOR) count++;
  }
  return count;
}

/**
 * Calculate average room size
 */
function calculateAvgRoomSize(rooms: readonly Room[]): number {
  if (rooms.length === 0) return 0;
  const totalSize = rooms.reduce((sum, r) => sum + r.width * r.height, 0);
  return totalSize / rooms.length;
}

/**
 * Calculate ratio of dead-end rooms (rooms with only 1 connection)
 */
function calculateDeadEndRatio(
  rooms: readonly Room[],
  connections: readonly { fromRoomId: number; toRoomId: number }[],
): number {
  if (rooms.length <= 1) return 0;

  const connectionCount = new Map<number, number>();
  for (const room of rooms) {
    connectionCount.set(room.id, 0);
  }

  for (const conn of connections) {
    connectionCount.set(
      conn.fromRoomId,
      (connectionCount.get(conn.fromRoomId) ?? 0) + 1,
    );
    connectionCount.set(
      conn.toRoomId,
      (connectionCount.get(conn.toRoomId) ?? 0) + 1,
    );
  }

  const deadEnds = Array.from(connectionCount.values()).filter(
    (c) => c === 1,
  ).length;
  return deadEnds / rooms.length;
}

/**
 * Check if all rooms are reachable from entrance
 */
function checkFullConnectivity(
  grid: Grid,
  dungeon: DungeonArtifact,
): QualityCheck {
  const entrance = dungeon.spawns.find((s) => s.type === "entrance");
  if (!entrance) {
    return {
      name: "full-connectivity",
      passed: false,
      value: 0,
      threshold: 1,
      message: "No entrance spawn point found",
    };
  }

  // Flood fill from entrance
  const reachable = floodFill(grid, entrance.position.x, entrance.position.y, {
    targetValue: CellType.FLOOR,
  });
  const reachableSet = new Set(reachable.map((p) => `${p.x},${p.y}`));

  // Check each room has at least one reachable floor tile
  let reachableRooms = 0;
  for (const room of dungeon.rooms) {
    let roomReachable = false;
    for (let y = room.y; y < room.y + room.height && !roomReachable; y++) {
      for (let x = room.x; x < room.x + room.width && !roomReachable; x++) {
        if (
          grid.get(x, y) === CellType.FLOOR &&
          reachableSet.has(`${x},${y}`)
        ) {
          roomReachable = true;
        }
      }
    }
    if (roomReachable) reachableRooms++;
  }

  const connectivityRatio =
    dungeon.rooms.length > 0 ? reachableRooms / dungeon.rooms.length : 1;

  return {
    name: "full-connectivity",
    passed: connectivityRatio === 1,
    value: connectivityRatio,
    threshold: 1,
    message:
      connectivityRatio === 1
        ? `All ${dungeon.rooms.length} rooms are reachable`
        : `Only ${reachableRooms}/${dungeon.rooms.length} rooms are reachable`,
  };
}

// =============================================================================
// SEED REGRESSION TESTING
// =============================================================================

/**
 * Golden seed entry for regression testing
 */
export interface GoldenSeed {
  /** Seed value */
  readonly seed: number;
  /** Expected checksum */
  readonly checksum: string;
  /** Algorithm used */
  readonly algorithm: "bsp" | "cellular";
  /** Grid dimensions */
  readonly width: number;
  readonly height: number;
  /** Optional description */
  readonly description?: string;
}

/**
 * Regression test result
 */
export interface RegressionResult {
  readonly seed: number;
  readonly passed: boolean;
  readonly expectedChecksum: string;
  readonly actualChecksum: string;
  readonly message: string;
}

/**
 * Run regression tests against golden seeds.
 *
 * @param goldenSeeds - Array of golden seed definitions
 * @param generateFn - Generation function to test
 * @returns Array of test results
 *
 * @example
 * ```typescript
 * const golden: GoldenSeed[] = [
 *   { seed: 12345, checksum: "v2:abc123...", algorithm: "bsp", width: 80, height: 60 },
 *   { seed: 67890, checksum: "v2:def456...", algorithm: "bsp", width: 80, height: 60 },
 * ];
 *
 * const results = runRegressionTests(golden, (config) => generate(config));
 * const failures = results.filter(r => !r.passed);
 * if (failures.length > 0) {
 *   throw new Error(`${failures.length} regression(s) detected`);
 * }
 * ```
 */
export function runRegressionTests(
  goldenSeeds: readonly GoldenSeed[],
  generateFn: (config: {
    seed: number;
    algorithm: "bsp" | "cellular";
    width: number;
    height: number;
  }) => { success: boolean; artifact?: { checksum: string } },
): RegressionResult[] {
  const results: RegressionResult[] = [];

  for (const golden of goldenSeeds) {
    const result = generateFn({
      seed: golden.seed,
      algorithm: golden.algorithm,
      width: golden.width,
      height: golden.height,
    });

    if (!result.success || !result.artifact) {
      results.push({
        seed: golden.seed,
        passed: false,
        expectedChecksum: golden.checksum,
        actualChecksum: "GENERATION_FAILED",
        message: `Generation failed for seed ${golden.seed}`,
      });
      continue;
    }

    const passed = result.artifact.checksum === golden.checksum;
    results.push({
      seed: golden.seed,
      passed,
      expectedChecksum: golden.checksum,
      actualChecksum: result.artifact.checksum,
      message: passed
        ? `Seed ${golden.seed}: checksum matches`
        : `Seed ${golden.seed}: checksum mismatch (expected ${golden.checksum}, got ${result.artifact.checksum})`,
    });
  }

  return results;
}

/**
 * Generate golden seeds from a set of test seeds.
 * Use this to create the initial golden seed file.
 *
 * @example
 * ```typescript
 * const seeds = [12345, 67890, 11111];
 * const golden = generateGoldenSeeds(seeds, "bsp", 80, 60, (config) => generate(config));
 * // Save to file: JSON.stringify(golden, null, 2)
 * ```
 */
export function generateGoldenSeeds(
  seeds: readonly number[],
  algorithm: "bsp" | "cellular",
  width: number,
  height: number,
  generateFn: (config: {
    seed: number;
    algorithm: "bsp" | "cellular";
    width: number;
    height: number;
  }) => { success: boolean; artifact?: { checksum: string } },
): GoldenSeed[] {
  const golden: GoldenSeed[] = [];

  for (const seed of seeds) {
    const result = generateFn({ seed, algorithm, width, height });
    if (result.success && result.artifact) {
      golden.push({
        seed,
        checksum: result.artifact.checksum,
        algorithm,
        width,
        height,
      });
    }
  }

  return golden;
}
