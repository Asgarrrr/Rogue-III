import { describe, test, expect, beforeEach } from "bun:test";
import { World, defineRelation } from "@rogue/ecs";
import { _resetRelationRegistry } from "@rogue/ecs";

/**
 * Test to verify the nested Map optimization for RelationStore data storage.
 *
 * The optimization replaces string key concatenation (`${relationIndex}:${source}:${target}`)
 * with nested Maps for O(1) lookups without string allocation.
 */
describe("RelationStore Optimization", () => {
  beforeEach(() => {
    _resetRelationRegistry();
  });

  test("Nested Map data storage works correctly", () => {
    const world = new World();

    // Define a relation with data
    const Metadata = defineRelation<{ value: string }>("Metadata");

    // Create entities
    const e1 = world.spawn();
    const e2 = world.spawn();
    const e3 = world.spawn();

    // Add relations with data
    world.relate(e1, Metadata, e2, { value: "test1" });
    world.relate(e1, Metadata, e3, { value: "test2" });
    world.relate(e2, Metadata, e3, { value: "test3" });

    // Verify data retrieval
    expect(world.getRelationData(e1, Metadata, e2)).toEqual({ value: "test1" });
    expect(world.getRelationData(e1, Metadata, e3)).toEqual({ value: "test2" });
    expect(world.getRelationData(e2, Metadata, e3)).toEqual({ value: "test3" });

    // Update data
    world.setRelationData(e1, Metadata, e2, { value: "updated" });
    expect(world.getRelationData(e1, Metadata, e2)).toEqual({
      value: "updated",
    });

    // Remove relation and verify data is cleaned up
    world.unrelate(e1, Metadata, e2);
    expect(world.getRelationData(e1, Metadata, e2)).toBeUndefined();

    // Verify other relations still have data
    expect(world.getRelationData(e1, Metadata, e3)).toEqual({ value: "test2" });
    expect(world.getRelationData(e2, Metadata, e3)).toEqual({ value: "test3" });
  });

  test("Performance: nested Maps vs string keys", () => {
    const world = new World();

    // Define a relation with data
    const Metadata = defineRelation<{ value: number }>("MetadataPerf");

    const numEntities = 1000;
    const entities: number[] = [];

    // Create entities
    for (let i = 0; i < numEntities; i++) {
      entities.push(world.spawn());
    }

    // Add relations
    const startAdd = performance.now();
    for (let i = 0; i < numEntities - 1; i++) {
      world.relate(entities[i], Metadata, entities[i + 1], { value: i });
    }
    const addTime = performance.now() - startAdd;

    // Query relations
    const startQuery = performance.now();
    for (let i = 0; i < numEntities - 1; i++) {
      const data = world.getRelationData(
        entities[i],
        Metadata,
        entities[i + 1],
      );
      expect(data?.value).toBe(i);
    }
    const queryTime = performance.now() - startQuery;

    // Update relations
    const startUpdate = performance.now();
    for (let i = 0; i < numEntities - 1; i++) {
      world.setRelationData(entities[i], Metadata, entities[i + 1], {
        value: i * 2,
      });
    }
    const updateTime = performance.now() - startUpdate;

    // Remove relations
    const startRemove = performance.now();
    for (let i = 0; i < numEntities - 1; i++) {
      world.unrelate(entities[i], Metadata, entities[i + 1]);
    }
    const removeTime = performance.now() - startRemove;

    console.log(
      `  Add ${numEntities} relations with data: ${addTime.toFixed(2)}ms`,
    );
    console.log(
      `  Query ${numEntities} relation data: ${queryTime.toFixed(2)}ms`,
    );
    console.log(
      `  Update ${numEntities} relation data: ${updateTime.toFixed(2)}ms`,
    );
    console.log(
      `  Remove ${numEntities} relations: ${removeTime.toFixed(2)}ms`,
    );

    // Verify all data is gone after removal
    for (let i = 0; i < numEntities - 1; i++) {
      expect(
        world.getRelationData(entities[i], Metadata, entities[i + 1]),
      ).toBeUndefined();
    }
  });

  test("Map cleanup: empty maps are removed", () => {
    const world = new World();

    const Metadata = defineRelation<{ value: string }>("MetadataCleanup");

    const e1 = world.spawn();
    const e2 = world.spawn();
    const e3 = world.spawn();

    // Add multiple relations
    world.relate(e1, Metadata, e2, { value: "test1" });
    world.relate(e1, Metadata, e3, { value: "test2" });

    // Verify both relations exist
    expect(world.hasRelation(e1, Metadata, e2)).toBe(true);
    expect(world.hasRelation(e1, Metadata, e3)).toBe(true);

    // Remove one relation
    world.unrelate(e1, Metadata, e2);
    expect(world.hasRelation(e1, Metadata, e2)).toBe(false);

    // Verify remaining data is still accessible
    expect(world.getRelationData(e1, Metadata, e3)).toEqual({ value: "test2" });

    // Remove last relation - should clean up all maps
    world.unrelate(e1, Metadata, e3);
    expect(world.hasRelation(e1, Metadata, e3)).toBe(false);

    // Verify no data remains
    expect(world.getRelationData(e1, Metadata, e2)).toBeUndefined();
    expect(world.getRelationData(e1, Metadata, e3)).toBeUndefined();
  });
});
