/**
 * ECS Core Types
 *
 * Shared type definitions for the Entity Component System.
 */

// Development flag for validation checks
export const __DEV__ = process.env.NODE_ENV !== "production";

/**
 * Entity configuration constants.
 *
 * Using 16/16 bit allocation for index/generation:
 * - 65,536 max entities (more than enough for roguelike)
 * - 65,536 generations (avoids wraparound in practice)
 */
export const ENTITY_CONFIG = {
  INDEX_BITS: 16,
  GENERATION_BITS: 16,
  MAX_ENTITIES: 1 << 16, // 65,536
  INDEX_MASK: (1 << 16) - 1, // 0xFFFF
  GENERATION_MASK: (1 << 16) - 1, // 0xFFFF
  INVALID_ENTITY: 0xffffffff,
} as const;

/**
 * Branded Entity type for type safety.
 * Internally a 32-bit integer: [index:16][generation:16]
 */
export type Entity = number & { readonly __brand: unique symbol };

/**
 * Sentinel value for "no entity" / invalid entity.
 */
export const NULL_ENTITY = ENTITY_CONFIG.INVALID_ENTITY as Entity;

/**
 * Pending entity ID for deferred spawning via CommandBuffer.
 */
export type PendingEntityId = symbol;

/**
 * Component types for schema definition.
 */
export enum ComponentType {
  // Numeric types (SoA compatible with TypedArrays)
  F32 = "f32",
  F64 = "f64",
  I32 = "i32",
  U32 = "u32",
  I16 = "i16",
  U16 = "u16",
  I8 = "i8",
  U8 = "u8",
  // Non-numeric types (force AoS)
  String = "string",
  Object = "object",
}

/**
 * TypedArray union type for SoA storage.
 */
export type TypedArray =
  | Float32Array
  | Float64Array
  | Int32Array
  | Uint32Array
  | Int16Array
  | Uint16Array
  | Int8Array
  | Uint8Array;

/**
 * System execution phases.
 */
export enum SystemPhase {
  Init = "init",
  PreUpdate = "preUpdate",
  Update = "update",
  PostUpdate = "postUpdate",
  LateUpdate = "lateUpdate",
}

/**
 * Query descriptor for filtering entities.
 */
export interface QueryDescriptor {
  readonly with: readonly string[];
  readonly without: readonly string[];
}

/**
 * Sentinel for sparse array (entity not present in component store).
 */
export const INVALID_INDEX = 0xffffffff;

/**
 * Coordinate packing constants for spatial operations.
 * Supports signed 16-bit coordinates (-32768 to 32767).
 */
export const COORD_BITS = 16;
export const COORD_MASK = (1 << COORD_BITS) - 1; // 0xFFFF
export const COORD_OFFSET = 32768;
