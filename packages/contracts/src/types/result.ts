/**
 * A Result type for explicit, type-safe error handling.
 *
 * Inspired by Rust's Result and Scala's Either, this provides
 * chainable operations for composing fallible computations.
 *
 * @example
 * ```typescript
 * const result = validateConfig(input)
 *   .map(config => generateDungeon(config))
 *   .mapErr(err => new UserFriendlyError(err))
 *   .getOrThrow();
 * ```
 */
export class Result<T, E> {
  private constructor(
    private readonly _value: T | undefined,
    private readonly _error: E | undefined,
    private readonly _isOk: boolean,
  ) {}

  /**
   * Create a successful Result containing a value.
   */
  static ok<T, E = never>(value: T): Result<T, E> {
    return new Result<T, E>(value, undefined, true);
  }

  /**
   * Create a failed Result containing an error.
   */
  static err<T = never, E = unknown>(error: E): Result<T, E> {
    return new Result<T, E>(undefined, error, false);
  }

  /**
   * Create a Result from a nullable value.
   */
  static fromNullable<T, E>(
    value: T | null | undefined,
    error: E,
  ): Result<T, E> {
    return value != null ? Result.ok(value) : Result.err(error);
  }

  /**
   * Create a Result from a function that might throw.
   */
  static fromThrowable<T, E = Error>(
    fn: () => T,
    onError?: (e: unknown) => E,
  ): Result<T, E> {
    try {
      return Result.ok(fn());
    } catch (e) {
      const error = onError ? onError(e) : (e as E);
      return Result.err(error);
    }
  }

  /**
   * Create a Result from a Promise.
   */
  static async fromPromise<T, E = Error>(
    promise: Promise<T>,
    onError?: (e: unknown) => E,
  ): Promise<Result<T, E>> {
    try {
      const value = await promise;
      return Result.ok(value);
    } catch (e) {
      const error = onError ? onError(e) : (e as E);
      return Result.err(error);
    }
  }

  isOk(): boolean {
    return this._isOk;
  }

  isErr(): boolean {
    return !this._isOk;
  }

  map<U>(fn: (value: T) => U): Result<U, E> {
    if (this._isOk) {
      return Result.ok(fn(this._value as T));
    }
    return Result.err(this._error as E);
  }

  mapErr<F>(fn: (error: E) => F): Result<T, F> {
    if (this._isOk) {
      return Result.ok(this._value as T);
    }
    return Result.err(fn(this._error as E));
  }

  flatMap<U>(fn: (value: T) => Result<U, E>): Result<U, E> {
    if (this._isOk) {
      return fn(this._value as T);
    }
    return Result.err(this._error as E);
  }

  andThen<U>(fn: (value: T) => Result<U, E>): Result<U, E> {
    return this.flatMap(fn);
  }

  getOrElse(defaultValue: T): T {
    return this._isOk ? (this._value as T) : defaultValue;
  }

  getOrElseWith(fn: (error: E) => T): T {
    return this._isOk ? (this._value as T) : fn(this._error as E);
  }

  getOrThrow(): T {
    if (this._isOk) {
      return this._value as T;
    }
    throw this._error;
  }

  getOrThrowWith(fn: (error: E) => Error): T {
    if (this._isOk) {
      return this._value as T;
    }
    throw fn(this._error as E);
  }

  match<U>(onOk: (value: T) => U, onErr: (error: E) => U): U {
    return this._isOk ? onOk(this._value as T) : onErr(this._error as E);
  }

  tap(fn: (value: T) => void): Result<T, E> {
    if (this._isOk) {
      fn(this._value as T);
    }
    return this;
  }

  tapErr(fn: (error: E) => void): Result<T, E> {
    if (!this._isOk) {
      fn(this._error as E);
    }
    return this;
  }

  toJSON(): { success: true; value: T } | { success: false; error: E } {
    if (this._isOk) {
      return { success: true, value: this._value as T };
    }
    return { success: false, error: this._error as E };
  }

  get success(): boolean {
    return this._isOk;
  }

  get value(): T {
    if (!this._isOk) {
      throw new Error("Cannot access value of Err Result");
    }
    return this._value as T;
  }

  get error(): E {
    if (this._isOk) {
      throw new Error("Cannot access error of Ok Result");
    }
    return this._error as E;
  }
}

export const Ok = Result.ok;
export const Err = Result.err;

export type ResultOk<R> = R extends Result<infer T, unknown> ? T : never;
export type ResultErr<R> = R extends Result<unknown, infer E> ? E : never;
