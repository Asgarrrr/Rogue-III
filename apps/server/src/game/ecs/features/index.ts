/**
 * ECS Features Module
 *
 * Advanced features built on top of the core ECS.
 */

// Hierarchy
export {
  type ChildrenData,
  ChildrenSchema,
  createHierarchyManager,
  HierarchyDepthSchema,
  type HierarchyError,
  HierarchyManager,
  type HierarchyResult,
  ParentSchema,
  registerHierarchyComponents,
} from "./hierarchy";
// Hot Reload
export {
  createHotReloadManager,
  HotReloadManager,
  type ReloadCallback,
  SystemFileWatcher,
  type SystemModule,
  type WatchConfig,
} from "./hot-reload";

// Serialization
export {
  type ComponentDeserializer,
  type ComponentSerializer,
  loadWorldFromFile,
  loadWorldFromJson,
  type SerializationConfig,
  type SerializedEntity,
  saveWorldToFile,
  saveWorldToJson,
  WorldSerializer,
  type WorldSnapshot,
} from "./serialization";
// Templates
export {
  defineTemplate,
  type EntityTemplate,
  EntityTemplateBuilder,
  EntityTemplateRegistry,
  type TemplateComponents,
} from "./templates";
