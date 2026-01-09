/**
 * Component Stores
 *
 * Implements SoA (Structure of Arrays) and AoS (Array of Structures) storage.
 * Uses sparse sets for O(1) add/remove/has operations.
 */

import {
  ComponentType,
  ENTITY_CONFIG,
  type Entity,
  INVALID_INDEX,
  type TypedArray,
} from "../types";
import type { ComponentField, ComponentSchema } from "./component";
import { createEntity, getGeneration, getIndex } from "./entity";

const { MAX_ENTITIES } = ENTITY_CONFIG;

/**
 * Interface for component stores.
 */
export interface ComponentStore<T> {
  // CRUD
  add(entity: Entity, data: T): void;
  remove(entity: Entity): boolean;
  has(entity: Entity): boolean;

  // Reading
  get(entity: Entity): T | undefined;
  getUnsafe(entity: Entity): T;

  // Field access (zero-allocation for SoA)
  getField<K extends keyof T>(entity: Entity, field: K): T[K] | undefined;
  setField<K extends keyof T>(entity: Entity, field: K, value: T[K]): void;

  // Iteration
  forEach(fn: (entity: Entity, component: T) => void): void;
  forEachEntity(fn: (entity: Entity) => void): void;

  // Bulk operations
  getCount(): number;
  getEntities(): readonly Entity[];
  clear(): void;

  // For query system
  getDenseArray(): readonly Entity[];
}

/**
 * Creates a TypedArray for the given component type.
 */
function createTypedArray(type: ComponentType, size: number): TypedArray {
  switch (type) {
    case ComponentType.F32:
      return new Float32Array(size);
    case ComponentType.F64:
      return new Float64Array(size);
    case ComponentType.I32:
      return new Int32Array(size);
    case ComponentType.U32:
      return new Uint32Array(size);
    case ComponentType.I16:
      return new Int16Array(size);
    case ComponentType.U16:
      return new Uint16Array(size);
    case ComponentType.I8:
      return new Int8Array(size);
    case ComponentType.U8:
      return new Uint8Array(size);
    default:
      throw new Error(`Unsupported SoA type: ${type}`);
  }
}

/**
 * Numeric component type constraint.
 */
type NumericComponent = { [K: string]: number };

/**
 * SoA Component Store - Optimized for numeric primitives.
 * Uses TypedArrays for cache-friendly sequential access.
 */
export class SoAComponentStore<T extends NumericComponent>
  implements ComponentStore<T>
{
  private readonly sparse: Uint32Array;
  private readonly dense: Uint32Array;
  private readonly generations: Uint16Array;
  private readonly fields: Map<keyof T & string, TypedArray>;
  private readonly fieldDefs: readonly ComponentField[];
  private count = 0;

  constructor(schema: ComponentSchema<T>, maxEntities: number = MAX_ENTITIES) {
    this.sparse = new Uint32Array(maxEntities).fill(INVALID_INDEX);
    this.dense = new Uint32Array(maxEntities);
    this.generations = new Uint16Array(maxEntities);
    this.fields = new Map();
    this.fieldDefs = schema.fields;

    for (const field of schema.fields) {
      this.fields.set(
        field.name as keyof T & string,
        createTypedArray(field.type, maxEntities),
      );
    }
  }

  add(entity: Entity, data: T): void {
    const index = getIndex(entity);
    const generation = getGeneration(entity);
    let denseIdx = this.sparse[index];

    if (denseIdx === INVALID_INDEX) {
      denseIdx = this.count++;
      this.sparse[index] = denseIdx;
      this.dense[denseIdx] = index;
    }

    this.generations[denseIdx] = generation;

    for (const field of this.fieldDefs) {
      const fieldName = field.name as keyof T & string;
      const arr = this.fields.get(fieldName);
      if (arr) {
        arr[denseIdx] = data[fieldName];
      }
    }
  }

  remove(entity: Entity): boolean {
    const index = getIndex(entity);
    const denseIdx = this.sparse[index];

    if (denseIdx === INVALID_INDEX) return false;

    const lastIdx = --this.count;

    if (denseIdx !== lastIdx) {
      const lastEntityIndex = this.dense[lastIdx];
      this.dense[denseIdx] = lastEntityIndex;
      this.generations[denseIdx] = this.generations[lastIdx];
      this.sparse[lastEntityIndex] = denseIdx;

      for (const [fieldName, arr] of this.fields) {
        arr[denseIdx] = arr[lastIdx];
      }
    }

    this.sparse[index] = INVALID_INDEX;
    return true;
  }

  has(entity: Entity): boolean {
    const index = getIndex(entity);
    const denseIdx = this.sparse[index];
    if (denseIdx === INVALID_INDEX) return false;
    return this.generations[denseIdx] === getGeneration(entity);
  }

  get(entity: Entity): T | undefined {
    const index = getIndex(entity);
    const denseIdx = this.sparse[index];
    if (denseIdx === INVALID_INDEX) return undefined;
    if (this.generations[denseIdx] !== getGeneration(entity)) return undefined;

    const result: NumericComponent = {};
    for (const [fieldName, arr] of this.fields) {
      result[fieldName] = arr[denseIdx];
    }
    return result as T;
  }

  getUnsafe(entity: Entity): T {
    const index = getIndex(entity);
    const denseIdx = this.sparse[index];
    const fields = this.fields;

    return new Proxy({} as T, {
      get(_, prop: string): number | undefined {
        return fields.get(prop as keyof T & string)?.[denseIdx];
      },
      set(_, prop: string, value: number): boolean {
        const arr = fields.get(prop as keyof T & string);
        if (arr) arr[denseIdx] = value;
        return true;
      },
    });
  }

  getField<K extends keyof T>(entity: Entity, field: K): T[K] | undefined {
    const index = getIndex(entity);
    const denseIdx = this.sparse[index];
    if (denseIdx === INVALID_INDEX) return undefined;
    if (this.generations[denseIdx] !== getGeneration(entity)) return undefined;

    const arr = this.fields.get(field as keyof T & string);
    return arr ? (arr[denseIdx] as T[K]) : undefined;
  }

  setField<K extends keyof T>(entity: Entity, field: K, value: T[K]): void {
    const index = getIndex(entity);
    const denseIdx = this.sparse[index];
    if (denseIdx === INVALID_INDEX) return;
    if (this.generations[denseIdx] !== getGeneration(entity)) return;

    const arr = this.fields.get(field as keyof T & string);
    if (arr) arr[denseIdx] = value as number;
  }

  forEach(fn: (entity: Entity, component: T) => void): void {
    for (let i = 0; i < this.count; i++) {
      const entity = createEntity(this.dense[i], this.generations[i]);

      const component: NumericComponent = {};
      for (const [fieldName, arr] of this.fields) {
        component[fieldName] = arr[i];
      }
      fn(entity, component as T);
    }
  }

  forEachEntity(fn: (entity: Entity) => void): void {
    for (let i = 0; i < this.count; i++) {
      fn(createEntity(this.dense[i], this.generations[i]));
    }
  }

  getCount(): number {
    return this.count;
  }

  getEntities(): readonly Entity[] {
    const result: Entity[] = new Array(this.count);
    for (let i = 0; i < this.count; i++) {
      result[i] = createEntity(this.dense[i], this.generations[i]);
    }
    return result;
  }

  getDenseArray(): readonly Entity[] {
    return this.getEntities();
  }

  clear(): void {
    this.sparse.fill(INVALID_INDEX);
    this.count = 0;
  }

  // Advanced: direct access to raw arrays
  getRawField<K extends keyof T & string>(
    fieldName: K,
  ): TypedArray | undefined {
    return this.fields.get(fieldName);
  }

  getRawDense(): Uint32Array {
    return this.dense;
  }

  getRawGenerations(): Uint16Array {
    return this.generations;
  }
}

/**
 * AoS Component Store - For complex objects (strings, arrays, nested objects).
 * Uses standard JavaScript arrays for flexible data types.
 */
export class AoSComponentStore<T> implements ComponentStore<T> {
  private readonly sparse: Uint32Array;
  private readonly dense: Uint32Array;
  private readonly generations: Uint16Array;
  private readonly data: (T | undefined)[];
  private count = 0;

  constructor(_schema: ComponentSchema<T>, maxEntities: number = MAX_ENTITIES) {
    this.sparse = new Uint32Array(maxEntities).fill(INVALID_INDEX);
    this.dense = new Uint32Array(maxEntities);
    this.generations = new Uint16Array(maxEntities);
    this.data = new Array(maxEntities);
  }

  add(entity: Entity, data: T): void {
    const index = getIndex(entity);
    const generation = getGeneration(entity);
    let denseIdx = this.sparse[index];

    if (denseIdx === INVALID_INDEX) {
      denseIdx = this.count++;
      this.sparse[index] = denseIdx;
      this.dense[denseIdx] = index;
    }

    this.generations[denseIdx] = generation;
    this.data[denseIdx] = this.clone(data);
  }

  remove(entity: Entity): boolean {
    const index = getIndex(entity);
    const denseIdx = this.sparse[index];

    if (denseIdx === INVALID_INDEX) return false;

    const lastIdx = --this.count;

    if (denseIdx !== lastIdx) {
      const lastEntityIndex = this.dense[lastIdx];
      this.dense[denseIdx] = lastEntityIndex;
      this.generations[denseIdx] = this.generations[lastIdx];
      this.sparse[lastEntityIndex] = denseIdx;
      this.data[denseIdx] = this.data[lastIdx];
    }

    this.sparse[index] = INVALID_INDEX;
    this.data[lastIdx] = undefined;
    return true;
  }

  has(entity: Entity): boolean {
    const index = getIndex(entity);
    const denseIdx = this.sparse[index];
    if (denseIdx === INVALID_INDEX) return false;
    return this.generations[denseIdx] === getGeneration(entity);
  }

  get(entity: Entity): T | undefined {
    const index = getIndex(entity);
    const denseIdx = this.sparse[index];
    if (denseIdx === INVALID_INDEX) return undefined;
    if (this.generations[denseIdx] !== getGeneration(entity)) return undefined;
    return this.data[denseIdx];
  }

  getUnsafe(entity: Entity): T {
    const denseIdx = this.sparse[getIndex(entity)];
    return this.data[denseIdx]!;
  }

  getField<K extends keyof T>(entity: Entity, field: K): T[K] | undefined {
    const component = this.get(entity);
    return component?.[field];
  }

  setField<K extends keyof T>(entity: Entity, field: K, value: T[K]): void {
    const index = getIndex(entity);
    const denseIdx = this.sparse[index];
    if (denseIdx === INVALID_INDEX) return;
    if (this.generations[denseIdx] !== getGeneration(entity)) return;
    const component = this.data[denseIdx];
    if (component !== undefined) {
      (component as T)[field] = value;
    }
  }

  forEach(fn: (entity: Entity, component: T) => void): void {
    for (let i = 0; i < this.count; i++) {
      const entity = createEntity(this.dense[i], this.generations[i]);
      const component = this.data[i];
      if (component !== undefined) {
        fn(entity, component);
      }
    }
  }

  forEachEntity(fn: (entity: Entity) => void): void {
    for (let i = 0; i < this.count; i++) {
      fn(createEntity(this.dense[i], this.generations[i]));
    }
  }

  getCount(): number {
    return this.count;
  }

  getEntities(): readonly Entity[] {
    const result: Entity[] = new Array(this.count);
    for (let i = 0; i < this.count; i++) {
      result[i] = createEntity(this.dense[i], this.generations[i]);
    }
    return result;
  }

  getDenseArray(): readonly Entity[] {
    return this.getEntities();
  }

  clear(): void {
    this.sparse.fill(INVALID_INDEX);
    for (let i = 0; i < this.count; i++) {
      this.data[i] = undefined;
    }
    this.count = 0;
  }

  private clone(data: T): T {
    try {
      return structuredClone(data);
    } catch {
      if (Array.isArray(data)) {
        return [...data] as T;
      }
      if (data !== null && typeof data === "object") {
        return { ...data };
      }
      return data;
    }
  }
}
