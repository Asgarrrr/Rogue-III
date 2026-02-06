/**
 * Trait Blending and Mutation (Optimized)
 *
 * Uses plain objects for faster iteration and property access.
 */

import type { TraitData, TraitVector } from "./trait-vector";
import { createTraitVector } from "./trait-vector";

// =============================================================================
// BLEND MODES
// =============================================================================

/**
 * Blend mode for combining trait vectors
 */
export type BlendMode =
  | "linear" // Simple linear interpolation
  | "smooth" // Smoothstep interpolation
  | "min" // Take minimum value
  | "max" // Take maximum value
  | "multiply" // Multiply values
  | "screen"; // Screen blend

// =============================================================================
// BLENDING
// =============================================================================

/**
 * Blend two trait vectors using linear interpolation.
 * Optimized: single pass, no intermediate allocations.
 */
export function blendTraits(
  a: TraitVector,
  b: TraitVector,
  ratio: number,
  defaultValue: number = 0.5,
): TraitVector {
  const t = ratio < 0 ? 0 : ratio > 1 ? 1 : ratio;
  const oneMinusT = 1 - t;
  const result: TraitData = {};

  // Collect all keys efficiently
  const keys = new Set<string>();
  for (const k in a) if (Object.hasOwn(a, k)) keys.add(k);
  for (const k in b) if (Object.hasOwn(b, k)) keys.add(k);

  // Single pass blend
  for (const key of keys) {
    const va = key in a ? (a[key] ?? defaultValue) : defaultValue;
    const vb = key in b ? (b[key] ?? defaultValue) : defaultValue;
    result[key] = va * oneMinusT + vb * t;
  }

  return Object.freeze(result);
}

/**
 * Smoothstep function for smooth blending
 */
function smoothstep(t: number): number {
  const x = t < 0 ? 0 : t > 1 ? 1 : t;
  return x * x * (3 - 2 * x);
}

/**
 * Blend two trait vectors with a specified blend mode.
 */
export function blendTraitsWithMode(
  a: TraitVector,
  b: TraitVector,
  ratio: number,
  mode: BlendMode = "linear",
  defaultValue: number = 0.5,
): TraitVector {
  const t = ratio < 0 ? 0 : ratio > 1 ? 1 : ratio;
  const result: TraitData = {};

  // Collect all keys
  const keys = new Set<string>();
  for (const k in a) if (Object.hasOwn(a, k)) keys.add(k);
  for (const k in b) if (Object.hasOwn(b, k)) keys.add(k);

  // Blend based on mode
  for (const key of keys) {
    const va = key in a ? (a[key] ?? defaultValue) : defaultValue;
    const vb = key in b ? (b[key] ?? defaultValue) : defaultValue;

    let blended: number;
    switch (mode) {
      case "linear":
        blended = va * (1 - t) + vb * t;
        break;
      case "smooth": {
        const st = smoothstep(t);
        blended = va * (1 - st) + vb * st;
        break;
      }
      case "min":
        blended = va < vb ? va : vb;
        break;
      case "max":
        blended = va > vb ? va : vb;
        break;
      case "multiply":
        blended = va * vb;
        break;
      case "screen":
        blended = 1 - (1 - va) * (1 - vb);
        break;
    }

    result[key] = blended;
  }

  return Object.freeze(result);
}

/**
 * Blend multiple trait vectors with weights.
 * Optimized: pre-computes normalized weights.
 */
export function blendMultiple(
  vectors: ReadonlyArray<readonly [TraitVector, number]>,
  defaultValue: number = 0.5,
): TraitVector {
  if (vectors.length === 0) return Object.freeze({});
  const firstEntry = vectors[0];
  if (vectors.length === 1 && firstEntry) {
    return firstEntry[0];
  }

  // Pre-compute normalized weights
  let totalWeight = 0;
  for (let i = 0; i < vectors.length; i++) {
    const entry = vectors[i];
    if (entry) {
      totalWeight += entry[1];
    }
  }

  if (totalWeight === 0 && firstEntry) {
    return firstEntry[0];
  }

  const invTotal = 1 / totalWeight;

  // Collect all keys
  const keys = new Set<string>();
  for (const [vec] of vectors) {
    for (const k in vec) if (Object.hasOwn(vec, k)) keys.add(k);
  }

  // Weighted average
  const result: TraitData = {};
  for (const key of keys) {
    let sum = 0;
    for (let i = 0; i < vectors.length; i++) {
      const entry = vectors[i];
      if (!entry) continue;
      const [vec, weight] = entry;
      const value = key in vec ? (vec[key] ?? defaultValue) : defaultValue;
      sum += value * weight * invTotal;
    }
    result[key] = sum;
  }

  return Object.freeze(result);
}

// =============================================================================
// MUTATION
// =============================================================================

/**
 * Mutate a trait vector by adding controlled random noise.
 * Optimized: direct property iteration.
 */
export function mutateTraits(
  vector: TraitVector,
  intensity: number,
  rng: () => number,
): TraitVector {
  const result: TraitData = {};
  const doubleIntensity = intensity * 2;

  for (const key in vector) {
    if (Object.hasOwn(vector, key)) {
      const delta = (rng() - 0.5) * doubleIntensity;
      const currentValue = vector[key] ?? 0.5;
      const newValue = currentValue + delta;
      result[key] = newValue < 0 ? 0 : newValue > 1 ? 1 : newValue;
    }
  }

  return Object.freeze(result);
}

/**
 * Mutate a trait vector with per-trait intensity control.
 */
export function mutateTraitsSelective(
  vector: TraitVector,
  intensities: ReadonlyMap<string, number> | Record<string, number>,
  defaultIntensity: number,
  rng: () => number,
): TraitVector {
  const intensityMap = intensities instanceof Map ? intensities : null;

  const result: TraitData = {};

  for (const key in vector) {
    if (Object.hasOwn(vector, key)) {
      const intensity = intensityMap
        ? (intensityMap.get(key) ?? defaultIntensity)
        : ((intensities as Record<string, number>)[key] ?? defaultIntensity);

      const delta = (rng() - 0.5) * intensity * 2;
      const currentValue = vector[key] ?? 0.5;
      const newValue = currentValue + delta;
      result[key] = newValue < 0 ? 0 : newValue > 1 ? 1 : newValue;
    }
  }

  return Object.freeze(result);
}

/**
 * Drift a trait vector towards a target.
 */
export function driftTraits(
  current: TraitVector,
  target: TraitVector,
  stepSize: number,
  rng?: () => number,
  noiseIntensity: number = 0,
): TraitVector {
  const blended = blendTraits(current, target, stepSize);

  if (rng && noiseIntensity > 0) {
    return mutateTraits(blended, noiseIntensity, rng);
  }

  return blended;
}

/**
 * Create a trait vector by randomly selecting values within ranges.
 */
export function randomizeTraits(
  ranges: Record<string, readonly [number, number]>,
  rng: () => number,
): TraitVector {
  const result: TraitData = {};

  for (const key in ranges) {
    if (Object.hasOwn(ranges, key)) {
      const range = ranges[key];
      if (!range) continue;
      const [min, max] = range;
      result[key] = min + rng() * (max - min);
    }
  }

  return createTraitVector(result);
}

// =============================================================================
// TRANSFORMATIONS
// =============================================================================

/**
 * Quantize trait values to discrete levels.
 */
export function quantizeTraits(
  vector: TraitVector,
  levels: number,
): TraitVector {
  if (levels < 2) {
    throw new Error("Quantization requires at least 2 levels");
  }

  const step = 1 / (levels - 1);
  const result: TraitData = {};

  for (const key in vector) {
    if (Object.hasOwn(vector, key)) {
      const value = vector[key] ?? 0.5;
      result[key] = Math.round(value / step) * step;
    }
  }

  return Object.freeze(result);
}

/**
 * Normalize a trait vector so all values sum to 1.
 */
export function normalizeTraits(vector: TraitVector): TraitVector {
  let total = 0;
  for (const key in vector) {
    if (Object.hasOwn(vector, key)) {
      const value = vector[key];
      if (value !== undefined) {
        total += value;
      }
    }
  }

  if (total === 0) return vector;

  const invTotal = 1 / total;
  const result: TraitData = {};

  for (const key in vector) {
    if (Object.hasOwn(vector, key)) {
      const value = vector[key] ?? 0;
      result[key] = value * invTotal;
    }
  }

  return Object.freeze(result);
}

/**
 * Invert all trait values (1 - value).
 */
export function invertTraits(vector: TraitVector): TraitVector {
  const result: TraitData = {};

  for (const key in vector) {
    if (Object.hasOwn(vector, key)) {
      const value = vector[key] ?? 0.5;
      result[key] = 1 - value;
    }
  }

  return Object.freeze(result);
}

/**
 * Apply an easing function to all trait values.
 */
export function easeTraits(
  vector: TraitVector,
  easing: (value: number) => number,
): TraitVector {
  const result: TraitData = {};

  for (const key in vector) {
    if (Object.hasOwn(vector, key)) {
      const value = vector[key] ?? 0.5;
      const eased = easing(value);
      result[key] = eased < 0 ? 0 : eased > 1 ? 1 : eased;
    }
  }

  return Object.freeze(result);
}

/**
 * Common easing functions for trait manipulation
 */
export const easings = {
  linear: (t: number) => t,
  easeIn: (t: number) => t * t,
  easeOut: (t: number) => 1 - (1 - t) * (1 - t),
  easeInOut: smoothstep,
  power: (exponent: number) => (t: number) => t ** exponent,
  sCurve: (t: number) => t * t * t * (t * (t * 6 - 15) + 10),
};
