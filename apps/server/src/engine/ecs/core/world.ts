import { ComponentRegistry } from "./component-registry";
import { ComponentStore } from "./component-store";
import { EntityManager } from "./entity";
import { Resources } from "./resources";
import type { ComponentKey, ComponentType, EntityId } from "./types";

type ComponentStores = Map<ComponentKey, ComponentStore<any>>;

export class World {
  private readonly entities: EntityManager;
  private readonly components: ComponentStores;
  private readonly registry: ComponentRegistry;
  readonly resources: Resources;
  private tickCounter: number;

  constructor(initialEntityCapacity: number = 2048) {
    this.entities = new EntityManager(initialEntityCapacity);
    this.components = new Map();
    this.registry = new ComponentRegistry();
    this.resources = new Resources();
    this.tickCounter = 0;
  }

  get tick(): number {
    return this.tickCounter;
  }

  private getOrCreateStore<T>(type: ComponentType<T>): ComponentStore<T> {
    let s = this.components.get(type.key) as ComponentStore<T> | undefined;
    if (!s) {
      s = new ComponentStore<T>(
        () => this.tickCounter,
        this.entities.getCapacity(),
      );
      this.components.set(type.key, s);
    }
    return s;
  }

  getStore<T>(type: ComponentType<T>): ComponentStore<T> | undefined {
    return this.components.get(type.key) as ComponentStore<T> | undefined;
  }

  ensureStore<T>(type: ComponentType<T>): ComponentStore<T> {
    return this.getOrCreateStore(type);
  }

  createEntity(): EntityId {
    return this.entities.create();
  }

  destroyEntity(entity: EntityId): void {
    // Remove from all component stores
    for (const store of this.components.values()) store.remove(entity);
    this.entities.destroy(entity);
  }

  add<T>(entity: EntityId, type: ComponentType<T>, value: T): void {
    const store = this.getOrCreateStore(type);
    store.ensureSparseCapacity(this.entities.getCapacity());
    store.add(entity, value);
  }

  set<T>(
    entity: EntityId,
    type: ComponentType<T>,
    updater: (prev: T) => T,
  ): void {
    const store = this.getOrCreateStore(type);
    store.set(entity, updater);
  }

  remove<T>(entity: EntityId, type: ComponentType<T>): boolean {
    const store = this.getOrCreateStore(type);
    return store.remove(entity);
  }

  has<T>(entity: EntityId, type: ComponentType<T>): boolean {
    const store = this.getOrCreateStore(type);
    return store.has(entity);
  }

  get<T>(entity: EntityId, type: ComponentType<T>): T | undefined {
    const store = this.getOrCreateStore(type);
    return store.get(entity);
  }

  nextTick(): void {
    this.tickCounter++;
  }
}
