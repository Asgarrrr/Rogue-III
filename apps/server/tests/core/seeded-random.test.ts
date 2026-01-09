import { describe, expect, test } from "bun:test";
import { SeededRandom } from "../../src/game/dungeon/core/random/seeded-random";

describe("SeededRandom (xorshift128+)", () => {
  test("produces deterministic sequences and supports state restore", () => {
    const rngA = new SeededRandom(123456);
    const seqA = Array.from({ length: 5 }, () => rngA.next());
    const savedState = rngA.getState();

    // A fresh generator with the same seed should match the first sequence
    const rngB = new SeededRandom(123456);
    const seqB = Array.from({ length: 5 }, () => rngB.next());
    expect(seqB).toEqual(seqA);

    // Advancing the original instance diverges then resumes after restore
    const advanced = rngA.next();
    expect(advanced).not.toBe(seqA[0]);

    rngA.setState(savedState);
    const resumed = rngA.next();
    expect(resumed).toBeCloseTo(advanced, 15);
  });

  test("approximates a uniform distribution (mean/variance sanity)", () => {
    const rng = new SeededRandom(987654321);
    const samples = 20000;

    let sum = 0;
    let sumSquares = 0;
    for (let i = 0; i < samples; i++) {
      const value = rng.next();
      sum += value;
      sumSquares += value * value;
    }

    const mean = sum / samples;
    const variance = sumSquares / samples - mean * mean;

    // For a uniform [0,1), mean ~ 0.5 and variance ~ 1/12 (~0.0833)
    expect(mean).toBeGreaterThan(0.49);
    expect(mean).toBeLessThan(0.51);
    expect(variance).toBeGreaterThan(0.075);
    expect(variance).toBeLessThan(0.09);
  });

  test("range helper stays within bounds and covers edges", () => {
    const rng = new SeededRandom(42);
    const hits = new Set<number>();

    for (let i = 0; i < 5000; i++) {
      const value = rng.range(1, 3);
      hits.add(value);
      expect(value).toBeGreaterThanOrEqual(1);
      expect(value).toBeLessThanOrEqual(3);
    }

    expect(hits.has(1)).toBe(true);
    expect(hits.has(2)).toBe(true);
    expect(hits.has(3)).toBe(true);
  });
});
