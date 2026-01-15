import { describe, it, expect, beforeEach } from "bun:test";
import { World, component, f32, u32, type Entity } from "@rogue/ecs";

@component
class Position {
  x = f32(0);
  y = f32(0);
}

@component
class Health {
  current = u32(100);
  max = u32(100);
}

describe("Reactive Observers", () => {
  let world: World;

  beforeEach(() => {
    world = new World();
  });

  describe("onAdd", () => {
    it("should notify when component is added via spawn", () => {
      const added: { entity: Entity; x: number; y: number }[] = [];

      world.observers.onAdd(Position, (entity, data) => {
        added.push({ entity, x: data.x, y: data.y });
      });

      const e1 = world.spawn(Position);
      world.set(e1, Position, { x: 10, y: 20 });

      // onAdd should have been called during spawn (with defaults)
      expect(added).toHaveLength(1);
      expect(added[0].entity).toBe(e1);
      expect(added[0].x).toBe(0);
      expect(added[0].y).toBe(0);
    });

    it("should notify when component is added via add()", () => {
      const added: Entity[] = [];

      world.observers.onAdd(Health, (entity) => {
        added.push(entity);
      });

      const e1 = world.spawn(Position);
      world.add(e1, Health, { current: 50, max: 100 });

      expect(added).toHaveLength(1);
      expect(added[0]).toBe(e1);
    });
  });

  describe("onRemove", () => {
    it("should notify when component is removed via despawn", () => {
      const removed: { entity: Entity; x: number }[] = [];

      world.observers.onRemove(Position, (entity, data) => {
        removed.push({ entity, x: data.x });
      });

      const e1 = world.spawn(Position);
      world.set(e1, Position, { x: 42 });
      world.despawn(e1);

      expect(removed).toHaveLength(1);
      expect(removed[0].entity).toBe(e1);
      expect(removed[0].x).toBe(42);
    });

    it("should notify when component is removed via remove()", () => {
      const removed: Entity[] = [];

      world.observers.onRemove(Health, (entity) => {
        removed.push(entity);
      });

      const e1 = world.spawn(Position, Health);
      world.remove(e1, Health);

      expect(removed).toHaveLength(1);
      expect(removed[0]).toBe(e1);
    });
  });

  describe("onSet", () => {
    it("should notify when component is modified", () => {
      const changes: { entity: Entity; oldX: number; newX: number }[] = [];

      world.observers.onSet(Position, (entity, newData, oldData) => {
        changes.push({
          entity,
          oldX: oldData?.x ?? 0,
          newX: newData.x,
        });
      });

      const e1 = world.spawn(Position);
      world.set(e1, Position, { x: 100 });
      world.set(e1, Position, { x: 200 });

      expect(changes).toHaveLength(2);
      expect(changes[0].oldX).toBe(0);
      expect(changes[0].newX).toBe(100);
      expect(changes[1].oldX).toBe(100);
      expect(changes[1].newX).toBe(200);
    });
  });

  describe("onChange", () => {
    it("should notify on all events (add, set, remove)", () => {
      let addCount = 0;
      let setCount = 0;
      let removeCount = 0;

      world.observers.onAdd(Position, () => addCount++);
      world.observers.onSet(Position, () => setCount++);
      world.observers.onRemove(Position, () => removeCount++);

      const e1 = world.spawn(Position); // add
      world.set(e1, Position, { x: 10 }); // set
      world.set(e1, Position, { x: 20 }); // set
      world.despawn(e1); // remove

      expect(addCount).toBe(1);
      expect(setCount).toBe(2);
      expect(removeCount).toBe(1);
    });

    it("onChange should receive all event types", () => {
      let allEventsCount = 0;

      world.observers.onChange(Position, () => allEventsCount++);

      const e1 = world.spawn(Position); // triggers onChange (add)
      world.set(e1, Position, { x: 10 }); // triggers onChange (set)
      world.despawn(e1); // triggers onChange (remove)

      expect(allEventsCount).toBe(3);
    });
  });

  describe("unsubscribe", () => {
    it("should stop receiving notifications after unsubscribe", () => {
      const notifications: Entity[] = [];

      const sub = world.observers.onAdd(Position, (entity) => {
        notifications.push(entity);
      });

      const e1 = world.spawn(Position);
      sub.unsubscribe();
      const e2 = world.spawn(Position);

      expect(notifications).toHaveLength(1);
      expect(notifications[0]).toBe(e1);
    });
  });

  describe("multiple observers", () => {
    it("should support multiple observers for same component", () => {
      const observer1: Entity[] = [];
      const observer2: Entity[] = [];

      world.observers.onAdd(Position, (entity) => observer1.push(entity));
      world.observers.onAdd(Position, (entity) => observer2.push(entity));

      const e1 = world.spawn(Position);

      expect(observer1).toHaveLength(1);
      expect(observer2).toHaveLength(1);
    });
  });
});
