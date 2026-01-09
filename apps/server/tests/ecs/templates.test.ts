/**
 * Entity Template Tests
 */

import { describe, it, expect, beforeEach } from "bun:test";
import {
  World,
  ComponentSchema,
  ComponentType,
  EntityTemplateRegistry,
  defineTemplate,
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

interface NameData {
  name: string;
}

const PositionSchema = ComponentSchema.define<Position>("Position")
  .field("x", ComponentType.F32, 0)
  .field("y", ComponentType.F32, 0)
  .build();

const HealthSchema = ComponentSchema.define<Health>("Health")
  .field("current", ComponentType.I32, 100)
  .field("max", ComponentType.I32, 100)
  .build();

const NameComponentSchema = ComponentSchema.define<NameData>("NameComponent")
  .field("name", ComponentType.String, "")
  .useAoS()
  .build();

describe("EntityTemplates", () => {
  let world: World;
  let templates: EntityTemplateRegistry;

  beforeEach(() => {
    world = new World();
    world.registerComponent(PositionSchema);
    world.registerComponent(HealthSchema);
    world.registerComponent(NameComponentSchema);
    world.registerComponent(TemplateIdSchema);
    templates = new EntityTemplateRegistry();
  });

  describe("defineTemplate", () => {
    it("should create a basic template", () => {
      const template = defineTemplate("goblin")
        .with("Position", { x: 0, y: 0 })
        .with("Health", { current: 50, max: 50 })
        .build();

      expect(template.id).toBe("goblin");
      expect(template.components.Position).toEqual({ x: 0, y: 0 });
      expect(template.components.Health).toEqual({ current: 50, max: 50 });
    });

    it("should support tags", () => {
      const template = defineTemplate("goblin")
        .with("Health", { current: 50, max: 50 })
        .tagged("enemy", "hostile")
        .build();

      expect(template.tags).toEqual(["enemy", "hostile"]);
    });

    it("should support inheritance declaration", () => {
      const template = defineTemplate("goblin_warrior")
        .extends("goblin")
        .with("Health", { current: 75, max: 75 })
        .build();

      expect(template.extends).toBe("goblin");
    });
  });

  describe("EntityTemplateRegistry", () => {
    it("should register and retrieve templates", () => {
      const template = defineTemplate("goblin")
        .with("Health", { current: 50, max: 50 })
        .build();

      templates.register(template);

      expect(templates.has("goblin")).toBe(true);
      expect(templates.get("goblin")).toBe(template);
    });

    it("should throw on duplicate registration", () => {
      const template = defineTemplate("goblin")
        .with("Health", { current: 50, max: 50 })
        .build();

      templates.register(template);

      expect(() => templates.register(template)).toThrow();
    });

    it("should compile templates with inheritance", () => {
      const baseTemplate = defineTemplate("creature")
        .with("Position", { x: 0, y: 0 })
        .with("Health", { current: 100, max: 100 })
        .build();

      const goblinTemplate = defineTemplate("goblin")
        .extends("creature")
        .with("Health", { current: 50, max: 50 })
        .build();

      templates.register(baseTemplate);
      templates.register(goblinTemplate);

      const compiled = templates.compile("goblin");

      expect(compiled.Position).toEqual({ x: 0, y: 0 }); // Inherited
      expect(compiled.Health).toEqual({ current: 50, max: 50 }); // Overridden
    });

    it("should index templates by tag", () => {
      templates.register(
        defineTemplate("goblin")
          .tagged("enemy")
          .with("Health", { current: 50, max: 50 })
          .build(),
      );

      templates.register(
        defineTemplate("orc")
          .tagged("enemy")
          .with("Health", { current: 100, max: 100 })
          .build(),
      );

      templates.register(
        defineTemplate("player")
          .tagged("player")
          .with("Health", { current: 150, max: 150 })
          .build(),
      );

      const enemies = templates.getByTag("enemy");
      expect(enemies).toHaveLength(2);
      expect(enemies).toContain("goblin");
      expect(enemies).toContain("orc");
    });
  });

  describe("instantiate", () => {
    it("should create an entity from a template", () => {
      templates.register(
        defineTemplate("goblin")
          .with("Position", { x: 10, y: 20 })
          .with("Health", { current: 50, max: 50 })
          .build(),
      );

      const entity = templates.instantiate(world, "goblin");

      expect(world.entities.isAlive(entity)).toBe(true);
      expect(world.getComponent<Position>(entity, "Position")).toEqual({
        x: 10,
        y: 20,
      });
      expect(world.getComponent<Health>(entity, "Health")).toEqual({
        current: 50,
        max: 50,
      });
    });

    it("should apply overrides when instantiating", () => {
      templates.register(
        defineTemplate("goblin")
          .with("Position", { x: 0, y: 0 })
          .with("Health", { current: 50, max: 50 })
          .build(),
      );

      const entity = templates.instantiate(world, "goblin", {
        Position: { x: 100, y: 200 },
      });

      expect(world.getComponent<Position>(entity, "Position")).toEqual({
        x: 100,
        y: 200,
      });
      expect(world.getComponent<Health>(entity, "Health")).toEqual({
        current: 50,
        max: 50,
      });
    });

    it("should add TemplateId component", () => {
      templates.register(
        defineTemplate("goblin")
          .with("Health", { current: 50, max: 50 })
          .build(),
      );

      const entity = templates.instantiate(world, "goblin");

      const templateId = world.getComponent<{ id: string }>(
        entity,
        "TemplateId",
      );
      expect(templateId?.id).toBe("goblin");
    });

    it("should instantiate batch with indexed overrides", () => {
      templates.register(
        defineTemplate("goblin").with("Position", { x: 0, y: 0 }).build(),
      );

      const entities = templates.instantiateBatch(world, "goblin", 3, (i) => ({
        Position: { x: i * 10, y: i * 10 },
      }));

      expect(entities).toHaveLength(3);
      expect(world.getComponent<Position>(entities[0], "Position")).toEqual({
        x: 0,
        y: 0,
      });
      expect(world.getComponent<Position>(entities[1], "Position")).toEqual({
        x: 10,
        y: 10,
      });
      expect(world.getComponent<Position>(entities[2], "Position")).toEqual({
        x: 20,
        y: 20,
      });
    });
  });
});
