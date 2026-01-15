/**
 * Rule Engine Tests
 */

import { describe, expect, it } from "bun:test";
import {
  add,
  and,
  array,
  builtinFunctions,
  combineResolvers,
  cond,
  createFunction,
  // Functions
  createFunctionRegistry,
  createNumericFunction,
  createObjectResolver,
  createRule,
  createRuleCache,
  // Engine
  createRuleEngine,
  div,
  type EvaluationContext,
  eq,
  // Evaluator
  evaluate,
  evaluateAsBoolean,
  evaluateAsNumber,
  evaluateAsString,
  field,
  filterRules,
  fn,
  gt,
  inArray,
  // Expression builders
  literal,
  lt,
  mergeEngines,
  mul,
  neq,
  not,
  or,
  parseExpression,
  parseRules,
  range,
  stringifyExpression,
  sub,
  unary,
  validateExpression,
} from "../src";

// =============================================================================
// EXPRESSION TESTS
// =============================================================================

describe("Expression builders", () => {
  it("creates literal expressions", () => {
    expect(literal(42)).toEqual({ type: "literal", value: 42 });
    expect(literal("hello")).toEqual({ type: "literal", value: "hello" });
    expect(literal(true)).toEqual({ type: "literal", value: true });
  });

  it("creates field expressions", () => {
    expect(field("context.health")).toEqual({
      type: "field",
      path: "context.health",
    });
  });

  it("creates binary operation expressions", () => {
    const expr = add(literal(1), literal(2));
    expect(expr).toEqual({
      type: "op",
      op: "+",
      left: { type: "literal", value: 1 },
      right: { type: "literal", value: 2 },
    });
  });

  it("creates unary operation expressions", () => {
    const expr = not(literal(true));
    expect(expr).toEqual({
      type: "unary",
      op: "!",
      operand: { type: "literal", value: true },
    });
  });

  it("creates function call expressions", () => {
    const expr = fn("clamp", literal(5), literal(0), literal(10));
    expect(expr).toEqual({
      type: "fn",
      name: "clamp",
      args: [
        { type: "literal", value: 5 },
        { type: "literal", value: 0 },
        { type: "literal", value: 10 },
      ],
    });
  });

  it("creates conditional expressions", () => {
    const expr = cond(literal(true), literal(1), literal(0));
    expect(expr).toEqual({
      type: "cond",
      condition: { type: "literal", value: true },
      thenBranch: { type: "literal", value: 1 },
      elseBranch: { type: "literal", value: 0 },
    });
  });

  it("creates complex nested expressions", () => {
    // (health < 0.3) && (level > 5)
    const expr = and(
      lt(field("health"), literal(0.3)),
      gt(field("level"), literal(5)),
    );

    expect(expr.type).toBe("op");
    expect(expr.op).toBe("&&");
  });
});

describe("Expression validation", () => {
  it("validates correct expressions", () => {
    const expr = add(literal(1), literal(2));
    const result = validateExpression(expr);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("detects missing type field", () => {
    const result = validateExpression({ value: 42 });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("detects unknown expression type", () => {
    const result = validateExpression({ type: "unknown" });
    expect(result.valid).toBe(false);
  });

  it("validates nested expressions", () => {
    const expr = add(literal(1), { type: "invalid" } as any);
    const result = validateExpression(expr);
    expect(result.valid).toBe(false);
  });
});

describe("Expression serialization", () => {
  it("roundtrips through JSON", () => {
    const original = add(mul(field("x"), literal(2)), literal(10));

    const json = stringifyExpression(original);
    const parsed = parseExpression(json);

    expect(parsed).toEqual(original);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseExpression('{ "type": "invalid" }')).toThrow();
  });
});

// =============================================================================
// EVALUATOR TESTS
// =============================================================================

describe("Expression evaluation", () => {
  const ctx: EvaluationContext = {
    fields: createObjectResolver({
      health: 0.5,
      level: 10,
      name: "player",
      nested: { deep: { value: 42 } },
      items: [1, 2, 3],
    }),
    functions: builtinFunctions,
    ruleCache: createRuleCache(),
    rng: () => 0.5,
  };

  it("evaluates literals", () => {
    expect(evaluate(literal(42), ctx)).toBe(42);
    expect(evaluate(literal("hello"), ctx)).toBe("hello");
    expect(evaluate(literal(true), ctx)).toBe(true);
  });

  it("evaluates field access", () => {
    expect(evaluate(field("health"), ctx)).toBe(0.5);
    expect(evaluate(field("level"), ctx)).toBe(10);
    expect(evaluate(field("name"), ctx)).toBe("player");
  });

  it("evaluates nested field access", () => {
    expect(evaluate(field("nested.deep.value"), ctx)).toBe(42);
  });

  it("returns 0 for missing fields", () => {
    expect(evaluate(field("missing"), ctx)).toBe(0);
  });

  describe("arithmetic operations", () => {
    it("adds numbers", () => {
      expect(evaluate(add(literal(2), literal(3)), ctx)).toBe(5);
    });

    it("subtracts numbers", () => {
      expect(evaluate(sub(literal(5), literal(3)), ctx)).toBe(2);
    });

    it("multiplies numbers", () => {
      expect(evaluate(mul(literal(4), literal(3)), ctx)).toBe(12);
    });

    it("divides numbers", () => {
      expect(evaluate(div(literal(10), literal(2)), ctx)).toBe(5);
    });

    it("handles division by zero", () => {
      expect(evaluate(div(literal(10), literal(0)), ctx)).toBe(0);
    });

    it("concatenates strings with +", () => {
      expect(evaluate(add(literal("hello "), literal("world")), ctx)).toBe(
        "hello world",
      );
    });
  });

  describe("comparison operations", () => {
    it("compares less than", () => {
      expect(evaluate(lt(literal(1), literal(2)), ctx)).toBe(true);
      expect(evaluate(lt(literal(2), literal(1)), ctx)).toBe(false);
    });

    it("compares greater than", () => {
      expect(evaluate(gt(literal(2), literal(1)), ctx)).toBe(true);
      expect(evaluate(gt(literal(1), literal(2)), ctx)).toBe(false);
    });

    it("compares equality", () => {
      expect(evaluate(eq(literal(1), literal(1)), ctx)).toBe(true);
      expect(evaluate(eq(literal(1), literal(2)), ctx)).toBe(false);
      expect(evaluate(eq(literal("a"), literal("a")), ctx)).toBe(true);
    });

    it("compares inequality", () => {
      expect(evaluate(neq(literal(1), literal(2)), ctx)).toBe(true);
      expect(evaluate(neq(literal(1), literal(1)), ctx)).toBe(false);
    });
  });

  describe("logical operations", () => {
    it("evaluates AND", () => {
      expect(evaluate(and(literal(true), literal(true)), ctx)).toBe(true);
      expect(evaluate(and(literal(true), literal(false)), ctx)).toBe(false);
    });

    it("evaluates OR", () => {
      expect(evaluate(or(literal(false), literal(true)), ctx)).toBe(true);
      expect(evaluate(or(literal(false), literal(false)), ctx)).toBe(false);
    });

    it("evaluates NOT", () => {
      expect(evaluate(not(literal(true)), ctx)).toBe(false);
      expect(evaluate(not(literal(false)), ctx)).toBe(true);
    });
  });

  describe("unary operations", () => {
    it("negates numbers", () => {
      expect(evaluate(unary("-", literal(5)), ctx)).toBe(-5);
    });

    it("computes absolute value", () => {
      expect(evaluate(unary("abs", literal(-5)), ctx)).toBe(5);
    });

    it("floors numbers", () => {
      expect(evaluate(unary("floor", literal(3.7)), ctx)).toBe(3);
    });

    it("ceils numbers", () => {
      expect(evaluate(unary("ceil", literal(3.2)), ctx)).toBe(4);
    });

    it("rounds numbers", () => {
      expect(evaluate(unary("round", literal(3.5)), ctx)).toBe(4);
      expect(evaluate(unary("round", literal(3.4)), ctx)).toBe(3);
    });

    it("computes square root", () => {
      expect(evaluate(unary("sqrt", literal(16)), ctx)).toBe(4);
      expect(evaluate(unary("sqrt", literal(-1)), ctx)).toBe(0); // Negative returns 0
    });
  });

  describe("conditional expressions", () => {
    it("returns then branch when true", () => {
      expect(evaluate(cond(literal(true), literal(1), literal(2)), ctx)).toBe(
        1,
      );
    });

    it("returns else branch when false", () => {
      expect(evaluate(cond(literal(false), literal(1), literal(2)), ctx)).toBe(
        2,
      );
    });

    it("evaluates complex conditions", () => {
      // if (health < 0.3) then "low" else "ok"
      const expr = cond(
        lt(field("health"), literal(0.3)),
        literal("low"),
        literal("ok"),
      );
      expect(evaluate(expr, ctx)).toBe("ok"); // health is 0.5
    });
  });

  describe("array expressions", () => {
    it("creates arrays", () => {
      const expr = array(literal(1), literal(2), literal(3));
      expect(evaluate(expr, ctx)).toEqual([1, 2, 3]);
    });
  });

  describe("range expressions", () => {
    it("checks inclusive range", () => {
      expect(evaluate(range(literal(5), literal(0), literal(10)), ctx)).toBe(
        true,
      );
      expect(evaluate(range(literal(0), literal(0), literal(10)), ctx)).toBe(
        true,
      );
      expect(evaluate(range(literal(10), literal(0), literal(10)), ctx)).toBe(
        true,
      );
      expect(evaluate(range(literal(11), literal(0), literal(10)), ctx)).toBe(
        false,
      );
    });

    it("checks exclusive range", () => {
      expect(
        evaluate(range(literal(5), literal(0), literal(10), false), ctx),
      ).toBe(true);
      expect(
        evaluate(range(literal(0), literal(0), literal(10), false), ctx),
      ).toBe(false);
    });
  });

  describe("in expressions", () => {
    it("checks array membership", () => {
      expect(
        evaluate(
          inArray(literal(2), array(literal(1), literal(2), literal(3))),
          ctx,
        ),
      ).toBe(true);
      expect(
        evaluate(
          inArray(literal(5), array(literal(1), literal(2), literal(3))),
          ctx,
        ),
      ).toBe(false);
    });
  });
});

describe("Type coercion helpers", () => {
  const ctx: EvaluationContext = {
    fields: createObjectResolver({}),
    functions: builtinFunctions,
    ruleCache: createRuleCache(),
    rng: () => 0.5,
  };

  it("coerces to number", () => {
    expect(evaluateAsNumber(literal(42), ctx)).toBe(42);
    expect(evaluateAsNumber(literal("3.14"), ctx)).toBeCloseTo(3.14);
    expect(evaluateAsNumber(literal(true), ctx)).toBe(1);
    expect(evaluateAsNumber(literal(false), ctx)).toBe(0);
  });

  it("coerces to boolean", () => {
    expect(evaluateAsBoolean(literal(true), ctx)).toBe(true);
    expect(evaluateAsBoolean(literal(false), ctx)).toBe(false);
    expect(evaluateAsBoolean(literal(1), ctx)).toBe(true);
    expect(evaluateAsBoolean(literal(0), ctx)).toBe(false);
    expect(evaluateAsBoolean(literal(""), ctx)).toBe(false);
    expect(evaluateAsBoolean(literal("hello"), ctx)).toBe(true);
  });

  it("coerces to string", () => {
    expect(evaluateAsString(literal("hello"), ctx)).toBe("hello");
    expect(evaluateAsString(literal(42), ctx)).toBe("42");
    expect(evaluateAsString(literal(true), ctx)).toBe("true");
  });
});

// =============================================================================
// FUNCTION TESTS
// =============================================================================

describe("Built-in functions", () => {
  const ctx: EvaluationContext = {
    fields: createObjectResolver({}),
    functions: builtinFunctions,
    ruleCache: createRuleCache(),
    rng: () => 0.5,
  };

  describe("math functions", () => {
    it("clamp", () => {
      expect(
        evaluate(fn("clamp", literal(5), literal(0), literal(10)), ctx),
      ).toBe(5);
      expect(
        evaluate(fn("clamp", literal(-5), literal(0), literal(10)), ctx),
      ).toBe(0);
      expect(
        evaluate(fn("clamp", literal(15), literal(0), literal(10)), ctx),
      ).toBe(10);
    });

    it("lerp", () => {
      expect(
        evaluate(fn("lerp", literal(0), literal(10), literal(0.5)), ctx),
      ).toBe(5);
      expect(
        evaluate(fn("lerp", literal(0), literal(10), literal(0)), ctx),
      ).toBe(0);
      expect(
        evaluate(fn("lerp", literal(0), literal(10), literal(1)), ctx),
      ).toBe(10);
    });

    it("distance", () => {
      expect(
        evaluate(
          fn("distance", literal(0), literal(0), literal(3), literal(4)),
          ctx,
        ),
      ).toBe(5);
    });

    it("manhattan", () => {
      expect(
        evaluate(
          fn("manhattan", literal(0), literal(0), literal(3), literal(4)),
          ctx,
        ),
      ).toBe(7);
    });
  });

  describe("random functions", () => {
    it("random returns value from rng", () => {
      expect(evaluate(fn("random"), ctx)).toBe(0.5);
    });

    it("randomRange uses rng", () => {
      expect(evaluate(fn("randomRange", literal(0), literal(10)), ctx)).toBe(5);
    });

    it("chance uses rng", () => {
      expect(evaluate(fn("chance", literal(0.6)), ctx)).toBe(true); // rng returns 0.5
      expect(evaluate(fn("chance", literal(0.4)), ctx)).toBe(false);
    });
  });

  describe("array functions", () => {
    it("length", () => {
      expect(
        evaluate(fn("length", array(literal(1), literal(2), literal(3))), ctx),
      ).toBe(3);
      expect(evaluate(fn("length", literal("hello")), ctx)).toBe(5);
    });

    it("sum", () => {
      expect(
        evaluate(fn("sum", array(literal(1), literal(2), literal(3))), ctx),
      ).toBe(6);
    });

    it("avg", () => {
      expect(
        evaluate(fn("avg", array(literal(2), literal(4), literal(6))), ctx),
      ).toBe(4);
    });

    it("first and last", () => {
      const arr = array(literal(1), literal(2), literal(3));
      expect(evaluate(fn("first", arr), ctx)).toBe(1);
      expect(evaluate(fn("last", arr), ctx)).toBe(3);
    });

    it("contains", () => {
      const arr = array(literal(1), literal(2), literal(3));
      expect(evaluate(fn("contains", arr, literal(2)), ctx)).toBe(true);
      expect(evaluate(fn("contains", arr, literal(5)), ctx)).toBe(false);
    });
  });

  describe("string functions", () => {
    it("concat", () => {
      expect(
        evaluate(
          fn("concat", literal("hello"), literal(" "), literal("world")),
          ctx,
        ),
      ).toBe("hello world");
    });

    it("upper and lower", () => {
      expect(evaluate(fn("upper", literal("hello")), ctx)).toBe("HELLO");
      expect(evaluate(fn("lower", literal("HELLO")), ctx)).toBe("hello");
    });

    it("startsWith and endsWith", () => {
      expect(
        evaluate(fn("startsWith", literal("hello"), literal("he")), ctx),
      ).toBe(true);
      expect(
        evaluate(fn("endsWith", literal("hello"), literal("lo")), ctx),
      ).toBe(true);
    });
  });

  describe("logic functions", () => {
    it("if", () => {
      expect(
        evaluate(fn("if", literal(true), literal(1), literal(2)), ctx),
      ).toBe(1);
      expect(
        evaluate(fn("if", literal(false), literal(1), literal(2)), ctx),
      ).toBe(2);
    });

    it("and/or", () => {
      expect(
        evaluate(fn("and", literal(true), literal(true), literal(true)), ctx),
      ).toBe(true);
      expect(
        evaluate(fn("or", literal(false), literal(false), literal(true)), ctx),
      ).toBe(true);
    });

    it("coalesce", () => {
      expect(
        evaluate(fn("coalesce", literal(0), literal(""), literal(5)), ctx),
      ).toBe(5);
      expect(evaluate(fn("coalesce", literal(3), literal(5)), ctx)).toBe(3);
    });
  });
});

describe("Custom functions", () => {
  it("registers and uses custom functions", () => {
    const registry = createFunctionRegistry();

    registry.register(
      createFunction("double", 1, (args) => {
        const num = typeof args[0] === "number" ? args[0] : 0;
        return num * 2;
      }),
    );

    const ctx: EvaluationContext = {
      fields: createObjectResolver({}),
      functions: registry,
      ruleCache: createRuleCache(),
      rng: () => 0.5,
    };

    expect(evaluate(fn("double", literal(5)), ctx)).toBe(10);
  });

  it("creates numeric functions easily", () => {
    const registry = createFunctionRegistry();

    registry.register(createNumericFunction("triple", (x) => x * 3));

    const ctx: EvaluationContext = {
      fields: createObjectResolver({}),
      functions: registry,
      ruleCache: createRuleCache(),
      rng: () => 0.5,
    };

    expect(evaluate(fn("triple", literal(4)), ctx)).toBe(12);
  });
});

// =============================================================================
// RULE ENGINE TESTS
// =============================================================================

describe("Rule Engine", () => {
  interface SpawnAction {
    type: "spawn";
    template: string;
    count?: number;
  }

  it("creates an empty engine", () => {
    const engine = createRuleEngine<SpawnAction>();
    expect(engine.getRules()).toHaveLength(0);
  });

  it("adds and retrieves rules", () => {
    const engine = createRuleEngine<SpawnAction>();

    engine.addRule({
      id: "test-rule",
      priority: 10,
      condition: literal(true),
      action: { type: "spawn", template: "enemy" },
    });

    expect(engine.getRules()).toHaveLength(1);
    expect(engine.getRule("test-rule")).toBeDefined();
  });

  it("removes rules", () => {
    const engine = createRuleEngine<SpawnAction>();

    engine.addRule({
      id: "test-rule",
      priority: 10,
      condition: literal(true),
      action: { type: "spawn", template: "enemy" },
    });

    engine.removeRule("test-rule");
    expect(engine.getRules()).toHaveLength(0);
  });

  it("evaluates rules and returns matched", () => {
    const engine = createRuleEngine<SpawnAction>();

    engine.addRule({
      id: "healing",
      priority: 10,
      condition: lt(field("health"), literal(0.3)),
      action: { type: "spawn", template: "potion" },
    });

    engine.addRule({
      id: "enemy",
      priority: 5,
      condition: literal(true),
      action: { type: "spawn", template: "enemy" },
    });

    // Low health
    const lowHealth = createObjectResolver({ health: 0.2 });
    const rng = () => 0.5;
    const result1 = engine.evaluate(lowHealth, rng);

    expect(result1.matched).toHaveLength(2);
    expect(result1.matched[0]?.ruleId).toBe("healing");

    // High health
    const highHealth = createObjectResolver({ health: 0.8 });
    const result2 = engine.evaluate(highHealth, rng);

    expect(result2.matched).toHaveLength(1);
    expect(result2.matched[0]?.ruleId).toBe("enemy");
  });

  it("respects rule priority", () => {
    const engine = createRuleEngine<SpawnAction>();

    engine.addRule({
      id: "low",
      priority: 1,
      condition: literal(true),
      action: { type: "spawn", template: "low" },
    });

    engine.addRule({
      id: "high",
      priority: 100,
      condition: literal(true),
      action: { type: "spawn", template: "high" },
    });

    const result = engine.evaluate(createObjectResolver({}), () => 0.5);

    expect(result.matched[0]?.ruleId).toBe("high");
    expect(result.matched[1]?.ruleId).toBe("low");
  });

  it("respects exclusive rules", () => {
    const engine = createRuleEngine<SpawnAction>();

    engine.addRule({
      id: "exclusive",
      priority: 100,
      condition: literal(true),
      action: { type: "spawn", template: "exclusive" },
      exclusive: true,
    });

    engine.addRule({
      id: "normal",
      priority: 50,
      condition: literal(true),
      action: { type: "spawn", template: "normal" },
    });

    const result = engine.evaluate(createObjectResolver({}), () => 0.5);

    // Only exclusive rule should match because it stops further evaluation
    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]?.ruleId).toBe("exclusive");
  });

  it("filters by tags", () => {
    const engine = createRuleEngine<SpawnAction>();

    engine.addRule({
      id: "combat",
      priority: 10,
      condition: literal(true),
      action: { type: "spawn", template: "enemy" },
      tags: ["combat"],
    });

    engine.addRule({
      id: "treasure",
      priority: 10,
      condition: literal(true),
      action: { type: "spawn", template: "chest" },
      tags: ["treasure"],
    });

    const rng = () => 0.5;
    const combatResult = engine.evaluateWithTags(createObjectResolver({}), [
      "combat",
    ], rng);
    expect(combatResult.matched).toHaveLength(1);
    expect(combatResult.matched[0]?.ruleId).toBe("combat");

    const treasureResult = engine.evaluateWithTags(createObjectResolver({}), [
      "treasure",
    ], rng);
    expect(treasureResult.matched).toHaveLength(1);
    expect(treasureResult.matched[0]?.ruleId).toBe("treasure");
  });

  it("handles disabled rules", () => {
    const engine = createRuleEngine<SpawnAction>();

    engine.addRule({
      id: "disabled",
      priority: 100,
      condition: literal(true),
      action: { type: "spawn", template: "disabled" },
      enabled: false,
    });

    engine.addRule({
      id: "enabled",
      priority: 50,
      condition: literal(true),
      action: { type: "spawn", template: "enabled" },
    });

    const result = engine.evaluate(createObjectResolver({}), () => 0.5);

    expect(result.matched).toHaveLength(1);
    expect(result.matched[0]?.ruleId).toBe("enabled");
  });

  it("registers custom functions", () => {
    const engine = createRuleEngine<SpawnAction>();

    engine.registerFunction("isLowHealth", 1, (args) => {
      const health = typeof args[0] === "number" ? args[0] : 0;
      return health < 0.3;
    });

    engine.addRule({
      id: "healing",
      priority: 10,
      condition: fn("isLowHealth", field("health")),
      action: { type: "spawn", template: "potion" },
    });

    const lowHealth = createObjectResolver({ health: 0.2 });
    const result = engine.evaluate(lowHealth, () => 0.5);

    expect(result.matched).toHaveLength(1);
  });

  it("handles evaluation errors gracefully", () => {
    const engine = createRuleEngine<SpawnAction>();

    engine.addRule({
      id: "broken",
      priority: 10,
      condition: fn("nonexistent", literal(1)),
      action: { type: "spawn", template: "broken" },
    });

    const result = engine.evaluate(createObjectResolver({}), () => 0.5);

    expect(result.matched).toHaveLength(0);
    expect(result.results[0]?.error).toBeDefined();
  });

  it("respects maxMatches option", () => {
    const engine = createRuleEngine<SpawnAction>({ maxMatches: 2 });

    for (let i = 0; i < 5; i++) {
      engine.addRule({
        id: `rule-${i}`,
        priority: i,
        condition: literal(true),
        action: { type: "spawn", template: `template-${i}` },
      });
    }

    const result = engine.evaluate(createObjectResolver({}), () => 0.5);

    expect(result.matched).toHaveLength(2);
  });
});

describe("Rule builders", () => {
  it("creates rules with createRule", () => {
    const rule = createRule(
      "test",
      10,
      literal(true),
      { type: "spawn", template: "enemy" },
      { description: "Test rule", tags: ["combat"] },
    );

    expect(rule.id).toBe("test");
    expect(rule.priority).toBe(10);
    expect(rule.description).toBe("Test rule");
    expect(rule.tags).toContain("combat");
  });

  it("parses rules from JSON", () => {
    const json = JSON.stringify([
      {
        id: "test",
        priority: 10,
        condition: { type: "literal", value: true },
        action: { type: "spawn", template: "enemy" },
      },
    ]);

    const rules = parseRules(json);

    expect(rules).toHaveLength(1);
    expect(rules[0]?.id).toBe("test");
  });
});

describe("Engine utilities", () => {
  it("merges engines", () => {
    const engine1 = createRuleEngine();
    engine1.addRule({
      id: "rule1",
      priority: 10,
      condition: literal(true),
      action: { x: 1 },
    });

    const engine2 = createRuleEngine();
    engine2.addRule({
      id: "rule2",
      priority: 20,
      condition: literal(true),
      action: { x: 2 },
    });

    const merged = mergeEngines(engine1, engine2);

    expect(merged.getRules()).toHaveLength(2);
  });

  it("filters rules", () => {
    const engine = createRuleEngine();

    engine.addRule({
      id: "high",
      priority: 100,
      condition: literal(true),
      action: { x: 1 },
    });

    engine.addRule({
      id: "low",
      priority: 10,
      condition: literal(true),
      action: { x: 2 },
    });

    const filtered = filterRules(engine, (r) => r.priority > 50);

    expect(filtered.getRules()).toHaveLength(1);
    expect(filtered.getRule("high")).toBeDefined();
  });
});

describe("Field resolvers", () => {
  it("combines multiple resolvers", () => {
    const resolver1 = createObjectResolver({ a: 1 });
    const resolver2 = createObjectResolver({ b: 2 });
    const combined = combineResolvers(resolver1, resolver2);

    expect(combined.resolve("a")).toBe(1);
    expect(combined.resolve("b")).toBe(2);
  });
});

describe("Integration: Complex rule evaluation", () => {
  interface GameAction {
    type: string;
    data: Record<string, unknown>;
  }

  it("evaluates complex game rules", () => {
    const engine = createRuleEngine<GameAction>();

    // Rule: If health < 30% AND in dangerous room, spawn healing
    engine.addRule({
      id: "emergency-heal",
      priority: 100,
      condition: and(
        lt(field("player.health"), literal(0.3)),
        gt(field("room.traits.dangerous"), literal(0.7)),
      ),
      action: {
        type: "spawn",
        data: { template: "healing-potion", count: 2 },
      },
    });

    // Rule: If room has treasure trait > 0.5, spawn chest
    engine.addRule({
      id: "treasure-spawn",
      priority: 50,
      condition: gt(field("room.traits.valuable"), literal(0.5)),
      action: {
        type: "spawn",
        data: { template: "treasure-chest" },
      },
    });

    // Rule: Always spawn at least one enemy
    engine.addRule({
      id: "enemy-spawn",
      priority: 10,
      condition: literal(true),
      action: {
        type: "spawn",
        data: { template: "enemy" },
      },
    });

    // Scenario: Low health in dangerous room
    const context = createObjectResolver({
      player: { health: 0.2, level: 5 },
      room: {
        traits: { dangerous: 0.9, valuable: 0.3 },
      },
    });

    const result = engine.evaluate(context, () => 0.5);

    // Should match: emergency-heal (health low + dangerous), enemy-spawn (always)
    expect(result.matched).toHaveLength(2);
    expect(result.matched.map((r) => r.ruleId)).toContain("emergency-heal");
    expect(result.matched.map((r) => r.ruleId)).toContain("enemy-spawn");
    expect(result.matched.map((r) => r.ruleId)).not.toContain("treasure-spawn");
  });
});
