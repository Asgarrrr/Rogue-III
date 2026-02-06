import { describe, it, expect, beforeEach } from "bun:test";
import {
  World,
  component,
  f32,
  i32,
  Phase,
  defineSystem,
  condition,
  runOnce,
  resourceExists,
  resourceEquals,
  resourceMatches,
  anyWith,
  noneWith,
  hasEvent,
  everyNTicks,
  afterTick,
  componentAdded,
  componentChanged,
  always,
  never,
  State,
  inState,
  notInState,
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
class Enemy {}

@component
class Player {}

class Counter {
  value = 0;
}

class GameState extends State<"menu" | "playing" | "paused"> {}

describe("Run Conditions", () => {
  let world: World;

  beforeEach(() => {
    world = new World(1000);
  });

  describe("Basic Conditions", () => {
    it("always returns true", () => {
      expect(always(world)).toBe(true);
    });

    it("never returns false", () => {
      expect(never(world)).toBe(false);
    });

    it("condition() wraps a predicate", () => {
      const cond = condition((w) => w.getEntityCount() > 0);
      expect(cond(world)).toBe(false);

      world.spawn(Position);
      expect(cond(world)).toBe(true);
    });
  });

  describe("Condition Composition", () => {
    it("and() combines conditions with short-circuit", () => {
      let secondCalled = false;
      const first = condition(() => false);
      const second = condition(() => {
        secondCalled = true;
        return true;
      });

      const combined = first.and(second);
      expect(combined(world)).toBe(false);
      expect(secondCalled).toBe(false); // Short-circuit: second not called
    });

    it("or() combines conditions with short-circuit", () => {
      let secondCalled = false;
      const first = condition(() => true);
      const second = condition(() => {
        secondCalled = true;
        return false;
      });

      const combined = first.or(second);
      expect(combined(world)).toBe(true);
      expect(secondCalled).toBe(false); // Short-circuit: second not called
    });

    it("not() negates a condition", () => {
      const cond = condition(() => true);
      expect(cond.not()(world)).toBe(false);
    });

    it("complex composition works", () => {
      world.setResource(Counter, new Counter());
      world.spawn(Enemy);

      const cond = resourceExists(Counter)
        .and(anyWith(Enemy))
        .and(noneWith(Player).not().not()); // Double negation = original

      expect(cond(world)).toBe(true);
    });
  });

  describe("runOnce()", () => {
    it("returns true only on first call", () => {
      const cond = runOnce();

      expect(cond(world)).toBe(true);
      expect(cond(world)).toBe(false);
      expect(cond(world)).toBe(false);
    });
  });

  describe("Resource Conditions", () => {
    it("resourceExists() checks if resource exists", () => {
      expect(resourceExists(Counter)(world)).toBe(false);

      world.setResource(Counter, new Counter());
      expect(resourceExists(Counter)(world)).toBe(true);
    });

    it("resourceEquals() checks resource equality", () => {
      const counter = new Counter();
      counter.value = 42;
      world.setResource(Counter, counter);

      expect(resourceEquals(Counter, counter)(world)).toBe(true);
    });

    it("resourceMatches() checks resource with predicate", () => {
      const counter = new Counter();
      counter.value = 42;
      world.setResource(Counter, counter);

      expect(resourceMatches(Counter, (c) => c.value > 40)(world)).toBe(true);
      expect(resourceMatches(Counter, (c) => c.value > 50)(world)).toBe(false);
    });
  });

  describe("Entity Conditions", () => {
    it("anyWith() checks if any entity has components", () => {
      expect(anyWith(Enemy)(world)).toBe(false);

      world.spawn(Enemy);
      expect(anyWith(Enemy)(world)).toBe(true);
    });

    it("noneWith() checks if no entity has components", () => {
      expect(noneWith(Enemy)(world)).toBe(true);

      world.spawn(Enemy);
      expect(noneWith(Enemy)(world)).toBe(false);
    });
  });

  describe("Event Conditions", () => {
    it("hasEvent() checks for pending events", () => {
      expect(hasEvent("combat.damage")(world)).toBe(false);

      world.emit({
        type: "combat.damage",
        attacker: 1 as any,
        target: 2 as any,
        damage: 10,
      });

      expect(hasEvent("combat.damage")(world)).toBe(true);
    });
  });

  describe("Tick Conditions", () => {
    it("everyNTicks() runs on specific intervals", () => {
      const cond = everyNTicks(5);

      // Tick 0 - should run
      expect(cond(world)).toBe(true);

      // Ticks 1-4 - should not run
      world.runTick();
      expect(cond(world)).toBe(false);
      world.runTick();
      expect(cond(world)).toBe(false);
      world.runTick();
      expect(cond(world)).toBe(false);
      world.runTick();
      expect(cond(world)).toBe(false);

      // Tick 5 - should run
      world.runTick();
      expect(cond(world)).toBe(true);
    });

    it("everyNTicks() throws on n <= 0", () => {
      expect(() => everyNTicks(0)).toThrow("everyNTicks: n must be positive");
      expect(() => everyNTicks(-1)).toThrow("everyNTicks: n must be positive");
    });

    it("afterTick() runs after a specific tick", () => {
      const cond = afterTick(3);

      expect(cond(world)).toBe(false); // Tick 0
      world.runTick();
      expect(cond(world)).toBe(false); // Tick 1
      world.runTick();
      expect(cond(world)).toBe(false); // Tick 2
      world.runTick();
      expect(cond(world)).toBe(true); // Tick 3
      world.runTick();
      expect(cond(world)).toBe(true); // Tick 4+
    });
  });

  describe("resourceEquals() null handling", () => {
    it("returns false when resource does not exist", () => {
      // Resource doesn't exist, comparing to any value should be false
      expect(resourceEquals(Counter, null as any)(world)).toBe(false);
      expect(resourceEquals(Counter, {} as any)(world)).toBe(false);
    });
  });

  describe("State Conditions", () => {
    it("inState() checks current state", () => {
      world.setResource(GameState, new GameState("menu"));

      expect(inState(GameState, "menu")(world)).toBe(true);
      expect(inState(GameState, "playing")(world)).toBe(false);

      world.getResource(GameState)!.current = "playing";
      expect(inState(GameState, "playing")(world)).toBe(true);
    });

    it("notInState() checks state is not a value", () => {
      world.setResource(GameState, new GameState("playing"));

      expect(notInState(GameState, "paused")(world)).toBe(true);
      expect(notInState(GameState, "playing")(world)).toBe(false);
    });
  });

  describe("System Integration", () => {
    it("system runs only when conditions are met", () => {
      let runCount = 0;
      world.setResource(GameState, new GameState("menu"));

      const system = defineSystem("TestSystem")
        .inPhase(Phase.Update)
        .runIf(inState(GameState, "playing"))
        .execute(() => {
          runCount++;
        });

      world.addSystem(system);

      // Should not run - state is menu
      world.runTick();
      expect(runCount).toBe(0);

      // Change state to playing
      world.getResource(GameState)!.current = "playing";

      // Should run now
      world.runTick();
      expect(runCount).toBe(1);
    });

    it("multiple conditions are all checked", () => {
      let runCount = 0;
      world.setResource(GameState, new GameState("playing"));

      const system = defineSystem("MultiCondition")
        .inPhase(Phase.Update)
        .runIf(inState(GameState, "playing"))
        .runIf(anyWith(Enemy))
        .execute(() => {
          runCount++;
        });

      world.addSystem(system);

      // Should not run - no enemies
      world.runTick();
      expect(runCount).toBe(0);

      // Spawn enemy
      world.spawn(Enemy);

      // Should run now
      world.runTick();
      expect(runCount).toBe(1);
    });
  });
});

describe("One-shot Systems", () => {
  let world: World;

  beforeEach(() => {
    world = new World(1000);
  });

  it("once() system runs only once", () => {
    let runCount = 0;

    const system = defineSystem("InitSystem")
      .once()
      .inPhase(Phase.Update)
      .execute(() => {
        runCount++;
      });

    world.addSystem(system);

    // First tick - should run
    world.runTick();
    expect(runCount).toBe(1);
    expect(system.enabled).toBe(false);

    // Second tick - should not run (disabled)
    world.runTick();
    expect(runCount).toBe(1);
  });

  it("once() with condition only runs once when condition is met", () => {
    let runCount = 0;
    world.setResource(GameState, new GameState("menu"));

    const system = defineSystem("InitWhenPlaying")
      .once()
      .inPhase(Phase.Update)
      .runIf(inState(GameState, "playing"))
      .execute(() => {
        runCount++;
      });

    world.addSystem(system);

    // State is menu - should not run
    world.runTick();
    expect(runCount).toBe(0);
    expect(system.enabled).toBe(true); // Still enabled

    // Change to playing
    world.getResource(GameState)!.current = "playing";

    // Should run once
    world.runTick();
    expect(runCount).toBe(1);
    expect(system.enabled).toBe(false);

    // Should not run again
    world.runTick();
    expect(runCount).toBe(1);
  });
});
