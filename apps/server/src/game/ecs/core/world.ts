/**
 * World
 *
 * The main container that integrates all ECS modules.
 * Provides a unified API for entity/component management.
 */

import type { Entity, QueryDescriptor } from "../types";
import { CommandBuffer } from "./command-buffer";
import type { ComponentSchema } from "./component";
import { ComponentRegistry } from "./component-registry";
import { EntityManagerImpl } from "./entity-manager";
import type { Query } from "./query";
import { QueryCache } from "./query-cache";
import { ResourceRegistry } from "./resource";
import { SystemScheduler } from "./scheduler";

/**
 * The World class - main ECS container.
 */
export class World {
  public readonly entities: EntityManagerImpl;
  public readonly components: ComponentRegistry;
  public readonly systems: SystemScheduler;
  public readonly resources: ResourceRegistry;
  public readonly queryCache: QueryCache;
  public readonly commands: CommandBuffer;

  private currentTick = 0;

  constructor() {
    this.entities = new EntityManagerImpl();
    this.components = new ComponentRegistry();
    this.queryCache = new QueryCache(this.components, this.entities);
    this.systems = new SystemScheduler();
    this.resources = new ResourceRegistry();
    this.commands = new CommandBuffer();

    // Register currentTick as a resource
    this.resources.register("currentTick", 0);
  }

  // ============================================================================
  // Entity Management
  // ============================================================================

  /**
   * Creates a new entity.
   */
  spawn(): Entity {
    const entity = this.entities.spawn();
    this.queryCache.invalidateAll();
    return entity;
  }

  /**
   * Creates a new entity with components.
   */
  spawnWith(components: Record<string, unknown>): Entity {
    const entity = this.spawn();
    for (const [name, data] of Object.entries(components)) {
      this.addComponent(entity, name, data);
    }
    return entity;
  }

  /**
   * Destroys an entity and all its components.
   */
  despawn(entity: Entity): void {
    // Remove all components
    for (const schema of this.components.getAllSchemas()) {
      const store = this.components.getStore(schema.name);
      if (store.has(entity)) {
        store.remove(entity);
      }
    }

    this.entities.despawn(entity);
    this.queryCache.invalidateAll();
  }

  /**
   * Checks if an entity is alive.
   */
  isAlive(entity: Entity): boolean {
    return this.entities.isAlive(entity);
  }

  // ============================================================================
  // Component Management
  // ============================================================================

  /**
   * Registers a component type.
   */
  registerComponent<T>(schema: ComponentSchema<T>): void {
    this.components.register(schema);
  }

  /**
   * Adds a component to an entity.
   */
  addComponent<T>(entity: Entity, componentName: string, data: T): void {
    const store = this.components.getStore<T>(componentName);
    store.add(entity, data);
    this.queryCache.invalidateByComponent(componentName);
  }

  /**
   * Sets (adds or updates) a component on an entity.
   * Alias for addComponent for semantic clarity when updating existing components.
   */
  setComponent<T>(entity: Entity, componentName: string, data: T): void {
    this.addComponent(entity, componentName, data);
  }

  /**
   * Removes a component from an entity.
   */
  removeComponent(entity: Entity, componentName: string): void {
    const store = this.components.getStore(componentName);
    store.remove(entity);
    this.queryCache.invalidateByComponent(componentName);
  }

  /**
   * Gets a component from an entity.
   */
  getComponent<T>(entity: Entity, componentName: string): T | undefined {
    return this.components.getStore<T>(componentName).get(entity);
  }

  /**
   * Checks if an entity has a component.
   */
  hasComponent(entity: Entity, componentName: string): boolean {
    return this.components.getStore(componentName).has(entity);
  }

  // ============================================================================
  // Query System
  // ============================================================================

  /**
   * Creates or retrieves a cached query.
   */
  query(descriptor: QueryDescriptor): Query {
    return this.queryCache.get(descriptor);
  }

  // ============================================================================
  // Tick / Update Loop
  // ============================================================================

  /**
   * Advances the world by one tick.
   * Runs all systems and flushes the command buffer.
   */
  tick(): void {
    this.currentTick++;
    this.resources.set("currentTick", this.currentTick);

    // Run all systems
    this.systems.runAll(this);

    // Flush command buffer
    this.commands.flush(this);
  }

  /**
   * Returns the current tick count.
   */
  getCurrentTick(): number {
    return this.currentTick;
  }

  // ============================================================================
  // Lifecycle
  // ============================================================================

  /**
   * Initializes the world (call after registering all systems).
   */
  initialize(): void {
    this.systems.compile();
    this.systems.runInit(this);
  }

  /**
   * Resets the world to initial state.
   */
  reset(): void {
    this.entities.reset();
    this.components.clearAllData();
    this.queryCache.clear();
    this.commands.clear();
    this.currentTick = 0;
    this.resources.set("currentTick", 0);
  }

  /**
   * Completely clears the world (removes all registrations).
   */
  clear(): void {
    this.reset();
    this.components.reset();
    this.systems.clear();
    this.resources.clear();
    this.resources.register("currentTick", 0);
  }

  // ============================================================================
  // Statistics
  // ============================================================================

  /**
   * Returns world statistics.
   */
  getStats(): WorldStats {
    const queryStats = this.queryCache.getStats();

    return {
      entityCount: this.entities.getAliveCount(),
      componentTypeCount: this.components.getAllSchemas().length,
      systemCount: this.systems.getAllSystems().length,
      queryCount: queryStats.queryCount,
      currentTick: this.currentTick,
      pendingCommands: this.commands.getCommandCount(),
    };
  }
}

/**
 * World statistics interface.
 */
export interface WorldStats {
  entityCount: number;
  componentTypeCount: number;
  systemCount: number;
  queryCount: number;
  currentTick: number;
  pendingCommands: number;
}
