import type { Entity, ComponentClass } from "./types";
import type { World } from "./world";
import { getComponentMeta } from "./component";

const INITIAL_CAPACITY = 256;

enum CommandType {
  Spawn = 0,
  Despawn = 1,
  Add = 2,
  Remove = 3,
}

export class CommandBuffer {
  private commandTypes: Uint8Array;
  private commandEntities: Uint32Array;
  private commandComponentIndices: Int16Array;
  // Sort keys for deterministic ordering - commands with same key preserve insertion order
  private sortKeys: Uint32Array;
  // Sequence numbers to maintain insertion order within same sort key
  private sequenceNumbers: Uint32Array;
  private commandCount = 0;
  private capacity: number;

  // Current sort key (typically set by the scheduler based on system execution order)
  private currentSortKey = 0;
  // Global sequence counter for stable sorting
  private sequenceCounter = 0;

  private spawnComponents: ComponentClass[][] = [];
  private addData: (Record<string, number> | undefined)[] = [];

  constructor(initialCapacity: number = INITIAL_CAPACITY) {
    this.capacity = initialCapacity;
    this.commandTypes = new Uint8Array(initialCapacity);
    this.commandEntities = new Uint32Array(initialCapacity);
    this.commandComponentIndices = new Int16Array(initialCapacity);
    this.sortKeys = new Uint32Array(initialCapacity);
    this.sequenceNumbers = new Uint32Array(initialCapacity);
  }

  /**
   * Set the sort key for subsequent commands.
   * Commands with lower sort keys are executed first.
   * Commands with the same sort key are executed in insertion order (FIFO).
   *
   * Typically called by SystemScheduler:
   *   sortKey = systemIndex * 1000 + subOrder
   */
  setSortKey(key: number): void {
    this.currentSortKey = key;
  }

  /**
   * Get the current sort key.
   */
  getSortKey(): number {
    return this.currentSortKey;
  }

  spawn(...components: ComponentClass[]): void {
    this.ensureCapacity();
    const idx = this.commandCount++;

    this.commandTypes[idx] = CommandType.Spawn;
    this.commandEntities[idx] = this.spawnComponents.length;
    this.commandComponentIndices[idx] = -1;
    this.sortKeys[idx] = this.currentSortKey;
    this.sequenceNumbers[idx] = this.sequenceCounter++;

    this.spawnComponents.push(components);
  }

  despawn(entity: Entity): void {
    this.ensureCapacity();
    const idx = this.commandCount++;

    this.commandTypes[idx] = CommandType.Despawn;
    this.commandEntities[idx] = entity as number;
    this.commandComponentIndices[idx] = -1;
    this.sortKeys[idx] = this.currentSortKey;
    this.sequenceNumbers[idx] = this.sequenceCounter++;
  }

  add<T>(
    entity: Entity,
    componentType: ComponentClass<T>,
    data?: Partial<T>,
  ): void {
    this.ensureCapacity();
    const idx = this.commandCount++;

    const meta = getComponentMeta(componentType);

    this.commandTypes[idx] = CommandType.Add;
    this.commandEntities[idx] = entity as number;
    this.commandComponentIndices[idx] = meta.id.index;
    this.sortKeys[idx] = this.currentSortKey;
    this.sequenceNumbers[idx] = this.sequenceCounter++;

    this.addData.push(data as Record<string, number> | undefined);
  }

  remove<T>(entity: Entity, componentType: ComponentClass<T>): void {
    this.ensureCapacity();
    const idx = this.commandCount++;

    const meta = getComponentMeta(componentType);

    this.commandTypes[idx] = CommandType.Remove;
    this.commandEntities[idx] = entity as number;
    this.commandComponentIndices[idx] = meta.id.index;
    this.sortKeys[idx] = this.currentSortKey;
    this.sequenceNumbers[idx] = this.sequenceCounter++;
  }

  flush(world: World): void {
    if (this.commandCount === 0) {
      return;
    }

    // Build sorted indices for deterministic execution order
    const sortedIndices = this.getSortedIndices();

    // Build a mapping from original spawn index to sorted execution order
    // This is needed because spawnComponents array uses original insertion order
    const spawnIndexMapping = this.buildSpawnIndexMapping(sortedIndices);
    const addDataIndexMapping = this.buildAddDataIndexMapping(sortedIndices);

    for (const i of sortedIndices) {
      const type = this.commandTypes[i];
      const entityOrIdx = this.commandEntities[i];

      switch (type) {
        case CommandType.Spawn: {
          const originalSpawnIdx = entityOrIdx;
          const components = this.spawnComponents[originalSpawnIdx];
          world.spawn(...components);
          break;
        }

        case CommandType.Despawn: {
          world.despawn(entityOrIdx as Entity);
          break;
        }

        case CommandType.Add: {
          const compIndex = this.commandComponentIndices[i];
          const originalAddIdx = addDataIndexMapping.get(i)!;
          const data = this.addData[originalAddIdx];
          const componentType = this.findComponentByIndex(compIndex);
          if (componentType) {
            world.add(entityOrIdx as Entity, componentType, data);
          }
          break;
        }

        case CommandType.Remove: {
          const compIndex = this.commandComponentIndices[i];
          const componentType = this.findComponentByIndex(compIndex);
          if (componentType) {
            world.remove(entityOrIdx as Entity, componentType);
          }
          break;
        }
      }
    }

    this.clear();
  }

  /**
   * Get sorted indices based on sort key (primary) and sequence number (secondary).
   * This ensures deterministic ordering regardless of when commands were recorded.
   */
  private getSortedIndices(): number[] {
    const indices: number[] = new Array(this.commandCount);
    for (let i = 0; i < this.commandCount; i++) {
      indices[i] = i;
    }

    // Sort by sortKey first, then by sequenceNumber for stable ordering
    indices.sort((a, b) => {
      const keyDiff = this.sortKeys[a] - this.sortKeys[b];
      if (keyDiff !== 0) return keyDiff;
      return this.sequenceNumbers[a] - this.sequenceNumbers[b];
    });

    return indices;
  }

  /**
   * Build mapping from command index to spawn components array index.
   */
  private buildSpawnIndexMapping(sortedIndices: number[]): Map<number, number> {
    const mapping = new Map<number, number>();
    let spawnIdx = 0;
    // We need to map based on original insertion order, not sorted order
    for (let i = 0; i < this.commandCount; i++) {
      if (this.commandTypes[i] === CommandType.Spawn) {
        mapping.set(i, spawnIdx++);
      }
    }
    return mapping;
  }

  /**
   * Build mapping from command index to addData array index.
   */
  private buildAddDataIndexMapping(sortedIndices: number[]): Map<number, number> {
    const mapping = new Map<number, number>();
    let addIdx = 0;
    // We need to map based on original insertion order, not sorted order
    for (let i = 0; i < this.commandCount; i++) {
      if (this.commandTypes[i] === CommandType.Add) {
        mapping.set(i, addIdx++);
      }
    }
    return mapping;
  }

  clear(): void {
    this.commandCount = 0;
    this.spawnComponents.length = 0;
    this.addData.length = 0;
    this.sequenceCounter = 0;
    this.currentSortKey = 0;
  }

  get pendingCount(): number {
    return this.commandCount;
  }

  isEmpty(): boolean {
    return this.commandCount === 0;
  }

  private ensureCapacity(): void {
    if (this.commandCount >= this.capacity) {
      this.grow();
    }
  }

  private grow(): void {
    const newCapacity = this.capacity * 2;

    const newTypes = new Uint8Array(newCapacity);
    newTypes.set(this.commandTypes);
    this.commandTypes = newTypes;

    const newEntities = new Uint32Array(newCapacity);
    newEntities.set(this.commandEntities);
    this.commandEntities = newEntities;

    const newIndices = new Int16Array(newCapacity);
    newIndices.set(this.commandComponentIndices);
    this.commandComponentIndices = newIndices;

    const newSortKeys = new Uint32Array(newCapacity);
    newSortKeys.set(this.sortKeys);
    this.sortKeys = newSortKeys;

    const newSequenceNumbers = new Uint32Array(newCapacity);
    newSequenceNumbers.set(this.sequenceNumbers);
    this.sequenceNumbers = newSequenceNumbers;

    this.capacity = newCapacity;
  }

  private componentRegistry = new Map<number, ComponentClass>();

  private findComponentByIndex(index: number): ComponentClass | undefined {
    return this.componentRegistry.get(index);
  }

  registerComponent(componentType: ComponentClass): void {
    const meta = getComponentMeta(componentType);
    this.componentRegistry.set(meta.id.index, componentType);
  }

  registerComponents(...componentTypes: ComponentClass[]): void {
    for (const type of componentTypes) {
      this.registerComponent(type);
    }
  }
}
