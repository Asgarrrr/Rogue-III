/**
 * Game Templates Tests
 *
 * Tests for entity templates.
 */

import { beforeEach, describe, expect, it } from "bun:test";
import {
  type EntityTemplateRegistry,
  EventQueue,
  World,
} from "../../../src/game/ecs";
import {
  ALL_GAME_TEMPLATES,
  AttackRequestSchema,
  // Systems
  BlockingSchema,
  createGameTemplateRegistry,
  DoorTemplate,
  type HealthData,
  HealthPotionTemplate,
  OrcTemplate,
  // Templates
  PlayerTemplate,
  // Types
  type PositionData,
  RatTemplate,
  type RenderableData,
  registerGameComponents,
  registerGameResources,
  SpikeTrapTemplate,
  StairsDownTemplate,
  SwordTemplate,
  setupGameTemplates,
  TrollTemplate,
  type TurnEnergyData,
} from "../../../src/game/ecs/game";

describe("Game Templates", () => {
  let world: World;
  let registry: EntityTemplateRegistry;

  beforeEach(() => {
    world = new World();
    registerGameComponents(world);
    world.registerComponent(BlockingSchema);
    world.registerComponent(AttackRequestSchema);

    const eventQueue = new EventQueue();
    world.resources.register("eventQueue", eventQueue);
    registerGameResources(world, 80, 50);

    registry = createGameTemplateRegistry();
  });

  describe("Actor Templates", () => {
    it("should instantiate player template", () => {
      const player = registry.instantiate(world, "player", {
        Position: { x: 10, y: 20, layer: 2 },
      });

      expect(world.hasComponent(player, "Player")).toBe(true);
      expect(world.hasComponent(player, "Position")).toBe(true);
      expect(world.hasComponent(player, "Health")).toBe(true);
      expect(world.hasComponent(player, "TurnEnergy")).toBe(true);
      expect(world.hasComponent(player, "FOV")).toBe(true);

      const pos = world.getComponent<PositionData>(player, "Position");
      expect(pos?.x).toBe(10);
      expect(pos?.y).toBe(20);

      const health = world.getComponent<HealthData>(player, "Health");
      expect(health?.current).toBe(100);
      expect(health?.max).toBe(100);
    });

    it("should instantiate orc template with inheritance", () => {
      const orc = registry.instantiate(world, "orc");

      expect(world.hasComponent(orc, "AI")).toBe(true);
      expect(world.hasComponent(orc, "Blocking")).toBe(true);

      const renderable = world.getComponent<RenderableData>(orc, "Renderable");
      expect(renderable?.glyph).toBe("o");
      expect(renderable?.fgColor).toBe("#00ff00");

      const health = world.getComponent<HealthData>(orc, "Health");
      expect(health?.current).toBe(30);
    });

    it("should have different stats for different enemies", () => {
      const rat = registry.instantiate(world, "rat");
      const troll = registry.instantiate(world, "troll");

      const ratHealth = world.getComponent<HealthData>(rat, "Health");
      const trollHealth = world.getComponent<HealthData>(troll, "Health");

      expect(ratHealth?.current).toBe(5);
      expect(trollHealth?.current).toBe(80);

      const ratEnergy = world.getComponent<TurnEnergyData>(rat, "TurnEnergy");
      const trollEnergy = world.getComponent<TurnEnergyData>(
        troll,
        "TurnEnergy",
      );

      expect(ratEnergy?.speed).toBe(120); // Fast
      expect(trollEnergy?.speed).toBe(60); // Slow
    });
  });

  describe("Item Templates", () => {
    it("should instantiate health potion", () => {
      const potion = registry.instantiate(world, "potion_health", {
        Position: { x: 5, y: 5, layer: 1 },
      });

      expect(world.hasComponent(potion, "Item")).toBe(true);
      expect(world.hasComponent(potion, "Consumable")).toBe(true);

      const renderable = world.getComponent<RenderableData>(
        potion,
        "Renderable",
      );
      expect(renderable?.glyph).toBe("!");
      expect(renderable?.fgColor).toBe("#ff0000");
    });

    it("should instantiate weapon", () => {
      const sword = registry.instantiate(world, "weapon_sword");

      expect(world.hasComponent(sword, "Item")).toBe(true);
      expect(world.hasComponent(sword, "Weapon")).toBe(true);

      const renderable = world.getComponent<RenderableData>(
        sword,
        "Renderable",
      );
      expect(renderable?.glyph).toBe("/");
    });
  });

  describe("Environment Templates", () => {
    it("should instantiate door template", () => {
      const door = registry.instantiate(world, "door", {
        Position: { x: 15, y: 10, layer: 1 },
      });

      expect(world.hasComponent(door, "Door")).toBe(true);
      expect(world.hasComponent(door, "Interactable")).toBe(true);
      expect(world.hasComponent(door, "Blocking")).toBe(true);

      const renderable = world.getComponent<RenderableData>(door, "Renderable");
      expect(renderable?.glyph).toBe("+");
    });

    it("should instantiate stairs template", () => {
      const stairs = registry.instantiate(world, "stairs_down");

      expect(world.hasComponent(stairs, "Stairs")).toBe(true);
      expect(world.hasComponent(stairs, "Interactable")).toBe(true);

      const renderable = world.getComponent<RenderableData>(
        stairs,
        "Renderable",
      );
      expect(renderable?.glyph).toBe(">");
    });

    it("should instantiate trap template", () => {
      const trap = registry.instantiate(world, "trap_spike");

      expect(world.hasComponent(trap, "Trap")).toBe(true);

      const renderable = world.getComponent<RenderableData>(trap, "Renderable");
      expect(renderable?.glyph).toBe("^");
    });
  });

  describe("Template Registry", () => {
    it("should register all game templates", () => {
      expect(ALL_GAME_TEMPLATES.length).toBeGreaterThan(20);
    });

    it("should find templates by tag", () => {
      const enemies = registry.getByTag("enemy");
      expect(enemies.length).toBeGreaterThan(0);

      const consumables = registry.getByTag("consumable");
      expect(consumables.length).toBeGreaterThan(0);

      const environment = registry.getByTag("environment");
      expect(environment.length).toBeGreaterThan(0);
    });

    it("should setup templates with world", () => {
      const newWorld = new World();
      registerGameComponents(newWorld);
      newWorld.registerComponent(BlockingSchema);
      newWorld.registerComponent(AttackRequestSchema);

      const newRegistry = setupGameTemplates(newWorld);

      expect(newWorld.resources.get<EntityTemplateRegistry>("templates")).toBe(
        newRegistry,
      );

      // Should be able to instantiate
      const entity = newRegistry.instantiate(newWorld, "player");
      expect(newWorld.hasComponent(entity, "Player")).toBe(true);
    });
  });

  describe("Batch Instantiation", () => {
    it("should spawn multiple enemies", () => {
      const positions = [
        { x: 10, y: 10 },
        { x: 20, y: 15 },
        { x: 30, y: 20 },
      ];

      const orcs = registry.instantiateBatch(
        world,
        "orc",
        positions.length,
        (index) => ({
          Position: { x: positions[index].x, y: positions[index].y, layer: 2 },
        }),
      );

      expect(orcs.length).toBe(3);

      for (let i = 0; i < orcs.length; i++) {
        const pos = world.getComponent<PositionData>(orcs[i], "Position");
        expect(pos?.x).toBe(positions[i].x);
        expect(pos?.y).toBe(positions[i].y);
      }
    });
  });
});
