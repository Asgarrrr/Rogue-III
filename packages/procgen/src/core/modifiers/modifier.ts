/**
 * Modifier System
 *
 * Composable, weighted transformation functions that can be
 * stacked and applied in sequence to any value type.
 *
 * Replaces hard-coded style options with data-driven modifiers.
 *
 * @example
 * ```typescript
 * // Instead of: corridorStyle: "straight" | "winding"
 * // Use modifiers:
 *
 * const corridorModifiers: Modifier<Point[]>[] = [
 *   {
 *     id: "noise",
 *     weight: 0.3,
 *     apply: (path, rng) => addNoiseToPath(path, 2, rng),
 *   },
 *   {
 *     id: "smooth",
 *     weight: 0.7,
 *     apply: (path, rng) => smoothPath(path, 3),
 *   },
 * ];
 * ```
 */

/**
 * Modifier - A weighted transformation function
 *
 * @template T - The type being modified
 */
export interface Modifier<T> {
  /**
   * Unique identifier for this modifier
   */
  readonly id: string;

  /**
   * Relative influence of this modifier (0-1 typically, but can be any positive number)
   */
  readonly weight: number;

  /**
   * Apply the modification
   *
   * @param value - The current value
   * @param rng - Random number generator for stochastic modifications
   * @returns The modified value
   */
  apply(value: T, rng: () => number): T;

  /**
   * Optional: Human-readable description
   */
  readonly description?: string;

  /**
   * Optional: Whether this modifier is enabled
   */
  readonly enabled?: boolean;

  /**
   * Optional: Tags for categorization
   */
  readonly tags?: readonly string[];

  /**
   * Optional: Priority for ordering (higher = earlier)
   */
  readonly priority?: number;
}

/**
 * Create a simple modifier from a transform function.
 *
 * @param id - Modifier identifier
 * @param transform - The transformation function
 * @param weight - The weight (default: 1)
 */
export function createModifier<T>(
  id: string,
  transform: (value: T, rng: () => number) => T,
  weight: number = 1,
): Modifier<T> {
  return {
    id,
    weight,
    apply: transform,
  };
}

/**
 * Create a modifier with additional metadata.
 */
export function createModifierWithMeta<T>(
  options: {
    id: string;
    weight?: number;
    description?: string;
    enabled?: boolean;
    tags?: string[];
    priority?: number;
  },
  transform: (value: T, rng: () => number) => T,
): Modifier<T> {
  return {
    id: options.id,
    weight: options.weight ?? 1,
    description: options.description,
    enabled: options.enabled ?? true,
    tags: options.tags,
    priority: options.priority,
    apply: transform,
  };
}

/**
 * Conditional Modifier - Only applies when condition is true
 *
 * @template T - The type being modified
 */
export interface ConditionalModifier<T> extends Modifier<T> {
  /**
   * Condition that must be true for the modifier to apply
   */
  readonly condition: (value: T, rng: () => number) => boolean;
}

/**
 * Create a modifier that only applies when a condition is met.
 *
 * @param base - The base modifier
 * @param condition - The condition function
 */
export function withCondition<T>(
  base: Modifier<T>,
  condition: (value: T, rng: () => number) => boolean,
): ConditionalModifier<T> {
  return {
    ...base,
    condition,
    apply(value: T, rng: () => number): T {
      if (condition(value, rng)) {
        return base.apply(value, rng);
      }
      return value;
    },
  };
}

/**
 * Create a modifier that applies with probability based on weight.
 *
 * @param base - The base modifier
 * @param probability - Chance to apply (0-1)
 */
export function withProbability<T>(
  base: Modifier<T>,
  probability: number,
): Modifier<T> {
  return {
    ...base,
    apply(value: T, rng: () => number): T {
      if (rng() < probability) {
        return base.apply(value, rng);
      }
      return value;
    },
  };
}

/**
 * Chain multiple modifiers into a single modifier.
 *
 * @param modifiers - Modifiers to chain
 * @param id - ID for the chained modifier
 */
export function chainModifiers<T>(
  modifiers: readonly Modifier<T>[],
  id: string,
): Modifier<T> {
  return {
    id,
    weight: modifiers.reduce((sum, m) => sum + m.weight, 0) / modifiers.length,
    apply(value: T, rng: () => number): T {
      let current = value;
      for (const modifier of modifiers) {
        if (modifier.enabled !== false) {
          current = modifier.apply(current, rng);
        }
      }
      return current;
    },
  };
}

/**
 * Identity modifier that doesn't change the value.
 */
export function identityModifier<T>(id: string = "identity"): Modifier<T> {
  return {
    id,
    weight: 0,
    apply: (value: T) => value,
  };
}
