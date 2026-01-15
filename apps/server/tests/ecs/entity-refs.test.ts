import { describe, it, expect, beforeEach } from "bun:test";
import {
  World,
  component,
  f32,
  u32,
  entityRef,
  type Entity,
  NULL_ENTITY,
} from "@rogue/ecs";

// Test components with entity reference fields
@component
class Targeting {
  target = entityRef(0);
  priority = u32(0);
}

@component
class Position {
  x = f32(0);
  y = f32(0);
}

@component
class Parent {
  parent = entityRef(0);
}

@component
class MultiRef {
  primary = entityRef(0);
  secondary = entityRef(0);
}

describe("Entity Reference Validation", () => {
  let world: World;

  beforeEach(() => {
    world = new World();
  });

  describe("Basic Operations", () => {
    it("should set and get entity reference", () => {
      const entity = world.spawn(Targeting);
      const target = world.spawn(Position);

      world.setEntityRef(entity, Targeting, "target", target);

      const ref = world.getEntityRef(entity, Targeting, "target");
      expect(ref).toBe(target);
    });

    it("should return null for dead entity reference", () => {
      const entity = world.spawn(Targeting);
      const target = world.spawn(Position);

      world.setEntityRef(entity, Targeting, "target", target);
      world.despawn(target);

      // getEntityRef validates that target is alive
      const ref = world.getEntityRef(entity, Targeting, "target");
      expect(ref).toBeNull();
    });

    it("should return NULL_ENTITY after target is despawned (auto-nullification)", () => {
      const entity = world.spawn(Targeting);
      const target = world.spawn(Position);

      world.setEntityRef(entity, Targeting, "target", target);
      world.despawn(target);

      // After despawn, refs to the target are automatically nullified
      const rawRef = world.getEntityRefRaw(entity, Targeting, "target");
      expect(rawRef).toBe(NULL_ENTITY);
    });

    it("should return null for NULL_ENTITY reference", () => {
      const entity = world.spawn(Targeting);

      world.setEntityRef(entity, Targeting, "target", NULL_ENTITY);

      const ref = world.getEntityRef(entity, Targeting, "target");
      expect(ref).toBeNull();
    });

    it("should return null for non-existent entity", () => {
      const entity = world.spawn(Targeting);
      world.despawn(entity);

      const ref = world.getEntityRef(entity, Targeting, "target");
      expect(ref).toBeNull();
    });

    it("should return null for entity without component", () => {
      const entity = world.spawn(Position);

      const ref = world.getEntityRef(entity, Targeting, "target");
      expect(ref).toBeNull();
    });

    it("should return false when setting on dead entity", () => {
      const entity = world.spawn(Targeting);
      const target = world.spawn(Position);
      world.despawn(entity);

      const result = world.setEntityRef(entity, Targeting, "target", target);
      expect(result).toBe(false);
    });

    it("should return false when setting non-entity field", () => {
      const entity = world.spawn(Targeting);
      const target = world.spawn(Position);

      // "priority" is u32, not entityRef
      const result = world.setEntityRef(
        entity,
        Targeting,
        "priority" as "target",
        target,
      );
      expect(result).toBe(false);
    });
  });

  describe("Reference Tracking", () => {
    it("should track references for validation", () => {
      const entity1 = world.spawn(Targeting);
      const entity2 = world.spawn(Targeting);
      const target = world.spawn(Position);

      world.setEntityRef(entity1, Targeting, "target", target);
      world.setEntityRef(entity2, Targeting, "target", target);

      expect(world.entityRefs.size).toBe(2);
    });

    it("should untrack when reference is changed", () => {
      const entity = world.spawn(Targeting);
      const target1 = world.spawn(Position);
      const target2 = world.spawn(Position);

      world.setEntityRef(entity, Targeting, "target", target1);
      expect(world.entityRefs.size).toBe(1);

      world.setEntityRef(entity, Targeting, "target", target2);
      expect(world.entityRefs.size).toBe(1);
    });

    it("should untrack when reference is set to NULL_ENTITY", () => {
      const entity = world.spawn(Targeting);
      const target = world.spawn(Position);

      world.setEntityRef(entity, Targeting, "target", target);
      expect(world.entityRefs.size).toBe(1);

      world.setEntityRef(entity, Targeting, "target", NULL_ENTITY);
      expect(world.entityRefs.size).toBe(0);
    });

    it("should clean up refs when source entity is despawned", () => {
      const entity = world.spawn(Targeting);
      const target = world.spawn(Position);

      world.setEntityRef(entity, Targeting, "target", target);
      expect(world.entityRefs.size).toBe(1);

      world.despawn(entity);
      expect(world.entityRefs.size).toBe(0);
    });

    it("should clean up refs when target entity is despawned", () => {
      const entity = world.spawn(Targeting);
      const target = world.spawn(Position);

      world.setEntityRef(entity, Targeting, "target", target);
      expect(world.entityRefs.size).toBe(1);

      world.despawn(target);
      expect(world.entityRefs.size).toBe(0);
    });
  });

  describe("Automatic Nullification", () => {
    it("should manually nullify refs to a target", () => {
      const entity1 = world.spawn(Targeting);
      const entity2 = world.spawn(Targeting);
      const target = world.spawn(Position);

      world.setEntityRef(entity1, Targeting, "target", target);
      world.setEntityRef(entity2, Targeting, "target", target);

      // Manually nullify all refs to target
      const count = world.nullifyRefsTo(target);
      expect(count).toBe(2);

      // Both refs should now be NULL_ENTITY
      expect(world.getEntityRefRaw(entity1, Targeting, "target")).toBe(
        NULL_ENTITY,
      );
      expect(world.getEntityRefRaw(entity2, Targeting, "target")).toBe(
        NULL_ENTITY,
      );
    });

    it("should not affect refs to other entities", () => {
      const entity = world.spawn(MultiRef);
      const target1 = world.spawn(Position);
      const target2 = world.spawn(Position);

      world.setEntityRef(entity, MultiRef, "primary", target1);
      world.setEntityRef(entity, MultiRef, "secondary", target2);

      world.nullifyRefsTo(target1);

      expect(world.getEntityRefRaw(entity, MultiRef, "primary")).toBe(
        NULL_ENTITY,
      );
      expect(world.getEntityRef(entity, MultiRef, "secondary")).toBe(target2);
    });
  });

  describe("Multiple References", () => {
    it("should handle multiple refs in same component", () => {
      const entity = world.spawn(MultiRef);
      const target1 = world.spawn(Position);
      const target2 = world.spawn(Position);

      world.setEntityRef(entity, MultiRef, "primary", target1);
      world.setEntityRef(entity, MultiRef, "secondary", target2);

      expect(world.getEntityRef(entity, MultiRef, "primary")).toBe(target1);
      expect(world.getEntityRef(entity, MultiRef, "secondary")).toBe(target2);
      expect(world.entityRefs.size).toBe(2);
    });

    it("should track refs from multiple entities to same target", () => {
      const target = world.spawn(Position);
      const entities: Entity[] = [];

      for (let i = 0; i < 10; i++) {
        const e = world.spawn(Targeting);
        world.setEntityRef(e, Targeting, "target", target);
        entities.push(e);
      }

      expect(world.entityRefs.size).toBe(10);

      // All should point to target
      for (const e of entities) {
        expect(world.getEntityRef(e, Targeting, "target")).toBe(target);
      }
    });
  });

  describe("Parent-Child Relationships via EntityRef", () => {
    it("should support parent reference pattern", () => {
      const parent = world.spawn(Position);
      const child = world.spawn(Parent, Position);

      world.setEntityRef(child, Parent, "parent", parent);

      expect(world.getEntityRef(child, Parent, "parent")).toBe(parent);
    });

    it("should invalidate parent ref when parent dies", () => {
      const parent = world.spawn(Position);
      const child = world.spawn(Parent, Position);

      world.setEntityRef(child, Parent, "parent", parent);
      world.despawn(parent);

      // Parent ref should now return null (dead)
      expect(world.getEntityRef(child, Parent, "parent")).toBeNull();
    });
  });
});

describe("Entity Ref Performance", () => {
  it("should handle many refs efficiently", () => {
    const world = new World(10_000);
    const target = world.spawn(Position);
    const entities: Entity[] = [];

    const start = performance.now();

    // Create 1000 entities all targeting the same entity
    for (let i = 0; i < 1000; i++) {
      const e = world.spawn(Targeting);
      world.setEntityRef(e, Targeting, "target", target);
      entities.push(e);
    }

    const createTime = performance.now() - start;
    console.log(`  Create 1000 refs: ${createTime.toFixed(2)}ms`);

    // Read all refs
    const readStart = performance.now();
    for (const e of entities) {
      world.getEntityRef(e, Targeting, "target");
    }
    const readTime = performance.now() - readStart;
    console.log(`  Read 1000 refs: ${readTime.toFixed(2)}ms`);

    // Despawn target - should clean up all refs
    const despawnStart = performance.now();
    world.despawn(target);
    const despawnTime = performance.now() - despawnStart;
    console.log(`  Despawn target (cleanup 1000 refs): ${despawnTime.toFixed(2)}ms`);

    expect(createTime).toBeLessThan(100);
    expect(readTime).toBeLessThan(50);
    expect(despawnTime).toBeLessThan(50);
    expect(world.entityRefs.size).toBe(0);
  });

  it("should handle ref updates efficiently", () => {
    const world = new World(10_000);
    const entities: Entity[] = [];
    const targets: Entity[] = [];

    // Create targets
    for (let i = 0; i < 100; i++) {
      targets.push(world.spawn(Position));
    }

    // Create entities
    for (let i = 0; i < 1000; i++) {
      entities.push(world.spawn(Targeting));
    }

    const start = performance.now();

    // Each entity changes target 10 times
    for (let round = 0; round < 10; round++) {
      for (let i = 0; i < entities.length; i++) {
        const target = targets[(i + round) % targets.length];
        world.setEntityRef(entities[i], Targeting, "target", target);
      }
    }

    const updateTime = performance.now() - start;
    console.log(`  10000 ref updates: ${updateTime.toFixed(2)}ms`);

    expect(updateTime).toBeLessThan(200);
  });
});
