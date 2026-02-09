#!/usr/bin/env bun
/// <reference types="bun-types" />
/**
 * Procgen Benchmark
 *
 * Usage: bun run bench -- [options]
 *
 * Modes:
 *   (default)     Quick benchmark with preview
 *   --full        Complete benchmark suite (all algos, multiple sizes)
 *   --stress      Stress test (1000 iterations, large maps)
 *
 * Options:
 *   -a <algo>     Algorithm(s): bsp,cellular,hybrid (comma-separated)
 *   -w <width>    Width (default: 80)
 *   -h <height>   Height (default: 50)
 *   -n <runs>     Runs per config (default: 10, full: 50, stress: 1000)
 *   -s <seed>     Fixed seed
 *   --no-map      Hide dungeon preview
 *   --json        Output JSON (for CI)
 */

import { createSeed, type GenerationConfig, generate } from "../src";
import { CellType } from "../src/core/grid";

// ─────────────────────────────────────────────────────────────────────────────
// ANSI & Formatting
// ─────────────────────────────────────────────────────────────────────────────
const c = {
  reset: "\x1b[0m",
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
  gray: "\x1b[90m",
  white: "\x1b[97m",
};

const fmt = {
  title: (s: string) => `${c.bold}${c.white}${s}${c.reset}`,
  value: (s: string) => `${c.cyan}${s}${c.reset}`,
  label: (s: string) => `${c.dim}${s}${c.reset}`,
  success: (s: string) => `${c.green}${s}${c.reset}`,
  warn: (s: string) => `${c.yellow}${s}${c.reset}`,
  error: (s: string) => `${c.red}${s}${c.reset}`,
  muted: (s: string) => `${c.gray}${s}${c.reset}`,
  accent: (s: string) => `${c.yellow}${s}${c.reset}`,
  algo: (s: string) => `${c.magenta}${s}${c.reset}`,
};

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (flag: string, def: string) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1]! : def;
};
const hasFlag = (flag: string) => args.includes(flag);

const isFullMode = hasFlag("--full");
const isStressMode = hasFlag("--stress");
const jsonOutput = hasFlag("--json");
const showMap =
  !hasFlag("--no-map") && !isFullMode && !isStressMode && !jsonOutput;

const defaultRuns = isStressMode ? 1000 : isFullMode ? 50 : 10;
const runs = parseInt(getArg("-n", defaultRuns.toString()), 10);
const seedVal = getArg("-s", Date.now().toString());
const baseSeed = parseInt(seedVal, 10) || Date.now();

type Algorithm = "bsp" | "cellular" | "hybrid";

// Parse algorithms
const algoArg = getArg(
  "-a",
  isFullMode || isStressMode ? "bsp,cellular,hybrid" : "bsp",
);
const algorithms = algoArg.split(",").map((a) => a.trim()) as Algorithm[];

// Parse sizes
interface SizeConfig {
  name: string;
  width: number;
  height: number;
}

const sizes: SizeConfig[] = isFullMode
  ? [
      { name: "S", width: 50, height: 40 },
      { name: "M", width: 80, height: 60 },
      { name: "L", width: 120, height: 80 },
      { name: "XL", width: 200, height: 150 },
    ]
  : isStressMode
    ? [{ name: "L", width: 150, height: 100 }]
    : [
        {
          name: "",
          width: parseInt(getArg("-w", "80"), 10),
          height: parseInt(getArg("-h", "50"), 10),
        },
      ];

// ─────────────────────────────────────────────────────────────────────────────
// Benchmark Engine
// ─────────────────────────────────────────────────────────────────────────────
interface BenchResult {
  algorithm: Algorithm;
  size: SizeConfig;
  times: number[];
  failures: number;
  rooms: number[];
  corridors: number[];
}

function runBenchmark(
  algo: Algorithm,
  size: SizeConfig,
  numRuns: number,
): BenchResult {
  const config: GenerationConfig = {
    width: size.width,
    height: size.height,
    seed: createSeed(baseSeed),
    algorithm: algo,
  };

  // Warmup
  for (let i = 0; i < 3; i++) generate(config);

  const times: number[] = [];
  const rooms: number[] = [];
  const corridors: number[] = [];
  let failures = 0;

  for (let i = 0; i < numRuns; i++) {
    const iterSeed = createSeed(baseSeed + i);
    const start = performance.now();
    const result = generate({ ...config, seed: iterSeed });
    const elapsed = performance.now() - start;

    times.push(elapsed);
    if (result.success) {
      rooms.push(result.artifact.rooms.length);
      corridors.push(result.artifact.connections.length);
    } else {
      failures++;
    }
  }

  return { algorithm: algo, size, times, failures, rooms, corridors };
}

function computeStats(times: number[]) {
  const sorted = [...times].sort((a, b) => a - b);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = sorted[0]!;
  const max = sorted[sorted.length - 1]!;
  const p50 = sorted[Math.floor(sorted.length * 0.5)]!;
  const p95 = sorted[Math.floor(sorted.length * 0.95)]!;
  const p99 = sorted[Math.floor(sorted.length * 0.99)]!;
  const stdDev = Math.sqrt(
    times.reduce((acc, t) => acc + (t - avg) ** 2, 0) / times.length,
  );
  return { avg, min, max, p50, p95, p99, stdDev, throughput: 1000 / avg };
}

// ─────────────────────────────────────────────────────────────────────────────
// Rendering
// ─────────────────────────────────────────────────────────────────────────────
function renderPreview(terrain: Uint8Array, width: number, height: number) {
  const maxW = Math.min(width, 70);
  const maxH = Math.min(height, 30);
  const scaleX = width / maxW;
  const scaleY = height / maxH;

  console.log(fmt.muted(`  ┌${"─".repeat(maxW)}┐`));

  for (let y = 0; y < maxH; y += 2) {
    let line = fmt.muted("  │");
    for (let x = 0; x < maxW; x++) {
      const srcX = Math.floor(x * scaleX);
      const srcY1 = Math.floor(y * scaleY);
      const srcY2 = Math.floor((y + 1) * scaleY);

      const top = terrain[srcY1 * width + srcX] === CellType.FLOOR;
      const bot =
        srcY2 < height && terrain[srcY2 * width + srcX] === CellType.FLOOR;

      if (top && bot) line += `${c.white}█`;
      else if (top) line += `${c.white}▀`;
      else if (bot) line += `${c.white}▄`;
      else line += `${c.gray}░`;
    }
    console.log(line + c.reset + fmt.muted("│"));
  }

  console.log(fmt.muted(`  └${"─".repeat(maxW)}┘`));
}

function formatMs(n: number, w = 7): string {
  return n.toFixed(2).padStart(w);
}

function formatRate(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toFixed(0);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main
// ─────────────────────────────────────────────────────────────────────────────
const results: BenchResult[] = [];

if (!jsonOutput) {
  console.log();
  console.log(fmt.title("  PROCGEN BENCHMARK"));
  if (isFullMode) console.log(fmt.muted("  Full Suite"));
  else if (isStressMode) console.log(fmt.muted("  Stress Test"));
  console.log(fmt.muted(`  ${"─".repeat(50)}`));
  console.log();
}

// Run benchmarks
for (const algo of algorithms) {
  for (const size of sizes) {
    if (!jsonOutput) {
      const sizeLabel = size.name ? `${size.name} ` : "";
      process.stdout.write(
        `  ${fmt.algo(algo.toUpperCase().padEnd(8))} ${fmt.muted(sizeLabel)}${fmt.value(`${size.width}×${size.height}`).padEnd(12)} `,
      );
    }

    const result = runBenchmark(algo, size, runs);
    results.push(result);

    if (!jsonOutput) {
      const stats = computeStats(result.times);
      const statusIcon =
        result.failures === 0
          ? fmt.success("✓")
          : fmt.warn(`⚠ ${result.failures}`);
      console.log(
        `${fmt.value(formatMs(stats.avg))} ms  ` +
          `${fmt.muted("±")}${fmt.value(stats.stdDev.toFixed(1).padStart(4))}  ` +
          `${fmt.accent(formatRate(stats.throughput).padStart(5))}${fmt.muted("/s")}  ${statusIcon}`,
      );
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Summary
// ─────────────────────────────────────────────────────────────────────────────
if (!jsonOutput && (isFullMode || isStressMode || algorithms.length > 1)) {
  console.log();
  console.log(fmt.muted(`  ${"─".repeat(50)}`));
  console.log(fmt.title("  Summary"));
  console.log();

  // Table header
  const algoWidth = 10;
  const colWidth = 10;
  let header = `  ${"".padEnd(algoWidth)}`;
  for (const size of sizes) {
    header += (size.name || `${size.width}×${size.height}`).padStart(colWidth);
  }
  console.log(fmt.muted(header));
  console.log(
    fmt.muted(`  ${"─".repeat(algoWidth + sizes.length * colWidth)}`),
  );

  // Table rows
  for (const algo of algorithms) {
    let row = `  ${fmt.algo(algo.toUpperCase().padEnd(algoWidth))}`;
    for (const size of sizes) {
      const result = results.find(
        (r) => r.algorithm === algo && r.size === size,
      )!;
      const stats = computeStats(result.times);
      row += fmt.value(formatMs(stats.avg, colWidth - 3)) + fmt.muted("ms ");
    }
    console.log(row);
  }

  // Best per size
  console.log();
  let bestRow = `  ${fmt.muted("Best".padEnd(algoWidth))}`;
  for (const size of sizes) {
    const sizeResults = results.filter((r) => r.size === size);
    const best = sizeResults.reduce((a, b) =>
      computeStats(a.times).avg < computeStats(b.times).avg ? a : b,
    );
    bestRow += fmt.success(best.algorithm.toUpperCase().padStart(colWidth));
  }
  console.log(bestRow);

  // Throughput comparison
  console.log();
  console.log(fmt.title("  Throughput (dungeons/sec)"));
  console.log();
  for (const algo of algorithms) {
    const algoResults = results.filter((r) => r.algorithm === algo);
    const avgThroughput =
      algoResults.reduce(
        (sum, r) => sum + computeStats(r.times).throughput,
        0,
      ) / algoResults.length;
    const bar = "█".repeat(Math.min(40, Math.floor(avgThroughput / 20)));
    console.log(
      `  ${fmt.algo(algo.toUpperCase().padEnd(10))} ${fmt.value(bar)} ${fmt.accent(formatRate(avgThroughput))}/s`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Detailed stats (stress mode)
// ─────────────────────────────────────────────────────────────────────────────
if (!jsonOutput && isStressMode) {
  console.log();
  console.log(fmt.muted(`  ${"─".repeat(50)}`));
  console.log(fmt.title("  Percentiles"));
  console.log();

  for (const result of results) {
    const stats = computeStats(result.times);
    console.log(`  ${fmt.algo(result.algorithm.toUpperCase())}`);
    console.log(
      `    P50 ${fmt.value(formatMs(stats.p50))}ms   ` +
        `P95 ${fmt.value(formatMs(stats.p95))}ms   ` +
        `P99 ${fmt.value(formatMs(stats.p99))}ms   ` +
        `Max ${fmt.value(formatMs(stats.max))}ms`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Preview (quick mode only)
// ─────────────────────────────────────────────────────────────────────────────
if (showMap && results.length === 1) {
  const result = results[0]!;
  const lastSeed = createSeed(baseSeed + runs - 1);
  const lastRun = generate({
    width: result.size.width,
    height: result.size.height,
    seed: lastSeed,
    algorithm: result.algorithm,
  });

  if (lastRun.success) {
    console.log();
    renderPreview(
      lastRun.artifact.terrain,
      result.size.width,
      result.size.height,
    );

    const avgRooms = Math.round(
      result.rooms.reduce((a, b) => a + b, 0) / result.rooms.length,
    );
    const avgCorridors = Math.round(
      result.corridors.reduce((a, b) => a + b, 0) / result.corridors.length,
    );
    const floorCount = lastRun.artifact.terrain.filter(
      (t) => t === CellType.FLOOR,
    ).length;
    const ratio = (
      (floorCount / (result.size.width * result.size.height)) *
      100
    ).toFixed(0);

    console.log();
    console.log(
      `  ${fmt.label("Rooms")} ${fmt.value(avgRooms.toString().padStart(3))}  ` +
        `${fmt.label("Corridors")} ${fmt.value(avgCorridors.toString().padStart(3))}  ` +
        `${fmt.label("Floor")} ${fmt.value(`${ratio}%`)}  ` +
        `${fmt.muted(lastRun.artifact.checksum.slice(0, 16))}`,
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// JSON Output
// ─────────────────────────────────────────────────────────────────────────────
if (jsonOutput) {
  const jsonResults = results.map((r) => ({
    algorithm: r.algorithm,
    width: r.size.width,
    height: r.size.height,
    runs,
    failures: r.failures,
    ...computeStats(r.times),
    avgRooms:
      r.rooms.length > 0
        ? r.rooms.reduce((a, b) => a + b, 0) / r.rooms.length
        : 0,
  }));
  console.log(JSON.stringify(jsonResults, null, 2));
} else {
  console.log();
}
