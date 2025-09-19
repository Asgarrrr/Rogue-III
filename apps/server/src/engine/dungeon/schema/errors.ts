export class DungeonGenerationError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "DungeonGenerationError";
  }
}

export class ConfigValidationError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "ConfigValidationError";
  }
}

export class SeedDecodeError extends Error {
  constructor(
    message: string,
    public code: string,
    public originalError?: unknown,
  ) {
    super(message);
    this.name = "SeedDecodeError";
  }
}

export class AsciiDisplayError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "AsciiDisplayError";
  }
}

export class DungeonManagerError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "DungeonManagerError";
  }
}

export type Result<T, E> =
  | { success: true; value: T }
  | { success: false; error: E };

export function Ok<T>(value: T): Result<T, never> {
  return { success: true, value };
}

export function Err<E>(error: E): Result<never, E> {
  return { success: false, error };
}
