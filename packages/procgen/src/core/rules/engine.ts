/**
 * Rule Engine
 *
 * Evaluates rules against data to produce actions.
 * Rules are defined in data (JSON), not code.
 *
 * @example
 * ```typescript
 * const engine = createRuleEngine();
 *
 * engine.addRule({
 *   id: "healing-needed",
 *   priority: 80,
 *   condition: lt(field("context.health"), literal(0.3)),
 *   action: { type: "spawn", template: "healing-potion" },
 * });
 *
 * const results = engine.evaluate(context);
 * // Returns: [{ ruleId: "healing-needed", action: {...}, matched: true }]
 * ```
 */

import { type CompiledPath, type CompiledRule, compileRule } from "./compiler";
import type { EvaluationContext, EvalValue, FieldResolver } from "./evaluator";
import { createRuleCache, evaluate, evaluateAsBoolean } from "./evaluator";
import type { Expression } from "./expression";
import type { FunctionRegistry } from "./functions";
import { builtinFunctions } from "./functions";

// =============================================================================
// RULE TYPES
// =============================================================================

/**
 * A rule - condition + action pair
 */
export interface Rule<TAction = unknown> {
  /**
   * Unique identifier for this rule
   */
  readonly id: string;

  /**
   * Priority for ordering (higher = evaluated first)
   */
  readonly priority: number;

  /**
   * Condition expression - must evaluate to truthy for rule to match
   */
  readonly condition: Expression;

  /**
   * Action to take when the rule matches
   * Can be any data structure - the game defines the schema
   */
  readonly action: TAction;

  /**
   * Optional: Description for debugging
   */
  readonly description?: string;

  /**
   * Optional: Tags for filtering
   */
  readonly tags?: readonly string[];

  /**
   * Optional: Whether this rule is enabled
   */
  readonly enabled?: boolean;

  /**
   * Optional: Stop processing more rules if this one matches
   */
  readonly exclusive?: boolean;
}

/**
 * Result of evaluating a single rule
 */
export interface RuleResult<TAction = unknown> {
  /**
   * The rule ID
   */
  readonly ruleId: string;

  /**
   * Whether the condition matched
   */
  readonly matched: boolean;

  /**
   * The action (only present if matched)
   */
  readonly action?: TAction;

  /**
   * Evaluated action (if action contains expressions)
   */
  readonly evaluatedAction?: EvalValue;

  /**
   * Error message if evaluation failed
   */
  readonly error?: string;
}

/**
 * Result of evaluating all rules
 */
export interface EngineResult<TAction = unknown> {
  /**
   * All rule results
   */
  readonly results: readonly RuleResult<TAction>[];

  /**
   * Only the matched rules
   */
  readonly matched: readonly RuleResult<TAction>[];

  /**
   * Execution time in milliseconds
   */
  readonly durationMs: number;
}

// =============================================================================
// RULE ENGINE
// =============================================================================

/**
 * Rule Engine - evaluates rules against a context
 */
export interface RuleEngine<TAction = unknown> {
  /**
   * Add a rule to the engine
   */
  addRule(rule: Rule<TAction>): void;

  /**
   * Remove a rule by ID
   */
  removeRule(id: string): void;

  /**
   * Get a rule by ID
   */
  getRule(id: string): Rule<TAction> | undefined;

  /**
   * Get all rules
   */
  getRules(): readonly Rule<TAction>[];

  /**
   * Get rules by tag
   */
  getRulesByTag(tag: string): readonly Rule<TAction>[];

  /**
   * Evaluate all rules against a field resolver.
   *
   * @param fields - Field resolver for accessing context data
   * @param rng - REQUIRED seeded random function for deterministic evaluation.
   *              Using Math.random will break reproducibility.
   */
  evaluate(fields: FieldResolver, rng: () => number): EngineResult<TAction>;

  /**
   * Evaluate only rules with specific tags.
   *
   * @param fields - Field resolver for accessing context data
   * @param tags - Tags to filter rules
   * @param rng - REQUIRED seeded random function for deterministic evaluation.
   *              Using Math.random will break reproducibility.
   */
  evaluateWithTags(
    fields: FieldResolver,
    tags: string[],
    rng: () => number,
  ): EngineResult<TAction>;

  /**
   * Register a custom function
   */
  registerFunction(
    name: string,
    arity: number,
    fn: (args: readonly EvalValue[], ctx: EvaluationContext) => EvalValue,
  ): void;

  /**
   * Clear all rules
   */
  clear(): void;

  /**
   * Get the function registry
   */
  getFunctions(): FunctionRegistry;
}

/**
 * Rule engine options
 */
export interface RuleEngineOptions {
  /**
   * Custom function registry (defaults to built-ins)
   */
  functions?: FunctionRegistry;

  /**
   * Whether to continue evaluating after an exclusive rule matches
   */
  ignoreExclusive?: boolean;

  /**
   * Maximum number of rules to match (0 = unlimited)
   */
  maxMatches?: number;

  /**
   * Whether to compile expressions for faster evaluation
   * Default: true
   */
  compile?: boolean;
}

/**
 * Create a new rule engine
 *
 * Optimizations:
 * - Rules are sorted once when added, not on every evaluate()
 * - Expressions are compiled to native functions
 * - Field paths are cached for reuse
 */
export function createRuleEngine<TAction = unknown>(
  options: RuleEngineOptions = {},
): RuleEngine<TAction> {
  const rules = new Map<string, Rule<TAction>>();
  const compiledRules = new Map<string, CompiledRule<TAction>>();
  const functions = options.functions?.clone() ?? builtinFunctions.clone();
  const ignoreExclusive = options.ignoreExclusive ?? false;
  const maxMatches = options.maxMatches ?? 0;
  const shouldCompile = options.compile !== false;

  // Shared path cache for compiled expressions
  const pathCache = new Map<string, CompiledPath>();

  // Cached sorted rules - invalidated when rules change
  let sortedRulesCache: CompiledRule<TAction>[] | null = null;

  function invalidateCache(): void {
    sortedRulesCache = null;
  }

  function getSortedRules(): CompiledRule<TAction>[] {
    if (sortedRulesCache !== null) {
      return sortedRulesCache;
    }

    // Build and sort compiled rules
    sortedRulesCache = Array.from(compiledRules.values())
      .filter((r) => r.enabled !== false)
      .sort((a, b) => b.priority - a.priority);

    return sortedRulesCache;
  }

  function evaluateRules(
    rulesToEvaluate: CompiledRule<TAction>[],
    fields: FieldResolver,
    rng: () => number,
  ): EngineResult<TAction> {
    const startTime = performance.now();
    const results: RuleResult<TAction>[] = [];
    const matched: RuleResult<TAction>[] = [];
    const ruleCache = createRuleCache();

    const ctx: EvaluationContext = {
      fields,
      functions,
      ruleCache,
      rng,
    };

    for (let i = 0; i < rulesToEvaluate.length; i++) {
      const rule = rulesToEvaluate[i];
      if (!rule) continue;

      // Check max matches
      if (maxMatches > 0 && matched.length >= maxMatches) {
        break;
      }

      try {
        // Use compiled condition (much faster)
        const conditionResult = !!rule.condition(ctx);

        // Cache the result for potential rule references
        ruleCache.set(rule.id, conditionResult);

        if (conditionResult) {
          // Evaluate action if it contains expressions
          let evaluatedAction: EvalValue | undefined;
          if (
            typeof rule.action === "object" &&
            rule.action !== null &&
            "type" in (rule.action as Record<string, unknown>)
          ) {
            try {
              evaluatedAction = evaluateActionExpressions(rule.action, ctx);
            } catch {
              // Action evaluation failed, use raw action
            }
          }

          const result: RuleResult<TAction> = {
            ruleId: rule.id,
            matched: true,
            action: rule.action,
            evaluatedAction,
          };

          results.push(result);
          matched.push(result);

          // Handle exclusive rules
          if (rule.exclusive && !ignoreExclusive) {
            break;
          }
        } else {
          results.push({
            ruleId: rule.id,
            matched: false,
          });
        }
      } catch (error) {
        results.push({
          ruleId: rule.id,
          matched: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      results,
      matched,
      durationMs: performance.now() - startTime,
    };
  }

  return {
    addRule(rule: Rule<TAction>): void {
      rules.set(rule.id, rule);

      // Compile and cache
      if (shouldCompile) {
        compiledRules.set(rule.id, compileRule(rule, { pathCache }));
      } else {
        // Wrap uncompiled rule
        compiledRules.set(rule.id, {
          ...rule,
          condition: (ctx) => evaluateAsBoolean(rule.condition, ctx),
        });
      }

      invalidateCache();
    },

    removeRule(id: string): void {
      rules.delete(id);
      compiledRules.delete(id);
      invalidateCache();
    },

    getRule(id: string): Rule<TAction> | undefined {
      return rules.get(id);
    },

    getRules(): readonly Rule<TAction>[] {
      // Return original rules sorted by priority
      return Array.from(rules.values())
        .filter((r) => r.enabled !== false)
        .sort((a, b) => b.priority - a.priority);
    },

    getRulesByTag(tag: string): readonly Rule<TAction>[] {
      return Array.from(rules.values())
        .filter((r) => r.enabled !== false && r.tags?.includes(tag))
        .sort((a, b) => b.priority - a.priority);
    },

    evaluate(
      fields: FieldResolver,
      rng: () => number,
    ): EngineResult<TAction> {
      if (!rng) {
        throw new Error(
          "RNG function is required for deterministic rule evaluation. " +
          "Pass a seeded random function (e.g., () => seededRandom.next()).",
        );
      }
      return evaluateRules(getSortedRules(), fields, rng);
    },

    evaluateWithTags(
      fields: FieldResolver,
      tags: string[],
      rng: () => number,
    ): EngineResult<TAction> {
      if (!rng) {
        throw new Error(
          "RNG function is required for deterministic rule evaluation. " +
          "Pass a seeded random function (e.g., () => seededRandom.next()).",
        );
      }
      const tagSet = new Set(tags);
      const filtered = getSortedRules().filter((r) =>
        r.tags?.some((t) => tagSet.has(t)),
      );
      return evaluateRules(filtered, fields, rng);
    },

    registerFunction(
      name: string,
      arity: number,
      fn: (args: readonly EvalValue[], ctx: EvaluationContext) => EvalValue,
    ): void {
      functions.register({
        name,
        arity,
        execute: fn,
      });
    },

    clear(): void {
      rules.clear();
      compiledRules.clear();
      invalidateCache();
    },

    getFunctions(): FunctionRegistry {
      return functions;
    },
  };
}

// =============================================================================
// ACTION EXPRESSION EVALUATION
// =============================================================================

/**
 * Recursively evaluate expressions within an action object
 */
function evaluateActionExpressions(
  action: unknown,
  ctx: EvaluationContext,
): EvalValue {
  if (action === null || action === undefined) {
    return action as EvalValue;
  }

  if (typeof action !== "object") {
    return action as EvalValue;
  }

  // Check if it's an expression
  if ("type" in action) {
    const type = (action as Record<string, unknown>).type;
    if (
      typeof type === "string" &&
      [
        "literal",
        "field",
        "op",
        "unary",
        "fn",
        "cond",
        "ref",
        "array",
        "object",
        "range",
        "in",
      ].includes(type)
    ) {
      return evaluate(action as Expression, ctx);
    }
  }

  // Recurse into arrays
  if (Array.isArray(action)) {
    return action.map((item) => evaluateActionExpressions(item, ctx));
  }

  // Recurse into objects
  const result: Record<string, EvalValue> = {};
  for (const [key, value] of Object.entries(action)) {
    result[key] = evaluateActionExpressions(value, ctx);
  }
  return result;
}

// =============================================================================
// RULE BUILDERS
// =============================================================================

/**
 * Create a rule from a JSON-like definition
 */
export function createRule<TAction>(
  id: string,
  priority: number,
  condition: Expression,
  action: TAction,
  options: {
    description?: string;
    tags?: string[];
    enabled?: boolean;
    exclusive?: boolean;
  } = {},
): Rule<TAction> {
  return {
    id,
    priority,
    condition,
    action,
    ...options,
  };
}

/**
 * Parse rules from JSON
 */
export function parseRules<TAction>(json: string): Rule<TAction>[] {
  const parsed = JSON.parse(json);

  if (!Array.isArray(parsed)) {
    throw new Error("Expected array of rules");
  }

  return parsed.map((rule) => {
    if (!rule.id || typeof rule.id !== "string") {
      throw new Error("Rule missing id");
    }
    if (typeof rule.priority !== "number") {
      throw new Error(`Rule ${rule.id} missing priority`);
    }
    if (!rule.condition) {
      throw new Error(`Rule ${rule.id} missing condition`);
    }
    if (!rule.action) {
      throw new Error(`Rule ${rule.id} missing action`);
    }

    return rule as Rule<TAction>;
  });
}

// =============================================================================
// RULE SET HELPERS
// =============================================================================

/**
 * Merge multiple rule engines
 */
export function mergeEngines<TAction>(
  ...engines: RuleEngine<TAction>[]
): RuleEngine<TAction> {
  const merged = createRuleEngine<TAction>();

  for (const engine of engines) {
    for (const rule of engine.getRules()) {
      merged.addRule(rule);
    }
  }

  return merged;
}

/**
 * Filter rules from an engine
 */
export function filterRules<TAction>(
  engine: RuleEngine<TAction>,
  predicate: (rule: Rule<TAction>) => boolean,
): RuleEngine<TAction> {
  const filtered = createRuleEngine<TAction>({
    functions: engine.getFunctions(),
  });

  for (const rule of engine.getRules()) {
    if (predicate(rule)) {
      filtered.addRule(rule);
    }
  }

  return filtered;
}
