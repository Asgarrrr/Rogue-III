/**
 * Generation API
 *
 * High-level API for dungeon generation.
 */

import { createBSPGenerator } from "./generators/bsp";
import { createCellularGenerator } from "./generators/cellular";
import { createHybridGenerator } from "./generators/hybrid";
import {
  createChainFactory,
  type GeneratorChainBuilder,
} from "./pipeline/chaining";
import type {
  DungeonArtifact,
  GenerationConfig,
  Generator,
  PipelineOptions,
  PipelineResult,
  ValidationArtifact,
} from "./pipeline/types";
import { createEmptyArtifact } from "./pipeline/types";

/**
 * Generator registry
 */
const generators: Record<string, Generator> = {
  bsp: createBSPGenerator(),
  cellular: createCellularGenerator(),
  hybrid: createHybridGenerator(),
};

/**
 * Create a generator chain for composing generators with post-processors
 *
 * @example
 * ```typescript
 * import { chain, createSeed } from "@rogue/procgen-v2";
 *
 * const result = chain({
 *   width: 100,
 *   height: 80,
 *   seed: createSeed(12345),
 * })
 *   .useGenerator("bsp")
 *   .transform(addDoors)
 *   .addDecorations(decorateRoom)
 *   .run();
 * ```
 */
export const chain: (config: GenerationConfig) => GeneratorChainBuilder =
  createChainFactory(generators);

/**
 * Generation options
 */
export interface GenerateOptions extends Omit<PipelineOptions, "signal"> {
  /**
   * Skip config validation before generation.
   * Default: false (validation is performed)
   */
  readonly skipValidation?: boolean;
}

/**
 * Async generation options
 */
export interface GenerateAsyncOptions extends PipelineOptions {
  /**
   * Skip config validation before generation.
   * Default: false (validation is performed)
   */
  readonly skipValidation?: boolean;
}

/**
 * Successful generator validation result.
 */
interface ValidatedGeneratorSuccess {
  readonly success: true;
  readonly generator: Generator;
}

/**
 * Failed generator validation result.
 * Compatible with PipelineFailure.
 */
interface ValidatedGeneratorFailure {
  readonly success: false;
  readonly error: Error;
  readonly trace: readonly [];
  readonly snapshots: readonly [];
  readonly durationMs: 0;
}

/**
 * Result of validating and retrieving a generator.
 * Discriminated union - use `if (result.success)` to narrow.
 */
type ValidatedGeneratorResult =
  | ValidatedGeneratorSuccess
  | ValidatedGeneratorFailure;

/**
 * Validate configuration and get the generator.
 * Returns a discriminated union - use `if (result.success)` to narrow.
 */
function validateAndGetGenerator(
  config: GenerationConfig,
  skipValidation?: boolean,
): ValidatedGeneratorResult {
  const algorithm = config.algorithm ?? "bsp";
  const generator = generators[algorithm];

  if (!generator) {
    return {
      success: false,
      error: new Error(`Unknown algorithm: ${algorithm}`),
      trace: [],
      snapshots: [],
      durationMs: 0,
    };
  }

  // Validate config by default (can be skipped for performance)
  if (!skipValidation) {
    const validation = generator.validateConfig(config);
    if (!validation.success) {
      const errors = validation.violations
        .filter((v) => v.severity === "error")
        .map((v) => v.message)
        .join("; ");
      return {
        success: false,
        error: new Error(`Invalid configuration: ${errors}`),
        trace: [],
        snapshots: [],
        durationMs: 0,
      };
    }
  }

  return { success: true, generator };
}

/**
 * Generate a dungeon with the specified configuration.
 *
 * By default, validates the configuration before generation.
 * Use `skipValidation: true` for hot paths where config is known-valid.
 *
 * @example
 * ```typescript
 * // Standard usage (with validation)
 * const result = generate(config);
 *
 * // Skip validation for performance
 * const result = generate(config, { skipValidation: true });
 * ```
 */
export function generate(
  config: GenerationConfig,
  options?: GenerateOptions,
): PipelineResult<DungeonArtifact> {
  const validationResult = validateAndGetGenerator(
    config,
    options?.skipValidation,
  );

  // Discriminated union: check success to narrow type
  if (!validationResult.success) {
    return validationResult;
  }

  const pipeline = validationResult.generator.createPipeline(config);
  return pipeline.runSync(createEmptyArtifact(), config.seed, options);
}

/**
 * Generate a dungeon asynchronously (supports AbortSignal).
 *
 * By default, validates the configuration before generation.
 * Use `skipValidation: true` for hot paths where config is known-valid.
 */
export async function generateAsync(
  config: GenerationConfig,
  options?: GenerateAsyncOptions,
): Promise<PipelineResult<DungeonArtifact>> {
  const validationResult = validateAndGetGenerator(
    config,
    options?.skipValidation,
  );

  // Discriminated union: check success to narrow type
  if (!validationResult.success) {
    return validationResult;
  }

  const pipeline = validationResult.generator.createPipeline(config);
  return pipeline.run(createEmptyArtifact(), config.seed, options);
}

/**
 * Validate generation configuration
 */
export function validateConfig(config: GenerationConfig): ValidationArtifact {
  const algorithm = config.algorithm ?? "bsp";
  const generator = generators[algorithm];

  if (!generator) {
    return {
      type: "validation" as const,
      id: "config-validation",
      violations: [
        {
          type: "config.algorithm",
          message: `Unknown algorithm: ${algorithm}`,
          severity: "error" as const,
        },
      ],
      success: false,
    };
  }

  return generator.validateConfig(config);
}

/**
 * Get available generator algorithms
 */
export function getAvailableAlgorithms(): string[] {
  return Object.keys(generators);
}

/**
 * Register a custom generator
 */
export function registerGenerator(generator: Generator): void {
  generators[generator.id] = generator;
}
