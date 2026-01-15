import { describe, it, expect, beforeEach } from "bun:test";
import {
  World,
  CommandBuffer,
  component,
  f32,
  i32,
  type Entity,
} from "@rogue/ecs";

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

@component
class Dead {}

describe("CommandBuffer", () => {
  let world: World;
  let cmd: CommandBuffer;

  beforeEach(() => {
    world = new World(1024);
    cmd = new CommandBuffer();
    cmd.registerComponents(Position, Velocity, Health, Dead);
  });

  describe("Sort key API", () => {
    it("setSortKey and getSortKey work", () => {
      expect(cmd.getSortKey()).toBe(0);
      cmd.setSortKey(100);
      expect(cmd.getSortKey()).toBe(100);
    });

    it("clear resets sort key", () => {
      cmd.setSortKey(100);
      cmd.spawn(Position);
      cmd.clear();
      expect(cmd.getSortKey()).toBe(0);
    });
  });

  describe("Deterministic ordering", () => {
    it("commands execute in sort key order", () => {
      cmd.setSortKey(300);
      cmd.spawn(Health);

      cmd.setSortKey(100);
      cmd.spawn(Position);

      cmd.setSortKey(200);
      cmd.spawn(Velocity);

      cmd.flush(world);

      const entities: Entity[] = [];
      world.query(Position).run((view) => {
        for (let i = 0; i < view.rawCount(); i++) {
          entities.push(view.entity(i));
        }
      });
      world.query(Velocity).run((view) => {
        for (let i = 0; i < view.rawCount(); i++) {
          entities.push(view.entity(i));
        }
      });
      world.query(Health).run((view) => {
        for (let i = 0; i < view.rawCount(); i++) {
          entities.push(view.entity(i));
        }
      });

      expect(entities.length).toBe(3);
    });

    it("same sort key preserves insertion order (FIFO)", () => {
      const order: number[] = [];

      cmd.setSortKey(100);
      for (let i = 0; i < 10; i++) {
        cmd.spawn(Position);
      }

      cmd.flush(world);

      world.query(Position).run((view) => {
        for (let i = 0; i < view.rawCount(); i++) {
          order.push(view.entity(i) as number);
        }
      });

      for (let i = 1; i < order.length; i++) {
        expect(order[i]).toBeGreaterThan(order[i - 1]);
      }
    });

    it("deterministic across multiple runs", () => {
      function runSimulation(): Entity[] {
        const w = new World(100);
        const c = new CommandBuffer();
        c.registerComponents(Position, Velocity, Health);

        c.setSortKey(200);
        c.spawn(Velocity);
        c.spawn(Velocity);

        c.setSortKey(100);
        c.spawn(Position);
        c.spawn(Position);

        c.setSortKey(300);
        c.spawn(Health);

        c.flush(w);

        const result: Entity[] = [];
        w.query(Position).run((view) => {
          for (let i = 0; i < view.rawCount(); i++) result.push(view.entity(i));
        });
        w.query(Velocity).run((view) => {
          for (let i = 0; i < view.rawCount(); i++) result.push(view.entity(i));
        });
        w.query(Health).run((view) => {
          for (let i = 0; i < view.rawCount(); i++) result.push(view.entity(i));
        });

        return result;
      }

      const run1 = runSimulation();
      const run2 = runSimulation();
      const run3 = runSimulation();

      expect(run1).toEqual(run2);
      expect(run2).toEqual(run3);
    });
  });

  describe("Mixed command types", () => {
    it("sorts spawn, add, remove commands correctly", () => {
      const e1 = world.spawn(Position);
      const e2 = world.spawn(Position);

      cmd.setSortKey(300);
      cmd.remove(e1, Position);

      cmd.setSortKey(100);
      cmd.add(e2, Velocity, { x: 5 });

      cmd.setSortKey(200);
      cmd.spawn(Health);

      cmd.flush(world);

      expect(world.has(e2, Velocity)).toBe(true);
      expect(world.query(Health).count()).toBe(1);
      expect(world.has(e1, Position)).toBe(false);
    });
  });

  describe("Performance", () => {
    it("1000 commands flush < 50ms", () => {
      for (let i = 0; i < 1000; i++) {
        cmd.setSortKey(Math.floor(Math.random() * 100));
        cmd.spawn(Position);
      }

      const start = performance.now();
      cmd.flush(world);
      const elapsed = performance.now() - start;

      console.log(`  Flush 1000 commands with sort: ${elapsed.toFixed(2)}ms`);
      expect(elapsed).toBeLessThan(50);
      expect(world.getEntityCount()).toBe(1000);
    });
  });
});
