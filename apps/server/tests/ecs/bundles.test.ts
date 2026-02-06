import { describe, it, expect, beforeEach } from "bun:test";
import {
  World,
  component,
  f32,
  i32,
  bundle,
  spawnBundle,
  type Entity,
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
class Health {
  current = i32(100);
  max = i32(100);
}

@component
class Enemy {}

@component
class Player {}

@component
class Boss {}

describe("Bundles", () => {
  let world: World;

  beforeEach(() => {
    world = new World(1000);
  });

  describe("bundle()", () => {
    it("creates a bundle with component types", () => {
      const MovableBundle = bundle(Position, Velocity);

      expect(MovableBundle.types).toEqual([Position, Velocity]);
    });

    it("bundle.types can be spread into spawn()", () => {
      const MovableBundle = bundle(Position, Velocity);

      const entity = world.spawn(...MovableBundle.types);

      expect(world.has(entity, Position)).toBe(true);
      expect(world.has(entity, Velocity)).toBe(true);
    });
  });

  describe("defaults()", () => {
    it("stores default values", () => {
      const EnemyBundle = bundle(Position, Health, Enemy).defaults({
        Position: { x: 10, y: 20 },
        Health: { current: 50, max: 50 },
      });

      expect(EnemyBundle.defaultValues.get(Position)).toEqual({ x: 10, y: 20 });
      expect(EnemyBundle.defaultValues.get(Health)).toEqual({
        current: 50,
        max: 50,
      });
    });

    it("returns new bundle (immutable)", () => {
      const original = bundle(Position, Health);
      const withDefaults = original.defaults({
        Position: { x: 5, y: 5 },
      });

      expect(original.defaultValues.size).toBe(0);
      expect(withDefaults.defaultValues.size).toBe(1);
    });
  });

  describe("applyDefaults()", () => {
    it("applies default values to entity", () => {
      const EnemyBundle = bundle(Position, Health).defaults({
        Position: { x: 100, y: 200 },
        Health: { current: 75, max: 75 },
      });

      const entity = world.spawn(...EnemyBundle.types);
      EnemyBundle.applyDefaults(world, entity);

      const pos = world.get(entity, Position);
      const health = world.get(entity, Health);

      expect(pos).toEqual({ x: 100, y: 200 });
      expect(health).toEqual({ current: 75, max: 75 });
    });
  });

  describe("with()", () => {
    it("combines bundle with component types", () => {
      const MovableBundle = bundle(Position, Velocity);
      const EnemyBundle = MovableBundle.with(Health, Enemy);

      expect(EnemyBundle.types).toContain(Position);
      expect(EnemyBundle.types).toContain(Velocity);
      expect(EnemyBundle.types).toContain(Health);
      expect(EnemyBundle.types).toContain(Enemy);
    });

    it("combines two bundles", () => {
      const MovableBundle = bundle(Position, Velocity);
      const CombatBundle = bundle(Health);

      const CombinedBundle = MovableBundle.with(CombatBundle);

      expect(CombinedBundle.types).toContain(Position);
      expect(CombinedBundle.types).toContain(Velocity);
      expect(CombinedBundle.types).toContain(Health);
    });

    it("merges defaults when combining bundles", () => {
      const MovableBundle = bundle(Position, Velocity).defaults({
        Position: { x: 0, y: 0 },
        Velocity: { x: 1, y: 0 },
      });

      const HealthBundle = bundle(Health).defaults({
        Health: { current: 100, max: 100 },
      });

      const CombinedBundle = MovableBundle.with(HealthBundle);

      expect(CombinedBundle.defaultValues.get(Position)).toEqual({ x: 0, y: 0 });
      expect(CombinedBundle.defaultValues.get(Health)).toEqual({
        current: 100,
        max: 100,
      });
    });

    it("does not duplicate component types", () => {
      const Bundle1 = bundle(Position, Velocity);
      const Bundle2 = bundle(Position, Health);

      const Combined = Bundle1.with(Bundle2);

      const positionCount = Combined.types.filter((t) => t === Position).length;
      expect(positionCount).toBe(1);
    });
  });

  describe("spawnBundle()", () => {
    it("spawns entity with bundle types and defaults", () => {
      const EnemyBundle = bundle(Position, Health, Enemy).defaults({
        Position: { x: 50, y: 50 },
        Health: { current: 30, max: 30 },
      });

      const entity = spawnBundle(world, EnemyBundle) as Entity;

      expect(world.has(entity, Position)).toBe(true);
      expect(world.has(entity, Health)).toBe(true);
      expect(world.has(entity, Enemy)).toBe(true);

      expect(world.get(entity, Position)).toEqual({ x: 50, y: 50 });
      expect(world.get(entity, Health)).toEqual({ current: 30, max: 30 });
    });

    it("allows overriding defaults", () => {
      const EnemyBundle = bundle(Position, Health).defaults({
        Position: { x: 0, y: 0 },
        Health: { current: 100, max: 100 },
      });

      const entity = spawnBundle(world, EnemyBundle, {
        Position: { x: 999, y: 888 },
      }) as Entity;

      expect(world.get(entity, Position)).toEqual({ x: 999, y: 888 });
      expect(world.get(entity, Health)).toEqual({ current: 100, max: 100 });
    });
  });

  describe("Complex Bundle Patterns", () => {
    it("builds enemy hierarchy with bundles", () => {
      const MovableBundle = bundle(Position, Velocity).defaults({
        Velocity: { x: 0, y: 0 },
      });

      const CombatBundle = bundle(Health).defaults({
        Health: { current: 100, max: 100 },
      });

      const EnemyBundle = MovableBundle.with(CombatBundle).with(Enemy);

      const BossBundle = EnemyBundle.with(Boss).defaults({
        Health: { current: 500, max: 500 },
      });

      const enemy = spawnBundle(world, EnemyBundle, {
        Position: { x: 10, y: 10 },
      }) as Entity;

      const boss = spawnBundle(world, BossBundle, {
        Position: { x: 50, y: 50 },
      }) as Entity;

      // Enemy has base health
      expect(world.get(enemy, Health)).toEqual({ current: 100, max: 100 });
      expect(world.has(enemy, Enemy)).toBe(true);
      expect(world.has(enemy, Boss)).toBe(false);

      // Boss has upgraded health
      expect(world.get(boss, Health)).toEqual({ current: 500, max: 500 });
      expect(world.has(boss, Enemy)).toBe(true);
      expect(world.has(boss, Boss)).toBe(true);
    });
  });
});
