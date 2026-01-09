/**
 * ECS Core Module Exports
 */

// Command Buffer
export { CommandBuffer } from "./command-buffer";
// Component
export {
  type ComponentField,
  ComponentSchema,
  ComponentSchemaBuilder,
  isSoACompatible,
} from "./component";
// Component Registry
export { ComponentRegistry } from "./component-registry";

// Component Store
export {
  AoSComponentStore,
  type ComponentStore,
  SoAComponentStore,
} from "./component-store";
// Entity
export {
  createEntity,
  entityToString,
  GENERATION_MASK,
  getGeneration,
  getIndex,
  INDEX_MASK,
  isValidEntity,
  MAX_ENTITIES,
  NULL_ENTITY,
} from "./entity";
// Entity Manager
export {
  type EntityManager,
  EntityManagerImpl,
} from "./entity-manager";
// Events
export {
  type EventData,
  type EventHandler,
  EventQueue,
  type GameEvent,
  type TimestampedEvent,
  type TurnAction,
} from "./events";
// Query
export { Query, query } from "./query";
// Query Cache
export { QueryCache } from "./query-cache";
// Resource
export { ResourceRegistry, TypedResourceRegistry } from "./resource";
// Scheduler
export { SystemScheduler } from "./scheduler";
// System
export {
  defineSystem,
  type System,
  SystemBuilder,
} from "./system";

// World
export { World, type WorldStats } from "./world";
