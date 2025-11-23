import { getIndexFromEntityId } from "./entity";
import type { EntityId } from "./types";

/**
 * Generic SparseSet storing entity ids and aligned component payloads.
 * O(1) add/remove/has via sparse index mapping and dense arrays, swap-remove on delete.
 *
 * Provides type-safe access with validation guards to prevent undefined access.
 */
export class SparseSet<T> {
  private sparseIndicesByEntityIndex: Int32Array;
  private denseEntities: EntityId[];
  private denseData: T[];

  constructor(entityCapacity: number = 1024) {
    this.sparseIndicesByEntityIndex = new Int32Array(entityCapacity);
    this.sparseIndicesByEntityIndex.fill(-1);
    this.denseEntities = [];
    this.denseData = [];
  }

  /**
   * Validate internal data structure consistency (for debugging).
   * Returns true if the sparse set is in a valid state.
   */
  validateConsistency(): boolean {
    // Check that dense arrays are aligned
    if (this.denseEntities.length !== this.denseData.length) {
      return false;
    }

    // Check that all sparse indices point to correct dense positions
    for (let i = 0; i < this.denseEntities.length; i++) {
      const entity = this.denseEntities[i];
      const eIndex = getIndexFromEntityId(entity);

      if (eIndex >= this.sparseIndicesByEntityIndex.length) {
        return false;
      }

      if (this.sparseIndicesByEntityIndex[eIndex] !== i) {
        return false;
      }
    }

    return true;
  }

  ensureSparseCapacity(entityCapacity: number): void {
    if (entityCapacity <= this.sparseIndicesByEntityIndex.length) return;
    const next = new Int32Array(entityCapacity);
    next.fill(-1);
    next.set(this.sparseIndicesByEntityIndex);
    this.sparseIndicesByEntityIndex = next;
  }

  size(): number {
    return this.denseEntities.length;
  }

  has(entity: EntityId): boolean {
    const eIndex = getIndexFromEntityId(entity);
    if (eIndex >= this.sparseIndicesByEntityIndex.length) return false;
    const denseIndex = this.sparseIndicesByEntityIndex[eIndex];
    return denseIndex >= 0 && this.denseEntities[denseIndex] === entity;
  }

  /**
   * Get data for an entity, returning undefined if not found.
   * Uses multiple validation checks to ensure data integrity.
   */
  get(entity: EntityId): T | undefined {
    const eIndex = getIndexFromEntityId(entity);
    if (eIndex >= this.sparseIndicesByEntityIndex.length) return undefined;

    const denseIndex = this.sparseIndicesByEntityIndex[eIndex];
    if (denseIndex < 0) return undefined;

    // Validate dense index is within bounds
    if (denseIndex >= this.denseEntities.length) return undefined;

    // Validate entity matches (handles generation mismatch)
    if (this.denseEntities[denseIndex] !== entity) return undefined;

    // Final bounds check on data array
    if (denseIndex >= this.denseData.length) return undefined;

    return this.denseData[denseIndex];
  }

  /**
   * Get data for an entity, throwing if not found.
   * Use when the entity is expected to exist.
   */
  getOrThrow(entity: EntityId): T {
    const data = this.get(entity);
    if (data === undefined) {
      throw new Error(`Entity ${entity} not found in SparseSet`);
    }
    return data;
  }

  /**
   * Get data for an entity with a default fallback.
   */
  getOrDefault(entity: EntityId, defaultValue: T): T {
    const data = this.get(entity);
    return data !== undefined ? data : defaultValue;
  }

  set(entity: EntityId, data: T): number /* dense index */ {
    const eIndex = getIndexFromEntityId(entity);
    this.ensureSparseCapacity(eIndex + 1);
    const denseIndex = this.sparseIndicesByEntityIndex[eIndex];
    if (denseIndex >= 0 && this.denseEntities[denseIndex] === entity) {
      this.denseData[denseIndex] = data;
      return denseIndex;
    }
    const newDense = this.denseEntities.length;
    this.denseEntities.push(entity);
    this.denseData.push(data);
    this.sparseIndicesByEntityIndex[eIndex] = newDense;
    return newDense;
  }

  getDenseIndex(entity: EntityId): number {
    const eIndex = getIndexFromEntityId(entity);
    if (eIndex >= this.sparseIndicesByEntityIndex.length) return -1;
    const denseIndex = this.sparseIndicesByEntityIndex[eIndex];
    if (denseIndex < 0) return -1;
    if (this.denseEntities[denseIndex] !== entity) return -1;
    return denseIndex;
  }

  remove(entity: EntityId): boolean {
    const eIndex = getIndexFromEntityId(entity);
    if (eIndex >= this.sparseIndicesByEntityIndex.length) return false;
    const denseIndex = this.sparseIndicesByEntityIndex[eIndex];
    if (denseIndex < 0 || this.denseEntities[denseIndex] !== entity)
      return false;

    const lastIndex = this.denseEntities.length - 1;
    if (denseIndex !== lastIndex) {
      // swap with last
      const lastEntity = this.denseEntities[lastIndex];
      this.denseEntities[denseIndex] = lastEntity;
      this.denseData[denseIndex] = this.denseData[lastIndex];
      const lastEntityIndex = getIndexFromEntityId(lastEntity);
      this.sparseIndicesByEntityIndex[lastEntityIndex] = denseIndex;
    }
    // remove last
    this.denseEntities.pop();
    this.denseData.pop();
    this.sparseIndicesByEntityIndex[eIndex] = -1;
    return true;
  }

  forEach(
    callback: (entity: EntityId, data: T, denseIndex: number) => void,
  ): void {
    for (let i = 0; i < this.denseEntities.length; i++) {
      callback(this.denseEntities[i], this.denseData[i], i);
    }
  }

  getDenseEntities(): readonly EntityId[] {
    return this.denseEntities;
  }

  getDenseData(): readonly T[] {
    return this.denseData;
  }
}
