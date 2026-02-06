// Public relation API
export {
  ChildOf,
  Contains,
  defineRelation,
  getAllRelations,
  getRelationByIndex,
  getRelationByName,
  getRelationCount,
  hasRelation,
  isWildcard,
  type RelationData,
  type RelationId,
  type RelationOptions,
  type RelationType,
  type RelationTypeWithData,
  type StoredRelation,
  Targets,
  type Wildcard,
  WILDCARD,
} from "./relation";

// Test utilities (prefixed with _ to indicate internal use)
export { _resetRelationRegistry } from "./relation";

export * from "./entity-ref-store";
export * from "./hierarchy";
export * from "./relation-store";
