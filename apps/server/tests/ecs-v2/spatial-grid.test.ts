import { describe, it, expect, beforeEach } from "bun:test";
import {
  World,
  component,
  f32,
  SpatialGrid,
  SpatialIndex,
  type Entity,
} from "../../src/game/ecs-v2";

@component
class Position {
  x = f32(0);
  y = f32(0);
}

describe("SpatialGrid", () => {
  let grid: SpatialGrid;

  beforeEach(() => {
    grid = new SpatialGrid({
      worldWidth: 1000,
      worldHeight: 1000,
      cellSize: 100,
    });
  });

  describe("Basic Operations", () => {
    it("should insert and query entity", () => {
      const entity = 1 as Entity;
      grid.insert(entity, 150, 250);

      expect(grid.has(entity)).toBe(true);
      expect(grid.size).toBe(1);

      const pos = grid.getPosition(entity);
      expect(pos).toEqual({ x: 150, y: 250 });
    });

    it("should remove entity", () => {
      const entity = 1 as Entity;
      grid.insert(entity, 150, 250);

      expect(grid.remove(entity)).toBe(true);
      expect(grid.has(entity)).toBe(false);
      expect(grid.size).toBe(0);
    });

    it("should update entity position", () => {
      const entity = 1 as Entity;
      grid.insert(entity, 150, 250);

      grid.update(entity, 300, 400);

      const pos = grid.getPosition(entity);
      expect(pos).toEqual({ x: 300, y: 400 });
    });

    it("should handle position update within same cell", () => {
      const entity = 1 as Entity;
      grid.insert(entity, 150, 250);

      // Update within same cell (cell size is 100)
      grid.update(entity, 160, 260);

      const pos = grid.getPosition(entity);
      expect(pos).toEqual({ x: 160, y: 260 });
    });

    it("should handle position update to different cell", () => {
      const entity = 1 as Entity;
      grid.insert(entity, 50, 50);

      // Update to different cell
      grid.update(entity, 550, 550);

      const pos = grid.getPosition(entity);
      expect(pos).toEqual({ x: 550, y: 550 });

      // Should be found in new cell's query
      const results = grid.queryRect(500, 500, 100, 100);
      expect(results).toContain(entity);

      // Should not be found in old cell's query
      const oldResults = grid.queryRect(0, 0, 100, 100);
      expect(oldResults).not.toContain(entity);
    });
  });

  describe("Rectangle Query", () => {
    it("should query entities in rectangle", () => {
      const e1 = 1 as Entity;
      const e2 = 2 as Entity;
      const e3 = 3 as Entity;

      grid.insert(e1, 50, 50);
      grid.insert(e2, 150, 150);
      grid.insert(e3, 500, 500);

      const results = grid.queryRect(0, 0, 200, 200);

      expect(results).toContain(e1);
      expect(results).toContain(e2);
      expect(results).not.toContain(e3);
    });

    it("should handle query spanning multiple cells", () => {
      // Insert entities across the grid
      for (let i = 0; i < 10; i++) {
        grid.insert(i as Entity, i * 100 + 50, i * 100 + 50);
      }

      const results = grid.queryRect(150, 150, 400, 400);

      // Should include entities at (250,250), (350,350), (450,450), (550,550)
      expect(results.length).toBeGreaterThan(0);
    });

    it("should handle empty query", () => {
      grid.insert(1 as Entity, 50, 50);

      const results = grid.queryRect(500, 500, 100, 100);
      expect(results).toHaveLength(0);
    });
  });

  describe("Radius Query", () => {
    it("should query entities within radius", () => {
      const e1 = 1 as Entity;
      const e2 = 2 as Entity;
      const e3 = 3 as Entity;

      grid.insert(e1, 100, 100);
      grid.insert(e2, 120, 120);
      grid.insert(e3, 500, 500);

      const results = grid.queryRadius(100, 100, 50);

      expect(results).toContain(e1);
      expect(results).toContain(e2);
      expect(results).not.toContain(e3);
    });

    it("should use circular distance", () => {
      const e1 = 1 as Entity;
      const e2 = 2 as Entity;

      // e1 at origin
      grid.insert(e1, 0, 0);
      // e2 at diagonal - distance is sqrt(50*50 + 50*50) = ~70.7
      grid.insert(e2, 50, 50);

      // Radius 60 should not include e2
      const results60 = grid.queryRadius(0, 0, 60);
      expect(results60).toContain(e1);
      expect(results60).not.toContain(e2);

      // Radius 80 should include e2
      const results80 = grid.queryRadius(0, 0, 80);
      expect(results80).toContain(e1);
      expect(results80).toContain(e2);
    });
  });

  describe("Nearest Query", () => {
    it("should find nearest entities", () => {
      grid.insert(1 as Entity, 100, 100);
      grid.insert(2 as Entity, 200, 200);
      grid.insert(3 as Entity, 300, 300);
      grid.insert(4 as Entity, 400, 400);

      const nearest = grid.queryNearest(100, 100, 2);

      expect(nearest).toHaveLength(2);
      expect(nearest[0]).toBe(1); // Closest
    });

    it("should return all if less than requested", () => {
      grid.insert(1 as Entity, 100, 100);
      grid.insert(2 as Entity, 200, 200);

      const nearest = grid.queryNearest(100, 100, 10);

      expect(nearest).toHaveLength(2);
    });
  });

  describe("Edge Cases", () => {
    it("should handle entities at grid boundaries", () => {
      grid.insert(1 as Entity, 0, 0);
      grid.insert(2 as Entity, 999, 999);

      expect(grid.has(1 as Entity)).toBe(true);
      expect(grid.has(2 as Entity)).toBe(true);

      const results = grid.queryRect(0, 0, 1000, 1000);
      expect(results).toHaveLength(2);
    });

    it("should clamp positions outside grid", () => {
      grid.insert(1 as Entity, -50, -50);
      grid.insert(2 as Entity, 1500, 1500);

      expect(grid.has(1 as Entity)).toBe(true);
      expect(grid.has(2 as Entity)).toBe(true);
    });

    it("should handle removing non-existent entity", () => {
      expect(grid.remove(999 as Entity)).toBe(false);
    });

    it("should clear all entities", () => {
      for (let i = 0; i < 100; i++) {
        grid.insert(i as Entity, i * 10, i * 10);
      }

      expect(grid.size).toBe(100);

      grid.clear();

      expect(grid.size).toBe(0);
    });
  });

  describe("Statistics", () => {
    it("should provide grid statistics", () => {
      for (let i = 0; i < 100; i++) {
        grid.insert(i as Entity, 50, 50); // All in same cell
      }

      const stats = grid.getStats();

      expect(stats.totalEntities).toBe(100);
      expect(stats.occupiedCells).toBe(1);
      expect(stats.avgEntitiesPerCell).toBe(100);
      expect(stats.maxEntitiesInCell).toBe(100);
    });
  });
});

describe("SpatialIndex with ECS", () => {
  let world: World;
  let spatial: SpatialIndex;

  beforeEach(() => {
    world = new World();
    spatial = new SpatialIndex({
      worldWidth: 1000,
      worldHeight: 1000,
      cellSize: 100,
    });
    spatial.trackComponent(Position);
  });

  it("should sync entity position from component", () => {
    const entity = world.spawn(Position);
    world.set(entity, Position, { x: 150, y: 250 });

    spatial.syncEntity(world, entity, Position);

    expect(spatial.size).toBe(1);
    expect(spatial.getPosition(entity)).toEqual({ x: 150, y: 250 });
  });

  it("should update position on sync", () => {
    const entity = world.spawn(Position);
    world.set(entity, Position, { x: 100, y: 100 });
    spatial.syncEntity(world, entity, Position);

    world.set(entity, Position, { x: 500, y: 500 });
    spatial.syncEntity(world, entity, Position);

    expect(spatial.getPosition(entity)).toEqual({ x: 500, y: 500 });
  });

  it("should remove entity when component is missing", () => {
    const entity = world.spawn(Position);
    world.set(entity, Position, { x: 100, y: 100 });
    spatial.syncEntity(world, entity, Position);

    world.remove(entity, Position);
    spatial.syncEntity(world, entity, Position);

    expect(spatial.size).toBe(0);
  });

  it("should query entities spatially", () => {
    const e1 = world.spawn(Position);
    const e2 = world.spawn(Position);
    const e3 = world.spawn(Position);

    world.set(e1, Position, { x: 100, y: 100 });
    world.set(e2, Position, { x: 150, y: 150 });
    world.set(e3, Position, { x: 800, y: 800 });

    spatial.syncEntity(world, e1, Position);
    spatial.syncEntity(world, e2, Position);
    spatial.syncEntity(world, e3, Position);

    const nearby = spatial.queryRadius(100, 100, 100);

    expect(nearby).toContain(e1);
    expect(nearby).toContain(e2);
    expect(nearby).not.toContain(e3);
  });
});

describe("Spatial Grid Performance", () => {
  it("should handle 10k entities efficiently", () => {
    const grid = new SpatialGrid({
      worldWidth: 10000,
      worldHeight: 10000,
      cellSize: 100,
    });

    const insertStart = performance.now();
    for (let i = 0; i < 10_000; i++) {
      const x = Math.random() * 10000;
      const y = Math.random() * 10000;
      grid.insert(i as Entity, x, y);
    }
    const insertTime = performance.now() - insertStart;
    console.log(`  Insert 10k entities: ${insertTime.toFixed(2)}ms`);

    const queryStart = performance.now();
    for (let i = 0; i < 1000; i++) {
      const x = Math.random() * 10000;
      const y = Math.random() * 10000;
      grid.queryRadius(x, y, 200);
    }
    const queryTime = performance.now() - queryStart;
    console.log(`  1000 radius queries: ${queryTime.toFixed(2)}ms`);

    const updateStart = performance.now();
    for (let i = 0; i < 10_000; i++) {
      const x = Math.random() * 10000;
      const y = Math.random() * 10000;
      grid.update(i as Entity, x, y);
    }
    const updateTime = performance.now() - updateStart;
    console.log(`  Update 10k positions: ${updateTime.toFixed(2)}ms`);

    expect(insertTime).toBeLessThan(100);
    expect(queryTime).toBeLessThan(100);
    expect(updateTime).toBeLessThan(100);
  });

  it("should handle dense clustering", () => {
    const grid = new SpatialGrid({
      worldWidth: 1000,
      worldHeight: 1000,
      cellSize: 100,
    });

    // All entities in same cell
    for (let i = 0; i < 1000; i++) {
      grid.insert(i as Entity, 50 + Math.random() * 50, 50 + Math.random() * 50);
    }

    const queryStart = performance.now();
    for (let i = 0; i < 100; i++) {
      grid.queryRadius(75, 75, 50);
    }
    const queryTime = performance.now() - queryStart;
    console.log(`  100 dense queries: ${queryTime.toFixed(2)}ms`);

    expect(queryTime).toBeLessThan(50);
  });
});
