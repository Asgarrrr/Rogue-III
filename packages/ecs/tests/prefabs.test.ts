import { describe, it, expect, beforeEach } from "bun:test";
import {
  World,
  component,
  f32,
  u32,
  PrefabRegistry,
  prefab,
  type Entity,
} from "@rogue/ecs";

// Test components
@component
class Position {
  x = f32(0);
  y = f32(0);
}

@component
class Velocity {
  vx = f32(0);
  vy = f32(0);
}

@component
class Health {
  current = u32(100);
  max = u32(100);
}

@component
class Attack {
  damage = u32(10);
  range = f32(1);
}

@component
class Tag {}

@component
class AIBehavior {
  state = u32(0);
}

describe("PrefabRegistry", () => {
  let world: World;
  let prefabs: PrefabRegistry;

  beforeEach(() => {
    world = new World();
    prefabs = new PrefabRegistry();
  });

  describe("Basic Definition", () => {
    it("should define a prefab", () => {
      prefabs.define({
        name: "Player",
        components: [{ type: Position }, { type: Health }],
      });

      expect(prefabs.has("Player")).toBe(true);
      expect(prefabs.size).toBe(1);
    });

    it("should get prefab definition", () => {
      prefabs.define({
        name: "Player",
        components: [{ type: Position }],
      });

      const def = prefabs.get("Player");
      expect(def?.name).toBe("Player");
      expect(def?.components).toHaveLength(1);
    });

    it("should list all prefab names", () => {
      prefabs.define({ name: "A", components: [] });
      prefabs.define({ name: "B", components: [] });
      prefabs.define({ name: "C", components: [] });

      const names = prefabs.names();
      expect(names).toContain("A");
      expect(names).toContain("B");
      expect(names).toContain("C");
    });

    it("should throw on duplicate definition", () => {
      prefabs.define({ name: "Player", components: [] });

      expect(() => {
        prefabs.define({ name: "Player", components: [] });
      }).toThrow('Prefab "Player" is already defined');
    });
  });

  describe("Spawning", () => {
    it("should spawn entity with components", () => {
      prefabs.define({
        name: "Player",
        components: [{ type: Position }, { type: Health }],
      });

      const entity = prefabs.spawn(world, "Player");

      expect(world.has(entity, Position)).toBe(true);
      expect(world.has(entity, Health)).toBe(true);
    });

    it("should spawn with initial values", () => {
      prefabs.define({
        name: "Player",
        components: [
          { type: Position, init: { x: 100, y: 200 } },
          { type: Health, init: { current: 50, max: 100 } },
        ],
      });

      const entity = prefabs.spawn(world, "Player");

      const pos = world.get(entity, Position);
      expect(pos?.x).toBe(100);
      expect(pos?.y).toBe(200);

      const health = world.get(entity, Health);
      expect(health?.current).toBe(50);
      expect(health?.max).toBe(100);
    });

    it("should spawn with factory function", () => {
      let counter = 0;

      prefabs.define({
        name: "Numbered",
        components: [
          {
            type: Position,
            init: () => {
              counter++;
              return { x: counter * 10, y: 0 };
            },
          },
        ],
      });

      const e1 = prefabs.spawn(world, "Numbered");
      const e2 = prefabs.spawn(world, "Numbered");
      const e3 = prefabs.spawn(world, "Numbered");

      expect(world.get(e1, Position)?.x).toBe(10);
      expect(world.get(e2, Position)?.x).toBe(20);
      expect(world.get(e3, Position)?.x).toBe(30);
    });

    it("should apply overrides", () => {
      prefabs.define({
        name: "Player",
        components: [
          { type: Position, init: { x: 0, y: 0 } },
          { type: Health, init: { current: 100, max: 100 } },
        ],
      });

      const overrides = new Map();
      overrides.set(Position, { x: 500, y: 300 });

      const entity = prefabs.spawn(world, "Player", overrides);

      const pos = world.get(entity, Position);
      expect(pos?.x).toBe(500);
      expect(pos?.y).toBe(300);

      // Health should still be default
      const health = world.get(entity, Health);
      expect(health?.current).toBe(100);
    });

    it("should spawn tag components", () => {
      prefabs.define({
        name: "Tagged",
        components: [{ type: Tag }],
      });

      const entity = prefabs.spawn(world, "Tagged");
      expect(world.has(entity, Tag)).toBe(true);
    });

    it("should call onCreate callback", () => {
      let calledWith: Entity | null = null;

      prefabs.define({
        name: "Player",
        components: [{ type: Position }],
        onCreate: (entity) => {
          calledWith = entity;
        },
      });

      const entity = prefabs.spawn(world, "Player");
      expect(calledWith).toBe(entity);
    });

    it("should throw on unknown prefab", () => {
      expect(() => {
        prefabs.spawn(world, "Unknown");
      }).toThrow('Prefab "Unknown" not found');
    });
  });

  describe("Inheritance", () => {
    it("should inherit components from parent", () => {
      prefabs.define({
        name: "Creature",
        components: [{ type: Position }, { type: Health }],
      });

      prefabs.define({
        name: "Goblin",
        extends: "Creature",
        components: [{ type: Attack }],
      });

      const goblin = prefabs.spawn(world, "Goblin");

      expect(world.has(goblin, Position)).toBe(true);
      expect(world.has(goblin, Health)).toBe(true);
      expect(world.has(goblin, Attack)).toBe(true);
    });

    it("should override parent component values", () => {
      prefabs.define({
        name: "Creature",
        components: [{ type: Health, init: { current: 100, max: 100 } }],
      });

      prefabs.define({
        name: "Goblin",
        extends: "Creature",
        components: [{ type: Health, init: { current: 30, max: 30 } }],
      });

      const creature = prefabs.spawn(world, "Creature");
      const goblin = prefabs.spawn(world, "Goblin");

      expect(world.get(creature, Health)?.current).toBe(100);
      expect(world.get(goblin, Health)?.current).toBe(30);
    });

    it("should support multi-level inheritance", () => {
      prefabs.define({
        name: "Entity",
        components: [{ type: Position }],
      });

      prefabs.define({
        name: "Creature",
        extends: "Entity",
        components: [{ type: Health }],
      });

      prefabs.define({
        name: "Monster",
        extends: "Creature",
        components: [{ type: Attack }],
      });

      prefabs.define({
        name: "Goblin",
        extends: "Monster",
        components: [{ type: AIBehavior }],
      });

      const goblin = prefabs.spawn(world, "Goblin");

      expect(world.has(goblin, Position)).toBe(true);
      expect(world.has(goblin, Health)).toBe(true);
      expect(world.has(goblin, Attack)).toBe(true);
      expect(world.has(goblin, AIBehavior)).toBe(true);
    });

    it("should chain onCreate callbacks", () => {
      const calls: string[] = [];

      prefabs.define({
        name: "Parent",
        components: [],
        onCreate: () => calls.push("parent"),
      });

      prefabs.define({
        name: "Child",
        extends: "Parent",
        components: [],
        onCreate: () => calls.push("child"),
      });

      prefabs.spawn(world, "Child");

      expect(calls).toEqual(["parent", "child"]);
    });

    it("should throw on unknown parent", () => {
      expect(() => {
        prefabs.define({
          name: "Child",
          extends: "Unknown",
          components: [],
        });
      }).toThrow('Parent prefab "Unknown" not found');
    });
  });

  describe("SpawnMany", () => {
    it("should spawn multiple entities", () => {
      prefabs.define({
        name: "Item",
        components: [{ type: Position }],
      });

      const entities = prefabs.spawnMany(world, "Item", 10);

      expect(entities).toHaveLength(10);
      for (const e of entities) {
        expect(world.has(e, Position)).toBe(true);
      }
    });

    it("should apply per-entity overrides", () => {
      prefabs.define({
        name: "Item",
        components: [{ type: Position, init: { x: 0, y: 0 } }],
      });

      const entities = prefabs.spawnMany(world, "Item", 5, (i) => {
        const overrides = new Map();
        overrides.set(Position, { x: i * 100, y: 0 });
        return overrides;
      });

      for (let i = 0; i < 5; i++) {
        const pos = world.get(entities[i], Position);
        expect(pos?.x).toBe(i * 100);
      }
    });
  });

  describe("Removal", () => {
    it("should remove prefab", () => {
      prefabs.define({ name: "Test", components: [] });
      expect(prefabs.has("Test")).toBe(true);

      prefabs.remove("Test");
      expect(prefabs.has("Test")).toBe(false);
    });

    it("should throw when removing prefab that is extended", () => {
      prefabs.define({ name: "Parent", components: [] });
      prefabs.define({ name: "Child", extends: "Parent", components: [] });

      expect(() => {
        prefabs.remove("Parent");
      }).toThrow('Cannot remove prefab "Parent" because "Child" extends it');
    });

    it("should clear all prefabs", () => {
      prefabs.define({ name: "A", components: [] });
      prefabs.define({ name: "B", components: [] });

      prefabs.clear();

      expect(prefabs.size).toBe(0);
    });
  });
});

describe("Prefab Builder", () => {
  let world: World;
  let registry: PrefabRegistry;

  beforeEach(() => {
    world = new World();
    registry = new PrefabRegistry();
  });

  it("should build prefab with fluent API", () => {
    const def = prefab("Player")
      .with(Position, { x: 100, y: 200 })
      .with(Health, { current: 100, max: 100 })
      .build();

    registry.define(def);
    const entity = registry.spawn(world, "Player");

    expect(world.get(entity, Position)?.x).toBe(100);
    expect(world.get(entity, Health)?.current).toBe(100);
  });

  it("should support tag components", () => {
    const def = prefab("Tagged").with(Position).tag(Tag).build();

    registry.define(def);
    const entity = registry.spawn(world, "Tagged");

    expect(world.has(entity, Position)).toBe(true);
    expect(world.has(entity, Tag)).toBe(true);
  });

  it("should support extends", () => {
    registry.define(prefab("Base").with(Position).build());

    registry.define(prefab("Child").extends("Base").with(Health).build());

    const entity = registry.spawn(world, "Child");
    expect(world.has(entity, Position)).toBe(true);
    expect(world.has(entity, Health)).toBe(true);
  });

  it("should support onCreate", () => {
    let called = false;

    const def = prefab("Test")
      .with(Position)
      .onCreate(() => {
        called = true;
      })
      .build();

    registry.define(def);
    registry.spawn(world, "Test");

    expect(called).toBe(true);
  });
});

describe("Prefab Performance", () => {
  it("should spawn many entities efficiently", () => {
    const world = new World(100_000);
    const prefabs = new PrefabRegistry();

    prefabs.define({
      name: "Enemy",
      components: [
        { type: Position, init: { x: 0, y: 0 } },
        { type: Health, init: { current: 100, max: 100 } },
        { type: Attack, init: { damage: 10, range: 1 } },
        { type: AIBehavior },
      ],
    });

    const start = performance.now();
    const entities = prefabs.spawnMany(world, "Enemy", 10_000);
    const spawnTime = performance.now() - start;

    console.log(`  Spawn 10k prefabs: ${spawnTime.toFixed(2)}ms`);

    expect(entities).toHaveLength(10_000);
    expect(spawnTime).toBeLessThan(500);
  });

  it("should handle deep inheritance", () => {
    const world = new World(10_000);
    const prefabs = new PrefabRegistry();

    // Create deep inheritance chain
    prefabs.define({ name: "L0", components: [{ type: Position }] });
    prefabs.define({ name: "L1", extends: "L0", components: [{ type: Health }] });
    prefabs.define({ name: "L2", extends: "L1", components: [{ type: Attack }] });
    prefabs.define({ name: "L3", extends: "L2", components: [{ type: Velocity }] });
    prefabs.define({ name: "L4", extends: "L3", components: [{ type: AIBehavior }] });

    const start = performance.now();
    const entities = prefabs.spawnMany(world, "L4", 1000);
    const spawnTime = performance.now() - start;

    console.log(`  Spawn 1k deep prefabs (5 levels): ${spawnTime.toFixed(2)}ms`);

    // Verify all components are present
    for (const e of entities.slice(0, 10)) {
      expect(world.has(e, Position)).toBe(true);
      expect(world.has(e, Health)).toBe(true);
      expect(world.has(e, Attack)).toBe(true);
      expect(world.has(e, Velocity)).toBe(true);
      expect(world.has(e, AIBehavior)).toBe(true);
    }

    expect(spawnTime).toBeLessThan(200);
  });
});
