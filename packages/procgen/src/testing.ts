/**
 * Testing utilities for dungeon generation.
 * Separated from validation.ts to avoid circular dependencies.
 *
 * This module contains utilities that depend on the generation API,
 * which would create circular imports if kept in validation.ts.
 */

import { generate } from "./api";
import type { GenerationConfig } from "./pipeline/types";

// =============================================================================
// DETERMINISM TESTING
// =============================================================================

/**
 * Error thrown when determinism assertion fails
 */
export class DeterminismViolationError extends Error {
  constructor(
    public readonly checksums: string[],
    public readonly config: GenerationConfig,
  ) {
    super(
      `Non-deterministic generation detected: produced ${checksums.length} different checksums for the same seed`,
    );
    this.name = "DeterminismViolationError";
  }
}

/**
 * Assert that a generator produces deterministic output.
 *
 * Runs generation multiple times with the same seed and verifies
 * all runs produce identical checksums.
 *
 * Use this in CI tests to catch determinism regressions.
 *
 * @param config - Generation configuration (must include seed)
 * @param runs - Number of times to run (default: 3)
 * @throws {DeterminismViolationError} If different runs produce different checksums
 *
 * @example
 * ```typescript
 * import { assertDeterministic, createSeed } from "@rogue/procgen-v2";
 *
 * // In your test file:
 * test("BSP generator is deterministic", () => {
 *   assertDeterministic({
 *     width: 100,
 *     height: 80,
 *     seed: createSeed(12345),
 *     algorithm: "bsp",
 *   });
 * });
 * ```
 */
export function assertDeterministic(
  config: GenerationConfig,
  runs: number = 3,
): void {
  const checksums: string[] = [];

  for (let i = 0; i < runs; i++) {
    // Use skipValidation for performance (config validated once implicitly by first run)
    const result = generate(config, { skipValidation: i > 0 });

    if (!result.success) {
      throw new Error(
        `Generation failed on run ${i + 1}: ${result.error.message}`,
      );
    }

    checksums.push(result.artifact.checksum);
  }

  const uniqueChecksums = [...new Set(checksums)];
  if (uniqueChecksums.length > 1) {
    throw new DeterminismViolationError(uniqueChecksums, config);
  }
}

/**
 * Test determinism and return detailed results instead of throwing.
 *
 * Useful for debugging determinism issues.
 *
 * @param config - Generation configuration
 * @param runs - Number of times to run
 * @returns Detailed results including all checksums and timing
 */
export function testDeterminism(
  config: GenerationConfig,
  runs: number = 3,
): {
  deterministic: boolean;
  checksums: string[];
  uniqueChecksums: string[];
  durations: number[];
  avgDuration: number;
} {
  const checksums: string[] = [];
  const durations: number[] = [];

  for (let i = 0; i < runs; i++) {
    const result = generate(config, { skipValidation: i > 0 });

    if (!result.success) {
      throw new Error(
        `Generation failed on run ${i + 1}: ${result.error.message}`,
      );
    }

    checksums.push(result.artifact.checksum);
    durations.push(result.durationMs);
  }

  const uniqueChecksums = [...new Set(checksums)];
  const avgDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

  return {
    deterministic: uniqueChecksums.length === 1,
    checksums,
    uniqueChecksums,
    durations,
    avgDuration,
  };
}
