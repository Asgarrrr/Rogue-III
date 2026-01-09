import { describe, it, expect, beforeEach } from "bun:test";
import {
  World,
  component,
  f32,
  u32,
  str,
  StringPool,
  getStringPool,
  type Entity,
} from "../../src/game/ecs-v2";

// Test components with string fields
@component
class Item {
  name = str("Unknown");
  description = str("");
  value = u32(0);
}

@component
class Character {
  name = str("Unnamed");
  title = str("");
  level = u32(1);
}

@component
class Position {
  x = f32(0);
  y = f32(0);
}

describe("String Fields", () => {
  let world: World;

  beforeEach(() => {
    world = new World();
  });

  describe("Basic Operations", () => {
    it("should create component with default string value", () => {
      const entity = world.spawn(Item);

      const name = world.getString(entity, Item, "name");
      expect(name).toBe("Unknown");

      const description = world.getString(entity, Item, "description");
      expect(description).toBe("");
    });

    it("should set and get string values", () => {
      const entity = world.spawn(Item);

      world.setString(entity, Item, "name", "Sword of Destiny");
      world.setString(entity, Item, "description", "A legendary blade");

      expect(world.getString(entity, Item, "name")).toBe("Sword of Destiny");
      expect(world.getString(entity, Item, "description")).toBe(
        "A legendary blade",
      );
    });

    it("should handle multiple entities with different strings", () => {
      const sword = world.spawn(Item);
      const shield = world.spawn(Item);
      const potion = world.spawn(Item);

      world.setString(sword, Item, "name", "Iron Sword");
      world.setString(shield, Item, "name", "Wooden Shield");
      world.setString(potion, Item, "name", "Health Potion");

      expect(world.getString(sword, Item, "name")).toBe("Iron Sword");
      expect(world.getString(shield, Item, "name")).toBe("Wooden Shield");
      expect(world.getString(potion, Item, "name")).toBe("Health Potion");
    });

    it("should return null for non-existent entity", () => {
      const entity = world.spawn(Item);
      world.despawn(entity);

      expect(world.getString(entity, Item, "name")).toBeNull();
    });

    it("should return null for entity without component", () => {
      const entity = world.spawn(Position);

      expect(world.getString(entity, Item, "name")).toBeNull();
    });

    it("should return false when setting string on dead entity", () => {
      const entity = world.spawn(Item);
      world.despawn(entity);

      const result = world.setString(entity, Item, "name", "Test");
      expect(result).toBe(false);
    });
  });

  describe("String Interning", () => {
    it("should intern identical strings", () => {
      const pool = world.strings;
      const initialSize = pool.size;

      const e1 = world.spawn(Item);
      const e2 = world.spawn(Item);
      const e3 = world.spawn(Item);

      world.setString(e1, Item, "name", "Shared Name");
      world.setString(e2, Item, "name", "Shared Name");
      world.setString(e3, Item, "name", "Shared Name");

      // Only one new string should be added (plus defaults from component)
      expect(pool.size).toBe(initialSize + 1);

      // All entities should have the same string
      expect(world.getString(e1, Item, "name")).toBe("Shared Name");
      expect(world.getString(e2, Item, "name")).toBe("Shared Name");
      expect(world.getString(e3, Item, "name")).toBe("Shared Name");
    });

    it("should handle empty strings correctly", () => {
      const entity = world.spawn(Item);

      world.setString(entity, Item, "name", "");
      expect(world.getString(entity, Item, "name")).toBe("");
    });

    it("should handle special characters", () => {
      const entity = world.spawn(Item);

      world.setString(entity, Item, "name", "Sword +1");
      world.setString(
        entity,
        Item,
        "description",
        "A sword with symbols: @#$%^&*()",
      );

      expect(world.getString(entity, Item, "name")).toBe("Sword +1");
      expect(world.getString(entity, Item, "description")).toBe(
        "A sword with symbols: @#$%^&*()",
      );
    });

    it("should handle unicode strings", () => {
      const entity = world.spawn(Character);

      world.setString(entity, Character, "name", "Gandalf le Gris");
      world.setString(entity, Character, "title", "Le Magicien");

      expect(world.getString(entity, Character, "name")).toBe("Gandalf le Gris");
      expect(world.getString(entity, Character, "title")).toBe("Le Magicien");
    });
  });

  describe("StringPool", () => {
    it("should intern strings", () => {
      const pool = new StringPool();

      const idx1 = pool.intern("hello");
      const idx2 = pool.intern("world");
      const idx3 = pool.intern("hello"); // Same as idx1

      expect(idx1).toBe(idx3);
      expect(idx1).not.toBe(idx2);

      expect(pool.get(idx1)).toBe("hello");
      expect(pool.get(idx2)).toBe("world");
    });

    it("should have empty string at index 0", () => {
      const pool = new StringPool();

      expect(pool.get(0)).toBe("");
      expect(pool.intern("")).toBe(0);
    });

    it("should check if string is interned", () => {
      const pool = new StringPool();

      expect(pool.has("test")).toBe(false);
      pool.intern("test");
      expect(pool.has("test")).toBe(true);
    });

    it("should export and import strings", () => {
      const pool1 = new StringPool();
      pool1.intern("apple");
      pool1.intern("banana");
      pool1.intern("cherry");

      const exported = pool1.export();
      expect(exported).toEqual(["apple", "banana", "cherry"]);

      const pool2 = new StringPool();
      const mapping = pool2.import(exported);

      expect(pool2.get(mapping.get(1)!)).toBe("apple");
      expect(pool2.get(mapping.get(2)!)).toBe("banana");
      expect(pool2.get(mapping.get(3)!)).toBe("cherry");
    });

    it("should provide statistics", () => {
      const pool = new StringPool();
      pool.intern("hello");
      pool.intern("world");

      const stats = pool.getStats();
      expect(stats.stringCount).toBe(3); // empty + hello + world
      expect(stats.totalCharacters).toBe(10); // "hello" + "world"
    });
  });

  describe("Mixed Fields", () => {
    it("should work with components having both string and numeric fields", () => {
      const entity = world.spawn(Item);

      world.setString(entity, Item, "name", "Gold Coin");
      world.set(entity, Item, { value: 100 });

      expect(world.getString(entity, Item, "name")).toBe("Gold Coin");

      const data = world.get(entity, Item);
      expect(data?.value).toBe(100);
    });

    it("should maintain string indices in component data", () => {
      const entity = world.spawn(Item);

      world.setString(entity, Item, "name", "Test Item");

      // The raw component data should have numeric indices
      const data = world.get(entity, Item);
      expect(typeof data?.name).toBe("number"); // Should be string index
    });
  });
});

describe("String Fields Performance", () => {
  it("should handle many string operations efficiently", () => {
    const world = new World(10_000);
    const entities: Entity[] = [];

    const start = performance.now();

    // Create 1000 entities with string fields
    for (let i = 0; i < 1000; i++) {
      const entity = world.spawn(Item);
      world.setString(entity, Item, "name", `Item ${i}`);
      world.setString(entity, Item, "description", `Description for item ${i}`);
      entities.push(entity);
    }

    const createTime = performance.now() - start;
    console.log(`  Create 1000 entities with strings: ${createTime.toFixed(2)}ms`);

    // Read all strings
    const readStart = performance.now();
    for (const entity of entities) {
      world.getString(entity, Item, "name");
      world.getString(entity, Item, "description");
    }
    const readTime = performance.now() - readStart;
    console.log(`  Read 2000 string fields: ${readTime.toFixed(2)}ms`);

    expect(createTime).toBeLessThan(100);
    expect(readTime).toBeLessThan(50);
  });

  it("should benefit from string interning", () => {
    const world = new World(10_000);
    const pool = world.strings;
    const initialSize = pool.size;

    // Create 1000 entities all with the same strings
    for (let i = 0; i < 1000; i++) {
      const entity = world.spawn(Item);
      world.setString(entity, Item, "name", "Common Item");
      world.setString(entity, Item, "description", "A very common item");
    }

    // Should only have added 2 unique strings (plus defaults)
    const uniqueStringsAdded = pool.size - initialSize;
    expect(uniqueStringsAdded).toBeLessThanOrEqual(2);

    console.log(
      `  1000 entities, only ${uniqueStringsAdded} unique strings in pool`,
    );
  });
});
