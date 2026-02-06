/**
 * Property-Based Determinism Tests
 *
 * Verify that generation is perfectly deterministic.
 */

import { describe, expect, it } from "bun:test";
import type { GenerationConfig } from "../../src";
import { createSeed, generate } from "../../src";

const SEED_COUNT = 500;

describe("property: determinism is absolute", () => {
  it("same seed always produces identical checksum", () => {
    const mismatches: Array<{
      seed: number;
      checksum1: string;
      checksum2: string;
    }> = [];

    for (let i = 0; i < SEED_COUNT; i++) {
      const config: GenerationConfig = {
        width: 80,
        height: 60,
        seed: createSeed(i),
        algorithm: "bsp",
      };

      const result1 = generate(config);
      const result2 = generate(config);

      if (result1.success && result2.success) {
        if (result1.artifact.checksum !== result2.artifact.checksum) {
          mismatches.push({
            seed: i,
            checksum1: result1.artifact.checksum,
            checksum2: result2.artifact.checksum,
          });
        }
      }
    }

    if (mismatches.length > 0) {
      console.error("\nDeterminism failures:", mismatches.slice(0, 5));
    }

    expect(mismatches.length).toBe(0);
  });

  it("same seed produces identical room count", () => {
    const mismatches: Array<{ seed: number; count1: number; count2: number }> =
      [];

    for (let i = 0; i < SEED_COUNT; i++) {
      const config: GenerationConfig = {
        width: 80,
        height: 60,
        seed: createSeed(i),
        algorithm: "bsp",
      };

      const result1 = generate(config);
      const result2 = generate(config);

      if (result1.success && result2.success) {
        if (result1.artifact.rooms.length !== result2.artifact.rooms.length) {
          mismatches.push({
            seed: i,
            count1: result1.artifact.rooms.length,
            count2: result2.artifact.rooms.length,
          });
        }
      }
    }

    expect(mismatches.length).toBe(0);
  });

  it("same seed produces identical spawn count", () => {
    const mismatches: number[] = [];

    for (let i = 0; i < SEED_COUNT; i++) {
      const config: GenerationConfig = {
        width: 80,
        height: 60,
        seed: createSeed(i),
        algorithm: "bsp",
      };

      const result1 = generate(config);
      const result2 = generate(config);

      if (result1.success && result2.success) {
        if (result1.artifact.spawns.length !== result2.artifact.spawns.length) {
          mismatches.push(i);
        }
      }
    }

    expect(mismatches.length).toBe(0);
  });
});

describe("property: different seeds produce different results", () => {
  it("no checksum collisions in sample", () => {
    const checksums = new Map<string, number[]>();

    for (let i = 0; i < SEED_COUNT; i++) {
      const result = generate({
        width: 80,
        height: 60,
        seed: createSeed(i),
        algorithm: "bsp",
      });

      if (result.success) {
        const existing = checksums.get(result.artifact.checksum) ?? [];
        existing.push(i);
        checksums.set(result.artifact.checksum, existing);
      }
    }

    // Find collisions
    const collisions = Array.from(checksums.entries()).filter(
      ([_, seeds]) => seeds.length > 1,
    );

    if (collisions.length > 0) {
      console.warn("\nChecksum collisions:", collisions);
    }

    // With FNV64, collisions in 500 samples would be extremely rare
    expect(collisions.length).toBe(0);
  });

  it("adjacent seeds produce different layouts", () => {
    let identicalCount = 0;

    for (let i = 0; i < SEED_COUNT - 1; i++) {
      const result1 = generate({
        width: 80,
        height: 60,
        seed: createSeed(i),
        algorithm: "bsp",
      });

      const result2 = generate({
        width: 80,
        height: 60,
        seed: createSeed(i + 1),
        algorithm: "bsp",
      });

      if (result1.success && result2.success) {
        if (result1.artifact.checksum === result2.artifact.checksum) {
          identicalCount++;
        }
      }
    }

    expect(identicalCount).toBe(0);
  });
});
