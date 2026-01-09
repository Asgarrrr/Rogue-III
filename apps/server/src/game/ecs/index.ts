/**
 * ECS - Entity Component System
 *
 * A modern, high-performance ECS optimized for roguelike games.
 *
 * @example
 * ```typescript
 * import {
 *   World,
 *   ComponentSchema,
 *   ComponentType,
 *   defineSystem,
 *   SystemPhase,
 * } from "@engine/ecs";
 *
 * // Define a component
 * const PositionSchema = ComponentSchema.define<{ x: number; y: number }>( "Position" )
 *   .field( "x", ComponentType.F32, 0 )
 *   .field( "y", ComponentType.F32, 0 )
 *   .build();
 *
 * // Create world and register component
 * const world = new World();
 * world.registerComponent( PositionSchema );
 *
 * // Define a system
 * const MovementSystem = defineSystem( "Movement" )
 *   .inPhase( SystemPhase.Update )
 *   .execute( ( world ) => {
 *     const query = world.query( { with: ["Position", "Velocity"], without: [] } );
 *     for ( const entity of query.execute() ) {
 *       // Process entity...
 *     }
 *   } );
 *
 * // Register system
 * world.systems.register( MovementSystem );
 *
 * // Initialize and run
 * world.initialize();
 * world.tick();
 * ```
 */

// Re-export types
export {
  type Entity,
  type PendingEntityId,
  type TypedArray,
  type QueryDescriptor,
  ComponentType,
  SystemPhase,
  NULL_ENTITY,
  ENTITY_CONFIG,
  INVALID_INDEX,
  COORD_BITS,
  COORD_MASK,
  COORD_OFFSET,
  __DEV__,
} from "./types";

// Re-export core modules
export {
  // Entity
  createEntity,
  getIndex,
  getGeneration,
  isValidEntity,
  entityToString,
  MAX_ENTITIES,
  GENERATION_MASK,
  INDEX_MASK,
  // Entity Manager
  type EntityManager,
  EntityManagerImpl,
  // Component
  ComponentSchema,
  ComponentSchemaBuilder,
  isSoACompatible,
  type ComponentField,
  // Component Store
  type ComponentStore,
  SoAComponentStore,
  AoSComponentStore,
  // Component Registry
  ComponentRegistry,
  // Query
  Query,
  query,
  // Query Cache
  QueryCache,
  // System
  type System,
  SystemBuilder,
  defineSystem,
  // Scheduler
  SystemScheduler,
  // Command Buffer
  CommandBuffer,
  // Resource
  ResourceRegistry,
  TypedResourceRegistry,
  // Events
  EventQueue,
  type GameEvent,
  type TimestampedEvent,
  type EventData,
  type EventHandler,
  type TurnAction,
  // World
  World,
  type WorldStats,
} from "./core";

// Re-export features
export {
  // Templates
  type EntityTemplate,
  type TemplateComponents,
  EntityTemplateBuilder,
  EntityTemplateRegistry,
  defineTemplate,
  // Hierarchy
  ParentSchema,
  ChildrenSchema,
  HierarchyDepthSchema,
  type ChildrenData,
  type HierarchyResult,
  type HierarchyError,
  HierarchyManager,
  registerHierarchyComponents,
  createHierarchyManager,
  // Serialization
  type SerializedEntity,
  type WorldSnapshot,
  type SerializationConfig,
  type ComponentSerializer,
  type ComponentDeserializer,
  WorldSerializer,
  saveWorldToJson,
  loadWorldFromJson,
  saveWorldToFile,
  loadWorldFromFile,
  // Hot Reload
  type SystemModule,
  type ReloadCallback,
  type WatchConfig,
  HotReloadManager,
  SystemFileWatcher,
  createHotReloadManager,
} from "./features";

// Re-export common components
export {
  TemplateIdSchema,
  NameSchema,
  TagsSchema,
  type TagsData,
  DisabledSchema,
  PersistOnSaveSchema,
  DontSerializeSchema,
} from "./components";

// Re-export game module
export * from "./game";
