import { describe, it, expect, beforeEach } from "bun:test";
import { World, component, f32, i32, type Entity } from "../../src/game/ecs-v2";
import { Archetype, ArchetypeGraph } from "../../src/game/ecs-v2/archetype";
import { getComponentMeta } from "../../src/game/ecs-v2/component";

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

describe("Phase 3: Archetype Version Counters", () => {
  let graph: ArchetypeGraph;
  let archetype: Archetype;

  beforeEach(() => {
    graph = new ArchetypeGraph();
    archetype = graph.getOrCreateArchetype([Position, Velocity]);
  });

  describe("Archetype.version", () => {
    it("starts at 0", () => {
      expect(archetype.version).toBe(0);
    });

    it("increments on setComponentData", () => {
      const entity = 1 as Entity;
      const row = archetype.allocateRow(entity);
      const posIndex = getComponentMeta(Position).id.index;

      expect(archetype.version).toBe(0);

      archetype.setComponentData(row, posIndex, { x: 10, y: 20 });

      expect(archetype.version).toBe(1);

      archetype.setComponentData(row, posIndex, { x: 15, y: 25 });

      expect(archetype.version).toBe(2);
    });

    it("increments on setFieldValue", () => {
      const entity = 1 as Entity;
      const row = archetype.allocateRow(entity);
      const posIndex = getComponentMeta(Position).id.index;

      expect(archetype.version).toBe(0);

      archetype.setFieldValue(row, posIndex, "x", 10);

      expect(archetype.version).toBe(1);

      archetype.setFieldValue(row, posIndex, "y", 20);

      expect(archetype.version).toBe(2);
    });

    it("does not increment on allocateRow", () => {
      const entity1 = 1 as Entity;
      const entity2 = 2 as Entity;

      archetype.allocateRow(entity1);
      expect(archetype.version).toBe(0);

      archetype.allocateRow(entity2);
      expect(archetype.version).toBe(0);
    });
  });

  describe("Archetype.getColumnVersion", () => {
    it("returns 0 for untouched columns", () => {
      const posIndex = getComponentMeta(Position).id.index;
      const velIndex = getComponentMeta(Velocity).id.index;

      expect(archetype.getColumnVersion(posIndex)).toBe(0);
      expect(archetype.getColumnVersion(velIndex)).toBe(0);
    });

    it("tracks per-component versions", () => {
      const entity = 1 as Entity;
      const row = archetype.allocateRow(entity);
      const posIndex = getComponentMeta(Position).id.index;
      const velIndex = getComponentMeta(Velocity).id.index;

      archetype.setComponentData(row, posIndex, { x: 10, y: 20 });

      expect(archetype.getColumnVersion(posIndex)).toBe(1);
      expect(archetype.getColumnVersion(velIndex)).toBe(0);

      archetype.setComponentData(row, velIndex, { x: 1, y: 2 });

      expect(archetype.getColumnVersion(posIndex)).toBe(1);
      expect(archetype.getColumnVersion(velIndex)).toBe(2);
    });

    it("column version equals archetype version at time of write", () => {
      const entity = 1 as Entity;
      const row = archetype.allocateRow(entity);
      const posIndex = getComponentMeta(Position).id.index;
      const velIndex = getComponentMeta(Velocity).id.index;

      archetype.setComponentData(row, posIndex, { x: 1, y: 1 });
      archetype.setComponentData(row, velIndex, { x: 2, y: 2 });
      archetype.setComponentData(row, posIndex, { x: 3, y: 3 });

      expect(archetype.version).toBe(3);
      expect(archetype.getColumnVersion(posIndex)).toBe(3);
      expect(archetype.getColumnVersion(velIndex)).toBe(2);
    });
  });
});

describe("Phase 3: World Change Detection", () => {
  let world: World;

  beforeEach(() => {
    world = new World(1024);
  });

  describe("getChangedEntities", () => {
    it("returns empty for fresh world", () => {
      const changed = world.getChangedEntities(0);
      expect(changed).toEqual([]);
    });

    it("returns newly spawned entities", () => {
      const e1 = world.spawn(Position);
      const e2 = world.spawn(Position);

      const changed = world.getChangedEntities(0);

      expect(changed).toContain(e1);
      expect(changed).toContain(e2);
      expect(changed.length).toBe(2);
    });

    it("returns modified entities", () => {
      const e1 = world.spawn(Position);
      const e2 = world.spawn(Position);

      world.runTick();

      world.set(e1, Position, { x: 10, y: 20 });

      const changed = world.getChangedEntities(0);

      expect(changed).toContain(e1);
      expect(changed.length).toBe(1);
    });

    it("respects sinceTick parameter", () => {
      const e1 = world.spawn(Position);
      world.runTick();

      const e2 = world.spawn(Position);

      const changedSince0 = world.getChangedEntities(0);
      expect(changedSince0.length).toBe(1);
      expect(changedSince0).toContain(e2);
    });

    it("returns empty after runTick clears flags", () => {
      world.spawn(Position);
      world.spawn(Position);

      world.runTick();

      const changed = world.getChangedEntities(0);
      expect(changed).toEqual([]);
    });
  });

  describe("getArchetypesChangedSince", () => {
    it("returns empty for fresh world", () => {
      const archetypes = world.getArchetypesChangedSince(0);
      expect(archetypes).toEqual([]);
    });

    it("returns archetypes with modifications", () => {
      const e1 = world.spawn(Position);
      world.set(e1, Position, { x: 10, y: 20 });

      const archetypes = world.getArchetypesChangedSince(0);

      expect(archetypes.length).toBe(1);
    });

    it("respects sinceTick for archetype version", () => {
      const e1 = world.spawn(Position);
      world.set(e1, Position, { x: 1, y: 1 });

      const currentVersion = world.getArchetypesChangedSince(0)[0].version;

      const archetype = world.getArchetypesChangedSince(currentVersion);
      expect(archetype.length).toBe(0);

      world.set(e1, Position, { x: 2, y: 2 });

      const newArchetypes = world.getArchetypesChangedSince(currentVersion);
      expect(newArchetypes.length).toBe(1);
    });

    it("returns only changed archetypes", () => {
      const e1 = world.spawn(Position);
      const e2 = world.spawn(Velocity);

      world.set(e1, Position, { x: 10, y: 20 });
      world.set(e2, Velocity, { x: 1, y: 2 });

      const allChanged = world.getArchetypesChangedSince(0);
      expect(allChanged.length).toBe(2);

      const posArch = allChanged.find((a) =>
        a.componentTypes.includes(Position),
      );
      const velArch = allChanged.find((a) =>
        a.componentTypes.includes(Velocity),
      );

      expect(posArch).toBeDefined();
      expect(velArch).toBeDefined();

      world.set(e1, Position, { x: 20, y: 30 });

      const changedSinceVel = world.getArchetypesChangedSince(velArch!.version);
      expect(changedSinceVel.length).toBe(1);
      expect(changedSinceVel[0].componentTypes).toContain(Position);
    });
  });
});

describe("Phase 3: Integration with World.set", () => {
  it("World.set increments archetype version", () => {
    const world = new World(100);
    const entity = world.spawn(Position);

    const archetypes = world.getArchetypesChangedSince(0);
    const initialVersion = archetypes[0]?.version ?? 0;

    world.set(entity, Position, { x: 100, y: 200 });

    const newArchetypes = world.getArchetypesChangedSince(initialVersion);
    expect(newArchetypes.length).toBe(1);
    expect(newArchetypes[0].version).toBeGreaterThan(initialVersion);
  });
});

describe("Phase 3: Performance", () => {
  it("getChangedEntities 10k entities < 5ms", () => {
    const world = new World(20000);

    for (let i = 0; i < 10000; i++) {
      world.spawn(Position);
    }

    const start = performance.now();
    const changed = world.getChangedEntities(0);
    const elapsed = performance.now() - start;

    console.log(`  getChangedEntities (10k): ${elapsed.toFixed(2)}ms`);
    expect(elapsed).toBeLessThan(5);
    expect(changed.length).toBe(10000);
  });

  it("version counter overhead negligible", () => {
    const world = new World(10000);

    for (let i = 0; i < 1000; i++) {
      world.spawn(Position, Velocity);
    }

    const entities: Entity[] = [];
    world.query(Position).run((view) => {
      for (let i = 0; i < view.rawCount(); i++) {
        entities.push(view.entity(i));
      }
    });

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      for (const entity of entities) {
        world.set(entity, Position, { x: i, y: i });
      }
    }
    const elapsed = performance.now() - start;

    console.log(`  100k set operations: ${elapsed.toFixed(2)}ms`);
    expect(elapsed).toBeLessThan(100);
  });
});
