/**
 * Command Buffer
 *
 * Defers entity/component mutations to avoid issues during iteration.
 * Commands are queued and flushed between system phases.
 */

import type { Entity, PendingEntityId } from "../types";
import { NULL_ENTITY } from "./entity";
import type { World } from "./world";

/**
 * Discriminated union for all command types.
 * Each command type has exactly the fields it needs - no optionals.
 */
type Command =
  | { readonly type: "spawn"; readonly pendingId: PendingEntityId }
  | { readonly type: "despawn"; readonly entity: Entity }
  | {
      readonly type: "add_component";
      readonly entity: Entity;
      readonly componentName: string;
      readonly data: unknown;
    }
  | {
      readonly type: "add_component_pending";
      readonly pendingId: PendingEntityId;
      readonly componentName: string;
      readonly data: unknown;
    }
  | {
      readonly type: "remove_component";
      readonly entity: Entity;
      readonly componentName: string;
    }
  | {
      readonly type: "set_component";
      readonly entity: Entity;
      readonly componentName: string;
      readonly data: unknown;
    };

/**
 * Command Buffer for deferred entity/component operations.
 */
export class CommandBuffer {
  private commands: Command[] = [];
  private pendingEntities = new Map<PendingEntityId, Entity | null>();

  /**
   * Queues a spawn command.
   * Returns a PendingEntityId that will be resolved after flush().
   */
  spawn(): PendingEntityId {
    const pendingId = Symbol("pending-entity");
    this.pendingEntities.set(pendingId, null);
    this.commands.push({ type: "spawn", pendingId });
    return pendingId;
  }

  /**
   * Queues a spawn with components in one call.
   * Returns a PendingEntityId for referencing the entity before flush.
   */
  spawnWith(components: Record<string, unknown>): PendingEntityId {
    const pendingId = this.spawn();
    for (const [name, data] of Object.entries(components)) {
      this.addComponentToPending(pendingId, name, data);
    }
    return pendingId;
  }

  /**
   * Queues a despawn command.
   */
  despawn(entity: Entity): void {
    this.commands.push({ type: "despawn", entity });
  }

  /**
   * Queues an add component command for an existing entity.
   */
  addComponent<T>(entity: Entity, componentName: string, data: T): void {
    this.commands.push({
      type: "add_component",
      entity,
      componentName,
      data,
    });
  }

  /**
   * Queues an add component command for a pending entity.
   */
  addComponentToPending<T>(
    pendingId: PendingEntityId,
    componentName: string,
    data: T,
  ): void {
    this.commands.push({
      type: "add_component_pending",
      pendingId,
      componentName,
      data,
    });
  }

  /**
   * Queues a remove component command.
   */
  removeComponent(entity: Entity, componentName: string): void {
    this.commands.push({ type: "remove_component", entity, componentName });
  }

  /**
   * Queues a set (replace) component command.
   */
  setComponent<T>(entity: Entity, componentName: string, data: T): void {
    this.commands.push({
      type: "set_component",
      entity,
      componentName,
      data,
    });
  }

  /**
   * Executes all queued commands.
   * Returns a map of PendingEntityId -> actual Entity for spawned entities.
   */
  flush(world: World): Map<PendingEntityId, Entity> {
    const resolvedEntities = new Map<PendingEntityId, Entity>();
    const affectedComponents = new Set<string>();

    for (const command of this.commands) {
      switch (command.type) {
        case "spawn": {
          const realEntity = world.entities.spawn();
          resolvedEntities.set(command.pendingId, realEntity);
          this.pendingEntities.set(command.pendingId, realEntity);
          break;
        }

        case "despawn": {
          // Remove all components first
          for (const schema of world.components.getAllSchemas()) {
            const store = world.components.getStore(schema.name);
            if (store.has(command.entity)) {
              store.remove(command.entity);
              affectedComponents.add(schema.name);
            }
          }
          world.entities.despawn(command.entity);
          break;
        }

        case "add_component": {
          const store = world.components.getStore(command.componentName);
          store.add(command.entity, command.data);
          affectedComponents.add(command.componentName);
          break;
        }

        case "add_component_pending": {
          const entity = resolvedEntities.get(command.pendingId);
          if (entity === undefined || entity === NULL_ENTITY) {
            console.error(
              `[CommandBuffer] Cannot resolve pending entity for AddComponent "${command.componentName}"`,
            );
            continue;
          }
          const store = world.components.getStore(command.componentName);
          store.add(entity, command.data);
          affectedComponents.add(command.componentName);
          break;
        }

        case "remove_component": {
          const store = world.components.getStore(command.componentName);
          store.remove(command.entity);
          affectedComponents.add(command.componentName);
          break;
        }

        case "set_component": {
          const store = world.components.getStore(command.componentName);
          store.add(command.entity, command.data);
          affectedComponents.add(command.componentName);
          break;
        }
      }
    }

    // Invalidate affected queries
    if (affectedComponents.size > 0) {
      world.queryCache.invalidateByComponents(affectedComponents);
    }

    this.commands.length = 0;
    this.pendingEntities.clear();

    return resolvedEntities;
  }

  /**
   * Clears all queued commands without executing.
   */
  clear(): void {
    this.commands.length = 0;
    this.pendingEntities.clear();
  }

  /**
   * Returns the number of queued commands.
   */
  getCommandCount(): number {
    return this.commands.length;
  }

  /**
   * Checks if there are any queued commands.
   */
  isEmpty(): boolean {
    return this.commands.length === 0;
  }
}
