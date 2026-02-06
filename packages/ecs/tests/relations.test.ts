import { describe, it, expect, beforeEach } from "bun:test";
import {
  World,
  component,
  f32,
  u32,
  defineRelation,
  ChildOf,
  Contains,
  Targets,
  _resetRelationRegistry,
  RelationStore,
  WorldSerializer,
  type Entity,
} from "@rogue/ecs";

// Test components
@component
class Position {
  x = f32();
  y = f32();
}

@component
class Health {
  current = u32(100);
  max = u32(100);
}

@component
class Name {
  id = u32();
}

describe("Relations", () => {
  let world: World;

  beforeEach(() => {
    world = new World();
  });

  describe("Basic Operations", () => {
    it("should add and check relations", () => {
      const parent = world.spawn(Position);
      const child = world.spawn(Position);

      expect(world.hasRelation(child, ChildOf, parent)).toBe(false);

      world.relate(child, ChildOf, parent);

      expect(world.hasRelation(child, ChildOf, parent)).toBe(true);
    });

    it("should get target of exclusive relation", () => {
      const parent = world.spawn(Position);
      const child = world.spawn(Position);

      world.relate(child, ChildOf, parent);

      expect(world.getTarget(child, ChildOf)).toBe(parent);
    });

    it("should get all targets of non-exclusive relation", () => {
      const container = world.spawn(Position);
      const item1 = world.spawn(Position);
      const item2 = world.spawn(Position);
      const item3 = world.spawn(Position);

      world.relate(container, Contains, item1);
      world.relate(container, Contains, item2);
      world.relate(container, Contains, item3);

      const items = world.getTargets(container, Contains);
      expect(items).toHaveLength(3);
      expect(items).toContain(item1);
      expect(items).toContain(item2);
      expect(items).toContain(item3);
    });

    it("should get sources (reverse lookup)", () => {
      const parent = world.spawn(Position);
      const child1 = world.spawn(Position);
      const child2 = world.spawn(Position);

      world.relate(child1, ChildOf, parent);
      world.relate(child2, ChildOf, parent);

      const children = world.getSources(parent, ChildOf);
      expect(children).toHaveLength(2);
      expect(children).toContain(child1);
      expect(children).toContain(child2);
    });

    it("should remove relations", () => {
      const parent = world.spawn(Position);
      const child = world.spawn(Position);

      world.relate(child, ChildOf, parent);
      expect(world.hasRelation(child, ChildOf, parent)).toBe(true);

      world.unrelate(child, ChildOf, parent);
      expect(world.hasRelation(child, ChildOf, parent)).toBe(false);
    });

    it("should return false when adding relation to dead entity", () => {
      const parent = world.spawn(Position);
      const child = world.spawn(Position);

      world.despawn(parent);

      const result = world.relate(child, ChildOf, parent);
      expect(result).toBe(false);
    });
  });

  describe("Exclusive Relations", () => {
    it("should replace target when adding to exclusive relation", () => {
      const parent1 = world.spawn(Position);
      const parent2 = world.spawn(Position);
      const child = world.spawn(Position);

      world.relate(child, ChildOf, parent1);
      expect(world.getTarget(child, ChildOf)).toBe(parent1);

      world.relate(child, ChildOf, parent2);
      expect(world.getTarget(child, ChildOf)).toBe(parent2);

      // Old relation should be removed
      expect(world.hasRelation(child, ChildOf, parent1)).toBe(false);
    });

    it("should not duplicate when adding same target", () => {
      const parent = world.spawn(Position);
      const child = world.spawn(Position);

      world.relate(child, ChildOf, parent);
      world.relate(child, ChildOf, parent);
      world.relate(child, ChildOf, parent);

      // Should still have only one relation
      expect(world.relations.count).toBe(1);
    });
  });

  describe("Cascade Delete", () => {
    it("should cascade delete children when parent is despawned", () => {
      const parent = world.spawn(Position);
      const child1 = world.spawn(Position);
      const child2 = world.spawn(Position);

      world.relate(child1, ChildOf, parent);
      world.relate(child2, ChildOf, parent);

      expect(world.isAlive(child1)).toBe(true);
      expect(world.isAlive(child2)).toBe(true);

      world.despawn(parent);

      expect(world.isAlive(parent)).toBe(false);
      expect(world.isAlive(child1)).toBe(false);
      expect(world.isAlive(child2)).toBe(false);
    });

    it("should cascade delete grandchildren", () => {
      const grandparent = world.spawn(Position);
      const parent = world.spawn(Position);
      const child = world.spawn(Position);

      world.relate(parent, ChildOf, grandparent);
      world.relate(child, ChildOf, parent);

      world.despawn(grandparent);

      expect(world.isAlive(grandparent)).toBe(false);
      expect(world.isAlive(parent)).toBe(false);
      expect(world.isAlive(child)).toBe(false);
    });

    it("should not cascade for non-cascade relations", () => {
      const container = world.spawn(Position);
      const item = world.spawn(Position);

      world.relate(container, Contains, item);

      world.despawn(container);

      expect(world.isAlive(container)).toBe(false);
      expect(world.isAlive(item)).toBe(true); // Item survives
    });

    it("should handle cascade delete cycles", () => {
      // Create a cycle: A -> B -> A (via different relations)
      const SymmetricRel = defineRelation("SymmetricTest", {
        symmetric: true,
        cascadeDelete: true,
      });

      const a = world.spawn(Position);
      const b = world.spawn(Position);

      world.relate(a, SymmetricRel, b);

      // This should not infinite loop
      world.despawn(a);

      expect(world.isAlive(a)).toBe(false);
      expect(world.isAlive(b)).toBe(false);
    });
  });

  describe("Relation Data", () => {
    it("should store and retrieve relation data", () => {
      const EquippedIn = defineRelation<{ slot: string }>("EquippedIn", {
        exclusive: true,
      });

      const player = world.spawn(Position);
      const sword = world.spawn(Position);

      world.relate(sword, EquippedIn, player, { slot: "mainHand" });

      const data = world.getRelationData(sword, EquippedIn, player);
      expect(data).toEqual({ slot: "mainHand" });
    });

    it("should update relation data", () => {
      const EquippedIn = defineRelation<{ slot: string }>("EquippedIn2", {
        exclusive: true,
      });

      const player = world.spawn(Position);
      const sword = world.spawn(Position);

      world.relate(sword, EquippedIn, player, { slot: "mainHand" });
      world.setRelationData(sword, EquippedIn, player, { slot: "offHand" });

      const data = world.getRelationData(sword, EquippedIn, player);
      expect(data).toEqual({ slot: "offHand" });
    });

    it("should update data when re-adding relation", () => {
      const EquippedIn = defineRelation<{ slot: string }>("EquippedIn3", {
        exclusive: true,
      });

      const player = world.spawn(Position);
      const sword = world.spawn(Position);

      world.relate(sword, EquippedIn, player, { slot: "mainHand" });
      world.relate(sword, EquippedIn, player, { slot: "offHand" });

      const data = world.getRelationData(sword, EquippedIn, player);
      expect(data).toEqual({ slot: "offHand" });
    });
  });

  describe("Symmetric Relations", () => {
    it("should automatically create reverse relation", () => {
      const Sibling = defineRelation("Sibling", { symmetric: true });

      const a = world.spawn(Position);
      const b = world.spawn(Position);

      world.relate(a, Sibling, b);

      expect(world.hasRelation(a, Sibling, b)).toBe(true);
      expect(world.hasRelation(b, Sibling, a)).toBe(true);
    });

    it("should automatically remove reverse relation", () => {
      const Sibling = defineRelation("Sibling2", { symmetric: true });

      const a = world.spawn(Position);
      const b = world.spawn(Position);

      world.relate(a, Sibling, b);
      world.unrelate(a, Sibling, b);

      expect(world.hasRelation(a, Sibling, b)).toBe(false);
      expect(world.hasRelation(b, Sibling, a)).toBe(false);
    });
  });

  describe("Auto Cleanup on Despawn", () => {
    it("should remove relations when source is despawned", () => {
      const parent = world.spawn(Position);
      const child = world.spawn(Position);

      world.relate(child, Targets, parent); // Non-cascade relation

      world.despawn(child);

      // Relation should be cleaned up
      expect(world.relations.count).toBe(0);
    });

    it("should remove relations when target is despawned (non-cascade)", () => {
      const player = world.spawn(Position);
      const enemy = world.spawn(Position);

      world.relate(enemy, Targets, player);

      world.despawn(player);

      // Enemy survives but relation is cleaned up
      expect(world.isAlive(enemy)).toBe(true);
      expect(world.relations.count).toBe(0);
    });
  });

  describe("Deterministic Iteration", () => {
    it("should iterate relations in deterministic order", () => {
      const container = world.spawn(Position);
      const items: Entity[] = [];

      for (let i = 0; i < 10; i++) {
        items.push(world.spawn(Position));
      }

      // Add in random order
      for (const item of [items[5], items[2], items[8], items[0], items[9]]) {
        world.relate(container, Contains, item);
      }

      // Get targets should be sorted by entity index
      const targets1 = world.getTargets(container, Contains);
      const targets2 = world.getTargets(container, Contains);

      expect(targets1).toEqual(targets2);

      // Verify sorted order
      for (let i = 1; i < targets1.length; i++) {
        expect(targets1[i]).toBeGreaterThan(targets1[i - 1]);
      }
    });
  });
});

describe("RelationStore", () => {
  let store: RelationStore;

  beforeEach(() => {
    store = new RelationStore();
  });

  describe("Count Operations", () => {
    it("should count targets", () => {
      const TestRel = defineRelation("CountTest");
      store.registerRelationType(TestRel);

      store.add(1 as Entity, TestRel, 10 as Entity);
      store.add(1 as Entity, TestRel, 11 as Entity);
      store.add(1 as Entity, TestRel, 12 as Entity);

      expect(store.countTargets(1 as Entity, TestRel)).toBe(3);
    });

    it("should count sources", () => {
      const TestRel = defineRelation("CountTest2");
      store.registerRelationType(TestRel);

      store.add(1 as Entity, TestRel, 100 as Entity);
      store.add(2 as Entity, TestRel, 100 as Entity);

      expect(store.countSources(100 as Entity, TestRel)).toBe(2);
    });

    it("should count by type", () => {
      const TestRel = defineRelation("CountTest3");
      store.registerRelationType(TestRel);

      store.add(1 as Entity, TestRel, 10 as Entity);
      store.add(2 as Entity, TestRel, 20 as Entity);
      store.add(3 as Entity, TestRel, 30 as Entity);

      expect(store.countByType(TestRel)).toBe(3);
    });
  });

  describe("Has Operations", () => {
    it("should check hasAnyTarget", () => {
      const TestRel = defineRelation("HasTest");
      store.registerRelationType(TestRel);

      expect(store.hasAnyTarget(1 as Entity, TestRel)).toBe(false);

      store.add(1 as Entity, TestRel, 10 as Entity);

      expect(store.hasAnyTarget(1 as Entity, TestRel)).toBe(true);
    });

    it("should check hasAnySource", () => {
      const TestRel = defineRelation("HasTest2");
      store.registerRelationType(TestRel);

      expect(store.hasAnySource(10 as Entity, TestRel)).toBe(false);

      store.add(1 as Entity, TestRel, 10 as Entity);

      expect(store.hasAnySource(10 as Entity, TestRel)).toBe(true);
    });
  });

  describe("Clear Operations", () => {
    it("should clear all relations", () => {
      const TestRel = defineRelation("ClearTest");
      store.registerRelationType(TestRel);

      store.add(1 as Entity, TestRel, 10 as Entity);
      store.add(2 as Entity, TestRel, 20 as Entity);

      expect(store.count).toBe(2);

      store.clear();

      expect(store.count).toBe(0);
    });

    it("should clear by type", () => {
      const TestRel1 = defineRelation("ClearByType1");
      const TestRel2 = defineRelation("ClearByType2");
      store.registerRelationType(TestRel1);
      store.registerRelationType(TestRel2);

      store.add(1 as Entity, TestRel1, 10 as Entity);
      store.add(1 as Entity, TestRel2, 10 as Entity);

      expect(store.count).toBe(2);

      store.clearByType(TestRel1);

      expect(store.count).toBe(1);
      expect(store.has(1 as Entity, TestRel1, 10 as Entity)).toBe(false);
      expect(store.has(1 as Entity, TestRel2, 10 as Entity)).toBe(true);
    });
  });

  describe("getAllRelations", () => {
    it("should get all relations of a type", () => {
      const TestRel = defineRelation("GetAllTest");
      store.registerRelationType(TestRel);

      store.add(1 as Entity, TestRel, 10 as Entity);
      store.add(2 as Entity, TestRel, 20 as Entity);

      const all = store.getAllRelations(TestRel);
      expect(all).toHaveLength(2);
    });
  });
});

describe("Relation Serialization", () => {
  it("should serialize and deserialize relations", () => {
    const world = new World();

    const parent = world.spawn(Position);
    const child1 = world.spawn(Position);
    const child2 = world.spawn(Position);

    world.set(parent, Position, { x: 100, y: 100 });
    world.set(child1, Position, { x: 10, y: 10 });
    world.set(child2, Position, { x: 20, y: 20 });

    world.relate(child1, ChildOf, parent);
    world.relate(child2, ChildOf, parent);
    world.relate(parent, Contains, child1);
    world.relate(parent, Contains, child2);

    // Serialize with relations
    const serializer = new WorldSerializer({
      relationTypes: [ChildOf, Contains],
    });
    const snapshot = serializer.serialize(world);

    expect(snapshot.relations).toBeDefined();
    expect(snapshot.relations).toHaveLength(4);

    // Deserialize
    const world2 = serializer.deserialize(snapshot);

    // Find entities (they may have different IDs)
    let newParent: Entity | null = null;
    let newChild1: Entity | null = null;
    let newChild2: Entity | null = null;

    world2.query(Position).run((view) => {
      for (let i = 0; i < view.count; i++) {
        const x = view.column(Position, "x")[i];
        const entity = view.entity(i);
        if (x === 100) newParent = entity;
        else if (x === 10) newChild1 = entity;
        else if (x === 20) newChild2 = entity;
      }
    });

    expect(newParent).not.toBeNull();
    expect(newChild1).not.toBeNull();
    expect(newChild2).not.toBeNull();

    // Verify relations are restored
    expect(world2.getTarget(newChild1!, ChildOf)).toBe(newParent);
    expect(world2.getTarget(newChild2!, ChildOf)).toBe(newParent);
    expect(world2.getTargets(newParent!, Contains)).toContain(newChild1);
    expect(world2.getTargets(newParent!, Contains)).toContain(newChild2);
  });

  it("should serialize relation data", () => {
    const EquippedIn = defineRelation<{ slot: string }>("EquippedInSer", {
      exclusive: true,
    });

    const world = new World();

    const player = world.spawn(Position);
    const sword = world.spawn(Position);

    world.relate(sword, EquippedIn, player, { slot: "mainHand" });

    const serializer = new WorldSerializer({
      relationTypes: [EquippedIn],
    });
    const snapshot = serializer.serialize(world);

    expect(snapshot.relations).toHaveLength(1);
    expect(snapshot.relations![0].data).toEqual({ slot: "mainHand" });

    // Deserialize
    const world2 = serializer.deserialize(snapshot);

    // Find the sword entity
    let newSword: Entity | null = null;
    let newPlayer: Entity | null = null;

    world2.query(Position).run((view) => {
      for (let i = 0; i < view.count; i++) {
        const entity = view.entity(i);
        if (world2.relations.hasAnyTarget(entity, EquippedIn)) {
          newSword = entity;
        } else {
          newPlayer = entity;
        }
      }
    });

    expect(newSword).not.toBeNull();
    expect(newPlayer).not.toBeNull();

    const data = world2.getRelationData(newSword!, EquippedIn, newPlayer!);
    expect(data).toEqual({ slot: "mainHand" });
  });

  it("should skip unknown relations when option is set", () => {
    const snapshot = {
      version: "1.1.0",
      tick: 0,
      entities: [{ id: 1, components: { Position: { x: 0, y: 0 } } }],
      resources: {},
      relations: [{ type: "UnknownRelation", source: 1, target: 1 }],
    };

    const serializer = new WorldSerializer({
      skipUnknownRelations: true,
    });

    // Should not throw
    const world = serializer.deserialize(snapshot);
    expect(world.getEntityCount()).toBe(1);
  });
});

describe("Hierarchy Helpers", () => {
  it("should despawn children without parent", () => {
    const world = new World();

    const parent = world.spawn(Position);
    const child1 = world.spawn(Position);
    const child2 = world.spawn(Position);

    world.relate(child1, ChildOf, parent);
    world.relate(child2, ChildOf, parent);

    const count = world.despawnChildren(parent, ChildOf);

    expect(count).toBe(2);
    expect(world.isAlive(parent)).toBe(true);
    expect(world.isAlive(child1)).toBe(false);
    expect(world.isAlive(child2)).toBe(false);
  });
});

describe("Built-in Relations", () => {
  it("ChildOf should be exclusive", () => {
    expect(ChildOf.exclusive).toBe(true);
  });

  it("ChildOf should cascade delete", () => {
    expect(ChildOf.cascadeDelete).toBe(true);
  });

  it("Contains should not be exclusive", () => {
    expect(Contains.exclusive).toBe(false);
  });

  it("Contains should not cascade delete", () => {
    expect(Contains.cascadeDelete).toBe(false);
  });

  it("Targets should be exclusive", () => {
    expect(Targets.exclusive).toBe(true);
  });

  it("Targets should not cascade delete", () => {
    expect(Targets.cascadeDelete).toBe(false);
  });
});

describe("Performance", () => {
  it("should handle many relations efficiently", () => {
    const world = new World(100_000);
    const NonExclusive = defineRelation("ManyRel");

    const root = world.spawn(Position);
    const entities: Entity[] = [];

    // Create 10k entities
    for (let i = 0; i < 10_000; i++) {
      entities.push(world.spawn(Position));
    }

    // Add relations
    const start = performance.now();
    for (const entity of entities) {
      world.relate(root, NonExclusive, entity);
    }
    const addTime = performance.now() - start;

    console.log(`  Add 10k relations: ${addTime.toFixed(2)}ms`);

    // Query targets
    const queryStart = performance.now();
    const targets = world.getTargets(root, NonExclusive);
    const queryTime = performance.now() - queryStart;

    console.log(`  Query 10k targets: ${queryTime.toFixed(2)}ms`);

    expect(targets).toHaveLength(10_000);
    expect(addTime).toBeLessThan(100); // Should be fast
    expect(queryTime).toBeLessThan(10); // O(1) lookup + O(n) iteration
  });

  it("should handle reverse lookups efficiently", () => {
    const world = new World(100_000);

    const parent = world.spawn(Position);
    const children: Entity[] = [];

    // Create 10k children
    for (let i = 0; i < 10_000; i++) {
      const child = world.spawn(Position);
      children.push(child);
      world.relate(child, ChildOf, parent);
    }

    // Query children (reverse lookup)
    const start = performance.now();
    const result = world.getSources(parent, ChildOf);
    const time = performance.now() - start;

    console.log(`  Reverse lookup 10k children: ${time.toFixed(2)}ms`);

    expect(result).toHaveLength(10_000);
    expect(time).toBeLessThan(10);
  });
});
