import {
  DungeonError,
  Err,
  MAX_DUNGEON_CELLS,
  Ok,
  type Result,
  ROOM_DENSITY_DIVISOR,
} from "@rogue/contracts";
import type { DungeonConfig, DungeonSeed } from "./core/types";
import type { Dungeon } from "./entities";
import type { DungeonGenerator } from "./generators/base/dungeon-generator";
import { createGeneratorFromRegistry } from "./generators/registry";
import { DungeonConfigSchema } from "./schema/dungeon";
import { SeedManager } from "./serialization";
import { getInvariantSummary, validateDungeonInvariants } from "./validation";

const DEFAULT_GENERATION_TIMEOUT_MS = 10_000;

type GenerationOptions = {
  timeoutMs?: number;
  signal?: AbortSignal;
};

function clampRoomCount(config: DungeonConfig): DungeonConfig {
  const area = config.width * config.height;
  const minRooms = config.algorithm === "bsp" ? 1 : 0;
  const maxRooms = Math.max(minRooms, Math.floor(area / ROOM_DENSITY_DIVISOR));

  if (config.roomCount <= maxRooms) {
    return config;
  }

  return { ...config, roomCount: maxRooms };
}

function applyConfigGuardrails(
  config: DungeonConfig,
): Result<DungeonConfig, DungeonError> {
  const totalCells = config.width * config.height;
  if (totalCells > MAX_DUNGEON_CELLS) {
    return Err(
      DungeonError.create(
        "CONFIG_DIMENSION_TOO_LARGE",
        "Dungeon area too large",
        {
          width: config.width,
          height: config.height,
          maxCells: MAX_DUNGEON_CELLS,
        },
      ),
    );
  }

  return Ok(clampRoomCount(config));
}

function normalizeSeeds(
  seedInput: string | number,
): Result<DungeonSeed, DungeonError> {
  const normalizedResult = SeedManager.normalizeSeed(seedInput);
  if (normalizedResult.isErr()) {
    return Err(normalizedResult.error);
  }

  return SeedManager.generateSeeds(normalizedResult.value);
}

function createAbortError(timeoutMs: number, reason?: unknown): DungeonError {
  const message =
    typeof reason === "string"
      ? reason
      : reason instanceof Error
        ? reason.message
        : "Dungeon generation aborted";

  return DungeonError.generationTimeout(message, {
    timeoutMs,
    aborted: true,
    reason: reason ?? null,
  });
}

async function withGenerationTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<T> {
  if (timeoutMs <= 0) {
    throw DungeonError.generationTimeout("Dungeon generation timed out", {
      timeoutMs,
    });
  }

  return new Promise<T>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      if (signal) {
        signal.removeEventListener("abort", onAbort);
      }
    };

    const onAbort = () => {
      cleanup();
      reject(createAbortError(timeoutMs, signal?.reason));
    };

    timer = setTimeout(() => {
      cleanup();
      reject(
        DungeonError.generationTimeout("Dungeon generation timed out", {
          timeoutMs,
        }),
      );
    }, timeoutMs);

    if (signal) {
      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener("abort", onAbort, { once: true });
    }

    promise
      .then((value) => {
        cleanup();
        resolve(value);
      })
      .catch((error) => {
        cleanup();
        reject(error);
      });
  });
}

function validateDungeonOutput(
  dungeon: Dungeon,
): Result<Dungeon, DungeonError> {
  const validation = validateDungeonInvariants(dungeon);
  if (!validation.valid) {
    return Err(
      DungeonError.generationFailed("Dungeon failed invariant validation", {
        violations: validation.violations,
        summary: getInvariantSummary(validation),
      }),
    );
  }
  return Ok(dungeon);
}

/**
 * Generate a dungeon asynchronously with progress tracking.
 */
async function generateFromSeedAsync(
  seedInput: string | number,
  config: DungeonConfig,
  onProgress?: (progress: number) => void,
  options?: GenerationOptions,
): Promise<Result<Dungeon, DungeonError>> {
  const configResult = DungeonConfigSchema.safeParse(config);

  if (!configResult.success) {
    return Err(
      DungeonError.configInvalid("Invalid dungeon configuration", {
        errors: configResult.error.issues,
      }),
    );
  }

  const guardrailsResult = applyConfigGuardrails(configResult.data);
  if (guardrailsResult.isErr()) {
    return Err(guardrailsResult.error);
  }

  const seedsResult = normalizeSeeds(seedInput);
  if (seedsResult.isErr()) {
    return Err(seedsResult.error);
  }

  const generator = createGeneratorFromRegistry(
    guardrailsResult.value,
    seedsResult.value,
  );

  if (options?.signal?.aborted) {
    return Err(
      createAbortError(
        options.timeoutMs ?? DEFAULT_GENERATION_TIMEOUT_MS,
        options.signal.reason,
      ),
    );
  }

  try {
    const dungeon = await withGenerationTimeout(
      generator.generateAsync(onProgress, options?.signal),
      options?.timeoutMs ?? DEFAULT_GENERATION_TIMEOUT_MS,
      options?.signal,
    );
    return validateDungeonOutput(dungeon);
  } catch (error) {
    if (DungeonError.isDungeonError(error)) {
      return Err(error);
    }

    return Err(
      DungeonError.generationFailed("Dungeon generation failed", {
        reason: error instanceof Error ? error.message : "Unknown error",
      }),
    );
  }
}

/**
 * Generate a dungeon synchronously.
 */
function generateFromSeedSync(
  seedInput: string | number,
  config: DungeonConfig,
): Result<Dungeon, DungeonError> {
  const configResult = DungeonConfigSchema.safeParse(config);

  if (!configResult.success) {
    return Err(
      DungeonError.configInvalid("Invalid dungeon configuration", {
        errors: configResult.error.issues,
      }),
    );
  }

  const guardrailsResult = applyConfigGuardrails(configResult.data);
  if (guardrailsResult.isErr()) {
    return Err(guardrailsResult.error);
  }

  const seedsResult = normalizeSeeds(seedInput);
  if (seedsResult.isErr()) {
    return Err(seedsResult.error);
  }

  try {
    const generator = createGeneratorFromRegistry(
      guardrailsResult.value,
      seedsResult.value,
    );
    const dungeon = generator.generate();
    return validateDungeonOutput(dungeon);
  } catch (error) {
    if (DungeonError.isDungeonError(error)) {
      return Err(error);
    }
    return Err(
      DungeonError.generationFailed("Dungeon generation failed", {
        reason: error instanceof Error ? error.message : "Unknown error",
      }),
    );
  }
}

/**
 * Regenerate a dungeon from a share code.
 */
function regenerateFromCode(
  dungeonCode: string,
  config: DungeonConfig,
): Result<Dungeon, DungeonError> {
  const seedsResult = SeedManager.decodeSeed(dungeonCode);

  if (seedsResult.isErr()) {
    return Err(seedsResult.error);
  }

  const configResult = DungeonConfigSchema.safeParse(config);
  if (!configResult.success) {
    return Err(
      DungeonError.configInvalid("Invalid dungeon configuration", {
        errors: configResult.error.issues,
      }),
    );
  }

  const guardrailsResult = applyConfigGuardrails(configResult.data);
  if (guardrailsResult.isErr()) {
    return Err(guardrailsResult.error);
  }

  try {
    const dungeon = createGeneratorFromRegistry(
      guardrailsResult.value,
      seedsResult.value,
    ).generate();

    return validateDungeonOutput(dungeon);
  } catch (error) {
    if (DungeonError.isDungeonError(error)) {
      return Err(error);
    }
    return Err(
      DungeonError.generationFailed("Dungeon generation failed", {
        reason: error instanceof Error ? error.message : "Unknown error",
      }),
    );
  }
}

/**
 * Get a shareable code for a dungeon.
 */
function getDungeonShareCode(dungeon: Dungeon): Result<string, DungeonError> {
  return SeedManager.encodeSeed(dungeon.seeds);
}

/**
 * Validate that a generator produces deterministic results.
 */
function validateDeterminism(generator: DungeonGenerator): boolean {
  return generator.validateDeterminism();
}

export const DungeonManager = {
  generateFromSeedAsync,
  generateFromSeedSync,
  regenerateFromCode,
  getDungeonShareCode,
  validateDeterminism,
} as const;
