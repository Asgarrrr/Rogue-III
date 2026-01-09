/**
 * Component Registry
 *
 * Manages all component stores with type safety.
 * Automatically creates the appropriate store type based on schema.
 */

import { ENTITY_CONFIG } from "../types";
import type { ComponentSchema } from "./component";
import {
  AoSComponentStore,
  type ComponentStore,
  SoAComponentStore,
} from "./component-store";

const { MAX_ENTITIES } = ENTITY_CONFIG;

/**
 * Internal storage entry that holds both the store and its schema.
 */
interface RegistryEntry {
  readonly schema: ComponentSchema<unknown>;
  readonly store: ComponentStore<unknown>;
}

/**
 * Creates an SoA store for numeric components.
 */
function createSoAStore<T extends Record<string, number>>(
  schema: ComponentSchema<T>,
  maxEntities: number,
): SoAComponentStore<T> {
  return new SoAComponentStore(schema, maxEntities);
}

/**
 * Creates an AoS store for complex components.
 */
function createAoSStore<T>(
  schema: ComponentSchema<T>,
  maxEntities: number,
): AoSComponentStore<T> {
  return new AoSComponentStore(schema, maxEntities);
}

/**
 * Registry for all component types and their stores.
 *
 * Type safety note: This registry uses `unknown` internally because
 * component types are heterogeneous. Type safety is enforced at the
 * API boundary via generic methods.
 */
export class ComponentRegistry {
  private readonly entries = new Map<string, RegistryEntry>();

  /**
   * Registers a new component type with SoA storage (numeric fields only).
   */
  registerSoA<T extends Record<string, number>>(
    schema: ComponentSchema<T>,
  ): void {
    if (this.entries.has(schema.name)) {
      throw new Error(`Component "${schema.name}" already registered`);
    }

    const store = createSoAStore(schema, MAX_ENTITIES);

    this.entries.set(schema.name, {
      schema: schema as ComponentSchema<unknown>,
      store: store as ComponentStore<unknown>,
    });
  }

  /**
   * Registers a new component type with AoS storage (any fields).
   */
  registerAoS<T>(schema: ComponentSchema<T>): void {
    if (this.entries.has(schema.name)) {
      throw new Error(`Component "${schema.name}" already registered`);
    }

    const store = createAoSStore(schema, MAX_ENTITIES);

    this.entries.set(schema.name, {
      schema: schema as ComponentSchema<unknown>,
      store: store as ComponentStore<unknown>,
    });
  }

  /**
   * Registers a component, automatically choosing storage based on schema.
   * Uses the schema's storage property to determine SoA vs AoS.
   */
  register<T>(schema: ComponentSchema<T>): void {
    if (this.entries.has(schema.name)) {
      throw new Error(`Component "${schema.name}" already registered`);
    }

    let store: ComponentStore<unknown>;

    if (schema.storage === "soa") {
      // SoA: schema must have all numeric fields (enforced by schema builder)
      const soaSchema = schema as ComponentSchema<Record<string, number>>;
      store = createSoAStore(soaSchema, MAX_ENTITIES);
    } else {
      // AoS: handles any type
      store = createAoSStore(schema, MAX_ENTITIES);
    }

    this.entries.set(schema.name, {
      schema: schema as ComponentSchema<unknown>,
      store,
    });
  }

  /**
   * Gets the store for a component type.
   *
   * @typeParam T - The expected component data type (caller must ensure correctness)
   * @throws Error if component is not registered
   */
  getStore<T>(name: string): ComponentStore<T> {
    const entry = this.entries.get(name);
    if (!entry) {
      throw new Error(`Component "${name}" not registered`);
    }
    return entry.store as ComponentStore<T>;
  }

  /**
   * Tries to get a store, returning undefined if not registered.
   */
  tryGetStore<T>(name: string): ComponentStore<T> | undefined {
    const entry = this.entries.get(name);
    if (!entry) return undefined;
    return entry.store as ComponentStore<T>;
  }

  /**
   * Gets the schema for a component type.
   */
  getSchema(name: string): ComponentSchema<unknown> | undefined {
    return this.entries.get(name)?.schema;
  }

  /**
   * Checks if a component type is registered.
   */
  hasComponent(name: string): boolean {
    return this.entries.has(name);
  }

  /**
   * Returns all registered schemas.
   */
  getAllSchemas(): readonly ComponentSchema<unknown>[] {
    return Array.from(this.entries.values()).map((e) => e.schema);
  }

  /**
   * Returns all registered component names.
   */
  getAllComponentNames(): readonly string[] {
    return Array.from(this.entries.keys());
  }

  /**
   * Clears all component data (but keeps registrations).
   */
  clearAllData(): void {
    for (const entry of this.entries.values()) {
      entry.store.clear();
    }
  }

  /**
   * Resets the registry entirely.
   */
  reset(): void {
    this.entries.clear();
  }
}
