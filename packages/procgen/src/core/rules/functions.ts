/**
 * Rule Engine Functions Registry
 *
 * Custom functions that can be called from expressions.
 * Games can register their own functions.
 */

import type { EvaluationContext, EvalValue } from "./evaluator";

// =============================================================================
// FUNCTION TYPES
// =============================================================================

/**
 * A function that can be called from expressions
 */
export interface ExpressionFunction {
  /**
   * Function name (must be unique)
   */
  readonly name: string;

  /**
   * Number of arguments expected
   * -1 for variadic
   */
  readonly arity: number;

  /**
   * Human-readable description
   */
  readonly description?: string;

  /**
   * Execute the function
   *
   * @param args - Evaluated arguments
   * @param ctx - Evaluation context (for accessing rng, etc.)
   * @returns The function result
   */
  execute(args: readonly EvalValue[], ctx: EvaluationContext): EvalValue;
}

/**
 * Function registry - stores available functions
 */
export interface FunctionRegistry {
  /**
   * Register a function
   */
  register(fn: ExpressionFunction): void;

  /**
   * Get a function by name
   */
  get(name: string): ExpressionFunction | undefined;

  /**
   * Check if a function exists
   */
  has(name: string): boolean;

  /**
   * Get all function names
   */
  names(): string[];

  /**
   * Create a copy of this registry
   */
  clone(): FunctionRegistry;
}

// =============================================================================
// FUNCTION REGISTRY IMPLEMENTATION
// =============================================================================

/**
 * Create a new function registry
 */
export function createFunctionRegistry(): FunctionRegistry {
  const functions = new Map<string, ExpressionFunction>();

  return {
    register(fn: ExpressionFunction): void {
      functions.set(fn.name, fn);
    },

    get(name: string): ExpressionFunction | undefined {
      return functions.get(name);
    },

    has(name: string): boolean {
      return functions.has(name);
    },

    names(): string[] {
      return Array.from(functions.keys());
    },

    clone(): FunctionRegistry {
      const copy = createFunctionRegistry();
      for (const fn of functions.values()) {
        copy.register(fn);
      }
      return copy;
    },
  };
}

// =============================================================================
// HELPER TO CREATE FUNCTIONS
// =============================================================================

/**
 * Create a simple function from a JavaScript function
 */
export function createFunction(
  name: string,
  arity: number,
  execute: (args: readonly EvalValue[], ctx: EvaluationContext) => EvalValue,
  description?: string,
): ExpressionFunction {
  return { name, arity, execute, description };
}

/**
 * Create a pure numeric function (no context needed)
 */
export function createNumericFunction(
  name: string,
  fn: (...args: number[]) => number,
  description?: string,
): ExpressionFunction {
  return {
    name,
    arity: fn.length,
    description,
    execute(args: readonly EvalValue[]): EvalValue {
      const nums = args.map((a) =>
        typeof a === "number"
          ? a
          : typeof a === "boolean"
            ? a
              ? 1
              : 0
            : parseFloat(String(a)) || 0,
      );
      return fn(...nums);
    },
  };
}

// =============================================================================
// BUILT-IN FUNCTIONS
// =============================================================================

/**
 * Math functions
 */
export const mathFunctions: ExpressionFunction[] = [
  createNumericFunction(
    "min",
    Math.min,
    "Returns the minimum of all arguments",
  ),
  createNumericFunction(
    "max",
    Math.max,
    "Returns the maximum of all arguments",
  ),

  createNumericFunction("abs", Math.abs, "Returns absolute value"),
  createNumericFunction("floor", Math.floor, "Rounds down to nearest integer"),
  createNumericFunction("ceil", Math.ceil, "Rounds up to nearest integer"),
  createNumericFunction("round", Math.round, "Rounds to nearest integer"),
  createNumericFunction(
    "sqrt",
    (x) => (x < 0 ? 0 : Math.sqrt(x)),
    "Square root",
  ),
  createNumericFunction("pow", Math.pow, "Raises first arg to power of second"),

  createNumericFunction("sin", Math.sin, "Sine"),
  createNumericFunction("cos", Math.cos, "Cosine"),
  createNumericFunction("tan", Math.tan, "Tangent"),
  createNumericFunction("atan2", Math.atan2, "Arc tangent of y/x"),

  createNumericFunction("log", Math.log, "Natural logarithm"),
  createNumericFunction("log10", Math.log10, "Base-10 logarithm"),
  createNumericFunction("exp", Math.exp, "e raised to power"),

  createFunction(
    "clamp",
    3,
    (args) => {
      const nums = args.map((a) =>
        typeof a === "number" ? a : parseFloat(String(a)) || 0,
      );
      const value = nums[0] ?? 0;
      const min = nums[1] ?? 0;
      const max = nums[2] ?? 1;
      return Math.min(Math.max(value, min), max);
    },
    "Clamps value between min and max",
  ),

  createFunction(
    "lerp",
    3,
    (args) => {
      const nums = args.map((v) =>
        typeof v === "number" ? v : parseFloat(String(v)) || 0,
      );
      const a = nums[0] ?? 0;
      const b = nums[1] ?? 0;
      const t = nums[2] ?? 0;
      return a + (b - a) * t;
    },
    "Linear interpolation between a and b by t",
  ),

  createFunction(
    "smoothstep",
    3,
    (args) => {
      const nums = args.map((v) =>
        typeof v === "number" ? v : parseFloat(String(v)) || 0,
      );
      const edge0 = nums[0] ?? 0;
      const edge1 = nums[1] ?? 1;
      const x = nums[2] ?? 0;
      const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
      return t * t * (3 - 2 * t);
    },
    "Smooth interpolation between edge0 and edge1",
  ),

  createFunction(
    "distance",
    4,
    (args) => {
      const nums = args.map((v) =>
        typeof v === "number" ? v : parseFloat(String(v)) || 0,
      );
      const x1 = nums[0] ?? 0;
      const y1 = nums[1] ?? 0;
      const x2 = nums[2] ?? 0;
      const y2 = nums[3] ?? 0;
      return Math.hypot(x2 - x1, y2 - y1);
    },
    "Euclidean distance between two points",
  ),

  createFunction(
    "manhattan",
    4,
    (args) => {
      const nums = args.map((v) =>
        typeof v === "number" ? v : parseFloat(String(v)) || 0,
      );
      const x1 = nums[0] ?? 0;
      const y1 = nums[1] ?? 0;
      const x2 = nums[2] ?? 0;
      const y2 = nums[3] ?? 0;
      return Math.abs(x2 - x1) + Math.abs(y2 - y1);
    },
    "Manhattan distance between two points",
  ),
];

/**
 * Random functions (use context RNG for determinism)
 */
export const randomFunctions: ExpressionFunction[] = [
  createFunction(
    "random",
    0,
    (_, ctx) => ctx.rng(),
    "Returns a random number between 0 and 1",
  ),

  createFunction(
    "randomRange",
    2,
    (args, ctx) => {
      const min = typeof args[0] === "number" ? args[0] : 0;
      const max = typeof args[1] === "number" ? args[1] : 1;
      return min + ctx.rng() * (max - min);
    },
    "Returns a random number between min and max",
  ),

  createFunction(
    "randomInt",
    2,
    (args, ctx) => {
      const min = typeof args[0] === "number" ? Math.floor(args[0]) : 0;
      const max = typeof args[1] === "number" ? Math.floor(args[1]) : 1;
      return Math.floor(min + ctx.rng() * (max - min + 1));
    },
    "Returns a random integer between min and max (inclusive)",
  ),

  createFunction(
    "chance",
    1,
    (args, ctx) => {
      const probability = typeof args[0] === "number" ? args[0] : 0.5;
      return ctx.rng() < probability;
    },
    "Returns true with given probability",
  ),

  createFunction(
    "pick",
    -1, // Variadic
    (args, ctx) => {
      if (args.length === 0) return 0;

      // If first arg is an array, pick from it
      if (Array.isArray(args[0])) {
        const arr = args[0] as EvalValue[];
        if (arr.length === 0) return 0;
        const picked = arr[Math.floor(ctx.rng() * arr.length)];
        return picked !== undefined ? picked : 0;
      }

      // Otherwise pick from all args
      const picked = args[Math.floor(ctx.rng() * args.length)];
      return picked !== undefined ? picked : 0;
    },
    "Picks a random element from the arguments or array",
  ),

  createFunction(
    "weightedPick",
    2,
    (args, ctx) => {
      const values = args[0];
      const weights = args[1];

      if (!Array.isArray(values) || !Array.isArray(weights)) {
        return 0;
      }

      if (values.length === 0 || weights.length === 0) {
        return 0;
      }

      const numWeights = weights.map((w) => (typeof w === "number" ? w : 0));

      const totalWeight = numWeights.reduce((a, b) => a + b, 0);
      const firstValue = values[0];
      if (totalWeight === 0) {
        return firstValue !== undefined ? firstValue : 0;
      }

      let random = ctx.rng() * totalWeight;
      for (let i = 0; i < values.length; i++) {
        random -= numWeights[i] ?? 0;
        if (random <= 0) {
          const value = values[i];
          return value !== undefined ? value : 0;
        }
      }

      const lastValue = values[values.length - 1];
      return lastValue !== undefined ? lastValue : 0;
    },
    "Picks a value based on weights",
  ),
];

/**
 * Array functions
 */
export const arrayFunctions: ExpressionFunction[] = [
  createFunction(
    "length",
    1,
    (args) => {
      const val = args[0];
      if (Array.isArray(val)) return val.length;
      if (typeof val === "string") return val.length;
      return 0;
    },
    "Returns the length of an array or string",
  ),

  createFunction(
    "sum",
    1,
    (args) => {
      const arr = args[0];
      if (!Array.isArray(arr)) return 0;

      return arr.reduce((sum, val) => {
        const num =
          typeof val === "number" ? val : parseFloat(String(val)) || 0;
        return sum + num;
      }, 0);
    },
    "Returns the sum of all elements in an array",
  ),

  createFunction(
    "avg",
    1,
    (args) => {
      const arr = args[0];
      if (!Array.isArray(arr) || arr.length === 0) return 0;

      const sum = arr.reduce((s, val) => {
        const num =
          typeof val === "number" ? val : parseFloat(String(val)) || 0;
        return s + num;
      }, 0);

      return sum / arr.length;
    },
    "Returns the average of all elements in an array",
  ),

  createFunction(
    "first",
    1,
    (args) => {
      const arr = args[0];
      if (!Array.isArray(arr) || arr.length === 0) return 0;
      const first = arr[0];
      return first !== undefined ? first : 0;
    },
    "Returns the first element of an array",
  ),

  createFunction(
    "last",
    1,
    (args) => {
      const arr = args[0];
      if (!Array.isArray(arr) || arr.length === 0) return 0;
      const last = arr[arr.length - 1];
      return last !== undefined ? last : 0;
    },
    "Returns the last element of an array",
  ),

  createFunction(
    "contains",
    2,
    (args) => {
      const arr = args[0];
      const value = args[1];

      if (!Array.isArray(arr)) return false;
      return arr.includes(value);
    },
    "Returns true if array contains value",
  ),

  createFunction(
    "indexOf",
    2,
    (args) => {
      const arr = args[0];
      const value = args[1];

      if (!Array.isArray(arr)) return -1;
      return arr.indexOf(value);
    },
    "Returns the index of value in array, or -1",
  ),
];

/**
 * String functions
 */
export const stringFunctions: ExpressionFunction[] = [
  createFunction(
    "concat",
    -1,
    (args) => args.map(String).join(""),
    "Concatenates all arguments as strings",
  ),

  createFunction(
    "upper",
    1,
    (args) => String(args[0] ?? "").toUpperCase(),
    "Converts to uppercase",
  ),

  createFunction(
    "lower",
    1,
    (args) => String(args[0] ?? "").toLowerCase(),
    "Converts to lowercase",
  ),

  createFunction(
    "startsWith",
    2,
    (args) => String(args[0] ?? "").startsWith(String(args[1] ?? "")),
    "Returns true if string starts with prefix",
  ),

  createFunction(
    "endsWith",
    2,
    (args) => String(args[0] ?? "").endsWith(String(args[1] ?? "")),
    "Returns true if string ends with suffix",
  ),
];

/**
 * Logic functions
 */
export const logicFunctions: ExpressionFunction[] = [
  createFunction(
    "if",
    3,
    (args) => {
      const condition = args[0];
      const asBool =
        typeof condition === "boolean"
          ? condition
          : typeof condition === "number"
            ? condition !== 0
            : !!condition;

      const trueVal = args[1];
      const falseVal = args[2];
      return asBool
        ? trueVal !== undefined
          ? trueVal
          : 0
        : falseVal !== undefined
          ? falseVal
          : 0;
    },
    "Returns second arg if first is true, else third",
  ),

  createFunction(
    "and",
    -1,
    (args) => {
      return args.every((a) => {
        if (typeof a === "boolean") return a;
        if (typeof a === "number") return a !== 0;
        return !!a;
      });
    },
    "Returns true if all arguments are truthy",
  ),

  createFunction(
    "or",
    -1,
    (args) => {
      return args.some((a) => {
        if (typeof a === "boolean") return a;
        if (typeof a === "number") return a !== 0;
        return !!a;
      });
    },
    "Returns true if any argument is truthy",
  ),

  createFunction(
    "not",
    1,
    (args) => {
      const val = args[0];
      if (typeof val === "boolean") return !val;
      if (typeof val === "number") return val === 0;
      return !val;
    },
    "Returns logical NOT of argument",
  ),

  createFunction(
    "coalesce",
    -1,
    (args) => {
      for (const arg of args) {
        if (arg !== null && arg !== undefined && arg !== 0 && arg !== "") {
          return arg;
        }
      }
      return args[args.length - 1] ?? 0;
    },
    "Returns first non-empty value",
  ),
];

// =============================================================================
// REGISTRY WITH ALL BUILT-INS
// =============================================================================

/**
 * Create a function registry with all built-in functions
 */
export function createBuiltinRegistry(): FunctionRegistry {
  const registry = createFunctionRegistry();

  const allFunctions = [
    ...mathFunctions,
    ...randomFunctions,
    ...arrayFunctions,
    ...stringFunctions,
    ...logicFunctions,
  ];

  for (const fn of allFunctions) {
    registry.register(fn);
  }

  return registry;
}

/**
 * Default registry with all built-in functions
 */
export const builtinFunctions = createBuiltinRegistry();
