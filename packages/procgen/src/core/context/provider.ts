/**
 * Context Provider System
 *
 * A generic interface for providing normalized contextual values
 * to the procedural generation system. The procgen code doesn't
 * know the semantics of context keys - it just uses numbers.
 *
 * @example
 * ```typescript
 * // Game-side implementation (NOT in procgen)
 * class PlayerContextProvider implements ContextProvider {
 *   constructor(private player: Player) {}
 *
 *   get(key: string): number {
 *     switch (key) {
 *       case "health": return this.player.hp / this.player.maxHp;
 *       case "wealth": return Math.min(this.player.gold / 1000, 1);
 *       case "power": return this.player.level / 20;
 *       default: return 0.5; // Neutral default
 *     }
 *   }
 *
 *   hash(): number { return fnv32([this.get("health"), ...]); }
 * }
 *
 * // Procgen usage - doesn't know what "health" means
 * function adjustSpawnDensity(context: ContextProvider): number {
 *   return 0.5 + context.get("health") * 0.5;
 * }
 * ```
 */

/**
 * Context Provider Interface
 *
 * Provides normalized [0, 1] values for arbitrary context keys.
 * The procgen system treats these as opaque numbers - all
 * semantic meaning is defined by the game layer.
 */
export interface ContextProvider {
  /**
   * Get a normalized value for a context key.
   *
   * @param key - The context key (e.g., "health", "wealth", "karma")
   * @returns A value between 0 and 1 (inclusive)
   */
  get(key: string): number;

  /**
   * Get a deterministic hash of all context values.
   *
   * This is used to combine with the dungeon seed for
   * reproducible context-aware generation.
   *
   * @returns A 32-bit integer hash
   */
  hash(): number;

  /**
   * Get all available context keys.
   * Optional - used for debugging/introspection.
   */
  keys?(): string[];

  /**
   * Check if a context key exists.
   */
  has?(key: string): boolean;
}

/**
 * Context data as a simple record
 */
export type ContextData = Record<string, number>;

/**
 * Create a simple context provider from static data.
 *
 * Values are clamped to [0, 1] range.
 *
 * @param data - Context key-value pairs
 * @param defaultValue - Value for missing keys (default: 0.5)
 * @returns A ContextProvider
 */
export function createContextProvider(
  data: ContextData,
  defaultValue: number = 0.5,
): ContextProvider {
  const normalized = new Map<string, number>();

  for (const [key, value] of Object.entries(data)) {
    normalized.set(key, Math.max(0, Math.min(1, value)));
  }

  return {
    get(key: string): number {
      return normalized.get(key) ?? defaultValue;
    },

    hash(): number {
      return hashContextData(normalized);
    },

    keys(): string[] {
      return Array.from(normalized.keys());
    },

    has(key: string): boolean {
      return normalized.has(key);
    },
  };
}

/**
 * Create an empty context provider that returns defaults.
 *
 * @param defaultValue - The value to return for all keys
 */
export function createEmptyContext(
  defaultValue: number = 0.5,
): ContextProvider {
  return {
    get(_key: string): number {
      return defaultValue;
    },

    hash(): number {
      return 0; // Empty context has zero hash
    },

    keys(): string[] {
      return [];
    },

    has(_key: string): boolean {
      return false;
    },
  };
}

/**
 * Combine multiple context providers.
 *
 * Values are averaged from all providers that have the key.
 *
 * @param providers - Array of context providers
 * @param defaultValue - Value for missing keys
 */
export function combineContexts(
  providers: readonly ContextProvider[],
  defaultValue: number = 0.5,
): ContextProvider {
  if (providers.length === 0) {
    return createEmptyContext(defaultValue);
  }

  if (providers.length === 1) {
    const firstProvider = providers[0];
    if (!firstProvider) {
      return createEmptyContext(defaultValue);
    }
    return firstProvider;
  }

  return {
    get(key: string): number {
      const values: number[] = [];
      for (const provider of providers) {
        if (provider.has?.(key) ?? true) {
          values.push(provider.get(key));
        }
      }

      if (values.length === 0) {
        return defaultValue;
      }

      return values.reduce((a, b) => a + b, 0) / values.length;
    },

    hash(): number {
      let hash = 2166136261;
      for (const provider of providers) {
        hash ^= provider.hash();
        hash = Math.imul(hash, 16777619);
      }
      return hash >>> 0;
    },

    keys(): string[] {
      const allKeys = new Set<string>();
      for (const provider of providers) {
        if (provider.keys) {
          for (const key of provider.keys()) {
            allKeys.add(key);
          }
        }
      }
      return Array.from(allKeys);
    },

    has(key: string): boolean {
      return providers.some((p) => p.has?.(key) ?? false);
    },
  };
}

/**
 * Create a context provider that transforms values from another.
 *
 * @param base - The base context provider
 * @param transform - Transformation function for each value
 */
export function transformContext(
  base: ContextProvider,
  transform: (key: string, value: number) => number,
): ContextProvider {
  return {
    get(key: string): number {
      const value = base.get(key);
      return Math.max(0, Math.min(1, transform(key, value)));
    },

    hash(): number {
      // Transform changes semantics, so we modify the hash
      return (base.hash() ^ 0xdeadbeef) >>> 0;
    },

    keys(): string[] {
      return base.keys?.() ?? [];
    },

    has(key: string): boolean {
      return base.has?.(key) ?? false;
    },
  };
}

/**
 * Create a context provider with key remapping.
 *
 * @param base - The base context provider
 * @param mapping - Map of old keys to new keys
 */
export function remapContext(
  base: ContextProvider,
  mapping: Record<string, string>,
): ContextProvider {
  const reverseMapping = new Map<string, string>();
  for (const [from, to] of Object.entries(mapping)) {
    reverseMapping.set(to, from);
  }

  return {
    get(key: string): number {
      const originalKey = reverseMapping.get(key) ?? key;
      return base.get(originalKey);
    },

    hash(): number {
      return base.hash();
    },

    keys(): string[] {
      const baseKeys = base.keys?.() ?? [];
      return baseKeys.map((k) => mapping[k] ?? k);
    },

    has(key: string): boolean {
      const originalKey = reverseMapping.get(key) ?? key;
      return base.has?.(originalKey) ?? false;
    },
  };
}

/**
 * Create a cached context provider that memoizes values.
 *
 * Useful when get() calls are expensive.
 *
 * @param base - The base context provider
 */
export function cacheContext(base: ContextProvider): ContextProvider {
  const cache = new Map<string, number>();
  let cachedHash: number | null = null;

  return {
    get(key: string): number {
      const cached = cache.get(key);
      if (cached !== undefined) {
        return cached;
      }

      const value = base.get(key);
      cache.set(key, value);
      return value;
    },

    hash(): number {
      if (cachedHash === null) {
        cachedHash = base.hash();
      }
      return cachedHash;
    },

    keys(): string[] {
      return base.keys?.() ?? [];
    },

    has(key: string): boolean {
      return base.has?.(key) ?? false;
    },
  };
}

/**
 * Create a context provider with default value overrides.
 *
 * @param base - The base context provider
 * @param defaults - Default values for specific keys
 */
export function withDefaults(
  base: ContextProvider,
  defaults: ContextData,
): ContextProvider {
  const defaultMap = new Map(Object.entries(defaults));

  return {
    get(key: string): number {
      if (base.has?.(key)) {
        return base.get(key);
      }
      return defaultMap.get(key) ?? base.get(key);
    },

    hash(): number {
      return base.hash();
    },

    keys(): string[] {
      const baseKeys = new Set(base.keys?.() ?? []);
      for (const key of defaultMap.keys()) {
        baseKeys.add(key);
      }
      return Array.from(baseKeys);
    },

    has(key: string): boolean {
      return (base.has?.(key) ?? false) || defaultMap.has(key);
    },
  };
}

/**
 * Hash context data for deterministic reproduction.
 *
 * Uses FNV-1a algorithm for good distribution.
 */
function hashContextData(data: ReadonlyMap<string, number>): number {
  let hash = 2166136261; // FNV offset basis

  // Sort keys for deterministic order
  const keys = Array.from(data.keys()).sort();

  for (const key of keys) {
    // Hash the key
    for (let i = 0; i < key.length; i++) {
      hash ^= key.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }

    // Hash the value (as 32-bit float approximation)
    const value = data.get(key);
    if (value === undefined) continue;
    const intValue = Math.floor(value * 0xffffffff);
    hash ^= intValue & 0xff;
    hash = Math.imul(hash, 16777619);
    hash ^= (intValue >> 8) & 0xff;
    hash = Math.imul(hash, 16777619);
    hash ^= (intValue >> 16) & 0xff;
    hash = Math.imul(hash, 16777619);
    hash ^= (intValue >> 24) & 0xff;
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

/**
 * Combine a seed with context hash for deterministic context-aware generation.
 *
 * @param seed - The base seed
 * @param context - The context provider
 * @returns A combined seed value
 */
export function combineSeedWithContext(
  seed: number,
  context: ContextProvider,
): number {
  const contextHash = context.hash();

  // Mix the seed and context hash
  let combined = seed ^ contextHash;
  combined = Math.imul(combined, 0x85ebca6b);
  combined ^= combined >>> 13;
  combined = Math.imul(combined, 0xc2b2ae35);
  combined ^= combined >>> 16;

  return combined >>> 0;
}
