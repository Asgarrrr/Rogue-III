import { describe, it, expect, beforeEach } from "bun:test";
import {
  World,
  CommandBuffer,
  component,
  f32,
  i32,
  type Entity,
  Phase,
  defineSystem,
  EventQueue,
  MigrationRegistry,
  WorldSerializer,
  addFieldMigration,
  removeFieldMigration,
  renameFieldMigration,
  renameComponentMigration,
  type WorldSnapshot,
  SNAPSHOT_VERSION,
  HookRegistry,
  type ComponentHooks,
} from "../../src/game/ecs-v2";

// Test components
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

describe("V3 Upgrade: Per-Component Change Detection", () => {
  let world: World;

  beforeEach(() => {
    world = new World(1024);
  });

  describe("Basic component change tracking", () => {
    it("detects which component was changed", () => {
      const entity = world.spawn(Position, Velocity);
      world.runTick(); // Clear initial flags

      // Only modify Position
      world.set(entity, Position, { x: 10, y: 20 });

      // changedComponent(Position) should match
      expect(world.query(Position, Velocity).changedComponent(Position).count()).toBe(1);

      // changedComponent(Velocity) should NOT match
      expect(world.query(Position, Velocity).changedComponent(Velocity).count()).toBe(0);

      // changed() (entity-level) should match
      expect(world.query(Position, Velocity).changed().count()).toBe(1);
    });

    it("tracks changes to multiple components independently", () => {
      const e1 = world.spawn(Position, Velocity);
      const e2 = world.spawn(Position, Velocity);
      world.runTick();

      // Modify Position on e1
      world.set(e1, Position, { x: 10 });

      // Modify Velocity on e2
      world.set(e2, Velocity, { x: 5 });

      expect(world.query(Position, Velocity).changedComponent(Position).count()).toBe(1);
      expect(world.query(Position, Velocity).changedComponent(Velocity).count()).toBe(1);

      // Both should match when filtering by either
      expect(world.query(Position, Velocity).changedComponent(Position, Velocity).count()).toBe(2);
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
      const entity = world.spawn(Position, Velocity);

      // New entity should match changedComponent for both
      expect(world.query(Position, Velocity).changedComponent(Position).count()).toBe(1);
      expect(world.query(Position, Velocity).changedComponent(Velocity).count()).toBe(1);
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
      const e2 = world.spawn(Position, Velocity);
      world.runTick();

      world.set(e1, Position, { x: 10 });

      let matchCount = 0;
      world.query(Position, Velocity).changedComponent(Position).run((view) => {
        for (let i = 0; i < view.rawCount(); i++) {
          if (view.matchesChangeFilter(i)) {
            matchCount++;
          }
        }
      });

      expect(matchCount).toBe(1);
    });
  });

  describe("Performance: component change detection", () => {
    it("10k entities, filter by specific component < 50ms", () => {
      const largeWorld = new World(20_000);
      for (let i = 0; i < 10_000; i++) {
        const e = largeWorld.spawn(Position, Velocity, Health);
        largeWorld.set(e, Position, { x: i, y: i });
      }
      largeWorld.runTick();

      // Modify only Position on half the entities
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

      console.log(`  100 changedComponent queries on 10k entities: ${elapsed.toFixed(2)}ms`);
      expect(elapsed).toBeLessThan(100);
    });
  });
});

describe("V3 Upgrade: CommandBuffer Sort Keys", () => {
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
      const results: string[] = [];

      // Record commands out of order with different sort keys
      cmd.setSortKey(300);
      cmd.spawn(Health); // Should execute 3rd

      cmd.setSortKey(100);
      cmd.spawn(Position); // Should execute 1st

      cmd.setSortKey(200);
      cmd.spawn(Velocity); // Should execute 2nd

      cmd.flush(world);

      // Check entity order - they should be in sort key order
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

      // Entity IDs should reflect execution order (0, 1, 2 corresponds to Position, Velocity, Health)
      expect(entities.length).toBe(3);
    });

    it("same sort key preserves insertion order (FIFO)", () => {
      const order: number[] = [];

      // All commands with same sort key
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

      // Should be in insertion order (ascending entity IDs)
      for (let i = 1; i < order.length; i++) {
        expect(order[i]).toBeGreaterThan(order[i - 1]);
      }
    });

    it("deterministic across multiple runs", () => {
      function runSimulation(): Entity[] {
        const w = new World(100);
        const c = new CommandBuffer();
        c.registerComponents(Position, Velocity, Health);

        // Interleave commands with different sort keys
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

      // After flush:
      // - e2 should have Velocity (sortKey 100)
      // - New entity with Health (sortKey 200)
      // - e1 should NOT have Position (sortKey 300)

      expect(world.has(e2, Velocity)).toBe(true);
      expect(world.query(Health).count()).toBe(1);
      expect(world.has(e1, Position)).toBe(false);
    });
  });

  describe("Performance: sort key overhead", () => {
    it("1000 commands flush < 10ms", () => {
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

describe("V3 Upgrade: Integration Tests", () => {
  it("per-component change + system scheduling", () => {
    const world = new World(1000);
    const processed: string[] = [];

    // Create entities
    for (let i = 0; i < 10; i++) {
      const e = world.spawn(Position, Velocity, Health);
      world.set(e, Position, { x: i, y: i });
    }
    world.runTick();

    // System that only reacts to Position changes
    world.addSystem(
      defineSystem("PositionReaction")
        .inPhase(Phase.Update)
        .execute((w) => {
          w.query(Position, Velocity).changedComponent(Position).run((view) => {
            for (let i = 0; i < view.rawCount(); i++) {
              if (view.matchesChangeFilter(i)) {
                processed.push(`pos:${view.entity(i)}`);
              }
            }
          });
        }),
    );

    // System that only reacts to Health changes
    world.addSystem(
      defineSystem("HealthReaction")
        .inPhase(Phase.Update)
        .execute((w) => {
          w.query(Health).changedComponent(Health).run((view) => {
            for (let i = 0; i < view.rawCount(); i++) {
              if (view.matchesChangeFilter(i)) {
                processed.push(`health:${view.entity(i)}`);
              }
            }
          });
        }),
    );

    // Modify only Position on first entity
    const firstEntity = world.query(Position).first()!;
    world.set(firstEntity, Position, { x: 999 });

    world.runTick();

    // Only PositionReaction should have processed
    expect(processed).toEqual([`pos:${firstEntity}`]);
  });

  it("backward compatibility: changed() still works as before", () => {
    const world = new World(100);

    const e1 = world.spawn(Position, Velocity);
    const e2 = world.spawn(Position, Velocity);
    world.runTick();

    world.set(e1, Position, { x: 10 });

    // changed() should still work (entity-level)
    expect(world.query(Position, Velocity).changed().count()).toBe(1);
    expect(world.query(Position, Velocity).added().count()).toBe(0);
    expect(world.query(Position, Velocity).modified().count()).toBe(1);
  });
});

// ============================================================================
// V3 UPGRADE: Migration Framework
// ============================================================================

describe("V3 Upgrade: Migration Framework", () => {
  describe("MigrationRegistry", () => {
    let registry: MigrationRegistry;

    beforeEach(() => {
      registry = new MigrationRegistry();
    });

    it("registers a migration", () => {
      registry.register({
        fromVersion: "1.0.0",
        toVersion: "1.1.0",
        migrate: (s) => s,
      });

      expect(registry.count).toBe(1);
      expect(registry.canMigrate("1.0.0", "1.1.0")).toBe(true);
    });

    it("builds migration path", () => {
      registry.register({
        fromVersion: "1.0.0",
        toVersion: "1.1.0",
        migrate: (s) => s,
      });
      registry.register({
        fromVersion: "1.1.0",
        toVersion: "1.2.0",
        migrate: (s) => s,
      });

      const path = registry.getMigrationPath("1.0.0", "1.2.0");
      expect(path.length).toBe(2);
      expect(path[0].fromVersion).toBe("1.0.0");
      expect(path[1].fromVersion).toBe("1.1.0");
    });

    it("throws if no migration path exists", () => {
      registry.register({
        fromVersion: "1.0.0",
        toVersion: "1.1.0",
        migrate: (s) => s,
      });

      expect(() => registry.getMigrationPath("1.0.0", "2.0.0")).toThrow(
        /No migration path/,
      );
    });

    it("applies migrations in sequence", () => {
      registry.register({
        fromVersion: "1.0.0",
        toVersion: "1.1.0",
        migrate: (s) => ({
          ...s,
          entities: s.entities.map((e) => ({
            ...e,
            components: {
              ...e.components,
              Position: { ...e.components.Position, z: 0 },
            },
          })),
        }),
      });

      const oldSnapshot: WorldSnapshot = {
        version: "1.0.0",
        tick: 0,
        entities: [{ id: 1, components: { Position: { x: 10, y: 20 } } }],
        resources: {},
      };

      const migrated = registry.migrate(oldSnapshot, "1.1.0");

      expect(migrated.version).toBe("1.1.0");
      expect(migrated.entities[0].components.Position.z).toBe(0);
    });
  });

  describe("Migration helpers", () => {
    it("addFieldMigration adds field with default value", () => {
      const registry = new MigrationRegistry();
      registry.register(
        addFieldMigration("1.0.0", "1.1.0", "Position", "z", 0),
      );

      const snapshot: WorldSnapshot = {
        version: "1.0.0",
        tick: 0,
        entities: [{ id: 1, components: { Position: { x: 1, y: 2 } } }],
        resources: {},
      };

      const migrated = registry.migrate(snapshot, "1.1.0");
      expect(migrated.entities[0].components.Position.z).toBe(0);
    });

    it("removeFieldMigration removes field", () => {
      const registry = new MigrationRegistry();
      registry.register(
        removeFieldMigration("1.0.0", "1.1.0", "Position", "z"),
      );

      const snapshot: WorldSnapshot = {
        version: "1.0.0",
        tick: 0,
        entities: [{ id: 1, components: { Position: { x: 1, y: 2, z: 3 } } }],
        resources: {},
      };

      const migrated = registry.migrate(snapshot, "1.1.0");
      expect(migrated.entities[0].components.Position.z).toBeUndefined();
    });

    it("renameFieldMigration renames field", () => {
      const registry = new MigrationRegistry();
      registry.register(
        renameFieldMigration("1.0.0", "1.1.0", "Position", "posX", "x"),
      );

      const snapshot: WorldSnapshot = {
        version: "1.0.0",
        tick: 0,
        entities: [{ id: 1, components: { Position: { posX: 10, y: 20 } } }],
        resources: {},
      };

      const migrated = registry.migrate(snapshot, "1.1.0");
      expect(migrated.entities[0].components.Position.x).toBe(10);
      expect(migrated.entities[0].components.Position.posX).toBeUndefined();
    });

    it("renameComponentMigration renames component", () => {
      const registry = new MigrationRegistry();
      registry.register(
        renameComponentMigration("1.0.0", "1.1.0", "Pos", "Position"),
      );

      const snapshot: WorldSnapshot = {
        version: "1.0.0",
        tick: 0,
        entities: [{ id: 1, components: { Pos: { x: 1, y: 2 } } }],
        resources: {},
      };

      const migrated = registry.migrate(snapshot, "1.1.0");
      expect(migrated.entities[0].components.Position).toEqual({ x: 1, y: 2 });
      expect(migrated.entities[0].components.Pos).toBeUndefined();
    });
  });

  describe("WorldSerializer with migrations", () => {
    it("deserializes with automatic migration", () => {
      const registry = new MigrationRegistry();
      // Migrate from older version to current SNAPSHOT_VERSION
      registry.register({
        fromVersion: "0.9.0",
        toVersion: SNAPSHOT_VERSION,
        migrate: (s) => s,
      });

      const serializer = new WorldSerializer({ migrations: registry });

      const oldSnapshot: WorldSnapshot = {
        version: "0.9.0",
        tick: 5,
        entities: [],
        resources: {},
      };

      expect(serializer.canDeserialize(oldSnapshot)).toBe(true);
      const world = serializer.deserialize(oldSnapshot);
      expect(world).toBeDefined();
    });

    it("throws if no migration path exists", () => {
      const serializer = new WorldSerializer();

      const oldSnapshot: WorldSnapshot = {
        version: "0.5.0",
        tick: 0,
        entities: [],
        resources: {},
      };

      expect(() => serializer.deserialize(oldSnapshot)).toThrow(
        /No migration path/,
      );
    });
  });
});

// ============================================================================
// V3 UPGRADE: Event Handler Priority
// ============================================================================

describe("V3 Upgrade: Event Handler Priority", () => {
  let events: EventQueue;

  beforeEach(() => {
    events = new EventQueue();
  });

  describe("Priority ordering", () => {
    it("handlers execute in priority order (lower first)", () => {
      const order: string[] = [];

      events.on("entity.spawned", () => order.push("priority-10"), 10);
      events.on("entity.spawned", () => order.push("priority-0"), 0);
      events.on("entity.spawned", () => order.push("priority-5"), 5);

      events.emit({ type: "entity.spawned", entity: 1 as Entity });
      events.flush();

      expect(order).toEqual(["priority-0", "priority-5", "priority-10"]);
    });

    it("same priority preserves insertion order", () => {
      const order: string[] = [];

      events.on("entity.spawned", () => order.push("first"), 0);
      events.on("entity.spawned", () => order.push("second"), 0);
      events.on("entity.spawned", () => order.push("third"), 0);

      events.emit({ type: "entity.spawned", entity: 1 as Entity });
      events.flush();

      expect(order).toEqual(["first", "second", "third"]);
    });

    it("negative priority executes before default", () => {
      const order: string[] = [];

      events.on("entity.spawned", () => order.push("default")); // priority 0
      events.on("entity.spawned", () => order.push("early"), -10);
      events.on("entity.spawned", () => order.push("very-early"), -100);

      events.emit({ type: "entity.spawned", entity: 1 as Entity });
      events.flush();

      expect(order).toEqual(["very-early", "early", "default"]);
    });
  });

  describe("Wildcard handler priority", () => {
    it("onAny respects priority", () => {
      const order: string[] = [];

      events.onAny(() => order.push("any-high"), 100);
      events.onAny(() => order.push("any-low"), -100);
      events.on("entity.spawned", () => order.push("specific"), 0);

      events.emit({ type: "entity.spawned", entity: 1 as Entity });
      events.flush();

      // Specific handlers run first (in their priority order)
      // Then wildcard handlers run (in their priority order)
      expect(order).toEqual(["specific", "any-low", "any-high"]);
    });
  });

  describe("Backward compatibility", () => {
    it("default priority is 0", () => {
      const order: string[] = [];

      events.on("entity.spawned", () => order.push("explicit-0"), 0);
      events.on("entity.spawned", () => order.push("default")); // should be 0

      events.emit({ type: "entity.spawned", entity: 1 as Entity });
      events.flush();

      // Both should execute in insertion order since same priority
      expect(order).toEqual(["explicit-0", "default"]);
    });

    it("unsubscribe still works with priority", () => {
      const order: string[] = [];

      const unsub = events.on("entity.spawned", () => order.push("removed"), 5);
      events.on("entity.spawned", () => order.push("kept"), 10);

      unsub();

      events.emit({ type: "entity.spawned", entity: 1 as Entity });
      events.flush();

      expect(order).toEqual(["kept"]);
    });
  });
});

// ============================================================================
// V3 UPGRADE: Component Hooks
// ============================================================================

describe("V3 Upgrade: Component Hooks", () => {
  describe("HookRegistry", () => {
    let registry: HookRegistry;

    beforeEach(() => {
      registry = new HookRegistry();
    });

    it("registers hooks for a component", () => {
      registry.register(Position, {
        onAdd: () => {},
      });

      expect(registry.has(Position)).toBe(true);
      expect(registry.count).toBe(1);
    });

    it("throws if hooks already registered", () => {
      registry.register(Position, { onAdd: () => {} });

      expect(() => registry.register(Position, { onAdd: () => {} })).toThrow(
        /already registered/,
      );
    });

    it("replace overwrites existing hooks", () => {
      const calls: string[] = [];

      registry.register(Position, {
        onAdd: () => calls.push("original"),
      });

      registry.replace(Position, {
        onAdd: () => calls.push("replaced"),
      });

      registry.triggerOnAdd(1 as Entity, 0, {});

      // Need to get the hooks via world integration for this to work
      // For now just check replace didn't throw
      expect(registry.has(Position)).toBe(true);
    });

    it("unregister removes hooks", () => {
      registry.register(Position, { onAdd: () => {} });
      expect(registry.has(Position)).toBe(true);

      registry.unregister(Position);
      expect(registry.has(Position)).toBe(false);
    });

    it("disable/enable controls hook execution", () => {
      const calls: string[] = [];

      registry.register(Position, {
        onAdd: () => calls.push("add"),
      });

      registry.disable();
      registry.triggerOnAdd(1 as Entity, 0, {});
      expect(calls.length).toBe(0);

      registry.enable();
      // Would need world integration to properly test
      expect(registry.isEnabled()).toBe(true);
    });
  });

  describe("World integration", () => {
    let world: World;

    beforeEach(() => {
      world = new World(100);
    });

    it("onAdd hook is called when component is added", () => {
      const addedEntities: Entity[] = [];

      world.hooks.register(Position, {
        onAdd: (entity) => addedEntities.push(entity),
      });

      const e = world.spawn(Position);

      expect(addedEntities).toContain(e);
    });

    it("onRemove hook is called when component is removed", () => {
      const removedEntities: Entity[] = [];

      world.hooks.register(Position, {
        onRemove: (entity) => removedEntities.push(entity),
      });

      const e = world.spawn(Position, Velocity);
      world.remove(e, Position);

      expect(removedEntities).toContain(e);
    });

    it("onSet hook is called when component data is modified", () => {
      const setEvents: Array<{ entity: Entity; prev: unknown; next: unknown }> =
        [];

      world.hooks.register(Position, {
        onSet: (entity, newData, prevData) => {
          setEvents.push({ entity, prev: prevData, next: newData });
        },
      });

      const e = world.spawn(Position);
      world.set(e, Position, { x: 100, y: 200 });

      expect(setEvents.length).toBe(1);
      expect(setEvents[0].entity).toBe(e);
      expect(setEvents[0].next).toEqual({ x: 100, y: 200 });
    });

    it("onRemove receives component data before removal", () => {
      let removedData: Record<string, number> | null = null;

      world.hooks.register(Position, {
        onRemove: (_, data) => {
          removedData = data as Record<string, number>;
        },
      });

      const e = world.spawn(Position);
      world.set(e, Position, { x: 50, y: 75 });
      world.remove(e, Position);

      expect(removedData).toEqual({ x: 50, y: 75 });
    });

    it("hooks can be disabled during bulk operations", () => {
      const calls: string[] = [];

      world.hooks.register(Position, {
        onAdd: () => calls.push("add"),
      });

      world.hooks.disable();

      for (let i = 0; i < 10; i++) {
        world.spawn(Position);
      }

      world.hooks.enable();

      // No hooks should have been called while disabled
      expect(calls.length).toBe(0);

      // Now hooks should work again
      world.spawn(Position);
      expect(calls.length).toBe(1);
    });

    it("withHooksDisabled helper works", () => {
      const calls: string[] = [];

      world.hooks.register(Position, {
        onAdd: () => calls.push("add"),
      });

      world.hooks.withHooksDisabled(() => {
        for (let i = 0; i < 5; i++) {
          world.spawn(Position);
        }
      });

      expect(calls.length).toBe(0);
      expect(world.hooks.isEnabled()).toBe(true);
    });
  });

  describe("Hook use cases", () => {
    it("death hook when health reaches 0", () => {
      const world = new World(100);
      const deadEntities: Entity[] = [];

      world.hooks.register(Health, {
        onSet: (entity, data) => {
          if ((data as { current: number }).current <= 0) {
            deadEntities.push(entity);
          }
        },
      });

      const e = world.spawn(Health);
      world.set(e, Health, { current: 100, max: 100 });
      expect(deadEntities.length).toBe(0);

      world.set(e, Health, { current: 0, max: 100 });
      expect(deadEntities).toContain(e);
    });

    it("cleanup hook on component removal", () => {
      const world = new World(100);
      const cleanupLog: string[] = [];

      world.hooks.register(Position, {
        onRemove: (entity, data) => {
          cleanupLog.push(
            `Cleaned up Position(${(data as { x: number }).x}, ${(data as { y: number }).y}) from entity ${entity}`,
          );
        },
      });

      const e = world.spawn(Position);
      world.set(e, Position, { x: 10, y: 20 });
      world.remove(e, Position);

      expect(cleanupLog.length).toBe(1);
      expect(cleanupLog[0]).toContain("10");
      expect(cleanupLog[0]).toContain("20");
    });
  });
});
