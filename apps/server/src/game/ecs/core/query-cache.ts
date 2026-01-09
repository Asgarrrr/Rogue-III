/**
 * Query Cache
 *
 * Caches queries and provides precise invalidation based on component changes.
 */

import type { QueryDescriptor } from "../types";
import type { ComponentRegistry } from "./component-registry";
import type { EntityManager } from "./entity-manager";
import { Query } from "./query";

/**
 * Cache for Query instances with precise invalidation.
 */
export class QueryCache {
  private readonly cache = new Map<string, Query>();
  // Inverse index: componentName -> Set<Query> for O(1) invalidation
  private readonly componentToQueries = new Map<string, Set<Query>>();

  constructor(
    private readonly registry: ComponentRegistry,
    private readonly entityManager: EntityManager,
  ) {}

  /**
   * Gets or creates a query for the given descriptor.
   */
  get(descriptor: QueryDescriptor): Query {
    const key = this.getKey(descriptor);

    let query = this.cache.get(key);
    if (!query) {
      query = new Query(descriptor, this.registry, this.entityManager);
      this.cache.set(key, query);
      this.indexQuery(query, descriptor);
    }

    return query;
  }

  private indexQuery(query: Query, descriptor: QueryDescriptor): void {
    for (const componentName of descriptor.with) {
      this.addToIndex(componentName, query);
    }
    for (const componentName of descriptor.without) {
      this.addToIndex(componentName, query);
    }
  }

  private addToIndex(componentName: string, query: Query): void {
    let queries = this.componentToQueries.get(componentName);
    if (!queries) {
      queries = new Set();
      this.componentToQueries.set(componentName, queries);
    }
    queries.add(query);
  }

  /**
   * Invalidates all cached queries.
   */
  invalidateAll(): void {
    for (const query of this.cache.values()) {
      query.invalidate();
    }
  }

  /**
   * Invalidates queries affected by a specific component.
   */
  invalidateByComponent(componentName: string): void {
    const queries = this.componentToQueries.get(componentName);
    if (queries) {
      for (const query of queries) {
        query.invalidate();
      }
    }
  }

  /**
   * Invalidates queries affected by multiple components.
   */
  invalidateByComponents(componentNames: Iterable<string>): void {
    const invalidated = new Set<Query>();

    for (const componentName of componentNames) {
      const queries = this.componentToQueries.get(componentName);
      if (queries) {
        for (const query of queries) {
          if (!invalidated.has(query)) {
            query.invalidate();
            invalidated.add(query);
          }
        }
      }
    }
  }

  private getKey(descriptor: QueryDescriptor): string {
    const withStr = [...descriptor.with].sort().join(",");
    const withoutStr = [...descriptor.without].sort().join(",");
    return `${withStr}|${withoutStr}`;
  }

  /**
   * Clears all cached queries.
   */
  clear(): void {
    this.cache.clear();
    this.componentToQueries.clear();
  }

  /**
   * Returns cache statistics.
   */
  getStats(): { queryCount: number; indexedComponents: number } {
    return {
      queryCount: this.cache.size,
      indexedComponents: this.componentToQueries.size,
    };
  }
}
