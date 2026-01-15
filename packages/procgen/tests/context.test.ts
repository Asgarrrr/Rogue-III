/**
 * Context Provider System Tests
 */

import { describe, expect, it } from "bun:test";
import {
  type ContextProvider,
  cacheContext,
  combineContexts,
  combineSeedWithContext,
  createContextProvider,
  createEmptyContext,
  remapContext,
  transformContext,
  withDefaults,
} from "../src";

describe("createContextProvider", () => {
  it("creates a provider from data", () => {
    const ctx = createContextProvider({
      health: 0.5,
      wealth: 0.8,
      power: 0.3,
    });

    expect(ctx.get("health")).toBe(0.5);
    expect(ctx.get("wealth")).toBe(0.8);
    expect(ctx.get("power")).toBe(0.3);
  });

  it("clamps values to [0, 1]", () => {
    const ctx = createContextProvider({
      tooLow: -0.5,
      tooHigh: 1.5,
    });

    expect(ctx.get("tooLow")).toBe(0);
    expect(ctx.get("tooHigh")).toBe(1);
  });

  it("returns default for missing keys", () => {
    const ctx = createContextProvider({ x: 0.5 });
    expect(ctx.get("missing")).toBe(0.5); // Default

    const ctx2 = createContextProvider({ x: 0.5 }, 0.3);
    expect(ctx2.get("missing")).toBe(0.3); // Custom default
  });

  it("provides deterministic hash", () => {
    const ctx1 = createContextProvider({ a: 0.5, b: 0.3 });
    const ctx2 = createContextProvider({ a: 0.5, b: 0.3 });
    const ctx3 = createContextProvider({ a: 0.5, b: 0.4 });

    expect(ctx1.hash()).toBe(ctx2.hash());
    expect(ctx1.hash()).not.toBe(ctx3.hash());
  });

  it("lists available keys", () => {
    const ctx = createContextProvider({ a: 0.1, b: 0.2, c: 0.3 });
    const keys = ctx.keys?.();

    expect(keys).toContain("a");
    expect(keys).toContain("b");
    expect(keys).toContain("c");
    expect(keys.length).toBe(3);
  });

  it("checks if key exists", () => {
    const ctx = createContextProvider({ existing: 0.5 });
    expect(ctx.has?.("existing")).toBe(true);
    expect(ctx.has?.("missing")).toBe(false);
  });
});

describe("createEmptyContext", () => {
  it("returns default for all keys", () => {
    const ctx = createEmptyContext();
    expect(ctx.get("anything")).toBe(0.5);
    expect(ctx.get("something")).toBe(0.5);
  });

  it("uses custom default", () => {
    const ctx = createEmptyContext(0.7);
    expect(ctx.get("anything")).toBe(0.7);
  });

  it("has zero hash", () => {
    const ctx = createEmptyContext();
    expect(ctx.hash()).toBe(0);
  });

  it("has no keys", () => {
    const ctx = createEmptyContext();
    expect(ctx.keys?.().length).toBe(0);
  });
});

describe("combineContexts", () => {
  it("averages values from multiple providers", () => {
    const ctx1 = createContextProvider({ health: 0.2 });
    const ctx2 = createContextProvider({ health: 0.8 });
    const combined = combineContexts([ctx1, ctx2]);

    expect(combined.get("health")).toBeCloseTo(0.5);
  });

  it("handles providers with different keys", () => {
    const ctx1 = createContextProvider({ a: 0.2 });
    const ctx2 = createContextProvider({ b: 0.8 });
    const combined = combineContexts([ctx1, ctx2]);

    expect(combined.get("a")).toBe(0.2);
    expect(combined.get("b")).toBe(0.8);
  });

  it("returns empty for empty array", () => {
    const combined = combineContexts([]);
    expect(combined.get("x")).toBe(0.5);
  });

  it("returns single provider unchanged", () => {
    const ctx = createContextProvider({ x: 0.7 });
    const combined = combineContexts([ctx]);
    expect(combined.get("x")).toBe(0.7);
  });

  it("combines hashes", () => {
    const ctx1 = createContextProvider({ a: 0.5 });
    const ctx2 = createContextProvider({ b: 0.5 });
    const combined = combineContexts([ctx1, ctx2]);

    // Hash should be different from either individual
    expect(combined.hash()).not.toBe(ctx1.hash());
    expect(combined.hash()).not.toBe(ctx2.hash());
  });
});

describe("transformContext", () => {
  it("transforms values", () => {
    const base = createContextProvider({ x: 0.5 });
    const transformed = transformContext(base, (_, v) => v * 2);

    expect(transformed.get("x")).toBe(1); // Clamped
  });

  it("receives key in transform", () => {
    const base = createContextProvider({ double: 0.3, triple: 0.2 });
    const transformed = transformContext(base, (key, v) => {
      if (key === "double") return v * 2;
      if (key === "triple") return v * 3;
      return v;
    });

    expect(transformed.get("double")).toBeCloseTo(0.6);
    expect(transformed.get("triple")).toBeCloseTo(0.6);
  });

  it("modifies hash", () => {
    const base = createContextProvider({ x: 0.5 });
    const transformed = transformContext(base, (_, v) => v);

    expect(transformed.hash()).not.toBe(base.hash());
  });
});

describe("remapContext", () => {
  it("remaps keys", () => {
    const base = createContextProvider({ hp: 0.5, mp: 0.8 });
    const remapped = remapContext(base, {
      hp: "health",
      mp: "mana",
    });

    expect(remapped.get("health")).toBe(0.5);
    expect(remapped.get("mana")).toBe(0.8);
  });

  it("preserves unmapped keys", () => {
    const base = createContextProvider({ hp: 0.5, level: 0.3 });
    const remapped = remapContext(base, { hp: "health" });

    expect(remapped.get("health")).toBe(0.5);
    expect(remapped.get("level")).toBe(0.3);
  });

  it("preserves hash", () => {
    const base = createContextProvider({ hp: 0.5 });
    const remapped = remapContext(base, { hp: "health" });

    expect(remapped.hash()).toBe(base.hash());
  });
});

describe("cacheContext", () => {
  it("caches values", () => {
    let callCount = 0;

    const expensive: ContextProvider = {
      get(key: string): number {
        callCount++;
        return key.length / 10;
      },
      hash(): number {
        return 42;
      },
    };

    const cached = cacheContext(expensive);

    // First call
    expect(cached.get("test")).toBeCloseTo(0.4);
    expect(callCount).toBe(1);

    // Second call - should be cached
    expect(cached.get("test")).toBeCloseTo(0.4);
    expect(callCount).toBe(1);

    // Different key
    expect(cached.get("ab")).toBeCloseTo(0.2);
    expect(callCount).toBe(2);
  });

  it("caches hash", () => {
    let hashCalls = 0;

    const expensive: ContextProvider = {
      get(_key: string): number {
        return 0.5;
      },
      hash(): number {
        hashCalls++;
        return 42;
      },
    };

    const cached = cacheContext(expensive);

    expect(cached.hash()).toBe(42);
    expect(cached.hash()).toBe(42);
    expect(hashCalls).toBe(1);
  });
});

describe("withDefaults", () => {
  it("provides defaults for missing keys", () => {
    const base = createContextProvider({ x: 0.5 });
    const withDef = withDefaults(base, { y: 0.8, z: 0.3 });

    expect(withDef.get("x")).toBe(0.5);
    expect(withDef.get("y")).toBe(0.8);
    expect(withDef.get("z")).toBe(0.3);
  });

  it("base values take precedence", () => {
    const base = createContextProvider({ x: 0.5 });
    const withDef = withDefaults(base, { x: 0.9 });

    expect(withDef.get("x")).toBe(0.5); // From base, not defaults
  });

  it("includes default keys in list", () => {
    const base = createContextProvider({ x: 0.5 });
    const withDef = withDefaults(base, { y: 0.8 });

    const keys = withDef.keys?.();
    expect(keys).toContain("x");
    expect(keys).toContain("y");
  });
});

describe("combineSeedWithContext", () => {
  it("produces deterministic combined seed", () => {
    const ctx = createContextProvider({ health: 0.5 });
    const seed = 12345;

    const combined1 = combineSeedWithContext(seed, ctx);
    const combined2 = combineSeedWithContext(seed, ctx);

    expect(combined1).toBe(combined2);
  });

  it("different context produces different seed", () => {
    const ctx1 = createContextProvider({ health: 0.5 });
    const ctx2 = createContextProvider({ health: 0.8 });
    const seed = 12345;

    const combined1 = combineSeedWithContext(seed, ctx1);
    const combined2 = combineSeedWithContext(seed, ctx2);

    expect(combined1).not.toBe(combined2);
  });

  it("different seed produces different result", () => {
    const ctx = createContextProvider({ health: 0.5 });

    const combined1 = combineSeedWithContext(12345, ctx);
    const combined2 = combineSeedWithContext(54321, ctx);

    expect(combined1).not.toBe(combined2);
  });

  it("returns valid uint32", () => {
    const ctx = createContextProvider({ health: 0.5 });
    const combined = combineSeedWithContext(12345, ctx);

    expect(combined).toBeGreaterThanOrEqual(0);
    expect(combined).toBeLessThanOrEqual(0xffffffff);
    expect(Number.isInteger(combined)).toBe(true);
  });
});

describe("Custom ContextProvider implementation", () => {
  it("works with game-style provider", () => {
    // Simulating a game-side provider
    const player = {
      hp: 30,
      maxHp: 100,
      gold: 500,
      level: 5,
    };

    const gameContext: ContextProvider = {
      get(key: string): number {
        switch (key) {
          case "health":
            return player.hp / player.maxHp;
          case "wealth":
            return Math.min(player.gold / 1000, 1);
          case "power":
            return player.level / 20;
          default:
            return 0.5;
        }
      },
      hash(): number {
        // Simple hash of all values
        return (
          (Math.floor(player.hp * 100) ^
            Math.floor(player.gold) ^
            player.level) >>>
          0
        );
      },
    };

    expect(gameContext.get("health")).toBeCloseTo(0.3);
    expect(gameContext.get("wealth")).toBeCloseTo(0.5);
    expect(gameContext.get("power")).toBeCloseTo(0.25);
    expect(gameContext.get("unknown")).toBe(0.5);

    // Hash should be consistent
    const hash1 = gameContext.hash();
    const hash2 = gameContext.hash();
    expect(hash1).toBe(hash2);
  });
});
