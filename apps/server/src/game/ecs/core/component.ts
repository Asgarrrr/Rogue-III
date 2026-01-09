/**
 * Component Schema Definition
 *
 * Provides a declarative builder pattern for defining component schemas.
 * Supports both SoA (Structure of Arrays) and AoS (Array of Structures) storage.
 */

import { ComponentType, __DEV__ } from "../types";

// Re-export ComponentType for consumers
export { ComponentType };

/**
 * Checks if a component type is compatible with SoA storage.
 */
export function isSoACompatible(type: ComponentType): boolean {
  return type !== ComponentType.String && type !== ComponentType.Object;
}

/**
 * Field definition for a component.
 */
export interface ComponentField {
  readonly name: string;
  readonly type: ComponentType;
  readonly default?: unknown;
}

/**
 * Schema definition for a component type.
 */
export class ComponentSchema<T = unknown> {
  constructor(
    public readonly name: string,
    public readonly fields: readonly ComponentField[],
    public readonly storage: "soa" | "aos" = "soa",
  ) {}

  static define<T>(name: string): ComponentSchemaBuilder<T> {
    return new ComponentSchemaBuilder<T>(name);
  }
}

/**
 * Builder pattern for creating component schemas.
 */
export class ComponentSchemaBuilder<T> {
  private fields: ComponentField[] = [];
  private storage: "soa" | "aos" = "soa";
  private hasNonNumericField = false;

  constructor(private readonly name: string) {}

  /**
   * Adds a field to the component schema.
   */
  field(name: string, type: ComponentType, defaultValue?: unknown): this {
    this.fields.push({ name, type, default: defaultValue });

    if (!isSoACompatible(type)) {
      this.hasNonNumericField = true;
    }

    return this;
  }

  /**
   * Forces AoS storage mode.
   */
  useAoS(): this {
    this.storage = "aos";
    return this;
  }

  /**
   * Builds the final component schema.
   */
  build(): ComponentSchema<T> {
    const finalStorage = this.hasNonNumericField ? "aos" : this.storage;

    if (__DEV__ && this.hasNonNumericField && this.storage === "soa") {
      console.warn(
        `[ECS] Component "${this.name}" has non-numeric fields, ` +
          `automatically using AoS storage instead of SoA.`,
      );
    }

    return new ComponentSchema(this.name, this.fields, finalStorage);
  }
}
