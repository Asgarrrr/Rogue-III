import { getStringPool } from "../storage/string-pool";
import { FieldType } from "./types";

export const FIELD_MARKER = Symbol("ecs:field");

export interface FieldDescriptor {
  readonly [FIELD_MARKER]: true;
  readonly type: FieldType;
  readonly default: number;
  /** For string fields, the original default string value */
  readonly defaultString?: string;
}

function field(type: FieldType, defaultValue: number): FieldDescriptor {
  return { [FIELD_MARKER]: true, type, default: defaultValue };
}

function stringField(defaultValue: string): FieldDescriptor {
  // Intern the default string and store its index
  const pool = getStringPool();
  const index = pool.intern(defaultValue);
  return {
    [FIELD_MARKER]: true,
    type: FieldType.String,
    default: index,
    defaultString: defaultValue,
  };
}

export function f32(defaultValue = 0): FieldDescriptor {
  return field(FieldType.F32, defaultValue);
}

export function f64(defaultValue = 0): FieldDescriptor {
  return field(FieldType.F64, defaultValue);
}

export function i8(defaultValue = 0): FieldDescriptor {
  return field(FieldType.I8, defaultValue);
}

export function i16(defaultValue = 0): FieldDescriptor {
  return field(FieldType.I16, defaultValue);
}

export function i32(defaultValue = 0): FieldDescriptor {
  return field(FieldType.I32, defaultValue);
}

export function u8(defaultValue = 0): FieldDescriptor {
  return field(FieldType.U8, defaultValue);
}

export function u16(defaultValue = 0): FieldDescriptor {
  return field(FieldType.U16, defaultValue);
}

export function u32(defaultValue = 0): FieldDescriptor {
  return field(FieldType.U32, defaultValue);
}

export function bool(defaultValue = false): FieldDescriptor {
  return field(FieldType.Bool, defaultValue ? 1 : 0);
}

export function entityRef(defaultValue = 0): FieldDescriptor {
  return field(FieldType.Entity, defaultValue);
}

/**
 * Define a string field on a component.
 * Strings are interned in a global StringPool and stored as u32 indices.
 *
 * @example
 * @component class Item {
 *   name = str("Unknown");
 *   description = str("");
 * }
 *
 * // Get the string value
 * const name = world.getString(entity, Item, "name");
 *
 * // Set a string value
 * world.setString(entity, Item, "name", "Sword of Destiny");
 */
export function str(defaultValue = ""): FieldDescriptor {
  return stringField(defaultValue);
}

export function isFieldDescriptor(value: unknown): value is FieldDescriptor {
  return typeof value === "object" && value !== null && FIELD_MARKER in value;
}

/**
 * Check if a field descriptor is for a string field.
 */
export function isStringField(descriptor: FieldDescriptor): boolean {
  return descriptor.type === FieldType.String;
}
