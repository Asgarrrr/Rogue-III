/**
 * Game Systems Tests
 *
 * Tests for Turn, Movement, FOV, AI, and Combat systems.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { World, EventQueue } from "../../../src/game/ecs";
import type { Entity } from "../../../src/game/ecs";
import {
  registerGameComponents,
  registerGameResources,
  // Components
  PositionSchema,
  VelocitySchema,
  HealthSchema,
  StatsSchema,
  TurnEnergySchema,
  ActiveTurnSchema,
  AISchema,
  PlayerSchema,
  FOVSchema,
  VisibleCellsSchema,
  // Types
  type PositionData,
  type VelocityData,
  type HealthData,
  type CombatStatsData,
  type TurnEnergyData,
  type AIData,
  type FOVData,
  type VisibleCellsData,
  ENERGY_THRESHOLD,
  CombatStatsSchema,
  // Resources
  type TurnStateManager,
  type GameMap,
  TileType,
  // Systems
  TurnManagementSystem,
  MovementSystem,
  CollisionSystem,
  FOVSystem,
  AISystem,
  CombatSystem,
  ActionResolutionSystem,
  BlockingSchema,
  AttackRequestSchema,
  FOVCalculator,
  submitAction,
  requestAttack,
  applyMoveAction,
  initializeFOVResources,
} from "../../../src/game/ecs/game";

describe("Game Systems", () => {
  let world: World;
  let turnState: TurnStateManager;
  let gameMap: GameMap;

  beforeEach(() => {
    world = new World();
    registerGameComponents(world);

    // Register system-specific components (not already in registerGameComponents)
    world.registerComponent(BlockingSchema);
    world.registerComponent(AttackRequestSchema);

    // Register event queue resource
    const eventQueue = new EventQueue();
    world.resources.register("eventQueue", eventQueue);

    const resources = registerGameResources(world, 20, 20);
    turnState = resources.turnState;
    gameMap = resources.gameMap;

    // Carve a room for testing
    gameMap.carveRoom(1, 1, 18, 18);
  });

  describe("Turn Management System", () => {
    it("should select entity with highest energy", () => {
      // Create two entities with different energy
      const slow = world.spawn();
      const fast = world.spawn();

      world.addComponent(slow, "TurnEnergy", {
        energy: 50,
        energyPerTurn: 100,
        speed: 80,
      });
      world.addComponent(fast, "TurnEnergy", {
        energy: 100,
        energyPerTurn: 100,
        speed: 100,
      });

      // Register and run system
      world.systems.register(TurnManagementSystem);
      world.initialize();
      world.tick();

      // Fast entity should be active
      const state = turnState.getState();
      expect(state.activeEntity).toBe(fast);
      expect(state.turnPhase).toBe("acting");
    });

    it("should fast-forward energy when no entity can act", () => {
      const entity = world.spawn();
      world.addComponent(entity, "TurnEnergy", {
        energy: 0,
        energyPerTurn: 50,
        speed: 100,
      });

      world.systems.register(TurnManagementSystem);
      world.initialize();
      world.tick();

      // Entity should be selected after fast-forward
      const state = turnState.getState();
      expect(state.activeEntity).toBe(entity);

      // Energy should have been fast-forwarded
      const energy = world.getComponent<TurnEnergyData>(entity, "TurnEnergy");
      expect(energy?.energy).toBeGreaterThanOrEqual(ENERGY_THRESHOLD);
    });

    it("should transition phases correctly", () => {
      const entity = world.spawn();
      world.addComponent(entity, "TurnEnergy", {
        energy: 100,
        energyPerTurn: 100,
        speed: 100,
      });

      world.systems.register(TurnManagementSystem);
      world.initialize();

      // Tick 1: Select entity -> acting
      world.tick();
      expect(turnState.getState().turnPhase).toBe("acting");

      // Submit action
      submitAction(world, entity, { type: "wait" });
      expect(turnState.getState().turnPhase).toBe("resolving");

      // Tick 2: Resolve -> waiting
      world.tick();
      expect(turnState.getState().turnPhase).toBe("waiting");
      expect(turnState.getState().activeEntity).toBe(null);
    });

    it("should consume energy after action", () => {
      const entity = world.spawn();
      world.addComponent(entity, "TurnEnergy", {
        energy: 150,
        energyPerTurn: 100,
        speed: 100,
      });

      world.systems.register(TurnManagementSystem);
      world.initialize();
      world.tick();

      submitAction(world, entity, { type: "wait" });
      world.tick();

      const energy = world.getComponent<TurnEnergyData>(entity, "TurnEnergy");
      expect(energy?.energy).toBe(50); // 150 - 100
    });
  });

  describe("Movement System", () => {
    beforeEach(() => {
      world.systems.register(CollisionSystem);
      world.systems.register(MovementSystem);
      world.initialize();
    });

    it("should apply velocity to position", () => {
      const entity = world.spawn();
      world.addComponent(entity, "Position", { x: 5, y: 5, layer: 1 });
      world.addComponent(entity, "Velocity", { x: 1, y: 0 });

      world.tick();

      const pos = world.getComponent<PositionData>(entity, "Position");
      expect(pos?.x).toBe(6);
      expect(pos?.y).toBe(5);
    });

    it("should reset velocity after movement", () => {
      const entity = world.spawn();
      world.addComponent(entity, "Position", { x: 5, y: 5, layer: 1 });
      world.addComponent(entity, "Velocity", { x: 1, y: 1 });

      world.tick();

      const vel = world.getComponent<VelocityData>(entity, "Velocity");
      expect(vel?.x).toBe(0);
      expect(vel?.y).toBe(0);
    });

    it("should block movement into walls", () => {
      const entity = world.spawn();
      world.addComponent(entity, "Position", { x: 1, y: 1, layer: 1 });
      world.addComponent(entity, "Velocity", { x: -1, y: 0 }); // Try to move into wall at (0,1)

      world.tick();

      const pos = world.getComponent<PositionData>(entity, "Position");
      expect(pos?.x).toBe(1); // Should not have moved
    });

    it("should block movement into blocking entities", () => {
      const blocker = world.spawn();
      world.addComponent(blocker, "Position", { x: 6, y: 5, layer: 1 });
      world.addComponent(blocker, "Blocking", { blocks: true });
      gameMap.addEntity(6, 5, blocker);

      const mover = world.spawn();
      world.addComponent(mover, "Position", { x: 5, y: 5, layer: 1 });
      world.addComponent(mover, "Velocity", { x: 1, y: 0 });

      world.tick();

      const pos = world.getComponent<PositionData>(mover, "Position");
      expect(pos?.x).toBe(5); // Should not have moved
    });
  });

  describe("Combat System", () => {
    beforeEach(() => {
      world.systems.register(CombatSystem);
      world.initialize();
    });

    it("should apply damage from attack", () => {
      const attacker = world.spawn();
      const target = world.spawn();

      world.addComponent(attacker, "CombatStats", {
        attack: 10,
        defense: 0,
        accuracy: 80,
        evasion: 10,
      });
      world.addComponent(target, "Health", { current: 100, max: 100 });
      world.addComponent(target, "CombatStats", {
        attack: 0,
        defense: 2,
        accuracy: 80,
        evasion: 10,
      });

      // Request attack
      world.addComponent(attacker, "AttackRequest", { target });

      world.tick();

      const health = world.getComponent<HealthData>(target, "Health");
      // Damage = attack - defense = 10 - 2 = 8 (or 16 if critical)
      expect(health?.current).toBeLessThan(100);
      expect(health?.current).toBeGreaterThanOrEqual(84); // min 8 damage, max 16 critical
    });

    it("should remove attack request after resolution", () => {
      const attacker = world.spawn();
      const target = world.spawn();

      world.addComponent(attacker, "CombatStats", {
        attack: 10,
        defense: 0,
        accuracy: 80,
        evasion: 10,
      });
      world.addComponent(target, "Health", { current: 100, max: 100 });

      world.addComponent(attacker, "AttackRequest", { target });
      world.tick();

      expect(world.hasComponent(attacker, "AttackRequest")).toBe(false);
    });

    it("should despawn target on death", () => {
      const attacker = world.spawn();
      const target = world.spawn();

      world.addComponent(attacker, "CombatStats", {
        attack: 100,
        defense: 0,
        accuracy: 80,
        evasion: 10,
      });
      world.addComponent(target, "Health", { current: 10, max: 10 });

      world.addComponent(attacker, "AttackRequest", { target });
      world.tick();

      // Target should be queued for despawn
      expect(world.hasComponent(target, "Health")).toBe(false);
    });
  });

  describe("FOV Calculator", () => {
    it("should calculate visible cells", () => {
      const calculator = new FOVCalculator(10, 5);
      const result = calculator.compute(gameMap, 10, 10, 5);

      expect(result.count).toBeGreaterThan(0);
      expect(result.cells.length).toBeGreaterThan(0);
    });

    it("should cache results for same position", () => {
      const calculator = new FOVCalculator(10, 5);

      const result1 = calculator.compute(gameMap, 10, 10, 5);
      const result2 = calculator.compute(gameMap, 10, 10, 5, {
        centerX: 10,
        centerY: 10,
        radius: 5,
        version: result1.version,
        cells: result1.cells,
        count: result1.count,
      });

      expect(result2.version).toBe(result1.version);
    });

    it("should invalidate cache", () => {
      const calculator = new FOVCalculator(10, 5);

      const result1 = calculator.compute(gameMap, 10, 10, 5);
      calculator.invalidateCache();
      const result2 = calculator.compute(gameMap, 10, 10, 5);

      expect(result2.version).toBe(result1.version + 1);
    });

    it("should block vision through walls", () => {
      // Create a wall blocking vision
      gameMap.setTile(10, 10, TileType.Wall);

      const calculator = new FOVCalculator(10, 5);
      const result = calculator.compute(gameMap, 8, 10, 5);

      // Find packed coordinate for cell behind wall
      const { packCoords } = require("../../../src/game/ecs/game");
      const behindWall = packCoords(12, 10);

      // Cell behind wall should not be visible
      let foundBehindWall = false;
      for (let i = 0; i < result.count; i++) {
        if (result.cells[i] === behindWall) {
          foundBehindWall = true;
          break;
        }
      }
      expect(foundBehindWall).toBe(false);
    });
  });

  describe("AI System", () => {
    beforeEach(() => {
      world.systems.register(TurnManagementSystem);
      world.systems.register(AISystem);
      world.initialize();
    });

    it("should transition to chase when player is near", () => {
      // Create player
      const player = world.spawn();
      world.addComponent(player, "Player", {});
      world.addComponent(player, "Position", { x: 5, y: 5, layer: 1 });

      // Create AI entity near player
      const enemy = world.spawn();
      world.addComponent(enemy, "Position", { x: 7, y: 5, layer: 1 });
      world.addComponent(enemy, "AI", {
        state: "idle",
        target: 0,
        alertness: 50,
        homeX: 7,
        homeY: 5,
        patrolRadius: 5,
      });
      world.addComponent(enemy, "TurnEnergy", {
        energy: 100,
        energyPerTurn: 100,
        speed: 100,
      });

      // Run systems
      world.tick();

      // Should transition to acting
      const state = turnState.getState();
      if (state.activeEntity === enemy) {
        const ai = world.getComponent<AIData>(enemy, "AI");
        // Should be chasing since player is within range (distance = 2)
        expect(["chase", "attack"].includes(ai?.state ?? "")).toBe(true);
      }
    });
  });

  describe("Integration", () => {
    it("should run full turn cycle", () => {
      // Setup
      world.systems.register(TurnManagementSystem);
      world.systems.register(CollisionSystem);
      world.systems.register(MovementSystem);
      world.systems.register(CombatSystem);
      world.initialize();

      // Create player
      const player = world.spawn();
      world.addComponent(player, "Player", {});
      world.addComponent(player, "Position", { x: 5, y: 5, layer: 1 });
      world.addComponent(player, "TurnEnergy", {
        energy: 100,
        energyPerTurn: 100,
        speed: 100,
      });

      // Tick to select active entity
      world.tick();

      const state = turnState.getState();
      expect(state.activeEntity).toBe(player);

      // Submit move action
      applyMoveAction(world, player, 1, 0);
      submitAction(world, player, { type: "move", data: { dx: 1, dy: 0 } });

      // Tick to resolve
      world.tick();

      // Position should be updated
      const pos = world.getComponent<PositionData>(player, "Position");
      expect(pos?.x).toBe(6);
    });
  });
});
