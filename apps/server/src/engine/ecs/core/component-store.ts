import { SparseSet } from "./sparse-set";
import type { EntityId } from "./types";

export class ComponentStore<TComponent> {
  private readonly data: SparseSet<TComponent>;
  private readonly writeTickByDenseIndex: number[];
  private readonly currentTick: () => number;

  constructor(
    getCurrentTick: () => number,
    initialEntityCapacity: number = 1024,
  ) {
    this.data = new SparseSet<TComponent>(initialEntityCapacity);
    this.writeTickByDenseIndex = [];
    this.currentTick = getCurrentTick;
  }

  ensureSparseCapacity(entityCapacity: number): void {
    this.data.ensureSparseCapacity(entityCapacity);
  }

  size(): number {
    return this.data.size();
  }

  has(entity: EntityId): boolean {
    return this.data.has(entity);
  }

  get(entity: EntityId): TComponent | undefined {
    return this.data.get(entity);
  }

  add(entity: EntityId, value: TComponent): void {
    const denseIndex = this.data.set(entity, value);
    this.writeTickByDenseIndex[denseIndex] = this.currentTick();
  }

  set(entity: EntityId, updater: (prev: TComponent) => TComponent): void {
    const prev = this.data.get(entity);
    if (prev === undefined) return;
    const next = updater(prev);
    const denseIndex = this.data.set(entity, next);
    this.writeTickByDenseIndex[denseIndex] = this.currentTick();
  }

  remove(entity: EntityId): boolean {
    // If removing a middle element, swap will move last into this position;
    // we'll update the moved element's tick to current tick to reflect mutation.
    const beforeSize = this.data.size();
    if (!this.data.has(entity)) return false;
    // Find dense index before removal to detect swap
    const denseBefore = this.data.getDenseIndex(entity);
    const removed = this.data.remove(entity);
    if (!removed) return false;
    const afterSize = this.data.size();
    if (afterSize < beforeSize) {
      // A swap may have occurred; conservatively mark last position's tick
      const movedIndex = Math.min(denseBefore ?? afterSize, afterSize - 1);
      if (movedIndex >= 0)
        this.writeTickByDenseIndex[movedIndex] = this.currentTick();
    }
    return true;
  }

  getLastWriteTickByDenseIndex(denseIndex: number): number {
    return this.writeTickByDenseIndex[denseIndex] ?? 0;
  }

  getDenseIndex(entity: EntityId): number {
    return this.data.getDenseIndex(entity);
  }

  getEntities(): readonly EntityId[] {
    return this.data.getDenseEntities();
  }

  getLastWriteTick(entity: EntityId): number | undefined {
    const idx = this.data.getDenseIndex(entity);
    return idx >= 0 ? this.getLastWriteTickByDenseIndex(idx) : undefined;
  }

  forEach(
    callback: (entity: EntityId, value: TComponent, denseIndex: number) => void,
  ): void {
    this.data.forEach(callback);
  }

  getDenseEntities(): readonly EntityId[] {
    return this.data.getDenseEntities();
  }
}
