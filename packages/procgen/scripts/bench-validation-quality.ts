#!/usr/bin/env bun
/// <reference types="bun-types" />

import {
  assessQuality,
  createSeed,
  generate,
  type GenerationConfig,
  validateDungeon,
} from "../src";
import type { DungeonArtifact } from "../src/pipeline/types";

type Algorithm = "bsp" | "cellular" | "hybrid";

interface Size {
  readonly width: number;
  readonly height: number;
}

interface Stats {
  readonly avg: number;
  readonly min: number;
  readonly p50: number;
  readonly p95: number;
  readonly p99: number;
  readonly max: number;
  readonly stdDev: number;
  readonly throughput: number;
}

interface BenchEntry {
  readonly algorithm: Algorithm;
  readonly width: number;
  readonly height: number;
  readonly artifactCount: number;
  readonly rounds: number;
  readonly validate: Stats;
  readonly quality: Stats;
  readonly qualityOverValidateRatio: number;
}

interface ParsedArgs {
  readonly algorithms: readonly Algorithm[];
  readonly sizes: readonly Size[];
  readonly artifactCount: number;
  readonly rounds: number;
  readonly warmupRounds: number;
  readonly baseSeed: number;
  readonly json: boolean;
}

const ALGORITHMS: readonly Algorithm[] = ["bsp", "cellular", "hybrid"];
const DEFAULT_SIZES = "80x60,200x150";
const DEFAULT_ARTIFACT_COUNT = 200;
const DEFAULT_ROUNDS = 30;
const DEFAULT_WARMUP = 6;
const DEFAULT_SEED = 12345;

function usage(exitCode: number = 1): never {
  console.error(`
Usage: bun run scripts/bench-validation-quality.ts [options]

Options:
  -a, --algo <list>          Algorithms (comma-separated): bsp,cellular,hybrid
                             Default: bsp,cellular,hybrid
  --sizes <list>             Sizes (comma-separated): 80x60,200x150
                             Default: ${DEFAULT_SIZES}
  --count <n>                Number of generated artifacts per case
                             Default: ${DEFAULT_ARTIFACT_COUNT}
  --rounds <n>               Measured rounds
                             Default: ${DEFAULT_ROUNDS}
  --warmup <n>               Warmup rounds
                             Default: ${DEFAULT_WARMUP}
  --seed <n>                 Base seed for artifact generation
                             Default: ${DEFAULT_SEED}
  --json                     JSON output
  --help                     Show this help
`);
  process.exit(exitCode);
}

function parsePositiveIntFlag(raw: string | undefined, fallback: number): number {
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Invalid positive integer: ${raw}`);
  }
  return parsed;
}

function parseNonNegativeIntFlag(
  raw: string | undefined,
  fallback: number,
): number {
  if (raw === undefined) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid non-negative integer: ${raw}`);
  }
  return parsed;
}

function parseAlgorithms(raw: string | undefined): readonly Algorithm[] {
  if (!raw) return ALGORITHMS;
  const parts = raw
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length === 0) {
    throw new Error("No algorithm provided");
  }
  const unique = new Set<Algorithm>();
  for (const part of parts) {
    if (!ALGORITHMS.includes(part as Algorithm)) {
      throw new Error(`Unsupported algorithm: ${part}`);
    }
    unique.add(part as Algorithm);
  }
  return Array.from(unique);
}

function parseSizes(raw: string | undefined): readonly Size[] {
  const value = raw ?? DEFAULT_SIZES;
  const parts = value
    .split(",")
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (parts.length === 0) {
    throw new Error("No size provided");
  }

  const sizes: Size[] = [];
  for (const part of parts) {
    const [wRaw, hRaw] = part.split("x");
    const width = Number(wRaw);
    const height = Number(hRaw);
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      !Number.isInteger(width) ||
      !Number.isInteger(height) ||
      width <= 0 ||
      height <= 0
    ) {
      throw new Error(`Invalid size: ${part}. Expected WIDTHxHEIGHT`);
    }
    sizes.push({ width, height });
  }
  return sizes;
}

function parseArgs(argv: readonly string[]): ParsedArgs {
  if (argv.includes("--help") || argv.includes("-h")) {
    usage(0);
  }

  const getFlagValue = (...flags: readonly string[]): string | undefined => {
    for (let i = 0; i < argv.length; i++) {
      const arg = argv[i];
      if (arg !== undefined && flags.includes(arg)) {
        return argv[i + 1];
      }
    }
    return undefined;
  };

  const algorithms = parseAlgorithms(getFlagValue("-a", "--algo"));
  const sizes = parseSizes(getFlagValue("--sizes"));
  const artifactCount = parsePositiveIntFlag(
    getFlagValue("--count"),
    DEFAULT_ARTIFACT_COUNT,
  );
  const rounds = parsePositiveIntFlag(getFlagValue("--rounds"), DEFAULT_ROUNDS);
  const warmupRounds = parsePositiveIntFlag(
    getFlagValue("--warmup"),
    DEFAULT_WARMUP,
  );
  const baseSeed = parseNonNegativeIntFlag(
    getFlagValue("--seed"),
    DEFAULT_SEED,
  );
  const json = argv.includes("--json");

  return {
    algorithms,
    sizes,
    artifactCount,
    rounds,
    warmupRounds,
    baseSeed,
    json,
  };
}

function computeStats(samples: readonly number[]): Stats {
  const sorted = [...samples].sort((a, b) => a - b);
  const avg = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  const min = sorted[0] ?? 0;
  const max = sorted[sorted.length - 1] ?? 0;
  const p50 = sorted[Math.floor(sorted.length * 0.5)] ?? 0;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] ?? 0;
  const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 0;
  const stdDev = Math.sqrt(
    samples.reduce((acc, value) => acc + (value - avg) ** 2, 0) /
      samples.length,
  );
  const throughput = avg > 0 ? 1000 / avg : 0;
  return { avg, min, p50, p95, p99, max, stdDev, throughput };
}

function generateArtifacts(
  config: Omit<GenerationConfig, "seed"> & { readonly algorithm: Algorithm },
  count: number,
  baseSeed: number,
): DungeonArtifact[] {
  const artifacts: DungeonArtifact[] = [];
  for (let i = 0; i < count; i++) {
    const result = generate(
      {
        ...config,
        seed: createSeed(baseSeed + i),
      },
      { skipValidation: true },
    );
    if (!result.success) {
      throw new Error(
        `Generation failed for seed ${baseSeed + i}: ${result.error.message}`,
      );
    }
    artifacts.push(result.artifact);
  }
  return artifacts;
}

function benchmarkPerArtifact(
  artifacts: readonly DungeonArtifact[],
  rounds: number,
  warmupRounds: number,
  runner: (artifact: DungeonArtifact) => number,
): { readonly stats: Stats; readonly sink: number } {
  let sink = 0;

  const runRound = (): number => {
    const start = performance.now();
    for (const artifact of artifacts) {
      sink += runner(artifact);
    }
    const elapsedMs = performance.now() - start;
    return elapsedMs / artifacts.length;
  };

  for (let i = 0; i < warmupRounds; i++) {
    runRound();
  }

  const samples: number[] = [];
  for (let i = 0; i < rounds; i++) {
    samples.push(runRound());
  }

  return {
    stats: computeStats(samples),
    sink,
  };
}

function formatMs(value: number): string {
  return `${value.toFixed(4)}ms`;
}

function renderHuman(entries: readonly BenchEntry[]): void {
  console.log("PROCGEN validation/quality microbench");
  console.log("-----------------------------------");
  console.log(
    "Metric: milliseconds per artifact (generation excluded; pre-generated dataset)",
  );
  console.log("");

  for (const entry of entries) {
    const title = `${entry.algorithm.toUpperCase()} ${entry.width}x${entry.height}`;
    console.log(title);
    console.log(
      `  validateDungeon avg=${formatMs(entry.validate.avg)} p95=${formatMs(entry.validate.p95)} p99=${formatMs(entry.validate.p99)} throughput=${entry.validate.throughput.toFixed(0)}/s`,
    );
    console.log(
      `  assessQuality  avg=${formatMs(entry.quality.avg)} p95=${formatMs(entry.quality.p95)} p99=${formatMs(entry.quality.p99)} throughput=${entry.quality.throughput.toFixed(0)}/s`,
    );
    console.log(
      `  ratio quality/validate: ${entry.qualityOverValidateRatio.toFixed(2)}x`,
    );
    console.log("");
  }
}

function main(): void {
  let args: ParsedArgs;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Argument error: ${message}`);
    usage();
  }

  const entries: BenchEntry[] = [];
  let sink = 0;

  for (const algorithm of args.algorithms) {
    for (const size of args.sizes) {
      const artifacts = generateArtifacts(
        {
          width: size.width,
          height: size.height,
          algorithm,
        },
        args.artifactCount,
        args.baseSeed,
      );

      const validate = benchmarkPerArtifact(
        artifacts,
        args.rounds,
        args.warmupRounds,
        (artifact) => {
          const result = validateDungeon(artifact);
          return result.violations.length + (result.success ? 1 : 0);
        },
      );

      const quality = benchmarkPerArtifact(
        artifacts,
        args.rounds,
        args.warmupRounds,
        (artifact) => {
          const result = assessQuality(artifact);
          return result.score + (result.success ? 1 : 0);
        },
      );

      sink += validate.sink + quality.sink;

      entries.push({
        algorithm,
        width: size.width,
        height: size.height,
        artifactCount: args.artifactCount,
        rounds: args.rounds,
        validate: validate.stats,
        quality: quality.stats,
        qualityOverValidateRatio:
          validate.stats.avg > 0 ? quality.stats.avg / validate.stats.avg : 0,
      });
    }
  }

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          benchmark: "validation-quality",
          artifactCount: args.artifactCount,
          rounds: args.rounds,
          warmupRounds: args.warmupRounds,
          baseSeed: args.baseSeed,
          entries,
          sink,
        },
        null,
        2,
      ),
    );
  } else {
    renderHuman(entries);
    // Prevent accidental dead-code elimination in future JS engines.
    console.log(`sink=${sink}`);
  }
}

main();
