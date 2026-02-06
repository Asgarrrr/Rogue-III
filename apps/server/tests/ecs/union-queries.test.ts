import { describe, it, expect, beforeEach } from "bun:test";
import {
  World,
  component,
  f32,
  u32,
  type Entity,
} from "@rogue/ecs";

// Test components
@component
class Sprite {
  texture = u32(0);
}

@component
class Mesh {
  model = u32(0);
}

@component
class Particle {
  lifetime = f32(1.0);
}

@component
class Position {
  x = f32(0);
  y = f32(0);
}

@component
class Hidden {}

@component
class Disabled {}

describe("Union Queries (queryAny)", () => {
  let world: World;

  beforeEach(() => {
    world = new World();
  });

  describe("Basic Union Queries", () => {
    it("should query entities with ANY of the specified components", () => {
      const e1 = world.spawn(Sprite);
      const e2 = world.spawn(Mesh);
      const e3 = world.spawn(Particle);
      const e4 = world.spawn(Position); // Should not be included

      const results = world.queryAny(Sprite, Mesh, Particle).collect();

      expect(results).toHaveLength(3);
      expect(results).toContain(e1);
      expect(results).toContain(e2);
      expect(results).toContain(e3);
      expect(results).not.toContain(e4);
    });

    it("should include entities with multiple matching components only once", () => {
      const e1 = world.spawn(Sprite, Mesh); // Has both
      const e2 = world.spawn(Sprite);
      const e3 = world.spawn(Mesh);

      const results = world.queryAny(Sprite, Mesh).collect();

      expect(results).toHaveLength(3);
      expect(results).toContain(e1);
      expect(results).toContain(e2);
      expect(results).toContain(e3);
    });

    it("should return empty array when no entities match", () => {
      world.spawn(Position);
      world.spawn(Position);

      const results = world.queryAny(Sprite, Mesh).collect();

      expect(results).toHaveLength(0);
    });
  });

  describe("Union Query with .not()", () => {
    it("should exclude entities with specified components", () => {
      const e1 = world.spawn(Sprite);
      const e2 = world.spawn(Mesh, Hidden);
      const e3 = world.spawn(Particle);
      const e4 = world.spawn(Sprite, Hidden);

      const results = world.queryAny(Sprite, Mesh, Particle).not(Hidden).collect();

      expect(results).toHaveLength(2);
      expect(results).toContain(e1);
      expect(results).toContain(e3);
      expect(results).not.toContain(e2);
      expect(results).not.toContain(e4);
    });

    it("should support multiple .not() calls", () => {
      const e1 = world.spawn(Sprite);
      const e2 = world.spawn(Mesh, Hidden);
      const e3 = world.spawn(Particle, Disabled);
      const e4 = world.spawn(Sprite, Hidden, Disabled);

      const results = world
        .queryAny(Sprite, Mesh, Particle)
        .not(Hidden)
        .not(Disabled)
        .collect();

      expect(results).toHaveLength(1);
      expect(results).toContain(e1);
    });
  });

  describe("Union Query .count()", () => {
    it("should count matching entities", () => {
      world.spawn(Sprite);
      world.spawn(Mesh);
      world.spawn(Particle);
      world.spawn(Position);

      const count = world.queryAny(Sprite, Mesh, Particle).count();

      expect(count).toBe(3);
    });

    it("should count entities with multiple matching components only once", () => {
      world.spawn(Sprite, Mesh);
      world.spawn(Sprite);
      world.spawn(Mesh);

      const count = world.queryAny(Sprite, Mesh).count();

      expect(count).toBe(3);
    });

    it("should return 0 when no entities match", () => {
      world.spawn(Position);

      const count = world.queryAny(Sprite, Mesh).count();

      expect(count).toBe(0);
    });
  });

  describe("Union Query .first()", () => {
    it("should return the first matching entity", () => {
      const e1 = world.spawn(Sprite);
      world.spawn(Mesh);
      world.spawn(Particle);

      const first = world.queryAny(Sprite, Mesh, Particle).first();

      expect(first).not.toBeNull();
      expect([e1]).toContainEqual(first);
    });

    it("should return null when no entities match", () => {
      world.spawn(Position);

      const first = world.queryAny(Sprite, Mesh).first();

      expect(first).toBeNull();
    });
  });

  describe("Union Query .run()", () => {
    it("should iterate over matching archetypes with views", () => {
      world.spawn(Sprite);
      world.spawn(Mesh);
      world.spawn(Sprite, Position);

      const entities: Entity[] = [];
      world.queryAny(Sprite, Mesh).run((view) => {
        for (const row of view.iterRows()) {
          entities.push(view.entity(row));
        }
      });

      expect(entities).toHaveLength(3);
    });

    it("should provide views with available components", () => {
      const e1 = world.spawn(Sprite, Position);
      world.set(e1, Sprite, { texture: 42 });

      world.queryAny(Sprite, Mesh).run((view) => {
        for (const row of view.iterRows()) {
          // Should be able to access Sprite data
          const spriteColumn = view.column(Sprite, "texture");
          expect(spriteColumn[row]).toBe(42);
        }
      });
    });
  });

  describe("Union Query .iter()", () => {
    it("should iterate over all matching entities", () => {
      const e1 = world.spawn(Sprite);
      const e2 = world.spawn(Mesh);
      const e3 = world.spawn(Particle);

      const results: Entity[] = [];
      for (const entity of world.queryAny(Sprite, Mesh, Particle).iter()) {
        results.push(entity);
      }

      expect(results).toHaveLength(3);
      expect(results).toContain(e1);
      expect(results).toContain(e2);
      expect(results).toContain(e3);
    });
  });

  describe("Complex Union Queries", () => {
    it("should work with entities having multiple components", () => {
      const e1 = world.spawn(Sprite, Position);
      const e2 = world.spawn(Mesh, Position);
      const e3 = world.spawn(Position); // Only Position

      const results = world.queryAny(Sprite, Mesh).collect();

      expect(results).toHaveLength(2);
      expect(results).toContain(e1);
      expect(results).toContain(e2);
      expect(results).not.toContain(e3);
    });

    it("should handle overlapping component sets", () => {
      const e1 = world.spawn(Sprite);
      const e2 = world.spawn(Mesh);
      const e3 = world.spawn(Sprite, Mesh);
      const e4 = world.spawn(Sprite, Mesh, Particle);

      const results = world.queryAny(Sprite, Mesh).collect();

      expect(results).toHaveLength(4);
      expect(results).toContain(e1);
      expect(results).toContain(e2);
      expect(results).toContain(e3);
      expect(results).toContain(e4);
    });

    it("should work correctly after entity despawn", () => {
      const e1 = world.spawn(Sprite);
      const e2 = world.spawn(Mesh);
      const e3 = world.spawn(Particle);

      world.despawn(e2);

      const results = world.queryAny(Sprite, Mesh, Particle).collect();

      expect(results).toHaveLength(2);
      expect(results).toContain(e1);
      expect(results).toContain(e3);
      expect(results).not.toContain(e2);
    });

    it("should work correctly after component add/remove", () => {
      const e1 = world.spawn(Position);
      const e2 = world.spawn(Position);

      // Initially no matches
      let results = world.queryAny(Sprite, Mesh).collect();
      expect(results).toHaveLength(0);

      // Add Sprite to e1
      world.add(e1, Sprite);
      results = world.queryAny(Sprite, Mesh).collect();
      expect(results).toHaveLength(1);
      expect(results).toContain(e1);

      // Add Mesh to e2
      world.add(e2, Mesh);
      results = world.queryAny(Sprite, Mesh).collect();
      expect(results).toHaveLength(2);
      expect(results).toContain(e1);
      expect(results).toContain(e2);

      // Remove Sprite from e1
      world.remove(e1, Sprite);
      results = world.queryAny(Sprite, Mesh).collect();
      expect(results).toHaveLength(1);
      expect(results).toContain(e2);
    });
  });

  describe("Edge Cases", () => {
    it("should work with single component", () => {
      const e1 = world.spawn(Sprite);
      const e2 = world.spawn(Mesh);

      const results = world.queryAny(Sprite).collect();

      expect(results).toHaveLength(1);
      expect(results).toContain(e1);
    });

    it("should work with tag components", () => {
      const e1 = world.spawn(Hidden);
      const e2 = world.spawn(Disabled);
      const e3 = world.spawn(Position);

      const results = world.queryAny(Hidden, Disabled).collect();

      expect(results).toHaveLength(2);
      expect(results).toContain(e1);
      expect(results).toContain(e2);
      expect(results).not.toContain(e3);
    });

    it("should handle empty world", () => {
      const results = world.queryAny(Sprite, Mesh).collect();

      expect(results).toHaveLength(0);
    });

    it("should handle entities with all queried components", () => {
      const e1 = world.spawn(Sprite, Mesh, Particle);

      const results = world.queryAny(Sprite, Mesh, Particle).collect();

      expect(results).toHaveLength(1);
      expect(results).toContain(e1);
    });
  });
});
