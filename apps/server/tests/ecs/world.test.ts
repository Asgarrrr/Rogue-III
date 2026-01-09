/**
 * World Integration Tests
 */

import { describe, expect, it, beforeEach } from "bun:test";
import {
  World,
  ComponentSchema,
  ComponentType,
  defineSystem,
  SystemPhase,
  EventQueue,
  type Entity,
} from "../../src/game/ecs";

describe("World", () => {
  let world: World;

  // Define test schemas
  const PositionSchema = ComponentSchema.define<{ x: number; y: number }>(
    "Position",
  )
    .field("x", ComponentType.F32, 0)
    .field("y", ComponentType.F32, 0)
    .build();

  const VelocitySchema = ComponentSchema.define<{ x: number; y: number }>(
    "Velocity",
  )
    .field("x", ComponentType.F32, 0)
    .field("y", ComponentType.F32, 0)
    .build();

  const HealthSchema = ComponentSchema.define<{ hp: number; maxHp: number }>(
    "Health",
  )
    .field("hp", ComponentType.I32, 100)
    .field("maxHp", ComponentType.I32, 100)
    .build();

  beforeEach(() => {
    world = new World();
    world.registerComponent(PositionSchema);
    world.registerComponent(VelocitySchema);
    world.registerComponent(HealthSchema);
  });

  describe("Entity Management", () => {
    it("should spawn and despawn entities", () => {
      const entity = world.spawn();

      expect(world.isAlive(entity)).toBe(true);

      world.despawn(entity);

      expect(world.isAlive(entity)).toBe(false);
    });

    it("should spawn entity with components", () => {
      const entity = world.spawnWith({
        Position: { x: 10, y: 20 },
        Health: { hp: 50, maxHp: 100 },
      });

      expect(world.getComponent(entity, "Position")).toEqual({ x: 10, y: 20 });
      expect(world.getComponent(entity, "Health")).toEqual({
        hp: 50,
        maxHp: 100,
      });
    });
  });

  describe("Component Management", () => {
    it("should add and get components", () => {
      const entity = world.spawn();

      world.addComponent(entity, "Position", { x: 5, y: 10 });

      const pos = world.getComponent<{ x: number; y: number }>(
        entity,
        "Position",
      );
      expect(pos).toEqual({ x: 5, y: 10 });
    });

    it("should remove components", () => {
      const entity = world.spawn();
      world.addComponent(entity, "Position", { x: 5, y: 10 });

      world.removeComponent(entity, "Position");

      expect(world.hasComponent(entity, "Position")).toBe(false);
    });

    it("should check component existence", () => {
      const entity = world.spawn();

      expect(world.hasComponent(entity, "Position")).toBe(false);

      world.addComponent(entity, "Position", { x: 0, y: 0 });

      expect(world.hasComponent(entity, "Position")).toBe(true);
    });
  });

  describe("Query System", () => {
    it("should query entities with specific components", () => {
      const e1 = world.spawn();
      const e2 = world.spawn();
      const e3 = world.spawn();

      world.addComponent(e1, "Position", { x: 0, y: 0 });
      world.addComponent(e1, "Velocity", { x: 1, y: 1 });

      world.addComponent(e2, "Position", { x: 0, y: 0 });

      world.addComponent(e3, "Velocity", { x: 1, y: 1 });

      const query = world.query({
        with: ["Position", "Velocity"],
        without: [],
      });
      const results = query.execute();

      expect(results.length).toBe(1);
      expect(results[0]).toBe(e1);
    });

    it("should exclude entities with specific components", () => {
      const e1 = world.spawn();
      const e2 = world.spawn();

      world.addComponent(e1, "Position", { x: 0, y: 0 });
      world.addComponent(e2, "Position", { x: 0, y: 0 });
      world.addComponent(e2, "Health", { hp: 100, maxHp: 100 });

      const query = world.query({ with: ["Position"], without: ["Health"] });
      const results = query.execute();

      expect(results.length).toBe(1);
      expect(results[0]).toBe(e1);
    });

    it("should cache query results", () => {
      const entity = world.spawn();
      world.addComponent(entity, "Position", { x: 0, y: 0 });

      const query1 = world.query({ with: ["Position"], without: [] });
      const query2 = world.query({ with: ["Position"], without: [] });

      expect(query1).toBe(query2);
    });
  });

  describe("System Execution", () => {
    it("should execute systems in correct phase order", () => {
      const executionOrder: string[] = [];

      const PreSystem = defineSystem("PreSystem")
        .inPhase(SystemPhase.PreUpdate)
        .execute(() => {
          executionOrder.push("pre");
        });

      const UpdateSystem = defineSystem("UpdateSystem")
        .inPhase(SystemPhase.Update)
        .execute(() => {
          executionOrder.push("update");
        });

      const PostSystem = defineSystem("PostSystem")
        .inPhase(SystemPhase.PostUpdate)
        .execute(() => {
          executionOrder.push("post");
        });

      world.systems.register(PostSystem);
      world.systems.register(PreSystem);
      world.systems.register(UpdateSystem);

      world.initialize();
      world.tick();

      expect(executionOrder).toEqual(["pre", "update", "post"]);
    });

    it("should respect system dependencies", () => {
      const executionOrder: string[] = [];

      const SystemA = defineSystem("SystemA")
        .inPhase(SystemPhase.Update)
        .runAfter("SystemB")
        .execute(() => {
          executionOrder.push("A");
        });

      const SystemB = defineSystem("SystemB")
        .inPhase(SystemPhase.Update)
        .execute(() => {
          executionOrder.push("B");
        });

      world.systems.register(SystemA);
      world.systems.register(SystemB);

      world.initialize();
      world.tick();

      expect(executionOrder).toEqual(["B", "A"]);
    });

    it("should provide access to world in systems", () => {
      let entityCount = 0;

      const CountSystem = defineSystem("CountSystem")
        .inPhase(SystemPhase.Update)
        .execute((w) => {
          entityCount = w.entities.getAliveCount();
        });

      world.systems.register(CountSystem);
      world.initialize();

      world.spawn();
      world.spawn();
      world.tick();

      expect(entityCount).toBe(2);
    });
  });

  describe("Command Buffer", () => {
    it("should defer entity spawning", () => {
      const pendingId = world.commands.spawn();
      world.commands.addComponentToPending(pendingId, "Position", {
        x: 0,
        y: 0,
      });

      expect(world.entities.getAliveCount()).toBe(0);

      const resolved = world.commands.flush(world);
      const entity = resolved.get(pendingId)!;

      expect(world.entities.getAliveCount()).toBe(1);
      expect(world.hasComponent(entity, "Position")).toBe(true);
    });

    it("should defer component operations", () => {
      const entity = world.spawn();
      world.addComponent(entity, "Position", { x: 0, y: 0 });

      world.commands.removeComponent(entity, "Position");
      expect(world.hasComponent(entity, "Position")).toBe(true);

      world.commands.flush(world);
      expect(world.hasComponent(entity, "Position")).toBe(false);
    });
  });

  describe("Resources", () => {
    it("should register and retrieve resources", () => {
      world.resources.register("testValue", 42);

      expect(world.resources.get("testValue")).toBe(42);
    });

    it("should track currentTick", () => {
      expect(world.getCurrentTick()).toBe(0);

      world.tick();
      expect(world.getCurrentTick()).toBe(1);

      world.tick();
      world.tick();
      expect(world.getCurrentTick()).toBe(3);
    });
  });

  describe("Statistics", () => {
    it("should return correct stats", () => {
      world.spawn();
      world.spawn();

      const stats = world.getStats();

      expect(stats.entityCount).toBe(2);
      expect(stats.componentTypeCount).toBe(3); // Position, Velocity, Health
      expect(stats.currentTick).toBe(0);
    });
  });

  describe("Reset", () => {
    it("should reset world state", () => {
      world.spawn();
      world.spawn();
      world.tick();
      world.tick();

      world.reset();

      expect(world.entities.getAliveCount()).toBe(0);
      expect(world.getCurrentTick()).toBe(0);
    });
  });
});

describe("EventQueue", () => {
  let events: EventQueue;

  beforeEach(() => {
    events = new EventQueue();
  });

  it("should emit and receive typed events", () => {
    let received = false;
    let damageAmount = 0;

    events.on("combat.damage", (e) => {
      received = true;
      damageAmount = e.damage;
    });

    events.emit({
      type: "combat.damage",
      attacker: 1 as Entity,
      target: 2 as Entity,
      damage: 25,
    });

    events.process();

    expect(received).toBe(true);
    expect(damageAmount).toBe(25);
  });

  it("should handle multiple handlers", () => {
    let count = 0;

    events.on("entity.spawned", () => {
      count++;
    });
    events.on("entity.spawned", () => {
      count++;
    });

    events.emit({ type: "entity.spawned", entity: 1 as Entity });
    events.process();

    expect(count).toBe(2);
  });

  it("should support wildcard handlers", () => {
    const allEvents: string[] = [];

    events.onAny((e) => {
      allEvents.push(e.type);
    });

    events.emit({ type: "entity.spawned", entity: 1 as Entity });
    events.emit({
      type: "combat.damage",
      attacker: 1 as Entity,
      target: 2 as Entity,
      damage: 10,
    });
    events.process();

    expect(allEvents).toEqual(["entity.spawned", "combat.damage"]);
  });

  it("should clear pending events", () => {
    events.emit({ type: "entity.spawned", entity: 1 as Entity });
    events.emit({ type: "entity.spawned", entity: 2 as Entity });

    expect(events.getPendingCount()).toBe(2);

    events.clear();

    expect(events.getPendingCount()).toBe(0);
  });
});
