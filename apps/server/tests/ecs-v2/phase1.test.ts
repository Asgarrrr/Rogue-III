import { describe, it, expect, beforeEach } from "bun:test";
import {
  World,
  ResourceRegistry,
  EventQueue,
  QueryCache,
  component,
  f32,
  i32,
  type Entity,
  type GameEvent,
} from "../../src/game/ecs-v2";
import { ArchetypeGraph } from "../../src/game/ecs-v2/archetype";
import { getComponentMeta } from "../../src/game/ecs-v2/component";

function getMask(componentClass: new () => unknown): bigint {
  return 1n << BigInt(getComponentMeta(componentClass as never).id.index);
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

describe("Phase 1: ResourceRegistry", () => {
  let resources: ResourceRegistry;

  beforeEach(() => {
    resources = new ResourceRegistry();
  });

  describe("String-keyed API", () => {
    it("set and get primitive value", () => {
      resources.set("seed", 12345);
      expect(resources.get<number>("seed")).toBe(12345);
    });

    it("set and get object value", () => {
      const config = { width: 80, height: 50 };
      resources.set("mapConfig", config);
      expect(resources.get<typeof config>("mapConfig")).toBe(config);
    });

    it("get returns undefined for missing key", () => {
      expect(resources.get("nonexistent")).toBeUndefined();
    });

    it("has returns correct value", () => {
      expect(resources.has("test")).toBe(false);
      resources.set("test", "value");
      expect(resources.has("test")).toBe(true);
    });

    it("require throws for missing key", () => {
      expect(() => resources.require("missing")).toThrow(/Resource not found/);
    });

    it("require returns value for existing key", () => {
      resources.set("gameState", { turn: 1 });
      const state = resources.require<{ turn: number }>("gameState");
      expect(state.turn).toBe(1);
    });

    it("delete removes resource", () => {
      resources.set("temp", 123);
      expect(resources.delete("temp")).toBe(true);
      expect(resources.has("temp")).toBe(false);
    });

    it("getKeys returns all string keys", () => {
      resources.set("a", 1);
      resources.set("b", 2);
      resources.set("c", 3);
      expect(resources.getKeys().sort()).toEqual(["a", "b", "c"]);
    });
  });

  describe("Type-keyed API", () => {
    class GameTime {
      delta = 0;
      total = 0;
    }

    class RNG {
      seed = 0;
    }

    it("setByType and getByType work", () => {
      const time = new GameTime();
      time.delta = 16;
      resources.setByType(GameTime, time);

      const retrieved = resources.getByType(GameTime);
      expect(retrieved).toBe(time);
      expect(retrieved?.delta).toBe(16);
    });

    it("getByType returns null for missing type", () => {
      expect(resources.getByType(GameTime)).toBeNull();
    });

    it("requireByType throws for missing type", () => {
      expect(() => resources.requireByType(RNG)).toThrow(/Resource not found/);
    });

    it("hasByType returns correct value", () => {
      expect(resources.hasByType(GameTime)).toBe(false);
      resources.setByType(GameTime, new GameTime());
      expect(resources.hasByType(GameTime)).toBe(true);
    });

    it("deleteByType removes resource", () => {
      resources.setByType(GameTime, new GameTime());
      expect(resources.deleteByType(GameTime)).toBe(true);
      expect(resources.hasByType(GameTime)).toBe(false);
    });

    it("getTypeNames returns class names", () => {
      resources.setByType(GameTime, new GameTime());
      resources.setByType(RNG, new RNG());
      expect(resources.getTypeNames().sort()).toEqual(["GameTime", "RNG"]);
    });
  });

  describe("Utility methods", () => {
    it("size counts both string and typed resources", () => {
      expect(resources.size).toBe(0);
      resources.set("a", 1);
      expect(resources.size).toBe(1);

      class Test {}
      resources.setByType(Test, new Test());
      expect(resources.size).toBe(2);
    });

    it("isEmpty returns correct value", () => {
      expect(resources.isEmpty()).toBe(true);
      resources.set("x", 1);
      expect(resources.isEmpty()).toBe(false);
    });

    it("clear removes all resources", () => {
      resources.set("a", 1);
      resources.set("b", 2);

      class Test {}
      resources.setByType(Test, new Test());

      resources.clear();
      expect(resources.size).toBe(0);
      expect(resources.isEmpty()).toBe(true);
    });

    it("toJSON serializes primitives and plain objects", () => {
      resources.set("number", 42);
      resources.set("string", "hello");
      resources.set("object", { x: 1, y: 2 });
      resources.set("array", [1, 2, 3]);

      const json = resources.toJSON();
      expect(json).toEqual({
        number: 42,
        string: "hello",
        object: { x: 1, y: 2 },
        array: [1, 2, 3],
      });
    });

    it("fromJSON restores resources", () => {
      resources.fromJSON({
        seed: 12345,
        config: { width: 80 },
      });

      expect(resources.get<number>("seed")).toBe(12345);
      expect(resources.get<{ width: number }>("config")?.width).toBe(80);
    });
  });
});

describe("Phase 1: EventQueue", () => {
  let events: EventQueue;

  beforeEach(() => {
    events = new EventQueue();
  });

  describe("Basic emit and subscribe", () => {
    it("emit queues event", () => {
      events.emit({ type: "entity.spawned", entity: 1 as Entity });
      expect(events.getQueuedCount()).toBe(1);
    });

    it("on subscribes to specific event type", () => {
      const received: GameEvent[] = [];
      events.on("entity.spawned", (e) => received.push(e));

      events.emit({ type: "entity.spawned", entity: 1 as Entity });
      events.flush();

      expect(received.length).toBe(1);
      expect(received[0].type).toBe("entity.spawned");
    });

    it("onAny receives all events", () => {
      const received: GameEvent[] = [];
      events.onAny((e) => received.push(e));

      events.emit({ type: "entity.spawned", entity: 1 as Entity });
      events.emit({ type: "entity.despawned", entity: 2 as Entity });
      events.flush();

      expect(received.length).toBe(2);
    });

    it("unsubscribe works", () => {
      const received: GameEvent[] = [];
      const unsubscribe = events.on("entity.spawned", (e) => received.push(e));

      events.emit({ type: "entity.spawned", entity: 1 as Entity });
      events.flush();
      expect(received.length).toBe(1);

      unsubscribe();

      events.emit({ type: "entity.spawned", entity: 2 as Entity });
      events.flush();
      expect(received.length).toBe(1);
    });
  });

  describe("Deterministic ordering", () => {
    it("events processed in type-sorted order", () => {
      const order: string[] = [];

      events.on("movement.moved", () => order.push("movement.moved"));
      events.on("combat.damage", () => order.push("combat.damage"));
      events.on("entity.spawned", () => order.push("entity.spawned"));

      events.emit({
        type: "movement.moved",
        entity: 1 as Entity,
        fromX: 0,
        fromY: 0,
        toX: 1,
        toY: 1,
      });
      events.emit({
        type: "combat.damage",
        attacker: 1 as Entity,
        target: 2 as Entity,
        damage: 10,
      });
      events.emit({ type: "entity.spawned", entity: 3 as Entity });

      events.flush();

      expect(order).toEqual([
        "combat.damage",
        "entity.spawned",
        "movement.moved",
      ]);
    });

    it("events of same type processed in FIFO order", () => {
      const entities: number[] = [];
      events.on("entity.spawned", (e) => {
        if (e.type === "entity.spawned") entities.push(e.entity as number);
      });

      events.emit({ type: "entity.spawned", entity: 1 as Entity });
      events.emit({ type: "entity.spawned", entity: 2 as Entity });
      events.emit({ type: "entity.spawned", entity: 3 as Entity });
      events.flush();

      expect(entities).toEqual([1, 2, 3]);
    });

    it("deterministic across multiple flushes", () => {
      const results1: string[] = [];
      const results2: string[] = [];

      const events1 = new EventQueue();
      const events2 = new EventQueue();

      for (const e of [events1, events2]) {
        e.on("combat.damage", () =>
          (e === events1 ? results1 : results2).push("damage"),
        );
        e.on("entity.spawned", () =>
          (e === events1 ? results1 : results2).push("spawn"),
        );
        e.on("movement.moved", () =>
          (e === events1 ? results1 : results2).push("move"),
        );

        e.emit({ type: "entity.spawned", entity: 1 as Entity });
        e.emit({
          type: "combat.damage",
          attacker: 1 as Entity,
          target: 2 as Entity,
          damage: 5,
        });
        e.emit({
          type: "movement.moved",
          entity: 1 as Entity,
          fromX: 0,
          fromY: 0,
          toX: 1,
          toY: 1,
        });
        e.flush();
      }

      expect(results1).toEqual(results2);
    });
  });

  describe("Queue management", () => {
    it("clear removes all queued events", () => {
      events.emit({ type: "entity.spawned", entity: 1 as Entity });
      events.emit({ type: "entity.spawned", entity: 2 as Entity });
      expect(events.getQueuedCount()).toBe(2);

      events.clear();
      expect(events.getQueuedCount()).toBe(0);
    });

    it("drain returns and clears specific type", () => {
      events.emit({ type: "entity.spawned", entity: 1 as Entity });
      events.emit({ type: "entity.spawned", entity: 2 as Entity });
      events.emit({ type: "entity.despawned", entity: 3 as Entity });

      const spawned = events.drain("entity.spawned");
      expect(spawned.length).toBe(2);
      expect(events.getQueuedCount("entity.spawned")).toBe(0);
      expect(events.getQueuedCount("entity.despawned")).toBe(1);
    });

    it("peek returns events without removing", () => {
      events.emit({ type: "entity.spawned", entity: 1 as Entity });

      const peeked = events.peek("entity.spawned");
      expect(peeked.length).toBe(1);
      expect(events.getQueuedCount("entity.spawned")).toBe(1);
    });

    it("hasQueued returns correct value", () => {
      expect(events.hasQueued("entity.spawned")).toBe(false);
      events.emit({ type: "entity.spawned", entity: 1 as Entity });
      expect(events.hasQueued("entity.spawned")).toBe(true);
    });
  });

  describe("Error handling", () => {
    it("throws if flush called during flush", () => {
      events.on("entity.spawned", () => {
        expect(() => events.flush()).toThrow(/already processing/);
      });

      events.emit({ type: "entity.spawned", entity: 1 as Entity });
      events.flush();
    });
  });
});

describe("Phase 1: QueryCache", () => {
  let graph: ArchetypeGraph;
  let cache: QueryCache;

  beforeEach(() => {
    graph = new ArchetypeGraph();
    cache = new QueryCache(graph);
  });

  describe("Caching behavior", () => {
    it("caches query results", () => {
      graph.getOrCreateArchetype([Position]);
      graph.getOrCreateArchetype([Position, Velocity]);
      graph.getOrCreateArchetype([Velocity]);

      const posMask = getMask(Position);
      const descriptor = { withMask: posMask, withoutMask: 0n };

      const result1 = cache.resolve(descriptor);
      const result2 = cache.resolve(descriptor);

      expect(result1).toBe(result2);
    });

    it("invalidates when new archetype created", () => {
      graph.getOrCreateArchetype([Position]);

      const posMask = getMask(Position);
      const descriptor = { withMask: posMask, withoutMask: 0n };
      const result1 = cache.resolve(descriptor);
      expect(result1.length).toBe(1);

      graph.getOrCreateArchetype([Position, Velocity]);
      const result2 = cache.resolve(descriptor);

      expect(result2.length).toBe(2);
      expect(result1).not.toBe(result2);
    });

    it("different queries have separate cache entries", () => {
      graph.getOrCreateArchetype([Position]);
      graph.getOrCreateArchetype([Velocity]);
      graph.getOrCreateArchetype([Position, Velocity]);

      const posMask = getMask(Position);
      const velMask = getMask(Velocity);
      const posQuery = { withMask: posMask, withoutMask: 0n };
      const velQuery = { withMask: velMask, withoutMask: 0n };

      const posResult = cache.resolve(posQuery);
      const velResult = cache.resolve(velQuery);

      expect(posResult.length).toBe(2);
      expect(velResult.length).toBe(2);
      expect(cache.getCacheSize()).toBe(2);
    });

    it("invalidateAll clears cache", () => {
      graph.getOrCreateArchetype([Position]);
      const posMask = getMask(Position);
      cache.resolve({ withMask: posMask, withoutMask: 0n });

      expect(cache.getCacheSize()).toBe(1);
      cache.invalidateAll();
      expect(cache.getCacheSize()).toBe(0);
    });
  });

  describe("Query filtering", () => {
    it("withoutMask excludes archetypes", () => {
      graph.getOrCreateArchetype([Position]);
      graph.getOrCreateArchetype([Position, Velocity]);

      const posMask = getMask(Position);
      const velMask = getMask(Velocity);
      const descriptor = { withMask: posMask, withoutMask: velMask };
      const result = cache.resolve(descriptor);

      expect(result.length).toBe(1);
    });
  });
});

describe("Phase 1: World Integration", () => {
  let world: World;

  beforeEach(() => {
    world = new World(1024);
  });

  describe("Resources via World", () => {
    it("world.resources is accessible", () => {
      world.resources.set("seed", 12345);
      expect(world.resources.get<number>("seed")).toBe(12345);
    });

    it("backward compatible setResource/getResource", () => {
      class GameTime {
        delta = 16;
      }
      const time = new GameTime();

      world.setResource(GameTime, time);
      expect(world.getResource(GameTime)).toBe(time);
      expect(world.hasResource(GameTime)).toBe(true);
    });
  });

  describe("Events via World", () => {
    it("world.events is accessible", () => {
      const received: GameEvent[] = [];
      world.events.on("entity.spawned", (e) => received.push(e));

      world.events.emit({ type: "entity.spawned", entity: 1 as Entity });
      world.events.flush();

      expect(received.length).toBe(1);
    });

    it("world.emit is shorthand", () => {
      const received: GameEvent[] = [];
      world.events.on("entity.spawned", (e) => received.push(e));

      world.emit({ type: "entity.spawned", entity: 1 as Entity });
      world.runTick();

      expect(received.length).toBe(1);
    });

    it("events flush on runTick", () => {
      const received: GameEvent[] = [];
      world.events.on("entity.spawned", (e) => received.push(e));

      world.emit({ type: "entity.spawned", entity: 1 as Entity });
      expect(received.length).toBe(0);

      world.runTick();
      expect(received.length).toBe(1);
    });
  });

  describe("QueryCache via World", () => {
    it("queries use cache", () => {
      for (let i = 0; i < 100; i++) {
        world.spawn(Position, Velocity);
      }

      const start = performance.now();
      for (let i = 0; i < 1000; i++) {
        world.query(Position, Velocity).count();
      }
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(50);
    });
  });
});

describe("Phase 1: Performance", () => {
  it("QueryCache: 1000 cached queries < 10ms", () => {
    const world = new World(10000);

    for (let i = 0; i < 1000; i++) {
      world.spawn(Position, Velocity);
    }
    for (let i = 0; i < 500; i++) {
      world.spawn(Position);
    }
    for (let i = 0; i < 500; i++) {
      world.spawn(Velocity);
    }

    world.query(Position, Velocity).count();

    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      world.query(Position, Velocity).count();
    }
    const elapsed = performance.now() - start;

    console.log(`  1000 cached queries: ${elapsed.toFixed(2)}ms`);
    expect(elapsed).toBeLessThan(10);
  });

  it("EventQueue: 10000 events emit + flush < 50ms", () => {
    const events = new EventQueue();
    let count = 0;

    events.on("entity.spawned", () => count++);

    const start = performance.now();
    for (let i = 0; i < 10000; i++) {
      events.emit({ type: "entity.spawned", entity: i as Entity });
    }
    events.flush();
    const elapsed = performance.now() - start;

    console.log(`  10000 events emit+flush: ${elapsed.toFixed(2)}ms`);
    expect(elapsed).toBeLessThan(50);
    expect(count).toBe(10000);
  });

  it("ResourceRegistry: 10000 get operations < 5ms", () => {
    const resources = new ResourceRegistry();
    resources.set("test", { value: 42 });

    const start = performance.now();
    for (let i = 0; i < 10000; i++) {
      resources.get<{ value: number }>("test");
    }
    const elapsed = performance.now() - start;

    console.log(`  10000 resource gets: ${elapsed.toFixed(2)}ms`);
    expect(elapsed).toBeLessThan(5);
  });
});
