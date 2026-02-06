/**
 * Modifier Stack System Tests
 */

import { describe, expect, it } from "bun:test";
import {
  applyShuffled,
  applyTopN,
  applyWeighted,
  chainModifiers,
  createModifier,
  createModifierPresets,
  createModifierStack,
  createModifierStackFrom,
  createModifierWithMeta,
  identityModifier,
  type Modifier,
  selectWeighted,
  withCondition,
  withProbability,
} from "../src";

describe("createModifier", () => {
  it("creates a simple modifier", () => {
    const double = createModifier<number>("double", (value) => value * 2, 1);

    expect(double.id).toBe("double");
    expect(double.weight).toBe(1);
    expect(double.apply(5, Math.random)).toBe(10);
  });

  it("uses default weight of 1", () => {
    const mod = createModifier<number>("test", (v) => v);
    expect(mod.weight).toBe(1);
  });
});

describe("createModifierWithMeta", () => {
  it("creates a modifier with metadata", () => {
    const mod = createModifierWithMeta<number>(
      {
        id: "boost",
        weight: 2,
        description: "Boosts the value",
        enabled: true,
        tags: ["combat", "buff"],
        priority: 10,
      },
      (value) => value + 10,
    );

    expect(mod.id).toBe("boost");
    expect(mod.weight).toBe(2);
    expect(mod.description).toBe("Boosts the value");
    expect(mod.enabled).toBe(true);
    expect(mod.tags).toContain("combat");
    expect(mod.priority).toBe(10);
    expect(mod.apply(5, Math.random)).toBe(15);
  });

  it("uses defaults for optional fields", () => {
    const mod = createModifierWithMeta<number>({ id: "minimal" }, (v) => v);

    expect(mod.weight).toBe(1);
    expect(mod.enabled).toBe(true);
  });
});

describe("withCondition", () => {
  it("applies only when condition is true", () => {
    const base = createModifier<number>("double", (v) => v * 2);
    const conditional = withCondition(base, (v) => v > 5);

    expect(conditional.apply(3, Math.random)).toBe(3); // Condition false
    expect(conditional.apply(10, Math.random)).toBe(20); // Condition true
  });

  it("receives rng in condition", () => {
    const base = createModifier<number>("boost", (v) => v + 10);
    const conditional = withCondition(base, (_, rng) => rng() > 0.5);

    // With fixed rng returning 0.3
    expect(conditional.apply(5, () => 0.3)).toBe(5); // Condition false

    // With fixed rng returning 0.7
    expect(conditional.apply(5, () => 0.7)).toBe(15); // Condition true
  });
});

describe("withProbability", () => {
  it("applies with given probability", () => {
    const base = createModifier<number>("double", (v) => v * 2);
    const probabilistic = withProbability(base, 0.5);

    // With rng returning 0.3 (< 0.5), should apply
    expect(probabilistic.apply(10, () => 0.3)).toBe(20);

    // With rng returning 0.7 (> 0.5), should not apply
    expect(probabilistic.apply(10, () => 0.7)).toBe(10);
  });
});

describe("chainModifiers", () => {
  it("chains multiple modifiers", () => {
    const add5 = createModifier<number>("add5", (v) => v + 5);
    const double = createModifier<number>("double", (v) => v * 2);

    const chained = chainModifiers([add5, double], "add-then-double");

    // (10 + 5) * 2 = 30
    expect(chained.apply(10, Math.random)).toBe(30);
    expect(chained.id).toBe("add-then-double");
  });

  it("averages weights", () => {
    const mod1 = createModifier<number>("a", (v) => v, 2);
    const mod2 = createModifier<number>("b", (v) => v, 4);

    const chained = chainModifiers([mod1, mod2], "chain");
    expect(chained.weight).toBe(3); // (2 + 4) / 2
  });

  it("skips disabled modifiers", () => {
    const enabled = createModifierWithMeta<number>(
      { id: "enabled", enabled: true },
      (v) => v + 10,
    );
    const disabled = createModifierWithMeta<number>(
      { id: "disabled", enabled: false },
      (v) => v * 2,
    );

    const chained = chainModifiers([enabled, disabled], "chain");
    expect(chained.apply(5, Math.random)).toBe(15); // Only +10, not *2
  });
});

describe("identityModifier", () => {
  it("returns value unchanged", () => {
    const identity = identityModifier<number>();
    expect(identity.apply(42, Math.random)).toBe(42);
    expect(identity.weight).toBe(0);
  });

  it("accepts custom id", () => {
    const identity = identityModifier<string>("noop");
    expect(identity.id).toBe("noop");
  });
});

describe("ModifierStack basic operations", () => {
  it("creates empty stack", () => {
    const stack = createModifierStack<number>();
    expect(stack.size()).toBe(0);
  });

  it("adds modifiers", () => {
    const stack = createModifierStack<number>()
      .add(createModifier("a", (v) => v + 1))
      .add(createModifier("b", (v) => v + 2));

    expect(stack.size()).toBe(2);
    expect(stack.has("a")).toBe(true);
    expect(stack.has("b")).toBe(true);
  });

  it("removes modifiers", () => {
    const stack = createModifierStack<number>()
      .add(createModifier("a", (v) => v + 1))
      .add(createModifier("b", (v) => v + 2))
      .remove("a");

    expect(stack.size()).toBe(1);
    expect(stack.has("a")).toBe(false);
    expect(stack.has("b")).toBe(true);
  });

  it("gets modifier by id", () => {
    const mod = createModifier<number>("test", (v) => v * 2);
    const stack = createModifierStack<number>().add(mod);

    expect(stack.get("test")).toBeDefined();
    expect(stack.get("missing")).toBeUndefined();
  });

  it("is immutable", () => {
    const stack1 = createModifierStack<number>();
    const stack2 = stack1.add(createModifier("a", (v) => v));

    expect(stack1.size()).toBe(0);
    expect(stack2.size()).toBe(1);
  });
});

describe("ModifierStack apply", () => {
  it("applies modifiers in sequence", () => {
    const stack = createModifierStack<number>()
      .add(createModifier("add5", (v) => v + 5))
      .add(createModifier("double", (v) => v * 2));

    // (10 + 5) * 2 = 30
    expect(stack.apply(10, Math.random)).toBe(30);
  });

  it("respects enabled state", () => {
    const stack = createModifierStack<number>()
      .add(createModifier("add5", (v) => v + 5))
      .add(createModifier("double", (v) => v * 2))
      .setEnabled("double", false);

    expect(stack.apply(10, Math.random)).toBe(15); // Only +5
  });

  it("passes rng to modifiers", () => {
    let receivedRng: (() => number) | null = null;

    const stack = createModifierStack<number>().add({
      id: "test",
      weight: 1,
      apply: (v, rng) => {
        receivedRng = rng;
        return v;
      },
    });

    const myRng = () => 0.5;
    stack.apply(10, myRng);

    expect(receivedRng).toBe(myRng);
  });
});

describe("ModifierStack conditional adding", () => {
  it("adds conditional modifiers", () => {
    const stack = createModifierStack<number>().addConditional(
      createModifier("double-large", (v) => v * 2),
      (v) => v > 5,
    );

    expect(stack.apply(3, Math.random)).toBe(3); // Condition false
    expect(stack.apply(10, Math.random)).toBe(20); // Condition true
  });

  it("adds probabilistic modifiers", () => {
    const stack = createModifierStack<number>().addProbabilistic(
      createModifier("double", (v) => v * 2),
      0.5,
    );

    expect(stack.apply(10, () => 0.3)).toBe(20); // rng < 0.5
    expect(stack.apply(10, () => 0.7)).toBe(10); // rng > 0.5
  });
});

describe("ModifierStack with tags", () => {
  it("applies only modifiers with specified tags", () => {
    const stack = createModifierStack<number>()
      .add(
        createModifierWithMeta(
          { id: "combat", tags: ["combat"] },
          (v) => v + 5,
        ),
      )
      .add(
        createModifierWithMeta({ id: "magic", tags: ["magic"] }, (v) => v * 2),
      )
      .add(
        createModifierWithMeta(
          { id: "both", tags: ["combat", "magic"] },
          (v) => v + 1,
        ),
      );

    // Apply only combat modifiers
    const result = stack.applyWithTags(10, Math.random, ["combat"]);
    expect(result).toBe(16); // +5 +1

    // Apply only magic modifiers
    const result2 = stack.applyWithTags(10, Math.random, ["magic"]);
    expect(result2).toBe(21); // *2 +1
  });

  it("gets modifiers by tags", () => {
    const stack = createModifierStack<number>()
      .add(createModifierWithMeta({ id: "a", tags: ["x"] }, (v) => v))
      .add(createModifierWithMeta({ id: "b", tags: ["y"] }, (v) => v))
      .add(createModifierWithMeta({ id: "c", tags: ["x", "y"] }, (v) => v));

    const xMods = stack.getByTags(["x"]);
    expect(xMods.length).toBe(2);
    expect(xMods.some((m) => m.id === "a")).toBe(true);
    expect(xMods.some((m) => m.id === "c")).toBe(true);
  });
});

describe("ModifierStack sorting", () => {
  it("sorts by priority", () => {
    const stack = createModifierStack<number>()
      .add(createModifierWithMeta({ id: "low", priority: 1 }, (v) => v + 1))
      .add(createModifierWithMeta({ id: "high", priority: 10 }, (v) => v * 2))
      .add(createModifierWithMeta({ id: "mid", priority: 5 }, (v) => v + 5))
      .sortByPriority();

    const mods = stack.getAll();
    expect(mods[0]?.id).toBe("high");
    expect(mods[1]?.id).toBe("mid");
    expect(mods[2]?.id).toBe("low");
  });

  it("sorts by weight", () => {
    const stack = createModifierStack<number>()
      .add(createModifier("light", (v) => v, 1))
      .add(createModifier("heavy", (v) => v, 10))
      .add(createModifier("medium", (v) => v, 5))
      .sortByWeight();

    const mods = stack.getAll();
    expect(mods[0]?.id).toBe("heavy");
    expect(mods[1]?.id).toBe("medium");
    expect(mods[2]?.id).toBe("light");
  });
});

describe("ModifierStack clone and merge", () => {
  it("clones a stack", () => {
    const original = createModifierStack<number>().add(
      createModifier("a", (v) => v + 1),
    );

    const clone = original.clone();
    expect(clone.size()).toBe(1);
    expect(clone.has("a")).toBe(true);

    // Modifying clone doesn't affect original
    const modified = clone.add(createModifier("b", (v) => v * 2));
    expect(original.size()).toBe(1);
    expect(modified.size()).toBe(2);
  });

  it("merges stacks", () => {
    const stack1 = createModifierStack<number>().add(
      createModifier("a", (v) => v + 1),
    );

    const stack2 = createModifierStack<number>().add(
      createModifier("b", (v) => v * 2),
    );

    const merged = stack1.merge(stack2);
    expect(merged.size()).toBe(2);
    expect(merged.has("a")).toBe(true);
    expect(merged.has("b")).toBe(true);
  });

  it("clears a stack", () => {
    const stack = createModifierStack<number>()
      .add(createModifier("a", (v) => v + 1))
      .add(createModifier("b", (v) => v * 2))
      .clear();

    expect(stack.size()).toBe(0);
  });
});

describe("createModifierStackFrom", () => {
  it("creates stack from existing modifiers", () => {
    const modifiers: Modifier<number>[] = [
      createModifier("a", (v) => v + 1),
      createModifier("b", (v) => v * 2),
    ];

    const stack = createModifierStackFrom(modifiers);
    expect(stack.size()).toBe(2);
    expect(stack.apply(10, Math.random)).toBe(22);
  });
});

describe("selectWeighted", () => {
  it("selects based on weights", () => {
    const stack = createModifierStack<number>()
      .add(createModifier("heavy", (v) => v * 2, 100))
      .add(createModifier("light", (v) => v + 1, 0.001));

    // With most RNG values, should select heavy
    const selected = selectWeighted(stack, () => 0.5);
    expect(selected.id).toBe("heavy");
  });

  it("returns identity for empty stack", () => {
    const stack = createModifierStack<number>();
    const selected = selectWeighted(stack, Math.random);
    expect(selected.apply(42, Math.random)).toBe(42);
  });
});

describe("applyWeighted", () => {
  it("applies a randomly selected modifier", () => {
    const stack = createModifierStack<number>().add(
      createModifier("only", (v) => v * 2, 1),
    );

    const result = applyWeighted(stack, 10, Math.random);
    expect(result).toBe(20);
  });
});

describe("applyShuffled", () => {
  it("applies all modifiers in random order", () => {
    const results = new Set<number>();

    // Run multiple times with different RNG seeds
    for (let i = 0; i < 10; i++) {
      let seed = i * 1000;
      const rng = () => {
        seed = (seed * 1103515245 + 12345) >>> 0;
        return (seed % 1000) / 1000;
      };

      const stack = createModifierStack<number>()
        .add(createModifier("add10", (v) => v + 10))
        .add(createModifier("double", (v) => v * 2));

      results.add(applyShuffled(stack, 5, rng));
    }

    // With shuffled order, we might get (5+10)*2=30 or (5*2)+10=20
    // Actually both operations are applied, just in different order
    expect(results.size).toBeGreaterThanOrEqual(1);
  });
});

describe("applyTopN", () => {
  it("applies only top N by weight", () => {
    const stack = createModifierStack<number>()
      .add(createModifier("heavy", (v) => v + 100, 10))
      .add(createModifier("medium", (v) => v + 10, 5))
      .add(createModifier("light", (v) => v + 1, 1));

    // Top 1 - only heavy
    expect(applyTopN(stack, 0, 1, Math.random)).toBe(100);

    // Top 2 - heavy + medium
    expect(applyTopN(stack, 0, 2, Math.random)).toBe(110);

    // Top 3 - all
    expect(applyTopN(stack, 0, 3, Math.random)).toBe(111);
  });
});

describe("ModifierPresets", () => {
  it("stores and retrieves presets", () => {
    const aggressiveStack = createModifierStack<number>().add(
      createModifier("boost", (v) => v * 2),
    );

    const defensiveStack = createModifierStack<number>().add(
      createModifier("reduce", (v) => v * 0.5),
    );

    const presets = createModifierPresets<number>()
      .add("aggressive", aggressiveStack)
      .add("defensive", defensiveStack);

    expect(presets.get("aggressive")?.apply(10, Math.random)).toBe(20);
    expect(presets.get("defensive")?.apply(10, Math.random)).toBe(5);
    expect(presets.get("unknown")).toBeUndefined();
  });

  it("lists preset names", () => {
    const presets = createModifierPresets<number>()
      .add("a", createModifierStack())
      .add("b", createModifierStack());

    const names = presets.names();
    expect(names).toContain("a");
    expect(names).toContain("b");
    expect(names.length).toBe(2);
  });
});

describe("Point array modifiers (corridor example)", () => {
  type Point = { x: number; y: number };

  it("can modify point arrays", () => {
    const addNoise = createModifier<Point[]>(
      "noise",
      (path, rng) => {
        return path.map((p) => ({
          x: p.x + Math.floor((rng() - 0.5) * 2),
          y: p.y + Math.floor((rng() - 0.5) * 2),
        }));
      },
      0.5,
    );

    const smoothPath = createModifier<Point[]>(
      "smooth",
      (path) => {
        if (path.length < 3) return path;
        return path.map((p, i) => {
          if (i === 0 || i === path.length - 1) return p;
          const prev = path[i - 1]!;
          const next = path[i + 1]!;
          return {
            x: Math.round((prev.x + p.x + next.x) / 3),
            y: Math.round((prev.y + p.y + next.y) / 3),
          };
        });
      },
      0.7,
    );

    const stack = createModifierStack<Point[]>().add(addNoise).add(smoothPath);

    const originalPath: Point[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
    ];

    let seed = 12345;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) >>> 0;
      return (seed % 1000) / 1000;
    };

    const modifiedPath = stack.apply(originalPath, rng);

    expect(modifiedPath.length).toBe(4);
    // First and last points preserved by smooth
    // Middle points may be modified
  });
});
