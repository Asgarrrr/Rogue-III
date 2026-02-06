import { describe, it, expect, beforeEach } from "bun:test";
import {
  World,
  component,
  f32,
  SpatialGrid,
  SpatialIndex,
  type Entity,
} from "@rogue/ecs";

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

    it("should return sorted results (nearest first)", () => {
      // Place entities at known distances from (0, 0)
      grid.insert(1 as Entity, 10, 0); // distance 10
      grid.insert(2 as Entity, 0, 30); // distance 30
      grid.insert(3 as Entity, 0, 20); // distance 20
      grid.insert(4 as Entity, 40, 0); // distance 40
      grid.insert(5 as Entity, 0, 50); // distance 50

      const nearest = grid.queryNearest(0, 0, 3);

      expect(nearest).toHaveLength(3);
      expect(nearest[0]).toBe(1); // distance 10
      expect(nearest[1]).toBe(3); // distance 20
      expect(nearest[2]).toBe(2); // distance 30
    });

    it("should use heap efficiently for large k", () => {
      // Insert 1000 entities
      for (let i = 0; i < 1000; i++) {
        grid.insert(i as Entity, i, i);
      }

      const nearest = grid.queryNearest(0, 0, 10);

      expect(nearest).toHaveLength(10);
      // First entity should be closest (0, 0)
      expect(nearest[0]).toBe(0);
      // Should be sorted by distance
      expect(nearest[1]).toBe(1);
    });

    it("should handle k=1 efficiently", () => {
      grid.insert(1 as Entity, 100, 100);
      grid.insert(2 as Entity, 200, 200);
      grid.insert(3 as Entity, 50, 50);
      grid.insert(4 as Entity, 300, 300);

      const nearest = grid.queryNearest(100, 100, 1);

      expect(nearest).toHaveLength(1);
      expect(nearest[0]).toBe(1); // Exact match at query point
    });

    it("should respect maxRadius parameter", () => {
      grid.insert(1 as Entity, 10, 0);
      grid.insert(2 as Entity, 20, 0);
      grid.insert(3 as Entity, 100, 0);
      grid.insert(4 as Entity, 200, 0);

      // Query with maxRadius of 50 should exclude entities 3 and 4
      const nearest = grid.queryNearest(0, 0, 10, 50);

      expect(nearest).toHaveLength(2);
      expect(nearest).toContain(1);
      expect(nearest).toContain(2);
      expect(nearest).not.toContain(3);
      expect(nearest).not.toContain(4);
    });

    it("should return empty array for count=0", () => {
      grid.insert(1 as Entity, 100, 100);

      const nearest = grid.queryNearest(100, 100, 0);

      expect(nearest).toHaveLength(0);
    });

    it("should handle negative count gracefully", () => {
      grid.insert(1 as Entity, 100, 100);

      const nearest = grid.queryNearest(100, 100, -5);

      expect(nearest).toHaveLength(0);
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

  it("queryNearest should be O(n log k) efficient", () => {
    const grid = new SpatialGrid({
      worldWidth: 10000,
      worldHeight: 10000,
      cellSize: 100,
    });

    // Insert 5000 entities in a dense area
    for (let i = 0; i < 5000; i++) {
      const x = 5000 + Math.random() * 1000;
      const y = 5000 + Math.random() * 1000;
      grid.insert(i as Entity, x, y);
    }

    // Test k=1 (worst case benefit of heap vs sort)
    const k1Start = performance.now();
    for (let i = 0; i < 100; i++) {
      grid.queryNearest(5500, 5500, 1, 1000);
    }
    const k1Time = performance.now() - k1Start;
    console.log(`  100 queryNearest(k=1) on 5k entities: ${k1Time.toFixed(2)}ms`);

    // Test k=10
    const k10Start = performance.now();
    for (let i = 0; i < 100; i++) {
      grid.queryNearest(5500, 5500, 10, 1000);
    }
    const k10Time = performance.now() - k10Start;
    console.log(`  100 queryNearest(k=10) on 5k entities: ${k10Time.toFixed(2)}ms`);

    // Test k=100
    const k100Start = performance.now();
    for (let i = 0; i < 100; i++) {
      grid.queryNearest(5500, 5500, 100, 1000);
    }
    const k100Time = performance.now() - k100Start;
    console.log(`  100 queryNearest(k=100) on 5k entities: ${k100Time.toFixed(2)}ms`);

    // k=1 should be fastest (O(n log 1) = O(n))
    // k=10 should be slightly slower
    // k=100 should be slower still
    // All should be reasonable (< 100ms for 100 queries on 5k entities)
    expect(k1Time).toBeLessThan(100);
    expect(k10Time).toBeLessThan(100);
    expect(k100Time).toBeLessThan(100);
  });
});
