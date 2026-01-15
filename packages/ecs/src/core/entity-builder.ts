import type { ComponentClass, ComponentData, Entity } from "./types";
import type { World } from "./world";

interface PendingComponent {
  type: ComponentClass;
  data?: Record<string, number>;
}

/**
 * EntityBuilder provides a fluent API for batching structural changes.
 * Multiple add/remove operations are combined into a single archetype transition.
 *
 * @example
 * world.batch(entity)
 *   .add(Position, { x: 0, y: 0 })
 *   .add(Velocity, { vx: 1, vy: 1 })
 *   .add(Health, { current: 100 })
 *   .commit();  // Single archetype transition instead of 3
 */
export class EntityBuilder {
  private readonly world: World;
  private readonly entity: Entity;
  private readonly toAdd: PendingComponent[] = [];
  private readonly toRemove: ComponentClass[] = [];

  constructor(world: World, entity: Entity) {
    this.world = world;
    this.entity = entity;
  }

  /**
   * Queue a component to be added.
   */
  add<T>(
    componentType: ComponentClass<T>,
    data?: Partial<ComponentData<T>>,
  ): this {
    this.toAdd.push({
      type: componentType,
      data: data as Record<string, number>,
    });
    return this;
  }

  /**
   * Queue a component to be removed.
   */
  remove<T>(componentType: ComponentClass<T>): this {
    this.toRemove.push(componentType);
    return this;
  }

  /**
   * Apply all batched changes in a single archetype transition.
   */
  commit(): Entity {
    if (this.toAdd.length === 0 && this.toRemove.length === 0) {
      return this.entity;
    }

    return this.world._commitBatch(this.entity, this.toAdd, this.toRemove);
  }
}
