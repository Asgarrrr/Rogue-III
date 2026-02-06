/**
 * Modifier Stack (Optimized)
 *
 * Uses a mutable builder pattern for construction, then freezes
 * to an immutable stack. This avoids creating intermediate copies.
 *
 * @example
 * ```typescript
 * // Builder pattern - efficient construction
 * const stack = modifierStackBuilder<Point[]>()
 *   .add(noiseModifier)
 *   .add(smoothModifier)
 *   .addConditional(wideModifier, path => path.length > 10)
 *   .build(); // Only one allocation
 *
 * // Apply all modifiers
 * const result = stack.apply(originalPath, rng);
 * ```
 */

import type { Modifier } from "./modifier";
import { identityModifier, withCondition, withProbability } from "./modifier";

// =============================================================================
// IMMUTABLE MODIFIER STACK
// =============================================================================

/**
 * Immutable Modifier Stack - created by builder
 */
export interface ModifierStack<T> {
  /**
   * Apply all modifiers in sequence
   */
  apply(value: T, rng: () => number): T;

  /**
   * Apply modifiers with specific tags only
   */
  applyWithTags(value: T, rng: () => number, tags: string[]): T;

  /**
   * Get all modifiers
   */
  getAll(): readonly Modifier<T>[];

  /**
   * Get a modifier by ID
   */
  get(id: string): Modifier<T> | undefined;

  /**
   * Check if a modifier exists
   */
  has(id: string): boolean;

  /**
   * Get modifiers filtered by tags
   */
  getByTags(tags: string[]): readonly Modifier<T>[];

  /**
   * Get the number of modifiers
   */
  size(): number;

  /**
   * Create a builder to modify this stack
   */
  toBuilder(): ModifierStackBuilder<T>;

  // Legacy compatibility - creates new stack
  add(modifier: Modifier<T>): ModifierStack<T>;
  addConditional(
    modifier: Modifier<T>,
    condition: (value: T, rng: () => number) => boolean,
  ): ModifierStack<T>;
  addProbabilistic(
    modifier: Modifier<T>,
    probability: number,
  ): ModifierStack<T>;
  remove(id: string): ModifierStack<T>;
  setEnabled(id: string, enabled: boolean): ModifierStack<T>;
  clone(): ModifierStack<T>;
  merge(other: ModifierStack<T>): ModifierStack<T>;
  clear(): ModifierStack<T>;
  sortByPriority(): ModifierStack<T>;
  sortByWeight(): ModifierStack<T>;
}

// =============================================================================
// MUTABLE BUILDER
// =============================================================================

/**
 * Mutable builder for efficient stack construction
 */
export interface ModifierStackBuilder<T> {
  /**
   * Add a modifier
   */
  add(modifier: Modifier<T>): this;

  /**
   * Add a conditional modifier
   */
  addConditional(
    modifier: Modifier<T>,
    condition: (value: T, rng: () => number) => boolean,
  ): this;

  /**
   * Add a probabilistic modifier
   */
  addProbabilistic(modifier: Modifier<T>, probability: number): this;

  /**
   * Remove a modifier by ID
   */
  remove(id: string): this;

  /**
   * Set enabled state for a modifier
   */
  setEnabled(id: string, enabled: boolean): this;

  /**
   * Sort by priority
   */
  sortByPriority(): this;

  /**
   * Sort by weight
   */
  sortByWeight(): this;

  /**
   * Build the immutable stack
   */
  build(): ModifierStack<T>;
}

// =============================================================================
// IMPLEMENTATION
// =============================================================================

/**
 * Create a new modifier stack builder
 */
export function modifierStackBuilder<T>(): ModifierStackBuilder<T> {
  const modifiers: Modifier<T>[] = [];
  const enabled = new Map<string, boolean>();

  const builder: ModifierStackBuilder<T> = {
    add(modifier: Modifier<T>): ModifierStackBuilder<T> {
      modifiers.push(modifier);
      enabled.set(modifier.id, modifier.enabled !== false);
      return builder;
    },

    addConditional(
      modifier: Modifier<T>,
      condition: (value: T, rng: () => number) => boolean,
    ): ModifierStackBuilder<T> {
      const conditional = withCondition(modifier, condition);
      return builder.add(conditional);
    },

    addProbabilistic(
      modifier: Modifier<T>,
      probability: number,
    ): ModifierStackBuilder<T> {
      const probabilistic = withProbability(modifier, probability);
      return builder.add(probabilistic);
    },

    remove(id: string): ModifierStackBuilder<T> {
      const idx = modifiers.findIndex((m) => m.id === id);
      if (idx !== -1) {
        modifiers.splice(idx, 1);
        enabled.delete(id);
      }
      return builder;
    },

    setEnabled(id: string, value: boolean): ModifierStackBuilder<T> {
      enabled.set(id, value);
      return builder;
    },

    sortByPriority(): ModifierStackBuilder<T> {
      modifiers.sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0));
      return builder;
    },

    sortByWeight(): ModifierStackBuilder<T> {
      modifiers.sort((a, b) => b.weight - a.weight);
      return builder;
    },

    build(): ModifierStack<T> {
      // Create frozen copies
      const frozenModifiers = Object.freeze([...modifiers]);
      const frozenEnabled = new Map(enabled);

      // Pre-build index for fast lookup
      const idIndex = new Map<string, number>();
      for (let i = 0; i < frozenModifiers.length; i++) {
        const mod = frozenModifiers[i];
        if (mod) {
          idIndex.set(mod.id, i);
        }
      }

      return createFrozenStack(frozenModifiers, frozenEnabled, idIndex);
    },
  };

  return builder;
}

/**
 * Create an immutable stack from frozen data
 */
function createFrozenStack<T>(
  modifiers: readonly Modifier<T>[],
  enabled: Map<string, boolean>,
  idIndex: Map<string, number>,
): ModifierStack<T> {
  const stack: ModifierStack<T> = {
    apply(value: T, rng: () => number): T {
      let current = value;
      for (let i = 0; i < modifiers.length; i++) {
        const mod = modifiers[i];
        if (!mod) continue;
        if (enabled.get(mod.id) !== false) {
          current = mod.apply(current, rng);
        }
      }
      return current;
    },

    applyWithTags(value: T, rng: () => number, tags: string[]): T {
      const tagSet = new Set(tags);
      let current = value;
      for (let i = 0; i < modifiers.length; i++) {
        const mod = modifiers[i];
        if (!mod) continue;
        if (
          enabled.get(mod.id) !== false &&
          mod.tags?.some((t) => tagSet.has(t))
        ) {
          current = mod.apply(current, rng);
        }
      }
      return current;
    },

    getAll(): readonly Modifier<T>[] {
      return modifiers;
    },

    get(id: string): Modifier<T> | undefined {
      const idx = idIndex.get(id);
      return idx !== undefined ? modifiers[idx] : undefined;
    },

    has(id: string): boolean {
      return idIndex.has(id);
    },

    getByTags(tags: string[]): readonly Modifier<T>[] {
      const tagSet = new Set(tags);
      return modifiers.filter((m) => m.tags?.some((t) => tagSet.has(t)));
    },

    size(): number {
      return modifiers.length;
    },

    toBuilder(): ModifierStackBuilder<T> {
      const builder = modifierStackBuilder<T>();
      for (const mod of modifiers) {
        builder.add(mod);
        builder.setEnabled(mod.id, enabled.get(mod.id) !== false);
      }
      return builder;
    },

    // Legacy compatibility methods
    add(modifier: Modifier<T>): ModifierStack<T> {
      return stack.toBuilder().add(modifier).build();
    },

    addConditional(
      modifier: Modifier<T>,
      condition: (value: T, rng: () => number) => boolean,
    ): ModifierStack<T> {
      return stack.toBuilder().addConditional(modifier, condition).build();
    },

    addProbabilistic(
      modifier: Modifier<T>,
      probability: number,
    ): ModifierStack<T> {
      return stack.toBuilder().addProbabilistic(modifier, probability).build();
    },

    remove(id: string): ModifierStack<T> {
      return stack.toBuilder().remove(id).build();
    },

    setEnabled(id: string, value: boolean): ModifierStack<T> {
      return stack.toBuilder().setEnabled(id, value).build();
    },

    clone(): ModifierStack<T> {
      return stack.toBuilder().build();
    },

    merge(other: ModifierStack<T>): ModifierStack<T> {
      const builder = stack.toBuilder();
      for (const mod of other.getAll()) {
        builder.add(mod);
      }
      return builder.build();
    },

    clear(): ModifierStack<T> {
      return modifierStackBuilder<T>().build();
    },

    sortByPriority(): ModifierStack<T> {
      return stack.toBuilder().sortByPriority().build();
    },

    sortByWeight(): ModifierStack<T> {
      return stack.toBuilder().sortByWeight().build();
    },
  };

  return stack;
}

// =============================================================================
// CONVENIENCE CONSTRUCTORS
// =============================================================================

/**
 * Create an empty modifier stack
 */
export function createModifierStack<T>(): ModifierStack<T> {
  return modifierStackBuilder<T>().build();
}

/**
 * Create a modifier stack from existing modifiers
 */
export function createModifierStackFrom<T>(
  modifiers: readonly Modifier<T>[],
): ModifierStack<T> {
  const builder = modifierStackBuilder<T>();
  for (const mod of modifiers) {
    builder.add(mod);
  }
  return builder.build();
}

// =============================================================================
// SELECTION UTILITIES
// =============================================================================

/**
 * Select one modifier from the stack based on weights
 */
export function selectWeighted<T>(
  stack: ModifierStack<T>,
  rng: () => number,
): Modifier<T> {
  const modifiers = stack.getAll();
  if (modifiers.length === 0) {
    return identityModifier<T>();
  }

  let totalWeight = 0;
  for (let i = 0; i < modifiers.length; i++) {
    const mod = modifiers[i];
    if (mod) {
      totalWeight += mod.weight;
    }
  }

  const firstMod = modifiers[0];
  if (totalWeight === 0 || !firstMod) {
    return firstMod ?? identityModifier<T>();
  }

  let random = rng() * totalWeight;
  for (let i = 0; i < modifiers.length; i++) {
    const mod = modifiers[i];
    if (!mod) continue;
    random -= mod.weight;
    if (random <= 0) {
      return mod;
    }
  }

  const lastMod = modifiers[modifiers.length - 1];
  return lastMod ?? identityModifier<T>();
}

/**
 * Apply a randomly selected modifier from the stack
 */
export function applyWeighted<T>(
  stack: ModifierStack<T>,
  value: T,
  rng: () => number,
): T {
  const selected = selectWeighted(stack, rng);
  return selected.apply(value, rng);
}

/**
 * Apply modifiers in random order
 */
export function applyShuffled<T>(
  stack: ModifierStack<T>,
  value: T,
  rng: () => number,
): T {
  const modifiers = [...stack.getAll()];

  // Fisher-Yates shuffle
  for (let i = modifiers.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = modifiers[i];
    const b = modifiers[j];
    if (a && b) {
      modifiers[i] = b;
      modifiers[j] = a;
    }
  }

  let current = value;
  for (let i = 0; i < modifiers.length; i++) {
    const mod = modifiers[i];
    if (!mod) continue;
    if (mod.enabled !== false) {
      current = mod.apply(current, rng);
    }
  }

  return current;
}

/**
 * Apply only the N highest-weighted modifiers
 */
export function applyTopN<T>(
  stack: ModifierStack<T>,
  value: T,
  n: number,
  rng: () => number,
): T {
  const sorted = stack.sortByWeight().getAll();
  const top = sorted.slice(0, n);

  let current = value;
  for (let i = 0; i < top.length; i++) {
    const mod = top[i];
    if (!mod) continue;
    if (mod.enabled !== false) {
      current = mod.apply(current, rng);
    }
  }

  return current;
}

// =============================================================================
// PRESETS
// =============================================================================

/**
 * Modifier presets collection
 */
export interface ModifierPresets<T> {
  readonly stacks: ReadonlyMap<string, ModifierStack<T>>;
  get(name: string): ModifierStack<T> | undefined;
  add(name: string, stack: ModifierStack<T>): ModifierPresets<T>;
  names(): string[];
}

/**
 * Create a presets collection
 */
export function createModifierPresets<T>(): ModifierPresets<T> {
  return createPresetsFromMap(new Map<string, ModifierStack<T>>());
}

function createPresetsFromMap<T>(
  stacks: Map<string, ModifierStack<T>>,
): ModifierPresets<T> {
  return {
    stacks,

    get(name: string): ModifierStack<T> | undefined {
      return stacks.get(name);
    },

    add(name: string, stack: ModifierStack<T>): ModifierPresets<T> {
      const newStacks = new Map(stacks);
      newStacks.set(name, stack);
      return createPresetsFromMap(newStacks);
    },

    names(): string[] {
      return Array.from(stacks.keys());
    },
  };
}
