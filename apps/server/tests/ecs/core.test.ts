import { describe, it, expect, beforeEach } from "bun:test";
import {
  World,
  component,
  f32,
  i32,
  type Entity,
  NULL_ENTITY,
  entityIndex,
  entityGeneration,
  CommandBuffer,
  Phase,
  defineSystem,
} from "@rogue/ecs";

interface PositionData {
  x: number;
  y: number;
}

interface VelocityData {
  x: number;
  y: number;
}

interface HealthData {
  current: number;
  max: number;
}

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

@component
class Player {}

@component
class Enemy {
  aggroRange = f32(10);
}

describe("ECS v2 Core", () => {
  let world: World;

  beforeEach(() => {
    world = new World(1024);
  });

  describe("Entity Lifecycle", () => {
    it("spawn creates entity", () => {
      const entity = world.spawn(Position);
      expect(world.isAlive(entity)).toBe(true);
      expect(world.getEntityCount()).toBe(1);
    });

    it("spawn with multiple components", () => {
      const entity = world.spawn(Position, Velocity, Health);
      expect(world.has(entity, Position)).toBe(true);
      expect(world.has(entity, Velocity)).toBe(true);
      expect(world.has(entity, Health)).toBe(true);
    });

    it("spawn with no components", () => {
      const entity = world.spawn();
      expect(world.isAlive(entity)).toBe(true);
      expect(world.has(entity, Position)).toBe(false);
    });

    it("despawn removes entity", () => {
      const entity = world.spawn(Position);
      expect(world.despawn(entity)).toBe(true);
      expect(world.isAlive(entity)).toBe(false);
      expect(world.getEntityCount()).toBe(0);
    });

    it("despawn returns false for dead entity", () => {
      const entity = world.spawn(Position);
      world.despawn(entity);
      expect(world.despawn(entity)).toBe(false);
    });

    it("entity ID recycled with incremented generation", () => {
      const e1 = world.spawn(Position);
      const idx1 = entityIndex(e1);
      const gen1 = entityGeneration(e1);

      world.despawn(e1);

      const e2 = world.spawn(Position);
      const idx2 = entityIndex(e2);
      const gen2 = entityGeneration(e2);

      expect(idx2).toBe(idx1);
      expect(gen2).toBe(gen1 + 1);
    });

    it("NULL_ENTITY is never alive", () => {
      expect(world.isAlive(NULL_ENTITY)).toBe(false);
    });

    it("isAlive false for wrong generation", () => {
      const e1 = world.spawn(Position);
      world.despawn(e1);
      world.spawn(Position);

      expect(world.isAlive(e1)).toBe(false);
    });
  });

  describe("Component Operations", () => {
    it("get returns component data", () => {
      const entity = world.spawn(Position);
      const pos = world.get(entity, Position) as PositionData | null;

      expect(pos).not.toBeNull();
      expect(pos!.x).toBe(0);
      expect(pos!.y).toBe(0);
    });

    it("set updates component data", () => {
      const entity = world.spawn(Position);
      world.set(entity, Position, { x: 10, y: 20 });

      const pos = world.get(entity, Position) as PositionData | null;
      expect(pos!.x).toBe(10);
      expect(pos!.y).toBe(20);
    });

    it("add new component to entity", () => {
      const entity = world.spawn(Position);
      expect(world.has(entity, Velocity)).toBe(false);

      world.add(entity, Velocity, { x: 1, y: 2 });

      expect(world.has(entity, Velocity)).toBe(true);
      const vel = world.get(entity, Velocity) as VelocityData | null;
      expect(vel!.x).toBe(1);
      expect(vel!.y).toBe(2);
    });

    it("add preserves existing component data", () => {
      const entity = world.spawn(Position);
      world.set(entity, Position, { x: 50, y: 60 });

      world.add(entity, Velocity);

      const pos = world.get(entity, Position) as PositionData | null;
      expect(pos!.x).toBe(50);
      expect(pos!.y).toBe(60);
    });

    it("remove component from entity", () => {
      const entity = world.spawn(Position, Velocity);
      expect(world.remove(entity, Velocity)).toBe(true);
      expect(world.has(entity, Velocity)).toBe(false);
      expect(world.has(entity, Position)).toBe(true);
    });

    it("remove last component leaves entity alive", () => {
      const entity = world.spawn(Position);
      world.remove(entity, Position);

      expect(world.isAlive(entity)).toBe(true);
      expect(world.has(entity, Position)).toBe(false);
    });

    it("tag components work", () => {
      const entity = world.spawn(Position, Player);
      expect(world.has(entity, Player)).toBe(true);

      const tag = world.get(entity, Player);
      expect(tag).toEqual({});
    });
  });

  describe("Query API", () => {
    it("query matches entities with all components", () => {
      world.spawn(Position);
      world.spawn(Position, Velocity);
      world.spawn(Velocity);

      let count = 0;
      world.query(Position, Velocity).run(() => {
        count++;
      });

      expect(count).toBe(1);
    });

    it("query.not excludes entities", () => {
      world.spawn(Position, Velocity);
      world.spawn(Position, Velocity, Dead);

      let count = 0;
      world
        .query(Position, Velocity)
        .not(Dead)
        .run((view) => {
          count += view.count;
        });

      expect(count).toBe(1);
    });

    it("query.count returns total", () => {
      world.spawn(Position);
      world.spawn(Position);
      world.spawn(Position, Velocity);

      expect(world.query(Position).count()).toBe(3);
      expect(world.query(Position, Velocity).count()).toBe(1);
    });

    it("query.first returns first matching entity", () => {
      const e1 = world.spawn(Position);
      world.spawn(Velocity);

      const first = world.query(Position).first();
      expect(first).toBe(e1);
    });

    it("query.first returns null if no match", () => {
      world.spawn(Velocity);

      const first = world.query(Position).first();
      expect(first).toBeNull();
    });

    it("query provides zero-copy column access", () => {
      const e1 = world.spawn(Position, Velocity);
      const e2 = world.spawn(Position, Velocity);

      world.set(e1, Position, { x: 10, y: 20 });
      world.set(e2, Position, { x: 30, y: 40 });
      world.set(e1, Velocity, { x: 1, y: 0 });
      world.set(e2, Velocity, { x: 0, y: 1 });

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

      const pos1 = world.get(e1, Position) as PositionData | null;
      const pos2 = world.get(e2, Position) as PositionData | null;

      expect(pos1!.x).toBe(11);
      expect(pos1!.y).toBe(20);
      expect(pos2!.x).toBe(30);
      expect(pos2!.y).toBe(41);
    });

    it("query.added filters newly added", () => {
      world.spawn(Position);

      world.runTick();

      world.spawn(Position);

      expect(world.query(Position).added().count()).toBe(1);
    });

    it("query.modified filters modified", () => {
      const entity = world.spawn(Position);

      world.runTick();

      world.set(entity, Position, { x: 100 });

      expect(world.query(Position).modified().count()).toBe(1);
    });

    it("query.changed filters added or modified", () => {
      const e1 = world.spawn(Position);
      world.runTick();

      world.spawn(Position);
      world.set(e1, Position, { x: 50 });

      expect(world.query(Position).changed().count()).toBe(2);
    });
  });

  describe("Archetype Transitions", () => {
    it("adding component moves to new archetype", () => {
      const e1 = world.spawn(Position);
      const e2 = world.spawn(Position);

      world.set(e1, Position, { x: 1, y: 2 });
      world.set(e2, Position, { x: 3, y: 4 });

      world.add(e1, Velocity);

      expect((world.get(e1, Position) as PositionData)!.x).toBe(1);
      expect((world.get(e2, Position) as PositionData)!.x).toBe(3);
    });

    it("swap-remove maintains data integrity", () => {
      const entities: Entity[] = [];
      for (let i = 0; i < 10; i++) {
        const e = world.spawn(Position);
        world.set(e, Position, { x: i, y: i * 10 });
        entities.push(e);
      }

      world.despawn(entities[0]);
      world.despawn(entities[5]);
      world.despawn(entities[3]);

      for (let i = 0; i < entities.length; i++) {
        if (i === 0 || i === 5 || i === 3) continue;

        const pos = world.get(entities[i], Position) as PositionData | null;
        expect(pos!.x).toBe(i);
        expect(pos!.y).toBe(i * 10);
      }
    });
  });

  describe("Resources", () => {
    class GameTime {
      delta = 0;
      total = 0;
    }

    it("set and get resource", () => {
      const time = new GameTime();
      time.delta = 16;

      world.setResource(GameTime, time);

      const retrieved = world.getResource(GameTime);
      expect(retrieved).toBe(time);
      expect(retrieved!.delta).toBe(16);
    });

    it("hasResource returns correct value", () => {
      expect(world.hasResource(GameTime)).toBe(false);

      world.setResource(GameTime, new GameTime());

      expect(world.hasResource(GameTime)).toBe(true);
    });
  });

  describe("Systems", () => {
    it("systems run in phase order", () => {
      const order: string[] = [];

      world.addSystem(
        defineSystem("Update")
          .inPhase(Phase.Update)
          .execute(() => order.push("update")),
      );
      world.addSystem(
        defineSystem("Pre")
          .inPhase(Phase.PreUpdate)
          .execute(() => order.push("pre")),
      );
      world.addSystem(
        defineSystem("Post")
          .inPhase(Phase.PostUpdate)
          .execute(() => order.push("post")),
      );

      world.runTick();

      expect(order).toEqual(["pre", "update", "post"]);
    });

    it("runTick increments tick counter", () => {
      expect(world.getCurrentTick()).toBe(0);

      world.runTick();
      expect(world.getCurrentTick()).toBe(1);

      world.runTick();
      expect(world.getCurrentTick()).toBe(2);
    });

    it("runTick clears change flags", () => {
      world.spawn(Position);

      expect(world.query(Position).added().count()).toBe(1);

      world.runTick();

      expect(world.query(Position).added().count()).toBe(0);
    });
  });

  describe("CommandBuffer", () => {
    let cmd: CommandBuffer;

    beforeEach(() => {
      cmd = new CommandBuffer();
      cmd.registerComponents(Position, Velocity, Health, Dead);
    });

    it("spawn deferred", () => {
      cmd.spawn(Position, Velocity);
      cmd.spawn(Health);

      expect(world.getEntityCount()).toBe(0);

      cmd.flush(world);

      expect(world.getEntityCount()).toBe(2);
    });

    it("despawn deferred", () => {
      const entity = world.spawn(Position);

      cmd.despawn(entity);

      expect(world.isAlive(entity)).toBe(true);

      cmd.flush(world);

      expect(world.isAlive(entity)).toBe(false);
    });

    it("add component deferred", () => {
      const entity = world.spawn(Position);

      cmd.add(entity, Velocity, { x: 5, y: 10 });

      expect(world.has(entity, Velocity)).toBe(false);

      cmd.flush(world);

      expect(world.has(entity, Velocity)).toBe(true);
      expect((world.get(entity, Velocity) as VelocityData)!.x).toBe(5);
    });

    it("remove component deferred", () => {
      const entity = world.spawn(Position, Velocity);

      cmd.remove(entity, Velocity);

      expect(world.has(entity, Velocity)).toBe(true);

      cmd.flush(world);

      expect(world.has(entity, Velocity)).toBe(false);
    });

    it("multiple commands execute in order", () => {
      const e1 = world.spawn(Position);

      cmd.add(e1, Health);
      cmd.add(e1, Dead);
      cmd.spawn(Velocity);

      cmd.flush(world);

      expect(world.has(e1, Health)).toBe(true);
      expect(world.has(e1, Dead)).toBe(true);
      expect(world.getEntityCount()).toBe(2);
    });

    it("clear resets buffer", () => {
      cmd.spawn(Position);
      cmd.spawn(Velocity);

      expect(cmd.pendingCount).toBe(2);

      cmd.clear();

      expect(cmd.pendingCount).toBe(0);
      expect(cmd.isEmpty()).toBe(true);
    });
  });
});

describe("ECS v2 Performance", () => {
  @component
  class PerfPosition {
    x = f32(0);
    y = f32(0);
  }

  @component
  class PerfVelocity {
    x = f32(0);
    y = f32(0);
  }

  it("query iteration is cache-friendly", () => {
    const world = new World(100_000);

    for (let i = 0; i < 10_000; i++) {
      const e = world.spawn(PerfPosition, PerfVelocity);
      world.set(e, PerfPosition, { x: i, y: i });
      world.set(e, PerfVelocity, { x: 1, y: 1 });
    }

    const start = performance.now();

    for (let tick = 0; tick < 100; tick++) {
      world.query(PerfPosition, PerfVelocity).run((view) => {
        const posX = view.column(PerfPosition, "x");
        const posY = view.column(PerfPosition, "y");
        const velX = view.column(PerfVelocity, "x");
        const velY = view.column(PerfVelocity, "y");

        for (let i = 0; i < view.rawCount(); i++) {
          posX[i] += velX[i];
          posY[i] += velY[i];
        }
      });
    }

    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(100);
  });

  it("handles 100k entities", () => {
    const world = new World(150_000);

    const start = performance.now();

    for (let i = 0; i < 100_000; i++) {
      world.spawn(PerfPosition, PerfVelocity);
    }

    const spawnTime = performance.now() - start;

    expect(world.getEntityCount()).toBe(100_000);
    expect(spawnTime).toBeLessThan(1000);
  });
});

describe("Entity Overflow", () => {
  it("throws when exceeding MAX_ENTITIES", () => {
    const smallWorld = new World(100);

    for (let i = 0; i < 100; i++) {
      smallWorld.spawn();
    }

    expect(() => smallWorld.spawn()).toThrow("Entity limit exceeded");
  });

  it("reuses freed entity slots before overflow", () => {
    const smallWorld = new World(100);
    const entities: Entity[] = [];

    for (let i = 0; i < 100; i++) {
      entities.push(smallWorld.spawn());
    }

    smallWorld.despawn(entities[0]);
    smallWorld.despawn(entities[50]);

    const e1 = smallWorld.spawn();
    const e2 = smallWorld.spawn();
    expect(smallWorld.isAlive(e1)).toBe(true);
    expect(smallWorld.isAlive(e2)).toBe(true);

    expect(() => smallWorld.spawn()).toThrow("Entity limit exceeded");
  });
});
