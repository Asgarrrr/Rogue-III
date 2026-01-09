/**
 * Serialization Tests
 */

import { describe, it, expect, beforeEach } from "bun:test";
import {
  World,
  ComponentSchema,
  ComponentType,
  EntityTemplateRegistry,
  defineTemplate,
  WorldSerializer,
  saveWorldToJson,
  loadWorldFromJson,
  TemplateIdSchema,
} from "../../src/game/ecs";

interface Position {
  x: number;
  y: number;
}

interface Health {
  current: number;
  max: number;
}

interface Inventory {
  items: string[];
}

const PositionSchema = ComponentSchema.define<Position>("Position")
  .field("x", ComponentType.F32, 0)
  .field("y", ComponentType.F32, 0)
  .build();

const HealthSchema = ComponentSchema.define<Health>("Health")
  .field("current", ComponentType.I32, 100)
  .field("max", ComponentType.I32, 100)
  .build();

const InventorySchema = ComponentSchema.define<Inventory>("Inventory")
  .field("items", ComponentType.Object, () => [])
  .useAoS()
  .build();

describe("Serialization", () => {
  let world: World;
  let serializer: WorldSerializer;

  beforeEach(() => {
    world = new World();
    world.registerComponent(PositionSchema);
    world.registerComponent(HealthSchema);
    world.registerComponent(InventorySchema);
    world.registerComponent(TemplateIdSchema);
    serializer = new WorldSerializer();
  });

  describe("WorldSerializer", () => {
    it("should serialize empty world", () => {
      const snapshot = serializer.serialize(world);

      expect(snapshot.version).toBe("1.0");
      expect(snapshot.entities).toHaveLength(0);
      expect(snapshot.tick).toBe(0);
    });

    it("should serialize entities with components", () => {
      const entity = world.spawn();
      world.addComponent(entity, "Position", { x: 10, y: 20 });
      world.addComponent(entity, "Health", { current: 50, max: 100 });

      const snapshot = serializer.serialize(world);

      expect(snapshot.entities).toHaveLength(1);
      expect(snapshot.entities[0].components.Position).toEqual({
        x: 10,
        y: 20,
      });
      expect(snapshot.entities[0].components.Health).toEqual({
        current: 50,
        max: 100,
      });
    });

    it("should serialize complex objects", () => {
      const entity = world.spawn();
      world.addComponent(entity, "Inventory", { items: ["sword", "potion"] });

      const snapshot = serializer.serialize(world);

      expect(snapshot.entities[0].components.Inventory).toEqual({
        items: ["sword", "potion"],
      });
    });

    it("should include metadata", () => {
      const snapshot = serializer.serialize(world, {
        saveName: "test-save",
        playTime: 3600,
      });

      expect(snapshot.metadata).toEqual({
        saveName: "test-save",
        playTime: 3600,
      });
    });

    it("should exclude specified components", () => {
      const serializer = new WorldSerializer(undefined, {
        excludeComponents: ["Health"],
      });

      const entity = world.spawn();
      world.addComponent(entity, "Position", { x: 10, y: 20 });
      world.addComponent(entity, "Health", { current: 50, max: 100 });

      const snapshot = serializer.serialize(world);

      expect(snapshot.entities[0].components.Position).toBeDefined();
      expect(snapshot.entities[0].components.Health).toBeUndefined();
    });
  });

  describe("deserialize", () => {
    it("should restore entities from snapshot", () => {
      const entity = world.spawn();
      world.addComponent(entity, "Position", { x: 10, y: 20 });

      const snapshot = serializer.serialize(world);
      const newWorld = new World();
      newWorld.registerComponent(PositionSchema);

      const entityMap = serializer.deserialize(newWorld, snapshot);

      expect(entityMap.size).toBe(1);
      const newEntity = entityMap.get(entity as number)!;
      expect(newWorld.entities.isAlive(newEntity)).toBe(true);
      expect(newWorld.getComponent<Position>(newEntity, "Position")).toEqual({
        x: 10,
        y: 20,
      });
    });

    it("should handle complex objects", () => {
      const entity = world.spawn();
      world.addComponent(entity, "Inventory", { items: ["sword", "shield"] });

      const snapshot = serializer.serialize(world);
      const newWorld = new World();
      newWorld.registerComponent(InventorySchema);

      const entityMap = serializer.deserialize(newWorld, snapshot);
      const newEntity = entityMap.get(entity as number)!;

      const inventory = newWorld.getComponent<Inventory>(
        newEntity,
        "Inventory",
      );
      expect(inventory?.items).toEqual(["sword", "shield"]);
    });
  });

  describe("JSON roundtrip", () => {
    it("should save and load via JSON", () => {
      const entity = world.spawn();
      world.addComponent(entity, "Position", { x: 42, y: 84 });
      world.addComponent(entity, "Health", { current: 75, max: 100 });

      const json = saveWorldToJson(world, serializer);
      const newWorld = new World();
      newWorld.registerComponent(PositionSchema);
      newWorld.registerComponent(HealthSchema);

      const entityMap = loadWorldFromJson(newWorld, serializer, json);

      expect(entityMap.size).toBe(1);
      const newEntity = entityMap.get(entity as number)!;
      expect(newWorld.getComponent<Position>(newEntity, "Position")).toEqual({
        x: 42,
        y: 84,
      });
      expect(newWorld.getComponent<Health>(newEntity, "Health")).toEqual({
        current: 75,
        max: 100,
      });
    });
  });

  describe("Delta compression with templates", () => {
    it("should only save delta from template defaults", () => {
      const templates = new EntityTemplateRegistry();
      templates.register(
        defineTemplate("goblin")
          .with("Position", { x: 0, y: 0 })
          .with("Health", { current: 50, max: 50 })
          .build(),
      );

      const serializer = new WorldSerializer(templates);

      // Create entity from template
      const entity = templates.instantiate(world, "goblin", {
        Position: { x: 100, y: 200 }, // Override position
        // Health uses default
      });

      const snapshot = serializer.serialize(world);

      // Should have templateId
      expect(snapshot.entities[0].templateId).toBe("goblin");

      // Should only have Position delta (changed from default)
      expect(snapshot.entities[0].components.Position).toEqual({
        x: 100,
        y: 200,
      });

      // Health should not be in delta since it matches template
      expect(snapshot.entities[0].components.Health).toBeUndefined();
    });

    it("should restore from template with delta", () => {
      const templates = new EntityTemplateRegistry();
      templates.register(
        defineTemplate("goblin")
          .with("Position", { x: 0, y: 0 })
          .with("Health", { current: 50, max: 50 })
          .build(),
      );

      const serializer = new WorldSerializer(templates);

      // Create entity
      const entity = templates.instantiate(world, "goblin", {
        Position: { x: 100, y: 200 },
      });

      const snapshot = serializer.serialize(world);

      // Restore to new world
      const newWorld = new World();
      newWorld.registerComponent(PositionSchema);
      newWorld.registerComponent(HealthSchema);
      newWorld.registerComponent(TemplateIdSchema);

      const entityMap = serializer.deserialize(newWorld, snapshot);
      const newEntity = entityMap.get(entity as number)!;

      // Position should be restored from delta
      expect(newWorld.getComponent<Position>(newEntity, "Position")).toEqual({
        x: 100,
        y: 200,
      });

      // Health should be restored from template defaults
      expect(newWorld.getComponent<Health>(newEntity, "Health")).toEqual({
        current: 50,
        max: 50,
      });
    });
  });

  describe("Special types", () => {
    it("should serialize and deserialize Sets", () => {
      interface TagsData {
        tags: Set<string>;
      }

      const TagsSchema = ComponentSchema.define<TagsData>("Tags")
        .field("tags", ComponentType.Object, () => new Set())
        .useAoS()
        .build();

      world.registerComponent(TagsSchema);

      const entity = world.spawn();
      world.addComponent(entity, "Tags", {
        tags: new Set(["enemy", "hostile"]),
      });

      const json = saveWorldToJson(world, serializer);
      const newWorld = new World();
      newWorld.registerComponent(TagsSchema);

      const entityMap = loadWorldFromJson(newWorld, serializer, json);
      const newEntity = entityMap.get(entity as number)!;

      const tags = newWorld.getComponent<TagsData>(newEntity, "Tags");
      expect(tags?.tags).toBeInstanceOf(Set);
      expect(tags?.tags.has("enemy")).toBe(true);
      expect(tags?.tags.has("hostile")).toBe(true);
    });

    it("should serialize and deserialize Maps", () => {
      interface StatsData {
        stats: Map<string, number>;
      }

      const StatsSchema = ComponentSchema.define<StatsData>("Stats")
        .field("stats", ComponentType.Object, () => new Map())
        .useAoS()
        .build();

      world.registerComponent(StatsSchema);

      const entity = world.spawn();
      world.addComponent(entity, "Stats", {
        stats: new Map([
          ["strength", 10],
          ["dexterity", 15],
        ]),
      });

      const json = saveWorldToJson(world, serializer);
      const newWorld = new World();
      newWorld.registerComponent(StatsSchema);

      const entityMap = loadWorldFromJson(newWorld, serializer, json);
      const newEntity = entityMap.get(entity as number)!;

      const stats = newWorld.getComponent<StatsData>(newEntity, "Stats");
      expect(stats?.stats).toBeInstanceOf(Map);
      expect(stats?.stats.get("strength")).toBe(10);
      expect(stats?.stats.get("dexterity")).toBe(15);
    });
  });
});
