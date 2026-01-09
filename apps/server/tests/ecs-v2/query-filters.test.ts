import { describe, it, expect, beforeEach } from "bun:test";
import {
  World,
  component,
  f32,
  u32,
  type Entity,
} from "../../src/game/ecs-v2";

// Test components
@component
class Position {
  x = f32(0);
  y = f32(0);
}

@component
class Velocity {
  vx = f32(0);
  vy = f32(0);
}

@component
class Health {
  current = u32(100);
  max = u32(100);
}

@component
class Tag {}

describe("Query Filters (.where())", () => {
  let world: World;

  beforeEach(() => {
    world = new World();
  });

  describe("Basic Filtering", () => {
    it("should filter entities by single field", () => {
      const e1 = world.spawn(Position);
      const e2 = world.spawn(Position);
      const e3 = world.spawn(Position);

      world.set(e1, Position, { x: 10, y: 0 });
      world.set(e2, Position, { x: -5, y: 0 });
      world.set(e3, Position, { x: 20, y: 0 });

      const results = world
        .query(Position)
        .where(Position, (p) => p.x > 0)
        .collect();

      expect(results).toHaveLength(2);
      expect(results).toContain(e1);
      expect(results).toContain(e3);
      expect(results).not.toContain(e2);
    });

    it("should filter entities by multiple fields", () => {
      const e1 = world.spawn(Position);
      const e2 = world.spawn(Position);
      const e3 = world.spawn(Position);

      world.set(e1, Position, { x: 10, y: 10 });
      world.set(e2, Position, { x: 10, y: -5 });
      world.set(e3, Position, { x: -5, y: 10 });

      const results = world
        .query(Position)
        .where(Position, (p) => p.x > 0 && p.y > 0)
        .collect();

      expect(results).toHaveLength(1);
      expect(results).toContain(e1);
    });

    it("should support multiple .where() calls", () => {
      const e1 = world.spawn(Position, Health);
      const e2 = world.spawn(Position, Health);
      const e3 = world.spawn(Position, Health);

      world.set(e1, Position, { x: 10, y: 0 });
      world.set(e1, Health, { current: 50, max: 100 });

      world.set(e2, Position, { x: 10, y: 0 });
      world.set(e2, Health, { current: 100, max: 100 });

      world.set(e3, Position, { x: -5, y: 0 });
      world.set(e3, Health, { current: 50, max: 100 });

      const results = world
        .query(Position, Health)
        .where(Position, (p) => p.x > 0)
        .where(Health, (h) => h.current < h.max)
        .collect();

      expect(results).toHaveLength(1);
      expect(results).toContain(e1);
    });

    it("should return empty when no entities match", () => {
      world.spawn(Position);
      world.spawn(Position);

      const results = world
        .query(Position)
        .where(Position, (p) => p.x > 1000)
        .collect();

      expect(results).toHaveLength(0);
    });
  });

  describe("count() with filters", () => {
    it("should count only filtered entities", () => {
      for (let i = 0; i < 10; i++) {
        const e = world.spawn(Position);
        world.set(e, Position, { x: i, y: 0 });
      }

      const count = world
        .query(Position)
        .where(Position, (p) => p.x >= 5)
        .count();

      expect(count).toBe(5);
    });
  });

  describe("first() with filters", () => {
    it("should return first matching entity", () => {
      const entities: Entity[] = [];
      for (let i = 0; i < 10; i++) {
        const e = world.spawn(Position);
        world.set(e, Position, { x: i, y: 0 });
        entities.push(e);
      }

      const first = world
        .query(Position)
        .where(Position, (p) => p.x >= 5)
        .first();

      expect(first).not.toBeNull();
      // Should be one of the entities with x >= 5
      const data = world.get(first!, Position);
      expect(data?.x).toBeGreaterThanOrEqual(5);
    });

    it("should return null when no match", () => {
      world.spawn(Position);

      const first = world
        .query(Position)
        .where(Position, (p) => p.x > 1000)
        .first();

      expect(first).toBeNull();
    });
  });

  describe("iter() with filters", () => {
    it("should iterate only over filtered entities", () => {
      for (let i = 0; i < 10; i++) {
        const e = world.spawn(Position);
        world.set(e, Position, { x: i, y: 0 });
      }

      const results: Entity[] = [];
      for (const entity of world
        .query(Position)
        .where(Position, (p) => p.x < 3)
        .iter()) {
        results.push(entity);
      }

      expect(results).toHaveLength(3);
    });
  });

  describe("run() with filters", () => {
    it("should pass filtered view to callback", () => {
      for (let i = 0; i < 10; i++) {
        const e = world.spawn(Position);
        world.set(e, Position, { x: i, y: 0 });
      }

      let totalCount = 0;
      world
        .query(Position)
        .where(Position, (p) => p.x >= 5)
        .run((view) => {
          totalCount += view.count;
        });

      expect(totalCount).toBe(5);
    });

    it("should provide iterRows() for filtered iteration", () => {
      for (let i = 0; i < 10; i++) {
        const e = world.spawn(Position);
        world.set(e, Position, { x: i, y: 0 });
      }

      const values: number[] = [];
      world
        .query(Position)
        .where(Position, (p) => p.x >= 5)
        .run((view) => {
          const xCol = view.column(Position, "x");
          for (const row of view.iterRows()) {
            values.push(xCol[row]);
          }
        });

      expect(values).toHaveLength(5);
      for (const v of values) {
        expect(v).toBeGreaterThanOrEqual(5);
      }
    });
  });

  describe("Combined with .not()", () => {
    it("should work with not() exclusion", () => {
      const e1 = world.spawn(Position);
      const e2 = world.spawn(Position, Tag);
      const e3 = world.spawn(Position);

      world.set(e1, Position, { x: 10, y: 0 });
      world.set(e2, Position, { x: 10, y: 0 });
      world.set(e3, Position, { x: -5, y: 0 });

      const results = world
        .query(Position)
        .not(Tag)
        .where(Position, (p) => p.x > 0)
        .collect();

      expect(results).toHaveLength(1);
      expect(results).toContain(e1);
    });
  });

  describe("Combined with change detection", () => {
    it("should work with changed()", () => {
      const e1 = world.spawn(Position);
      const e2 = world.spawn(Position);

      world.set(e1, Position, { x: 10, y: 0 });
      world.set(e2, Position, { x: 10, y: 0 });

      // Clear change flags
      world.runTick();

      // Modify only e1
      world.set(e1, Position, { x: 20, y: 0 });

      const results = world
        .query(Position)
        .changed()
        .where(Position, (p) => p.x > 15)
        .collect();

      expect(results).toHaveLength(1);
      expect(results).toContain(e1);
    });
  });
});

describe("Query Filters Performance", () => {
  it("should handle many entities efficiently", () => {
    const world = new World(100_000);

    // Create 10k entities with random positions
    for (let i = 0; i < 10_000; i++) {
      const e = world.spawn(Position);
      world.set(e, Position, { x: i % 100, y: i % 50 });
    }

    const start = performance.now();

    // Filter to ~10% of entities
    const count = world
      .query(Position)
      .where(Position, (p) => p.x < 10)
      .count();

    const filterTime = performance.now() - start;
    console.log(`  Filter 10k entities: ${filterTime.toFixed(2)}ms`);

    expect(count).toBe(1000); // 10% of 10k
    expect(filterTime).toBeLessThan(50);
  });

  it("should be fast with iter()", () => {
    const world = new World(100_000);

    for (let i = 0; i < 10_000; i++) {
      const e = world.spawn(Position);
      world.set(e, Position, { x: i % 100, y: 0 });
    }

    const start = performance.now();

    let count = 0;
    for (const _ of world
      .query(Position)
      .where(Position, (p) => p.x < 10)
      .iter()) {
      count++;
    }

    const iterTime = performance.now() - start;
    console.log(`  Iter filtered 10k entities: ${iterTime.toFixed(2)}ms`);

    expect(count).toBe(1000);
    expect(iterTime).toBeLessThan(50);
  });

  it("should maintain performance with multiple filters", () => {
    const world = new World(100_000);

    for (let i = 0; i < 10_000; i++) {
      const e = world.spawn(Position, Health);
      world.set(e, Position, { x: i % 100, y: i % 50 });
      world.set(e, Health, { current: i % 100, max: 100 });
    }

    const start = performance.now();

    const count = world
      .query(Position, Health)
      .where(Position, (p) => p.x < 50)
      .where(Health, (h) => h.current > 50)
      .count();

    const filterTime = performance.now() - start;
    console.log(`  Double filter 10k entities: ${filterTime.toFixed(2)}ms`);

    expect(filterTime).toBeLessThan(100);
  });
});
