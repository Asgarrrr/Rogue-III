import { describe, expect, test } from "bun:test";
import { World } from "@rogue/ecs";
import { component } from "@rogue/ecs";
import { f32 } from "@rogue/ecs";

describe("World Optimizations", () => {
  test("getField and setField should work without creating objects", () => {
    @component
    class Position {
      x = f32(0);
      y = f32(0);
    }

    const world = new World();
    const entity = world.spawn(Position);

    // Set using setField (no object allocation)
    world.setField(entity, Position, "x", 10);
    world.setField(entity, Position, "y", 20);

    // Get using getField (no object allocation)
    const x = world.getField(entity, Position, "x");
    const y = world.getField(entity, Position, "y");

    expect(x).toBe(10);
    expect(y).toBe(20);

    // Verify it matches the full get() method
    const pos = world.get(entity, Position);
    expect(pos?.x).toBe(10);
    expect(pos?.y).toBe(20);
  });

  test("iterDeterministic should return entities in consistent order", () => {
    @component
    class Health {
      value = f32(100);
    }

    const world = new World();

    // Create entities in random order
    const e1 = world.spawn(Health);
    const e2 = world.spawn(Health);
    const e3 = world.spawn(Health);

    // Despawn middle one to create gaps
    world.despawn(e2);

    const e4 = world.spawn(Health);

    // Collect entities using deterministic iterator
    const entities1 = [...world.query(Health).iterDeterministic()];
    const entities2 = [...world.query(Health).iterDeterministic()];

    // Should be in consistent order
    expect(entities1).toEqual(entities2);

    // Should contain all alive entities
    expect(entities1).toContain(e1);
    expect(entities1).toContain(e3);
    expect(entities1).toContain(e4);
    expect(entities1).not.toContain(e2); // despawned
  });

  test("iterRowsDeterministic should return rows in consistent order", () => {
    @component
    class Tag {}

    const world = new World();

    const e1 = world.spawn(Tag);
    const e2 = world.spawn(Tag);
    const e3 = world.spawn(Tag);

    world.despawn(e2);

    const e4 = world.spawn(Tag);

    let entities1: number[] = [];
    let entities2: number[] = [];

    world.query(Tag).run((view) => {
      entities1 = [...view.iterRowsDeterministic()].map((row) => view.entity(row));
      entities2 = [...view.iterRowsDeterministic()].map((row) => view.entity(row));
    });

    // Should be in consistent order
    expect(entities1).toEqual(entities2);
  });
});
