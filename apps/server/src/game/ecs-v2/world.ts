import {
  type Entity,
  type ComponentClass,
  type ComponentMeta,
  type ComponentData,
  NULL_ENTITY,
  MAX_ENTITIES,
  makeEntity,
  entityIndex,
  entityGeneration,
  ChangeFlag,
  Phase,
  FieldType,
} from "./types";
import { getComponentMeta } from "./component";
import { type Archetype, ArchetypeGraph } from "./archetype";
import { ResourceRegistry } from "./resource";
import { EventQueue, type GameEvent } from "./events";
import { QueryCache, type QueryDescriptor } from "./query-cache";
import { SystemScheduler } from "./scheduler";
import { HookRegistry } from "./hooks";
import { RelationStore } from "./relation-store";
import { StringPool, getStringPool } from "./string-pool";
import { EntityRefStore } from "./entity-ref-store";
import type { RelationType } from "./relation";
import type { System } from "./system";

type TypedArray =
  | Float32Array
  | Float64Array
  | Int8Array
  | Int16Array
  | Int32Array
  | Uint8Array
  | Uint16Array
  | Uint32Array;

interface EntityRecord {
  archetype: Archetype | null;
  row: number;
}

export class World {
  private readonly graph = new ArchetypeGraph();
  private readonly entityRecords: EntityRecord[];
  private readonly generations: Uint16Array;
  private readonly alive: Uint32Array;
  private readonly freeList: Uint32Array;
  private freeCount = 0;
  private nextIndex = 0;
  private entityCount = 0;
  private readonly maxEntities: number;

  readonly resources = new ResourceRegistry();
  readonly events = new EventQueue();
  readonly scheduler = new SystemScheduler();
  readonly hooks = new HookRegistry();
  readonly relations = new RelationStore();
  readonly strings: StringPool;
  readonly entityRefs = new EntityRefStore();
  private readonly queryCache: QueryCache;

  private tick = 0;

  constructor(maxEntities: number = MAX_ENTITIES, stringPool?: StringPool) {
    this.maxEntities = maxEntities;
    this.entityRecords = new Array(maxEntities);
    this.generations = new Uint16Array(maxEntities);
    this.alive = new Uint32Array(Math.ceil(maxEntities / 32));
    this.freeList = new Uint32Array(maxEntities);
    this.queryCache = new QueryCache(this.graph);
    this.strings = stringPool ?? getStringPool();

    for (let i = 0; i < maxEntities; i++) {
      this.entityRecords[i] = { archetype: null, row: -1 };
    }
  }

  spawn(...componentTypes: ComponentClass[]): Entity {
    const entity = this.allocateEntity();
    const index = entityIndex(entity);

    if (componentTypes.length > 0) {
      const archetype = this.graph.getOrCreateArchetype(componentTypes);
      const row = archetype.allocateRow(entity);

      for (const type of componentTypes) {
        const meta = getComponentMeta(type);
        const initData: Record<string, number> = {};
        if (!meta.isTag) {
          for (const field of meta.fields) {
            initData[field.name] = field.default;
          }
          archetype.setComponentData(row, meta.id.index, initData);
        }
        // Trigger onAdd hook (after component is fully initialized)
        this.hooks.triggerOnAdd(entity, meta.id.index, initData);
      }

      this.entityRecords[index] = { archetype, row };
    }

    return entity;
  }

  /**
   * Set of entities currently being despawned (for cycle detection in cascade delete).
   */
  private readonly beingDespawned = new Set<Entity>();

  despawn(entity: Entity): boolean {
    if (!this.isAlive(entity)) return false;

    // Cycle detection for cascade delete
    if (this.beingDespawned.has(entity)) return false;
    this.beingDespawned.add(entity);

    try {
      const index = entityIndex(entity);
      const record = this.entityRecords[index];

      if (record.archetype) {
        // Trigger onRemove hooks for all components BEFORE removal
        for (const type of record.archetype.componentTypes) {
          const meta = getComponentMeta(type);
          const componentData = this.getComponentDataRaw(
            record.archetype,
            record.row,
            meta,
          );
          this.hooks.triggerOnRemove(entity, meta.id.index, componentData);
        }

        const movedEntity = record.archetype.freeRow(record.row);

        if (movedEntity !== null) {
          const movedIndex = entityIndex(movedEntity);
          this.entityRecords[movedIndex].row = record.row;
        }
      }

      record.archetype = null;
      record.row = -1;

      // Remove relations and get cascade targets
      const { cascadeTargets } = this.relations.removeEntity(entity);

      // Clean up entity references:
      // 1. Remove refs FROM this entity (its outgoing refs)
      this.entityRefs.removeRefsFromSource(entity);
      // 2. Remove refs TO this entity (refs will become dangling/null on read)
      this.entityRefs.removeRefsToTarget(entity);

      this.freeEntity(entity);

      // Cascade delete (after entity is fully removed)
      for (const cascadeTarget of cascadeTargets) {
        this.despawn(cascadeTarget);
      }

      return true;
    } finally {
      this.beingDespawned.delete(entity);
    }
  }

  isAlive(entity: Entity): boolean {
    if (entity === NULL_ENTITY) return false;

    const index = entityIndex(entity);
    if (index >= this.nextIndex) return false;

    const gen = entityGeneration(entity);
    if (this.generations[index] !== gen) return false;

    const word = index >>> 5;
    const bit = index & 31;
    return (this.alive[word] & (1 << bit)) !== 0;
  }

  add<T>(
    entity: Entity,
    componentType: ComponentClass<T>,
    data?: Partial<ComponentData<T>>,
  ): void {
    if (!this.isAlive(entity)) return;

    const index = entityIndex(entity);
    const record = this.entityRecords[index];
    const meta = getComponentMeta(componentType);

    if (record.archetype?.hasComponent(meta.id.index)) {
      if (data && !meta.isTag) {
        // Component already exists - this is a set operation
        const previousData = this.getComponentDataRaw(
          record.archetype,
          record.row,
          meta,
        );
        record.archetype.setComponentData(
          record.row,
          meta.id.index,
          data as Record<string, number>,
        );
        // Trigger onSet hook
        this.hooks.triggerOnSet(
          entity,
          meta.id.index,
          data as Record<string, number>,
          previousData,
        );
      }
      return;
    }

    const oldArchetype = record.archetype;
    const oldRow = record.row;

    let newArchetype: Archetype;
    if (oldArchetype) {
      newArchetype = this.graph.getArchetypeWithAdded(
        oldArchetype,
        componentType,
      );
    } else {
      newArchetype = this.graph.getOrCreateArchetype([componentType]);
    }

    const newRow = newArchetype.allocateRow(entity);

    if (oldArchetype) {
      for (const oldType of oldArchetype.componentTypes) {
        const oldMeta = getComponentMeta(oldType);
        if (!oldMeta.isTag) {
          newArchetype.copyComponentDataFrom(
            newRow,
            oldArchetype,
            oldRow,
            oldMeta.id.index,
          );
        }
      }

      const movedEntity = oldArchetype.freeRow(oldRow);
      if (movedEntity !== null) {
        const movedIndex = entityIndex(movedEntity);
        this.entityRecords[movedIndex].row = oldRow;
      }
    }

    // Initialize component data
    const initData: Record<string, number> = {};
    if (!meta.isTag) {
      for (const field of meta.fields) {
        initData[field.name] =
          (data as Record<string, number>)?.[field.name] ?? field.default;
      }
      newArchetype.setComponentData(newRow, meta.id.index, initData);
    }

    this.entityRecords[index] = { archetype: newArchetype, row: newRow };

    // Trigger onAdd hook (after component is fully added)
    this.hooks.triggerOnAdd(entity, meta.id.index, initData);
  }

  remove<T>(entity: Entity, componentType: ComponentClass<T>): boolean {
    if (!this.isAlive(entity)) return false;

    const index = entityIndex(entity);
    const record = this.entityRecords[index];

    if (!record.archetype) return false;

    const meta = getComponentMeta(componentType);
    if (!record.archetype.hasComponent(meta.id.index)) return false;

    // Get component data BEFORE removing for the hook
    const componentData = this.getComponentDataRaw(
      record.archetype,
      record.row,
      meta,
    );

    // Trigger onRemove hook BEFORE component is removed
    this.hooks.triggerOnRemove(entity, meta.id.index, componentData);

    const newArchetype = this.graph.getArchetypeWithRemoved(
      record.archetype,
      componentType,
    );
    const oldArchetype = record.archetype;
    const oldRow = record.row;

    if (!newArchetype) {
      const movedEntity = oldArchetype.freeRow(oldRow);
      if (movedEntity !== null) {
        const movedIndex = entityIndex(movedEntity);
        this.entityRecords[movedIndex].row = oldRow;
      }
      this.entityRecords[index] = { archetype: null, row: -1 };
      return true;
    }

    const newRow = newArchetype.allocateRow(entity);

    for (const type of newArchetype.componentTypes) {
      const typeMeta = getComponentMeta(type);
      if (!typeMeta.isTag) {
        newArchetype.copyComponentDataFrom(
          newRow,
          oldArchetype,
          oldRow,
          typeMeta.id.index,
        );
      }
    }

    const movedEntity = oldArchetype.freeRow(oldRow);
    if (movedEntity !== null) {
      const movedIndex = entityIndex(movedEntity);
      this.entityRecords[movedIndex].row = oldRow;
    }

    this.entityRecords[index] = { archetype: newArchetype, row: newRow };
    return true;
  }

  has<T>(entity: Entity, componentType: ComponentClass<T>): boolean {
    if (!this.isAlive(entity)) return false;

    const index = entityIndex(entity);
    const record = this.entityRecords[index];

    if (!record.archetype) return false;

    const meta = getComponentMeta(componentType);
    return record.archetype.hasComponent(meta.id.index);
  }

  get<T>(
    entity: Entity,
    componentType: ComponentClass<T>,
  ): ComponentData<T> | null {
    if (!this.isAlive(entity)) return null;

    const index = entityIndex(entity);
    const record = this.entityRecords[index];

    if (!record.archetype) return null;

    const meta = getComponentMeta(componentType);
    if (!record.archetype.hasComponent(meta.id.index)) return null;

    if (meta.isTag) return {} as ComponentData<T>;

    const result: Record<string, number> = {};
    for (const field of meta.fields) {
      const value = record.archetype.getFieldValue(
        record.row,
        meta.id.index,
        field.name,
      );
      if (value !== undefined) {
        result[field.name] = value;
      }
    }
    return result as ComponentData<T>;
  }

  set<T>(
    entity: Entity,
    componentType: ComponentClass<T>,
    data: Partial<ComponentData<T>>,
  ): void {
    if (!this.isAlive(entity)) return;

    const index = entityIndex(entity);
    const record = this.entityRecords[index];

    if (!record.archetype) return;

    const meta = getComponentMeta(componentType);
    if (!record.archetype.hasComponent(meta.id.index)) return;

    if (!meta.isTag) {
      // Get previous data for hook
      const previousData = this.getComponentDataRaw(
        record.archetype,
        record.row,
        meta,
      );

      record.archetype.setComponentData(
        record.row,
        meta.id.index,
        data as Record<string, number>,
      );

      // Trigger onSet hook after data is updated
      this.hooks.triggerOnSet(
        entity,
        meta.id.index,
        data as Record<string, number>,
        previousData,
      );
    }
  }

  /**
   * Internal helper to get raw component data from archetype.
   */
  private getComponentDataRaw(
    archetype: Archetype,
    row: number,
    meta: ComponentMeta,
  ): Record<string, number> {
    if (meta.isTag) return {};

    const result: Record<string, number> = {};
    for (const field of meta.fields) {
      const value = archetype.getFieldValue(row, meta.id.index, field.name);
      if (value !== undefined) {
        result[field.name] = value;
      }
    }
    return result;
  }

  // ==========================================================================
  // String Field Helpers
  // ==========================================================================

  /**
   * Get a string field value from a component.
   * String fields are stored as indices into the string pool.
   *
   * @example
   * const name = world.getString(entity, Item, "name");
   */
  getString<T>(
    entity: Entity,
    componentType: ComponentClass<T>,
    fieldName: keyof T & string,
  ): string | null {
    if (!this.isAlive(entity)) return null;

    const index = entityIndex(entity);
    const record = this.entityRecords[index];

    if (!record.archetype) return null;

    const meta = getComponentMeta(componentType);
    if (!record.archetype.hasComponent(meta.id.index)) return null;

    // Verify the field is a string type
    const field = meta.fields.find((f) => f.name === fieldName);
    if (!field || field.type !== FieldType.String) {
      return null;
    }

    const stringIndex = record.archetype.getFieldValue(
      record.row,
      meta.id.index,
      fieldName,
    );

    if (stringIndex === undefined) return null;

    return this.strings.get(stringIndex);
  }

  /**
   * Set a string field value on a component.
   * The string is interned in the string pool and stored as an index.
   *
   * @example
   * world.setString(entity, Item, "name", "Sword of Destiny");
   */
  setString<T>(
    entity: Entity,
    componentType: ComponentClass<T>,
    fieldName: keyof T & string,
    value: string,
  ): boolean {
    if (!this.isAlive(entity)) return false;

    const index = entityIndex(entity);
    const record = this.entityRecords[index];

    if (!record.archetype) return false;

    const meta = getComponentMeta(componentType);
    if (!record.archetype.hasComponent(meta.id.index)) return false;

    // Verify the field is a string type
    const field = meta.fields.find((f) => f.name === fieldName);
    if (!field || field.type !== FieldType.String) {
      return false;
    }

    // Intern the string and get its index
    const stringIndex = this.strings.intern(value);

    // Set the field value (as the string index)
    record.archetype.setFieldValue(
      record.row,
      meta.id.index,
      fieldName,
      stringIndex,
    );

    return true;
  }

  // ==========================================================================
  // Entity Reference Helpers
  // ==========================================================================

  /**
   * Get an entity reference field value from a component.
   * Returns null if the referenced entity is dead (validated reference).
   *
   * @example
   * const target = world.getEntityRef(entity, Targeting, "target");
   * if (target !== null) {
   *   // Target is alive
   * }
   */
  getEntityRef<T>(
    entity: Entity,
    componentType: ComponentClass<T>,
    fieldName: keyof T & string,
  ): Entity | null {
    if (!this.isAlive(entity)) return null;

    const index = entityIndex(entity);
    const record = this.entityRecords[index];

    if (!record.archetype) return null;

    const meta = getComponentMeta(componentType);
    if (!record.archetype.hasComponent(meta.id.index)) return null;

    // Verify the field is an entity type
    const field = meta.fields.find((f) => f.name === fieldName);
    if (!field || field.type !== FieldType.Entity) {
      return null;
    }

    const refValue = record.archetype.getFieldValue(
      record.row,
      meta.id.index,
      fieldName,
    );

    if (refValue === undefined || refValue === NULL_ENTITY) return null;

    const ref = refValue as Entity;

    // Validate that the referenced entity is still alive
    if (!this.isAlive(ref)) {
      return null;
    }

    return ref;
  }

  /**
   * Get an entity reference field value WITHOUT validation.
   * Returns the raw stored value even if the referenced entity is dead.
   * Useful for debugging or manual validation.
   */
  getEntityRefRaw<T>(
    entity: Entity,
    componentType: ComponentClass<T>,
    fieldName: keyof T & string,
  ): Entity | null {
    if (!this.isAlive(entity)) return null;

    const index = entityIndex(entity);
    const record = this.entityRecords[index];

    if (!record.archetype) return null;

    const meta = getComponentMeta(componentType);
    if (!record.archetype.hasComponent(meta.id.index)) return null;

    const field = meta.fields.find((f) => f.name === fieldName);
    if (!field || field.type !== FieldType.Entity) {
      return null;
    }

    const refValue = record.archetype.getFieldValue(
      record.row,
      meta.id.index,
      fieldName,
    );

    if (refValue === undefined) return null;
    return refValue as Entity;
  }

  /**
   * Set an entity reference field value on a component.
   * The reference is tracked for automatic validation and optional nullification.
   *
   * @example
   * world.setEntityRef(entity, Targeting, "target", enemy);
   */
  setEntityRef<T>(
    entity: Entity,
    componentType: ComponentClass<T>,
    fieldName: keyof T & string,
    target: Entity,
  ): boolean {
    if (!this.isAlive(entity)) return false;

    const index = entityIndex(entity);
    const record = this.entityRecords[index];

    if (!record.archetype) return false;

    const meta = getComponentMeta(componentType);
    if (!record.archetype.hasComponent(meta.id.index)) return false;

    // Verify the field is an entity type
    const field = meta.fields.find((f) => f.name === fieldName);
    if (!field || field.type !== FieldType.Entity) {
      return false;
    }

    // Track the reference for validation
    this.entityRefs.trackRef(entity, meta.id.index, fieldName, target);

    // Set the field value
    record.archetype.setFieldValue(record.row, meta.id.index, fieldName, target);

    return true;
  }

  /**
   * Nullify all entity references pointing to a target entity.
   * This is called automatically during despawn when autoNullifyRefs is enabled.
   *
   * @returns The number of references that were nullified.
   */
  nullifyRefsTo(target: Entity): number {
    const refs = this.entityRefs.removeRefsToTarget(target);

    for (const ref of refs) {
      if (!this.isAlive(ref.source)) continue;

      const sourceIdx = entityIndex(ref.source);
      const record = this.entityRecords[sourceIdx];

      if (!record.archetype) continue;

      // Set the field to NULL_ENTITY
      record.archetype.setFieldValue(
        record.row,
        ref.componentIndex,
        ref.fieldName,
        NULL_ENTITY,
      );
    }

    return refs.length;
  }

  query(...componentTypes: ComponentClass[]): QueryBuilder {
    return new QueryBuilder(this.graph, this.queryCache, componentTypes);
  }

  emit(event: GameEvent): void {
    this.events.emit(event);
  }

  setResource<T>(type: new (...args: unknown[]) => T, value: T): void {
    this.resources.setByType(type, value);
  }

  getResource<T>(type: new (...args: unknown[]) => T): T | null {
    return this.resources.getByType(type);
  }

  hasResource<T>(type: new (...args: unknown[]) => T): boolean {
    return this.resources.hasByType(type);
  }

  addSystem(system: System): void {
    this.scheduler.register(system);
  }

  runTick(): void {
    this.scheduler.runAll(this);
    this.events.flush();
    this.graph.clearAllChangeFlags();
    this.tick++;
  }

  getCurrentTick(): number {
    return this.tick;
  }

  getEntityCount(): number {
    return this.entityCount;
  }

  getArchetypeCount(): number {
    return this.graph.getAllArchetypes().length;
  }

  getChangedEntities(sinceTick: number): Entity[] {
    const changed: Entity[] = [];
    for (const archetype of this.graph.getAllArchetypes()) {
      if (archetype.version <= sinceTick) continue;

      const flags = archetype.getChangeFlags();
      for (let row = 0; row < archetype.count; row++) {
        if (flags[row] !== ChangeFlag.None) {
          changed.push(archetype.getEntity(row));
        }
      }
    }
    return changed;
  }

  getArchetypesChangedSince(sinceTick: number): Archetype[] {
    const changed: Archetype[] = [];
    for (const archetype of this.graph.getAllArchetypes()) {
      if (archetype.version > sinceTick) {
        changed.push(archetype);
      }
    }
    return changed;
  }

  // ==========================================================================
  // Relations API
  // ==========================================================================

  /**
   * Create a relation between two entities.
   *
   * @example
   * // Parent-child relationship
   * world.relate(child, ChildOf, parent);
   *
   * // With relation data
   * world.relate(sword, EquippedIn, player, { slot: "mainHand" });
   */
  relate<T>(
    source: Entity,
    relation: RelationType<T>,
    target: Entity,
    data?: T,
  ): boolean {
    if (!this.isAlive(source) || !this.isAlive(target)) {
      return false;
    }

    // Register relation type for cascade delete handling
    this.relations.registerRelationType(relation);

    return this.relations.add(source, relation, target, data);
  }

  /**
   * Remove a relation between two entities.
   */
  unrelate<T>(
    source: Entity,
    relation: RelationType<T>,
    target: Entity,
  ): boolean {
    return this.relations.remove(source, relation, target);
  }

  /**
   * Check if a relation exists between two entities.
   */
  hasRelation<T>(
    source: Entity,
    relation: RelationType<T>,
    target: Entity,
  ): boolean {
    return this.relations.has(source, relation, target);
  }

  /**
   * Get the single target of an exclusive relation.
   *
   * @example
   * const parent = world.getTarget(child, ChildOf);
   */
  getTarget<T>(source: Entity, relation: RelationType<T>): Entity | null {
    return this.relations.getTarget(source, relation);
  }

  /**
   * Get all targets of a relation.
   *
   * @example
   * const items = world.getTargets(player, Contains);
   */
  getTargets<T>(source: Entity, relation: RelationType<T>): Entity[] {
    return this.relations.getTargets(source, relation);
  }

  /**
   * Get all sources that have a relation to a target.
   *
   * @example
   * const children = world.getSources(parent, ChildOf);
   */
  getSources<T>(target: Entity, relation: RelationType<T>): Entity[] {
    return this.relations.getSources(target, relation);
  }

  /**
   * Get the data associated with a relation.
   *
   * @example
   * const equipData = world.getRelationData(sword, EquippedIn, player);
   * console.log(equipData?.slot); // "mainHand"
   */
  getRelationData<T>(
    source: Entity,
    relation: RelationType<T>,
    target: Entity,
  ): T | undefined {
    return this.relations.getData(source, relation, target);
  }

  /**
   * Set the data associated with a relation.
   * The relation must already exist.
   */
  setRelationData<T>(
    source: Entity,
    relation: RelationType<T>,
    target: Entity,
    data: T,
  ): boolean {
    return this.relations.setData(source, relation, target, data);
  }

  /**
   * Despawn an entity and all its descendants (via cascadeDelete relations).
   * Same as despawn() but more explicit about intent.
   */
  despawnHierarchy(entity: Entity): boolean {
    return this.despawn(entity);
  }

  /**
   * Despawn all children of an entity without despawning the entity itself.
   */
  despawnChildren<T>(entity: Entity, relation: RelationType<T>): number {
    const children = this.getSources(entity, relation);
    let count = 0;
    for (const child of children) {
      if (this.despawn(child)) {
        count++;
      }
    }
    return count;
  }

  private allocateEntity(): Entity {
    let index: number;
    let gen: number;

    if (this.freeCount > 0) {
      index = this.freeList[--this.freeCount];
      gen = this.generations[index];
    } else {
      if (this.nextIndex >= this.maxEntities) {
        throw new Error(`Entity limit exceeded: ${this.maxEntities}`);
      }
      index = this.nextIndex++;
      gen = 0;
    }

    const word = index >>> 5;
    const bit = index & 31;
    this.alive[word] |= 1 << bit;
    this.entityCount++;

    return makeEntity(index, gen);
  }

  private freeEntity(entity: Entity): void {
    const index = entityIndex(entity);

    const word = index >>> 5;
    const bit = index & 31;
    this.alive[word] &= ~(1 << bit);

    this.generations[index] = (this.generations[index] + 1) & 0xfff;
    this.freeList[this.freeCount++] = index;
    this.entityCount--;
  }
}

/**
 * Filter predicate for `.where()` queries.
 * Receives the component data for an entity and returns true to include it.
 */
export type QueryFilter<T> = (data: ComponentData<T>) => boolean;

interface StoredFilter {
  meta: ComponentMeta;
  predicate: QueryFilter<unknown>;
}

export class QueryBuilder {
  private readonly withMask: bigint;
  private withoutMask: bigint = 0n;
  private changeFilter: ChangeFlag = ChangeFlag.None;
  // Per-component change detection: mask of component indices to check for changes
  private changedComponentMask: bigint = 0n;
  private readonly componentMetas: ComponentMeta[];
  private readonly filters: StoredFilter[] = [];

  constructor(
    private readonly graph: ArchetypeGraph,
    private readonly cache: QueryCache,
    componentTypes: ComponentClass[],
  ) {
    let mask = 0n;
    this.componentMetas = [];

    for (const type of componentTypes) {
      const meta = getComponentMeta(type);
      mask |= 1n << BigInt(meta.id.index);
      this.componentMetas.push(meta);
    }

    this.withMask = mask;
  }

  not(...componentTypes: ComponentClass[]): QueryBuilder {
    for (const type of componentTypes) {
      const meta = getComponentMeta(type);
      this.withoutMask |= 1n << BigInt(meta.id.index);
    }
    return this;
  }

  added(): QueryBuilder {
    this.changeFilter = ChangeFlag.Added;
    return this;
  }

  modified(): QueryBuilder {
    this.changeFilter = ChangeFlag.Modified;
    return this;
  }

  /**
   * Filter to entities where ANY queried component has changed (added or modified).
   * If no arguments: filters by any change to any component in the query.
   */
  changed(): QueryBuilder {
    this.changeFilter = ChangeFlag.Added | ChangeFlag.Modified;
    return this;
  }

  /**
   * Filter to entities where the SPECIFIC component(s) have changed.
   * More efficient than changed() when you only care about specific components.
   *
   * @example
   * // Only process entities where Position specifically changed
   * world.query(Position, Velocity).changedComponent(Position).run(...)
   */
  changedComponent(...componentTypes: ComponentClass[]): QueryBuilder {
    this.changeFilter = ChangeFlag.Added | ChangeFlag.Modified;
    for (const type of componentTypes) {
      const meta = getComponentMeta(type);
      this.changedComponentMask |= 1n << BigInt(meta.id.index);
    }
    return this;
  }

  /**
   * Add a filter predicate to the query.
   * Only entities where the predicate returns true will be included.
   *
   * @example
   * // Filter by position
   * world.query(Position, Velocity)
   *   .where(Position, p => p.x > 0 && p.y > 0)
   *   .run(view => { ... });
   *
   * @example
   * // Multiple filters
   * world.query(Health, Position)
   *   .where(Health, h => h.current > 0)
   *   .where(Position, p => p.x < 100)
   *   .run(view => { ... });
   */
  where<T>(
    componentType: ComponentClass<T>,
    predicate: QueryFilter<T>,
  ): QueryBuilder {
    const meta = getComponentMeta(componentType);
    this.filters.push({
      meta,
      predicate: predicate as QueryFilter<unknown>,
    });
    return this;
  }

  /**
   * Check if an entity at the given row passes all filters.
   */
  private passesFilters(archetype: Archetype, row: number): boolean {
    if (this.filters.length === 0) return true;

    for (const filter of this.filters) {
      // Build component data for this entity
      const data: Record<string, number> = {};
      for (const field of filter.meta.fields) {
        const value = archetype.getFieldValue(
          row,
          filter.meta.id.index,
          field.name,
        );
        if (value !== undefined) {
          data[field.name] = value;
        }
      }

      if (!filter.predicate(data)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Check if an entity passes change filters.
   */
  private passesChangeFilter(archetype: Archetype, row: number): boolean {
    if (this.changeFilter === ChangeFlag.None) return true;

    const entityFlag = archetype.getChangeFlag(row);
    if ((entityFlag & this.changeFilter) === 0) return false;

    if (this.changedComponentMask !== 0n) {
      return archetype.hasAnyComponentChanged(row, this.changedComponentMask);
    }

    return true;
  }

  run(callback: (view: ArchetypeView) => void): void {
    const descriptor: QueryDescriptor = {
      withMask: this.withMask,
      withoutMask: this.withoutMask,
    };
    const archetypes = this.cache.resolve(descriptor);

    for (const archetype of archetypes) {
      if (archetype.count === 0) continue;

      const view = new ArchetypeView(
        archetype,
        this.componentMetas,
        this.changeFilter,
        this.changedComponentMask,
        this.filters,
      );

      if (view.count > 0) {
        callback(view);
      }
    }
  }

  /**
   * Iterate over all entities matching the query.
   * This is useful when you need to access entity IDs directly.
   *
   * @example
   * for (const entity of world.query(Position).where(Position, p => p.x > 0).iter()) {
   *   console.log(entity);
   * }
   */
  *iter(): Generator<Entity> {
    const descriptor: QueryDescriptor = {
      withMask: this.withMask,
      withoutMask: this.withoutMask,
    };
    const archetypes = this.cache.resolve(descriptor);

    for (const archetype of archetypes) {
      for (let i = 0; i < archetype.count; i++) {
        if (!this.passesChangeFilter(archetype, i)) continue;
        if (!this.passesFilters(archetype, i)) continue;
        yield archetype.getEntity(i);
      }
    }
  }

  /**
   * Collect all entities matching the query into an array.
   */
  collect(): Entity[] {
    return [...this.iter()];
  }

  count(): number {
    const descriptor: QueryDescriptor = {
      withMask: this.withMask,
      withoutMask: this.withoutMask,
    };
    const archetypes = this.cache.resolve(descriptor);

    // Fast path: no filters and no change detection
    if (
      this.filters.length === 0 &&
      this.changeFilter === ChangeFlag.None
    ) {
      let total = 0;
      for (const archetype of archetypes) {
        total += archetype.count;
      }
      return total;
    }

    // Slow path: need to check each entity
    let total = 0;
    for (const archetype of archetypes) {
      for (let i = 0; i < archetype.count; i++) {
        if (!this.passesChangeFilter(archetype, i)) continue;
        if (!this.passesFilters(archetype, i)) continue;
        total++;
      }
    }
    return total;
  }

  first(): Entity | null {
    const descriptor: QueryDescriptor = {
      withMask: this.withMask,
      withoutMask: this.withoutMask,
    };
    const archetypes = this.cache.resolve(descriptor);

    // Fast path: no filters and no change detection
    if (
      this.filters.length === 0 &&
      this.changeFilter === ChangeFlag.None
    ) {
      for (const archetype of archetypes) {
        if (archetype.count > 0) {
          return archetype.getEntity(0);
        }
      }
      return null;
    }

    // Slow path: need to check each entity
    for (const archetype of archetypes) {
      for (let i = 0; i < archetype.count; i++) {
        if (!this.passesChangeFilter(archetype, i)) continue;
        if (!this.passesFilters(archetype, i)) continue;
        return archetype.getEntity(i);
      }
    }

    return null;
  }
}

export class ArchetypeView {
  readonly count: number;
  private readonly archetype: Archetype;
  private readonly componentMetas: ComponentMeta[];
  private readonly changeFilter: ChangeFlag;
  private readonly changedComponentMask: bigint;
  private readonly metaByClass = new Map<ComponentClass, ComponentMeta>();
  private readonly filters: StoredFilter[];
  /** Indices of entities that pass all filters (lazily computed) */
  private _filteredIndices: number[] | null = null;

  constructor(
    archetype: Archetype,
    componentMetas: ComponentMeta[],
    changeFilter: ChangeFlag,
    changedComponentMask: bigint = 0n,
    filters: StoredFilter[] = [],
  ) {
    this.archetype = archetype;
    this.componentMetas = componentMetas;
    this.changeFilter = changeFilter;
    this.changedComponentMask = changedComponentMask;
    this.filters = filters;

    // Fast path: no filters and no change detection
    if (filters.length === 0 && changeFilter === ChangeFlag.None) {
      this.count = archetype.count;
      return;
    }

    // Slow path: need to check each entity
    let count = 0;
    for (let i = 0; i < archetype.count; i++) {
      if (!this.passesChangeFilter(i)) continue;
      if (!this.passesFilters(i)) continue;
      count++;
    }
    this.count = count;
  }

  private passesChangeFilter(row: number): boolean {
    if (this.changeFilter === ChangeFlag.None) return true;

    const entityFlag = this.archetype.getChangeFlag(row);
    if ((entityFlag & this.changeFilter) === 0) return false;

    if (this.changedComponentMask !== 0n) {
      return this.archetype.hasAnyComponentChanged(
        row,
        this.changedComponentMask,
      );
    }

    return true;
  }

  private passesFilters(row: number): boolean {
    if (this.filters.length === 0) return true;

    for (const filter of this.filters) {
      const data: Record<string, number> = {};
      for (const field of filter.meta.fields) {
        const value = this.archetype.getFieldValue(
          row,
          filter.meta.id.index,
          field.name,
        );
        if (value !== undefined) {
          data[field.name] = value;
        }
      }

      if (!filter.predicate(data)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Get the filtered row indices (lazy computation).
   */
  private getFilteredIndices(): number[] {
    if (this._filteredIndices !== null) {
      return this._filteredIndices;
    }

    // Fast path: no filtering needed
    if (this.filters.length === 0 && this.changeFilter === ChangeFlag.None) {
      this._filteredIndices = [];
      for (let i = 0; i < this.archetype.count; i++) {
        this._filteredIndices.push(i);
      }
      return this._filteredIndices;
    }

    // Slow path: build filtered indices
    this._filteredIndices = [];
    for (let i = 0; i < this.archetype.count; i++) {
      if (!this.passesChangeFilter(i)) continue;
      if (!this.passesFilters(i)) continue;
      this._filteredIndices.push(i);
    }

    return this._filteredIndices;
  }

  /**
   * Iterate over filtered entity rows.
   */
  *iterRows(): Generator<number> {
    const indices = this.getFilteredIndices();
    for (const idx of indices) {
      yield idx;
    }
  }

  /**
   * Iterate over filtered entities.
   */
  *iter(): Generator<Entity> {
    for (const row of this.iterRows()) {
      yield this.archetype.getEntity(row);
    }
  }

  column<T>(
    componentType: ComponentClass<T>,
    fieldName: keyof T & string,
  ): TypedArray {
    let meta = this.metaByClass.get(componentType);
    if (!meta) {
      meta = getComponentMeta(componentType);
      this.metaByClass.set(componentType, meta);
    }

    const col = this.archetype.column(meta.id.index, fieldName);
    if (!col) {
      throw new Error(`Column not found: ${meta.id.name}.${fieldName}`);
    }
    return col;
  }

  entity(row: number): Entity {
    return this.archetype.getEntity(row);
  }

  entities(): Uint32Array {
    return this.archetype.getEntityIndices();
  }

  getChangeFlag(row: number): ChangeFlag {
    return this.archetype.getChangeFlag(row);
  }

  /**
   * Get the per-component change flags for an entity at the given row.
   */
  getComponentChangeFlag(row: number): bigint {
    return this.archetype.getComponentChangeFlag(row);
  }

  /**
   * Check if a specific component changed for an entity at the given row.
   */
  hasComponentChanged<T>(row: number, componentType: ComponentClass<T>): boolean {
    const meta = getComponentMeta(componentType);
    return this.archetype.hasComponentChanged(row, meta.id.index);
  }

  hasChangeFilter(): boolean {
    return this.changeFilter !== ChangeFlag.None;
  }

  hasComponentChangeFilter(): boolean {
    return this.changedComponentMask !== 0n;
  }

  matchesChangeFilter(row: number): boolean {
    if (this.changeFilter === ChangeFlag.None) return true;

    const entityFlag = this.archetype.getChangeFlag(row);
    if ((entityFlag & this.changeFilter) === 0) return false;

    if (this.changedComponentMask !== 0n) {
      return this.archetype.hasAnyComponentChanged(row, this.changedComponentMask);
    }

    return true;
  }

  rawCount(): number {
    return this.archetype.count;
  }
}
