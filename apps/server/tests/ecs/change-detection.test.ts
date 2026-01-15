import { describe, it, expect, beforeEach } from "bun:test";
import {
  World,
  component,
  f32,
  i32,
  type Entity,
  Phase,
  defineSystem,
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

describe("Per-Component Change Detection", () => {
  let world: World;

  beforeEach(() => {
    world = new World(1024);
  });

  describe("Basic component change tracking", () => {
    it("detects which component was changed", () => {
      const entity = world.spawn(Position, Velocity);
      world.runTick();

      world.set(entity, Position, { x: 10, y: 20 });

      expect(
        world.query(Position, Velocity).changedComponent(Position).count(),
      ).toBe(1);
      expect(
        world.query(Position, Velocity).changedComponent(Velocity).count(),
      ).toBe(0);
      expect(world.query(Position, Velocity).changed().count()).toBe(1);
    });

    it("tracks changes to multiple components independently", () => {
      const e1 = world.spawn(Position, Velocity);
      const e2 = world.spawn(Position, Velocity);
      world.runTick();

      world.set(e1, Position, { x: 10 });
      world.set(e2, Velocity, { x: 5 });

      expect(
        world.query(Position, Velocity).changedComponent(Position).count(),
      ).toBe(1);
      expect(
        world.query(Position, Velocity).changedComponent(Velocity).count(),
      ).toBe(1);
      expect(
        world
          .query(Position, Velocity)
          .changedComponent(Position, Velocity)
          .count(),
      ).toBe(2);
    });

    it("clears component change flags on runTick", () => {
      const entity = world.spawn(Position, Velocity);
      world.runTick();

      world.set(entity, Position, { x: 10 });
      expect(world.query(Position).changedComponent(Position).count()).toBe(1);

      world.runTick();
      expect(world.query(Position).changedComponent(Position).count()).toBe(0);
    });

    it("new entities have all components marked as changed", () => {
      world.spawn(Position, Velocity);

      expect(
        world.query(Position, Velocity).changedComponent(Position).count(),
      ).toBe(1);
      expect(
        world.query(Position, Velocity).changedComponent(Velocity).count(),
      ).toBe(1);
    });
  });

  describe("ArchetypeView component change API", () => {
    it("hasComponentChanged works per row", () => {
      const e1 = world.spawn(Position, Velocity);
      const e2 = world.spawn(Position, Velocity);
      world.runTick();

      world.set(e1, Position, { x: 10 });

      world.query(Position, Velocity).run((view) => {
        for (let i = 0; i < view.rawCount(); i++) {
          const entity = view.entity(i);
          if (entity === e1) {
            expect(view.hasComponentChanged(i, Position)).toBe(true);
            expect(view.hasComponentChanged(i, Velocity)).toBe(false);
          } else {
            expect(view.hasComponentChanged(i, Position)).toBe(false);
            expect(view.hasComponentChanged(i, Velocity)).toBe(false);
          }
        }
      });
    });

    it("matchesChangeFilter works with component filtering", () => {
      const e1 = world.spawn(Position, Velocity);
      world.spawn(Position, Velocity);
      world.runTick();

      world.set(e1, Position, { x: 10 });

      let matchCount = 0;
      world
        .query(Position, Velocity)
        .changedComponent(Position)
        .run((view) => {
          for (let i = 0; i < view.rawCount(); i++) {
            if (view.matchesChangeFilter(i)) {
              matchCount++;
            }
          }
        });

      expect(matchCount).toBe(1);
    });
  });

  describe("Integration with systems", () => {
    it("per-component change + system scheduling", () => {
      const processed: string[] = [];

      for (let i = 0; i < 10; i++) {
        const e = world.spawn(Position, Velocity, Health);
        world.set(e, Position, { x: i, y: i });
      }
      world.runTick();

      world.addSystem(
        defineSystem("PositionReaction")
          .inPhase(Phase.Update)
          .execute((w) => {
            w.query(Position, Velocity)
              .changedComponent(Position)
              .run((view) => {
                for (let i = 0; i < view.rawCount(); i++) {
                  if (view.matchesChangeFilter(i)) {
                    processed.push(`pos:${view.entity(i)}`);
                  }
                }
              });
          }),
      );

      world.addSystem(
        defineSystem("HealthReaction")
          .inPhase(Phase.Update)
          .execute((w) => {
            w.query(Health)
              .changedComponent(Health)
              .run((view) => {
                for (let i = 0; i < view.rawCount(); i++) {
                  if (view.matchesChangeFilter(i)) {
                    processed.push(`health:${view.entity(i)}`);
                  }
                }
              });
          }),
      );

      const firstEntity = world.query(Position).first()!;
      world.set(firstEntity, Position, { x: 999 });

      world.runTick();

      expect(processed).toEqual([`pos:${firstEntity}`]);
    });

    it("backward compatibility: changed() still works as before", () => {
      const e1 = world.spawn(Position, Velocity);
      world.spawn(Position, Velocity);
      world.runTick();

      world.set(e1, Position, { x: 10 });

      expect(world.query(Position, Velocity).changed().count()).toBe(1);
      expect(world.query(Position, Velocity).added().count()).toBe(0);
      expect(world.query(Position, Velocity).modified().count()).toBe(1);
    });
  });

  describe("Performance", () => {
    it("10k entities, filter by specific component < 100ms", () => {
      const largeWorld = new World(20_000);
      for (let i = 0; i < 10_000; i++) {
        const e = largeWorld.spawn(Position, Velocity, Health);
        largeWorld.set(e, Position, { x: i, y: i });
      }
      largeWorld.runTick();

      const entities: Entity[] = [];
      largeWorld.query(Position).run((view) => {
        for (let i = 0; i < view.rawCount(); i++) {
          if (i % 2 === 0) {
            entities.push(view.entity(i));
          }
        }
      });

      for (const e of entities) {
        largeWorld.set(e, Position, { x: 999 });
      }

      const start = performance.now();
      for (let i = 0; i < 100; i++) {
        largeWorld.query(Position, Velocity).changedComponent(Position).count();
      }
      const elapsed = performance.now() - start;

      console.log(
        `  100 changedComponent queries on 10k entities: ${elapsed.toFixed(2)}ms`,
      );
      expect(elapsed).toBeLessThan(100);
    });
  });
});
