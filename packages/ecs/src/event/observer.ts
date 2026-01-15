import { getComponentMeta } from "../core/component";
import type { ComponentClass, ComponentData, Entity } from "../core/types";
import type { World } from "../core/world";

/**
 * Callback type for component observers.
 */
export type ObserverCallback<T> = (
  entity: Entity,
  newData: ComponentData<T>,
  oldData: ComponentData<T> | null,
) => void;

/**
 * An active observer subscription that can be cancelled.
 */
export interface ObserverSubscription {
  /** Unique identifier for this subscription */
  readonly id: number;
  /** Cancel this subscription */
  unsubscribe(): void;
}

interface StoredObserver<T = unknown> {
  id: number;
  componentIndex: number;
  callback: ObserverCallback<T>;
  event: "add" | "remove" | "set" | "all";
}

/**
 * Manages reactive observers for component changes.
 * Integrates with the hooks system to notify subscribers.
 *
 * @example
 * const observers = new ObserverManager();
 *
 * // Subscribe to Position changes
 * const sub = observers.onSet(Position, (entity, newPos, oldPos) => {
 *   console.log(`Entity ${entity} moved from ${oldPos.x},${oldPos.y} to ${newPos.x},${newPos.y}`);
 * });
 *
 * // Later, unsubscribe
 * sub.unsubscribe();
 */
export class ObserverManager {
  private observers: StoredObserver[] = [];
  private nextId = 0;

  /**
   * Subscribe to component additions.
   *
   * @example
   * observers.onAdd(Position, (entity, data) => {
   *   console.log(`Entity ${entity} got Position at ${data.x},${data.y}`);
   * });
   */
  onAdd<T>(
    componentType: ComponentClass<T>,
    callback: ObserverCallback<T>,
  ): ObserverSubscription {
    return this.subscribe(componentType, callback, "add");
  }

  /**
   * Subscribe to component removals.
   *
   * @example
   * observers.onRemove(Health, (entity, data) => {
   *   console.log(`Entity ${entity} lost Health component`);
   * });
   */
  onRemove<T>(
    componentType: ComponentClass<T>,
    callback: ObserverCallback<T>,
  ): ObserverSubscription {
    return this.subscribe(componentType, callback, "remove");
  }

  /**
   * Subscribe to component value changes (set operations).
   *
   * @example
   * observers.onSet(Position, (entity, newPos, oldPos) => {
   *   if (oldPos) {
   *     console.log(`Moved from ${oldPos.x},${oldPos.y} to ${newPos.x},${newPos.y}`);
   *   }
   * });
   */
  onSet<T>(
    componentType: ComponentClass<T>,
    callback: ObserverCallback<T>,
  ): ObserverSubscription {
    return this.subscribe(componentType, callback, "set");
  }

  /**
   * Subscribe to all component events (add, remove, set).
   *
   * @example
   * observers.onChange(Position, (entity, newData, oldData) => {
   *   // Called on add, remove, or set
   * });
   */
  onChange<T>(
    componentType: ComponentClass<T>,
    callback: ObserverCallback<T>,
  ): ObserverSubscription {
    return this.subscribe(componentType, callback, "all");
  }

  private subscribe<T>(
    componentType: ComponentClass<T>,
    callback: ObserverCallback<T>,
    event: "add" | "remove" | "set" | "all",
  ): ObserverSubscription {
    const meta = getComponentMeta(componentType);
    const id = this.nextId++;

    const observer: StoredObserver<T> = {
      id,
      componentIndex: meta.id.index,
      callback,
      event,
    };

    this.observers.push(observer as StoredObserver);

    return {
      id,
      unsubscribe: () => {
        const idx = this.observers.findIndex((o) => o.id === id);
        if (idx !== -1) {
          this.observers.splice(idx, 1);
        }
      },
    };
  }

  /**
   * Notify observers of a component addition.
   * @internal - Called by the hooks system
   */
  notifyAdd(entity: Entity, componentIndex: number, data: Record<string, number>): void {
    for (const observer of this.observers) {
      if (
        observer.componentIndex === componentIndex &&
        (observer.event === "add" || observer.event === "all")
      ) {
        observer.callback(entity, data as ComponentData<unknown>, null);
      }
    }
  }

  /**
   * Notify observers of a component removal.
   * @internal - Called by the hooks system
   */
  notifyRemove(entity: Entity, componentIndex: number, data: Record<string, number>): void {
    for (const observer of this.observers) {
      if (
        observer.componentIndex === componentIndex &&
        (observer.event === "remove" || observer.event === "all")
      ) {
        observer.callback(entity, data as ComponentData<unknown>, null);
      }
    }
  }

  /**
   * Notify observers of a component value change.
   * @internal - Called by the hooks system
   */
  notifySet(
    entity: Entity,
    componentIndex: number,
    newData: Record<string, number>,
    oldData: Record<string, number>,
  ): void {
    for (const observer of this.observers) {
      if (
        observer.componentIndex === componentIndex &&
        (observer.event === "set" || observer.event === "all")
      ) {
        observer.callback(
          entity,
          newData as ComponentData<unknown>,
          oldData as ComponentData<unknown>,
        );
      }
    }
  }

  /**
   * Clear all observers.
   */
  clear(): void {
    this.observers = [];
  }

  /**
   * Get the number of active observers.
   */
  get count(): number {
    return this.observers.length;
  }
}
