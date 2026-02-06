const ENTITY_BRAND: unique symbol = Symbol("Entity");

export type Entity = number & { readonly [ENTITY_BRAND]: true };

export const ENTITY_INDEX_BITS = 20;
export const ENTITY_GEN_BITS = 12;
export const MAX_ENTITIES = 1 << ENTITY_INDEX_BITS;
export const INDEX_MASK = (1 << ENTITY_INDEX_BITS) - 1;
export const GEN_MASK = (1 << ENTITY_GEN_BITS) - 1;
export const NULL_ENTITY = 0xffffffff as Entity;

export function makeEntity(index: number, generation: number): Entity {
  return ((generation << ENTITY_INDEX_BITS) | (index & INDEX_MASK)) as Entity;
}

export function entityIndex(entity: Entity): number {
  return entity & INDEX_MASK;
}

export function entityGeneration(entity: Entity): number {
  return (entity >>> ENTITY_INDEX_BITS) & GEN_MASK;
}

export enum FieldType {
  F32 = 0,
  F64 = 1,
  I8 = 2,
  I16 = 3,
  I32 = 4,
  U8 = 5,
  U16 = 6,
  U32 = 7,
  Bool = 8,
  Entity = 9,
  String = 10, // Stored as u32 index into StringPool
}

export const FIELD_BYTE_SIZE: Record<FieldType, number> = {
  [FieldType.F32]: 4,
  [FieldType.F64]: 8,
  [FieldType.I8]: 1,
  [FieldType.I16]: 2,
  [FieldType.I32]: 4,
  [FieldType.U8]: 1,
  [FieldType.U16]: 2,
  [FieldType.U32]: 4,
  [FieldType.Bool]: 1,
  [FieldType.Entity]: 4,
  [FieldType.String]: 4, // u32 index into StringPool
};

export const FIELD_ARRAY_CTOR: Record<
  FieldType,
  new (
    n: number,
  ) => ArrayLike<number> & { fill(v: number): void }
> = {
  [FieldType.F32]: Float32Array,
  [FieldType.F64]: Float64Array,
  [FieldType.I8]: Int8Array,
  [FieldType.I16]: Int16Array,
  [FieldType.I32]: Int32Array,
  [FieldType.U8]: Uint8Array,
  [FieldType.U16]: Uint16Array,
  [FieldType.U32]: Uint32Array,
  [FieldType.Bool]: Uint8Array,
  [FieldType.Entity]: Uint32Array,
  [FieldType.String]: Uint32Array, // Stores string pool indices
};

export enum ChangeFlag {
  None = 0,
  Added = 1,
  Modified = 2,
  Removed = 4,
}

export enum Phase {
  PreUpdate = 0,
  Update = 1,
  PostUpdate = 2,
}

export interface FieldMeta {
  readonly name: string;
  readonly type: FieldType;
  readonly offset: number;
  readonly default: number;
}

export interface ComponentId {
  readonly index: number;
  readonly name: string;
}

export interface ComponentMeta {
  readonly id: ComponentId;
  readonly fields: readonly FieldMeta[];
  readonly stride: number;
  readonly isTag: boolean;
}

export type ComponentClass<T = unknown> = (new () => T) & {
  __ecs?: ComponentMeta;
};

export type ComponentData<T> = {
  [K in keyof T]: number;
};

// =============================================================================
// Assertions
// =============================================================================

/**
 * Assert that a value is defined (not undefined).
 * Uses TypeScript's `asserts` for automatic type narrowing.
 *
 * @example
 * const value = map.get(key);
 * assertDefined(value, "Key not found");
 * // value is now narrowed to non-undefined
 */
export function assertDefined<T>(
  value: T | undefined,
  message: string,
): asserts value is T {
  if (value === undefined) {
    throw new Error(message);
  }
}

/**
 * Assert that a value is not null or undefined.
 *
 * @example
 * const entity = world.getTarget(source, relation);
 * assertExists(entity, "No target found");
 */
export function assertExists<T>(
  value: T | null | undefined,
  message: string,
): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message);
  }
}

// =============================================================================
// ComponentMask - High-performance bitset for component presence tracking
// =============================================================================

// Support up to 128 components (4 x 32-bit words)
const MASK_WORDS = 4;

export class ComponentMask {
  private readonly words = new Uint32Array(MASK_WORDS);

  set(index: number): this {
    this.words[index >>> 5]! |= 1 << (index & 31);
    return this;
  }

  unset(index: number): this {
    this.words[index >>> 5]! &= ~(1 << (index & 31));
    return this;
  }

  has(index: number): boolean {
    return (this.words[index >>> 5]! & (1 << (index & 31))) !== 0;
  }

  containsAll(other: ComponentMask): boolean {
    for (let i = 0; i < MASK_WORDS; i++) {
      // Use >>> 0 to force unsigned comparison (JS bitwise ops return signed int32)
      if (((this.words[i]! & other.words[i]!) >>> 0) !== other.words[i]!) return false;
    }
    return true;
  }

  intersects(other: ComponentMask): boolean {
    for (let i = 0; i < MASK_WORDS; i++) {
      // Use >>> 0 to handle sign bit correctly
      if (((this.words[i]! & other.words[i]!) >>> 0) !== 0) return true;
    }
    return false;
  }

  or(other: ComponentMask): this {
    for (let i = 0; i < MASK_WORDS; i++) {
      this.words[i]! |= other.words[i]!;
    }
    return this;
  }

  clone(): ComponentMask {
    const copy = new ComponentMask();
    copy.words.set(this.words);
    return copy;
  }

  clear(): this {
    this.words.fill(0);
    return this;
  }

  isEmpty(): boolean {
    return this.words.every((w) => w === 0);
  }

  equals(other: ComponentMask): boolean {
    for (let i = 0; i < MASK_WORDS; i++) {
      if (this.words[i]! !== other.words[i]!) return false;
    }
    return true;
  }

  toKey(): string {
    // For Map keys - compact representation
    return Array.from(this.words)
      .map((w) => w.toString(36))
      .join(".");
  }

  /**
   * Convert to bigint for compatibility with per-row component change flags.
   * Only supports indices 0-63.
   */
  toBigInt(): bigint {
    // Only first 2 words (64 bits) can fit in bigint without losing precision
    const low = BigInt(this.words[0]!);
    const high = BigInt(this.words[1]!);
    return low | (high << 32n);
  }

  static fromIndex(index: number): ComponentMask {
    return new ComponentMask().set(index);
  }
}
