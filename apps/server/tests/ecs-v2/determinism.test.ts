import { describe, it, expect } from "bun:test";
import {
  World,
  component,
  f32,
  i32,
  defineSystem,
  Phase,
  serializeWorld,
  type Entity,
  type GameEvent,
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
class TurnEnergy {
  energy = i32(0);
  speed = i32(100);
}

@component
class Dead {}

describe("Determinism: World State", () => {
  function createTestWorld(): World {
    const world = new World(1000);

    for (let i = 0; i < 100; i++) {
      const e = world.spawn(Position, Velocity, Health);
      world.set(e, Position, { x: i * 10, y: i * 5 });
      world.set(e, Velocity, { x: 1, y: 0 });
      world.set(e, Health, { current: 100 - i, max: 100 });
    }

    return world;
  }

  it("identical operations produce identical snapshots", () => {
    const world1 = createTestWorld();
    const world2 = createTestWorld();

    const snapshot1 = serializeWorld(world1);
    const snapshot2 = serializeWorld(world2);

    expect(JSON.stringify(snapshot1)).toBe(JSON.stringify(snapshot2));
  });

  it("entity order is deterministic", () => {
    const entities1: Entity[] = [];
    const entities2: Entity[] = [];

    const world1 = new World(100);
    const world2 = new World(100);

    for (let i = 0; i < 50; i++) {
      entities1.push(world1.spawn(Position));
      entities2.push(world2.spawn(Position));
    }

    expect(entities1).toEqual(entities2);
  });

  it("despawn + respawn produces same entity IDs", () => {
    const world1 = new World(100);
    const world2 = new World(100);

    const e1_1 = world1.spawn(Position);
    const e1_2 = world1.spawn(Position);
    world1.despawn(e1_1);
    const e1_3 = world1.spawn(Position);

    const e2_1 = world2.spawn(Position);
    const e2_2 = world2.spawn(Position);
    world2.despawn(e2_1);
    const e2_3 = world2.spawn(Position);

    expect(e1_2).toBe(e2_2);
    expect(e1_3).toBe(e2_3);
  });
});

describe("Determinism: Query Iteration Order", () => {
  it("query returns entities in consistent order", () => {
    const world = new World(100);

    for (let i = 0; i < 20; i++) {
      const e = world.spawn(Position);
      world.set(e, Position, { x: i, y: i });
    }

    const order1: number[] = [];
    const order2: number[] = [];

    world.query(Position).run((view) => {
      for (let i = 0; i < view.rawCount(); i++) {
        order1.push(view.entity(i));
      }
    });

    world.query(Position).run((view) => {
      for (let i = 0; i < view.rawCount(); i++) {
        order2.push(view.entity(i));
      }
    });

    expect(order1).toEqual(order2);
  });

  it("multiple archetypes iterate in deterministic order", () => {
    const world1 = new World(100);
    const world2 = new World(100);

    for (let i = 0; i < 10; i++) {
      world1.spawn(Position);
      world2.spawn(Position);
    }
    for (let i = 0; i < 10; i++) {
      world1.spawn(Position, Velocity);
      world2.spawn(Position, Velocity);
    }
    for (let i = 0; i < 10; i++) {
      world1.spawn(Position, Health);
      world2.spawn(Position, Health);
    }

    const entities1: Entity[] = [];
    const entities2: Entity[] = [];

    world1.query(Position).run((view) => {
      for (let i = 0; i < view.rawCount(); i++) {
        entities1.push(view.entity(i));
      }
    });

    world2.query(Position).run((view) => {
      for (let i = 0; i < view.rawCount(); i++) {
        entities2.push(view.entity(i));
      }
    });

    expect(entities1).toEqual(entities2);
  });
});

describe("Determinism: Event Ordering", () => {
  it("events are processed in alphabetical type order", () => {
    const world = new World(100);
    const processed: string[] = [];

    world.events.on("combat.damage", () => processed.push("combat.damage"));
    world.events.on("combat.death", () => processed.push("combat.death"));
    world.events.on("movement.moved", () => processed.push("movement.moved"));
    world.events.on("entity.spawned", () => processed.push("entity.spawned"));

    world.events.emit({
      type: "movement.moved",
      entity: 1 as Entity,
      fromX: 0,
      fromY: 0,
      toX: 1,
      toY: 1,
    });
    world.events.emit({ type: "combat.death", entity: 1 as Entity });
    world.events.emit({ type: "entity.spawned", entity: 2 as Entity });
    world.events.emit({
      type: "combat.damage",
      attacker: 1 as Entity,
      target: 2 as Entity,
      damage: 10,
    });

    world.events.flush();

    expect(processed).toEqual([
      "combat.damage",
      "combat.death",
      "entity.spawned",
      "movement.moved",
    ]);
  });

  it("events of same type are FIFO ordered", () => {
    const world = new World(100);
    const damages: number[] = [];

    world.events.on("combat.damage", (e) => {
      if (e.type === "combat.damage") damages.push(e.damage);
    });

    world.events.emit({
      type: "combat.damage",
      attacker: 1 as Entity,
      target: 2 as Entity,
      damage: 10,
    });
    world.events.emit({
      type: "combat.damage",
      attacker: 1 as Entity,
      target: 2 as Entity,
      damage: 20,
    });
    world.events.emit({
      type: "combat.damage",
      attacker: 1 as Entity,
      target: 2 as Entity,
      damage: 30,
    });

    world.events.flush();

    expect(damages).toEqual([10, 20, 30]);
  });

  it("event ordering is reproducible across runs", () => {
    function runSimulation(): string[] {
      const world = new World(100);
      const log: string[] = [];

      world.events.on("turn.started", (e) => log.push(`start:${e.entity}`));
      world.events.on("turn.ended", (e) => log.push(`end:${e.entity}`));
      world.events.on("combat.damage", (e) => log.push(`dmg:${e.damage}`));

      for (let i = 1; i <= 5; i++) {
        world.events.emit({
          type: "turn.started",
          entity: i as Entity,
          tick: i,
        });
        world.events.emit({
          type: "combat.damage",
          attacker: i as Entity,
          target: (i + 1) as Entity,
          damage: i * 10,
        });
        world.events.emit({ type: "turn.ended", entity: i as Entity, tick: i });
      }

      world.events.flush();
      return log;
    }

    const run1 = runSimulation();
    const run2 = runSimulation();
    const run3 = runSimulation();

    expect(run1).toEqual(run2);
    expect(run2).toEqual(run3);
  });
});

describe("Determinism: System Execution Order", () => {
  it("systems execute in phase order", () => {
    const world = new World(100);
    const order: string[] = [];

    world.addSystem(
      defineSystem("PostSystem")
        .inPhase(Phase.PostUpdate)
        .execute(() => order.push("post")),
    );
    world.addSystem(
      defineSystem("PreSystem")
        .inPhase(Phase.PreUpdate)
        .execute(() => order.push("pre")),
    );
    world.addSystem(
      defineSystem("UpdateSystem")
        .inPhase(Phase.Update)
        .execute(() => order.push("update")),
    );

    world.runTick();

    expect(order).toEqual(["pre", "update", "post"]);
  });

  it("systems respect dependency order", () => {
    const world = new World(100);
    const order: string[] = [];

    world.addSystem(
      defineSystem("D")
        .inPhase(Phase.Update)
        .after("C")
        .execute(() => order.push("D")),
    );
    world.addSystem(
      defineSystem("B")
        .inPhase(Phase.Update)
        .after("A")
        .execute(() => order.push("B")),
    );
    world.addSystem(
      defineSystem("C")
        .inPhase(Phase.Update)
        .after("B")
        .execute(() => order.push("C")),
    );
    world.addSystem(
      defineSystem("A")
        .inPhase(Phase.Update)
        .execute(() => order.push("A")),
    );

    world.runTick();

    expect(order).toEqual(["A", "B", "C", "D"]);
  });

  it("system order is reproducible", () => {
    function runWithSystems(): string[] {
      const world = new World(100);
      const order: string[] = [];

      world.addSystem(
        defineSystem("Physics")
          .inPhase(Phase.Update)
          .after("Input")
          .execute(() => order.push("Physics")),
      );
      world.addSystem(
        defineSystem("Render")
          .inPhase(Phase.PostUpdate)
          .execute(() => order.push("Render")),
      );
      world.addSystem(
        defineSystem("Input")
          .inPhase(Phase.PreUpdate)
          .execute(() => order.push("Input")),
      );
      world.addSystem(
        defineSystem("AI")
          .inPhase(Phase.Update)
          .after("Physics")
          .execute(() => order.push("AI")),
      );

      world.runTick();
      return order;
    }

    const run1 = runWithSystems();
    const run2 = runWithSystems();

    expect(run1).toEqual(run2);
    expect(run1).toEqual(["Input", "Physics", "AI", "Render"]);
  });
});

describe("Determinism: Full Simulation", () => {
  function runGameSimulation(seed: number): string {
    const world = new World(1000);
    world.resources.set("seed", seed);

    for (let i = 0; i < 50; i++) {
      const e = world.spawn(Position, Velocity, TurnEnergy);
      world.set(e, Position, { x: (seed + i) % 100, y: (seed * i) % 100 });
      world.set(e, Velocity, { x: 1, y: 0 });
      world.set(e, TurnEnergy, { energy: i * 10, speed: 100 });
    }

    world.addSystem(
      defineSystem("Movement")
        .inPhase(Phase.Update)
        .execute((w) => {
          w.query(Position, Velocity).run((view) => {
            const px = view.column(Position, "x");
            const py = view.column(Position, "y");
            const vx = view.column(Velocity, "x");
            const vy = view.column(Velocity, "y");

            for (let i = 0; i < view.rawCount(); i++) {
              px[i] += vx[i];
              py[i] += vy[i];
            }
          });
        }),
    );

    world.addSystem(
      defineSystem("EnergyGain")
        .inPhase(Phase.Update)
        .after("Movement")
        .execute((w) => {
          w.query(TurnEnergy).run((view) => {
            const energy = view.column(TurnEnergy, "energy");
            const speed = view.column(TurnEnergy, "speed");

            for (let i = 0; i < view.rawCount(); i++) {
              energy[i] += Math.floor(speed[i] / 10);
            }
          });
        }),
    );

    for (let tick = 0; tick < 100; tick++) {
      world.runTick();
    }

    return JSON.stringify(serializeWorld(world));
  }

  it("same seed produces identical simulation results", () => {
    const result1 = runGameSimulation(12345);
    const result2 = runGameSimulation(12345);
    const result3 = runGameSimulation(12345);

    expect(result1).toBe(result2);
    expect(result2).toBe(result3);
  });

  it("different seeds produce different results", () => {
    const result1 = runGameSimulation(11111);
    const result2 = runGameSimulation(22222);

    expect(result1).not.toBe(result2);
  });
});

describe("Determinism: Property Tests", () => {
  it("spawn order is always ascending", () => {
    for (let trial = 0; trial < 10; trial++) {
      const world = new World(1000);
      let lastEntity = -1;

      for (let i = 0; i < 100; i++) {
        const e = world.spawn(Position);
        expect(e).toBeGreaterThan(lastEntity);
        lastEntity = e;
      }
    }
  });

  it("component data survives archetype transitions", () => {
    for (let trial = 0; trial < 10; trial++) {
      const world = new World(100);
      const entity = world.spawn(Position);
      world.set(entity, Position, { x: 42, y: 99 });

      world.add(entity, Velocity, { x: 1, y: 2 });
      world.add(entity, Health, { current: 50, max: 100 });

      const pos = world.get(entity, Position);
      expect(pos?.x).toBe(42);
      expect(pos?.y).toBe(99);

      world.remove(entity, Velocity);

      const posAfter = world.get(entity, Position);
      expect(posAfter?.x).toBe(42);
      expect(posAfter?.y).toBe(99);
    }
  });

  it("query count matches actual entities", () => {
    for (let trial = 0; trial < 10; trial++) {
      const world = new World(1000);
      const count = 50 + trial * 10;

      for (let i = 0; i < count; i++) {
        world.spawn(Position, Velocity);
      }

      expect(world.query(Position).count()).toBe(count);
      expect(world.query(Velocity).count()).toBe(count);
      expect(world.query(Position, Velocity).count()).toBe(count);
    }
  });
});
