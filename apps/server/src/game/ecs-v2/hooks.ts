import type { Entity, ComponentClass, ComponentData } from "./types";
import { getComponentMeta } from "./component";

/**
 * Hook function called when a component is added to an entity.
 * Called synchronously after the component data is initialized.
 */
export type OnAddHook<T = unknown> = (
  entity: Entity,
  data: ComponentData<T>,
) => void;

/**
 * Hook function called when a component is removed from an entity.
 * Called synchronously before the component data is removed.
 */
export type OnRemoveHook<T = unknown> = (
  entity: Entity,
  data: ComponentData<T>,
) => void;

/**
 * Hook function called when a component's data is modified.
 * Called synchronously after the data is updated.
 */
export type OnSetHook<T = unknown> = (
  entity: Entity,
  data: ComponentData<T>,
  previousData: ComponentData<T> | null,
) => void;

/**
 * Component lifecycle hooks.
 * Unlike events (EventQueue), hooks are:
 * - Synchronous (called immediately)
 * - Guaranteed to run (no subscription required at event time)
 * - Single per component type (not multiple handlers)
 */
export interface ComponentHooks<T = unknown> {
  /** Called after a component is added to an entity */
  onAdd?: OnAddHook<T>;
  /** Called before a component is removed from an entity */
  onRemove?: OnRemoveHook<T>;
  /** Called after a component's data is modified via set() */
  onSet?: OnSetHook<T>;
}

/**
 * Registry for component lifecycle hooks.
 * Hooks are registered per component type and are guaranteed to be called
 * for every lifecycle event (add, remove, set).
 */
export class HookRegistry {
  private readonly hooks = new Map<number, ComponentHooks>();
  private readonly hooksByName = new Map<string, ComponentHooks>();
  private enabled = true;

  /**
   * Register hooks for a component type.
   * Only one set of hooks per component type is allowed.
   *
   * @throws Error if hooks are already registered for this component
   */
  register<T>(
    componentType: ComponentClass<T>,
    hooks: ComponentHooks<T>,
  ): this {
    const meta = getComponentMeta(componentType);
    const index = meta.id.index;
    const name = meta.id.name;

    if (this.hooks.has(index)) {
      throw new Error(
        `Hooks already registered for component "${name}". ` +
          `Use replace() to override existing hooks.`,
      );
    }

    this.hooks.set(index, hooks as ComponentHooks);
    this.hooksByName.set(name, hooks as ComponentHooks);
    return this;
  }

  /**
   * Replace existing hooks for a component type.
   * Creates new hooks if none exist.
   */
  replace<T>(
    componentType: ComponentClass<T>,
    hooks: ComponentHooks<T>,
  ): this {
    const meta = getComponentMeta(componentType);
    this.hooks.set(meta.id.index, hooks as ComponentHooks);
    this.hooksByName.set(meta.id.name, hooks as ComponentHooks);
    return this;
  }

  /**
   * Remove hooks for a component type.
   */
  unregister<T>(componentType: ComponentClass<T>): boolean {
    const meta = getComponentMeta(componentType);
    const had = this.hooks.has(meta.id.index);
    this.hooks.delete(meta.id.index);
    this.hooksByName.delete(meta.id.name);
    return had;
  }

  /**
   * Check if hooks are registered for a component type.
   */
  has<T>(componentType: ComponentClass<T>): boolean {
    const meta = getComponentMeta(componentType);
    return this.hooks.has(meta.id.index);
  }

  /**
   * Get hooks for a component type.
   */
  get<T>(componentType: ComponentClass<T>): ComponentHooks<T> | undefined {
    const meta = getComponentMeta(componentType);
    return this.hooks.get(meta.id.index) as ComponentHooks<T> | undefined;
  }

  /**
   * Get hooks by component index (internal use).
   */
  getByIndex(componentIndex: number): ComponentHooks | undefined {
    return this.hooks.get(componentIndex);
  }

  /**
   * Get hooks by component name.
   */
  getByName(componentName: string): ComponentHooks | undefined {
    return this.hooksByName.get(componentName);
  }

  /**
   * Trigger onAdd hook for a component.
   */
  triggerOnAdd(
    entity: Entity,
    componentIndex: number,
    data: Record<string, number>,
  ): void {
    if (!this.enabled) return;
    const hooks = this.hooks.get(componentIndex);
    if (hooks?.onAdd) {
      hooks.onAdd(entity, data);
    }
  }

  /**
   * Trigger onRemove hook for a component.
   */
  triggerOnRemove(
    entity: Entity,
    componentIndex: number,
    data: Record<string, number>,
  ): void {
    if (!this.enabled) return;
    const hooks = this.hooks.get(componentIndex);
    if (hooks?.onRemove) {
      hooks.onRemove(entity, data);
    }
  }

  /**
   * Trigger onSet hook for a component.
   */
  triggerOnSet(
    entity: Entity,
    componentIndex: number,
    newData: Record<string, number>,
    previousData: Record<string, number> | null,
  ): void {
    if (!this.enabled) return;
    const hooks = this.hooks.get(componentIndex);
    if (hooks?.onSet) {
      hooks.onSet(entity, newData, previousData);
    }
  }

  /**
   * Temporarily disable all hooks.
   * Useful for bulk operations or deserialization.
   */
  disable(): void {
    this.enabled = false;
  }

  /**
   * Re-enable hooks after disabling.
   */
  enable(): void {
    this.enabled = true;
  }

  /**
   * Check if hooks are currently enabled.
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Execute a function with hooks disabled.
   */
  withHooksDisabled<T>(fn: () => T): T {
    const wasEnabled = this.enabled;
    this.enabled = false;
    try {
      return fn();
    } finally {
      this.enabled = wasEnabled;
    }
  }

  /**
   * Clear all registered hooks.
   */
  clear(): void {
    this.hooks.clear();
    this.hooksByName.clear();
  }

  /**
   * Get the number of registered hooks.
   */
  get count(): number {
    return this.hooks.size;
  }

  /**
   * Get all component names that have hooks registered.
   */
  getRegisteredComponents(): string[] {
    return [...this.hooksByName.keys()];
  }
}

// Global hook registry (can be replaced per-world)
export const globalHooks = new HookRegistry();

// ============================================================================
// Helper functions for common hook patterns
// ============================================================================

/**
 * Create hooks that log component lifecycle events (for debugging).
 */
export function createLoggingHooks<T>(
  componentName: string,
): ComponentHooks<T> {
  return {
    onAdd: (entity, data) => {
      console.log(`[Hook] ${componentName} added to entity ${entity}:`, data);
    },
    onRemove: (entity, data) => {
      console.log(
        `[Hook] ${componentName} removed from entity ${entity}:`,
        data,
      );
    },
    onSet: (entity, newData, prevData) => {
      console.log(
        `[Hook] ${componentName} set on entity ${entity}:`,
        prevData,
        "->",
        newData,
      );
    },
  };
}

/**
 * Create hooks that validate component data.
 */
export function createValidationHooks<T>(
  validator: (data: ComponentData<T>) => boolean,
  errorMessage: string,
): ComponentHooks<T> {
  const validate = (data: ComponentData<T>) => {
    if (!validator(data)) {
      throw new Error(errorMessage);
    }
  };

  return {
    onAdd: (_, data) => validate(data),
    onSet: (_, data) => validate(data),
  };
}

/**
 * Combine multiple hooks into one.
 * All hooks are called in order.
 */
export function combineHooks<T>(
  ...hookSets: ComponentHooks<T>[]
): ComponentHooks<T> {
  return {
    onAdd: (entity, data) => {
      for (const hooks of hookSets) {
        hooks.onAdd?.(entity, data);
      }
    },
    onRemove: (entity, data) => {
      for (const hooks of hookSets) {
        hooks.onRemove?.(entity, data);
      }
    },
    onSet: (entity, newData, prevData) => {
      for (const hooks of hookSets) {
        hooks.onSet?.(entity, newData, prevData);
      }
    },
  };
}
