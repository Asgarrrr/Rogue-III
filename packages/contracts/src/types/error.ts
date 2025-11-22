/**
 * Error codes for dungeon generation operations.
 * Using discriminated union for type-safe error handling.
 */
export type DungeonErrorCode =
  | "CONFIG_INVALID"
  | "CONFIG_DIMENSION_TOO_SMALL"
  | "CONFIG_DIMENSION_TOO_LARGE"
  | "CONFIG_ROOM_SIZE_INVALID"
  | "CONFIG_ROOM_COUNT_INVALID"
  | "SEED_INVALID"
  | "SEED_DECODE_FAILED"
  | "SEED_ENCODE_FAILED"
  | "GENERATION_FAILED"
  | "GENERATION_TIMEOUT"
  | "ALGORITHM_NOT_FOUND"
  | "ROOM_PLACEMENT_FAILED"
  | "PATH_CONNECTION_FAILED";

/**
 * Unified error type for all dungeon generation operations.
 *
 * @example
 * ```typescript
 * const error = new DungeonError(
 *   "CONFIG_INVALID",
 *   "Room size exceeds dungeon dimensions",
 *   { roomSize: 50, dungeonWidth: 30 }
 * );
 * ```
 */
export class DungeonError extends Error {
  readonly name = "DungeonError";

  constructor(
    public readonly code: DungeonErrorCode,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);

    // Maintains proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DungeonError);
    }
  }

  /**
   * Create error with formatted message including details.
   */
  static create(
    code: DungeonErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ): DungeonError {
    return new DungeonError(code, message, details);
  }

  /**
   * Create a config validation error.
   */
  static configInvalid(message: string, details?: Record<string, unknown>): DungeonError {
    return new DungeonError("CONFIG_INVALID", message, details);
  }

  /**
   * Create a seed decode error.
   */
  static seedDecodeFailed(message: string, details?: Record<string, unknown>): DungeonError {
    return new DungeonError("SEED_DECODE_FAILED", message, details);
  }

  /**
   * Create a generation error.
   */
  static generationFailed(message: string, details?: Record<string, unknown>): DungeonError {
    return new DungeonError("GENERATION_FAILED", message, details);
  }

  /**
   * Check if an unknown error is a DungeonError.
   */
  static isDungeonError(error: unknown): error is DungeonError {
    return error instanceof DungeonError;
  }

  /**
   * Convert to a plain object for serialization.
   */
  toJSON(): {
    name: string;
    code: DungeonErrorCode;
    message: string;
    details?: Record<string, unknown>;
  } {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      ...(this.details && { details: this.details }),
    };
  }
}
