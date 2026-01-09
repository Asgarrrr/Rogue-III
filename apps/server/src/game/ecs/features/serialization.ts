/**
 * Serialization System
 *
 * Save/load world state with delta compression.
 * Uses templates for efficient storage.
 */

import type { Entity } from "../types";
import type { World } from "../core/world";
import { getIndex, getGeneration, createEntity } from "../core/entity";
import type { EntityTemplateRegistry, TemplateComponents } from "./templates";

// ============================================================================
// Serialization Types
// ============================================================================

/**
 * Serialized entity data.
 */
export interface SerializedEntity {
  /** Original entity ID for reference */
  readonly entityId: number;
  /** Template ID (if template-based) */
  readonly templateId?: string;
  /** Component delta from template (or full data if no template) */
  readonly components: Readonly<Record<string, unknown>>;
}

/**
 * World snapshot for persistence.
 */
export interface WorldSnapshot {
  /** Snapshot format version */
  readonly version: string;
  /** Creation timestamp */
  readonly timestamp: number;
  /** Current game tick */
  readonly tick: number;
  /** Serialized entities */
  readonly entities: readonly SerializedEntity[];
  /** Serializable resources */
  readonly resources: Readonly<Record<string, unknown>>;
  /** Optional metadata */
  readonly metadata?: Readonly<Record<string, unknown>>;
}

/**
 * Configuration for serialization.
 */
export interface SerializationConfig {
  /** Components to exclude from serialization */
  readonly excludeComponents?: readonly string[];
  /** Resources to include in serialization */
  readonly includeResources?: readonly string[];
  /** Custom serializers for specific components */
  readonly componentSerializers?: Readonly<Record<string, ComponentSerializer>>;
  /** Custom deserializers for specific components */
  readonly componentDeserializers?: Readonly<
    Record<string, ComponentDeserializer>
  >;
}

/**
 * Custom component serializer.
 */
export type ComponentSerializer = (data: unknown) => unknown;

/**
 * Custom component deserializer.
 */
export type ComponentDeserializer = (data: unknown) => unknown;

// ============================================================================
// Delta Computation
// ============================================================================

/**
 * Computes the delta between two objects.
 * Returns only the properties that differ.
 */
function computeDelta(
  template: Record<string, unknown>,
  current: Record<string, unknown>,
): Record<string, unknown> | null {
  const delta: Record<string, unknown> = {};
  let hasChanges = false;

  for (const key of Object.keys(current)) {
    const templateValue = template[key];
    const currentValue = current[key];

    if (!deepEqual(templateValue, currentValue)) {
      delta[key] = currentValue;
      hasChanges = true;
    }
  }

  return hasChanges ? delta : null;
}

/**
 * Deep equality check.
 */
function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;

  if (typeof a === "object") {
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (!deepEqual(a[i], b[i])) return false;
      }
      return true;
    }

    if (!Array.isArray(a) && !Array.isArray(b)) {
      const aObj = a as Record<string, unknown>;
      const bObj = b as Record<string, unknown>;
      const aKeys = Object.keys(aObj);
      const bKeys = Object.keys(bObj);

      if (aKeys.length !== bKeys.length) return false;

      for (const key of aKeys) {
        if (!deepEqual(aObj[key], bObj[key])) return false;
      }
      return true;
    }
  }

  return false;
}

/**
 * Deep merge override into base.
 */
function deepMerge(
  base: Record<string, unknown>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...base };

  for (const key of Object.keys(override)) {
    const overrideValue = override[key];
    const baseValue = result[key];

    if (
      overrideValue !== null &&
      typeof overrideValue === "object" &&
      !Array.isArray(overrideValue) &&
      baseValue !== null &&
      typeof baseValue === "object" &&
      !Array.isArray(baseValue)
    ) {
      result[key] = deepMerge(
        baseValue as Record<string, unknown>,
        overrideValue as Record<string, unknown>,
      );
    } else {
      result[key] = overrideValue;
    }
  }

  return result;
}

// ============================================================================
// World Serializer
// ============================================================================

/**
 * Serializes and deserializes world state.
 */
export class WorldSerializer {
  private readonly config: Required<SerializationConfig>;

  constructor(
    private readonly templateRegistry?: EntityTemplateRegistry,
    config: SerializationConfig = {},
  ) {
    this.config = {
      excludeComponents: config.excludeComponents ?? [],
      includeResources: config.includeResources ?? [],
      componentSerializers: config.componentSerializers ?? {},
      componentDeserializers: config.componentDeserializers ?? {},
    };
  }

  /**
   * Serializes the world to a snapshot.
   */
  serialize(world: World, metadata?: Record<string, unknown>): WorldSnapshot {
    const entities: SerializedEntity[] = [];

    for (const entity of world.entities.getAllAlive()) {
      const serialized = this.serializeEntity(world, entity);
      if (serialized) {
        entities.push(serialized);
      }
    }

    const resources: Record<string, unknown> = {};
    for (const name of this.config.includeResources) {
      const resource = world.resources.tryGet(name);
      if (resource !== undefined) {
        resources[name] = this.serializeValue(resource);
      }
    }

    return {
      version: "1.0",
      timestamp: Date.now(),
      tick: world.getCurrentTick(),
      entities,
      resources,
      metadata,
    };
  }

  /**
   * Deserializes a snapshot into the world.
   */
  deserialize(world: World, snapshot: WorldSnapshot): Map<number, Entity> {
    // Map old entity IDs to new ones
    const entityMap = new Map<number, Entity>();

    // First pass: create all entities
    for (const serialized of snapshot.entities) {
      const entity = world.spawn();
      entityMap.set(serialized.entityId, entity);
    }

    // Second pass: add components with resolved entity references
    for (const serialized of snapshot.entities) {
      const entity = entityMap.get(serialized.entityId)!;
      this.deserializeEntity(world, entity, serialized, entityMap);
    }

    // Restore resources
    for (const [name, value] of Object.entries(snapshot.resources)) {
      const deserialized = this.deserializeValue(value);
      world.resources.set(name, deserialized);
    }

    // Restore tick
    world.resources.set("currentTick", snapshot.tick);

    return entityMap;
  }

  /**
   * Serializes a single entity.
   */
  private serializeEntity(
    world: World,
    entity: Entity,
  ): SerializedEntity | null {
    const components: Record<string, unknown> = {};
    const excludeSet = new Set(this.config.excludeComponents);

    // Check for template
    const templateIdComp = world.getComponent<{ id: string }>(
      entity,
      "TemplateId",
    );
    const templateId = templateIdComp?.id;

    let templateComponents: TemplateComponents | undefined;
    if (templateId && this.templateRegistry?.has(templateId)) {
      templateComponents = this.templateRegistry.compile(templateId);
    }

    // Serialize components
    for (const schema of world.components.getAllSchemas()) {
      if (excludeSet.has(schema.name)) continue;
      if (schema.name === "TemplateId") continue; // Handle separately

      const data = world.getComponent(entity, schema.name);
      if (data === undefined) continue;

      const serializer = this.config.componentSerializers[schema.name];
      const serializedData = serializer
        ? serializer(data)
        : this.serializeValue(data);

      // Apply delta compression if we have a template
      if (templateComponents && templateComponents[schema.name] !== undefined) {
        const delta = computeDelta(
          templateComponents[schema.name] as Record<string, unknown>,
          serializedData as Record<string, unknown>,
        );

        if (delta) {
          components[schema.name] = delta;
        }
        // If no delta, skip (use template default)
      } else {
        components[schema.name] = serializedData;
      }
    }

    return {
      entityId: entity as number,
      templateId,
      components,
    };
  }

  /**
   * Deserializes components to an entity.
   */
  private deserializeEntity(
    world: World,
    entity: Entity,
    serialized: SerializedEntity,
    entityMap: Map<number, Entity>,
  ): void {
    // Get template components if available
    let baseComponents: Record<string, unknown> = {};

    if (
      serialized.templateId &&
      this.templateRegistry?.has(serialized.templateId)
    ) {
      baseComponents = {
        ...this.templateRegistry.compile(serialized.templateId),
      };

      // Add TemplateId component
      if (world.components.hasComponent("TemplateId")) {
        world.addComponent(entity, "TemplateId", { id: serialized.templateId });
      }
    }

    // Merge with delta
    const mergedComponents = deepMerge(
      baseComponents,
      serialized.components as Record<string, unknown>,
    );

    // Add components
    for (const [componentName, data] of Object.entries(mergedComponents)) {
      const deserializer = this.config.componentDeserializers[componentName];
      const deserializedData = deserializer
        ? deserializer(data)
        : this.deserializeValue(data, entityMap);

      world.addComponent(entity, componentName, deserializedData);
    }
  }

  /**
   * Serializes a value, handling special types.
   */
  private serializeValue(value: unknown): unknown {
    if (value === null || value === undefined) return value;

    if (typeof value === "object") {
      if (value instanceof Set) {
        return { __type: "Set", values: Array.from(value) };
      }
      if (value instanceof Map) {
        return { __type: "Map", entries: Array.from(value.entries()) };
      }
      if (Array.isArray(value)) {
        return value.map((v) => this.serializeValue(v));
      }

      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(value)) {
        result[k] = this.serializeValue(v);
      }
      return result;
    }

    return value;
  }

  /**
   * Deserializes a value, resolving entity references.
   */
  private deserializeValue(
    value: unknown,
    entityMap?: Map<number, Entity>,
  ): unknown {
    if (value === null || value === undefined) return value;

    if (typeof value === "object") {
      const obj = value as Record<string, unknown>;

      // Handle special serialization types
      if (obj.__type === "Set" && Array.isArray(obj.values)) {
        const values = obj.values.map((v: unknown) =>
          this.deserializeValue(v, entityMap),
        );
        return new Set(values);
      }
      if (obj.__type === "Map" && Array.isArray(obj.entries)) {
        const entries: [unknown, unknown][] = obj.entries.map(
          (entry: unknown) => {
            const [k, v] = entry as [unknown, unknown];
            return [
              this.deserializeValue(k, entityMap),
              this.deserializeValue(v, entityMap),
            ] as [unknown, unknown];
          },
        );
        return new Map(entries);
      }

      if (Array.isArray(value)) {
        return value.map((v) => this.deserializeValue(v, entityMap));
      }

      const result: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(obj)) {
        result[k] = this.deserializeValue(v, entityMap);
      }
      return result;
    }

    return value;
  }
}

/**
 * Saves world to JSON string.
 */
export function saveWorldToJson(
  world: World,
  serializer: WorldSerializer,
  metadata?: Record<string, unknown>,
): string {
  const snapshot = serializer.serialize(world, metadata);
  return JSON.stringify(snapshot, null, 2);
}

/**
 * Loads world from JSON string.
 */
export function loadWorldFromJson(
  world: World,
  serializer: WorldSerializer,
  json: string,
): Map<number, Entity> {
  const snapshot = JSON.parse(json) as WorldSnapshot;
  return serializer.deserialize(world, snapshot);
}

/**
 * Saves world to file (Bun).
 */
export async function saveWorldToFile(
  world: World,
  serializer: WorldSerializer,
  filepath: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const json = saveWorldToJson(world, serializer, metadata);
  await Bun.write(filepath, json);
}

/**
 * Loads world from file (Bun).
 */
export async function loadWorldFromFile(
  world: World,
  serializer: WorldSerializer,
  filepath: string,
): Promise<Map<number, Entity>> {
  const file = Bun.file(filepath);
  const json = await file.text();
  return loadWorldFromJson(world, serializer, json);
}
