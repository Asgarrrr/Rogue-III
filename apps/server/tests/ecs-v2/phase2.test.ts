import { describe, it, expect, beforeEach } from "bun:test";
import {
  World,
  defineSystem,
  SystemScheduler,
  Phase,
  component,
  f32,
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

describe("Phase 2: defineSystem", () => {
  describe("Builder pattern", () => {
    it("creates system with required fields", () => {
      const system = defineSystem("TestSystem")
        .inPhase(Phase.Update)
        .execute(() => {});

      expect(system.name).toBe("TestSystem");
      expect(system.phase).toBe(Phase.Update);
      expect(system.enabled).toBe(true);
      expect(system.before).toEqual([]);
      expect(system.after).toEqual([]);
    });

    it("throws if phase not set", () => {
      expect(() => {
        defineSystem("NoPhase").execute(() => {});
      }).toThrow(/phase is required/);
    });

    it("supports before dependencies", () => {
      const system = defineSystem("First")
        .inPhase(Phase.Update)
        .before("Second", "Third")
        .execute(() => {});

      expect(system.before).toEqual(["Second", "Third"]);
    });

    it("supports after dependencies", () => {
      const system = defineSystem("Last")
        .inPhase(Phase.Update)
        .after("First", "Second")
        .execute(() => {});

      expect(system.after).toEqual(["First", "Second"]);
    });

    it("supports disabled state", () => {
      const system = defineSystem("Disabled")
        .inPhase(Phase.Update)
        .disabled()
        .execute(() => {});

      expect(system.enabled).toBe(false);
    });

    it("chains multiple configurations", () => {
      const system = defineSystem("Complex")
        .inPhase(Phase.PostUpdate)
        .before("Cleanup")
        .after("Movement")
        .execute(() => {});

      expect(system.phase).toBe(Phase.PostUpdate);
      expect(system.before).toEqual(["Cleanup"]);
      expect(system.after).toEqual(["Movement"]);
    });
  });
});

describe("Phase 2: SystemScheduler", () => {
  let scheduler: SystemScheduler;

  beforeEach(() => {
    scheduler = new SystemScheduler();
  });

  describe("Registration", () => {
    it("registers a single system", () => {
      const system = defineSystem("Test")
        .inPhase(Phase.Update)
        .execute(() => {});

      scheduler.register(system);

      expect(scheduler.getAllSystems().length).toBe(1);
      expect(scheduler.getSystem("Test")).toBe(system);
    });

    it("registers batch of systems", () => {
      const systems = [
        defineSystem("A")
          .inPhase(Phase.Update)
          .execute(() => {}),
        defineSystem("B")
          .inPhase(Phase.Update)
          .execute(() => {}),
        defineSystem("C")
          .inPhase(Phase.PostUpdate)
          .execute(() => {}),
      ];

      scheduler.registerBatch(systems);

      expect(scheduler.getAllSystems().length).toBe(3);
    });

    it("groups systems by phase", () => {
      scheduler.register(
        defineSystem("Pre")
          .inPhase(Phase.PreUpdate)
          .execute(() => {}),
      );
      scheduler.register(
        defineSystem("Update1")
          .inPhase(Phase.Update)
          .execute(() => {}),
      );
      scheduler.register(
        defineSystem("Update2")
          .inPhase(Phase.Update)
          .execute(() => {}),
      );
      scheduler.register(
        defineSystem("Post")
          .inPhase(Phase.PostUpdate)
          .execute(() => {}),
      );

      expect(scheduler.getSystemsInPhase(Phase.PreUpdate).length).toBe(1);
      expect(scheduler.getSystemsInPhase(Phase.Update).length).toBe(2);
      expect(scheduler.getSystemsInPhase(Phase.PostUpdate).length).toBe(1);
    });
  });

  describe("Dependency sorting", () => {
    it("sorts systems by before dependency", () => {
      const order: string[] = [];

      scheduler.register(
        defineSystem("B")
          .inPhase(Phase.Update)
          .execute(() => order.push("B")),
      );
      scheduler.register(
        defineSystem("A")
          .inPhase(Phase.Update)
          .before("B")
          .execute(() => order.push("A")),
      );

      const world = new World(100);
      scheduler.runPhase(Phase.Update, world);

      expect(order).toEqual(["A", "B"]);
    });

    it("sorts systems by after dependency", () => {
      const order: string[] = [];

      scheduler.register(
        defineSystem("A")
          .inPhase(Phase.Update)
          .execute(() => order.push("A")),
      );
      scheduler.register(
        defineSystem("B")
          .inPhase(Phase.Update)
          .after("A")
          .execute(() => order.push("B")),
      );

      const world = new World(100);
      scheduler.runPhase(Phase.Update, world);

      expect(order).toEqual(["A", "B"]);
    });

    it("handles complex dependency chain", () => {
      const order: string[] = [];

      scheduler.register(
        defineSystem("D")
          .inPhase(Phase.Update)
          .after("C")
          .execute(() => order.push("D")),
      );
      scheduler.register(
        defineSystem("A")
          .inPhase(Phase.Update)
          .execute(() => order.push("A")),
      );
      scheduler.register(
        defineSystem("C")
          .inPhase(Phase.Update)
          .after("B")
          .execute(() => order.push("C")),
      );
      scheduler.register(
        defineSystem("B")
          .inPhase(Phase.Update)
          .after("A")
          .execute(() => order.push("B")),
      );

      const world = new World(100);
      scheduler.runPhase(Phase.Update, world);

      expect(order).toEqual(["A", "B", "C", "D"]);
    });

    it("throws on circular dependency", () => {
      scheduler.register(
        defineSystem("A")
          .inPhase(Phase.Update)
          .after("B")
          .execute(() => {}),
      );
      scheduler.register(
        defineSystem("B")
          .inPhase(Phase.Update)
          .after("A")
          .execute(() => {}),
      );

      const world = new World(100);
      expect(() => scheduler.runPhase(Phase.Update, world)).toThrow(
        /Circular dependency/,
      );
    });
  });

  describe("Execution", () => {
    it("runs all phases in order", () => {
      const order: string[] = [];

      scheduler.register(
        defineSystem("Post")
          .inPhase(Phase.PostUpdate)
          .execute(() => order.push("Post")),
      );
      scheduler.register(
        defineSystem("Pre")
          .inPhase(Phase.PreUpdate)
          .execute(() => order.push("Pre")),
      );
      scheduler.register(
        defineSystem("Update")
          .inPhase(Phase.Update)
          .execute(() => order.push("Update")),
      );

      const world = new World(100);
      scheduler.runAll(world);

      expect(order).toEqual(["Pre", "Update", "Post"]);
    });

    it("skips disabled systems", () => {
      const order: string[] = [];

      scheduler.register(
        defineSystem("A")
          .inPhase(Phase.Update)
          .execute(() => order.push("A")),
      );
      scheduler.register(
        defineSystem("B")
          .inPhase(Phase.Update)
          .disabled()
          .execute(() => order.push("B")),
      );
      scheduler.register(
        defineSystem("C")
          .inPhase(Phase.Update)
          .execute(() => order.push("C")),
      );

      const world = new World(100);
      scheduler.runAll(world);

      expect(order).toEqual(["A", "C"]);
    });

    it("passes world to system", () => {
      let receivedWorld: World | null = null;

      scheduler.register(
        defineSystem("Receiver")
          .inPhase(Phase.Update)
          .execute((world) => {
            receivedWorld = world;
          }),
      );

      const world = new World(100);
      scheduler.runAll(world);

      expect(receivedWorld).toBe(world);
    });
  });

  describe("Enable/Disable", () => {
    it("enableSystem enables a disabled system", () => {
      scheduler.register(
        defineSystem("Test")
          .inPhase(Phase.Update)
          .disabled()
          .execute(() => {}),
      );

      expect(scheduler.getSystem("Test")?.enabled).toBe(false);

      scheduler.enableSystem("Test");

      expect(scheduler.getSystem("Test")?.enabled).toBe(true);
    });

    it("disableSystem disables an enabled system", () => {
      scheduler.register(
        defineSystem("Test")
          .inPhase(Phase.Update)
          .execute(() => {}),
      );

      expect(scheduler.getSystem("Test")?.enabled).toBe(true);

      scheduler.disableSystem("Test");

      expect(scheduler.getSystem("Test")?.enabled).toBe(false);
    });

    it("returns false for non-existent system", () => {
      expect(scheduler.enableSystem("NonExistent")).toBe(false);
      expect(scheduler.disableSystem("NonExistent")).toBe(false);
    });
  });

  describe("Clear", () => {
    it("removes all systems", () => {
      scheduler.register(
        defineSystem("A")
          .inPhase(Phase.Update)
          .execute(() => {}),
      );
      scheduler.register(
        defineSystem("B")
          .inPhase(Phase.Update)
          .execute(() => {}),
      );

      expect(scheduler.getAllSystems().length).toBe(2);

      scheduler.clear();

      expect(scheduler.getAllSystems().length).toBe(0);
      expect(scheduler.getSystemsInPhase(Phase.Update).length).toBe(0);
    });
  });
});

describe("Phase 2: World Integration", () => {
  let world: World;

  beforeEach(() => {
    world = new World(1024);
  });

  describe("addSystem with System object", () => {
    it("registers system via world.addSystem", () => {
      const order: string[] = [];

      world.addSystem(
        defineSystem("Test")
          .inPhase(Phase.Update)
          .execute(() => order.push("Test")),
      );

      world.runTick();

      expect(order).toEqual(["Test"]);
    });

    it("respects dependencies when added via world", () => {
      const order: string[] = [];

      world.addSystem(
        defineSystem("B")
          .inPhase(Phase.Update)
          .execute(() => order.push("B")),
      );
      world.addSystem(
        defineSystem("A")
          .inPhase(Phase.Update)
          .before("B")
          .execute(() => order.push("A")),
      );

      world.runTick();

      expect(order).toEqual(["A", "B"]);
    });
  });

  describe("scheduler access", () => {
    it("world.scheduler is accessible", () => {
      expect(world.scheduler).toBeInstanceOf(SystemScheduler);
    });

    it("can enable/disable via world.scheduler", () => {
      const order: string[] = [];

      world.addSystem(
        defineSystem("Toggle")
          .inPhase(Phase.Update)
          .execute(() => order.push("Toggle")),
      );

      world.runTick();
      expect(order).toEqual(["Toggle"]);

      world.scheduler.disableSystem("Toggle");
      world.runTick();
      expect(order).toEqual(["Toggle"]);

      world.scheduler.enableSystem("Toggle");
      world.runTick();
      expect(order).toEqual(["Toggle", "Toggle"]);
    });
  });

  describe("System with ECS operations", () => {
    it("system can spawn entities", () => {
      world.addSystem(
        defineSystem("Spawner")
          .inPhase(Phase.Update)
          .execute((w) => {
            w.spawn(Position);
          }),
      );

      expect(world.getEntityCount()).toBe(0);

      world.runTick();

      expect(world.getEntityCount()).toBe(1);
    });

    it("system can query and modify entities", () => {
      const entity = world.spawn(Position, Velocity);
      world.set(entity, Position, { x: 0, y: 0 });
      world.set(entity, Velocity, { x: 1, y: 2 });

      world.addSystem(
        defineSystem("Movement")
          .inPhase(Phase.Update)
          .execute((w) => {
            w.query(Position, Velocity).run((view) => {
              const posX = view.column(Position, "x");
              const posY = view.column(Position, "y");
              const velX = view.column(Velocity, "x");
              const velY = view.column(Velocity, "y");

              for (let i = 0; i < view.rawCount(); i++) {
                posX[i] += velX[i];
                posY[i] += velY[i];
              }
            });
          }),
      );

      world.runTick();

      const pos = world.get(entity, Position);
      expect(pos?.x).toBe(1);
      expect(pos?.y).toBe(2);
    });
  });
});

describe("Phase 2: Performance", () => {
  it("1000 system registrations < 10ms", () => {
    const scheduler = new SystemScheduler();

    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      scheduler.register(
        defineSystem(`System${i}`)
          .inPhase(Phase.Update)
          .execute(() => {}),
      );
    }
    const elapsed = performance.now() - start;

    console.log(`  1000 system registrations: ${elapsed.toFixed(2)}ms`);
    expect(elapsed).toBeLessThan(10);
  });

  it("100 systems x 100 ticks < 50ms", () => {
    const world = new World(100);

    for (let i = 0; i < 100; i++) {
      world.addSystem(
        defineSystem(`System${i}`)
          .inPhase(Phase.Update)
          .execute(() => {}),
      );
    }

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      world.runTick();
    }
    const elapsed = performance.now() - start;

    console.log(`  100 systems x 100 ticks: ${elapsed.toFixed(2)}ms`);
    expect(elapsed).toBeLessThan(50);
  });
});
