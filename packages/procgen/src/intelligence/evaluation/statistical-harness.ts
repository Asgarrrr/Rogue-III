/**
 * Statistical Evaluation Harness
 *
 * Runs multiple dungeon generations and collects comprehensive statistics
 * for quality assurance and tuning. Supports:
 * - Distribution analysis (percentiles, histograms)
 * - Failure rate tracking
 * - Performance profiling
 * - Constraint satisfaction rates
 */

import type { DungeonStateArtifact } from "../../pipeline/types";
import type { DimensionalScores, WalkerResult } from "../simulation/types";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Configuration for statistical evaluation.
 */
export interface EvaluationConfig {
  /** Number of dungeons to generate */
  readonly sampleSize: number;
  /** Base seed (generations use seed + i) */
  readonly baseSeed: number;
  /** Whether to run simulations */
  readonly runSimulations: boolean;
  /** Whether to run constraint validation */
  readonly runConstraints: boolean;
  /** Maximum generation time in ms before timeout */
  readonly timeoutMs: number;
  /** Custom metrics collectors */
  readonly customMetrics?: readonly MetricCollector[];
}

/**
 * Default evaluation configuration.
 */
export const DEFAULT_EVALUATION_CONFIG: EvaluationConfig = {
  sampleSize: 100,
  baseSeed: 12345,
  runSimulations: true,
  runConstraints: true,
  timeoutMs: 5000,
};

/**
 * A single sample result.
 */
export interface SampleResult {
  readonly seed: number;
  readonly index: number;
  readonly success: boolean;
  readonly error?: string;
  readonly generationTimeMs: number;
  readonly metrics: SampleMetrics;
}

/**
 * Metrics collected for a single sample.
 */
export interface SampleMetrics {
  readonly roomCount: number;
  readonly connectionCount: number;
  readonly spawnCount: number;
  readonly floorRatio: number;
  readonly criticalPathLength: number;
  readonly deadEndCount: number;
  readonly constraintScore?: number;
  readonly simulationCompleted?: boolean;
  readonly pacingScore?: number;
  readonly dimensionalScores?: DimensionalScores;
  readonly custom?: Record<string, number>;
}

/**
 * Statistical summary for a metric.
 */
export interface MetricStats {
  readonly name: string;
  readonly count: number;
  readonly min: number;
  readonly max: number;
  readonly mean: number;
  readonly median: number;
  readonly stdDev: number;
  readonly percentile5: number;
  readonly percentile25: number;
  readonly percentile75: number;
  readonly percentile95: number;
  readonly histogram: HistogramBin[];
}

/**
 * Histogram bin.
 */
export interface HistogramBin {
  readonly min: number;
  readonly max: number;
  readonly count: number;
  readonly percentage: number;
}

/**
 * Failure analysis.
 */
export interface FailureAnalysis {
  readonly totalFailures: number;
  readonly failureRate: number;
  readonly errorTypes: ReadonlyMap<string, number>;
  readonly failingSeedExamples: readonly number[];
}

/**
 * Complete evaluation result.
 */
export interface EvaluationResult {
  readonly config: EvaluationConfig;
  readonly totalSamples: number;
  readonly successCount: number;
  readonly failureCount: number;
  readonly successRate: number;
  readonly totalDurationMs: number;
  readonly avgGenerationTimeMs: number;

  readonly metricStats: ReadonlyMap<string, MetricStats>;
  readonly failureAnalysis: FailureAnalysis;
  readonly samples: readonly SampleResult[];

  /** Correlation between metrics */
  readonly correlations: ReadonlyMap<string, ReadonlyMap<string, number>>;
}

/**
 * Custom metric collector function.
 */
export interface MetricCollector {
  readonly name: string;
  collect(dungeon: DungeonStateArtifact, simulation?: WalkerResult): number;
}

/**
 * Generator function for the harness to call.
 */
export type GeneratorFn = (seed: number) => DungeonStateArtifact | Promise<DungeonStateArtifact>;

/**
 * Simulator function for the harness to call.
 */
export type SimulatorFn = (dungeon: DungeonStateArtifact) => WalkerResult | Promise<WalkerResult>;

/**
 * Constraint validator function.
 */
export type ValidatorFn = (dungeon: DungeonStateArtifact) => { score: number; satisfied: boolean };

// =============================================================================
// STATISTICS HELPERS
// =============================================================================

/**
 * Calculate percentile from sorted array.
 */
function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = (p / 100) * (sorted.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);

  if (lower === upper) {
    return sorted[lower] ?? 0;
  }

  const weight = index - lower;
  return ((sorted[lower] ?? 0) * (1 - weight)) + ((sorted[upper] ?? 0) * weight);
}

/**
 * Calculate standard deviation.
 */
function stdDev(values: readonly number[], mean: number): number {
  if (values.length < 2) return 0;
  const squaredDiffs = values.map(v => (v - mean) ** 2);
  const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(avgSquaredDiff);
}

/**
 * Create histogram bins.
 */
function createHistogram(values: readonly number[], binCount = 10): HistogramBin[] {
  if (values.length === 0) return [];

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const binSize = range / binCount;

  const bins: HistogramBin[] = [];

  for (let i = 0; i < binCount; i++) {
    const binMin = min + (i * binSize);
    const binMax = min + ((i + 1) * binSize);
    const count = values.filter(v =>
      i === binCount - 1
        ? v >= binMin && v <= binMax
        : v >= binMin && v < binMax
    ).length;

    bins.push({
      min: binMin,
      max: binMax,
      count,
      percentage: (count / values.length) * 100,
    });
  }

  return bins;
}

/**
 * Calculate Pearson correlation coefficient.
 */
function correlation(x: readonly number[], y: readonly number[]): number {
  if (x.length !== y.length || x.length < 2) return 0;

  const n = x.length;
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0, sumY2 = 0;

  for (let i = 0; i < n; i++) {
    const xi = x[i] ?? 0;
    const yi = y[i] ?? 0;
    sumX += xi;
    sumY += yi;
    sumXY += xi * yi;
    sumX2 += xi * xi;
    sumY2 += yi * yi;
  }

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt(
    (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY)
  );

  return denominator === 0 ? 0 : numerator / denominator;
}

/**
 * Calculate statistics for a metric.
 */
function calculateMetricStats(name: string, values: readonly number[]): MetricStats {
  if (values.length === 0) {
    return {
      name,
      count: 0,
      min: 0,
      max: 0,
      mean: 0,
      median: 0,
      stdDev: 0,
      percentile5: 0,
      percentile25: 0,
      percentile75: 0,
      percentile95: 0,
      histogram: [],
    };
  }

  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((a, b) => a + b, 0);
  const mean = sum / values.length;

  return {
    name,
    count: values.length,
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    mean,
    median: percentile(sorted, 50),
    stdDev: stdDev(values, mean),
    percentile5: percentile(sorted, 5),
    percentile25: percentile(sorted, 25),
    percentile75: percentile(sorted, 75),
    percentile95: percentile(sorted, 95),
    histogram: createHistogram(values),
  };
}

// =============================================================================
// HARNESS IMPLEMENTATION
// =============================================================================

/**
 * Extract metrics from a dungeon and optional simulation.
 */
function extractMetrics(
  dungeon: DungeonStateArtifact,
  simulation?: WalkerResult,
  customCollectors?: readonly MetricCollector[],
): SampleMetrics {
  const { rooms, connections, spawns, grid } = dungeon;

  // Calculate floor ratio
  let floorCount = 0;
  const totalCells = grid.width * grid.height;
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      if (grid.get(x, y) === 1) floorCount++;
    }
  }

  // Count dead ends (rooms with only 1 connection)
  const connectionCounts = new Map<number, number>();
  for (const conn of connections) {
    connectionCounts.set(conn.fromRoomId, (connectionCounts.get(conn.fromRoomId) ?? 0) + 1);
    connectionCounts.set(conn.toRoomId, (connectionCounts.get(conn.toRoomId) ?? 0) + 1);
  }
  const deadEndCount = Array.from(connectionCounts.values()).filter(c => c === 1).length;

  // Estimate critical path (longest shortest path from entrance to exit)
  // Simplified: use room count as proxy
  const criticalPathLength = rooms.length;

  // Collect custom metrics
  const custom: Record<string, number> = {};
  if (customCollectors) {
    for (const collector of customCollectors) {
      custom[collector.name] = collector.collect(dungeon, simulation);
    }
  }

  return {
    roomCount: rooms.length,
    connectionCount: connections.length,
    spawnCount: spawns.length,
    floorRatio: totalCells > 0 ? floorCount / totalCells : 0,
    criticalPathLength,
    deadEndCount,
    simulationCompleted: simulation?.completed,
    pacingScore: simulation?.metrics ? undefined : undefined, // Would come from pacing analysis
    dimensionalScores: undefined, // Would come from pacing analysis
    custom: Object.keys(custom).length > 0 ? custom : undefined,
  };
}

/**
 * Run the statistical evaluation harness.
 */
export async function runEvaluation(
  generator: GeneratorFn,
  config: Partial<EvaluationConfig> = {},
  simulator?: SimulatorFn,
  validator?: ValidatorFn,
): Promise<EvaluationResult> {
  const fullConfig: EvaluationConfig = {
    ...DEFAULT_EVALUATION_CONFIG,
    ...config,
  };

  const startTime = performance.now();
  const samples: SampleResult[] = [];
  const errorCounts = new Map<string, number>();
  const failingSeeds: number[] = [];

  // Run samples
  for (let i = 0; i < fullConfig.sampleSize; i++) {
    const seed = fullConfig.baseSeed + i;
    const sampleStart = performance.now();

    try {
      // Generate dungeon
      const dungeon = await Promise.race([
        Promise.resolve(generator(seed)),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Timeout")), fullConfig.timeoutMs)
        ),
      ]);

      // Run simulation if configured
      let simulation: WalkerResult | undefined;
      if (fullConfig.runSimulations && simulator) {
        simulation = await simulator(dungeon);
      }

      // Run constraints if configured
      let constraintScore: number | undefined;
      if (fullConfig.runConstraints && validator) {
        const result = validator(dungeon);
        constraintScore = result.score;
      }

      const metrics = extractMetrics(dungeon, simulation, fullConfig.customMetrics);

      samples.push({
        seed,
        index: i,
        success: true,
        generationTimeMs: performance.now() - sampleStart,
        metrics: {
          ...metrics,
          constraintScore,
        },
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorType = error instanceof Error ? error.name : "UnknownError";

      errorCounts.set(errorType, (errorCounts.get(errorType) ?? 0) + 1);
      if (failingSeeds.length < 10) {
        failingSeeds.push(seed);
      }

      samples.push({
        seed,
        index: i,
        success: false,
        error: errorMsg,
        generationTimeMs: performance.now() - sampleStart,
        metrics: {
          roomCount: 0,
          connectionCount: 0,
          spawnCount: 0,
          floorRatio: 0,
          criticalPathLength: 0,
          deadEndCount: 0,
        },
      });
    }
  }

  const totalDurationMs = performance.now() - startTime;
  const successfulSamples = samples.filter(s => s.success);
  const failureCount = samples.length - successfulSamples.length;

  // Calculate metric statistics
  const metricStats = new Map<string, MetricStats>();
  const metricValues: Record<string, number[]> = {
    roomCount: [],
    connectionCount: [],
    spawnCount: [],
    floorRatio: [],
    criticalPathLength: [],
    deadEndCount: [],
    generationTimeMs: [],
    constraintScore: [],
  };

  for (const sample of successfulSamples) {
    metricValues.roomCount.push(sample.metrics.roomCount);
    metricValues.connectionCount.push(sample.metrics.connectionCount);
    metricValues.spawnCount.push(sample.metrics.spawnCount);
    metricValues.floorRatio.push(sample.metrics.floorRatio);
    metricValues.criticalPathLength.push(sample.metrics.criticalPathLength);
    metricValues.deadEndCount.push(sample.metrics.deadEndCount);
    metricValues.generationTimeMs.push(sample.generationTimeMs);
    if (sample.metrics.constraintScore !== undefined) {
      metricValues.constraintScore.push(sample.metrics.constraintScore);
    }

    // Custom metrics
    if (sample.metrics.custom) {
      for (const [key, value] of Object.entries(sample.metrics.custom)) {
        if (!metricValues[key]) {
          metricValues[key] = [];
        }
        metricValues[key].push(value);
      }
    }
  }

  for (const [name, values] of Object.entries(metricValues)) {
    if (values.length > 0) {
      metricStats.set(name, calculateMetricStats(name, values));
    }
  }

  // Calculate correlations between metrics
  const correlations = new Map<string, Map<string, number>>();
  const metricNames = Array.from(metricStats.keys());

  for (const nameA of metricNames) {
    const corrMap = new Map<string, number>();
    const valuesA = metricValues[nameA] ?? [];

    for (const nameB of metricNames) {
      if (nameA !== nameB) {
        const valuesB = metricValues[nameB] ?? [];
        if (valuesA.length === valuesB.length && valuesA.length > 0) {
          corrMap.set(nameB, correlation(valuesA, valuesB));
        }
      }
    }

    correlations.set(nameA, corrMap);
  }

  const avgGenerationTimeMs = successfulSamples.length > 0
    ? successfulSamples.reduce((sum, s) => sum + s.generationTimeMs, 0) / successfulSamples.length
    : 0;

  return {
    config: fullConfig,
    totalSamples: samples.length,
    successCount: successfulSamples.length,
    failureCount,
    successRate: samples.length > 0 ? successfulSamples.length / samples.length : 0,
    totalDurationMs,
    avgGenerationTimeMs,
    metricStats,
    failureAnalysis: {
      totalFailures: failureCount,
      failureRate: samples.length > 0 ? failureCount / samples.length : 0,
      errorTypes: errorCounts,
      failingSeedExamples: failingSeeds,
    },
    samples,
    correlations,
  };
}

/**
 * Format evaluation result as a human-readable report.
 */
export function formatEvaluationReport(result: EvaluationResult): string {
  const lines: string[] = [
    "=" .repeat(60),
    "STATISTICAL EVALUATION REPORT",
    "=" .repeat(60),
    "",
    `Samples: ${result.totalSamples}`,
    `Success Rate: ${(result.successRate * 100).toFixed(1)}% (${result.successCount}/${result.totalSamples})`,
    `Total Duration: ${result.totalDurationMs.toFixed(0)}ms`,
    `Avg Generation Time: ${result.avgGenerationTimeMs.toFixed(1)}ms`,
    "",
  ];

  // Metric statistics
  lines.push("-".repeat(60));
  lines.push("METRIC STATISTICS");
  lines.push("-".repeat(60));

  for (const [name, stats] of result.metricStats) {
    lines.push(`\n${name}:`);
    lines.push(`  Range: ${stats.min.toFixed(2)} - ${stats.max.toFixed(2)}`);
    lines.push(`  Mean: ${stats.mean.toFixed(2)} (±${stats.stdDev.toFixed(2)})`);
    lines.push(`  Median: ${stats.median.toFixed(2)}`);
    lines.push(`  Percentiles: P5=${stats.percentile5.toFixed(2)}, P25=${stats.percentile25.toFixed(2)}, P75=${stats.percentile75.toFixed(2)}, P95=${stats.percentile95.toFixed(2)}`);
  }

  // Failure analysis
  if (result.failureCount > 0) {
    lines.push("");
    lines.push("-".repeat(60));
    lines.push("FAILURE ANALYSIS");
    lines.push("-".repeat(60));
    lines.push(`\nTotal Failures: ${result.failureCount} (${(result.failureAnalysis.failureRate * 100).toFixed(1)}%)`);

    lines.push("\nError Types:");
    for (const [type, count] of result.failureAnalysis.errorTypes) {
      lines.push(`  ${type}: ${count}`);
    }

    if (result.failureAnalysis.failingSeedExamples.length > 0) {
      lines.push(`\nFailing Seeds (examples): ${result.failureAnalysis.failingSeedExamples.join(", ")}`);
    }
  }

  // Notable correlations
  lines.push("");
  lines.push("-".repeat(60));
  lines.push("NOTABLE CORRELATIONS (|r| > 0.5)");
  lines.push("-".repeat(60));

  const seen = new Set<string>();
  for (const [nameA, corrMap] of result.correlations) {
    for (const [nameB, corr] of corrMap) {
      const key = [nameA, nameB].sort().join("-");
      if (!seen.has(key) && Math.abs(corr) > 0.5) {
        seen.add(key);
        const sign = corr > 0 ? "+" : "";
        lines.push(`  ${nameA} ↔ ${nameB}: ${sign}${corr.toFixed(3)}`);
      }
    }
  }

  lines.push("");
  lines.push("=".repeat(60));

  return lines.join("\n");
}

/**
 * Create a custom metric collector.
 */
export function createMetricCollector(
  name: string,
  collectFn: (dungeon: DungeonStateArtifact, simulation?: WalkerResult) => number,
): MetricCollector {
  return { name, collect: collectFn };
}
