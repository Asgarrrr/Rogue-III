/**
 * Hierarchical Entities
 *
 * Parent/child relationships for inventory, equipment, and nested structures.
 * Provides efficient traversal and automatic cleanup.
 */

import { ComponentSchema, ComponentType } from "../core/component";
import type { Entity } from "../types";
import { NULL_ENTITY } from "../core/entity";
import type { World } from "../core/world";

// ============================================================================
// Hierarchy Components
// ============================================================================

/**
 * Parent component - reference to parent entity.
 */
export const ParentSchema = ComponentSchema.define<{ parent: number }>("Parent")
  .field("parent", ComponentType.U32, 0)
  .build();

/**
 * Children component - set of child entity IDs.
 */
export interface ChildrenData {
  readonly children: Set<Entity>;
}

export const ChildrenSchema = ComponentSchema.define<ChildrenData>("Children")
  .field("children", ComponentType.Object, () => new Set<Entity>())
  .useAoS()
  .build();

/**
 * Hierarchy depth for traversal ordering.
 */
export const HierarchyDepthSchema = ComponentSchema.define<{ depth: number }>(
  "HierarchyDepth",
)
  .field("depth", ComponentType.U16, 0)
  .build();

// ============================================================================
// Hierarchy Types
// ============================================================================

/**
 * Result type for hierarchy operations.
 */
export type HierarchyResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: HierarchyError };

/**
 * Hierarchy error types.
 */
export type HierarchyError =
  | "ENTITY_NOT_ALIVE"
  | "CYCLE_DETECTED"
  | "SELF_PARENT"
  | "MAX_DEPTH_EXCEEDED"
  | "PARENT_NOT_ALIVE";

/**
 * Maximum hierarchy depth to prevent infinite recursion.
 */
const MAX_HIERARCHY_DEPTH = 32;

// ============================================================================
// Hierarchy Manager
// ============================================================================

/**
 * Manages parent/child relationships between entities.
 *
 * Should be registered as a world resource for shared access.
 */
export class HierarchyManager {
  private readonly emptyChildren: ReadonlySet<Entity> = new Set();
  private readonly ancestorCache = new Map<Entity, readonly Entity[]>();
  private cacheVersion = 0;

  constructor(private readonly world: World) {}

  /**
   * Sets the parent of an entity.
   */
  setParent(child: Entity, parent: Entity | null): HierarchyResult<void> {
    // Validate child
    if (!this.world.entities.isAlive(child)) {
      return { ok: false, error: "ENTITY_NOT_ALIVE" };
    }

    // Validate parent
    if (parent !== null) {
      if (!this.world.entities.isAlive(parent)) {
        return { ok: false, error: "PARENT_NOT_ALIVE" };
      }

      if (child === parent) {
        return { ok: false, error: "SELF_PARENT" };
      }

      // Check for cycles
      if (this.isDescendantOf(parent, child)) {
        return { ok: false, error: "CYCLE_DETECTED" };
      }

      // Check depth limit
      const parentDepth = this.getDepth(parent);
      if (parentDepth >= MAX_HIERARCHY_DEPTH - 1) {
        return { ok: false, error: "MAX_DEPTH_EXCEEDED" };
      }
    }

    // Remove from old parent
    const oldParent = this.getParent(child);
    if (oldParent !== null) {
      this.removeChildInternal(oldParent, child);
    }

    // Invalidate cache
    this.invalidateCache();

    if (parent === null) {
      this.world.removeComponent(child, "Parent");
      this.world.removeComponent(child, "HierarchyDepth");
    } else {
      this.world.addComponent(child, "Parent", { parent: parent as number });
      this.addChildInternal(parent, child);

      const newDepth = this.getDepth(parent) + 1;
      this.world.addComponent(child, "HierarchyDepth", { depth: newDepth });

      // Propagate depth to descendants
      this.updateDescendantDepths(child, newDepth);
    }

    return { ok: true, value: undefined };
  }

  /**
   * Gets the parent of an entity.
   */
  getParent(entity: Entity): Entity | null {
    const parentComp = this.world.getComponent<{ parent: number }>(
      entity,
      "Parent",
    );
    if (!parentComp) return null;

    const parent = parentComp.parent as Entity;

    // Validate parent is still alive
    if (!this.world.entities.isAlive(parent)) {
      // Auto-cleanup stale reference
      this.world.removeComponent(entity, "Parent");
      return null;
    }

    return parent;
  }

  /**
   * Gets the children of an entity (read-only).
   */
  getChildren(entity: Entity): ReadonlySet<Entity> {
    return this.getChildrenInternal(entity);
  }

  /**
   * Gets a mutable copy of children for safe iteration with modification.
   */
  getChildrenMutable(entity: Entity): Set<Entity> {
    return new Set(this.getChildrenInternal(entity));
  }

  /**
   * Gets the number of children.
   */
  getChildCount(entity: Entity): number {
    return this.getChildrenInternal(entity).size;
  }

  /**
   * Checks if an entity has children.
   */
  hasChildren(entity: Entity): boolean {
    return this.getChildCount(entity) > 0;
  }

  /**
   * Checks if an entity is a descendant of another.
   */
  isDescendantOf(entity: Entity, potentialAncestor: Entity): boolean {
    let current = this.getParent(entity);

    while (current !== null) {
      if (current === potentialAncestor) return true;
      current = this.getParent(current);
    }

    return false;
  }

  /**
   * Gets the hierarchy depth of an entity (0 = root).
   */
  getDepth(entity: Entity): number {
    const depth = this.world.getComponent<{ depth: number }>(
      entity,
      "HierarchyDepth",
    );
    return depth?.depth ?? 0;
  }

  /**
   * Gets the root ancestor of an entity.
   */
  getRoot(entity: Entity): Entity {
    let current = entity;
    let parent = this.getParent(current);

    while (parent !== null) {
      current = parent;
      parent = this.getParent(current);
    }

    return current;
  }

  /**
   * Gets all ancestors from nearest to farthest.
   */
  getAncestors(entity: Entity): readonly Entity[] {
    const cached = this.ancestorCache.get(entity);
    if (cached) return cached;

    const ancestors: Entity[] = [];
    let current = this.getParent(entity);

    while (current !== null) {
      ancestors.push(current);
      current = this.getParent(current);
    }

    this.ancestorCache.set(entity, ancestors);
    return ancestors;
  }

  /**
   * Gets all descendants in BFS order.
   */
  getDescendants(entity: Entity): Entity[] {
    const descendants: Entity[] = [];
    const queue: Entity[] = [entity];

    while (queue.length > 0) {
      const current = queue.shift()!;

      for (const child of this.getChildrenInternal(current)) {
        descendants.push(child);
        queue.push(child);
      }
    }

    return descendants;
  }

  /**
   * Iterates over descendants without allocation.
   */
  forEachDescendant(
    entity: Entity,
    fn: (descendant: Entity, depth: number) => void,
  ): void {
    const visit = (e: Entity, depth: number): void => {
      for (const child of this.getChildrenInternal(e)) {
        fn(child, depth);
        visit(child, depth + 1);
      }
    };

    visit(entity, 1);
  }

  /**
   * Despawns an entity and all its descendants.
   */
  despawnRecursive(entity: Entity): void {
    const toDelete = this.getDescendants(entity);
    toDelete.push(entity);

    // Remove from parent
    const parent = this.getParent(entity);
    if (parent !== null) {
      this.removeChildInternal(parent, entity);
    }

    // Delete in reverse order (children first)
    for (let i = toDelete.length - 1; i >= 0; i--) {
      this.world.despawn(toDelete[i]);
    }

    this.invalidateCache();
  }

  /**
   * Reparents all children to a new parent.
   */
  reparentChildren(from: Entity, to: Entity | null): void {
    const children = this.getChildrenMutable(from);

    for (const child of children) {
      this.setParent(child, to);
    }
  }

  /**
   * Detaches an entity from its parent without despawning.
   */
  detach(entity: Entity): HierarchyResult<void> {
    return this.setParent(entity, null);
  }

  // ============================================================================
  // Internal Methods
  // ============================================================================

  private getChildrenInternal(entity: Entity): Set<Entity> {
    const childrenComp = this.world.getComponent<ChildrenData>(
      entity,
      "Children",
    );
    return childrenComp?.children ?? (this.emptyChildren as Set<Entity>);
  }

  private addChildInternal(parent: Entity, child: Entity): void {
    let childrenComp = this.world.getComponent<ChildrenData>(
      parent,
      "Children",
    );

    if (!childrenComp) {
      const newSet = new Set<Entity>();
      this.world.addComponent(parent, "Children", { children: newSet });
      childrenComp = this.world.getComponent<ChildrenData>(parent, "Children")!;
    }

    childrenComp.children.add(child);
  }

  private removeChildInternal(parent: Entity, child: Entity): void {
    const childrenComp = this.world.getComponent<ChildrenData>(
      parent,
      "Children",
    );

    if (childrenComp) {
      childrenComp.children.delete(child);

      // Cleanup empty component
      if (childrenComp.children.size === 0) {
        this.world.removeComponent(parent, "Children");
      }
    }
  }

  private updateDescendantDepths(entity: Entity, parentDepth: number): void {
    const children = this.getChildrenInternal(entity);
    const newDepth = parentDepth + 1;

    for (const child of children) {
      this.world.addComponent(child, "HierarchyDepth", { depth: newDepth });
      this.updateDescendantDepths(child, newDepth);
    }
  }

  private invalidateCache(): void {
    this.cacheVersion++;
    this.ancestorCache.clear();
  }
}

/**
 * Registers hierarchy components with the world.
 */
export function registerHierarchyComponents(world: World): void {
  world.registerComponent(ParentSchema);
  world.registerComponent(ChildrenSchema);
  world.registerComponent(HierarchyDepthSchema);
}

/**
 * Creates and registers a HierarchyManager for the world.
 */
export function createHierarchyManager(world: World): HierarchyManager {
  registerHierarchyComponents(world);
  const manager = new HierarchyManager(world);
  world.resources.register("hierarchy", manager);
  return manager;
}
