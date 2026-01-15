import { describe, expect, it } from "bun:test";
import { component, f32, World } from "@rogue/ecs";

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
  current = f32(100);
  max = f32(100);
}

@component
class Tag {}

describe("Batch API", () => {
  it("should batch multiple add operations into single archetype transition", () => {
    const world = new World();

    // Create entity with no components
    const entity = world.spawn();
    expect(world.has(entity, Position)).toBe(false);
    expect(world.has(entity, Velocity)).toBe(false);
    expect(world.has(entity, Health)).toBe(false);

    // Batch add three components
    world
      .batch(entity)
      .add(Position, { x: 10, y: 20 })
      .add(Velocity, { vx: 1, vy: 2 })
      .add(Health, { current: 50, max: 100 })
      .commit();

    // All components should be added
    expect(world.has(entity, Position)).toBe(true);
    expect(world.has(entity, Velocity)).toBe(true);
    expect(world.has(entity, Health)).toBe(true);

    // Data should be correct
    const pos = world.get(entity, Position);
    expect(pos?.x).toBe(10);
    expect(pos?.y).toBe(20);

    const vel = world.get(entity, Velocity);
    expect(vel?.vx).toBe(1);
    expect(vel?.vy).toBe(2);

    const health = world.get(entity, Health);
    expect(health?.current).toBe(50);
    expect(health?.max).toBe(100);
  });

  it("should batch multiple remove operations", () => {
    const world = new World();

    // Create entity with all components
    const entity = world.spawn(Position, Velocity, Health);
    world.set(entity, Position, { x: 10, y: 20 });
    world.set(entity, Velocity, { vx: 1, vy: 2 });

    expect(world.has(entity, Position)).toBe(true);
    expect(world.has(entity, Velocity)).toBe(true);
    expect(world.has(entity, Health)).toBe(true);

    // Batch remove two components
    world.batch(entity).remove(Position).remove(Velocity).commit();

    expect(world.has(entity, Position)).toBe(false);
    expect(world.has(entity, Velocity)).toBe(false);
    expect(world.has(entity, Health)).toBe(true);
  });

  it("should batch mixed add and remove operations", () => {
    const world = new World();

    // Create entity with Position and Velocity
    const entity = world.spawn(Position, Velocity);
    world.set(entity, Position, { x: 10, y: 20 });
    world.set(entity, Velocity, { vx: 1, vy: 2 });

    // Batch: remove Position, add Health
    world
      .batch(entity)
      .remove(Position)
      .add(Health, { current: 75, max: 100 })
      .commit();

    expect(world.has(entity, Position)).toBe(false);
    expect(world.has(entity, Velocity)).toBe(true);
    expect(world.has(entity, Health)).toBe(true);

    // Velocity should be preserved
    const vel = world.get(entity, Velocity);
    expect(vel?.vx).toBe(1);
    expect(vel?.vy).toBe(2);

    // Health should be added correctly
    const health = world.get(entity, Health);
    expect(health?.current).toBe(75);
    expect(health?.max).toBe(100);
  });

  it("should handle empty batch (no operations)", () => {
    const world = new World();
    const entity = world.spawn(Position);
    world.set(entity, Position, { x: 10, y: 20 });

    // Empty batch should be a no-op
    world.batch(entity).commit();

    expect(world.has(entity, Position)).toBe(true);
    const pos = world.get(entity, Position);
    expect(pos?.x).toBe(10);
    expect(pos?.y).toBe(20);
  });

  it("should handle dead entity gracefully", () => {
    const world = new World();
    const entity = world.spawn(Position);
    world.despawn(entity);

    // Batch on dead entity should be no-op
    const result = world
      .batch(entity)
      .add(Velocity, { vx: 1, vy: 1 })
      .commit();

    expect(result).toBe(entity);
    expect(world.isAlive(entity)).toBe(false);
  });

  it("should despawn entity if all components are removed", () => {
    const world = new World();
    const entity = world.spawn(Position, Velocity);

    // Remove all components
    world.batch(entity).remove(Position).remove(Velocity).commit();

    expect(world.isAlive(entity)).toBe(false);
  });

  it("should preserve existing component data when adding new components", () => {
    const world = new World();
    const entity = world.spawn(Position);
    world.set(entity, Position, { x: 100, y: 200 });

    // Add new components
    world
      .batch(entity)
      .add(Velocity, { vx: 5, vy: 10 })
      .add(Health, { current: 50, max: 100 })
      .commit();

    // Position should be preserved
    const pos = world.get(entity, Position);
    expect(pos?.x).toBe(100);
    expect(pos?.y).toBe(200);

    // New components should be added
    const vel = world.get(entity, Velocity);
    expect(vel?.vx).toBe(5);
    expect(vel?.vy).toBe(10);

    const health = world.get(entity, Health);
    expect(health?.current).toBe(50);
  });

  it("should handle partial component data", () => {
    const world = new World();
    const entity = world.spawn();

    // Add component with partial data
    world.batch(entity).add(Position, { x: 42 }).commit();

    const pos = world.get(entity, Position);
    expect(pos?.x).toBe(42);
    expect(pos?.y).toBe(0); // Should use default value
  });

  it("should update data if component already exists in same batch", () => {
    const world = new World();
    const entity = world.spawn(Position);
    world.set(entity, Position, { x: 10, y: 20 });

    // Add Position again (should update data)
    world.batch(entity).add(Position, { x: 100, y: 200 }).commit();

    const pos = world.get(entity, Position);
    expect(pos?.x).toBe(100);
    expect(pos?.y).toBe(200);
  });

  it("should handle tag components in batch", () => {
    const world = new World();
    const entity = world.spawn();

    world.batch(entity).add(Position, { x: 1, y: 2 }).add(Tag).commit();

    expect(world.has(entity, Position)).toBe(true);
    expect(world.has(entity, Tag)).toBe(true);

    const pos = world.get(entity, Position);
    expect(pos?.x).toBe(1);
  });

  it("should optimize same archetype case", () => {
    const world = new World();
    const entity = world.spawn(Position, Velocity);

    const record = (world as any).entityRecords[(entity as any) & 0xfffff];
    const oldArchetype = record.archetype;

    // Add component that entity already has (no archetype change)
    world.batch(entity).add(Position, { x: 999, y: 888 }).commit();

    const newRecord = (world as any).entityRecords[(entity as any) & 0xfffff];
    expect(newRecord.archetype).toBe(oldArchetype); // Same archetype

    const pos = world.get(entity, Position);
    expect(pos?.x).toBe(999);
    expect(pos?.y).toBe(888);
  });

  it("should efficiently chain operations", () => {
    const world = new World();
    const entity = world.spawn();

    // Long chain
    const result = world
      .batch(entity)
      .add(Position, { x: 1, y: 2 })
      .add(Velocity, { vx: 3, vy: 4 })
      .add(Health, { current: 50, max: 100 })
      .remove(Position)
      .add(Tag)
      .commit();

    expect(result).toBe(entity);
    expect(world.has(entity, Position)).toBe(false);
    expect(world.has(entity, Velocity)).toBe(true);
    expect(world.has(entity, Health)).toBe(true);
    expect(world.has(entity, Tag)).toBe(true);
  });

  it("should handle component defaults correctly", () => {
    const world = new World();
    const entity = world.spawn();

    // Add without providing data
    world.batch(entity).add(Position).add(Velocity).commit();

    const pos = world.get(entity, Position);
    expect(pos?.x).toBe(0); // Default value
    expect(pos?.y).toBe(0);

    const vel = world.get(entity, Velocity);
    expect(vel?.vx).toBe(0);
    expect(vel?.vy).toBe(0);
  });

  it("should be more efficient than individual operations", () => {
    const world = new World();

    // Individual operations - 3 archetype transitions
    const entity1 = world.spawn();
    world.add(entity1, Position, { x: 1, y: 2 });
    world.add(entity1, Velocity, { vx: 3, vy: 4 });
    world.add(entity1, Health, { current: 50, max: 100 });

    // Batched operations - 1 archetype transition
    const entity2 = world.spawn();
    world
      .batch(entity2)
      .add(Position, { x: 1, y: 2 })
      .add(Velocity, { vx: 3, vy: 4 })
      .add(Health, { current: 50, max: 100 })
      .commit();

    // Both should have the same final state
    expect(world.has(entity1, Position)).toBe(true);
    expect(world.has(entity1, Velocity)).toBe(true);
    expect(world.has(entity1, Health)).toBe(true);

    expect(world.has(entity2, Position)).toBe(true);
    expect(world.has(entity2, Velocity)).toBe(true);
    expect(world.has(entity2, Health)).toBe(true);

    // Data should be identical
    const pos1 = world.get(entity1, Position);
    const pos2 = world.get(entity2, Position);
    expect(pos1).toEqual(pos2);

    const vel1 = world.get(entity1, Velocity);
    const vel2 = world.get(entity2, Velocity);
    expect(vel1).toEqual(vel2);

    const health1 = world.get(entity1, Health);
    const health2 = world.get(entity2, Health);
    expect(health1).toEqual(health2);
  });
});
