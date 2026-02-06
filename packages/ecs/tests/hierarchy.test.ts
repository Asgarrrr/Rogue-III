import { describe, it, expect, beforeEach } from "bun:test";
import {
  World,
  component,
  f32,
  ChildOf,
  hierarchy,
  type Entity,
} from "@rogue/ecs";

@component
class Position {
  x = f32(0);
  y = f32(0);
}

@component
class Name {
  id = f32(0);
}

describe("Hierarchy Helpers", () => {
  let world: World;

  beforeEach(() => {
    world = new World(1000);
  });

  describe("parent() and children()", () => {
    it("returns null for entity with no parent", () => {
      const entity = world.spawn(Position);
      expect(hierarchy.parent(world, entity)).toBe(null);
    });

    it("returns parent after relating", () => {
      const parent = world.spawn(Position);
      const child = world.spawn(Position);

      world.relate(child, ChildOf, parent);

      expect(hierarchy.parent(world, child)).toBe(parent);
    });

    it("returns empty array for entity with no children", () => {
      const entity = world.spawn(Position);
      expect(hierarchy.children(world, entity)).toEqual([]);
    });

    it("returns children after relating", () => {
      const parent = world.spawn(Position);
      const child1 = world.spawn(Position);
      const child2 = world.spawn(Position);

      world.relate(child1, ChildOf, parent);
      world.relate(child2, ChildOf, parent);

      const kids = hierarchy.children(world, parent);
      expect(kids).toContain(child1);
      expect(kids).toContain(child2);
      expect(kids.length).toBe(2);
    });
  });

  describe("hasParent() and hasChildren()", () => {
    it("hasParent() returns correct value", () => {
      const parent = world.spawn(Position);
      const child = world.spawn(Position);

      expect(hierarchy.hasParent(world, child)).toBe(false);

      world.relate(child, ChildOf, parent);
      expect(hierarchy.hasParent(world, child)).toBe(true);
    });

    it("hasChildren() returns correct value", () => {
      const parent = world.spawn(Position);
      const child = world.spawn(Position);

      expect(hierarchy.hasChildren(world, parent)).toBe(false);

      world.relate(child, ChildOf, parent);
      expect(hierarchy.hasChildren(world, parent)).toBe(true);
    });
  });

  describe("isChildOf()", () => {
    it("returns true for direct parent-child relation", () => {
      const parent = world.spawn(Position);
      const child = world.spawn(Position);

      world.relate(child, ChildOf, parent);

      expect(hierarchy.isChildOf(world, child, parent)).toBe(true);
    });

    it("returns false for unrelated entities", () => {
      const e1 = world.spawn(Position);
      const e2 = world.spawn(Position);

      expect(hierarchy.isChildOf(world, e1, e2)).toBe(false);
    });
  });

  describe("ancestors()", () => {
    it("returns empty array for root entity", () => {
      const root = world.spawn(Position);
      expect(hierarchy.ancestors(world, root)).toEqual([]);
    });

    it("returns ancestors in order", () => {
      const grandparent = world.spawn(Position);
      const parent = world.spawn(Position);
      const child = world.spawn(Position);

      world.relate(parent, ChildOf, grandparent);
      world.relate(child, ChildOf, parent);

      const anc = hierarchy.ancestors(world, child);
      expect(anc).toEqual([parent, grandparent]);
    });
  });

  describe("root()", () => {
    it("returns entity itself if no parent", () => {
      const entity = world.spawn(Position);
      expect(hierarchy.root(world, entity)).toBe(entity);
    });

    it("returns root ancestor", () => {
      const root = world.spawn(Position);
      const middle = world.spawn(Position);
      const leaf = world.spawn(Position);

      world.relate(middle, ChildOf, root);
      world.relate(leaf, ChildOf, middle);

      expect(hierarchy.root(world, leaf)).toBe(root);
      expect(hierarchy.root(world, middle)).toBe(root);
      expect(hierarchy.root(world, root)).toBe(root);
    });
  });

  describe("descendants()", () => {
    it("returns empty array for leaf entity", () => {
      const leaf = world.spawn(Position);
      expect(hierarchy.descendants(world, leaf)).toEqual([]);
    });

    it("returns all descendants breadth-first", () => {
      const root = world.spawn(Position);
      const child1 = world.spawn(Position);
      const child2 = world.spawn(Position);
      const grandchild1 = world.spawn(Position);
      const grandchild2 = world.spawn(Position);

      world.relate(child1, ChildOf, root);
      world.relate(child2, ChildOf, root);
      world.relate(grandchild1, ChildOf, child1);
      world.relate(grandchild2, ChildOf, child2);

      const desc = hierarchy.descendants(world, root);
      expect(desc.length).toBe(4);
      expect(desc).toContain(child1);
      expect(desc).toContain(child2);
      expect(desc).toContain(grandchild1);
      expect(desc).toContain(grandchild2);
    });
  });

  describe("depth()", () => {
    it("returns 0 for root entity", () => {
      const root = world.spawn(Position);
      expect(hierarchy.depth(world, root)).toBe(0);
    });

    it("returns correct depth", () => {
      const root = world.spawn(Position);
      const child = world.spawn(Position);
      const grandchild = world.spawn(Position);

      world.relate(child, ChildOf, root);
      world.relate(grandchild, ChildOf, child);

      expect(hierarchy.depth(world, root)).toBe(0);
      expect(hierarchy.depth(world, child)).toBe(1);
      expect(hierarchy.depth(world, grandchild)).toBe(2);
    });
  });

  describe("isDescendantOf() and isAncestorOf()", () => {
    it("isDescendantOf() returns true for descendants", () => {
      const root = world.spawn(Position);
      const child = world.spawn(Position);
      const grandchild = world.spawn(Position);

      world.relate(child, ChildOf, root);
      world.relate(grandchild, ChildOf, child);

      expect(hierarchy.isDescendantOf(world, grandchild, root)).toBe(true);
      expect(hierarchy.isDescendantOf(world, grandchild, child)).toBe(true);
      expect(hierarchy.isDescendantOf(world, child, root)).toBe(true);
      expect(hierarchy.isDescendantOf(world, root, grandchild)).toBe(false);
    });

    it("isAncestorOf() is inverse of isDescendantOf()", () => {
      const root = world.spawn(Position);
      const child = world.spawn(Position);

      world.relate(child, ChildOf, root);

      expect(hierarchy.isAncestorOf(world, root, child)).toBe(true);
      expect(hierarchy.isAncestorOf(world, child, root)).toBe(false);
    });
  });

  describe("siblings()", () => {
    it("returns empty array for root entity", () => {
      const root = world.spawn(Position);
      expect(hierarchy.siblings(world, root)).toEqual([]);
    });

    it("returns siblings (other children of same parent)", () => {
      const parent = world.spawn(Position);
      const child1 = world.spawn(Position);
      const child2 = world.spawn(Position);
      const child3 = world.spawn(Position);

      world.relate(child1, ChildOf, parent);
      world.relate(child2, ChildOf, parent);
      world.relate(child3, ChildOf, parent);

      const sibs = hierarchy.siblings(world, child1);
      expect(sibs.length).toBe(2);
      expect(sibs).toContain(child2);
      expect(sibs).toContain(child3);
      expect(sibs).not.toContain(child1);
    });
  });

  describe("reparent()", () => {
    it("changes parent", () => {
      const parent1 = world.spawn(Position);
      const parent2 = world.spawn(Position);
      const child = world.spawn(Position);

      world.relate(child, ChildOf, parent1);
      expect(hierarchy.parent(world, child)).toBe(parent1);

      hierarchy.reparent(world, child, parent2);
      expect(hierarchy.parent(world, child)).toBe(parent2);
      expect(hierarchy.children(world, parent1)).toEqual([]);
      expect(hierarchy.children(world, parent2)).toContain(child);
    });

    it("can set to null to make root", () => {
      const parent = world.spawn(Position);
      const child = world.spawn(Position);

      world.relate(child, ChildOf, parent);
      hierarchy.reparent(world, child, null);

      expect(hierarchy.parent(world, child)).toBe(null);
    });
  });

  describe("orphan()", () => {
    it("removes parent relationship", () => {
      const parent = world.spawn(Position);
      const child = world.spawn(Position);

      world.relate(child, ChildOf, parent);
      expect(hierarchy.hasParent(world, child)).toBe(true);

      hierarchy.orphan(world, child);
      expect(hierarchy.hasParent(world, child)).toBe(false);
    });
  });

  describe("addChild() and removeChild()", () => {
    it("addChild() creates parent-child relation", () => {
      const parent = world.spawn(Position);
      const child = world.spawn(Position);

      hierarchy.addChild(world, parent, child);
      expect(hierarchy.parent(world, child)).toBe(parent);
    });

    it("removeChild() removes parent-child relation", () => {
      const parent = world.spawn(Position);
      const child = world.spawn(Position);

      hierarchy.addChild(world, parent, child);
      hierarchy.removeChild(world, parent, child);

      expect(hierarchy.parent(world, child)).toBe(null);
    });

    it("addChild() throws on self-parenting", () => {
      const entity = world.spawn(Position);
      expect(() => hierarchy.addChild(world, entity, entity)).toThrow(
        "Cannot parent an entity to itself",
      );
    });

    it("addChild() throws on cycle creation", () => {
      const grandparent = world.spawn(Position);
      const parent = world.spawn(Position);
      const child = world.spawn(Position);

      hierarchy.addChild(world, grandparent, parent);
      hierarchy.addChild(world, parent, child);

      // Try to make grandparent a child of child (creating a cycle)
      expect(() => hierarchy.addChild(world, child, grandparent)).toThrow(
        "Cannot create circular hierarchy",
      );
    });
  });

  describe("reparent() safety", () => {
    it("reparent() throws on self-parenting", () => {
      const entity = world.spawn(Position);
      expect(() => hierarchy.reparent(world, entity, entity)).toThrow(
        "Cannot parent an entity to itself",
      );
    });

    it("reparent() throws on cycle creation", () => {
      const parent = world.spawn(Position);
      const child = world.spawn(Position);
      const grandchild = world.spawn(Position);

      hierarchy.addChild(world, parent, child);
      hierarchy.addChild(world, child, grandchild);

      // Try to make parent a child of grandchild (creating a cycle)
      expect(() => hierarchy.reparent(world, parent, grandchild)).toThrow(
        "Cannot create circular hierarchy",
      );
    });
  });

  describe("forEachChild() and forEachDescendant()", () => {
    it("forEachChild() iterates over direct children", () => {
      const parent = world.spawn(Position);
      const child1 = world.spawn(Position);
      const child2 = world.spawn(Position);

      world.relate(child1, ChildOf, parent);
      world.relate(child2, ChildOf, parent);

      const collected: Entity[] = [];
      hierarchy.forEachChild(world, parent, (child) => {
        collected.push(child);
      });

      expect(collected.length).toBe(2);
      expect(collected).toContain(child1);
      expect(collected).toContain(child2);
    });

    it("forEachDescendant() iterates depth-first with depth", () => {
      const root = world.spawn(Position);
      const child = world.spawn(Position);
      const grandchild = world.spawn(Position);

      world.relate(child, ChildOf, root);
      world.relate(grandchild, ChildOf, child);

      const collected: Array<{ entity: Entity; depth: number }> = [];
      hierarchy.forEachDescendant(world, root, (entity, depth) => {
        collected.push({ entity, depth });
      });

      expect(collected.length).toBe(2);
      expect(collected[0]).toEqual({ entity: child, depth: 1 });
      expect(collected[1]).toEqual({ entity: grandchild, depth: 2 });
    });
  });
});
