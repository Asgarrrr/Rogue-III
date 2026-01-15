import type { Entity } from "../core/types";

/**
 * Unique identifier for a relation type.
 */
export interface RelationId {
  readonly index: number;
  readonly name: string;
}

/**
 * Configuration options for defining a relation.
 */
export interface RelationOptions {
  /**
   * If true, a source entity can only have ONE target for this relation.
   * Adding a new target will replace the existing one.
   * Example: ChildOf (an entity can only have one parent)
   * @default false
   */
  exclusive?: boolean;

  /**
   * If true, adding A→B automatically adds B→A.
   * Removing A→B automatically removes B→A.
   * Example: Sibling relation
   * @default false
   */
  symmetric?: boolean;

  /**
   * If true, when the TARGET is despawned, the SOURCE is also despawned.
   * Example: ChildOf with cascadeDelete means children die with parent.
   * @default false
   */
  cascadeDelete?: boolean;

  /**
   * If true, relations are automatically removed when source or target is despawned.
   * This should almost always be true.
   * @default true
   */
  autoCleanup?: boolean;
}

/**
 * A relation type definition.
 * Relations connect two entities with optional typed data.
 *
 * @template T - The type of data associated with this relation (void if none)
 */
export interface RelationType<_T = void> {
  readonly id: RelationId;
  readonly hasData: boolean;
  readonly exclusive: boolean;
  readonly symmetric: boolean;
  readonly cascadeDelete: boolean;
  readonly autoCleanup: boolean;
}

/**
 * Internal relation type with data type marker.
 * Used for type inference in the store.
 */
export interface RelationTypeWithData<T> extends RelationType<T> {
  readonly __dataType?: T;
}

// ============================================================================
// Relation Registry
// ============================================================================

let nextRelationIndex = 0;
const relationsByIndex = new Map<number, RelationType>();
const relationsByName = new Map<string, RelationType>();

/**
 * Define a new relation type without associated data.
 *
 * @example
 * const ChildOf = defineRelation("ChildOf", { exclusive: true, cascadeDelete: true });
 * const Contains = defineRelation("Contains");
 */
export function defineRelation(
  name: string,
  options?: RelationOptions,
): RelationType<void>;

/**
 * Define a new relation type with associated data.
 *
 * @example
 * const EquippedIn = defineRelation<{ slot: string }>("EquippedIn", { exclusive: true });
 * world.relate(sword, EquippedIn, player, { slot: "mainHand" });
 */
export function defineRelation<T>(
  name: string,
  options?: RelationOptions,
): RelationType<T>;

export function defineRelation<T = void>(
  name: string,
  options: RelationOptions = {},
): RelationType<T> {
  if (relationsByName.has(name)) {
    throw new Error(`Relation "${name}" is already defined`);
  }

  const relationType: RelationType<T> = {
    id: {
      index: nextRelationIndex++,
      name,
    },
    hasData: false, // Will be set to true when data is first added
    exclusive: options.exclusive ?? false,
    symmetric: options.symmetric ?? false,
    cascadeDelete: options.cascadeDelete ?? false,
    autoCleanup: options.autoCleanup ?? true,
  };

  relationsByIndex.set(relationType.id.index, relationType as RelationType);
  relationsByName.set(name, relationType as RelationType);

  return relationType;
}

/**
 * Get a relation type by its index.
 */
export function getRelationByIndex(index: number): RelationType | undefined {
  return relationsByIndex.get(index);
}

/**
 * Get a relation type by its name.
 */
export function getRelationByName(name: string): RelationType | undefined {
  return relationsByName.get(name);
}

/**
 * Get all registered relation types.
 */
export function getAllRelations(): RelationType[] {
  return [...relationsByIndex.values()];
}

/**
 * Get the count of registered relation types.
 */
export function getRelationCount(): number {
  return relationsByIndex.size;
}

/**
 * Check if a relation type exists.
 */
export function hasRelation(name: string): boolean {
  return relationsByName.has(name);
}

/**
 * Reset the relation registry (for testing only).
 * @internal
 */
export function _resetRelationRegistry(): void {
  nextRelationIndex = 0;
  relationsByIndex.clear();
  relationsByName.clear();
}

// ============================================================================
// Built-in Relations
// ============================================================================

/**
 * Parent-child hierarchy relation.
 * - Exclusive: an entity can only have one parent
 * - Cascade delete: children are despawned when parent is despawned
 */
export const ChildOf = defineRelation("ChildOf", {
  exclusive: true,
  cascadeDelete: true,
});

/**
 * Container relation (inventory, chest contents, etc.)
 * - Not exclusive: a container can hold multiple items
 * - No cascade delete: items survive container destruction
 */
export const Contains = defineRelation("Contains", {
  exclusive: false,
  cascadeDelete: false,
});

/**
 * Targeting relation (enemy targets player, spell targets entity)
 * - Exclusive: can only target one entity at a time
 * - No cascade delete: targeting entity survives target death
 */
export const Targets = defineRelation("Targets", {
  exclusive: true,
  cascadeDelete: false,
});

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Extract the data type from a RelationType.
 */
export type RelationData<R> = R extends RelationType<infer T> ? T : never;

/**
 * A stored relation instance.
 */
export interface StoredRelation<T = unknown> {
  readonly source: Entity;
  readonly target: Entity;
  readonly relation: RelationType<T>;
  readonly data?: T;
}

// ============================================================================
// Wildcard for Relation Queries
// ============================================================================

/**
 * Wildcard type for relation queries.
 * Use WILDCARD as target to match any entity with the relation.
 */
export interface Wildcard {
  readonly __wildcard: true;
}

/**
 * Wildcard constant for relation queries.
 *
 * @example
 * // Query all entities that have a ChildOf relation to ANY parent
 * world.query(Position).withRelation(ChildOf, WILDCARD).run(view => { ... });
 */
export const WILDCARD: Wildcard = { __wildcard: true };

/**
 * Check if a value is the WILDCARD sentinel.
 */
export function isWildcard(value: unknown): value is Wildcard {
  return (
    typeof value === "object" &&
    value !== null &&
    "__wildcard" in value &&
    (value as Wildcard).__wildcard === true
  );
}
