/**
 * Rule Engine Expression Evaluator
 *
 * Evaluates expression ASTs against an evaluation context.
 * Supports custom functions and rule references.
 */

import type { BinaryOperator, Expression, UnaryOperator } from "./expression";
import type { FunctionRegistry } from "./functions";

// =============================================================================
// EVALUATION CONTEXT
// =============================================================================

/**
 * Evaluation value - can be any primitive, array, or object
 */
export type EvalValue =
  | number
  | string
  | boolean
  | null
  | undefined
  | readonly EvalValue[]
  | { readonly [key: string]: EvalValue };

/**
 * Field resolver - gets values from named paths
 */
export interface FieldResolver {
  /**
   * Resolve a field path to a value
   *
   * @param path - Dot-separated path (e.g., "context.health", "room.traits.dangerous")
   * @returns The resolved value
   */
  resolve(path: string): EvalValue;
}

/**
 * Rule result cache - stores results of evaluated rules
 */
export interface RuleResultCache {
  /**
   * Get a cached rule result
   */
  get(ruleId: string): EvalValue | undefined;

  /**
   * Set a rule result
   */
  set(ruleId: string, value: EvalValue): void;

  /**
   * Check if a rule result is cached
   */
  has(ruleId: string): boolean;
}

/**
 * Evaluation context - all data needed to evaluate expressions
 */
export interface EvaluationContext {
  /**
   * Field resolver for accessing values
   */
  readonly fields: FieldResolver;

  /**
   * Function registry for custom functions
   */
  readonly functions: FunctionRegistry;

  /**
   * Cache for rule results
   */
  readonly ruleCache: RuleResultCache;

  /**
   * Random number generator (for deterministic randomness)
   */
  readonly rng: () => number;
}

// =============================================================================
// FIELD RESOLVER IMPLEMENTATIONS
// =============================================================================

/**
 * Create a field resolver from a nested object.
 *
 * The resolver traverses the object structure using dot-separated paths
 * like "room.id" or "dungeon.difficulty". This is a runtime operation
 * that requires internal use of unknown for traversal, but the input
 * type is preserved for type safety at the call site.
 *
 * @param data - Any object structure to resolve paths from
 * @returns A field resolver that can access nested properties by path
 */
export function createObjectResolver<T extends object>(data: T): FieldResolver {
  return {
    resolve(path: string): EvalValue {
      const parts = path.split(".");
      // Runtime traversal requires unknown - this is inherent to dynamic path resolution
      let current: unknown = data;

      for (const part of parts) {
        if (current === null || current === undefined) {
          return 0; // Default for missing values
        }

        if (typeof current !== "object") {
          return 0;
        }

        // Safe: we've verified current is a non-null object
        current = (current as { [key: string]: unknown })[part];
      }

      if (current === null || current === undefined) {
        return 0;
      }

      // The resolved value must be coerced to EvalValue
      // This is safe because EvalValue encompasses all valid result types
      return current as EvalValue;
    },
  };
}

/**
 * Create a field resolver that combines multiple resolvers
 *
 * First resolver that returns non-zero wins.
 */
export function combineResolvers(...resolvers: FieldResolver[]): FieldResolver {
  return {
    resolve(path: string): EvalValue {
      for (const resolver of resolvers) {
        const value = resolver.resolve(path);
        if (value !== 0 && value !== "" && value !== false) {
          return value;
        }
      }
      return 0;
    },
  };
}

/**
 * Create a simple in-memory rule result cache
 */
export function createRuleCache(): RuleResultCache {
  const cache = new Map<string, EvalValue>();

  return {
    get(ruleId: string): EvalValue | undefined {
      return cache.get(ruleId);
    },
    set(ruleId: string, value: EvalValue): void {
      cache.set(ruleId, value);
    },
    has(ruleId: string): boolean {
      return cache.has(ruleId);
    },
  };
}

// =============================================================================
// EXPRESSION EVALUATOR
// =============================================================================

/**
 * Evaluate an expression and return the result
 *
 * @param expr - The expression to evaluate
 * @param ctx - The evaluation context
 * @returns The evaluated value
 * @throws Error if evaluation fails
 */
export function evaluate(expr: Expression, ctx: EvaluationContext): EvalValue {
  switch (expr.type) {
    case "literal":
      return expr.value;

    case "field":
      return ctx.fields.resolve(expr.path);

    case "op":
      return evaluateBinaryOp(expr.op, expr.left, expr.right, ctx);

    case "unary":
      return evaluateUnaryOp(expr.op, expr.operand, ctx);

    case "fn":
      return evaluateFunction(expr.name, expr.args, ctx);

    case "cond":
      return evaluateCondition(
        expr.condition,
        expr.thenBranch,
        expr.elseBranch,
        ctx,
      );

    case "ref":
      return evaluateRuleRef(expr.ruleId, ctx);

    case "array":
      return expr.elements.map((el) => evaluate(el, ctx));

    case "object":
      return Object.fromEntries(
        Object.entries(expr.properties).map(([key, value]) => [
          key,
          evaluate(value, ctx),
        ]),
      );

    case "range":
      return evaluateRange(
        expr.value,
        expr.min,
        expr.max,
        expr.inclusive ?? true,
        ctx,
      );

    case "in":
      return evaluateIn(expr.value, expr.array, ctx);

    default:
      throw new Error(`Unknown expression type: ${(expr as Expression).type}`);
  }
}

/**
 * Evaluate a binary operation
 */
function evaluateBinaryOp(
  op: BinaryOperator,
  left: Expression,
  right: Expression,
  ctx: EvaluationContext,
): EvalValue {
  const leftVal = evaluate(left, ctx);
  const rightVal = evaluate(right, ctx);

  // Type coercion helpers
  const asNum = (v: EvalValue): number => {
    if (typeof v === "number") return v;
    if (typeof v === "boolean") return v ? 1 : 0;
    if (typeof v === "string") return parseFloat(v) || 0;
    return 0;
  };

  const asBool = (v: EvalValue): boolean => {
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v !== 0;
    if (typeof v === "string") return v !== "";
    if (Array.isArray(v)) return v.length > 0;
    return true;
  };

  switch (op) {
    // Arithmetic
    case "+":
      if (typeof leftVal === "string" || typeof rightVal === "string") {
        return String(leftVal) + String(rightVal);
      }
      return asNum(leftVal) + asNum(rightVal);
    case "-":
      return asNum(leftVal) - asNum(rightVal);
    case "*":
      return asNum(leftVal) * asNum(rightVal);
    case "/": {
      const divisor = asNum(rightVal);
      return divisor === 0 ? 0 : asNum(leftVal) / divisor;
    }
    case "%": {
      const mod = asNum(rightVal);
      return mod === 0 ? 0 : asNum(leftVal) % mod;
    }
    case "^":
      return asNum(leftVal) ** asNum(rightVal);

    // Comparison
    case "==":
      return leftVal === rightVal;
    case "!=":
      return leftVal !== rightVal;
    case "<":
      return asNum(leftVal) < asNum(rightVal);
    case "<=":
      return asNum(leftVal) <= asNum(rightVal);
    case ">":
      return asNum(leftVal) > asNum(rightVal);
    case ">=":
      return asNum(leftVal) >= asNum(rightVal);

    // Logical
    case "&&":
      return asBool(leftVal) && asBool(rightVal);
    case "||":
      return asBool(leftVal) || asBool(rightVal);

    // Min/Max
    case "min":
      return Math.min(asNum(leftVal), asNum(rightVal));
    case "max":
      return Math.max(asNum(leftVal), asNum(rightVal));

    default:
      throw new Error(`Unknown operator: ${op}`);
  }
}

/**
 * Evaluate a unary operation
 */
function evaluateUnaryOp(
  op: UnaryOperator,
  operand: Expression,
  ctx: EvaluationContext,
): EvalValue {
  const val = evaluate(operand, ctx);

  const asNum = (v: EvalValue): number => {
    if (typeof v === "number") return v;
    if (typeof v === "boolean") return v ? 1 : 0;
    if (typeof v === "string") return parseFloat(v) || 0;
    return 0;
  };

  const asBool = (v: EvalValue): boolean => {
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v !== 0;
    if (typeof v === "string") return v !== "";
    return true;
  };

  switch (op) {
    case "-":
      return -asNum(val);
    case "!":
      return !asBool(val);
    case "abs":
      return Math.abs(asNum(val));
    case "floor":
      return Math.floor(asNum(val));
    case "ceil":
      return Math.ceil(asNum(val));
    case "round":
      return Math.round(asNum(val));
    case "sqrt": {
      const n = asNum(val);
      return n < 0 ? 0 : Math.sqrt(n);
    }
    default:
      throw new Error(`Unknown unary operator: ${op}`);
  }
}

/**
 * Evaluate a function call
 */
function evaluateFunction(
  name: string,
  args: readonly Expression[],
  ctx: EvaluationContext,
): EvalValue {
  const fn = ctx.functions.get(name);

  if (!fn) {
    throw new Error(`Unknown function: ${name}`);
  }

  const evaluatedArgs = args.map((arg) => evaluate(arg, ctx));
  return fn.execute(evaluatedArgs, ctx);
}

/**
 * Evaluate a conditional expression
 */
function evaluateCondition(
  condition: Expression,
  thenExpr: Expression,
  elseExpr: Expression,
  ctx: EvaluationContext,
): EvalValue {
  const condVal = evaluate(condition, ctx);

  const asBool = (v: EvalValue): boolean => {
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v !== 0;
    if (typeof v === "string") return v !== "";
    return true;
  };

  return asBool(condVal) ? evaluate(thenExpr, ctx) : evaluate(elseExpr, ctx);
}

/**
 * Evaluate a rule reference
 */
function evaluateRuleRef(ruleId: string, ctx: EvaluationContext): EvalValue {
  const cached = ctx.ruleCache.get(ruleId);

  if (cached !== undefined) {
    return cached;
  }

  // If the rule hasn't been evaluated yet, return 0
  // The rule engine should ensure proper ordering
  return 0;
}

/**
 * Evaluate a range check
 */
function evaluateRange(
  valueExpr: Expression,
  minExpr: Expression,
  maxExpr: Expression,
  inclusive: boolean,
  ctx: EvaluationContext,
): boolean {
  const value = evaluate(valueExpr, ctx);
  const min = evaluate(minExpr, ctx);
  const max = evaluate(maxExpr, ctx);

  const asNum = (v: EvalValue): number => {
    if (typeof v === "number") return v;
    return 0;
  };

  const v = asNum(value);
  const lo = asNum(min);
  const hi = asNum(max);

  if (inclusive) {
    return v >= lo && v <= hi;
  } else {
    return v > lo && v < hi;
  }
}

/**
 * Evaluate an "in" check
 */
function evaluateIn(
  valueExpr: Expression,
  arrayExpr: Expression,
  ctx: EvaluationContext,
): boolean {
  const value = evaluate(valueExpr, ctx);
  const array = evaluate(arrayExpr, ctx);

  if (!Array.isArray(array)) {
    return false;
  }

  return array.includes(value);
}

// =============================================================================
// EVALUATION HELPERS
// =============================================================================

/**
 * Evaluate an expression and coerce to number
 */
export function evaluateAsNumber(
  expr: Expression,
  ctx: EvaluationContext,
): number {
  const val = evaluate(expr, ctx);

  if (typeof val === "number") return val;
  if (typeof val === "boolean") return val ? 1 : 0;
  if (typeof val === "string") return parseFloat(val) || 0;
  return 0;
}

/**
 * Evaluate an expression and coerce to boolean
 */
export function evaluateAsBoolean(
  expr: Expression,
  ctx: EvaluationContext,
): boolean {
  const val = evaluate(expr, ctx);

  if (typeof val === "boolean") return val;
  if (typeof val === "number") return val !== 0;
  if (typeof val === "string") return val !== "";
  if (Array.isArray(val)) return val.length > 0;
  return true;
}

/**
 * Evaluate an expression and coerce to string
 */
export function evaluateAsString(
  expr: Expression,
  ctx: EvaluationContext,
): string {
  const val = evaluate(expr, ctx);

  if (typeof val === "string") return val;
  if (typeof val === "number") return String(val);
  if (typeof val === "boolean") return val ? "true" : "false";
  if (Array.isArray(val)) return JSON.stringify(val);
  return JSON.stringify(val);
}
