/**
 * Component Store Tests
 */

import { beforeEach, describe, expect, it } from "bun:test";
import {
  AoSComponentStore,
  ComponentSchema,
  ComponentType,
  createEntity,
  EntityManagerImpl,
  SoAComponentStore,
} from "../../src/game/ecs";

describe("SoAComponentStore", () => {
  const PositionSchema = ComponentSchema.define<{ x: number; y: number }>(
    "Position",
  )
    .field("x", ComponentType.F32, 0)
    .field("y", ComponentType.F32, 0)
    .build();

  let store: SoAComponentStore<{ x: number; y: number }>;
  let entityManager: EntityManagerImpl;

  beforeEach(() => {
    store = new SoAComponentStore(PositionSchema, 100);
    entityManager = new EntityManagerImpl(100);
  });

  describe("add/get", () => {
    it("should add and retrieve a component", () => {
      const entity = entityManager.spawn();

      store.add(entity, { x: 10, y: 20 });
      const component = store.get(entity);

      expect(component).toEqual({ x: 10, y: 20 });
    });

    it("should update existing component", () => {
      const entity = entityManager.spawn();

      store.add(entity, { x: 10, y: 20 });
      store.add(entity, { x: 30, y: 40 });

      const component = store.get(entity);
      expect(component).toEqual({ x: 30, y: 40 });
    });
  });

  describe("has", () => {
    it("should return true when entity has component", () => {
      const entity = entityManager.spawn();
      store.add(entity, { x: 0, y: 0 });

      expect(store.has(entity)).toBe(true);
    });

    it("should return false when entity has no component", () => {
      const entity = entityManager.spawn();

      expect(store.has(entity)).toBe(false);
    });

    it("should return false for stale entity reference", () => {
      const e1 = entityManager.spawn();
      store.add(e1, { x: 0, y: 0 });

      entityManager.despawn(e1);
      const e2 = entityManager.spawn(); // Reuses index
      store.add(e2, { x: 1, y: 1 });

      expect(store.has(e1)).toBe(false);
      expect(store.has(e2)).toBe(true);
    });
  });

  describe("remove", () => {
    it("should remove a component", () => {
      const entity = entityManager.spawn();
      store.add(entity, { x: 10, y: 20 });

      const removed = store.remove(entity);

      expect(removed).toBe(true);
      expect(store.has(entity)).toBe(false);
      expect(store.get(entity)).toBeUndefined();
    });

    it("should return false when removing non-existent component", () => {
      const entity = entityManager.spawn();

      const removed = store.remove(entity);

      expect(removed).toBe(false);
    });

    it("should maintain integrity with swap-remove", () => {
      const e1 = entityManager.spawn();
      const e2 = entityManager.spawn();
      const e3 = entityManager.spawn();

      store.add(e1, { x: 1, y: 1 });
      store.add(e2, { x: 2, y: 2 });
      store.add(e3, { x: 3, y: 3 });

      store.remove(e1);

      expect(store.get(e2)).toEqual({ x: 2, y: 2 });
      expect(store.get(e3)).toEqual({ x: 3, y: 3 });
      expect(store.getCount()).toBe(2);
    });
  });

  describe("getField/setField", () => {
    it("should get individual fields", () => {
      const entity = entityManager.spawn();
      store.add(entity, { x: 10, y: 20 });

      expect(store.getField(entity, "x")).toBe(10);
      expect(store.getField(entity, "y")).toBe(20);
    });

    it("should set individual fields", () => {
      const entity = entityManager.spawn();
      store.add(entity, { x: 10, y: 20 });

      store.setField(entity, "x", 100);

      expect(store.getField(entity, "x")).toBe(100);
      expect(store.getField(entity, "y")).toBe(20);
    });
  });

  describe("forEach", () => {
    it("should iterate over all components", () => {
      const e1 = entityManager.spawn();
      const e2 = entityManager.spawn();

      store.add(e1, { x: 1, y: 1 });
      store.add(e2, { x: 2, y: 2 });

      const results: Array<{ x: number; y: number }> = [];
      store.forEach((entity, component) => {
        results.push(component);
      });

      expect(results.length).toBe(2);
    });
  });

  describe("getCount", () => {
    it("should return correct count", () => {
      expect(store.getCount()).toBe(0);

      const e1 = entityManager.spawn();
      store.add(e1, { x: 0, y: 0 });
      expect(store.getCount()).toBe(1);

      const e2 = entityManager.spawn();
      store.add(e2, { x: 0, y: 0 });
      expect(store.getCount()).toBe(2);

      store.remove(e1);
      expect(store.getCount()).toBe(1);
    });
  });
});

describe("AoSComponentStore", () => {
  interface Stats {
    hp: number;
    maxHp: number;
    effects: string[];
  }

  const StatsSchema = ComponentSchema.define<Stats>("Stats")
    .field("hp", ComponentType.I32, 100)
    .field("maxHp", ComponentType.I32, 100)
    .field("effects", ComponentType.Object, [])
    .useAoS()
    .build();

  let store: AoSComponentStore<Stats>;
  let entityManager: EntityManagerImpl;

  beforeEach(() => {
    store = new AoSComponentStore(StatsSchema, 100);
    entityManager = new EntityManagerImpl(100);
  });

  describe("add/get", () => {
    it("should handle complex objects", () => {
      const entity = entityManager.spawn();

      store.add(entity, { hp: 50, maxHp: 100, effects: ["poison", "slow"] });
      const component = store.get(entity);

      expect(component?.hp).toBe(50);
      expect(component?.effects).toEqual(["poison", "slow"]);
    });

    it("should deep clone data", () => {
      const entity = entityManager.spawn();
      const data = { hp: 100, maxHp: 100, effects: ["buff"] };

      store.add(entity, data);
      data.effects.push("modified");

      const component = store.get(entity);
      expect(component?.effects).toEqual(["buff"]);
    });
  });

  describe("getField/setField", () => {
    it("should get nested fields", () => {
      const entity = entityManager.spawn();
      store.add(entity, { hp: 75, maxHp: 100, effects: [] });

      expect(store.getField(entity, "hp")).toBe(75);
    });

    it("should modify nested fields", () => {
      const entity = entityManager.spawn();
      store.add(entity, { hp: 100, maxHp: 100, effects: [] });

      store.setField(entity, "hp", 50);

      expect(store.getField(entity, "hp")).toBe(50);
    });
  });
});
