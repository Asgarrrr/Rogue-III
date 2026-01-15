import { EventQueue, type GameEvent } from "../event/events";
import { ObserverManager } from "../event/observer";
import { QueryCache, type QueryDescriptor } from "../query";
import { EntityRefStore } from "../relationship/entity-ref-store";
import type { RelationType, Wildcard } from "../relationship/relation";
import { isWildcard } from "../relationship/relation";
import { RelationStore } from "../relationship/relation-store";
import { SystemScheduler } from "../schedule/scheduler";
import type { System } from "../schedule/system";
import { ResourceRegistry } from "../storage/resource";
import { getStringPool, type StringPool } from "../storage/string-pool";
import { type Archetype, ArchetypeGraph } from "./archetype";
import { getComponentMeta } from "./component";
import { EntityBuilder } from "./entity-builder";
import {
  ChangeFlag,
  type ComponentClass,
  type ComponentData,
  ComponentMask,
  type ComponentMeta,
  type Entity,
  entityGeneration,
  entityIndex,
  FieldType,
  MAX_ENTITIES,
  makeEntity,
  NULL_ENTITY,
} from "./types";

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
  readonly observers = new ObserverManager();
  readonly relations = new RelationStore();
  readonly strings: StringPool;
  readonly entityRefs = new EntityRefStore();
  private readonly queryCache: QueryCache;
  private readonly viewPool = new ViewPool();

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

  // ==========================================================================
  // Private Helpers
  // ==========================================================================

  /**
   * Initialize components on an entity with default values and notify observers.
   * Used by spawn, spawnWithId, and add methods.
   */
  private initializeComponent(
    entity: Entity,
    archetype: Archetype,
    row: number,
    meta: ComponentMeta,
    data?: Record<string, number>,
  ): void {
    const initData: Record<string, number> = {};
    if (!meta.isTag) {
      for (const field of meta.fields) {
        initData[field.name] = data?.[field.name] ?? field.default;
      }
      archetype.setComponentData(row, meta.id.index, initData);
      this.trackStringRefs(meta, initData);
    }
    this.observers.notifyAdd(entity, meta.id.index, initData);
  }

  /**
   * Track string references for a component's string fields.
   */
  private trackStringRefs(
    meta: ComponentMeta,
    data: Record<string, number>,
  ): void {
    for (const field of meta.fields) {
      if (field.type === FieldType.String) {
        const idx = data[field.name];
        if (idx !== undefined && idx > 0) {
          this.strings.addRef(idx);
        }
      }
    }
  }

  /**
   * Release string references for a component's string fields.
   */
  private releaseStringRefs(
    archetype: Archetype,
    row: number,
    meta: ComponentMeta,
  ): void {
    if (meta.isTag) return;
    for (const field of meta.fields) {
      if (field.type === FieldType.String) {
        const idx = archetype.getFieldValue(row, meta.id.index, field.name);
        if (idx !== undefined && idx > 0) {
          this.strings.releaseRef(idx);
        }
      }
    }
  }

  /**
   * Get entity record if entity is alive.
   */
  private getRecord(entity: Entity): EntityRecord | null {
    if (!this.isAlive(entity)) return null;
    return this.entityRecords[entityIndex(entity)]!;
  }

  /**
   * Validate a field is of string type.
   */
  private validateStringField(
    meta: ComponentMeta,
    fieldName: string,
  ): { name: string; type: number; default: number } | null {
    const field = meta.fields.find((f) => f.name === fieldName);
    return field?.type === FieldType.String ? field : null;
  }

  /**
   * Validate a field is of entity reference type.
   */
  private validateEntityRefField(
    meta: ComponentMeta,
    fieldName: string,
  ): { name: string; type: number; default: number } | null {
    const field = meta.fields.find((f) => f.name === fieldName);
    return field?.type === FieldType.Entity ? field : null;
  }

  // ==========================================================================
  // Entity Lifecycle
  // ==========================================================================

  /** Create a new entity with the given components. */
  spawn(...componentTypes: ComponentClass[]): Entity {
    const entity = this.allocateEntity();
    const index = entityIndex(entity);

    if (componentTypes.length > 0) {
      const archetype = this.graph.getOrCreateArchetype(componentTypes);
      const row = archetype.allocateRow(entity);

      for (const type of componentTypes) {
        this.initializeComponent(entity, archetype, row, getComponentMeta(type));
      }

      this.entityRecords[index] = { archetype, row };
    }

    return entity;
  }

  /**
   * Spawn an entity with a specific ID. Useful for save/load to preserve entity references.
   *
   * @param targetEntity - The exact entity ID to spawn (including generation)
   * @param componentTypes - Components to add to the entity
   * @returns The entity ID (same as targetEntity)
   * @throws Error if the entity slot is already in use or generation is invalid
   *
   * @example
   * // Restore entities from a save file
   * const savedEntity = 0x00100001 as Entity; // index=1, gen=1
   * world.spawnWithId(savedEntity, Position, Health);
   */
  spawnWithId(targetEntity: Entity, ...componentTypes: ComponentClass[]): Entity {
    const targetIndex = entityIndex(targetEntity);
    const targetGen = entityGeneration(targetEntity);

    // Validate index is in valid range
    if (targetIndex >= this.maxEntities) {
      throw new Error(
        `Cannot spawn entity with index ${targetIndex}: exceeds max entities ${this.maxEntities}`,
      );
    }

    // Check if slot is already in use
    const word = targetIndex >>> 5;
    const bit = targetIndex & 31;
    const isAlive = (this.alive[word]! & (1 << bit)) !== 0;

    if (isAlive) {
      throw new Error(
        `Cannot spawn entity with ID ${targetEntity}: slot ${targetIndex} is already in use`,
      );
    }

    // Expand nextIndex if needed (for slots beyond current allocation)
    if (targetIndex >= this.nextIndex) {
      this.nextIndex = targetIndex + 1;
    }

    // Remove from free list if present
    const freeListIndex = this.findInFreeList(targetIndex);
    if (freeListIndex !== -1) {
      // Swap with last element and shrink
      this.freeList[freeListIndex] = this.freeList[--this.freeCount]!;
    }

    // Set generation to match target
    this.generations[targetIndex] = targetGen;

    // Mark as alive
    this.alive[word]! |= 1 << bit;
    this.entityCount++;

    const entity = targetEntity;
    const index = targetIndex;

    if (componentTypes.length > 0) {
      const archetype = this.graph.getOrCreateArchetype(componentTypes);
      const row = archetype.allocateRow(entity);

      for (const type of componentTypes) {
        this.initializeComponent(entity, archetype, row, getComponentMeta(type));
      }

      this.entityRecords[index] = { archetype, row };
    } else {
      this.entityRecords[index] = { archetype: null, row: -1 };
    }

    return entity;
  }

  /**
   * Find an index in the free list. Returns -1 if not found.
   */
  private findInFreeList(targetIndex: number): number {
    for (let i = 0; i < this.freeCount; i++) {
      if (this.freeList[i] === targetIndex) {
        return i;
      }
    }
    return -1;
  }

  /**
   * Set of entities currently being despawned (for cycle detection in cascade delete).
   */
  private readonly beingDespawned = new Set<Entity>();

  /** Remove an entity and all its components. Cascades to children if relations are configured. */
  despawn(entity: Entity): boolean {
    if (!this.isAlive(entity)) return false;

    // Cycle detection for cascade delete
    if (this.beingDespawned.has(entity)) return false;
    this.beingDespawned.add(entity);

    try {
      const index = entityIndex(entity);
      const record = this.entityRecords[index]!;

      if (record.archetype) {
        // Trigger observers and release string refs for all components
        for (const type of record.archetype.componentTypes) {
          const meta = getComponentMeta(type);
          const componentData = this.getComponentDataRaw(
            record.archetype,
            record.row,
            meta,
          );
          this.observers.notifyRemove(entity, meta.id.index, componentData);
          this.releaseStringRefs(record.archetype, record.row, meta);
        }

        const movedEntity = record.archetype.freeRow(record.row);

        if (movedEntity !== null) {
          const movedIndex = entityIndex(movedEntity);
          this.entityRecords[movedIndex]!.row = record.row;
        }
      }

      record.archetype = null;
      record.row = -1;

      // Remove relations and get cascade targets
      const { cascadeTargets } = this.relations.removeEntity(entity);

      // Clean up entity references:
      // 1. Remove refs FROM this entity (its outgoing refs)
      this.entityRefs.removeRefsFromSource(entity);
      // 2. Nullify refs TO this entity (sets field values to NULL_ENTITY)
      this.nullifyRefsTo(entity);

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

  /** Check if an entity exists and has not been despawned. */
  isAlive(entity: Entity): boolean {
    if (entity === NULL_ENTITY) return false;

    const index = entityIndex(entity);
    if (index >= this.nextIndex) return false;

    const gen = entityGeneration(entity);
    if (this.generations[index] !== gen) return false;

    const word = index >>> 5;
    const bit = index & 31;
    return (this.alive[word]! & (1 << bit)) !== 0;
  }

  /**
   * Add a component to an entity.
   * @returns true if the component was added, false if it already existed or entity is dead
   */
  add<T>(
    entity: Entity,
    componentType: ComponentClass<T>,
    data?: Partial<ComponentData<T>>,
  ): boolean {
    if (!this.isAlive(entity)) return false;

    const index = entityIndex(entity);
    const record = this.entityRecords[index]!;
    const meta = getComponentMeta(componentType);

    if (record.archetype?.hasComponent(meta.id.index)) {
      // Component already exists - use set() or addOrSet() instead
      return false;
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
        this.entityRecords[movedIndex]!.row = oldRow;
      }
    }

    // Initialize component data using helper
    this.initializeComponent(
      entity,
      newArchetype,
      newRow,
      meta,
      data as Record<string, number>,
    );

    this.entityRecords[index] = { archetype: newArchetype, row: newRow };
    return true;
  }

  /**
   * Add a component if it doesn't exist, or update it if it does.
   * This is the old behavior of add() before it was changed to return false for existing components.
   */
  addOrSet<T>(
    entity: Entity,
    componentType: ComponentClass<T>,
    data?: Partial<ComponentData<T>>,
  ): void {
    if (!this.isAlive(entity)) return;

    const index = entityIndex(entity);
    const record = this.entityRecords[index]!;
    const meta = getComponentMeta(componentType);

    if (record.archetype?.hasComponent(meta.id.index)) {
      // Component exists - update it
      if (data && !meta.isTag) {
        this.set(entity, componentType, data);
      }
      return;
    }

    // Component doesn't exist - add it
    this.add(entity, componentType, data);
  }

  remove<T>(entity: Entity, componentType: ComponentClass<T>): boolean {
    if (!this.isAlive(entity)) return false;

    const index = entityIndex(entity);
    const record = this.entityRecords[index]!;

    if (!record.archetype) return false;

    const meta = getComponentMeta(componentType);
    if (!record.archetype.hasComponent(meta.id.index)) return false;

    // Get component data BEFORE removing for the hook
    const componentData = this.getComponentDataRaw(
      record.archetype,
      record.row,
      meta,
    );

    // Release string references and trigger observers BEFORE removal
    this.releaseStringRefs(record.archetype, record.row, meta);
    this.observers.notifyRemove(entity, meta.id.index, componentData);

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
        this.entityRecords[movedIndex]!.row = oldRow;
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
      this.entityRecords[movedIndex]!.row = oldRow;
    }

    this.entityRecords[index] = { archetype: newArchetype, row: newRow };
    return true;
  }

  has<T>(entity: Entity, componentType: ComponentClass<T>): boolean {
    if (!this.isAlive(entity)) return false;

    const index = entityIndex(entity);
    const record = this.entityRecords[index]!;

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
    const record = this.entityRecords[index]!;

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

  /**
   * Get component data into an existing buffer to avoid allocations.
   * Useful in hot paths where get() is called frequently.
   *
   * @param entity - Entity to get component from
   * @param componentType - Component class to get
   * @param out - Buffer to write component data into
   * @returns true if successful, false if entity is dead or component is absent
   *
   * @example
   * const buffer: ComponentData<Position> = { x: 0, y: 0 };
   * if (world.getInto(entity, Position, buffer)) {
   *   // buffer now contains the entity's position
   *   console.log(buffer.x, buffer.y);
   * }
   */
  getInto<T>(
    entity: Entity,
    componentType: ComponentClass<T>,
    out: ComponentData<T>,
  ): boolean {
    if (!this.isAlive(entity)) return false;

    const index = entityIndex(entity);
    const record = this.entityRecords[index]!;

    if (!record.archetype) return false;

    const meta = getComponentMeta(componentType);
    if (!record.archetype.hasComponent(meta.id.index)) return false;

    if (meta.isTag) return true;

    // Write directly into the provided buffer
    for (const field of meta.fields) {
      const value = record.archetype.getFieldValue(
        record.row,
        meta.id.index,
        field.name,
      );
      if (value !== undefined) {
        (out as Record<string, number>)[field.name] = value;
      }
    }
    return true;
  }

  /**
   * Get a single field value without creating an object.
   * Use this in hot paths where you only need one field.
   *
   * @example
   * const x = world.getField(entity, Position, "x");
   */
  getField<T>(
    entity: Entity,
    componentType: ComponentClass<T>,
    fieldName: keyof ComponentData<T> & string,
  ): number | null {
    if (!this.isAlive(entity)) return null;

    const index = entityIndex(entity);
    const record = this.entityRecords[index]!;

    if (!record.archetype) return null;

    const meta = getComponentMeta(componentType);
    if (!record.archetype.hasComponent(meta.id.index)) return null;

    const value = record.archetype.getFieldValue(
      record.row,
      meta.id.index,
      fieldName,
    );
    return value ?? null;
  }

  /**
   * Set a single field value without creating an intermediate object.
   * Use this in hot paths where you only need to update one field.
   */
  setField<T>(
    entity: Entity,
    componentType: ComponentClass<T>,
    fieldName: keyof ComponentData<T> & string,
    value: number,
  ): void {
    if (!this.isAlive(entity)) return;

    const index = entityIndex(entity);
    const record = this.entityRecords[index]!;

    if (!record.archetype) return;

    const meta = getComponentMeta(componentType);
    if (!record.archetype.hasComponent(meta.id.index)) return;

    record.archetype.setFieldValue(record.row, meta.id.index, fieldName, value);
  }

  set<T>(
    entity: Entity,
    componentType: ComponentClass<T>,
    data: Partial<ComponentData<T>>,
  ): void {
    if (!this.isAlive(entity)) return;

    const index = entityIndex(entity);
    const record = this.entityRecords[index]!;

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

      // Release old string references and add new ones for updated string fields
      for (const field of meta.fields) {
        if (
          field.type === FieldType.String &&
          (data as Record<string, number>)[field.name] !== undefined
        ) {
          // Release old reference
          const oldIndex = previousData[field.name];
          if (oldIndex !== undefined && oldIndex > 0) {
            this.strings.releaseRef(oldIndex);
          }

          // Add new reference
          const newIndex = (data as Record<string, number>)[field.name];
          if (newIndex !== undefined && newIndex > 0) {
            this.strings.addRef(newIndex);
          }
        }
      }

      record.archetype.setComponentData(
        record.row,
        meta.id.index,
        data as Record<string, number>,
      );

      // Trigger observers after data is updated
      this.observers.notifySet(
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
  // Batched Operations
  // ==========================================================================

  /**
   * Start a batch operation on an entity.
   * Use commit() to apply all changes in a single archetype transition.
   *
   * @example
   * world.batch(entity)
   *   .add(Position, { x: 0, y: 0 })
   *   .add(Velocity, { vx: 1, vy: 1 })
   *   .commit();  // Single archetype transition
   */
  batch(entity: Entity): EntityBuilder {
    return new EntityBuilder(this, entity);
  }

  /**
   * Internal: Apply batched structural changes.
   * @internal
   */
  _commitBatch(
    entity: Entity,
    toAdd: Array<{ type: ComponentClass; data?: Record<string, number> }>,
    toRemove: ComponentClass[],
  ): Entity {
    if (!this.isAlive(entity)) return entity;

    const index = entityIndex(entity);
    const record = this.entityRecords[index]!;

    // Build a set of component indices to remove
    const removeSet = new Set<number>();
    for (const type of toRemove) {
      const meta = getComponentMeta(type);
      removeSet.add(meta.id.index);
    }

    // Build a map of components to add (last one wins if duplicates)
    const addMap = new Map<
      number,
      { type: ComponentClass; data?: Record<string, number> }
    >();
    for (const op of toAdd) {
      const meta = getComponentMeta(op.type);
      // If component is in both add and remove, remove wins (it comes later)
      if (!removeSet.has(meta.id.index)) {
        addMap.set(meta.id.index, op);
      }
    }

    // Compute final component set
    let currentTypes = record.archetype
      ? [...record.archetype.componentTypes]
      : [];

    // Remove components
    currentTypes = currentTypes.filter((t) => {
      const meta = getComponentMeta(t);
      return !removeSet.has(meta.id.index);
    });

    // Add new components
    for (const op of addMap.values()) {
      const meta = getComponentMeta(op.type);
      if (
        !currentTypes.some(
          (t) => getComponentMeta(t).id.index === meta.id.index,
        )
      ) {
        currentTypes.push(op.type);
      }
    }

    if (currentTypes.length === 0) {
      // Entity becomes empty - despawn
      this.despawn(entity);
      return entity;
    }

    // Get or create target archetype
    const targetArchetype = this.graph.getOrCreateArchetype(currentTypes);

    // If archetype unchanged, just set data
    if (targetArchetype === record.archetype) {
      for (const op of addMap.values()) {
        if (op.data) {
          const meta = getComponentMeta(op.type);
          record.archetype.setComponentData(record.row, meta.id.index, op.data);
        }
      }
      return entity;
    }

    // Move entity to new archetype
    const oldArchetype = record.archetype;
    const oldRow = record.row;
    const newRow = targetArchetype.allocateRow(entity);

    // Copy existing component data
    if (oldArchetype) {
      for (const type of oldArchetype.componentTypes) {
        const meta = getComponentMeta(type);
        if (targetArchetype.hasComponent(meta.id.index)) {
          targetArchetype.copyComponentDataFrom(
            newRow,
            oldArchetype,
            oldRow,
            meta.id.index,
          );
        }
      }
    }

    // Set new component data
    for (const op of addMap.values()) {
      const meta = getComponentMeta(op.type);
      if (op.data) {
        targetArchetype.setComponentData(newRow, meta.id.index, op.data);
      }
    }

    // Update record
    record.archetype = targetArchetype;
    record.row = newRow;

    // Free old row and handle moved entity
    if (oldArchetype) {
      const movedEntity = oldArchetype.freeRow(oldRow);
      if (movedEntity !== null) {
        const movedIndex = entityIndex(movedEntity);
        this.entityRecords[movedIndex]!.row = oldRow;
      }
    }

    return entity;
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
    const record = this.getRecord(entity);
    if (!record?.archetype) return null;

    const meta = getComponentMeta(componentType);
    if (!record.archetype.hasComponent(meta.id.index)) return null;
    if (!this.validateStringField(meta, fieldName)) return null;

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
    const record = this.getRecord(entity);
    if (!record?.archetype) return false;

    const meta = getComponentMeta(componentType);
    if (!record.archetype.hasComponent(meta.id.index)) return false;
    if (!this.validateStringField(meta, fieldName)) return false;

    // Release old reference
    const oldIndex = record.archetype.getFieldValue(
      record.row,
      meta.id.index,
      fieldName,
    );
    if (oldIndex !== undefined && oldIndex > 0) {
      this.strings.releaseRef(oldIndex);
    }

    // Intern and add new reference
    const stringIndex = this.strings.intern(value);
    if (stringIndex > 0) {
      this.strings.addRef(stringIndex);
    }

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
    const record = this.getRecord(entity);
    if (!record?.archetype) return null;

    const meta = getComponentMeta(componentType);
    if (!record.archetype.hasComponent(meta.id.index)) return null;
    if (!this.validateEntityRefField(meta, fieldName)) return null;

    const refValue = record.archetype.getFieldValue(
      record.row,
      meta.id.index,
      fieldName,
    );

    if (refValue === undefined || refValue === NULL_ENTITY) return null;

    const ref = refValue as Entity;
    return this.isAlive(ref) ? ref : null;
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
    const record = this.getRecord(entity);
    if (!record?.archetype) return null;

    const meta = getComponentMeta(componentType);
    if (!record.archetype.hasComponent(meta.id.index)) return null;
    if (!this.validateEntityRefField(meta, fieldName)) return null;

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
    const record = this.getRecord(entity);
    if (!record?.archetype) return false;

    const meta = getComponentMeta(componentType);
    if (!record.archetype.hasComponent(meta.id.index)) return false;
    if (!this.validateEntityRefField(meta, fieldName)) return false;

    this.entityRefs.trackRef(entity, meta.id.index, fieldName, target);
    record.archetype.setFieldValue(
      record.row,
      meta.id.index,
      fieldName,
      target,
    );

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
      const record = this.entityRecords[sourceIdx]!;

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
    return new QueryBuilder(
      this.graph,
      this.queryCache,
      this.viewPool,
      componentTypes,
      this.relations,
    );
  }

  /**
   * Query entities with ANY of the specified components (OR logic).
   *
   * @example
   * world.queryAny(Sprite, Mesh, Particle).run(view => {
   *   // Gets entities with Sprite OR Mesh OR Particle
   * });
   */
  queryAny(...componentTypes: ComponentClass[]): UnionQueryBuilder {
    return new UnionQueryBuilder(
      this.graph,
      this.queryCache,
      this.viewPool,
      componentTypes,
    );
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
    this.viewPool.releaseAll();
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
      index = this.freeList[--this.freeCount]!;
      gen = this.generations[index]!;
    } else {
      if (this.nextIndex >= this.maxEntities) {
        throw new Error(`Entity limit exceeded: ${this.maxEntities}`);
      }
      index = this.nextIndex++;
      gen = 0;
    }

    const word = index >>> 5;
    const bit = index & 31;
    this.alive[word]! |= 1 << bit;
    this.entityCount++;

    return makeEntity(index, gen);
  }

  private freeEntity(entity: Entity): void {
    const index = entityIndex(entity);

    const word = index >>> 5;
    const bit = index & 31;
    this.alive[word]! &= ~(1 << bit);

    const oldGen = this.generations[index]!;
    const newGen = (oldGen + 1) & 0xfff;

    // Detect generation overflow (after 4096 despawn/respawn cycles)
    if (newGen === 0 && oldGen === 0xfff) {
      console.warn(
        `[ECS] Entity index ${index} generation overflow. ` +
          `Stale references may become valid again. ` +
          `Consider increasing ENTITY_GEN_BITS or reducing entity churn.`,
      );
    }

    this.generations[index] = newGen;
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

/**
 * A relation filter for query-by-relation.
 */
interface RelationFilter {
  relation: RelationType;
  target: Entity | Wildcard;
  direction: "outgoing" | "incoming";
}

export class QueryBuilder {
  private readonly withMask: ComponentMask;
  private withoutMask: ComponentMask = new ComponentMask();
  private changeFilter: ChangeFlag = ChangeFlag.None;
  // Per-component change detection: mask of component indices to check for changes
  private changedComponentMask: bigint = 0n;
  private readonly componentMetas: ComponentMeta[];
  private readonly filters: StoredFilter[] = [];
  private readonly relationFilters: RelationFilter[] = [];
  /** Cached query descriptor to avoid allocation on every run() */
  private _descriptor: QueryDescriptor | null = null;
  /** Reusable filter data buffers per component - avoids allocations in hot path */
  private readonly filterBuffers = new Map<number, Record<string, number>>();

  constructor(
    readonly _graph: ArchetypeGraph,
    private readonly cache: QueryCache,
    private readonly viewPool: ViewPool,
    componentTypes: ComponentClass[],
    private readonly relationStore?: RelationStore,
  ) {
    const mask = new ComponentMask();
    this.componentMetas = [];

    for (const type of componentTypes) {
      const meta = getComponentMeta(type);
      mask.set(meta.id.index);
      this.componentMetas.push(meta);
    }

    this.withMask = mask;
  }

  /**
   * Get the query descriptor, creating and caching it if necessary.
   * Invalidated when not() is called.
   */
  private get descriptor(): QueryDescriptor {
    if (!this._descriptor) {
      this._descriptor = {
        withMask: this.withMask,
        withoutMask: this.withoutMask,
      };
    }
    return this._descriptor;
  }

  not(...componentTypes: ComponentClass[]): QueryBuilder {
    for (const type of componentTypes) {
      const meta = getComponentMeta(type);
      this.withoutMask.set(meta.id.index);
    }
    // Invalidate cached descriptor since withoutMask changed
    this._descriptor = null;
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
   * Filter to entities that have an outgoing relation to a specific target.
   * If WILDCARD is passed as target, matches entities with ANY target for that relation.
   *
   * @example
   * // All entities that are children of a specific parent
   * world.query(Position).withRelation(ChildOf, parent).run(view => { ... });
   *
   * // All entities that have a parent (any parent)
   * world.query(Position).withRelation(ChildOf, WILDCARD).run(view => { ... });
   */
  withRelation(relation: RelationType, target: Entity | Wildcard): QueryBuilder {
    if (!this.relationStore) {
      throw new Error(
        "withRelation() requires a RelationStore. Create queries via world.query().",
      );
    }
    this.relationFilters.push({ relation, target, direction: "outgoing" });
    return this;
  }

  /**
   * Filter to entities that are targets of a relation from a specific source.
   * If WILDCARD is passed as source, matches entities that are targets from ANY source.
   *
   * @example
   * // All children of a specific parent
   * world.query(Position).withRelationTo(ChildOf, parent).run(view => { ... });
   *
   * // All entities that are children of something (have a parent)
   * world.query(Position).withRelationTo(ChildOf, WILDCARD).run(view => { ... });
   */
  withRelationTo(relation: RelationType, source: Entity | Wildcard): QueryBuilder {
    if (!this.relationStore) {
      throw new Error(
        "withRelationTo() requires a RelationStore. Create queries via world.query().",
      );
    }
    this.relationFilters.push({ relation, target: source, direction: "incoming" });
    return this;
  }

  /**
   * Get or create a reusable filter data buffer for a component.
   * Initialized once per component with default values for all fields.
   */
  private getFilterBuffer(meta: ComponentMeta): Record<string, number> {
    let buffer = this.filterBuffers.get(meta.id.index);
    if (!buffer) {
      buffer = Object.create(null) as Record<string, number>;
      // Pre-initialize all fields with defaults
      for (const field of meta.fields) {
        buffer[field.name] = field.default;
      }
      this.filterBuffers.set(meta.id.index, buffer);
    }
    return buffer;
  }

  /**
   * Check if an entity at the given row passes all filters.
   * Uses reusable buffers to avoid allocations in the hot path.
   */
  private passesFilters(archetype: Archetype, row: number): boolean {
    if (this.filters.length === 0) return true;

    for (const filter of this.filters) {
      // Reuse buffer - avoids O(entities × filters) allocations
      const data = this.getFilterBuffer(filter.meta);

      // Populate with current entity's component data
      for (const field of filter.meta.fields) {
        const value = archetype.getFieldValue(
          row,
          filter.meta.id.index,
          field.name,
        );
        data[field.name] = value ?? field.default;
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

  /**
   * Check if an entity passes relation filters.
   */
  private passesRelationFilters(entity: Entity): boolean {
    if (this.relationFilters.length === 0 || !this.relationStore) return true;

    for (const filter of this.relationFilters) {
      if (filter.direction === "outgoing") {
        if (isWildcard(filter.target)) {
          // Wildcard: entity must have ANY target for this relation
          if (!this.relationStore.hasAnyTarget(entity, filter.relation)) {
            return false;
          }
        } else {
          // Specific target: entity must have relation to this specific target
          if (!this.relationStore.has(entity, filter.relation, filter.target)) {
            return false;
          }
        }
      } else {
        // direction === "incoming"
        if (isWildcard(filter.target)) {
          // Wildcard: entity must be target of ANY source
          if (!this.relationStore.hasAnySource(entity, filter.relation)) {
            return false;
          }
        } else {
          // Specific source: entity must be target of this specific source
          if (!this.relationStore.has(filter.target, filter.relation, entity)) {
            return false;
          }
        }
      }
    }

    return true;
  }

  run(callback: (view: ArchetypeView) => void): void {
    const archetypes = this.cache.resolve(this.descriptor);

    for (const archetype of archetypes) {
      if (archetype.count === 0) continue;

      const view = this.viewPool.acquire(
        archetype,
        this.componentMetas,
        this.changeFilter,
        this.changedComponentMask,
        this.filters,
        this.relationFilters,
        this.relationStore,
      );

      if (view.count > 0) {
        callback(view);
      }
    }
  }

  /**
   * Iterate over all matching entities with a simple callback.
   * More ergonomic than run() for simple per-entity logic.
   * Zero generator allocation overhead compared to iter().
   *
   * @example
   * world.query(Position, Velocity).forEach(entity => {
   *   console.log(entity);
   * });
   */
  forEach(callback: (entity: Entity) => void): void {
    this.run((view) => {
      for (const row of view.iterRows()) {
        callback(view.entity(row));
      }
    });
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
    const archetypes = this.cache.resolve(this.descriptor);

    for (const archetype of archetypes) {
      for (let i = 0; i < archetype.count; i++) {
        if (!this.passesChangeFilter(archetype, i)) continue;
        if (!this.passesFilters(archetype, i)) continue;
        const entity = archetype.getEntity(i);
        if (!this.passesRelationFilters(entity)) continue;
        yield entity;
      }
    }
  }

  /**
   * Iterate over all entities in deterministic order (sorted by entity index).
   * Use this when deterministic ordering is required for replay/testing.
   */
  *iterDeterministic(): Generator<Entity> {
    const archetypes = this.cache.resolve(this.descriptor);

    // Collect all matching entities
    const entities: Array<{ entity: Entity; index: number }> = [];

    for (const archetype of archetypes) {
      const entityIndices = archetype.getEntityIndices();
      for (let i = 0; i < archetype.count; i++) {
        if (!this.passesChangeFilter(archetype, i)) continue;
        if (!this.passesFilters(archetype, i)) continue;
        const entity = archetype.getEntity(i);
        if (!this.passesRelationFilters(entity)) continue;
        entities.push({
          entity,
          index: entityIndices[i]!,
        });
      }
    }

    // Sort by entity index
    entities.sort((a, b) => a.index - b.index);

    for (const { entity } of entities) {
      yield entity;
    }
  }

  /**
   * Collect all entities matching the query into an array.
   */
  collect(): Entity[] {
    return [...this.iter()];
  }

  count(): number {
    const archetypes = this.cache.resolve(this.descriptor);

    // Fast path: no filters, no change detection, no relation filters
    if (
      this.filters.length === 0 &&
      this.changeFilter === ChangeFlag.None &&
      this.relationFilters.length === 0
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
        const entity = archetype.getEntity(i);
        if (!this.passesRelationFilters(entity)) continue;
        total++;
      }
    }
    return total;
  }

  first(): Entity | null {
    const archetypes = this.cache.resolve(this.descriptor);

    // Fast path: no filters, no change detection, no relation filters
    if (
      this.filters.length === 0 &&
      this.changeFilter === ChangeFlag.None &&
      this.relationFilters.length === 0
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
        const entity = archetype.getEntity(i);
        if (!this.passesRelationFilters(entity)) continue;
        return entity;
      }
    }

    return null;
  }
}

/**
 * Pool for reusing ArchetypeView objects to eliminate per-query allocations.
 * Follows Bevy/Flecs pattern of buffer reuse in hot paths.
 */
export class ViewPool {
  private readonly pool: ArchetypeView[] = [];
  private active = 0;

  /**
   * Acquire a view from the pool, initializing it with the given parameters.
   * Creates a new view if the pool is exhausted.
   */
  acquire(
    archetype: Archetype,
    componentMetas: ComponentMeta[],
    changeFilter: ChangeFlag,
    changedComponentMask: bigint,
    filters: StoredFilter[],
    relationFilters: RelationFilter[] = [],
    relationStore?: RelationStore,
  ): ArchetypeView {
    let view: ArchetypeView;

    if (this.active < this.pool.length) {
      view = this.pool[this.active]!;
      view.init(
        archetype,
        componentMetas,
        changeFilter,
        changedComponentMask,
        filters,
        relationFilters,
        relationStore,
      );
    } else {
      view = new ArchetypeView(
        archetype,
        componentMetas,
        changeFilter,
        changedComponentMask,
        filters,
        relationFilters,
        relationStore,
      );
      this.pool.push(view);
    }

    this.active++;
    return view;
  }

  /**
   * Release all acquired views back to the pool.
   * Call this at the end of each tick.
   */
  releaseAll(): void {
    this.active = 0;
  }

  /**
   * Get the current pool size (for debugging/monitoring).
   */
  get size(): number {
    return this.pool.length;
  }

  /**
   * Get the number of currently active views.
   */
  get activeCount(): number {
    return this.active;
  }
}

export class ArchetypeView {
  count!: number;
  private archetype!: Archetype;
  private changeFilter!: ChangeFlag;
  private changedComponentMask!: bigint;
  private readonly metaByClass = new Map<ComponentClass, ComponentMeta>();
  private filters!: StoredFilter[];
  private relationFilters!: RelationFilter[];
  private relationStore?: RelationStore;
  /** Indices of entities that pass all filters (lazily computed) */
  private _filteredIndices: number[] | null = null;
  /** Reusable buffer for filter data */
  private readonly filterDataBuffer: Record<string, number | undefined> = {};

  constructor(
    archetype: Archetype,
    _componentMetas: ComponentMeta[],
    changeFilter: ChangeFlag,
    changedComponentMask: bigint = 0n,
    filters: StoredFilter[] = [],
    relationFilters: RelationFilter[] = [],
    relationStore?: RelationStore,
  ) {
    this.init(
      archetype,
      _componentMetas,
      changeFilter,
      changedComponentMask,
      filters,
      relationFilters,
      relationStore,
    );
  }

  /**
   * Initialize or reinitialize the view with new parameters.
   * Used by ViewPool to reuse view objects.
   */
  init(
    archetype: Archetype,
    _componentMetas: ComponentMeta[],
    changeFilter: ChangeFlag,
    changedComponentMask: bigint = 0n,
    filters: StoredFilter[] = [],
    relationFilters: RelationFilter[] = [],
    relationStore?: RelationStore,
  ): void {
    this.archetype = archetype;
    this.changeFilter = changeFilter;
    this.changedComponentMask = changedComponentMask;
    this.filters = filters;
    this.relationFilters = relationFilters;
    this.relationStore = relationStore;
    this._filteredIndices = null;
    this.metaByClass.clear();

    // Fast path: no filters, no change detection, no relation filters
    if (
      filters.length === 0 &&
      changeFilter === ChangeFlag.None &&
      relationFilters.length === 0
    ) {
      this.count = archetype.count;
      return;
    }

    // Slow path: need to check each entity
    let count = 0;
    for (let i = 0; i < archetype.count; i++) {
      if (!this.passesChangeFilter(i)) continue;
      if (!this.passesFilters(i)) continue;
      const entity = archetype.getEntity(i);
      if (!this.passesRelationFilters(entity)) continue;
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
      // Clear buffer efficiently by setting keys to undefined
      for (const key in this.filterDataBuffer) {
        this.filterDataBuffer[key] = undefined;
      }

      // Populate with current entity's data
      for (const field of filter.meta.fields) {
        const value = this.archetype.getFieldValue(
          row,
          filter.meta.id.index,
          field.name,
        );
        if (value !== undefined) {
          this.filterDataBuffer[field.name] = value;
        }
      }

      if (!filter.predicate(this.filterDataBuffer)) {
        return false;
      }
    }

    return true;
  }

  private passesRelationFilters(entity: Entity): boolean {
    if (this.relationFilters.length === 0 || !this.relationStore) return true;

    for (const filter of this.relationFilters) {
      if (filter.direction === "outgoing") {
        if (isWildcard(filter.target)) {
          if (!this.relationStore.hasAnyTarget(entity, filter.relation)) {
            return false;
          }
        } else {
          if (!this.relationStore.has(entity, filter.relation, filter.target)) {
            return false;
          }
        }
      } else {
        if (isWildcard(filter.target)) {
          if (!this.relationStore.hasAnySource(entity, filter.relation)) {
            return false;
          }
        } else {
          if (!this.relationStore.has(filter.target, filter.relation, entity)) {
            return false;
          }
        }
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
    if (
      this.filters.length === 0 &&
      this.changeFilter === ChangeFlag.None &&
      this.relationFilters.length === 0
    ) {
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
      const entity = this.archetype.getEntity(i);
      if (!this.passesRelationFilters(entity)) continue;
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
   * Iterate over rows in deterministic order (sorted by entity index).
   * Use this when deterministic ordering is required.
   * Slightly slower than iterRows() due to sorting.
   */
  *iterRowsDeterministic(): Generator<number> {
    // Build array of (row, entityIndex) pairs
    const pairs: Array<[number, number]> = [];
    const entityIndices = this.archetype.getEntityIndices();

    for (let i = 0; i < this.archetype.count; i++) {
      if (!this.passesChangeFilter(i)) continue;
      if (!this.passesFilters(i)) continue;
      const entity = this.archetype.getEntity(i);
      if (!this.passesRelationFilters(entity)) continue;
      pairs.push([i, entityIndices[i]!]);
    }

    // Sort by entity index for deterministic order
    pairs.sort((a, b) => a[1] - b[1]);

    for (const [row] of pairs) {
      yield row;
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
  hasComponentChanged<T>(
    row: number,
    componentType: ComponentClass<T>,
  ): boolean {
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
      return this.archetype.hasAnyComponentChanged(
        row,
        this.changedComponentMask,
      );
    }

    return true;
  }

  rawCount(): number {
    return this.archetype.count;
  }
}

/**
 * Query builder for union queries (ANY of multiple components).
 * Returns entities that have at least one of the specified components.
 */
export class UnionQueryBuilder {
  private readonly componentMetas: ComponentMeta[];
  private withoutMask = new ComponentMask();

  constructor(
    _graph: ArchetypeGraph,
    private readonly cache: QueryCache,
    private readonly viewPool: ViewPool,
    componentTypes: ComponentClass[],
  ) {
    this.componentMetas = componentTypes.map((t) => getComponentMeta(t));
  }

  /**
   * Exclude entities that have any of the specified components.
   *
   * @example
   * world.queryAny(Sprite, Mesh).not(Hidden).run(view => {
   *   // Gets visible entities with Sprite OR Mesh
   * });
   */
  not(...componentTypes: ComponentClass[]): this {
    for (const type of componentTypes) {
      const meta = getComponentMeta(type);
      this.withoutMask.set(meta.id.index);
    }
    return this;
  }

  /**
   * Execute a callback for each archetype that matches the union query.
   * The view will contain all components available in that archetype.
   *
   * @example
   * world.queryAny(Sprite, Mesh).run(view => {
   *   for (const row of view.iterRows()) {
   *     const entity = view.entity(row);
   *     // Process entity that has at least one of the components
   *   }
   * });
   */
  run(callback: (view: ArchetypeView) => void): void {
    const matchedArchetypes = new Set<Archetype>();

    // Find archetypes matching ANY of the components
    for (const meta of this.componentMetas) {
      const withMask = ComponentMask.fromIndex(meta.id.index);
      const descriptor = { withMask, withoutMask: this.withoutMask };
      const archetypes = this.cache.resolve(descriptor);
      for (const arch of archetypes) {
        matchedArchetypes.add(arch);
      }
    }

    // Run callback on each matching archetype
    for (const archetype of matchedArchetypes) {
      if (archetype.count === 0) continue;

      // For the view, we only include component metas that this archetype actually has
      const availableMetas = this.componentMetas.filter((m) =>
        archetype.hasComponent(m.id.index),
      );

      const view = this.viewPool.acquire(
        archetype,
        availableMetas,
        ChangeFlag.None,
        0n,
        [],
      );

      if (view.count > 0) {
        callback(view);
      }
    }
  }

  /**
   * Iterate over all entities that match the union query.
   *
   * @example
   * for (const entity of world.queryAny(Sprite, Mesh).iter()) {
   *   console.log(entity);
   * }
   */
  *iter(): Generator<Entity> {
    const matchedArchetypes = new Set<Archetype>();

    for (const meta of this.componentMetas) {
      const withMask = ComponentMask.fromIndex(meta.id.index);
      const descriptor = { withMask, withoutMask: this.withoutMask };
      const archetypes = this.cache.resolve(descriptor);
      for (const arch of archetypes) {
        matchedArchetypes.add(arch);
      }
    }

    for (const archetype of matchedArchetypes) {
      for (let i = 0; i < archetype.count; i++) {
        yield archetype.getEntity(i);
      }
    }
  }

  /**
   * Collect all entities matching the union query into an array.
   *
   * @example
   * const entities = world.queryAny(Sprite, Mesh).collect();
   */
  collect(): Entity[] {
    return [...this.iter()];
  }

  /**
   * Count the total number of entities matching the union query.
   *
   * @example
   * const count = world.queryAny(Sprite, Mesh).count();
   */
  count(): number {
    let total = 0;
    const matchedArchetypes = new Set<Archetype>();

    for (const meta of this.componentMetas) {
      const withMask = ComponentMask.fromIndex(meta.id.index);
      const descriptor = { withMask, withoutMask: this.withoutMask };
      const archetypes = this.cache.resolve(descriptor);
      for (const arch of archetypes) {
        matchedArchetypes.add(arch);
      }
    }

    for (const archetype of matchedArchetypes) {
      total += archetype.count;
    }
    return total;
  }

  /**
   * Get the first entity matching the union query, or null if none.
   *
   * @example
   * const entity = world.queryAny(Sprite, Mesh).first();
   */
  first(): Entity | null {
    const matchedArchetypes = new Set<Archetype>();

    for (const meta of this.componentMetas) {
      const withMask = ComponentMask.fromIndex(meta.id.index);
      const descriptor = { withMask, withoutMask: this.withoutMask };
      const archetypes = this.cache.resolve(descriptor);
      for (const arch of archetypes) {
        matchedArchetypes.add(arch);
      }
    }

    for (const archetype of matchedArchetypes) {
      if (archetype.count > 0) {
        return archetype.getEntity(0);
      }
    }

    return null;
  }
}
