import type { ComponentClass } from "../core/types";
import type { World } from "../core/world";

/**
 * A run condition is a function that determines whether a system should execute.
 * Returns true if the system should run, false to skip.
 */
export type RunCondition = (world: World) => boolean;

/**
 * A composable condition that can be combined with other conditions.
 * Inspired by Bevy's Condition trait.
 */
export interface Condition {
  /** Evaluate the condition */
  (world: World): boolean;

  /** Combine with another condition using AND (short-circuit) */
  and(other: Condition | RunCondition): Condition;

  /** Combine with another condition using OR (short-circuit) */
  or(other: Condition | RunCondition): Condition;

  /** Negate this condition */
  not(): Condition;
}

/**
 * Create a composable condition from a simple predicate.
 * Creates a NEW function object to avoid mutating the original predicate.
 */
export function condition(predicate: RunCondition): Condition {
  // Create a new function to avoid mutating the original
  const fn = ((world: World) => predicate(world)) as Condition;

  fn.and = (other: Condition | RunCondition): Condition => {
    return condition((world) => {
      // Short-circuit: if first is false, don't evaluate second
      if (!fn(world)) return false;
      return other(world);
    });
  };

  fn.or = (other: Condition | RunCondition): Condition => {
    return condition((world) => {
      // Short-circuit: if first is true, don't evaluate second
      if (fn(world)) return true;
      return other(world);
    });
  };

  fn.not = (): Condition => {
    return condition((world) => !fn(world));
  };

  return fn;
}

// =============================================================================
// Built-in Conditions
// =============================================================================

/**
 * Condition that returns true only on the first evaluation.
 * Uses a closure to track state.
 *
 * @example
 * defineSystem("Init").runIf(runOnce()).execute(...)
 */
export function runOnce(): Condition {
  let hasRun = false;
  return condition(() => {
    if (hasRun) return false;
    hasRun = true;
    return true;
  });
}

/**
 * Condition that checks if a resource exists.
 *
 * @example
 * defineSystem("GameLoop").runIf(resourceExists(GameState)).execute(...)
 */
export function resourceExists<T>(
  type: new (...args: unknown[]) => T,
): Condition {
  return condition((world) => world.hasResource(type));
}

/**
 * Condition that checks if a resource equals a specific value.
 *
 * @example
 * defineSystem("Playing").runIf(resourceEquals(GameState, "playing")).execute(...)
 */
export function resourceEquals<T>(
  type: new (...args: unknown[]) => T,
  value: T,
): Condition {
  return condition((world) => {
    const resource = world.getResource(type);
    // Return false if resource doesn't exist
    return resource !== null && resource === value;
  });
}

/**
 * Condition that checks if a resource satisfies a predicate.
 *
 * @example
 * defineSystem("LowHealth").runIf(resourceMatches(Health, h => h.current < 20)).execute(...)
 */
export function resourceMatches<T>(
  type: new (...args: unknown[]) => T,
  predicate: (value: T) => boolean,
): Condition {
  return condition((world) => {
    const resource = world.getResource(type);
    if (resource === null) return false;
    return predicate(resource);
  });
}

/**
 * Condition that checks if any entity exists with the given components.
 * Uses WeakMap caching to avoid query allocation on each tick.
 *
 * @example
 * defineSystem("EnemyAI").runIf(anyWith(Enemy, Alive)).execute(...)
 */
export function anyWith(...componentTypes: ComponentClass[]): Condition {
  const queryCache = new WeakMap<World, ReturnType<World["query"]>>();
  return condition((world) => {
    let query = queryCache.get(world);
    if (!query) {
      query = world.query(...componentTypes);
      queryCache.set(world, query);
    }
    return query.count() > 0;
  });
}

/**
 * Condition that checks if no entity exists with the given components.
 * Uses WeakMap caching to avoid query allocation on each tick.
 *
 * @example
 * defineSystem("SpawnEnemies").runIf(noneWith(Enemy)).execute(...)
 */
export function noneWith(...componentTypes: ComponentClass[]): Condition {
  const queryCache = new WeakMap<World, ReturnType<World["query"]>>();
  return condition((world) => {
    let query = queryCache.get(world);
    if (!query) {
      query = world.query(...componentTypes);
      queryCache.set(world, query);
    }
    return query.count() === 0;
  });
}

/**
 * Condition that checks if there are pending events of a type.
 *
 * @example
 * defineSystem("HandleDamage").runIf(hasEvent("combat.damage")).execute(...)
 */
export function hasEvent(eventType: string): Condition {
  return condition((world) => {
    return world.events.hasQueued(eventType);
  });
}

/**
 * Condition that checks the current tick number.
 *
 * @example
 * // Run every 10 ticks
 * defineSystem("SlowUpdate").runIf(everyNTicks(10)).execute(...)
 */
export function everyNTicks(n: number): Condition {
  if (n <= 0) {
    throw new Error(`everyNTicks: n must be positive, got ${n}`);
  }
  return condition((world) => {
    return world.getCurrentTick() % n === 0;
  });
}

/**
 * Condition that runs after a certain number of ticks.
 *
 * @example
 * defineSystem("LateStart").runIf(afterTick(100)).execute(...)
 */
export function afterTick(tick: number): Condition {
  return condition((world) => {
    return world.getCurrentTick() >= tick;
  });
}

/**
 * Condition that checks if a component was added to any entity this tick.
 * Uses WeakMap caching for the base query.
 *
 * @example
 * defineSystem("OnSpawn").runIf(componentAdded(Enemy)).execute(...)
 */
export function componentAdded(componentType: ComponentClass): Condition {
  const queryCache = new WeakMap<World, ReturnType<World["query"]>>();
  return condition((world) => {
    let query = queryCache.get(world);
    if (!query) {
      query = world.query(componentType);
      queryCache.set(world, query);
    }
    return query.added().count() > 0;
  });
}

/**
 * Condition that checks if a component was modified on any entity this tick.
 * Uses WeakMap caching for the base query.
 *
 * @example
 * defineSystem("OnHealthChange").runIf(componentChanged(Health)).execute(...)
 */
export function componentChanged(componentType: ComponentClass): Condition {
  const queryCache = new WeakMap<World, ReturnType<World["query"]>>();
  return condition((world) => {
    let query = queryCache.get(world);
    if (!query) {
      query = world.query(componentType);
      queryCache.set(world, query);
    }
    return query.changed().count() > 0;
  });
}

/**
 * Always true condition (for completeness).
 */
export const always: Condition = condition(() => true);

/**
 * Always false condition (for completeness).
 */
export const never: Condition = condition(() => false);

// =============================================================================
// State-based Conditions (for State Machine integration)
// =============================================================================

/**
 * State holder for game states.
 * Use with inState() condition.
 */
export class State<T> {
  constructor(public current: T) {}
}

/**
 * Condition that checks if a State resource equals a value.
 * This is a common pattern for game state machines.
 *
 * @example
 * class GameState extends State<"menu" | "playing" | "paused"> {}
 *
 * world.setResource(GameState, new GameState("menu"));
 *
 * defineSystem("GameLoop")
 *   .runIf(inState(GameState, "playing"))
 *   .execute(...)
 */
export function inState<T>(
  stateType: new (...args: unknown[]) => State<T>,
  value: T,
): Condition {
  return condition((world) => {
    const state = world.getResource(stateType);
    return state !== null && state.current === value;
  });
}

/**
 * Condition that checks if a State resource is NOT a value.
 *
 * @example
 * defineSystem("PauseMenu")
 *   .runIf(notInState(GameState, "playing"))
 *   .execute(...)
 */
export function notInState<T>(
  stateType: new (...args: unknown[]) => State<T>,
  value: T,
): Condition {
  return inState(stateType, value).not();
}
