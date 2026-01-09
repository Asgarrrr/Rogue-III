/**
 * Hierarchy Tests
 */

import { describe, it, expect, beforeEach } from "bun:test";
import {
  World,
  ComponentSchema,
  ComponentType,
  type HierarchyManager,
  registerHierarchyComponents,
  createHierarchyManager,
  type Entity,
} from "../../src/game/ecs";

describe("Hierarchy", () => {
  let world: World;
  let hierarchy: HierarchyManager;

  beforeEach(() => {
    world = new World();
    hierarchy = createHierarchyManager(world);
  });

  describe("setParent", () => {
    it("should set parent-child relationship", () => {
      const parent = world.spawn();
      const child = world.spawn();

      const result = hierarchy.setParent(child, parent);

      expect(result.ok).toBe(true);
      expect(hierarchy.getParent(child)).toBe(parent);
      expect(hierarchy.getChildren(parent).has(child)).toBe(true);
    });

    it("should prevent self-parenting", () => {
      const entity = world.spawn();

      const result = hierarchy.setParent(entity, entity);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("SELF_PARENT");
      }
    });

    it("should prevent cycles", () => {
      const a = world.spawn();
      const b = world.spawn();
      const c = world.spawn();

      hierarchy.setParent(b, a);
      hierarchy.setParent(c, b);

      // Try to make a child of c (which would create a -> b -> c -> a cycle)
      const result = hierarchy.setParent(a, c);

      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error).toBe("CYCLE_DETECTED");
      }
    });

    it("should remove from old parent when reparenting", () => {
      const parent1 = world.spawn();
      const parent2 = world.spawn();
      const child = world.spawn();

      hierarchy.setParent(child, parent1);
      hierarchy.setParent(child, parent2);

      expect(hierarchy.getChildren(parent1).has(child)).toBe(false);
      expect(hierarchy.getChildren(parent2).has(child)).toBe(true);
    });

    it("should detach when setting null parent", () => {
      const parent = world.spawn();
      const child = world.spawn();

      hierarchy.setParent(child, parent);
      hierarchy.setParent(child, null);

      expect(hierarchy.getParent(child)).toBe(null);
      expect(hierarchy.getChildren(parent).has(child)).toBe(false);
    });
  });

  describe("getDepth", () => {
    it("should return 0 for root entities", () => {
      const entity = world.spawn();

      expect(hierarchy.getDepth(entity)).toBe(0);
    });

    it("should return correct depth for nested entities", () => {
      const root = world.spawn();
      const child = world.spawn();
      const grandchild = world.spawn();

      hierarchy.setParent(child, root);
      hierarchy.setParent(grandchild, child);

      expect(hierarchy.getDepth(root)).toBe(0);
      expect(hierarchy.getDepth(child)).toBe(1);
      expect(hierarchy.getDepth(grandchild)).toBe(2);
    });
  });

  describe("isDescendantOf", () => {
    it("should return true for direct descendants", () => {
      const parent = world.spawn();
      const child = world.spawn();

      hierarchy.setParent(child, parent);

      expect(hierarchy.isDescendantOf(child, parent)).toBe(true);
    });

    it("should return true for nested descendants", () => {
      const root = world.spawn();
      const child = world.spawn();
      const grandchild = world.spawn();

      hierarchy.setParent(child, root);
      hierarchy.setParent(grandchild, child);

      expect(hierarchy.isDescendantOf(grandchild, root)).toBe(true);
    });

    it("should return false for non-descendants", () => {
      const a = world.spawn();
      const b = world.spawn();

      expect(hierarchy.isDescendantOf(a, b)).toBe(false);
    });
  });

  describe("getRoot", () => {
    it("should return self for root entities", () => {
      const entity = world.spawn();

      expect(hierarchy.getRoot(entity)).toBe(entity);
    });

    it("should return root ancestor", () => {
      const root = world.spawn();
      const child = world.spawn();
      const grandchild = world.spawn();

      hierarchy.setParent(child, root);
      hierarchy.setParent(grandchild, child);

      expect(hierarchy.getRoot(grandchild)).toBe(root);
    });
  });

  describe("getAncestors", () => {
    it("should return empty array for root", () => {
      const entity = world.spawn();

      expect(hierarchy.getAncestors(entity)).toEqual([]);
    });

    it("should return ancestors from nearest to farthest", () => {
      const root = world.spawn();
      const child = world.spawn();
      const grandchild = world.spawn();

      hierarchy.setParent(child, root);
      hierarchy.setParent(grandchild, child);

      const ancestors = hierarchy.getAncestors(grandchild);

      expect(ancestors).toHaveLength(2);
      expect(ancestors[0]).toBe(child);
      expect(ancestors[1]).toBe(root);
    });
  });

  describe("getDescendants", () => {
    it("should return all descendants in BFS order", () => {
      const root = world.spawn();
      const child1 = world.spawn();
      const child2 = world.spawn();
      const grandchild = world.spawn();

      hierarchy.setParent(child1, root);
      hierarchy.setParent(child2, root);
      hierarchy.setParent(grandchild, child1);

      const descendants = hierarchy.getDescendants(root);

      expect(descendants).toHaveLength(3);
      // BFS order: children first, then grandchildren
      expect(descendants).toContain(child1);
      expect(descendants).toContain(child2);
      expect(descendants).toContain(grandchild);
    });
  });

  describe("despawnRecursive", () => {
    it("should despawn entity and all descendants", () => {
      const root = world.spawn();
      const child = world.spawn();
      const grandchild = world.spawn();

      hierarchy.setParent(child, root);
      hierarchy.setParent(grandchild, child);

      hierarchy.despawnRecursive(root);

      expect(world.entities.isAlive(root)).toBe(false);
      expect(world.entities.isAlive(child)).toBe(false);
      expect(world.entities.isAlive(grandchild)).toBe(false);
    });

    it("should remove from parent before despawning", () => {
      const parent = world.spawn();
      const child = world.spawn();
      const grandchild = world.spawn();

      hierarchy.setParent(child, parent);
      hierarchy.setParent(grandchild, child);

      hierarchy.despawnRecursive(child);

      expect(world.entities.isAlive(parent)).toBe(true);
      expect(hierarchy.getChildren(parent).size).toBe(0);
    });
  });

  describe("reparentChildren", () => {
    it("should move all children to new parent", () => {
      const parent1 = world.spawn();
      const parent2 = world.spawn();
      const child1 = world.spawn();
      const child2 = world.spawn();

      hierarchy.setParent(child1, parent1);
      hierarchy.setParent(child2, parent1);

      hierarchy.reparentChildren(parent1, parent2);

      expect(hierarchy.getChildren(parent1).size).toBe(0);
      expect(hierarchy.getChildren(parent2).has(child1)).toBe(true);
      expect(hierarchy.getChildren(parent2).has(child2)).toBe(true);
    });

    it("should detach children when new parent is null", () => {
      const parent = world.spawn();
      const child1 = world.spawn();
      const child2 = world.spawn();

      hierarchy.setParent(child1, parent);
      hierarchy.setParent(child2, parent);

      hierarchy.reparentChildren(parent, null);

      expect(hierarchy.getChildren(parent).size).toBe(0);
      expect(hierarchy.getParent(child1)).toBe(null);
      expect(hierarchy.getParent(child2)).toBe(null);
    });
  });

  describe("forEachDescendant", () => {
    it("should iterate with correct depth", () => {
      const root = world.spawn();
      const child = world.spawn();
      const grandchild = world.spawn();

      hierarchy.setParent(child, root);
      hierarchy.setParent(grandchild, child);

      const visited: Array<{ entity: Entity; depth: number }> = [];

      hierarchy.forEachDescendant(root, (entity, depth) => {
        visited.push({ entity, depth });
      });

      expect(visited).toHaveLength(2);
      expect(visited.find((v) => v.entity === child)?.depth).toBe(1);
      expect(visited.find((v) => v.entity === grandchild)?.depth).toBe(2);
    });
  });
});
