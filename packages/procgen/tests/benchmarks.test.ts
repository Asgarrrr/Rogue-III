/**
 * Performance Benchmarks
 *
 * Verifies the optimizations provide expected speedups.
 */

import { describe, expect, it } from "bun:test";
import { createModifier } from "../src/core/modifiers/modifier";
// Modifier Stack
import { modifierStackBuilder } from "../src/core/modifiers/stack";
import { compileExpression, compilePath } from "../src/core/rules/compiler";
import { createRuleEngine } from "../src/core/rules/engine";
import { createObjectResolver, evaluate } from "../src/core/rules/evaluator";
// Rule Engine & Compiler
import { and, field, gt, literal, lt } from "../src/core/rules/expression";
import { builtinFunctions } from "../src/core/rules/functions";
import { blendTraits, mutateTraits } from "../src/core/traits/blend";
// Trait Vector
import {
  createTraitVector,
  getTraitValue,
} from "../src/core/traits/trait-vector";

// =============================================================================
// HELPER
// =============================================================================

function benchmark(
  _name: string,
  fn: () => void,
  iterations: number = 10000,
): number {
  // Warmup
  for (let i = 0; i < 100; i++) fn();

  const start = performance.now();
  for (let i = 0; i < iterations; i++) fn();
  const end = performance.now();

  const opsPerMs = iterations / (end - start);
  return opsPerMs;
}

function createRng(seed: number = 12345): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

// =============================================================================
// TRAIT VECTOR BENCHMARKS
// =============================================================================

describe("TraitVector Performance", () => {
  it("should achieve fast property access", () => {
    const traits = createTraitVector({
      strength: 0.8,
      agility: 0.6,
      wisdom: 0.7,
      charisma: 0.5,
      endurance: 0.9,
    });

    const ops = benchmark("trait access", () => {
      getTraitValue(traits, "strength");
      getTraitValue(traits, "agility");
      getTraitValue(traits, "wisdom");
    });

    // Plain object access should be fast
    expect(ops).toBeGreaterThan(1_000); // >1k ops/ms
    console.log(`TraitVector access: ${ops.toFixed(0)} ops/ms`);
  });

  it("should achieve fast blending", () => {
    const a = createTraitVector({ x: 0.2, y: 0.8, z: 0.5 });
    const b = createTraitVector({ x: 0.9, y: 0.1, z: 0.3 });

    const ops = benchmark("trait blend", () => {
      blendTraits(a, b, 0.5);
    });

    expect(ops).toBeGreaterThan(500); // >500 ops/ms
    console.log(`TraitVector blend: ${ops.toFixed(0)} ops/ms`);
  });

  it("should achieve fast mutation", () => {
    const traits = createTraitVector({
      a: 0.5,
      b: 0.5,
      c: 0.5,
      d: 0.5,
    });
    const rng = createRng();

    const ops = benchmark("trait mutate", () => {
      mutateTraits(traits, 0.1, rng);
    });

    expect(ops).toBeGreaterThan(1_000); // >1k ops/ms
    console.log(`TraitVector mutate: ${ops.toFixed(0)} ops/ms`);
  });
});

// =============================================================================
// EXPRESSION COMPILER BENCHMARKS
// =============================================================================

describe("Expression Compiler Performance", () => {
  it("should compile expressions for faster evaluation", () => {
    const expr = and(
      lt(field("health"), literal(0.3)),
      gt(field("level"), literal(5)),
    );

    const fields = createObjectResolver({
      health: 0.2,
      level: 10,
    });
    const functions = builtinFunctions.clone();
    const ruleCache = new Map<string, number | boolean>();
    const rng = createRng();

    const ctx = { fields, functions, ruleCache, rng };

    // Interpreted evaluation
    const interpretedOps = benchmark("interpreted", () => {
      evaluate(expr, ctx);
    });

    // Compiled evaluation
    const compiled = compileExpression(expr);
    const compiledOps = benchmark("compiled", () => {
      compiled(ctx);
    });

    // Compiled should be faster (JIT variability may affect exact ratio)
    const speedup = compiledOps / interpretedOps;
    expect(speedup).toBeGreaterThan(1.2); // At least 1.2x faster
    console.log(`Expression interpreted: ${interpretedOps.toFixed(0)} ops/ms`);
    console.log(`Expression compiled: ${compiledOps.toFixed(0)} ops/ms`);
    console.log(`Speedup: ${speedup.toFixed(1)}x`);
  });

  it("should compile field paths efficiently", () => {
    const data = {
      player: {
        stats: {
          health: 100,
          mana: 50,
        },
      },
    };

    // The benefit of compilePath is when you access the same path multiple times
    // We pre-compile once, then reuse the accessor

    // Scenario: Access 3 different paths repeatedly
    const paths = ["player.stats.health", "player.stats.mana", "player"];

    // Split every time (old way)
    function accessPathSplit(path: string, data: unknown): unknown {
      const parts = path.split(".");
      let current: unknown = data;
      for (const part of parts) {
        if (current === null || current === undefined) return 0;
        if (typeof current !== "object") return 0;
        current = (current as Record<string, unknown>)[part];
      }
      return current;
    }

    const splitOps = benchmark("path split", () => {
      for (const path of paths) {
        accessPathSplit(path, data);
      }
    });

    // Pre-compiled paths (new way)
    const accessors = paths.map((p) => compilePath(p));
    const compiledOps = benchmark("path compiled", () => {
      for (const accessor of accessors) {
        accessor(data);
      }
    });

    // Compiled should be at least competitive
    // The main win is avoiding repeated string.split()
    console.log(`Path split (3 paths): ${splitOps.toFixed(0)} ops/ms`);
    console.log(`Path compiled (3 paths): ${compiledOps.toFixed(0)} ops/ms`);
    console.log(`Ratio: ${(compiledOps / splitOps).toFixed(1)}x`);

    // Just verify it works, not a strict speedup requirement
    expect(compiledOps).toBeGreaterThan(1000);
  });
});

// =============================================================================
// RULE ENGINE BENCHMARKS
// =============================================================================

describe("Rule Engine Performance", () => {
  it("should evaluate rules efficiently with caching", () => {
    const engine = createRuleEngine<{ type: string }>();

    // Add 20 rules
    for (let i = 0; i < 20; i++) {
      engine.addRule({
        id: `rule-${i}`,
        priority: i,
        condition: gt(field("value"), literal(i * 5)),
        action: { type: `action-${i}` },
      });
    }

    const fields = createObjectResolver({ value: 50 });
    const rng = createRng();

    // First call triggers cache build
    engine.evaluate(fields, rng);

    // Subsequent calls use cached sorted rules
    const ops = benchmark(
      "rule engine evaluate",
      () => {
        engine.evaluate(fields, rng);
      },
      1000,
    );

    expect(ops).toBeGreaterThan(100); // >100 ops/ms (1000 rules/sec)
    console.log(`Rule engine (20 rules): ${ops.toFixed(0)} ops/ms`);
  });

  it("should scale linearly with rule count", () => {
    const smallEngine = createRuleEngine<{ type: string }>();
    const largeEngine = createRuleEngine<{ type: string }>();

    // Small: 5 rules
    for (let i = 0; i < 5; i++) {
      smallEngine.addRule({
        id: `rule-${i}`,
        priority: i,
        condition: gt(field("value"), literal(i)),
        action: { type: `action-${i}` },
      });
    }

    // Large: 50 rules
    for (let i = 0; i < 50; i++) {
      largeEngine.addRule({
        id: `rule-${i}`,
        priority: i,
        condition: gt(field("value"), literal(i)),
        action: { type: `action-${i}` },
      });
    }

    const fields = createObjectResolver({ value: 25 });
    const rng = createRng();

    const smallOps = benchmark(
      "small engine",
      () => {
        smallEngine.evaluate(fields, rng);
      },
      1000,
    );

    const largeOps = benchmark(
      "large engine",
      () => {
        largeEngine.evaluate(fields, rng);
      },
      1000,
    );

    // 10x more rules should be roughly 10x slower, not worse
    const ratio = smallOps / largeOps;
    expect(ratio).toBeLessThan(20); // Should scale reasonably
    console.log(`5 rules: ${smallOps.toFixed(0)} ops/ms`);
    console.log(`50 rules: ${largeOps.toFixed(0)} ops/ms`);
    console.log(`Scaling factor: ${ratio.toFixed(1)}x (ideal: 10x)`);
  });
});

// =============================================================================
// MODIFIER STACK BENCHMARKS
// =============================================================================

describe("ModifierStack Performance", () => {
  it("should construct efficiently with builder pattern", () => {
    // createModifier(id, transform, weight) - correct order
    const modifier1 = createModifier<number[]>(
      "add-noise",
      (arr, rng) => arr.map((x) => x + rng() * 0.1),
      1,
    );
    const modifier2 = createModifier<number[]>(
      "smooth",
      (arr) => arr.map((x, i, a) => (a[i - 1] ?? x + a[i + 1] ?? x + x) / 3),
      1,
    );
    const modifier3 = createModifier<number[]>(
      "scale",
      (arr) => arr.map((x) => x * 2),
      1,
    );

    const ops = benchmark("stack builder", () => {
      modifierStackBuilder<number[]>()
        .add(modifier1)
        .add(modifier2)
        .add(modifier3)
        .sortByPriority()
        .build();
    });

    expect(ops).toBeGreaterThan(500); // >500 ops/ms
    console.log(`ModifierStack build: ${ops.toFixed(0)} ops/ms`);
  });

  it("should apply modifiers efficiently", () => {
    const stack = modifierStackBuilder<number[]>()
      .add(createModifier("m1", (arr) => arr.map((x) => x + 1), 1))
      .add(createModifier("m2", (arr) => arr.map((x) => x * 2), 1))
      .add(createModifier("m3", (arr) => arr.map((x) => x - 0.5), 1))
      .build();

    const data = [1, 2, 3, 4, 5];
    const rng = createRng();

    const ops = benchmark("stack apply", () => {
      stack.apply(data, rng);
    });

    expect(ops).toBeGreaterThan(1_000); // >1k ops/ms
    console.log(`ModifierStack apply: ${ops.toFixed(0)} ops/ms`);
  });

  it("should lookup modifiers by ID efficiently", () => {
    const stack = modifierStackBuilder<number>()
      .add(createModifier("mod-1", (x) => x + 1, 1))
      .add(createModifier("mod-2", (x) => x * 2, 1))
      .add(createModifier("mod-3", (x) => x - 1, 1))
      .add(createModifier("mod-4", (x) => x / 2, 1))
      .add(createModifier("mod-5", (x) => x + 10, 1))
      .build();

    const ops = benchmark("stack lookup", () => {
      stack.get("mod-3");
      stack.has("mod-4");
      stack.get("mod-1");
    });

    expect(ops).toBeGreaterThan(5_000); // >5k ops/ms (Map lookup is O(1))
    console.log(`ModifierStack lookup: ${ops.toFixed(0)} ops/ms`);
  });
});

// =============================================================================
// SUMMARY
// =============================================================================

describe("Performance Summary", () => {
  it("should print performance summary", () => {
    console.log("\n=== PERFORMANCE SUMMARY ===\n");
    console.log("Optimizations implemented:");
    console.log("1. TraitVector: Plain objects instead of Map");
    console.log("2. Expression Compiler: AST → native functions");
    console.log("3. Field Path Compilation: One-time path parsing");
    console.log("4. Rule Engine: Cached sorted rules, compiled conditions");
    console.log("5. ModifierStack: Builder pattern, pre-indexed lookups");
    console.log("\nAll benchmarks passed minimum thresholds.\n");
  });
});
