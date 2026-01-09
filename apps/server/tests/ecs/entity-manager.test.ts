/**
 * Entity Manager Tests
 */

import { describe, expect, it, beforeEach } from "bun:test";
import {
  EntityManagerImpl,
  getIndex,
  getGeneration,
  isValidEntity,
  NULL_ENTITY,
} from "../../src/game/ecs";

describe("EntityManager", () => {
  let manager: EntityManagerImpl;

  beforeEach(() => {
    manager = new EntityManagerImpl();
  });

  describe("spawn", () => {
    it("should create a new entity", () => {
      const entity = manager.spawn();

      expect(isValidEntity(entity)).toBe(true);
      expect(manager.isAlive(entity)).toBe(true);
      expect(manager.getAliveCount()).toBe(1);
    });

    it("should create entities with sequential indices", () => {
      const e1 = manager.spawn();
      const e2 = manager.spawn();
      const e3 = manager.spawn();

      expect(getIndex(e1)).toBe(0);
      expect(getIndex(e2)).toBe(1);
      expect(getIndex(e3)).toBe(2);
    });

    it("should start with generation 0", () => {
      const entity = manager.spawn();

      expect(getGeneration(entity)).toBe(0);
    });
  });

  describe("despawn", () => {
    it("should mark entity as dead", () => {
      const entity = manager.spawn();

      manager.despawn(entity);

      expect(manager.isAlive(entity)).toBe(false);
      expect(manager.getAliveCount()).toBe(0);
    });

    it("should increment generation on despawn", () => {
      const entity = manager.spawn();
      const oldGen = getGeneration(entity);

      manager.despawn(entity);

      const newGen = manager.getGenerationAt(getIndex(entity));
      expect(newGen).toBe(oldGen + 1);
    });

    it("should throw when despawning dead entity in dev mode", () => {
      const entity = manager.spawn();
      manager.despawn(entity);

      expect(() => manager.despawn(entity)).toThrow();
    });
  });

  describe("recycling", () => {
    it("should reuse indices from despawned entities", () => {
      const e1 = manager.spawn();
      const idx1 = getIndex(e1);

      manager.despawn(e1);

      const e2 = manager.spawn();
      expect(getIndex(e2)).toBe(idx1);
    });

    it("should have incremented generation on recycled entities", () => {
      const e1 = manager.spawn();
      manager.despawn(e1);

      const e2 = manager.spawn();
      expect(getGeneration(e2)).toBe(1);
    });

    it("should detect stale references", () => {
      const e1 = manager.spawn();
      manager.despawn(e1);
      manager.spawn(); // Reuses index

      expect(manager.isAlive(e1)).toBe(false);
    });
  });

  describe("spawnBatch", () => {
    it("should spawn multiple entities", () => {
      const entities = manager.spawnBatch(5);

      expect(entities.length).toBe(5);
      expect(manager.getAliveCount()).toBe(5);

      for (const entity of entities) {
        expect(manager.isAlive(entity)).toBe(true);
      }
    });
  });

  describe("getAllAlive", () => {
    it("should return all alive entities", () => {
      const e1 = manager.spawn();
      const e2 = manager.spawn();
      const e3 = manager.spawn();
      manager.despawn(e2);

      const alive = manager.getAllAlive();

      expect(alive.length).toBe(2);
      expect(alive).toContain(e1);
      expect(alive).toContain(e3);
      expect(alive).not.toContain(e2);
    });
  });

  describe("reset", () => {
    it("should clear all entities", () => {
      manager.spawnBatch(10);

      manager.reset();

      expect(manager.getAliveCount()).toBe(0);
    });
  });

  describe("NULL_ENTITY", () => {
    it("should be invalid", () => {
      expect(isValidEntity(NULL_ENTITY)).toBe(false);
      expect(manager.isAlive(NULL_ENTITY)).toBe(false);
    });
  });
});
