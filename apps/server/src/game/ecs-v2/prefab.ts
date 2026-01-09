import type { Entity, ComponentClass, ComponentData } from "./types";
import type { World } from "./world";
import { getComponentMeta } from "./component";

/**
 * Component initializer - either static values or a factory function.
 */
export type ComponentInit<T> =
  | Partial<ComponentData<T>>
  | ((entity: Entity, world: World) => Partial<ComponentData<T>>);

/**
 * A component entry in a prefab definition.
 */
export interface PrefabComponent {
  type: ComponentClass;
  init?: ComponentInit<unknown>;
}

/**
 * Definition of a prefab (entity template).
 */
export interface PrefabDef {
  /** Unique name for this prefab */
  name: string;
  /** Optional parent prefab to inherit from */
  extends?: string;
  /** Components to add */
  components: PrefabComponent[];
  /** Optional callback after entity is created */
  onCreate?: (entity: Entity, world: World) => void;
}

/**
 * Registry for prefab definitions.
 *
 * @example
 * const prefabs = new PrefabRegistry();
 *
 * // Define a base creature prefab
 * prefabs.define({
 *   name: "Creature",
 *   components: [
 *     { type: Position, init: { x: 0, y: 0 } },
 *     { type: Health, init: { current: 100, max: 100 } },
 *   ],
 * });
 *
 * // Define a goblin that extends creature
 * prefabs.define({
 *   name: "Goblin",
 *   extends: "Creature",
 *   components: [
 *     { type: Health, init: { current: 30, max: 30 } }, // Override health
 *     { type: AI, init: { behavior: AIBehavior.Aggressive } },
 *   ],
 * });
 *
 * // Spawn a goblin
 * const goblin = prefabs.spawn(world, "Goblin");
 */
export class PrefabRegistry {
  private readonly prefabs = new Map<string, PrefabDef>();

  /**
   * Define a new prefab.
   */
  define(def: PrefabDef): void {
    if (this.prefabs.has(def.name)) {
      throw new Error(`Prefab "${def.name}" is already defined`);
    }

    if (def.extends && !this.prefabs.has(def.extends)) {
      throw new Error(
        `Parent prefab "${def.extends}" not found for "${def.name}"`,
      );
    }

    this.prefabs.set(def.name, def);
  }

  /**
   * Check if a prefab exists.
   */
  has(name: string): boolean {
    return this.prefabs.has(name);
  }

  /**
   * Get a prefab definition.
   */
  get(name: string): PrefabDef | undefined {
    return this.prefabs.get(name);
  }

  /**
   * Get all prefab names.
   */
  names(): string[] {
    return [...this.prefabs.keys()];
  }

  /**
   * Resolve the full component list for a prefab (including inherited).
   */
  private resolveComponents(name: string): Map<ComponentClass, ComponentInit<unknown> | undefined> {
    const def = this.prefabs.get(name);
    if (!def) {
      throw new Error(`Prefab "${name}" not found`);
    }

    // Start with parent components if extends
    const components = def.extends
      ? new Map(this.resolveComponents(def.extends))
      : new Map<ComponentClass, ComponentInit<unknown> | undefined>();

    // Add/override with this prefab's components
    for (const comp of def.components) {
      components.set(comp.type, comp.init);
    }

    return components;
  }

  /**
   * Resolve the onCreate chain for a prefab (including inherited).
   */
  private resolveOnCreate(name: string): Array<(entity: Entity, world: World) => void> {
    const def = this.prefabs.get(name);
    if (!def) return [];

    const callbacks: Array<(entity: Entity, world: World) => void> = [];

    // Parent callbacks first
    if (def.extends) {
      callbacks.push(...this.resolveOnCreate(def.extends));
    }

    // Then this prefab's callback
    if (def.onCreate) {
      callbacks.push(def.onCreate);
    }

    return callbacks;
  }

  /**
   * Spawn an entity from a prefab.
   *
   * @param world - The world to spawn in
   * @param name - The prefab name
   * @param overrides - Optional component overrides
   */
  spawn(
    world: World,
    name: string,
    overrides?: Map<ComponentClass, Partial<ComponentData<unknown>>>,
  ): Entity {
    const components = this.resolveComponents(name);
    const callbacks = this.resolveOnCreate(name);

    // Get all component types
    const componentTypes = [...components.keys()];

    // Spawn entity with all components
    const entity = world.spawn(...componentTypes);

    // Initialize component data
    for (const [type, init] of components) {
      const meta = getComponentMeta(type);
      if (meta.isTag) continue;

      // Get base init values
      let data: Partial<ComponentData<unknown>>;
      if (typeof init === "function") {
        data = init(entity, world);
      } else {
        data = init ?? {};
      }

      // Apply overrides if any
      const override = overrides?.get(type);
      if (override) {
        data = { ...data, ...override };
      }

      // Set the component data
      if (Object.keys(data).length > 0) {
        world.set(entity, type, data);
      }
    }

    // Run onCreate callbacks
    for (const callback of callbacks) {
      callback(entity, world);
    }

    return entity;
  }

  /**
   * Spawn multiple entities from a prefab.
   */
  spawnMany(
    world: World,
    name: string,
    count: number,
    overridesFn?: (index: number) => Map<ComponentClass, Partial<ComponentData<unknown>>> | undefined,
  ): Entity[] {
    const entities: Entity[] = [];
    for (let i = 0; i < count; i++) {
      const overrides = overridesFn?.(i);
      entities.push(this.spawn(world, name, overrides));
    }
    return entities;
  }

  /**
   * Remove a prefab definition.
   */
  remove(name: string): boolean {
    // Check if any prefab extends this one
    for (const [prefabName, def] of this.prefabs) {
      if (def.extends === name) {
        throw new Error(
          `Cannot remove prefab "${name}" because "${prefabName}" extends it`,
        );
      }
    }
    return this.prefabs.delete(name);
  }

  /**
   * Clear all prefab definitions.
   */
  clear(): void {
    this.prefabs.clear();
  }

  /**
   * Get the number of defined prefabs.
   */
  get size(): number {
    return this.prefabs.size;
  }
}

/**
 * Builder for creating prefabs with a fluent API.
 *
 * @example
 * const goblin = prefab("Goblin")
 *   .with(Position, { x: 0, y: 0 })
 *   .with(Health, { current: 30, max: 30 })
 *   .with(AI)
 *   .onCreate((entity, world) => {
 *     console.log("Goblin spawned!");
 *   })
 *   .build();
 *
 * registry.define(goblin);
 */
export class PrefabBuilder {
  private readonly def: PrefabDef;

  constructor(name: string) {
    this.def = {
      name,
      components: [],
    };
  }

  /**
   * Set the parent prefab to extend.
   */
  extends(parentName: string): this {
    this.def.extends = parentName;
    return this;
  }

  /**
   * Add a component to the prefab.
   */
  with<T>(type: ComponentClass<T>, init?: ComponentInit<T>): this {
    this.def.components.push({ type, init: init as ComponentInit<unknown> });
    return this;
  }

  /**
   * Add a tag component (no data).
   */
  tag(type: ComponentClass): this {
    this.def.components.push({ type });
    return this;
  }

  /**
   * Set the onCreate callback.
   */
  onCreate(callback: (entity: Entity, world: World) => void): this {
    this.def.onCreate = callback;
    return this;
  }

  /**
   * Build the prefab definition.
   */
  build(): PrefabDef {
    return this.def;
  }
}

/**
 * Start building a prefab with the fluent API.
 */
export function prefab(name: string): PrefabBuilder {
  return new PrefabBuilder(name);
}

/**
 * Global prefab registry for convenience.
 */
export const globalPrefabs = new PrefabRegistry();
