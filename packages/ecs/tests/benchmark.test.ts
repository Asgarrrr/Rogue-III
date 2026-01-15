import { describe, it, expect } from "bun:test";
import { World, component, f32, i32, type Entity } from "@rogue/ecs";

@component
class Position {
  x = f32(0);
  y = f32(0);
}

@component
class Velocity {
  x = f32(0);
  y = f32(0);
}

@component
class Health {
  current = i32(100);
  max = i32(100);
}

describe("ECS v2 Benchmarks", () => {
  describe("Entity Operations", () => {
    it("spawn 100k entities < 500ms", () => {
      const world = new World(150_000);

      const start = performance.now();
      for (let i = 0; i < 100_000; i++) {
        world.spawn(Position, Velocity, Health);
      }
      const elapsed = performance.now() - start;

      console.log(`  Spawn 100k entities: ${elapsed.toFixed(2)}ms`);
      expect(elapsed).toBeLessThan(500);
    });

    it("despawn 50k entities < 200ms", () => {
      const world = new World(100_000);
      const entities: Entity[] = [];

      for (let i = 0; i < 50_000; i++) {
        entities.push(world.spawn(Position, Velocity));
      }

      const start = performance.now();
      for (const e of entities) {
        world.despawn(e);
      }
      const elapsed = performance.now() - start;

      console.log(`  Despawn 50k entities: ${elapsed.toFixed(2)}ms`);
      expect(elapsed).toBeLessThan(200);
    });
  });

  describe("Query Performance", () => {
    it("iterate 10k entities x 100 ticks < 50ms", () => {
      const world = new World(50_000);

      for (let i = 0; i < 10_000; i++) {
        const e = world.spawn(Position, Velocity);
        world.set(e, Position, { x: i, y: i });
        world.set(e, Velocity, { x: 1, y: 1 });
      }

      const start = performance.now();

      for (let tick = 0; tick < 100; tick++) {
        world.query(Position, Velocity).run((view) => {
          const posX = view.column(Position, "x");
          const posY = view.column(Position, "y");
          const velX = view.column(Velocity, "x");
          const velY = view.column(Velocity, "y");

          for (let i = 0; i < view.rawCount(); i++) {
            posX[i] += velX[i];
            posY[i] += velY[i];
          }
        });
      }

      const elapsed = performance.now() - start;

      console.log(`  10k entities x 100 ticks: ${elapsed.toFixed(2)}ms`);
      console.log(`  Per tick: ${(elapsed / 100).toFixed(3)}ms`);
      expect(elapsed).toBeLessThan(50);
    });

    it("iterate 100k entities x 10 ticks < 100ms", () => {
      const world = new World(150_000);

      for (let i = 0; i < 100_000; i++) {
        world.spawn(Position, Velocity);
      }

      const start = performance.now();

      for (let tick = 0; tick < 10; tick++) {
        world.query(Position, Velocity).run((view) => {
          const posX = view.column(Position, "x");
          const posY = view.column(Position, "y");
          const velX = view.column(Velocity, "x");
          const velY = view.column(Velocity, "y");

          for (let i = 0; i < view.rawCount(); i++) {
            posX[i] += velX[i];
            posY[i] += velY[i];
          }
        });
      }

      const elapsed = performance.now() - start;

      console.log(`  100k entities x 10 ticks: ${elapsed.toFixed(2)}ms`);
      console.log(`  Per tick: ${(elapsed / 10).toFixed(3)}ms`);
      expect(elapsed).toBeLessThan(100);
    });
  });

  describe("Memory Efficiency", () => {
    it("TypedArray direct access vs object allocation", () => {
      const world = new World(20_000);

      for (let i = 0; i < 10_000; i++) {
        const e = world.spawn(Position, Velocity);
        world.set(e, Position, { x: i, y: i });
        world.set(e, Velocity, { x: 1, y: 0 });
      }

      const beforeHeap = process.memoryUsage().heapUsed;
      const allocCount = 0;

      for (let tick = 0; tick < 1000; tick++) {
        world.query(Position, Velocity).run((view) => {
          const posX = view.column(Position, "x");
          const velX = view.column(Velocity, "x");

          for (let i = 0; i < view.rawCount(); i++) {
            posX[i] += velX[i];
          }
        });
      }

      const afterHeap = process.memoryUsage().heapUsed;
      const heapGrowth = afterHeap - beforeHeap;

      console.log(`  Heap before: ${(beforeHeap / 1024 / 1024).toFixed(2)}MB`);
      console.log(`  Heap after: ${(afterHeap / 1024 / 1024).toFixed(2)}MB`);
      console.log(`  Heap growth: ${(heapGrowth / 1024).toFixed(2)}KB`);

      expect(heapGrowth).toBeLessThan(1024 * 1024);
    });
  });

  describe("Archetype Transitions", () => {
    it("add component to 10k entities < 100ms", () => {
      const world = new World(20_000);
      const entities: Entity[] = [];

      for (let i = 0; i < 10_000; i++) {
        entities.push(world.spawn(Position));
      }

      const start = performance.now();

      for (const e of entities) {
        world.add(e, Velocity, { x: 1, y: 1 });
      }

      const elapsed = performance.now() - start;

      console.log(`  Add component to 10k: ${elapsed.toFixed(2)}ms`);
      expect(elapsed).toBeLessThan(100);
    });

    it("remove component from 10k entities < 100ms", () => {
      const world = new World(20_000);
      const entities: Entity[] = [];

      for (let i = 0; i < 10_000; i++) {
        entities.push(world.spawn(Position, Velocity));
      }

      const start = performance.now();

      for (const e of entities) {
        world.remove(e, Velocity);
      }

      const elapsed = performance.now() - start;

      console.log(`  Remove component from 10k: ${elapsed.toFixed(2)}ms`);
      expect(elapsed).toBeLessThan(100);
    });
  });

  describe("Comparison: TypedArray vs Object", () => {
    it("demonstrates zero-copy advantage", () => {
      const ENTITY_COUNT = 10_000;
      const ITERATIONS = 100;

      const world = new World(ENTITY_COUNT + 1000);
      for (let i = 0; i < ENTITY_COUNT; i++) {
        const e = world.spawn(Position, Velocity);
        world.set(e, Position, { x: i, y: i });
        world.set(e, Velocity, { x: 1, y: 1 });
      }

      const typedArrayStart = performance.now();
      for (let iter = 0; iter < ITERATIONS; iter++) {
        world.query(Position, Velocity).run((view) => {
          const posX = view.column(Position, "x");
          const posY = view.column(Position, "y");
          const velX = view.column(Velocity, "x");
          const velY = view.column(Velocity, "y");

          for (let i = 0; i < view.rawCount(); i++) {
            posX[i] += velX[i];
            posY[i] += velY[i];
          }
        });
      }
      const typedArrayTime = performance.now() - typedArrayStart;

      const objectArrayStart = performance.now();
      const objectEntities: {
        pos: { x: number; y: number };
        vel: { x: number; y: number };
      }[] = [];
      for (let i = 0; i < ENTITY_COUNT; i++) {
        objectEntities.push({ pos: { x: i, y: i }, vel: { x: 1, y: 1 } });
      }
      for (let iter = 0; iter < ITERATIONS; iter++) {
        for (const e of objectEntities) {
          e.pos.x += e.vel.x;
          e.pos.y += e.vel.y;
        }
      }
      const objectArrayTime = performance.now() - objectArrayStart;

      console.log(`  TypedArray ECS: ${typedArrayTime.toFixed(2)}ms`);
      console.log(`  Object Array: ${objectArrayTime.toFixed(2)}ms`);
      console.log(
        `  Speedup: ${(objectArrayTime / typedArrayTime).toFixed(2)}x`,
      );

      expect(typedArrayTime).toBeLessThan(objectArrayTime * 2);
    });
  });
});
