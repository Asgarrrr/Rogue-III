/**
 * Roguelike Components Tests
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { World } from "../../../src/game/ecs";
import {
  registerGameComponents,
  registerGameResources,
  // Components
  PositionSchema,
  HealthSchema,
  TurnEnergySchema,
  AISchema,
  PlayerSchema,
  FOVSchema,
  InventorySchema,
  RenderableSchema,
  // Types
  type PositionData,
  type HealthData,
  type TurnEnergyData,
  type AIData,
  type InventoryData,
  type RenderableData,
  Layer,
  ENERGY_THRESHOLD,
  // Resources
  TurnStateManager,
  GameMap,
  TileType,
  TileFlags,
  // Utils
  packCoords,
  unpackCoords,
} from "../../../src/game/ecs/game";

describe("Game Components", () => {
  let world: World;

  beforeEach(() => {
    world = new World();
    registerGameComponents(world);
  });

  describe("Position Component", () => {
    it("should store grid position with layer", () => {
      const entity = world.spawn();
      world.addComponent(entity, "Position", {
        x: 10,
        y: 20,
        layer: Layer.CREATURE,
      });

      const pos = world.getComponent<PositionData>(entity, "Position");

      expect(pos?.x).toBe(10);
      expect(pos?.y).toBe(20);
      expect(pos?.layer).toBe(Layer.CREATURE);
    });

    it("should support all layer types", () => {
      const floor = world.spawn();
      const item = world.spawn();
      const creature = world.spawn();

      world.addComponent(floor, "Position", { x: 0, y: 0, layer: Layer.FLOOR });
      world.addComponent(item, "Position", { x: 0, y: 0, layer: Layer.ITEM });
      world.addComponent(creature, "Position", {
        x: 0,
        y: 0,
        layer: Layer.CREATURE,
      });

      expect(world.getComponent<PositionData>(floor, "Position")?.layer).toBe(
        0,
      );
      expect(world.getComponent<PositionData>(item, "Position")?.layer).toBe(1);
      expect(
        world.getComponent<PositionData>(creature, "Position")?.layer,
      ).toBe(2);
    });
  });

  describe("Health Component", () => {
    it("should track current and max health", () => {
      const entity = world.spawn();
      world.addComponent(entity, "Health", { current: 75, max: 100 });

      const health = world.getComponent<HealthData>(entity, "Health");

      expect(health?.current).toBe(75);
      expect(health?.max).toBe(100);
    });
  });

  describe("TurnEnergy Component", () => {
    it("should track energy for turn system", () => {
      const entity = world.spawn();
      world.addComponent(entity, "TurnEnergy", {
        energy: 50,
        energyPerTurn: 100,
        speed: 120,
      });

      const energy = world.getComponent<TurnEnergyData>(entity, "TurnEnergy");

      expect(energy?.energy).toBe(50);
      expect(energy?.energyPerTurn).toBe(100);
      expect(energy?.speed).toBe(120);
    });

    it("should use correct energy threshold", () => {
      expect(ENERGY_THRESHOLD).toBe(100);
    });
  });

  describe("AI Component", () => {
    it("should track AI state and behavior", () => {
      const entity = world.spawn();
      world.addComponent(entity, "AI", {
        state: "patrol",
        target: 0,
        alertness: 75,
        homeX: 10,
        homeY: 20,
        patrolRadius: 5,
      });

      const ai = world.getComponent<AIData>(entity, "AI");

      expect(ai?.state).toBe("patrol");
      expect(ai?.alertness).toBe(75);
      expect(ai?.patrolRadius).toBe(5);
    });
  });

  describe("Player Tag", () => {
    it("should mark player entity", () => {
      const player = world.spawn();
      const monster = world.spawn();

      world.addComponent(player, "Player", {});

      expect(world.hasComponent(player, "Player")).toBe(true);
      expect(world.hasComponent(monster, "Player")).toBe(false);
    });
  });

  describe("Inventory Component", () => {
    it("should store items and capacity", () => {
      const entity = world.spawn();
      world.addComponent(entity, "Inventory", {
        items: [],
        capacity: 20,
      });

      const inv = world.getComponent<InventoryData>(entity, "Inventory");

      expect(inv?.items).toEqual([]);
      expect(inv?.capacity).toBe(20);
    });
  });

  describe("Renderable Component", () => {
    it("should store display information", () => {
      const entity = world.spawn();
      world.addComponent(entity, "Renderable", {
        glyph: "@",
        fgColor: "#ffff00",
        bgColor: "",
        zIndex: 10,
      });

      const render = world.getComponent<RenderableData>(entity, "Renderable");

      expect(render?.glyph).toBe("@");
      expect(render?.fgColor).toBe("#ffff00");
      expect(render?.zIndex).toBe(10);
    });
  });
});

describe("Game Resources", () => {
  describe("TurnStateManager", () => {
    let turnState: TurnStateManager;

    beforeEach(() => {
      turnState = new TurnStateManager();
    });

    it("should initialize with default state", () => {
      expect(turnState.getCurrentTick()).toBe(0);
      expect(turnState.getActiveEntity()).toBe(null);
      expect(turnState.getPhase()).toBe("waiting");
    });

    it("should track active entity and phase", () => {
      const entity = 1 as any;

      turnState.setActiveEntity(entity);

      expect(turnState.getActiveEntity()).toBe(entity);
      expect(turnState.getPhase()).toBe("acting");
    });

    it("should increment tick", () => {
      turnState.incrementTick();
      turnState.incrementTick();

      expect(turnState.getCurrentTick()).toBe(2);
    });

    it("should queue and clear actions", () => {
      turnState.queueAction({
        entity: 1 as any,
        type: "move",
        data: {},
        priority: 1,
      });
      turnState.queueAction({
        entity: 2 as any,
        type: "attack",
        data: {},
        priority: 2,
      });

      const queue = turnState.clearActionQueue();

      expect(queue).toHaveLength(2);
      expect(queue[0].type).toBe("attack"); // Higher priority first
      expect(turnState.getState().actionQueue).toHaveLength(0);
    });
  });

  describe("GameMap", () => {
    let gameMap: GameMap;

    beforeEach(() => {
      gameMap = new GameMap(80, 50);
    });

    it("should initialize with walls", () => {
      expect(gameMap.getTile(0, 0)).toBe(TileType.Wall);
      expect(gameMap.isWalkable(0, 0)).toBe(false);
    });

    it("should carve rooms", () => {
      gameMap.carveRoom(5, 5, 10, 10);

      expect(gameMap.getTile(5, 5)).toBe(TileType.Floor);
      expect(gameMap.isWalkable(5, 5)).toBe(true);
      expect(gameMap.isTransparent(5, 5)).toBe(true);
    });

    it("should track entities by position", () => {
      const entity = 1 as any;

      gameMap.addEntity(10, 20, entity);

      expect(gameMap.hasEntities(10, 20)).toBe(true);
      expect(gameMap.getEntitiesAt(10, 20).has(entity)).toBe(true);
    });

    it("should move entities", () => {
      const entity = 1 as any;

      gameMap.addEntity(10, 20, entity);
      gameMap.moveEntity(entity, 10, 20, 15, 25);

      expect(gameMap.hasEntities(10, 20)).toBe(false);
      expect(gameMap.hasEntities(15, 25)).toBe(true);
    });

    it("should track visibility", () => {
      gameMap.setVisible(10, 10, true);
      gameMap.explore(10, 10);

      expect(gameMap.isVisible(10, 10)).toBe(true);
      expect(gameMap.isExplored(10, 10)).toBe(true);

      gameMap.clearVisibility();

      expect(gameMap.isVisible(10, 10)).toBe(false);
      expect(gameMap.isExplored(10, 10)).toBe(true); // Still explored
    });

    it("should check bounds", () => {
      expect(gameMap.isInBounds(0, 0)).toBe(true);
      expect(gameMap.isInBounds(79, 49)).toBe(true);
      expect(gameMap.isInBounds(-1, 0)).toBe(false);
      expect(gameMap.isInBounds(80, 0)).toBe(false);
    });
  });

  describe("Coordinate Packing", () => {
    it("should pack and unpack positive coordinates", () => {
      const packed = packCoords(100, 200);
      const unpacked = unpackCoords(packed);

      expect(unpacked.x).toBe(100);
      expect(unpacked.y).toBe(200);
    });

    it("should pack and unpack negative coordinates", () => {
      const packed = packCoords(-50, -100);
      const unpacked = unpackCoords(packed);

      expect(unpacked.x).toBe(-50);
      expect(unpacked.y).toBe(-100);
    });

    it("should handle mixed coordinates", () => {
      const packed = packCoords(-10, 20);
      const unpacked = unpackCoords(packed);

      expect(unpacked.x).toBe(-10);
      expect(unpacked.y).toBe(20);
    });
  });
});

describe("Game Integration", () => {
  it("should register all components with world", () => {
    const world = new World();
    registerGameComponents(world);

    // Check a sampling of components are registered
    expect(world.components.hasComponent("Position")).toBe(true);
    expect(world.components.hasComponent("Health")).toBe(true);
    expect(world.components.hasComponent("TurnEnergy")).toBe(true);
    expect(world.components.hasComponent("AI")).toBe(true);
    expect(world.components.hasComponent("Player")).toBe(true);
    expect(world.components.hasComponent("Inventory")).toBe(true);
    expect(world.components.hasComponent("FOV")).toBe(true);
    expect(world.components.hasComponent("Renderable")).toBe(true);
  });

  it("should register resources with world", () => {
    const world = new World();
    registerGameComponents(world);
    const { turnState, gameMap } = registerGameResources(world);

    expect(world.resources.get("turnState")).toBe(turnState);
    expect(world.resources.get("gameMap")).toBe(gameMap);
  });

  it("should create a complete entity", () => {
    const world = new World();
    registerGameComponents(world);
    registerGameResources(world);

    const player = world.spawn();
    world.addComponent(player, "Position", {
      x: 40,
      y: 25,
      layer: Layer.CREATURE,
    });
    world.addComponent(player, "Health", { current: 100, max: 100 });
    world.addComponent(player, "TurnEnergy", {
      energy: 0,
      energyPerTurn: 100,
      speed: 100,
    });
    world.addComponent(player, "Player", {});
    world.addComponent(player, "Renderable", {
      glyph: "@",
      fgColor: "#ffff00",
      bgColor: "",
      zIndex: 0,
    });
    world.addComponent(player, "FOV", { radius: 8, dirty: true });
    world.addComponent(player, "Inventory", { items: [], capacity: 20 });

    expect(world.hasComponent(player, "Position")).toBe(true);
    expect(world.hasComponent(player, "Health")).toBe(true);
    expect(world.hasComponent(player, "TurnEnergy")).toBe(true);
    expect(world.hasComponent(player, "Player")).toBe(true);
  });
});
