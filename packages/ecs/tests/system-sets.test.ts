import { describe, expect, it } from "bun:test";
import { World } from "@rogue/ecs";
import { defineComponent } from "@rogue/ecs";
import { Phase } from "@rogue/ecs";
import {
  defineSystem,
  SystemScheduler,
  inState,
  State,
} from "@rogue/ecs";

describe("System Sets", () => {
  it("should allow systems to belong to sets", () => {
    const MovementSet = Symbol("MovementSet");
    const CombatSet = Symbol("CombatSet");

    const system = defineSystem("PlayerMovement")
      .inPhase(Phase.Update)
      .inSet(MovementSet)
      .execute(() => {});

    expect(system.sets.has(MovementSet)).toBe(true);
    expect(system.sets.has(CombatSet)).toBe(false);
  });

  it("should allow systems to belong to multiple sets", () => {
    const MovementSet = Symbol("MovementSet");
    const SimulationSet = Symbol("SimulationSet");
    const CombatSet = Symbol("CombatSet");

    const system = defineSystem("Combat")
      .inPhase(Phase.Update)
      .inSets(SimulationSet, CombatSet)
      .execute(() => {});

    expect(system.sets.has(SimulationSet)).toBe(true);
    expect(system.sets.has(CombatSet)).toBe(true);
    expect(system.sets.has(MovementSet)).toBe(false);
  });

  it("should allow configuring set run conditions", () => {
    const world = new World();
    const scheduler = new SystemScheduler();

    class GameState extends State<"menu" | "playing"> {}
    world.setResource(GameState, new GameState("menu"));

    const GameplaySet = Symbol("GameplaySet");
    let systemRan = false;

    // Configure the set to only run when in "playing" state
    scheduler.configureSet(GameplaySet).runIf(inState(GameState, "playing"));

    // System in the set
    const system = defineSystem("GameLogic")
      .inPhase(Phase.Update)
      .inSet(GameplaySet)
      .execute(() => {
        systemRan = true;
      });

    scheduler.register(system);
    scheduler.compile();

    // Should not run in "menu" state
    scheduler.runPhase(Phase.Update, world);
    expect(systemRan).toBe(false);

    // Should run in "playing" state
    const state = world.getResource(GameState);
    if (state) state.current = "playing";
    scheduler.runPhase(Phase.Update, world);
    expect(systemRan).toBe(true);
  });

  it("should allow configuring set ordering", () => {
    const world = new World();
    const scheduler = new SystemScheduler();

    const InputSet = Symbol("InputSet");
    const PhysicsSet = Symbol("PhysicsSet");
    const RenderSet = Symbol("RenderSet");

    const order: string[] = [];

    // Configure sets to run in order
    scheduler.configureSets(InputSet, PhysicsSet, RenderSet).chain();

    // Create systems in different sets
    const inputSystem = defineSystem("ProcessInput")
      .inPhase(Phase.Update)
      .inSet(InputSet)
      .execute(() => order.push("input"));

    const physicsSystem = defineSystem("UpdatePhysics")
      .inPhase(Phase.Update)
      .inSet(PhysicsSet)
      .execute(() => order.push("physics"));

    const renderSystem = defineSystem("Render")
      .inPhase(Phase.Update)
      .inSet(RenderSet)
      .execute(() => order.push("render"));

    // Register in random order to test that set ordering takes precedence
    scheduler.register(renderSystem);
    scheduler.register(inputSystem);
    scheduler.register(physicsSystem);

    scheduler.compile();
    scheduler.runPhase(Phase.Update, world);

    // Should run in the order defined by set chain
    expect(order).toEqual(["input", "physics", "render"]);
  });

  it("should inherit set conditions to systems", () => {
    const world = new World();
    const scheduler = new SystemScheduler();

    class GameState extends State<"paused" | "playing"> {}
    world.setResource(GameState, new GameState("paused"));

    const SimulationSet = Symbol("SimulationSet");
    let system1Ran = false;
    let system2Ran = false;

    // Configure set with run condition
    scheduler.configureSet(SimulationSet).runIf(inState(GameState, "playing"));

    // Both systems in the set should inherit the condition
    const system1 = defineSystem("Physics")
      .inPhase(Phase.Update)
      .inSet(SimulationSet)
      .execute(() => {
        system1Ran = true;
      });

    const system2 = defineSystem("AI")
      .inPhase(Phase.Update)
      .inSet(SimulationSet)
      .execute(() => {
        system2Ran = true;
      });

    scheduler.register(system1);
    scheduler.register(system2);
    scheduler.compile();

    // Should not run when paused
    scheduler.runPhase(Phase.Update, world);
    expect(system1Ran).toBe(false);
    expect(system2Ran).toBe(false);

    // Should run when playing
    const state = world.getResource(GameState);
    if (state) state.current = "playing";
    scheduler.runPhase(Phase.Update, world);
    expect(system1Ran).toBe(true);
    expect(system2Ran).toBe(true);
  });

  it("should support set-to-set ordering constraints", () => {
    const world = new World();
    const scheduler = new SystemScheduler();

    const SetA = Symbol("SetA");
    const SetB = Symbol("SetB");
    const order: string[] = [];

    // Configure set ordering: A before B
    scheduler.configureSet(SetA).before(SetB);

    const systemA1 = defineSystem("A1")
      .inPhase(Phase.Update)
      .inSet(SetA)
      .execute(() => order.push("A1"));

    const systemA2 = defineSystem("A2")
      .inPhase(Phase.Update)
      .inSet(SetA)
      .execute(() => order.push("A2"));

    const systemB1 = defineSystem("B1")
      .inPhase(Phase.Update)
      .inSet(SetB)
      .execute(() => order.push("B1"));

    const systemB2 = defineSystem("B2")
      .inPhase(Phase.Update)
      .inSet(SetB)
      .execute(() => order.push("B2"));

    // Register in mixed order
    scheduler.register(systemB1);
    scheduler.register(systemA2);
    scheduler.register(systemB2);
    scheduler.register(systemA1);

    scheduler.compile();
    scheduler.runPhase(Phase.Update, world);

    // All A systems should run before all B systems
    const aIndices = order
      .map((s, i) => (s.startsWith("A") ? i : -1))
      .filter((i) => i >= 0);
    const bIndices = order
      .map((s, i) => (s.startsWith("B") ? i : -1))
      .filter((i) => i >= 0);

    expect(Math.max(...aIndices)).toBeLessThan(Math.min(...bIndices));
  });

  it("should combine system-level and set-level conditions", () => {
    const world = new World();
    const scheduler = new SystemScheduler();

    class GameState extends State<"menu" | "playing"> {}
    class DebugMode {
      constructor(public enabled: boolean) {}
    }

    world.setResource(GameState, new GameState("menu"));
    world.setResource(DebugMode, new DebugMode(false));

    const DebugSet = Symbol("DebugSet");
    let systemRan = false;

    // Set requires "playing" state
    scheduler.configureSet(DebugSet).runIf(inState(GameState, "playing"));

    // System additionally requires debug mode
    const system = defineSystem("DebugInfo")
      .inPhase(Phase.Update)
      .inSet(DebugSet)
      .runIf((w) => {
        const debug = w.getResource(DebugMode);
        return debug !== null && debug.enabled;
      })
      .execute(() => {
        systemRan = true;
      });

    scheduler.register(system);
    scheduler.compile();

    // Should not run: not playing
    scheduler.runPhase(Phase.Update, world);
    expect(systemRan).toBe(false);

    // Should not run: playing but debug disabled
    const state = world.getResource(GameState);
    if (state) state.current = "playing";
    scheduler.runPhase(Phase.Update, world);
    expect(systemRan).toBe(false);

    // Should run: playing AND debug enabled
    const debug = world.getResource(DebugMode);
    if (debug) debug.enabled = true;
    scheduler.runPhase(Phase.Update, world);
    expect(systemRan).toBe(true);
  });

  it("should support complex set hierarchies", () => {
    const world = new World();
    const scheduler = new SystemScheduler();

    const UpdateSet = Symbol("UpdateSet");
    const PhysicsSet = Symbol("PhysicsSet");
    const MovementSet = Symbol("MovementSet");
    const CollisionSet = Symbol("CollisionSet");

    const order: string[] = [];

    // Configure hierarchy: Update > Physics > Movement, Collision
    scheduler.configureSet(PhysicsSet).after(UpdateSet);
    scheduler.configureSet(MovementSet).after(PhysicsSet);
    scheduler.configureSet(CollisionSet).after(PhysicsSet);

    const updateSystem = defineSystem("Update")
      .inPhase(Phase.Update)
      .inSet(UpdateSet)
      .execute(() => order.push("update"));

    const physicsSystem = defineSystem("Physics")
      .inPhase(Phase.Update)
      .inSet(PhysicsSet)
      .execute(() => order.push("physics"));

    const movementSystem = defineSystem("Movement")
      .inPhase(Phase.Update)
      .inSet(MovementSet)
      .execute(() => order.push("movement"));

    const collisionSystem = defineSystem("Collision")
      .inPhase(Phase.Update)
      .inSet(CollisionSet)
      .execute(() => order.push("collision"));

    // Register in random order
    scheduler.register(collisionSystem);
    scheduler.register(updateSystem);
    scheduler.register(movementSystem);
    scheduler.register(physicsSystem);

    scheduler.compile();
    scheduler.runPhase(Phase.Update, world);

    // Verify ordering constraints
    const updateIdx = order.indexOf("update");
    const physicsIdx = order.indexOf("physics");
    const movementIdx = order.indexOf("movement");
    const collisionIdx = order.indexOf("collision");

    expect(updateIdx).toBeLessThan(physicsIdx);
    expect(physicsIdx).toBeLessThan(movementIdx);
    expect(physicsIdx).toBeLessThan(collisionIdx);
  });
});
