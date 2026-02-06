import type { ComponentClass, ComponentData, Entity } from "./types";

/**
 * A Bundle is a reusable collection of component types with optional default values.
 * Bundles make spawning entities with common component patterns easy and type-safe.
 *
 * Inspired by Bevy's Bundle pattern.
 *
 * @example
 * // Simple bundle (types only)
 * const MovableBundle = bundle(Position, Velocity);
 * world.spawn(...MovableBundle.types);
 *
 * // Bundle with defaults
 * const EnemyBundle = bundle(Position, Health, Enemy)
 *   .defaults({
 *     Health: { current: 100, max: 100 },
 *     Position: { x: 0, y: 0 },
 *   });
 *
 * // Manual approach
 * const enemy = world.spawn(...EnemyBundle.types);
 * EnemyBundle.applyDefaults(world, enemy);
 *
 * // Or use the spawnBundle helper
 * const enemy = spawnBundle(world, EnemyBundle);
 */

/**
 * Default values for a bundle, keyed by component class name.
 */
export type BundleDefaults<T extends ComponentClass[]> = {
  [K in T[number] as K extends { name: string }
    ? K["name"]
    : never]?: K extends ComponentClass<infer D>
    ? Partial<ComponentData<D>>
    : never;
};

/**
 * A bundle definition.
 */
export interface Bundle<T extends ComponentClass[] = ComponentClass[]> {
  /** The component types in this bundle */
  readonly types: T;

  /** Default values for components */
  readonly defaultValues: Map<ComponentClass, Record<string, unknown>>;

  /**
   * Set default values for components in this bundle.
   * Returns a new bundle with the defaults applied.
   */
  defaults(values: BundleDefaults<T>): Bundle<T>;

  /**
   * Compose this bundle with another bundle or component types.
   * Returns a new bundle containing all types from both.
   */
  with<U extends ComponentClass[]>(
    ...others: (Bundle<ComponentClass[]> | ComponentClass)[]
  ): Bundle<[...T, ...U]>;

  /**
   * Apply default values to an entity that already has the components.
   */
  applyDefaults(
    world: {
      set: <C>(
        e: Entity,
        t: ComponentClass<C>,
        d: Partial<ComponentData<C>>,
      ) => void;
    },
    entity: Entity,
  ): void;
}

/**
 * Create a bundle from component types.
 *
 * @example
 * const PlayerBundle = bundle(Position, Velocity, Health, Player);
 */
export function bundle<T extends ComponentClass[]>(...types: T): Bundle<T> {
  return createBundle(types, new Map());
}

function createBundle<T extends ComponentClass[]>(
  types: T,
  defaultValues: Map<ComponentClass, Record<string, unknown>>,
): Bundle<T> {
  const bundleObj: Bundle<T> = {
    types,
    defaultValues,

    defaults(values: BundleDefaults<T>): Bundle<T> {
      const newDefaults = new Map(defaultValues);

      for (const type of types) {
        const typeName = type.name;
        const defaults = (values as Record<string, unknown>)[typeName];
        if (defaults !== undefined) {
          newDefaults.set(type, defaults as Record<string, unknown>);
        }
      }

      return createBundle(types, newDefaults);
    },

    with<U extends ComponentClass[]>(
      ...others: (Bundle<ComponentClass[]> | ComponentClass)[]
    ): Bundle<[...T, ...U]> {
      const newTypes: ComponentClass[] = [...types];
      const newDefaults = new Map(defaultValues);

      for (const other of others) {
        if (typeof other === "function") {
          // It's a component class
          if (!newTypes.includes(other)) {
            newTypes.push(other);
          }
        } else {
          // It's a bundle
          for (const type of other.types) {
            if (!newTypes.includes(type)) {
              newTypes.push(type);
            }
          }
          // Merge defaults - later bundles override earlier ones
          for (const [type, defaults] of other.defaultValues) {
            newDefaults.set(type, defaults);
          }
        }
      }

      return createBundle(newTypes as [...T, ...U], newDefaults);
    },

    applyDefaults(
      world: {
        set: <C>(
          e: Entity,
          t: ComponentClass<C>,
          d: Partial<ComponentData<C>>,
        ) => void;
      },
      entity: Entity,
    ): void {
      for (const [type, defaults] of defaultValues) {
        world.set(entity, type, defaults as Partial<ComponentData<unknown>>);
      }
    },
  };

  return bundleObj;
}

// =============================================================================
// World extension for bundle spawning
// =============================================================================

/**
 * Spawn helper that works with bundles.
 * This is a standalone function, not a World method, for flexibility.
 *
 * @example
 * const entity = spawnBundle(world, EnemyBundle);
 * const entity = spawnBundle(world, EnemyBundle, {
 *   Position: { x: 10, y: 20 },
 * });
 */
export function spawnBundle<T extends ComponentClass[]>(
  world: {
    spawn: (...types: ComponentClass[]) => Entity;
    set: <C>(
      e: Entity,
      t: ComponentClass<C>,
      d: Partial<ComponentData<C>>,
    ) => void;
  },
  bundleDef: Bundle<T>,
  overrides?: BundleDefaults<T>,
): Entity {
  // Spawn with all component types
  const entity = world.spawn(...bundleDef.types);

  // Apply bundle defaults
  bundleDef.applyDefaults(world, entity);

  // Apply overrides
  if (overrides) {
    for (const type of bundleDef.types) {
      const typeName = type.name;
      const override = (overrides as Record<string, unknown>)[typeName];
      if (override !== undefined) {
        world.set(entity, type, override as Partial<ComponentData<unknown>>);
      }
    }
  }

  return entity;
}
