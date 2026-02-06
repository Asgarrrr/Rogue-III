import type { Entity } from "../core/types";
import type { World } from "../core/world";
import { ChildOf } from "./relation";

/**
 * Hierarchy helper functions for parent-child relationships.
 * These are convenience methods that work with the ChildOf relation.
 *
 * Based on Flecs hierarchy patterns.
 */

/**
 * Get the parent of an entity.
 * Returns null if the entity has no parent.
 *
 * @example
 * const parent = hierarchy.parent(world, child);
 */
export function parent(world: World, entity: Entity): Entity | null {
  return world.getTarget(entity, ChildOf);
}

/**
 * Get all children of an entity.
 * Returns empty array if the entity has no children.
 *
 * @example
 * const kids = hierarchy.children(world, parent);
 */
export function children(world: World, entity: Entity): Entity[] {
  return world.getSources(entity, ChildOf);
}

/**
 * Check if an entity has any children.
 * O(1) operation - no array allocation.
 *
 * @example
 * if (hierarchy.hasChildren(world, entity)) { ... }
 */
export function hasChildren(world: World, entity: Entity): boolean {
  return world.relations.hasAnySource(entity, ChildOf);
}

/**
 * Check if an entity has a parent.
 * O(1) operation.
 *
 * @example
 * if (hierarchy.hasParent(world, entity)) { ... }
 */
export function hasParent(world: World, entity: Entity): boolean {
  return world.relations.hasAnyTarget(entity, ChildOf);
}

/**
 * Check if an entity is a child of another entity.
 *
 * @example
 * if (hierarchy.isChildOf(world, child, parent)) { ... }
 */
export function isChildOf(
  world: World,
  child: Entity,
  parentEntity: Entity,
): boolean {
  return world.hasRelation(child, ChildOf, parentEntity);
}

/**
 * Get all ancestors of an entity (parent, grandparent, etc.).
 * Returns array ordered from immediate parent to root.
 * Protected against circular references.
 *
 * @example
 * const ancestors = hierarchy.ancestors(world, entity);
 * // [parent, grandparent, greatGrandparent, ...]
 */
export function ancestors(world: World, entity: Entity): Entity[] {
  const result: Entity[] = [];
  const visited = new Set<Entity>();
  let current = parent(world, entity);

  while (current !== null && !visited.has(current)) {
    visited.add(current);
    result.push(current);
    current = parent(world, current);
  }

  return result;
}

/**
 * Get the root ancestor of an entity.
 * Returns the entity itself if it has no parent.
 * Protected against circular references.
 *
 * @example
 * const root = hierarchy.root(world, deepChild);
 */
export function root(world: World, entity: Entity): Entity {
  const visited = new Set<Entity>();
  let current = entity;
  let p = parent(world, current);

  while (p !== null && !visited.has(p)) {
    visited.add(current);
    current = p;
    p = parent(world, current);
  }

  return current;
}

/**
 * Get all descendants of an entity (children, grandchildren, etc.).
 * Uses breadth-first traversal with O(n) complexity.
 *
 * @example
 * const allDescendants = hierarchy.descendants(world, root);
 */
export function descendants(world: World, entity: Entity): Entity[] {
  const result: Entity[] = [];
  const queue: Entity[] = [...children(world, entity)];

  // Use index pointer instead of shift() for O(n) instead of O(n²)
  let i = 0;
  while (i < queue.length) {
    const current = queue[i++]!;
    result.push(current);
    queue.push(...children(world, current));
  }

  return result;
}

/**
 * Get the depth of an entity in the hierarchy.
 * Root entities have depth 0.
 * Protected against circular references.
 *
 * @example
 * const depth = hierarchy.depth(world, entity);
 */
export function depth(world: World, entity: Entity): number {
  const visited = new Set<Entity>();
  let d = 0;
  let current = parent(world, entity);

  while (current !== null && !visited.has(current)) {
    visited.add(current);
    d++;
    current = parent(world, current);
  }

  return d;
}

/**
 * Check if an entity is a descendant of another entity.
 * Protected against circular references.
 *
 * @example
 * if (hierarchy.isDescendantOf(world, child, ancestor)) { ... }
 */
export function isDescendantOf(
  world: World,
  entity: Entity,
  ancestorEntity: Entity,
): boolean {
  const visited = new Set<Entity>();
  let current = parent(world, entity);

  while (current !== null && !visited.has(current)) {
    if (current === ancestorEntity) return true;
    visited.add(current);
    current = parent(world, current);
  }

  return false;
}

/**
 * Check if an entity is an ancestor of another entity.
 *
 * @example
 * if (hierarchy.isAncestorOf(world, parent, child)) { ... }
 */
export function isAncestorOf(
  world: World,
  entity: Entity,
  descendantEntity: Entity,
): boolean {
  return isDescendantOf(world, descendantEntity, entity);
}

/**
 * Get all siblings of an entity (other children of the same parent).
 * Returns empty array if the entity has no parent.
 *
 * @example
 * const siblings = hierarchy.siblings(world, entity);
 */
export function siblings(world: World, entity: Entity): Entity[] {
  const p = parent(world, entity);
  if (p === null) return [];

  return children(world, p).filter((e) => e !== entity);
}

/**
 * Reparent an entity to a new parent.
 * If newParent is null, the entity becomes a root entity.
 * Throws if self-parenting or cycle would be created.
 *
 * @example
 * hierarchy.reparent(world, entity, newParent);
 */
export function reparent(
  world: World,
  entity: Entity,
  newParent: Entity | null,
): void {
  // Prevent self-parenting
  if (newParent === entity) {
    throw new Error("Cannot parent an entity to itself");
  }

  // Prevent creating cycles (newParent is a descendant of entity)
  if (newParent !== null && isDescendantOf(world, newParent, entity)) {
    throw new Error("Cannot create circular hierarchy");
  }

  // Remove from current parent
  const currentParent = parent(world, entity);
  if (currentParent !== null) {
    world.unrelate(entity, ChildOf, currentParent);
  }

  // Add to new parent
  if (newParent !== null) {
    world.relate(entity, ChildOf, newParent);
  }
}

/**
 * Remove parent relationship (make entity a root).
 *
 * @example
 * hierarchy.orphan(world, entity);
 */
export function orphan(world: World, entity: Entity): void {
  reparent(world, entity, null);
}

/**
 * Add a child to a parent.
 * Throws if self-parenting or cycle would be created.
 *
 * @example
 * hierarchy.addChild(world, parent, child);
 */
export function addChild(
  world: World,
  parentEntity: Entity,
  child: Entity,
): void {
  // Prevent self-parenting
  if (parentEntity === child) {
    throw new Error("Cannot parent an entity to itself");
  }

  // Prevent creating cycles (parent is a descendant of child)
  if (isDescendantOf(world, parentEntity, child)) {
    throw new Error("Cannot create circular hierarchy");
  }

  world.relate(child, ChildOf, parentEntity);
}

/**
 * Remove a specific child from a parent.
 *
 * @example
 * hierarchy.removeChild(world, parent, child);
 */
export function removeChild(
  world: World,
  parentEntity: Entity,
  child: Entity,
): void {
  world.unrelate(child, ChildOf, parentEntity);
}

/**
 * Iterate over children with a callback.
 *
 * @example
 * hierarchy.forEachChild(world, parent, (child) => {
 *   console.log(child);
 * });
 */
export function forEachChild(
  world: World,
  entity: Entity,
  callback: (child: Entity) => void,
): void {
  for (const child of children(world, entity)) {
    callback(child);
  }
}

/**
 * Iterate over descendants with a callback (depth-first).
 *
 * @example
 * hierarchy.forEachDescendant(world, root, (descendant, depth) => {
 *   console.log("  ".repeat(depth) + descendant);
 * });
 */
export function forEachDescendant(
  world: World,
  entity: Entity,
  callback: (descendant: Entity, depth: number) => void,
): void {
  function traverse(e: Entity, d: number): void {
    for (const child of children(world, e)) {
      callback(child, d);
      traverse(child, d + 1);
    }
  }
  traverse(entity, 1);
}

/**
 * Namespace export for cleaner API.
 *
 * @example
 * import { hierarchy } from "./ecs";
 *
 * const p = hierarchy.parent(world, entity);
 * const kids = hierarchy.children(world, entity);
 */
export const hierarchy = {
  parent,
  children,
  hasChildren,
  hasParent,
  isChildOf,
  ancestors,
  root,
  descendants,
  depth,
  isDescendantOf,
  isAncestorOf,
  siblings,
  reparent,
  orphan,
  addChild,
  removeChild,
  forEachChild,
  forEachDescendant,
};
