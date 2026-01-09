export { Archetype, ArchetypeGraph } from "./archetype";
export {
  component,
  getComponentCount,
  getComponentMeta,
  getComponentByName,
  getAllComponents,
  hasComponentMeta,
} from "./component";
export {
  bool,
  entityRef,
  FIELD_MARKER,
  type FieldDescriptor,
  f32,
  f64,
  i8,
  i16,
  i32,
  isFieldDescriptor,
  isStringField,
  str,
  u8,
  u16,
  u32,
} from "./field";
export {
  StringPool,
  getStringPool,
  globalStringPool,
  type StringPoolStats,
} from "./string-pool";
export {
  ChangeFlag,
  type ComponentClass,
  type ComponentData,
  type ComponentId,
  type ComponentMeta,
  type Entity,
  entityGeneration,
  entityIndex,
  FIELD_ARRAY_CTOR,
  FIELD_BYTE_SIZE,
  type FieldMeta,
  FieldType,
  MAX_ENTITIES,
  makeEntity,
  NULL_ENTITY,
  Phase,
} from "./types";
export { ArchetypeView, QueryBuilder, World, type QueryFilter } from "./world";
export { CommandBuffer } from "./command-buffer";
export { ResourceRegistry, type ResourceClass } from "./resource";
export {
  EventQueue,
  type GameEvent,
  type GameEventType,
  type EventHandler,
} from "./events";
export { QueryCache, type QueryDescriptor } from "./query-cache";
export { defineSystem, type System } from "./system";
export { SystemScheduler } from "./scheduler";
export {
  WorldSerializer,
  serializeWorld,
  deserializeWorld,
  SNAPSHOT_VERSION,
  type WorldSnapshot,
  type SerializedEntity,
  type SerializedRelation,
  type WorldSerializerOptions,
} from "./serialization";
export {
  MigrationRegistry,
  globalMigrations,
  createEntityMigration,
  addFieldMigration,
  removeFieldMigration,
  renameFieldMigration,
  renameComponentMigration,
  removeComponentMigration,
  transformFieldMigration,
  composeMigrations,
  type Migration,
  type EntityTransformer,
  type ComponentTransformer,
} from "./migration";
export {
  WorldInspector,
  createInspector,
  type EntityInfo,
  type ComponentInfo,
  type ArchetypeInfo,
  type WorldStats,
} from "./inspector";
export {
  HookRegistry,
  globalHooks,
  createLoggingHooks,
  createValidationHooks,
  combineHooks,
  type ComponentHooks,
  type OnAddHook,
  type OnRemoveHook,
  type OnSetHook,
} from "./hooks";
export {
  defineRelation,
  getRelationByIndex,
  getRelationByName,
  getAllRelations,
  getRelationCount,
  hasRelation,
  _resetRelationRegistry,
  // Built-in relations
  ChildOf,
  Contains,
  Targets,
  // Types
  type RelationType,
  type RelationId,
  type RelationOptions,
  type RelationData,
  type StoredRelation,
} from "./relation";
export { RelationStore, type RemoveEntityResult } from "./relation-store";
export { EntityRefStore } from "./entity-ref-store";
export {
  SpatialGrid,
  SpatialIndex,
  type SpatialGridConfig,
} from "./spatial-grid";
export {
  PrefabRegistry,
  PrefabBuilder,
  prefab,
  globalPrefabs,
  type PrefabDef,
  type PrefabComponent,
  type ComponentInit,
} from "./prefab";
