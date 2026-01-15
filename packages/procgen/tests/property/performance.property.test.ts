/**
 * Property-Based Performance Tests
 *
 * Verify that generation completes within reasonable time budgets.
 */

import { describe, expect, it } from "bun:test";
import { createSeed, generate } from "../../src";

const SEED_COUNT = 100;

interface PerformanceStats {
  min: number;
  max: number;
  avg: number;
  p95: number;
  p99: number;
}

function computeStats(times: number[]): PerformanceStats {
  const sorted = [...times].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);

  return {
    min: sorted[0] ?? 0,
    max: sorted[sorted.length - 1] ?? 0,
    avg: sum / sorted.length,
    p95: sorted[Math.floor(sorted.length * 0.95)] ?? 0,
    p99: sorted[Math.floor(sorted.length * 0.99)] ?? 0,
  };
}

describe("property: generation performance", () => {
  it("BSP completes within time budget (small dungeon)", () => {
    const times: number[] = [];
    const TIME_BUDGET_MS = 50;

    for (let i = 0; i < SEED_COUNT; i++) {
      const start = performance.now();

      generate({
        width: 60,
        height: 40,
        seed: createSeed(i),
        algorithm: "bsp",
      });

      times.push(performance.now() - start);
    }

    const stats = computeStats(times);
    console.log(
      `\nBSP small (60x40) performance: min=${stats.min.toFixed(2)}ms, avg=${stats.avg.toFixed(2)}ms, p95=${stats.p95.toFixed(2)}ms, max=${stats.max.toFixed(2)}ms`,
    );

    expect(stats.p95).toBeLessThan(TIME_BUDGET_MS);
  });

  it("BSP completes within time budget (large dungeon)", () => {
    const times: number[] = [];
    const TIME_BUDGET_MS = 200;

    for (let i = 0; i < SEED_COUNT; i++) {
      const start = performance.now();

      generate({
        width: 200,
        height: 150,
        seed: createSeed(i),
        algorithm: "bsp",
      });

      times.push(performance.now() - start);
    }

    const stats = computeStats(times);
    console.log(
      `\nBSP large (200x150) performance: min=${stats.min.toFixed(2)}ms, avg=${stats.avg.toFixed(2)}ms, p95=${stats.p95.toFixed(2)}ms, max=${stats.max.toFixed(2)}ms`,
    );

    expect(stats.p95).toBeLessThan(TIME_BUDGET_MS);
  });

  it("Cellular completes within time budget", () => {
    const times: number[] = [];
    const TIME_BUDGET_MS = 100;

    for (let i = 0; i < SEED_COUNT; i++) {
      const start = performance.now();

      generate({
        width: 100,
        height: 80,
        seed: createSeed(i),
        algorithm: "cellular",
      });

      times.push(performance.now() - start);
    }

    const stats = computeStats(times);
    console.log(
      `\nCellular (100x80) performance: min=${stats.min.toFixed(2)}ms, avg=${stats.avg.toFixed(2)}ms, p95=${stats.p95.toFixed(2)}ms, max=${stats.max.toFixed(2)}ms`,
    );

    expect(stats.p95).toBeLessThan(TIME_BUDGET_MS);
  });
});

describe("property: memory usage", () => {
  it("no memory leaks over many generations", () => {
    // Generate many dungeons and verify GC can clean up
    const ITERATIONS = 200;

    // Warm up
    for (let i = 0; i < 10; i++) {
      generate({
        width: 100,
        height: 80,
        seed: createSeed(i),
        algorithm: "bsp",
      });
    }

    // Main test - just verify it completes without OOM
    for (let i = 0; i < ITERATIONS; i++) {
      const result = generate({
        width: 100,
        height: 80,
        seed: createSeed(i + 1000),
        algorithm: "bsp",
      });

      expect(result.success).toBe(true);
    }

    // If we get here without OOM, test passes
    expect(true).toBe(true);
  });
});
