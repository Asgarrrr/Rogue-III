import { describe, it, expect, beforeEach } from "bun:test";
import {
  World,
  component,
  f32,
  i32,
  createInspector,
  WorldInspector,
  serializeWorld,
  deserializeWorld,
  type Entity,
} from "../../src/game/ecs-v2";

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

describe("Phase 6: WorldInspector", () => {
  let world: World;
  let inspector: WorldInspector;

  beforeEach(() => {
    world = new World(1024);
    inspector = createInspector(world);
  });

  describe("getStats", () => {
    it("returns correct stats for empty world", () => {
      const stats = inspector.getStats();

      expect(stats.entityCount).toBe(0);
      expect(stats.archetypeCount).toBe(0);
      expect(stats.currentTick).toBe(0);
    });

    it("updates stats as world changes", () => {
      world.spawn(Position);
      world.spawn(Position, Velocity);
      world.resources.set("seed", 12345);
      world.runTick();

      const stats = inspector.getStats();

      expect(stats.entityCount).toBe(2);
      expect(stats.archetypeCount).toBe(2);
      expect(stats.currentTick).toBe(1);
      expect(stats.resourceCount).toBe(1);
    });
  });

  describe("inspectEntity", () => {
    it("returns null components for dead entity", () => {
      const entity = world.spawn(Position);
      world.despawn(entity);

      const info = inspector.inspectEntity(entity);

      expect(info?.alive).toBe(false);
      expect(info?.components).toEqual([]);
    });

    it("lists all components on entity", () => {
      const entity = world.spawn(Position, Velocity, Dead);
      world.set(entity, Position, { x: 10, y: 20 });
      world.set(entity, Velocity, { x: 1, y: 2 });

      const info = inspector.inspectEntity(entity);

      expect(info?.alive).toBe(true);
      expect(info?.components.length).toBe(3);

      const posComp = info?.components.find((c) => c.name === "Position");
      expect(posComp?.isTag).toBe(false);
      expect(posComp?.data?.x).toBe(10);
      expect(posComp?.data?.y).toBe(20);

      const deadComp = info?.components.find((c) => c.name === "Dead");
      expect(deadComp?.isTag).toBe(true);
      expect(deadComp?.data).toBeNull();
    });
  });

  describe("listArchetypes", () => {
    it("returns empty for fresh world", () => {
      const archetypes = inspector.listArchetypes();
      expect(archetypes).toEqual([]);
    });

    it("lists all archetypes with correct info", () => {
      world.spawn(Position);
      world.spawn(Position, Velocity);
      world.spawn(Velocity);

      const archetypes = inspector.listArchetypes();

      expect(archetypes.length).toBe(3);

      const posOnly = archetypes.find(
        (a) =>
          a.components.includes("Position") &&
          !a.components.includes("Velocity"),
      );
      expect(posOnly?.entityCount).toBe(1);

      const both = archetypes.find(
        (a) =>
          a.components.includes("Position") &&
          a.components.includes("Velocity"),
      );
      expect(both?.entityCount).toBe(1);
    });
  });

  describe("findEntitiesWith", () => {
    it("finds entities with specific components", () => {
      const e1 = world.spawn(Position);
      const e2 = world.spawn(Position, Velocity);
      const e3 = world.spawn(Velocity);

      const withPos = inspector.findEntitiesWith(Position);
      const withVel = inspector.findEntitiesWith(Velocity);
      const withBoth = inspector.findEntitiesWith(Position, Velocity);

      expect(withPos.length).toBe(2);
      expect(withPos).toContain(e1);
      expect(withPos).toContain(e2);

      expect(withVel.length).toBe(2);
      expect(withVel).toContain(e2);
      expect(withVel).toContain(e3);

      expect(withBoth.length).toBe(1);
      expect(withBoth).toContain(e2);
    });
  });

  describe("countEntitiesWith", () => {
    it("counts entities correctly", () => {
      world.spawn(Position);
      world.spawn(Position);
      world.spawn(Position, Velocity);
      world.spawn(Velocity);

      expect(inspector.countEntitiesWith(Position)).toBe(3);
      expect(inspector.countEntitiesWith(Velocity)).toBe(2);
      expect(inspector.countEntitiesWith(Position, Velocity)).toBe(1);
    });
  });

  describe("dumpEntity", () => {
    it("returns readable string for entity", () => {
      const entity = world.spawn(Position, Health);
      world.set(entity, Position, { x: 5, y: 10 });
      world.set(entity, Health, { current: 80, max: 100 });

      const dump = inspector.dumpEntity(entity);

      expect(dump).toContain("Position");
      expect(dump).toContain("x=5");
      expect(dump).toContain("y=10");
      expect(dump).toContain("Health");
      expect(dump).toContain("current=80");
    });

    it("handles dead entity", () => {
      const entity = world.spawn(Position);
      world.despawn(entity);

      const dump = inspector.dumpEntity(entity);

      expect(dump).toContain("DEAD");
    });
  });

  describe("dumpWorld", () => {
    it("returns complete world summary", () => {
      world.spawn(Position);
      world.spawn(Position, Velocity);
      world.resources.set("config", { level: 1 });

      const dump = inspector.dumpWorld();

      expect(dump).toContain("World State");
      expect(dump).toContain("Entities: 2");
      expect(dump).toContain("Archetypes");
      expect(dump).toContain("Position");
    });
  });
});

describe("Phase 6: Integration Tests", () => {
  it("full game loop simulation", () => {
    const world = new World(1000);

    for (let i = 0; i < 100; i++) {
      const e = world.spawn(Position, Velocity, Health);
      world.set(e, Position, { x: i * 10, y: i * 5 });
      world.set(e, Velocity, { x: 1, y: 0 });
      world.set(e, Health, { current: 100, max: 100 });
    }

    for (let tick = 0; tick < 100; tick++) {
      world.query(Position, Velocity).run((view) => {
        const px = view.column(Position, "x");
        const py = view.column(Position, "y");
        const vx = view.column(Velocity, "x");
        const vy = view.column(Velocity, "y");

        for (let i = 0; i < view.rawCount(); i++) {
          px[i] += vx[i];
          py[i] += vy[i];
        }
      });

      world.runTick();
    }

    expect(world.getCurrentTick()).toBe(100);
    expect(world.getEntityCount()).toBe(100);

    let firstEntity: Entity | null = null;
    world.query(Position).run((view) => {
      firstEntity = view.entity(0);
    });

    const pos = world.get(firstEntity!, Position);
    expect(pos?.x).toBe(100);
  });

  it("spawn/despawn stress test", () => {
    const world = new World(10000);
    const entities: Entity[] = [];

    for (let i = 0; i < 1000; i++) {
      entities.push(world.spawn(Position, Health));
    }

    expect(world.getEntityCount()).toBe(1000);

    for (let i = 0; i < 500; i++) {
      world.despawn(entities[i]);
    }

    expect(world.getEntityCount()).toBe(500);

    for (let i = 0; i < 500; i++) {
      entities.push(world.spawn(Position, Velocity));
    }

    expect(world.getEntityCount()).toBe(1000);
  });

  it("component add/remove stress test", () => {
    const world = new World(1000);
    const entity = world.spawn(Position);

    for (let i = 0; i < 100; i++) {
      world.add(entity, Velocity, { x: i, y: i });
      world.add(entity, Health, { current: i, max: 100 });
      world.remove(entity, Velocity);
      world.remove(entity, Health);
    }

    expect(world.isAlive(entity)).toBe(true);
    expect(world.has(entity, Position)).toBe(true);
    expect(world.has(entity, Velocity)).toBe(false);
    expect(world.has(entity, Health)).toBe(false);
  });
});

describe("Phase 6: Performance Baselines", () => {
  it("spawn 100k entities < 500ms", () => {
    const world = new World(150000);

    const start = performance.now();
    for (let i = 0; i < 100000; i++) {
      world.spawn(Position, Velocity);
    }
    const elapsed = performance.now() - start;

    console.log(`  Spawn 100k: ${elapsed.toFixed(2)}ms`);
    expect(elapsed).toBeLessThan(500);
  });

  it("query 100k entities x 100 iterations < 100ms", () => {
    const world = new World(150000);

    for (let i = 0; i < 100000; i++) {
      world.spawn(Position, Velocity);
    }

    const start = performance.now();
    for (let iter = 0; iter < 100; iter++) {
      world.query(Position, Velocity).run((view) => {
        const px = view.column(Position, "x");
        for (let i = 0; i < view.rawCount(); i++) {
          px[i] += 1;
        }
      });
    }
    const elapsed = performance.now() - start;

    console.log(`  Query 100k x 100: ${elapsed.toFixed(2)}ms`);
    expect(elapsed).toBeLessThan(100);
  });

  it("serialize/deserialize 10k entities < 100ms", () => {
    const world = new World(15000);

    for (let i = 0; i < 10000; i++) {
      const e = world.spawn(Position, Velocity, Health);
      world.set(e, Position, { x: i, y: i * 2 });
    }

    const start = performance.now();
    const snapshot = serializeWorld(world);
    const restored = deserializeWorld(snapshot, 15000);
    const elapsed = performance.now() - start;

    console.log(`  Serialize+Deserialize 10k: ${elapsed.toFixed(2)}ms`);
    expect(elapsed).toBeLessThan(100);
    expect(restored.getEntityCount()).toBe(10000);
  });
});
