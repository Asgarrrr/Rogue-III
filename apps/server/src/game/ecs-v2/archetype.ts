import {
  type Entity,
  type ComponentMeta,
  type ComponentClass,
  type FieldMeta,
  FIELD_ARRAY_CTOR,
  ChangeFlag,
  makeEntity,
  entityIndex,
  entityGeneration,
} from "./types";
import { getComponentMeta } from "./component";

const INITIAL_CAPACITY = 64;
const GROWTH_FACTOR = 2;

type TypedArray =
  | Float32Array
  | Float64Array
  | Int8Array
  | Int16Array
  | Int32Array
  | Uint8Array
  | Uint16Array
  | Uint32Array;

interface Column {
  readonly field: FieldMeta;
  data: TypedArray;
}

interface ComponentColumns {
  readonly meta: ComponentMeta;
  readonly columns: Column[];
  readonly fieldIndex: Map<string, number>;
}

export class Archetype {
  readonly id: number;
  readonly mask: bigint;
  readonly componentTypes: readonly ComponentClass[];

  private readonly componentData: Map<number, ComponentColumns> = new Map();
  private entityIndices: Uint32Array;
  private entityGens: Uint16Array;
  private changeFlags: Uint8Array;
  // Per-component change tracking: each bit represents a component index that changed
  private componentChangeFlags: BigUint64Array;
  private _count = 0;
  private _capacity: number;

  private _version = 0;
  private readonly columnVersions = new Map<number, number>();

  constructor(id: number, componentTypes: ComponentClass[]) {
    this.id = id;
    this.componentTypes = componentTypes;
    this._capacity = INITIAL_CAPACITY;

    let mask = 0n;
    for (const type of componentTypes) {
      const meta = getComponentMeta(type);
      mask |= 1n << BigInt(meta.id.index);

      if (!meta.isTag) {
        const columns: Column[] = [];
        const fieldIndex = new Map<string, number>();

        for (let i = 0; i < meta.fields.length; i++) {
          const field = meta.fields[i];
          const ArrayCtor = FIELD_ARRAY_CTOR[field.type];
          columns.push({
            field,
            data: new ArrayCtor(INITIAL_CAPACITY) as TypedArray,
          });
          fieldIndex.set(field.name, i);
        }

        this.componentData.set(meta.id.index, { meta, columns, fieldIndex });
      }
    }
    this.mask = mask;

    this.entityIndices = new Uint32Array(INITIAL_CAPACITY);
    this.entityGens = new Uint16Array(INITIAL_CAPACITY);
    this.changeFlags = new Uint8Array(INITIAL_CAPACITY);
    this.componentChangeFlags = new BigUint64Array(INITIAL_CAPACITY);
  }

  get count(): number {
    return this._count;
  }

  get capacity(): number {
    return this._capacity;
  }

  get version(): number {
    return this._version;
  }

  getColumnVersion(componentIndex: number): number {
    return this.columnVersions.get(componentIndex) ?? 0;
  }

  hasComponent(componentIndex: number): boolean {
    return (this.mask & (1n << BigInt(componentIndex))) !== 0n;
  }

  allocateRow(entity: Entity): number {
    if (this._count >= this._capacity) {
      this.grow();
    }

    const row = this._count;
    this.entityIndices[row] = entityIndex(entity);
    this.entityGens[row] = entityGeneration(entity);
    this.changeFlags[row] = ChangeFlag.Added;
    // Mark all components as "added" for this new entity
    this.componentChangeFlags[row] = this.mask;
    this._count++;

    return row;
  }

  freeRow(row: number): Entity | null {
    if (row >= this._count) return null;

    this._count--;
    const lastRow = this._count;

    if (row !== lastRow) {
      this.entityIndices[row] = this.entityIndices[lastRow];
      this.entityGens[row] = this.entityGens[lastRow];
      this.changeFlags[row] = this.changeFlags[lastRow];
      this.componentChangeFlags[row] = this.componentChangeFlags[lastRow];

      for (const cc of this.componentData.values()) {
        for (const col of cc.columns) {
          col.data[row] = col.data[lastRow];
        }
      }

      return makeEntity(this.entityIndices[row], this.entityGens[row]);
    }

    return null;
  }

  getEntity(row: number): Entity {
    return makeEntity(this.entityIndices[row], this.entityGens[row]);
  }

  getEntityIndices(): Uint32Array {
    return this.entityIndices;
  }

  getEntityGens(): Uint16Array {
    return this.entityGens;
  }

  setComponentData(
    row: number,
    componentIndex: number,
    data: Record<string, number>,
  ): void {
    const cc = this.componentData.get(componentIndex);
    if (!cc) return;

    for (const col of cc.columns) {
      const value = data[col.field.name];
      // Only update fields that are explicitly provided
      // This preserves existing values for partial updates
      if (value !== undefined) {
        col.data[row] = value;
      }
    }

    // Mark this specific component as changed
    this.componentChangeFlags[row] |= 1n << BigInt(componentIndex);

    if (this.changeFlags[row] !== ChangeFlag.Added) {
      this.changeFlags[row] = ChangeFlag.Modified;
    }

    this._version++;
    this.columnVersions.set(componentIndex, this._version);
  }

  copyComponentDataFrom(
    targetRow: number,
    source: Archetype,
    sourceRow: number,
    componentIndex: number,
  ): void {
    const targetCc = this.componentData.get(componentIndex);
    const sourceCc = source.componentData.get(componentIndex);
    if (!targetCc || !sourceCc) return;

    for (let i = 0; i < targetCc.columns.length; i++) {
      targetCc.columns[i].data[targetRow] = sourceCc.columns[i].data[sourceRow];
    }
  }

  getFieldValue(
    row: number,
    componentIndex: number,
    fieldName: string,
  ): number | undefined {
    const cc = this.componentData.get(componentIndex);
    if (!cc) return undefined;

    const colIdx = cc.fieldIndex.get(fieldName);
    if (colIdx === undefined) return undefined;

    return cc.columns[colIdx].data[row];
  }

  setFieldValue(
    row: number,
    componentIndex: number,
    fieldName: string,
    value: number,
  ): void {
    const cc = this.componentData.get(componentIndex);
    if (!cc) return;

    const colIdx = cc.fieldIndex.get(fieldName);
    if (colIdx === undefined) return;

    cc.columns[colIdx].data[row] = value;

    // Mark this specific component as changed
    this.componentChangeFlags[row] |= 1n << BigInt(componentIndex);

    if (this.changeFlags[row] !== ChangeFlag.Added) {
      this.changeFlags[row] = ChangeFlag.Modified;
    }

    this._version++;
    this.columnVersions.set(componentIndex, this._version);
  }

  column(componentIndex: number, fieldName: string): TypedArray | null {
    const cc = this.componentData.get(componentIndex);
    if (!cc) return null;

    const colIdx = cc.fieldIndex.get(fieldName);
    if (colIdx === undefined) return null;

    return cc.columns[colIdx].data;
  }

  columnByFieldIndex(
    componentIndex: number,
    fieldIndex: number,
  ): TypedArray | null {
    const cc = this.componentData.get(componentIndex);
    if (!cc || fieldIndex >= cc.columns.length) return null;
    return cc.columns[fieldIndex].data;
  }

  getComponentColumns(componentIndex: number): ComponentColumns | undefined {
    return this.componentData.get(componentIndex);
  }

  getChangeFlag(row: number): ChangeFlag {
    return this.changeFlags[row];
  }

  getChangeFlags(): Uint8Array {
    return this.changeFlags;
  }

  /**
   * Get the component change flags for a specific row.
   * Each bit represents whether that component index was modified.
   */
  getComponentChangeFlag(row: number): bigint {
    return this.componentChangeFlags[row];
  }

  /**
   * Check if a specific component was changed for an entity at the given row.
   */
  hasComponentChanged(row: number, componentIndex: number): boolean {
    return (this.componentChangeFlags[row] & (1n << BigInt(componentIndex))) !== 0n;
  }

  /**
   * Check if any of the components in the mask were changed for an entity.
   */
  hasAnyComponentChanged(row: number, componentMask: bigint): boolean {
    return (this.componentChangeFlags[row] & componentMask) !== 0n;
  }

  clearChangeFlags(): void {
    for (let i = 0; i < this._count; i++) {
      this.changeFlags[i] = ChangeFlag.None;
      this.componentChangeFlags[i] = 0n;
    }
  }

  private grow(): void {
    const newCapacity = this._capacity * GROWTH_FACTOR;

    const newEntityIndices = new Uint32Array(newCapacity);
    newEntityIndices.set(this.entityIndices);
    this.entityIndices = newEntityIndices;

    const newEntityGens = new Uint16Array(newCapacity);
    newEntityGens.set(this.entityGens);
    this.entityGens = newEntityGens;

    const newChangeFlags = new Uint8Array(newCapacity);
    newChangeFlags.set(this.changeFlags);
    this.changeFlags = newChangeFlags;

    const newComponentChangeFlags = new BigUint64Array(newCapacity);
    newComponentChangeFlags.set(this.componentChangeFlags);
    this.componentChangeFlags = newComponentChangeFlags;

    for (const cc of this.componentData.values()) {
      for (const col of cc.columns) {
        const ArrayCtor = FIELD_ARRAY_CTOR[col.field.type];
        const newData = new ArrayCtor(newCapacity) as TypedArray;
        newData.set(col.data);
        col.data = newData;
      }
    }

    this._capacity = newCapacity;
  }
}

export class ArchetypeGraph {
  private archetypes: Archetype[] = [];
  private archetypeByMask = new Map<string, Archetype>();
  private addEdges = new Map<string, Map<number, Archetype>>();
  private removeEdges = new Map<string, Map<number, Archetype | null>>();

  getOrCreateArchetype(componentTypes: ComponentClass[]): Archetype {
    const sorted = [...componentTypes].sort((a, b) => {
      const ma = getComponentMeta(a);
      const mb = getComponentMeta(b);
      return ma.id.index - mb.id.index;
    });

    const key = sorted.map((c) => getComponentMeta(c).id.index).join(",");

    let archetype = this.archetypeByMask.get(key);
    if (!archetype) {
      archetype = new Archetype(this.archetypes.length, sorted);
      this.archetypes.push(archetype);
      this.archetypeByMask.set(key, archetype);
    }

    return archetype;
  }

  getArchetypeWithAdded(
    current: Archetype,
    componentType: ComponentClass,
  ): Archetype {
    const key = this.maskToKey(current.mask);
    let edges = this.addEdges.get(key);
    if (!edges) {
      edges = new Map();
      this.addEdges.set(key, edges);
    }

    const compIndex = getComponentMeta(componentType).id.index;
    let next = edges.get(compIndex);
    if (!next) {
      const newTypes = [...current.componentTypes, componentType];
      next = this.getOrCreateArchetype(newTypes);
      edges.set(compIndex, next);
    }

    return next;
  }

  getArchetypeWithRemoved(
    current: Archetype,
    componentType: ComponentClass,
  ): Archetype | null {
    const key = this.maskToKey(current.mask);
    let edges = this.removeEdges.get(key);
    if (!edges) {
      edges = new Map();
      this.removeEdges.set(key, edges);
    }

    const compIndex = getComponentMeta(componentType).id.index;
    let next = edges.get(compIndex);
    if (next === undefined) {
      const newTypes = current.componentTypes.filter(
        (c) => getComponentMeta(c).id.index !== compIndex,
      );
      if (newTypes.length === 0) {
        next = null;
      } else {
        next = this.getOrCreateArchetype(newTypes as ComponentClass[]);
      }
      edges.set(compIndex, next);
    }

    return next;
  }

  getMatchingArchetypes(withMask: bigint, withoutMask: bigint): Archetype[] {
    const result: Archetype[] = [];
    for (const archetype of this.archetypes) {
      if (
        (archetype.mask & withMask) === withMask &&
        (archetype.mask & withoutMask) === 0n
      ) {
        result.push(archetype);
      }
    }
    return result;
  }

  getAllArchetypes(): readonly Archetype[] {
    return this.archetypes;
  }

  clearAllChangeFlags(): void {
    for (const archetype of this.archetypes) {
      archetype.clearChangeFlags();
    }
  }

  private maskToKey(mask: bigint): string {
    return mask.toString(36);
  }
}
