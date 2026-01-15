import { type Entity, entityIndex, NULL_ENTITY } from "../core/types";

/**
 * Tracks entity references for validation and automatic nullification.
 *
 * When an entity is despawned, all references pointing to it can be
 * optionally nullified (set to NULL_ENTITY) or left as dangling refs
 * that return null on read.
 */
export class EntityRefStore {
  /**
   * Maps target entity index → Set of { sourceEntity, componentIndex, fieldName }
   * This allows O(1) lookup of all refs pointing to a target when it's despawned.
   */
  private readonly refsByTarget = new Map<
    number,
    Set<{ source: Entity; componentIndex: number; fieldName: string }>
  >();

  /**
   * Maps source entity index → Map<componentIndex.fieldName, targetEntityIndex>
   * This allows cleanup when source entity is despawned.
   */
  private readonly refsBySource = new Map<number, Map<string, number>>();

  /**
   * Register a reference from source entity's field to target entity.
   */
  trackRef(
    source: Entity,
    componentIndex: number,
    fieldName: string,
    target: Entity,
  ): void {
    const sourceIdx = entityIndex(source);
    const targetIdx = entityIndex(target);
    const key = `${componentIndex}.${fieldName}`;

    // Remove old ref if exists
    this.untrackRef(source, componentIndex, fieldName);

    // Don't track NULL_ENTITY refs
    if (target === NULL_ENTITY) return;

    // Add to target's incoming refs
    let targetRefs = this.refsByTarget.get(targetIdx);
    if (!targetRefs) {
      targetRefs = new Set();
      this.refsByTarget.set(targetIdx, targetRefs);
    }
    targetRefs.add({ source, componentIndex, fieldName });

    // Add to source's outgoing refs
    let sourceRefs = this.refsBySource.get(sourceIdx);
    if (!sourceRefs) {
      sourceRefs = new Map();
      this.refsBySource.set(sourceIdx, sourceRefs);
    }
    sourceRefs.set(key, targetIdx);
  }

  /**
   * Remove tracking for a specific reference.
   */
  untrackRef(source: Entity, componentIndex: number, fieldName: string): void {
    const sourceIdx = entityIndex(source);
    const key = `${componentIndex}.${fieldName}`;

    const sourceRefs = this.refsBySource.get(sourceIdx);
    if (!sourceRefs) return;

    const targetIdx = sourceRefs.get(key);
    if (targetIdx === undefined) return;

    // Remove from source's outgoing refs
    sourceRefs.delete(key);
    if (sourceRefs.size === 0) {
      this.refsBySource.delete(sourceIdx);
    }

    // Remove from target's incoming refs
    const targetRefs = this.refsByTarget.get(targetIdx);
    if (targetRefs) {
      for (const ref of targetRefs) {
        if (
          ref.source === source &&
          ref.componentIndex === componentIndex &&
          ref.fieldName === fieldName
        ) {
          targetRefs.delete(ref);
          break;
        }
      }
      if (targetRefs.size === 0) {
        this.refsByTarget.delete(targetIdx);
      }
    }
  }

  /**
   * Get all references pointing to a target entity.
   * Used when despawning to nullify or track dangling refs.
   */
  getRefsToTarget(target: Entity): ReadonlyArray<{
    source: Entity;
    componentIndex: number;
    fieldName: string;
  }> {
    const targetIdx = entityIndex(target);
    const refs = this.refsByTarget.get(targetIdx);
    return refs ? Array.from(refs) : [];
  }

  /**
   * Remove all refs pointing to a target (called on despawn).
   * Returns the refs that were removed for nullification.
   */
  removeRefsToTarget(target: Entity): Array<{
    source: Entity;
    componentIndex: number;
    fieldName: string;
  }> {
    const targetIdx = entityIndex(target);
    const refs = this.refsByTarget.get(targetIdx);
    if (!refs) return [];

    const result = Array.from(refs);
    this.refsByTarget.delete(targetIdx);

    // Also clean up source entries
    for (const ref of result) {
      const sourceIdx = entityIndex(ref.source);
      const sourceRefs = this.refsBySource.get(sourceIdx);
      if (sourceRefs) {
        const key = `${ref.componentIndex}.${ref.fieldName}`;
        sourceRefs.delete(key);
        if (sourceRefs.size === 0) {
          this.refsBySource.delete(sourceIdx);
        }
      }
    }

    return result;
  }

  /**
   * Remove all refs from a source entity (called on despawn).
   */
  removeRefsFromSource(source: Entity): void {
    const sourceIdx = entityIndex(source);
    const sourceRefs = this.refsBySource.get(sourceIdx);
    if (!sourceRefs) return;

    // Remove from all targets' incoming refs
    for (const [key, targetIdx] of sourceRefs) {
      const parts = key.split(".");
      const componentIndex = parseInt(parts[0]!, 10);
      const fieldName = parts[1]!;

      const targetRefs = this.refsByTarget.get(targetIdx);
      if (targetRefs) {
        for (const ref of targetRefs) {
          if (
            ref.source === source &&
            ref.componentIndex === componentIndex &&
            ref.fieldName === fieldName
          ) {
            targetRefs.delete(ref);
            break;
          }
        }
        if (targetRefs.size === 0) {
          this.refsByTarget.delete(targetIdx);
        }
      }
    }

    this.refsBySource.delete(sourceIdx);
  }

  /**
   * Get the number of refs tracked.
   */
  get size(): number {
    let count = 0;
    for (const refs of this.refsByTarget.values()) {
      count += refs.size;
    }
    return count;
  }

  /**
   * Clear all tracked refs.
   */
  clear(): void {
    this.refsByTarget.clear();
    this.refsBySource.clear();
  }
}
