/**
 * Query System
 *
 * Efficient entity filtering based on component presence/absence.
 * Uses sparse set intersection for fast iteration.
 */

import type { Entity, QueryDescriptor } from "../types";
import type { ComponentRegistry } from "./component-registry";
import type { ComponentStore } from "./component-store";
import type { EntityManager } from "./entity-manager";

/**
 * Compiled query for faster execution.
 */
interface CompiledQuery {
  readonly withSet: ReadonlySet<string>;
  readonly withoutSet: ReadonlySet<string>;
  readonly withArray: readonly string[];
  readonly withoutArray: readonly string[];
}

/**
 * Compiles a query descriptor for efficient execution.
 */
function compileDescriptor(descriptor: QueryDescriptor): CompiledQuery {
  return {
    withSet: new Set(descriptor.with),
    withoutSet: new Set(descriptor.without),
    withArray: descriptor.with,
    withoutArray: descriptor.without,
  };
}

/**
 * Helper function for creating query descriptors.
 */
export function query<W extends string[], Wo extends string[] = []>(
  withComponents: W,
  withoutComponents?: Wo,
): QueryDescriptor {
  return {
    with: withComponents,
    without: withoutComponents ?? [],
  };
}

/**
 * Query instance for filtering and iterating entities.
 */
export class Query {
  private cached: Entity[] | null = null;
  private dirty = true;
  private readonly compiled: CompiledQuery;

  // Pre-resolved stores to avoid repeated lookups
  private withStores: ComponentStore<unknown>[] | null = null;
  private withoutStores: ComponentStore<unknown>[] | null = null;
  private smallestStoreIndex = 0;

  constructor(
    descriptor: QueryDescriptor,
    private readonly registry: ComponentRegistry,
    private readonly entityManager: EntityManager,
  ) {
    this.compiled = compileDescriptor(descriptor);
  }

  private ensureStoresResolved(): void {
    if (this.withStores !== null) return;

    this.withStores = this.compiled.withArray.map((name) =>
      this.registry.getStore(name),
    );

    this.withoutStores = this.compiled.withoutArray.map((name) =>
      this.registry.getStore(name),
    );

    // Find smallest store for iteration
    let minCount = Infinity;
    for (let i = 0; i < this.withStores.length; i++) {
      const count = this.withStores[i].getCount();
      if (count < minCount) {
        minCount = count;
        this.smallestStoreIndex = i;
      }
    }
  }

  /**
   * Executes the query and returns matching entities.
   */
  execute(): readonly Entity[] {
    if (!this.dirty && this.cached) {
      return this.cached;
    }

    this.ensureStoresResolved();

    const results: Entity[] = [];
    const withStores = this.withStores!;
    const withoutStores = this.withoutStores!;

    // Handle empty WITH queries
    if (withStores.length === 0) {
      // Return all alive entities that don't have WITHOUT components
      for (const entity of this.entityManager.getAllAlive()) {
        let excluded = false;
        for (let i = 0; i < withoutStores.length; i++) {
          if (withoutStores[i].has(entity)) {
            excluded = true;
            break;
          }
        }
        if (!excluded) {
          results.push(entity);
        }
      }
      this.cached = results;
      this.dirty = false;
      return results;
    }

    const smallestStore = withStores[this.smallestStoreIndex];

    smallestStore.forEachEntity((entity) => {
      if (!this.entityManager.isAlive(entity)) return;

      // Check WITH components (skip the smallest)
      for (let i = 0; i < withStores.length; i++) {
        if (i === this.smallestStoreIndex) continue;
        if (!withStores[i].has(entity)) return;
      }

      // Check WITHOUT components
      for (let i = 0; i < withoutStores.length; i++) {
        if (withoutStores[i].has(entity)) return;
      }

      results.push(entity);
    });

    this.cached = results;
    this.dirty = false;

    return results;
  }

  /**
   * Marks the query cache as dirty.
   */
  invalidate(): void {
    this.dirty = true;
    this.cached = null;
  }

  /**
   * Iterates over matching entities without intermediate array.
   */
  forEach(fn: (entity: Entity) => void): void {
    const entities = this.execute();
    for (let i = 0; i < entities.length; i++) {
      fn(entities[i]);
    }
  }

  /**
   * Iterates with component access.
   */
  forEachWith<T>(
    componentName: string,
    fn: (entity: Entity, component: T) => void,
  ): void {
    const store = this.registry.getStore<T>(componentName);
    const entities = this.execute();

    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];
      fn(entity, store.getUnsafe(entity));
    }
  }

  /**
   * Returns the number of matching entities.
   */
  count(): number {
    return this.execute().length;
  }

  /**
   * Checks if any entity matches the query.
   */
  isEmpty(): boolean {
    return this.execute().length === 0;
  }

  /**
   * Returns the first matching entity or undefined.
   */
  first(): Entity | undefined {
    const entities = this.execute();
    return entities.length > 0 ? entities[0] : undefined;
  }

  getMatchingComponents(): ReadonlySet<string> {
    return this.compiled.withSet;
  }

  getExcludedComponents(): ReadonlySet<string> {
    return this.compiled.withoutSet;
  }
}
