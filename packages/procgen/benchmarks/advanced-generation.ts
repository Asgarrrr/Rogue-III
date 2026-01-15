/**
 * Advanced Generation Benchmark
 *
 * Benchmarks various generation scenarios to measure performance
 * and demonstrate advanced usage patterns.
 *
 * Run with: bun benchmarks/advanced-generation.ts
 */

import type { DungeonArtifact } from "../src";
import {
  chain,
  computeStats,
  createDeadEndTreasureProcessor,
  createEnemyProcessor,
  createSeed,
  createTreasureProcessor,
  generate,
  validateDungeon,
} from "../src";
import {
  printDungeonWithStats,
  renderAscii,
  renderComparison,
  renderLegend,
  SIMPLE_CHARSET,
} from "../src/utils/ascii-renderer";

// =============================================================================
// BENCHMARK UTILITIES
// =============================================================================

interface BenchmarkResult {
  name: string;
  iterations: number;
  totalMs: number;
  avgMs: number;
  minMs: number;
  maxMs: number;
  opsPerSec: number;
}

/**
 * Run a benchmark
 */
function benchmark(
  name: string,
  fn: () => void,
  iterations: number = 100,
): BenchmarkResult {
  const times: number[] = [];

  // Warmup
  for (let i = 0; i < 5; i++) {
    fn();
  }

  // Benchmark
  for (let i = 0; i < iterations; i++) {
    const start = performance.now();
    fn();
    const end = performance.now();
    times.push(end - start);
  }

  const totalMs = times.reduce((a, b) => a + b, 0);
  const avgMs = totalMs / iterations;
  const minMs = Math.min(...times);
  const maxMs = Math.max(...times);
  const opsPerSec = 1000 / avgMs;

  return { name, iterations, totalMs, avgMs, minMs, maxMs, opsPerSec };
}

/**
 * Format benchmark result
 */
function formatResult(result: BenchmarkResult): string {
  return [
    `${result.name}:`,
    `  Iterations: ${result.iterations}`,
    `  Average: ${result.avgMs.toFixed(3)}ms`,
    `  Min: ${result.minMs.toFixed(3)}ms`,
    `  Max: ${result.maxMs.toFixed(3)}ms`,
    `  Ops/sec: ${result.opsPerSec.toFixed(1)}`,
  ].join("\n");
}

// =============================================================================
// BENCHMARK SCENARIOS
// =============================================================================

console.log("═".repeat(60));
console.log("PROCGEN-V2 ADVANCED BENCHMARK");
console.log("═".repeat(60));
console.log();

// -----------------------------------------------------------------------------
// 1. Basic Generation Benchmarks
// -----------------------------------------------------------------------------

console.log("─".repeat(60));
console.log("1. BASIC GENERATION");
console.log("─".repeat(60));

const basicBSP = benchmark("BSP 80x60", () => {
  generate({
    width: 80,
    height: 60,
    seed: createSeed(Math.floor(Math.random() * 0xffffffff)),
    algorithm: "bsp",
  });
});
console.log(formatResult(basicBSP));
console.log();

const basicCellular = benchmark("Cellular 80x60", () => {
  generate({
    width: 80,
    height: 60,
    seed: createSeed(Math.floor(Math.random() * 0xffffffff)),
    algorithm: "cellular",
  });
});
console.log(formatResult(basicCellular));
console.log();

// -----------------------------------------------------------------------------
// 2. Size Scaling Benchmarks
// -----------------------------------------------------------------------------

console.log("─".repeat(60));
console.log("2. SIZE SCALING");
console.log("─".repeat(60));

const sizes = [
  { width: 40, height: 30, label: "Small (40x30)" },
  { width: 80, height: 60, label: "Medium (80x60)" },
  { width: 120, height: 90, label: "Large (120x90)" },
  { width: 200, height: 150, label: "XLarge (200x150)" },
];

for (const { width, height, label } of sizes) {
  const result = benchmark(
    label,
    () => {
      generate({
        width,
        height,
        seed: createSeed(Math.floor(Math.random() * 0xffffffff)),
        algorithm: "bsp",
      });
    },
    50,
  );
  console.log(
    `${label.padEnd(20)} avg: ${result.avgMs.toFixed(2)}ms  ops/sec: ${result.opsPerSec.toFixed(1)}`,
  );
}
console.log();

// -----------------------------------------------------------------------------
// 3. Generator Chaining Benchmark
// -----------------------------------------------------------------------------

console.log("─".repeat(60));
console.log("3. GENERATOR CHAINING");
console.log("─".repeat(60));

const chainedGeneration = benchmark(
  "Chained with Post-processors",
  () => {
    chain({
      width: 80,
      height: 60,
      seed: createSeed(Math.floor(Math.random() * 0xffffffff)),
    })
      .useGenerator("bsp")
      .transform(createTreasureProcessor(0.3))
      .transform(createEnemyProcessor(1, 3))
      .transform(createDeadEndTreasureProcessor())
      .run();
  },
  50,
);
console.log(formatResult(chainedGeneration));
console.log();

// -----------------------------------------------------------------------------
// 4. Validation Benchmark
// -----------------------------------------------------------------------------

console.log("─".repeat(60));
console.log("4. VALIDATION");
console.log("─".repeat(60));

// Pre-generate some dungeons
const testDungeons: DungeonArtifact[] = [];
for (let i = 0; i < 100; i++) {
  const result = generate({
    width: 80,
    height: 60,
    seed: createSeed(i * 1000),
    algorithm: "bsp",
  });
  if (result.success) {
    testDungeons.push(result.artifact);
  }
}

let dungeonIndex = 0;
const validationBenchmark = benchmark(
  "validateDungeon",
  () => {
    validateDungeon(testDungeons[dungeonIndex % testDungeons.length]!);
    dungeonIndex++;
  },
  100,
);
console.log(formatResult(validationBenchmark));
console.log();

dungeonIndex = 0;
const statsBenchmark = benchmark(
  "computeStats",
  () => {
    computeStats(testDungeons[dungeonIndex % testDungeons.length]!);
    dungeonIndex++;
  },
  100,
);
console.log(formatResult(statsBenchmark));
console.log();

// -----------------------------------------------------------------------------
// 5. Snapshot Capture Benchmark
// -----------------------------------------------------------------------------

console.log("─".repeat(60));
console.log("5. SNAPSHOT CAPTURE");
console.log("─".repeat(60));

const withoutSnapshots = benchmark(
  "Without Snapshots",
  () => {
    generate({
      width: 80,
      height: 60,
      seed: createSeed(Math.floor(Math.random() * 0xffffffff)),
      algorithm: "bsp",
      snapshots: false,
    });
  },
  50,
);
console.log(formatResult(withoutSnapshots));
console.log();

const withSnapshots = benchmark(
  "With Snapshots",
  () => {
    generate(
      {
        width: 80,
        height: 60,
        seed: createSeed(Math.floor(Math.random() * 0xffffffff)),
        algorithm: "bsp",
        snapshots: true,
      },
      { captureSnapshots: true },
    );
  },
  50,
);
console.log(formatResult(withSnapshots));
console.log();

// -----------------------------------------------------------------------------
// 6. ASCII Rendering Benchmark
// -----------------------------------------------------------------------------

console.log("─".repeat(60));
console.log("6. ASCII RENDERING");
console.log("─".repeat(60));

const sampleDungeon = testDungeons[0]!;

const renderBasic = benchmark(
  "Render Basic",
  () => {
    renderAscii(sampleDungeon);
  },
  100,
);
console.log(formatResult(renderBasic));
console.log();

const renderWithOptions = benchmark(
  "Render with All Options",
  () => {
    renderAscii(sampleDungeon, {
      showSpawns: true,
      showRoomCenters: true,
      showRoomIds: true,
      showCoordinates: true,
      useColors: true,
    });
  },
  100,
);
console.log(formatResult(renderWithOptions));
console.log();

// -----------------------------------------------------------------------------
// 7. Sample Dungeon Visualization
// -----------------------------------------------------------------------------

console.log("─".repeat(60));
console.log("7. SAMPLE DUNGEON");
console.log("─".repeat(60));
console.log();

// Generate a sample dungeon with chaining
const sampleResult = chain({
  width: 60,
  height: 40,
  seed: createSeed(42),
})
  .useGenerator("bsp")
  .transform(createTreasureProcessor(0.4))
  .transform(createEnemyProcessor(1, 2))
  .run();

if (sampleResult.success) {
  console.log(renderLegend(SIMPLE_CHARSET));
  console.log();
  printDungeonWithStats(sampleResult.artifact, { charset: SIMPLE_CHARSET });
  console.log();

  // Show stats
  const stats = computeStats(sampleResult.artifact);
  console.log("Statistics:");
  console.log(`  Room count: ${stats.roomCount}`);
  console.log(`  Average room size: ${stats.avgRoomSize.toFixed(1)}`);
  console.log(`  Floor ratio: ${(stats.floorRatio * 100).toFixed(1)}%`);
  console.log(`  Connections: ${stats.connectionCount}`);
  console.log(`  Avg corridor length: ${stats.avgCorridorLength.toFixed(1)}`);
  console.log();

  // Room type distribution
  console.log("Room Types:");
  for (const [type, count] of Object.entries(stats.roomTypeCounts)) {
    console.log(`  ${type}: ${count}`);
  }
  console.log();

  // Spawn distribution
  console.log("Spawn Distribution:");
  for (const [type, count] of Object.entries(stats.spawnCounts)) {
    console.log(`  ${type}: ${count}`);
  }
  console.log();

  // Validation
  const validation = validateDungeon(sampleResult.artifact);
  console.log(`Validation: ${validation.valid ? "✓ PASSED" : "✗ FAILED"}`);
  if (!validation.valid) {
    for (const v of validation.violations) {
      console.log(`  - ${v.type}: ${v.message}`);
    }
  }
}

// -----------------------------------------------------------------------------
// 8. Algorithm Comparison
// -----------------------------------------------------------------------------

console.log();
console.log("─".repeat(60));
console.log("8. ALGORITHM COMPARISON");
console.log("─".repeat(60));
console.log();

const bspResult = generate({
  width: 50,
  height: 35,
  seed: createSeed(12345),
  algorithm: "bsp",
});

const cellularResult = generate({
  width: 50,
  height: 35,
  seed: createSeed(12345),
  algorithm: "cellular",
});

if (bspResult.success && cellularResult.success) {
  console.log(
    renderComparison(bspResult.artifact, cellularResult.artifact, {
      charset: SIMPLE_CHARSET,
    }),
  );
}

// -----------------------------------------------------------------------------
// Summary
// -----------------------------------------------------------------------------

console.log();
console.log("═".repeat(60));
console.log("BENCHMARK SUMMARY");
console.log("═".repeat(60));
console.log();
console.log(
  `BSP 80x60:          ${basicBSP.avgMs.toFixed(2)}ms (${basicBSP.opsPerSec.toFixed(0)} ops/sec)`,
);
console.log(
  `Cellular 80x60:     ${basicCellular.avgMs.toFixed(2)}ms (${basicCellular.opsPerSec.toFixed(0)} ops/sec)`,
);
console.log(
  `Chained Generation: ${chainedGeneration.avgMs.toFixed(2)}ms (${chainedGeneration.opsPerSec.toFixed(0)} ops/sec)`,
);
console.log(
  `Validation:         ${validationBenchmark.avgMs.toFixed(2)}ms (${validationBenchmark.opsPerSec.toFixed(0)} ops/sec)`,
);
console.log(
  `Stats Computation:  ${statsBenchmark.avgMs.toFixed(2)}ms (${statsBenchmark.opsPerSec.toFixed(0)} ops/sec)`,
);
console.log(
  `ASCII Render:       ${renderBasic.avgMs.toFixed(2)}ms (${renderBasic.opsPerSec.toFixed(0)} ops/sec)`,
);
console.log();
console.log("═".repeat(60));
