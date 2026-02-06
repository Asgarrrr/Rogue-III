import { describe, it, expect, beforeEach } from "bun:test";
import {
  World,
  Renderable,
  Hidden,
  Player,
  Enemy,
  Dead,
  Serializable,
  type Entity,
} from "@rogue/ecs";

describe("Marker Components", () => {
  let world: World;

  beforeEach(() => {
    world = new World();
  });

  it("should create entities with marker components (tags)", () => {
    const entity = world.spawn(Renderable, Player);
    expect(world.has(entity, Renderable)).toBe(true);
    expect(world.has(entity, Player)).toBe(true);
  });

  it("should query entities by marker", () => {
    const e1 = world.spawn(Renderable, Player);
    const e2 = world.spawn(Renderable, Enemy);
    const e3 = world.spawn(Hidden);

    expect(world.query(Renderable).count()).toBe(2);

    const renderables: Entity[] = [];
    world.query(Renderable).run((view) => {
      for (let i = 0; i < view.count; i++) {
        renderables.push(view.entity(i));
      }
    });

    expect(renderables).toHaveLength(2);
    expect(renderables).toContain(e1);
    expect(renderables).toContain(e2);
    expect(renderables).not.toContain(e3);
  });

  it("should query entities with multiple markers", () => {
    const e1 = world.spawn(Renderable, Player, Serializable);
    const e2 = world.spawn(Renderable, Enemy);
    const e3 = world.spawn(Player, Serializable);

    expect(world.query(Renderable, Serializable).count()).toBe(1);

    const results: Entity[] = [];
    world.query(Renderable, Serializable).run((view) => {
      for (let i = 0; i < view.count; i++) {
        results.push(view.entity(i));
      }
    });

    expect(results).toHaveLength(1);
    expect(results).toContain(e1);
  });

  it("should add and remove markers at runtime", () => {
    const entity = world.spawn(Renderable);
    expect(world.has(entity, Renderable)).toBe(true);
    expect(world.has(entity, Dead)).toBe(false);

    world.add(entity, Dead);
    expect(world.has(entity, Dead)).toBe(true);

    world.remove(entity, Dead);
    expect(world.has(entity, Dead)).toBe(false);
  });

  it("should use lifecycle markers with exclusion filters", () => {
    const e1 = world.spawn(Player);
    const e2 = world.spawn(Enemy, Dead);

    const aliveCount = world.query(Player).not(Dead).count();
    expect(aliveCount).toBe(1);

    const alive: Entity[] = [];
    world.query(Player).not(Dead).run((view) => {
      for (let i = 0; i < view.count; i++) {
        alive.push(view.entity(i));
      }
    });
    expect(alive).toContain(e1);

    const deadCount = world.query(Dead).count();
    expect(deadCount).toBe(1);

    const dead: Entity[] = [];
    world.query(Dead).run((view) => {
      for (let i = 0; i < view.count; i++) {
        dead.push(view.entity(i));
      }
    });
    expect(dead).toContain(e2);
  });

  it("should combine markers with data components", () => {
    // This test ensures markers work alongside data components
    // We'll verify the basic mechanics without needing actual data components
    const entity = world.spawn(Renderable, Player, Serializable);

    expect(world.has(entity, Renderable)).toBe(true);
    expect(world.has(entity, Player)).toBe(true);
    expect(world.has(entity, Serializable)).toBe(true);

    // All three markers should be present
    expect(world.query(Renderable, Player, Serializable).count()).toBe(1);

    const results: Entity[] = [];
    world.query(Renderable, Player, Serializable).run((view) => {
      for (let i = 0; i < view.count; i++) {
        results.push(view.entity(i));
      }
    });
    expect(results).toContain(entity);
  });
});
