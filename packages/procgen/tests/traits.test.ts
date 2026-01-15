/**
 * Trait Vector System Tests
 */

import { describe, expect, it } from "bun:test";
import {
  blendMultiple,
  blendTraits,
  blendTraitsWithMode,
  createEmptyTraitVector,
  createTraitVector,
  driftTraits,
  easeTraits,
  easings,
  filterTraits,
  getTraitCount,
  getTraitNames,
  getTraitValue,
  hasTrait,
  invertTraits,
  mapTraits,
  mergeTraits,
  mutateTraits,
  mutateTraitsSelective,
  normalizeTraits,
  quantizeTraits,
  randomizeTraits,
  removeTrait,
  scaleTraits,
  setTrait,
  traitDistance,
  traitDotProduct,
  traitsAreEqual,
  traitVectorToObject,
} from "../src";

describe("TraitVector creation", () => {
  it("creates a trait vector from data", () => {
    const traits = createTraitVector({
      dangerous: 0.7,
      ancient: 0.9,
      magical: 0.3,
    });

    expect(getTraitValue(traits, "dangerous")).toBe(0.7);
    expect(getTraitValue(traits, "ancient")).toBe(0.9);
    expect(getTraitValue(traits, "magical")).toBe(0.3);
  });

  it("clamps values to [0, 1] range", () => {
    const traits = createTraitVector({
      tooLow: -0.5,
      tooHigh: 1.5,
      normal: 0.5,
    });

    expect(getTraitValue(traits, "tooLow")).toBe(0);
    expect(getTraitValue(traits, "tooHigh")).toBe(1);
    expect(getTraitValue(traits, "normal")).toBe(0.5);
  });

  it("creates an empty trait vector", () => {
    const empty = createEmptyTraitVector();
    expect(getTraitCount(empty)).toBe(0);
  });

  it("returns default value for missing traits", () => {
    const traits = createTraitVector({ existing: 0.5 });
    expect(getTraitValue(traits, "missing")).toBe(0.5);
    expect(getTraitValue(traits, "missing", 0.7)).toBe(0.7);
  });
});

describe("TraitVector queries", () => {
  const traits = createTraitVector({
    a: 0.1,
    b: 0.2,
    c: 0.3,
  });

  it("checks if trait exists", () => {
    expect(hasTrait(traits, "a")).toBe(true);
    expect(hasTrait(traits, "missing")).toBe(false);
  });

  it("gets all trait names", () => {
    const names = getTraitNames(traits);
    expect(names).toContain("a");
    expect(names).toContain("b");
    expect(names).toContain("c");
    expect(names.length).toBe(3);
  });

  it("converts to plain object", () => {
    const obj = traitVectorToObject(traits);
    expect(obj).toEqual({ a: 0.1, b: 0.2, c: 0.3 });
  });

  it("gets trait count", () => {
    expect(getTraitCount(traits)).toBe(3);
  });
});

describe("TraitVector modifications", () => {
  const base = createTraitVector({ a: 0.5, b: 0.5 });

  it("sets a trait immutably", () => {
    const modified = setTrait(base, "a", 0.8);
    expect(getTraitValue(modified, "a")).toBe(0.8);
    expect(getTraitValue(base, "a")).toBe(0.5); // Original unchanged
  });

  it("adds a new trait", () => {
    const modified = setTrait(base, "c", 0.3);
    expect(hasTrait(modified, "c")).toBe(true);
    expect(getTraitCount(modified)).toBe(3);
  });

  it("removes a trait", () => {
    const modified = removeTrait(base, "a");
    expect(hasTrait(modified, "a")).toBe(false);
    expect(getTraitCount(modified)).toBe(1);
  });

  it("merges trait vectors", () => {
    const overlay = createTraitVector({ b: 0.9, c: 0.1 });
    const merged = mergeTraits(base, overlay);

    expect(getTraitValue(merged, "a")).toBe(0.5); // From base
    expect(getTraitValue(merged, "b")).toBe(0.9); // Overridden
    expect(getTraitValue(merged, "c")).toBe(0.1); // New from overlay
  });
});

describe("TraitVector math", () => {
  it("calculates distance between vectors", () => {
    const a = createTraitVector({ x: 0, y: 0 });
    const b = createTraitVector({ x: 1, y: 0 });
    const _c = createTraitVector({ x: 1, y: 1 });

    expect(traitDistance(a, b)).toBeCloseTo(1);
    expect(traitDistance(a, a)).toBe(0);
  });

  it("calculates dot product", () => {
    const a = createTraitVector({ x: 0.5, y: 0.5 });
    const b = createTraitVector({ x: 1, y: 0 });

    expect(traitDotProduct(a, b)).toBeCloseTo(0.5);
  });

  it("scales trait values", () => {
    const traits = createTraitVector({ a: 0.5, b: 0.8 });
    const scaled = scaleTraits(traits, 0.5);

    expect(getTraitValue(scaled, "a")).toBe(0.25);
    expect(getTraitValue(scaled, "b")).toBe(0.4);
  });

  it("maps trait values", () => {
    const traits = createTraitVector({ a: 0.5, b: 0.8 });
    const mapped = mapTraits(traits, (_, v) => v * 2);

    expect(getTraitValue(mapped, "a")).toBe(1); // Clamped
    expect(getTraitValue(mapped, "b")).toBe(1); // Clamped
  });

  it("filters traits", () => {
    const traits = createTraitVector({ low: 0.2, mid: 0.5, high: 0.9 });
    const filtered = filterTraits(traits, (_, v) => v > 0.4);

    expect(hasTrait(filtered, "low")).toBe(false);
    expect(hasTrait(filtered, "mid")).toBe(true);
    expect(hasTrait(filtered, "high")).toBe(true);
  });
});

describe("TraitVector equality", () => {
  it("detects equal vectors", () => {
    const a = createTraitVector({ x: 0.5, y: 0.5 });
    const b = createTraitVector({ x: 0.5, y: 0.5 });
    expect(traitsAreEqual(a, b)).toBe(true);
  });

  it("detects unequal vectors", () => {
    const a = createTraitVector({ x: 0.5, y: 0.5 });
    const b = createTraitVector({ x: 0.5, y: 0.6 });
    expect(traitsAreEqual(a, b)).toBe(false);
  });

  it("detects different dimensions", () => {
    const a = createTraitVector({ x: 0.5 });
    const b = createTraitVector({ x: 0.5, y: 0.5 });
    expect(traitsAreEqual(a, b)).toBe(false);
  });
});

describe("blendTraits", () => {
  it("blends two vectors at 50%", () => {
    const a = createTraitVector({ danger: 0, value: 1 });
    const b = createTraitVector({ danger: 1, value: 0 });
    const blended = blendTraits(a, b, 0.5);

    expect(getTraitValue(blended, "danger")).toBeCloseTo(0.5);
    expect(getTraitValue(blended, "value")).toBeCloseTo(0.5);
  });

  it("handles ratio extremes", () => {
    const a = createTraitVector({ x: 0 });
    const b = createTraitVector({ x: 1 });

    const allA = blendTraits(a, b, 0);
    const allB = blendTraits(a, b, 1);

    expect(getTraitValue(allA, "x")).toBe(0);
    expect(getTraitValue(allB, "x")).toBe(1);
  });

  it("uses default for missing traits", () => {
    const a = createTraitVector({ x: 0 });
    const b = createTraitVector({ y: 1 });
    const blended = blendTraits(a, b, 0.5, 0.3);

    // x: 0 * 0.5 + 0.3 * 0.5 = 0.15
    // y: 0.3 * 0.5 + 1 * 0.5 = 0.65
    expect(getTraitValue(blended, "x")).toBeCloseTo(0.15);
    expect(getTraitValue(blended, "y")).toBeCloseTo(0.65);
  });
});

describe("blendTraitsWithMode", () => {
  const a = createTraitVector({ x: 0.3 });
  const b = createTraitVector({ x: 0.7 });

  it("linear mode works like blendTraits", () => {
    const blended = blendTraitsWithMode(a, b, 0.5, "linear");
    expect(getTraitValue(blended, "x")).toBeCloseTo(0.5);
  });

  it("min mode takes minimum", () => {
    const blended = blendTraitsWithMode(a, b, 0.5, "min");
    expect(getTraitValue(blended, "x")).toBe(0.3);
  });

  it("max mode takes maximum", () => {
    const blended = blendTraitsWithMode(a, b, 0.5, "max");
    expect(getTraitValue(blended, "x")).toBe(0.7);
  });

  it("multiply mode multiplies", () => {
    const blended = blendTraitsWithMode(a, b, 0.5, "multiply");
    expect(getTraitValue(blended, "x")).toBeCloseTo(0.21);
  });

  it("screen mode screens", () => {
    const blended = blendTraitsWithMode(a, b, 0.5, "screen");
    // 1 - (1 - 0.3) * (1 - 0.7) = 1 - 0.7 * 0.3 = 0.79
    expect(getTraitValue(blended, "x")).toBeCloseTo(0.79);
  });
});

describe("blendMultiple", () => {
  it("blends multiple vectors with weights", () => {
    const a = createTraitVector({ x: 0 });
    const b = createTraitVector({ x: 1 });
    const c = createTraitVector({ x: 0.5 });

    // Equal weights
    const blended = blendMultiple([
      [a, 1],
      [b, 1],
      [c, 1],
    ]);

    expect(getTraitValue(blended, "x")).toBeCloseTo(0.5);
  });

  it("respects different weights", () => {
    const a = createTraitVector({ x: 0 });
    const b = createTraitVector({ x: 1 });

    const blended = blendMultiple([
      [a, 3],
      [b, 1],
    ]);

    // 0 * 0.75 + 1 * 0.25 = 0.25
    expect(getTraitValue(blended, "x")).toBeCloseTo(0.25);
  });
});

describe("mutateTraits", () => {
  it("mutates traits within intensity range", () => {
    const traits = createTraitVector({ a: 0.5, b: 0.5 });
    let seed = 12345;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) >>> 0;
      return (seed % 1000) / 1000;
    };

    const mutated = mutateTraits(traits, 0.1, rng);

    const aVal = getTraitValue(mutated, "a");
    const bVal = getTraitValue(mutated, "b");

    expect(aVal).toBeGreaterThanOrEqual(0.4);
    expect(aVal).toBeLessThanOrEqual(0.6);
    expect(bVal).toBeGreaterThanOrEqual(0.4);
    expect(bVal).toBeLessThanOrEqual(0.6);
  });

  it("respects clamping", () => {
    const traits = createTraitVector({ a: 0.05, b: 0.95 });
    const rng = () => 0; // Will produce -intensity delta

    const mutated = mutateTraits(traits, 0.2, rng);

    expect(getTraitValue(mutated, "a")).toBe(0); // Clamped to 0
  });
});

describe("mutateTraitsSelective", () => {
  it("uses per-trait intensities", () => {
    const traits = createTraitVector({ stable: 0.5, volatile: 0.5 });
    const rng = () => 1; // Will produce +intensity delta

    const mutated = mutateTraitsSelective(
      traits,
      { stable: 0.01, volatile: 0.3 },
      0,
      rng,
    );

    const stableVal = getTraitValue(mutated, "stable");
    const volatileVal = getTraitValue(mutated, "volatile");

    expect(stableVal).toBeCloseTo(0.51);
    expect(volatileVal).toBeCloseTo(0.8);
  });
});

describe("driftTraits", () => {
  it("drifts towards target", () => {
    const current = createTraitVector({ x: 0 });
    const target = createTraitVector({ x: 1 });

    const drifted = driftTraits(current, target, 0.25);
    expect(getTraitValue(drifted, "x")).toBeCloseTo(0.25);
  });
});

describe("randomizeTraits", () => {
  it("generates values within ranges", () => {
    const rng = () => 0.5;
    const traits = randomizeTraits(
      {
        a: [0, 0.5],
        b: [0.5, 1],
      },
      rng,
    );

    expect(getTraitValue(traits, "a")).toBeCloseTo(0.25);
    expect(getTraitValue(traits, "b")).toBeCloseTo(0.75);
  });
});

describe("quantizeTraits", () => {
  it("quantizes to discrete levels", () => {
    const traits = createTraitVector({ low: 0.2, mid: 0.5, high: 0.8 });
    const quantized = quantizeTraits(traits, 3);

    expect(getTraitValue(quantized, "low")).toBe(0);
    expect(getTraitValue(quantized, "mid")).toBe(0.5);
    expect(getTraitValue(quantized, "high")).toBe(1);
  });

  it("throws for < 2 levels", () => {
    const traits = createTraitVector({ x: 0.5 });
    expect(() => quantizeTraits(traits, 1)).toThrow();
  });
});

describe("normalizeTraits", () => {
  it("normalizes values to sum to 1", () => {
    const traits = createTraitVector({ a: 0.2, b: 0.3, c: 0.5 });
    const normalized = normalizeTraits(traits);

    const sum =
      getTraitValue(normalized, "a") +
      getTraitValue(normalized, "b") +
      getTraitValue(normalized, "c");

    expect(sum).toBeCloseTo(1);
  });
});

describe("invertTraits", () => {
  it("inverts all values", () => {
    const traits = createTraitVector({ a: 0.2, b: 0.8 });
    const inverted = invertTraits(traits);

    expect(getTraitValue(inverted, "a")).toBeCloseTo(0.8);
    expect(getTraitValue(inverted, "b")).toBeCloseTo(0.2);
  });
});

describe("easeTraits", () => {
  it("applies easing function", () => {
    const traits = createTraitVector({ x: 0.5 });
    const eased = easeTraits(traits, easings.easeIn);

    expect(getTraitValue(eased, "x")).toBeCloseTo(0.25); // 0.5^2
  });

  it("provides common easings", () => {
    expect(easings.linear(0.5)).toBe(0.5);
    expect(easings.easeIn(0.5)).toBeCloseTo(0.25);
    expect(easings.easeOut(0.5)).toBeCloseTo(0.75);
    expect(easings.easeInOut(0.5)).toBeCloseTo(0.5);
    expect(easings.power(3)(0.5)).toBeCloseTo(0.125);
  });
});
