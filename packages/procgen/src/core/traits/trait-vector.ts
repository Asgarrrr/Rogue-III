/**
 * Trait Vector System (Optimized)
 *
 * Uses plain frozen objects instead of Maps for better performance.
 * All operations are O(1) property access instead of Map.get().
 *
 * @example
 * ```typescript
 * const traits = createTraitVector({
 *   "claustrophobic": 0.7,
 *   "dangerous": 0.5,
 *   "ancient": 0.9,
 * });
 *
 * // Direct property access (fast)
 * const danger = traits.dangerous; // 0.5
 * ```
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Trait Vector - Frozen object with trait values
 *
 * Using a plain object instead of Map for:
 * - Faster property access (V8 hidden classes)
 * - Better memory efficiency
 * - Native JSON serialization
 */
export type TraitVector = Readonly<Record<string, number>>;

/**
 * Mutable trait data for construction
 */
export type TraitData = Record<string, number>;

// =============================================================================
// CREATION
// =============================================================================

/**
 * Create a new trait vector from trait data.
 * Values are clamped to [0, 1] range.
 * The resulting object is frozen for immutability.
 */
export function createTraitVector(traits: TraitData): TraitVector {
  const result: TraitData = {};

  for (const key in traits) {
    if (Object.hasOwn(traits, key)) {
      const value = traits[key];
      if (value !== undefined) {
        result[key] = clamp01(value);
      }
    }
  }

  return Object.freeze(result);
}

/**
 * Create an empty trait vector.
 */
export function createEmptyTraitVector(): TraitVector {
  return Object.freeze({});
}

// =============================================================================
// ACCESS
// =============================================================================

/**
 * Get a trait value from a vector.
 * Returns defaultValue if trait doesn't exist.
 */
export function getTraitValue(
  vector: TraitVector,
  trait: string,
  defaultValue: number = 0.5,
): number {
  const value = vector[trait];
  return value !== undefined ? value : defaultValue;
}

/**
 * Check if a trait vector has a specific trait.
 */
export function hasTrait(vector: TraitVector, trait: string): boolean {
  return trait in vector;
}

/**
 * Get all trait names in a vector.
 */
export function getTraitNames(vector: TraitVector): string[] {
  return Object.keys(vector);
}

/**
 * Convert a trait vector to a mutable object.
 */
export function traitVectorToObject(vector: TraitVector): TraitData {
  return { ...vector };
}

/**
 * Get the number of dimensions in a trait vector.
 */
export function getTraitCount(vector: TraitVector): number {
  return Object.keys(vector).length;
}

// =============================================================================
// MODIFICATION (returns new vectors)
// =============================================================================

/**
 * Create a new trait vector by setting/updating a single trait.
 */
export function setTrait(
  vector: TraitVector,
  trait: string,
  value: number,
): TraitVector {
  return Object.freeze({
    ...vector,
    [trait]: clamp01(value),
  });
}

/**
 * Create a new trait vector by removing a trait.
 */
export function removeTrait(vector: TraitVector, trait: string): TraitVector {
  const { [trait]: _, ...rest } = vector;
  return Object.freeze(rest);
}

/**
 * Merge two trait vectors, preferring values from the second.
 */
export function mergeTraits(
  base: TraitVector,
  overlay: TraitVector,
): TraitVector {
  return Object.freeze({ ...base, ...overlay });
}

// =============================================================================
// MATH OPERATIONS
// =============================================================================

/**
 * Compute the Euclidean distance between two trait vectors.
 * Only considers traits present in both vectors.
 */
export function traitDistance(a: TraitVector, b: TraitVector): number {
  let sumSquared = 0;

  for (const key in a) {
    if (Object.hasOwn(a, key) && key in b) {
      const valA = a[key] ?? 0;
      const valB = b[key] ?? 0;
      const diff = valA - valB;
      sumSquared += diff * diff;
    }
  }

  return Math.sqrt(sumSquared);
}

/**
 * Compute the dot product of two trait vectors.
 * Only considers traits present in both vectors.
 */
export function traitDotProduct(a: TraitVector, b: TraitVector): number {
  let sum = 0;

  for (const key in a) {
    if (Object.hasOwn(a, key) && key in b) {
      const valA = a[key] ?? 0;
      const valB = b[key] ?? 0;
      sum += valA * valB;
    }
  }

  return sum;
}

/**
 * Scale all traits in a vector by a factor.
 */
export function scaleTraits(vector: TraitVector, factor: number): TraitVector {
  const result: TraitData = {};

  for (const key in vector) {
    if (Object.hasOwn(vector, key)) {
      const value = vector[key] ?? 0.5;
      result[key] = clamp01(value * factor);
    }
  }

  return Object.freeze(result);
}

/**
 * Apply a transformation function to all traits.
 */
export function mapTraits(
  vector: TraitVector,
  fn: (trait: string, value: number) => number,
): TraitVector {
  const result: TraitData = {};

  for (const key in vector) {
    if (Object.hasOwn(vector, key)) {
      const value = vector[key] ?? 0.5;
      result[key] = clamp01(fn(key, value));
    }
  }

  return Object.freeze(result);
}

/**
 * Filter traits based on a predicate.
 */
export function filterTraits(
  vector: TraitVector,
  predicate: (trait: string, value: number) => boolean,
): TraitVector {
  const result: TraitData = {};

  for (const key in vector) {
    if (Object.hasOwn(vector, key)) {
      const value = vector[key];
      if (value !== undefined && predicate(key, value)) {
        result[key] = value;
      }
    }
  }

  return Object.freeze(result);
}

/**
 * Check if two trait vectors are equal.
 */
export function traitsAreEqual(a: TraitVector, b: TraitVector): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) return false;

  for (const key of keysA) {
    const valA = a[key];
    const valB = b[key];
    if (
      !(key in b) ||
      valA === undefined ||
      valB === undefined ||
      Math.abs(valA - valB) > 1e-10
    ) {
      return false;
    }
  }

  return true;
}

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Clamp a value to [0, 1] range.
 * Inlined for performance.
 */
function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

// =============================================================================
// LEGACY COMPATIBILITY
// =============================================================================

/**
 * For compatibility with code expecting Map-based API.
 * Creates a wrapper that provides Map-like access.
 */
export function toTraitMap(vector: TraitVector): ReadonlyMap<string, number> {
  return new Map(Object.entries(vector));
}
