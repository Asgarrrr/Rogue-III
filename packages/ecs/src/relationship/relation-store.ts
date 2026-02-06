import type { Entity } from "../core/types";
import { assertDefined, entityIndex } from "../core/types";
import type { RelationType, StoredRelation } from "./relation";

/**
 * Result of removing an entity from the store.
 */
export interface RemoveEntityResult {
  /** Entities that should be cascade-deleted */
  readonly cascadeTargets: Entity[];
  /** Number of relations removed */
  readonly removedCount: number;
}

/**
 * Bidirectional relation store with O(1) lookups.
 *
 * Stores relations as (source, relation, target) triples with:
 * - outgoing index: relation → source → Set<target>
 * - incoming index: relation → target → Set<source>
 *
 * This enables fast queries in both directions:
 * - getTargets(source, relation) - O(1) lookup + O(targets) iteration
 * - getSources(target, relation) - O(1) lookup + O(sources) iteration
 */
export class RelationStore {
  /**
   * Outgoing relations: relationIndex → sourceEntity → Set<targetEntity>
   */
  private readonly outgoing = new Map<number, Map<Entity, Set<Entity>>>();

  /**
   * Incoming relations (reverse index): relationIndex → targetEntity → Set<sourceEntity>
   */
  private readonly incoming = new Map<number, Map<Entity, Set<Entity>>>();

  /**
   * Relation data storage: relationIndex → sourceEntity → targetEntity → data
   * Nested Map structure for O(1) lookups without string concatenation
   */
  private readonly data = new Map<number, Map<Entity, Map<Entity, unknown>>>();

  /**
   * Track which entities have any relations (for fast cleanup check)
   */
  private readonly entitiesWithRelations = new Set<Entity>();

  /**
   * Count of relations per entity (for O(1) clearByType cleanup)
   * Key: entity, Value: number of relations involving this entity
   */
  private readonly entityRelationCounts = new Map<Entity, number>();

  /**
   * Total number of relations stored
   */
  private relationCount = 0;

  // ==========================================================================
  // Private Helper Methods for Entity Relation Counts
  // ==========================================================================

  /**
   * Increment the relation count for an entity.
   */
  private incrementEntityCount(entity: Entity): void {
    const count = this.entityRelationCounts.get(entity) ?? 0;
    this.entityRelationCounts.set(entity, count + 1);
    this.entitiesWithRelations.add(entity);
  }

  /**
   * Decrement the relation count for an entity.
   * Removes from entitiesWithRelations if count reaches 0.
   */
  private decrementEntityCount(entity: Entity): void {
    const count = this.entityRelationCounts.get(entity);
    if (count === undefined || count <= 0) return;

    if (count === 1) {
      this.entityRelationCounts.delete(entity);
      this.entitiesWithRelations.delete(entity);
    } else {
      this.entityRelationCounts.set(entity, count - 1);
    }
  }

  // ==========================================================================
  // Private Helper Methods for Data Storage
  // ==========================================================================

  /**
   * Get the nested map for a relation and source, creating if needed.
   */
  private getOrCreateSourceMap(
    relationIndex: number,
    source: Entity,
  ): Map<Entity, unknown> {
    let relationMap = this.data.get(relationIndex);
    if (!relationMap) {
      relationMap = new Map();
      this.data.set(relationIndex, relationMap);
    }
    let sourceMap = relationMap.get(source);
    if (!sourceMap) {
      sourceMap = new Map();
      relationMap.set(source, sourceMap);
    }
    return sourceMap;
  }

  /**
   * Get data for a specific relation triple.
   */
  private getRelationData(
    relationIndex: number,
    source: Entity,
    target: Entity,
  ): unknown | undefined {
    return this.data.get(relationIndex)?.get(source)?.get(target);
  }

  /**
   * Set data for a specific relation triple.
   */
  private setRelationDataInternal(
    relationIndex: number,
    source: Entity,
    target: Entity,
    value: unknown,
  ): void {
    const sourceMap = this.getOrCreateSourceMap(relationIndex, source);
    sourceMap.set(target, value);
  }

  /**
   * Delete data for a specific relation triple.
   * Cleans up empty maps automatically.
   */
  private deleteRelationData(
    relationIndex: number,
    source: Entity,
    target: Entity,
  ): boolean {
    const relationMap = this.data.get(relationIndex);
    if (!relationMap) return false;
    const sourceMap = relationMap.get(source);
    if (!sourceMap) return false;
    const deleted = sourceMap.delete(target);
    // Clean up empty maps
    if (sourceMap.size === 0) {
      relationMap.delete(source);
      if (relationMap.size === 0) {
        this.data.delete(relationIndex);
      }
    }
    return deleted;
  }

  // ==========================================================================
  // Core Operations
  // ==========================================================================

  /**
   * Add a relation between two entities.
   *
   * @param source - The source entity
   * @param relation - The relation type
   * @param target - The target entity
   * @param data - Optional relation data (for typed relations)
   * @returns true if the relation was added, false if it already existed
   */
  add<T>(
    source: Entity,
    relation: RelationType<T>,
    target: Entity,
    data?: T,
  ): boolean {
    const relationIndex = relation.id.index;

    // Handle exclusive relations - remove existing target first
    if (relation.exclusive) {
      const existingTarget = this.getTarget(source, relation);
      if (existingTarget !== null) {
        if (existingTarget === target) {
          // Same target, just update data if provided
          if (data !== undefined) {
            this.setData(source, relation, target, data);
          }
          return false;
        }
        // Remove existing relation
        this.remove(source, relation, existingTarget);
      }
    }

    // Get or create outgoing map for this relation
    let outgoingMap = this.outgoing.get(relationIndex);
    if (!outgoingMap) {
      outgoingMap = new Map();
      this.outgoing.set(relationIndex, outgoingMap);
    }

    // Get or create target set for this source
    let targetSet = outgoingMap.get(source);
    if (!targetSet) {
      targetSet = new Set();
      outgoingMap.set(source, targetSet);
    }

    // Check if relation already exists
    if (targetSet.has(target)) {
      // Update data if provided
      if (data !== undefined) {
        this.setData(source, relation, target, data);
      }
      return false;
    }

    // Add to outgoing index
    targetSet.add(target);

    // Add to incoming index
    let incomingMap = this.incoming.get(relationIndex);
    if (!incomingMap) {
      incomingMap = new Map();
      this.incoming.set(relationIndex, incomingMap);
    }

    let sourceSet = incomingMap.get(target);
    if (!sourceSet) {
      sourceSet = new Set();
      incomingMap.set(target, sourceSet);
    }
    sourceSet.add(source);

    // Track entities with relations (increment counts)
    this.incrementEntityCount(source);
    this.incrementEntityCount(target);

    // Store data if provided
    if (data !== undefined) {
      this.setRelationDataInternal(relationIndex, source, target, data);
    }

    this.relationCount++;

    // Handle symmetric relations
    if (relation.symmetric && source !== target) {
      // Add reverse relation (without recursing into symmetric handling)
      this.addInternal(target, relation, source, data);
    }

    return true;
  }

  /**
   * Internal add without symmetric handling (to avoid infinite recursion).
   */
  private addInternal<T>(
    source: Entity,
    relation: RelationType<T>,
    target: Entity,
    data?: T,
  ): void {
    const relationIndex = relation.id.index;

    let outgoingMap = this.outgoing.get(relationIndex);
    if (!outgoingMap) {
      outgoingMap = new Map();
      this.outgoing.set(relationIndex, outgoingMap);
    }

    let targetSet = outgoingMap.get(source);
    if (!targetSet) {
      targetSet = new Set();
      outgoingMap.set(source, targetSet);
    }

    if (targetSet.has(target)) return;

    targetSet.add(target);

    let incomingMap = this.incoming.get(relationIndex);
    if (!incomingMap) {
      incomingMap = new Map();
      this.incoming.set(relationIndex, incomingMap);
    }

    let sourceSet = incomingMap.get(target);
    if (!sourceSet) {
      sourceSet = new Set();
      incomingMap.set(target, sourceSet);
    }
    sourceSet.add(source);

    this.incrementEntityCount(source);
    this.incrementEntityCount(target);

    if (data !== undefined) {
      this.setRelationDataInternal(relationIndex, source, target, data);
    }

    this.relationCount++;
  }

  /**
   * Remove a relation between two entities.
   *
   * @returns true if the relation was removed, false if it didn't exist
   */
  remove<T>(
    source: Entity,
    relation: RelationType<T>,
    target: Entity,
  ): boolean {
    const relationIndex = relation.id.index;

    // Remove from outgoing index
    const outgoingMap = this.outgoing.get(relationIndex);
    if (!outgoingMap) return false;

    const targetSet = outgoingMap.get(source);
    if (!targetSet || !targetSet.has(target)) return false;

    targetSet.delete(target);
    if (targetSet.size === 0) {
      outgoingMap.delete(source);
    }

    // Remove from incoming index
    const incomingMap = this.incoming.get(relationIndex);
    if (incomingMap) {
      const sourceSet = incomingMap.get(target);
      if (sourceSet) {
        sourceSet.delete(source);
        if (sourceSet.size === 0) {
          incomingMap.delete(target);
        }
      }
    }

    // Remove data
    this.deleteRelationData(relationIndex, source, target);

    // Decrement entity counts
    this.decrementEntityCount(source);
    this.decrementEntityCount(target);

    this.relationCount--;

    // Handle symmetric relations
    if (relation.symmetric && source !== target) {
      this.removeInternal(target, relation, source);
    }

    return true;
  }

  /**
   * Internal remove without symmetric handling.
   */
  private removeInternal<T>(
    source: Entity,
    relation: RelationType<T>,
    target: Entity,
  ): void {
    const relationIndex = relation.id.index;

    const outgoingMap = this.outgoing.get(relationIndex);
    if (!outgoingMap) return;

    const targetSet = outgoingMap.get(source);
    if (!targetSet || !targetSet.has(target)) return;

    targetSet.delete(target);
    if (targetSet.size === 0) {
      outgoingMap.delete(source);
    }

    const incomingMap = this.incoming.get(relationIndex);
    if (incomingMap) {
      const sourceSet = incomingMap.get(target);
      if (sourceSet) {
        sourceSet.delete(source);
        if (sourceSet.size === 0) {
          incomingMap.delete(target);
        }
      }
    }

    this.deleteRelationData(relationIndex, source, target);

    this.decrementEntityCount(source);
    this.decrementEntityCount(target);

    this.relationCount--;
  }

  /**
   * Check if a relation exists between two entities.
   */
  has<T>(source: Entity, relation: RelationType<T>, target: Entity): boolean {
    const outgoingMap = this.outgoing.get(relation.id.index);
    if (!outgoingMap) return false;

    const targetSet = outgoingMap.get(source);
    return targetSet?.has(target) ?? false;
  }

  // ==========================================================================
  // Query Operations
  // ==========================================================================

  /**
   * Get the single target of an exclusive relation.
   * Returns null if no target exists.
   *
   * @throws Error if relation is not exclusive and has multiple targets
   */
  getTarget<T>(source: Entity, relation: RelationType<T>): Entity | null {
    const outgoingMap = this.outgoing.get(relation.id.index);
    if (!outgoingMap) return null;

    const targetSet = outgoingMap.get(source);
    if (!targetSet || targetSet.size === 0) return null;

    if (!relation.exclusive && targetSet.size > 1) {
      throw new Error(
        `Relation "${relation.id.name}" has multiple targets. Use getTargets() instead.`,
      );
    }

    return targetSet.values().next().value ?? null;
  }

  /**
   * Get all targets of a relation from a source entity.
   * Returns empty array if no targets exist.
   *
   * Results are sorted by entity index for deterministic iteration.
   */
  getTargets<T>(source: Entity, relation: RelationType<T>): Entity[] {
    const outgoingMap = this.outgoing.get(relation.id.index);
    if (!outgoingMap) return [];

    const targetSet = outgoingMap.get(source);
    if (!targetSet) return [];

    // Sort by entity index for determinism
    return [...targetSet].sort((a, b) => entityIndex(a) - entityIndex(b));
  }

  /**
   * Get all sources that have a relation to a target entity.
   * Returns empty array if no sources exist.
   *
   * Results are sorted by entity index for deterministic iteration.
   */
  getSources<T>(target: Entity, relation: RelationType<T>): Entity[] {
    const incomingMap = this.incoming.get(relation.id.index);
    if (!incomingMap) return [];

    const sourceSet = incomingMap.get(target);
    if (!sourceSet) return [];

    // Sort by entity index for determinism
    return [...sourceSet].sort((a, b) => entityIndex(a) - entityIndex(b));
  }

  /**
   * Check if an entity has any outgoing relations of a type.
   */
  hasAnyTarget<T>(source: Entity, relation: RelationType<T>): boolean {
    const outgoingMap = this.outgoing.get(relation.id.index);
    if (!outgoingMap) return false;

    const targetSet = outgoingMap.get(source);
    return targetSet !== undefined && targetSet.size > 0;
  }

  /**
   * Check if an entity is the target of any relations of a type.
   */
  hasAnySource<T>(target: Entity, relation: RelationType<T>): boolean {
    const incomingMap = this.incoming.get(relation.id.index);
    if (!incomingMap) return false;

    const sourceSet = incomingMap.get(target);
    return sourceSet !== undefined && sourceSet.size > 0;
  }

  /**
   * Count the number of targets for a source entity and relation.
   */
  countTargets<T>(source: Entity, relation: RelationType<T>): number {
    const outgoingMap = this.outgoing.get(relation.id.index);
    if (!outgoingMap) return 0;

    const targetSet = outgoingMap.get(source);
    return targetSet?.size ?? 0;
  }

  /**
   * Count the number of sources for a target entity and relation.
   */
  countSources<T>(target: Entity, relation: RelationType<T>): number {
    const incomingMap = this.incoming.get(relation.id.index);
    if (!incomingMap) return 0;

    const sourceSet = incomingMap.get(target);
    return sourceSet?.size ?? 0;
  }

  // ==========================================================================
  // Data Operations
  // ==========================================================================

  /**
   * Get the data associated with a relation.
   */
  getData<T>(
    source: Entity,
    relation: RelationType<T>,
    target: Entity,
  ): T | undefined {
    return this.getRelationData(relation.id.index, source, target) as
      | T
      | undefined;
  }

  /**
   * Set the data associated with a relation.
   * The relation must already exist.
   *
   * @returns true if data was set, false if relation doesn't exist
   */
  setData<T>(
    source: Entity,
    relation: RelationType<T>,
    target: Entity,
    data: T,
  ): boolean {
    if (!this.has(source, relation, target)) {
      return false;
    }

    this.setRelationDataInternal(relation.id.index, source, target, data);
    return true;
  }

  // ==========================================================================
  // Entity Lifecycle
  // ==========================================================================

  /**
   * Remove all relations involving an entity.
   * Called when an entity is despawned.
   *
   * @returns Information about cascade targets and removed relations
   */
  removeEntity(entity: Entity): RemoveEntityResult {
    if (!this.entitiesWithRelations.has(entity)) {
      return { cascadeTargets: [], removedCount: 0 };
    }

    const cascadeTargets: Entity[] = [];
    let removedCount = 0;

    // Process all relation types
    for (const [relationIndex, outgoingMap] of this.outgoing) {
      // Remove outgoing relations (entity is source)
      const targetSet = outgoingMap.get(entity);
      if (targetSet) {
        for (const target of targetSet) {
          // Remove from incoming index
          const incomingMap = this.incoming.get(relationIndex);
          if (incomingMap) {
            const sourceSet = incomingMap.get(target);
            if (sourceSet) {
              sourceSet.delete(entity);
              if (sourceSet.size === 0) {
                incomingMap.delete(target);
              }
            }
          }

          // Remove data
          this.deleteRelationData(relationIndex, entity, target);

          // Decrement target's count (entity's count will be cleared at the end)
          this.decrementEntityCount(target);

          removedCount++;
        }
        outgoingMap.delete(entity);
      }
    }

    // Process incoming relations (entity is target)
    for (const [relationIndex, incomingMap] of this.incoming) {
      const sourceSet = incomingMap.get(entity);
      if (sourceSet) {
        // Get the relation type to check cascade
        const relation = this.getRelationByIndex(relationIndex);

        for (const source of sourceSet) {
          // Check cascade delete
          if (relation?.cascadeDelete) {
            cascadeTargets.push(source);
          }

          // Remove from outgoing index
          const outgoingMap = this.outgoing.get(relationIndex);
          if (outgoingMap) {
            const targetSet = outgoingMap.get(source);
            if (targetSet) {
              targetSet.delete(entity);
              if (targetSet.size === 0) {
                outgoingMap.delete(source);
              }
            }
          }

          // Remove data
          this.deleteRelationData(relationIndex, source, entity);

          // Decrement source's count (entity's count will be cleared at the end)
          this.decrementEntityCount(source);

          removedCount++;
        }
        incomingMap.delete(entity);
      }
    }

    // Clear the entity's own count and tracking
    this.entityRelationCounts.delete(entity);
    this.entitiesWithRelations.delete(entity);
    this.relationCount -= removedCount;

    return { cascadeTargets, removedCount };
  }

  /**
   * Get relation type by index (for cascade checking).
   * This is a simple lookup - in practice, you'd inject the relation registry.
   */
  private relationTypeCache = new Map<number, RelationType>();

  registerRelationType(relation: RelationType): void {
    this.relationTypeCache.set(relation.id.index, relation);
  }

  private getRelationByIndex(index: number): RelationType | undefined {
    return this.relationTypeCache.get(index);
  }

  // ==========================================================================
  // Iteration
  // ==========================================================================

  /**
   * Iterate over all relations of a type.
   * Callback receives (source, target, data) for each relation.
   *
   * Iteration order is deterministic (sorted by source, then target).
   */
  forEach<T>(
    relation: RelationType<T>,
    callback: (source: Entity, target: Entity, data: T | undefined) => void,
  ): void {
    const outgoingMap = this.outgoing.get(relation.id.index);
    if (!outgoingMap) return;

    // Sort sources for determinism
    const sortedSources = [...outgoingMap.keys()].sort(
      (a, b) => entityIndex(a) - entityIndex(b),
    );

    for (const source of sortedSources) {
      const targetSet = outgoingMap.get(source);
      assertDefined(
        targetSet,
        `RelationStore: missing target set for source ${source}`,
      );
      const sortedTargets = [...targetSet].sort(
        (a, b) => entityIndex(a) - entityIndex(b),
      );

      for (const target of sortedTargets) {
        const data = this.getData(source, relation, target);
        callback(source, target, data);
      }
    }
  }

  /**
   * Get all relations as an array (for serialization).
   */
  getAllRelations<T>(relation: RelationType<T>): StoredRelation<T>[] {
    const results: StoredRelation<T>[] = [];

    this.forEach(relation, (source, target, data) => {
      results.push({
        source,
        target,
        relation,
        data,
      });
    });

    return results;
  }

  // ==========================================================================
  // Utility
  // ==========================================================================

  /**
   * Get the total number of relations stored.
   */
  get count(): number {
    return this.relationCount;
  }

  /**
   * Get the number of relations for a specific type.
   */
  countByType(relation: RelationType): number {
    const outgoingMap = this.outgoing.get(relation.id.index);
    if (!outgoingMap) return 0;

    let count = 0;
    for (const targetSet of outgoingMap.values()) {
      count += targetSet.size;
    }
    return count;
  }

  /**
   * Check if an entity has any relations (incoming or outgoing).
   */
  hasAnyRelation(entity: Entity): boolean {
    return this.entitiesWithRelations.has(entity);
  }

  /**
   * Clear all relations.
   */
  clear(): void {
    this.outgoing.clear();
    this.incoming.clear();
    this.data.clear();
    this.entitiesWithRelations.clear();
    this.entityRelationCounts.clear();
    this.relationCount = 0;
  }

  /**
   * Clear all relations of a specific type.
   * Complexity: O(relations removed) - uses entity counts for fast cleanup.
   */
  clearByType(relation: RelationType): void {
    const relationIndex = relation.id.index;

    const outgoingMap = this.outgoing.get(relationIndex);
    if (!outgoingMap) return;

    // Process each relation and decrement entity counts
    let removedCount = 0;
    for (const [source, targetSet] of outgoingMap) {
      for (const target of targetSet) {
        // Remove data
        this.deleteRelationData(relationIndex, source, target);

        // Decrement counts - this handles entitiesWithRelations cleanup in O(1)
        this.decrementEntityCount(source);
        this.decrementEntityCount(target);

        removedCount++;
      }
    }

    this.outgoing.delete(relationIndex);
    this.incoming.delete(relationIndex);
    this.relationCount -= removedCount;
  }
}
