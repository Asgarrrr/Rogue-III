import { describe, it, expect, beforeEach } from "bun:test";
import {
  MigrationRegistry,
  WorldSerializer,
  addFieldMigration,
  removeFieldMigration,
  renameFieldMigration,
  renameComponentMigration,
  type WorldSnapshot,
  SNAPSHOT_VERSION,
} from "@rogue/ecs";

describe("Migration Framework", () => {
  describe("MigrationRegistry", () => {
    let registry: MigrationRegistry;

    beforeEach(() => {
      registry = new MigrationRegistry();
    });

    it("registers a migration", () => {
      registry.register({
        fromVersion: "1.0.0",
        toVersion: "1.1.0",
        migrate: (s) => s,
      });

      expect(registry.count).toBe(1);
      expect(registry.canMigrate("1.0.0", "1.1.0")).toBe(true);
    });

    it("builds migration path", () => {
      registry.register({
        fromVersion: "1.0.0",
        toVersion: "1.1.0",
        migrate: (s) => s,
      });
      registry.register({
        fromVersion: "1.1.0",
        toVersion: "1.2.0",
        migrate: (s) => s,
      });

      const path = registry.getMigrationPath("1.0.0", "1.2.0");
      expect(path.length).toBe(2);
      expect(path[0].fromVersion).toBe("1.0.0");
      expect(path[1].fromVersion).toBe("1.1.0");
    });

    it("throws if no migration path exists", () => {
      registry.register({
        fromVersion: "1.0.0",
        toVersion: "1.1.0",
        migrate: (s) => s,
      });

      expect(() => registry.getMigrationPath("1.0.0", "2.0.0")).toThrow(
        /No migration path/,
      );
    });

    it("applies migrations in sequence", () => {
      registry.register({
        fromVersion: "1.0.0",
        toVersion: "1.1.0",
        migrate: (s) => ({
          ...s,
          entities: s.entities.map((e) => ({
            ...e,
            components: {
              ...e.components,
              Position: { ...e.components.Position, z: 0 },
            },
          })),
        }),
      });

      const oldSnapshot: WorldSnapshot = {
        version: "1.0.0",
        tick: 0,
        entities: [{ id: 1, components: { Position: { x: 10, y: 20 } } }],
        resources: {},
      };

      const migrated = registry.migrate(oldSnapshot, "1.1.0");

      expect(migrated.version).toBe("1.1.0");
      expect(migrated.entities[0].components.Position.z).toBe(0);
    });
  });

  describe("Migration helpers", () => {
    it("addFieldMigration adds field with default value", () => {
      const registry = new MigrationRegistry();
      registry.register(
        addFieldMigration("1.0.0", "1.1.0", "Position", "z", 0),
      );

      const snapshot: WorldSnapshot = {
        version: "1.0.0",
        tick: 0,
        entities: [{ id: 1, components: { Position: { x: 1, y: 2 } } }],
        resources: {},
      };

      const migrated = registry.migrate(snapshot, "1.1.0");
      expect(migrated.entities[0].components.Position.z).toBe(0);
    });

    it("removeFieldMigration removes field", () => {
      const registry = new MigrationRegistry();
      registry.register(
        removeFieldMigration("1.0.0", "1.1.0", "Position", "z"),
      );

      const snapshot: WorldSnapshot = {
        version: "1.0.0",
        tick: 0,
        entities: [{ id: 1, components: { Position: { x: 1, y: 2, z: 3 } } }],
        resources: {},
      };

      const migrated = registry.migrate(snapshot, "1.1.0");
      expect(migrated.entities[0].components.Position.z).toBeUndefined();
    });

    it("renameFieldMigration renames field", () => {
      const registry = new MigrationRegistry();
      registry.register(
        renameFieldMigration("1.0.0", "1.1.0", "Position", "posX", "x"),
      );

      const snapshot: WorldSnapshot = {
        version: "1.0.0",
        tick: 0,
        entities: [{ id: 1, components: { Position: { posX: 10, y: 20 } } }],
        resources: {},
      };

      const migrated = registry.migrate(snapshot, "1.1.0");
      expect(migrated.entities[0].components.Position.x).toBe(10);
      expect(migrated.entities[0].components.Position.posX).toBeUndefined();
    });

    it("renameComponentMigration renames component", () => {
      const registry = new MigrationRegistry();
      registry.register(
        renameComponentMigration("1.0.0", "1.1.0", "Pos", "Position"),
      );

      const snapshot: WorldSnapshot = {
        version: "1.0.0",
        tick: 0,
        entities: [{ id: 1, components: { Pos: { x: 1, y: 2 } } }],
        resources: {},
      };

      const migrated = registry.migrate(snapshot, "1.1.0");
      expect(migrated.entities[0].components.Position).toEqual({ x: 1, y: 2 });
      expect(migrated.entities[0].components.Pos).toBeUndefined();
    });
  });

  describe("WorldSerializer with migrations", () => {
    it("deserializes with automatic migration", () => {
      const registry = new MigrationRegistry();
      registry.register({
        fromVersion: "0.9.0",
        toVersion: SNAPSHOT_VERSION,
        migrate: (s) => s,
      });

      const serializer = new WorldSerializer({ migrations: registry });

      const oldSnapshot: WorldSnapshot = {
        version: "0.9.0",
        tick: 5,
        entities: [],
        resources: {},
      };

      expect(serializer.canDeserialize(oldSnapshot)).toBe(true);
      const world = serializer.deserialize(oldSnapshot);
      expect(world).toBeDefined();
    });

    it("throws if no migration path exists", () => {
      const serializer = new WorldSerializer();

      const oldSnapshot: WorldSnapshot = {
        version: "0.5.0",
        tick: 0,
        entities: [],
        resources: {},
      };

      expect(() => serializer.deserialize(oldSnapshot)).toThrow(
        /No migration path/,
      );
    });
  });
});
