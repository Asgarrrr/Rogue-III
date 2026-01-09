import { describe, it, expect, beforeEach } from "bun:test";
import {
  World,
  component,
  f32,
  i32,
  serializeWorld,
  deserializeWorld,
  WorldSerializer,
  type WorldSnapshot,
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

describe("Phase 4: WorldSerializer", () => {
  let world: World;
  let serializer: WorldSerializer;

  beforeEach(() => {
    world = new World(1024);
    serializer = new WorldSerializer();
  });

  describe("serialize", () => {
    it("returns empty snapshot for empty world", () => {
      const snapshot = serializer.serialize(world);

      expect(snapshot.version).toBe("1.1.0");
      expect(snapshot.tick).toBe(0);
      expect(snapshot.entities).toEqual([]);
      expect(snapshot.resources).toEqual({});
    });

    it("serializes single entity with components", () => {
      const entity = world.spawn(Position, Velocity);
      world.set(entity, Position, { x: 10, y: 20 });
      world.set(entity, Velocity, { x: 1, y: 2 });

      const snapshot = serializer.serialize(world);

      expect(snapshot.entities.length).toBe(1);
      expect(snapshot.entities[0].components.Position).toEqual({
        x: 10,
        y: 20,
      });
      expect(snapshot.entities[0].components.Velocity).toEqual({ x: 1, y: 2 });
    });

    it("serializes multiple entities", () => {
      world.spawn(Position);
      world.spawn(Position, Velocity);
      world.spawn(Velocity);

      const snapshot = serializer.serialize(world);

      expect(snapshot.entities.length).toBe(3);
    });

    it("serializes tag components as empty objects", () => {
      const entity = world.spawn(Position, Dead);
      world.set(entity, Position, { x: 5, y: 5 });

      const snapshot = serializer.serialize(world);

      expect(snapshot.entities[0].components.Dead).toEqual({});
      expect(snapshot.entities[0].components.Position).toEqual({ x: 5, y: 5 });
    });

    it("serializes resources", () => {
      world.resources.set("seed", 12345);
      world.resources.set("config", { difficulty: "hard" });

      const snapshot = serializer.serialize(world);

      expect(snapshot.resources.seed).toBe(12345);
      expect(snapshot.resources.config).toEqual({ difficulty: "hard" });
    });

    it("includes current tick", () => {
      world.runTick();
      world.runTick();
      world.runTick();

      const snapshot = serializer.serialize(world);

      expect(snapshot.tick).toBe(3);
    });
  });

  describe("deserialize", () => {
    it("creates world from empty snapshot", () => {
      const snapshot: WorldSnapshot = {
        version: "1.1.0",
        tick: 0,
        entities: [],
        resources: {},
      };

      const restored = serializer.deserialize(snapshot);

      expect(restored.getEntityCount()).toBe(0);
    });

    it("restores entities with components", () => {
      const snapshot: WorldSnapshot = {
        version: "1.1.0",
        tick: 0,
        entities: [
          {
            id: 1,
            components: {
              Position: { x: 100, y: 200 },
              Velocity: { x: 5, y: 10 },
            },
          },
        ],
        resources: {},
      };

      const restored = serializer.deserialize(snapshot);

      expect(restored.getEntityCount()).toBe(1);

      let foundPosition = false;
      restored.query(Position, Velocity).run((view) => {
        const posX = view.column(Position, "x");
        const posY = view.column(Position, "y");
        const velX = view.column(Velocity, "x");
        const velY = view.column(Velocity, "y");

        expect(posX[0]).toBe(100);
        expect(posY[0]).toBe(200);
        expect(velX[0]).toBe(5);
        expect(velY[0]).toBe(10);
        foundPosition = true;
      });

      expect(foundPosition).toBe(true);
    });

    it("restores tag components", () => {
      const snapshot: WorldSnapshot = {
        version: "1.1.0",
        tick: 0,
        entities: [
          {
            id: 1,
            components: {
              Position: { x: 0, y: 0 },
              Dead: {},
            },
          },
        ],
        resources: {},
      };

      const restored = serializer.deserialize(snapshot);

      expect(restored.query(Position, Dead).count()).toBe(1);
    });

    it("restores resources", () => {
      const snapshot: WorldSnapshot = {
        version: "1.1.0",
        tick: 0,
        entities: [],
        resources: {
          seed: 99999,
          config: { level: 5 },
        },
      };

      const restored = serializer.deserialize(snapshot);

      expect(restored.resources.get("seed")).toBe(99999);
      expect(restored.resources.get("config")).toEqual({ level: 5 });
    });

    it("throws on version mismatch", () => {
      const snapshot: WorldSnapshot = {
        version: "2.0.0",
        tick: 0,
        entities: [],
        resources: {},
      };

      expect(() => serializer.deserialize(snapshot)).toThrow(
        /version mismatch/,
      );
    });

    it("throws on unknown component", () => {
      const snapshot: WorldSnapshot = {
        version: "1.1.0",
        tick: 0,
        entities: [
          {
            id: 1,
            components: {
              UnknownComponent: { foo: 1 },
            },
          },
        ],
        resources: {},
      };

      expect(() => serializer.deserialize(snapshot)).toThrow(
        /Unknown component/,
      );
    });
  });

  describe("roundtrip", () => {
    it("preserves entity data through serialize/deserialize", () => {
      const e1 = world.spawn(Position, Velocity);
      const e2 = world.spawn(Position, Health);
      const e3 = world.spawn(Health, Dead);

      world.set(e1, Position, { x: 10, y: 20 });
      world.set(e1, Velocity, { x: 1, y: 2 });
      world.set(e2, Position, { x: 30, y: 40 });
      world.set(e2, Health, { current: 50, max: 100 });
      world.set(e3, Health, { current: 0, max: 100 });

      const snapshot = serializer.serialize(world);
      const restored = serializer.deserialize(snapshot);

      expect(restored.getEntityCount()).toBe(3);
      expect(restored.query(Position, Velocity).count()).toBe(1);
      expect(restored.query(Position, Health).count()).toBe(1);
      expect(restored.query(Health, Dead).count()).toBe(1);
    });

    it("preserves resources through serialize/deserialize", () => {
      world.resources.set("seed", 12345);
      world.resources.set("playerName", "Hero");
      world.resources.set("settings", { volume: 0.8, fullscreen: true });

      const snapshot = serializer.serialize(world);
      const restored = serializer.deserialize(snapshot);

      expect(restored.resources.get("seed")).toBe(12345);
      expect(restored.resources.get("playerName")).toBe("Hero");
      expect(restored.resources.get("settings")).toEqual({
        volume: 0.8,
        fullscreen: true,
      });
    });

    it("handles multiple archetypes correctly", () => {
      for (let i = 0; i < 10; i++) {
        const e = world.spawn(Position);
        world.set(e, Position, { x: i, y: i * 2 });
      }
      for (let i = 0; i < 10; i++) {
        const e = world.spawn(Velocity);
        world.set(e, Velocity, { x: i * 3, y: i * 4 });
      }
      for (let i = 0; i < 10; i++) {
        const e = world.spawn(Position, Velocity);
        world.set(e, Position, { x: i * 5, y: i * 6 });
        world.set(e, Velocity, { x: i * 7, y: i * 8 });
      }

      const snapshot = serializer.serialize(world);
      const restored = serializer.deserialize(snapshot);

      expect(restored.getEntityCount()).toBe(30);
      expect(restored.query(Position).not(Velocity).count()).toBe(10);
      expect(restored.query(Velocity).not(Position).count()).toBe(10);
      expect(restored.query(Position, Velocity).count()).toBe(10);
    });
  });
});

describe("Phase 4: Convenience Functions", () => {
  it("serializeWorld works", () => {
    const world = new World(100);
    world.spawn(Position);

    const snapshot = serializeWorld(world);

    expect(snapshot.entities.length).toBe(1);
  });

  it("deserializeWorld works", () => {
    const snapshot: WorldSnapshot = {
      version: "1.1.0",
      tick: 0,
      entities: [{ id: 1, components: { Position: { x: 1, y: 2 } } }],
      resources: {},
    };

    const world = deserializeWorld(snapshot);

    expect(world.getEntityCount()).toBe(1);
  });
});

describe("Phase 4: Performance", () => {
  it("serialize 5k entities < 100ms", () => {
    const world = new World(10000);

    for (let i = 0; i < 5000; i++) {
      const e = world.spawn(Position, Velocity, Health);
      world.set(e, Position, { x: i, y: i * 2 });
      world.set(e, Velocity, { x: 1, y: 2 });
      world.set(e, Health, { current: 100, max: 100 });
    }

    const start = performance.now();
    const snapshot = serializeWorld(world);
    const elapsed = performance.now() - start;

    console.log(`  Serialize 5k entities: ${elapsed.toFixed(2)}ms`);
    expect(elapsed).toBeLessThan(100);
    expect(snapshot.entities.length).toBe(5000);
  });

  it("deserialize 5k entities < 150ms", () => {
    const world = new World(10000);

    for (let i = 0; i < 5000; i++) {
      const e = world.spawn(Position, Velocity, Health);
      world.set(e, Position, { x: i, y: i * 2 });
      world.set(e, Velocity, { x: 1, y: 2 });
      world.set(e, Health, { current: 100, max: 100 });
    }

    const snapshot = serializeWorld(world);

    const start = performance.now();
    const restored = deserializeWorld(snapshot, 10000);
    const elapsed = performance.now() - start;

    console.log(`  Deserialize 5k entities: ${elapsed.toFixed(2)}ms`);
    expect(elapsed).toBeLessThan(150);
    expect(restored.getEntityCount()).toBe(5000);
  });

  it("JSON stringify/parse roundtrip < 50ms", () => {
    const world = new World(5000);

    for (let i = 0; i < 2000; i++) {
      const e = world.spawn(Position, Velocity);
      world.set(e, Position, { x: i, y: i });
      world.set(e, Velocity, { x: 1, y: 1 });
    }

    const snapshot = serializeWorld(world);

    const start = performance.now();
    const json = JSON.stringify(snapshot);
    const parsed = JSON.parse(json) as WorldSnapshot;
    const restored = deserializeWorld(parsed, 5000);
    const elapsed = performance.now() - start;

    console.log(`  JSON roundtrip 2k entities: ${elapsed.toFixed(2)}ms`);
    expect(elapsed).toBeLessThan(50);
    expect(restored.getEntityCount()).toBe(2000);
  });
});
