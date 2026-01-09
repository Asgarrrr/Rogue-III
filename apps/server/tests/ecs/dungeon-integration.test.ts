/**
 * Dungeon to ECS Integration Tests
 *
 * Tests the complete flow of loading a procedurally generated dungeon
 * into the ECS world, including terrain and player spawning.
 */

import { beforeEach, describe, expect, test } from "bun:test";
import { DungeonManager } from "../../src/game/dungeon";
import type { DungeonConfig } from "../../src/game/dungeon/core/types";
import { EventQueue, World } from "../../src/game/ecs";
import type { EntityTemplateRegistry } from "../../src/game/ecs/features/templates";
import {
  AttackRequestSchema,
  BlockingSchema,
  createGameTemplateRegistry,
  registerGameComponents,
  registerGameResources,
} from "../../src/game/ecs/game";
import type { GameMap } from "../../src/game/ecs/game/resources/game-map";
import {
  clearDungeonEntities,
  getDungeonStats,
  loadDungeonIntoWorld,
  validateDungeonCompatibility,
} from "../../src/game/ecs/integration/dungeon-loader";

// Test configuration
const TEST_SEED = 42;
const BASE_CONFIG: DungeonConfig = {
  width: 60,
  height: 40,
  roomCount: 6,
  roomSizeRange: [5, 10] as [number, number],
  algorithm: "bsp" as const,
};

const CELLULAR_CONFIG: DungeonConfig = {
  ...BASE_CONFIG,
  algorithm: "cellular" as const,
};

/**
 * Helper function to create a fully configured world for testing
 */
function createTestWorld(width: number, height: number): World {
  const world = new World();

  // Register all game components
  registerGameComponents(world);
  world.registerComponent(BlockingSchema);
  world.registerComponent(AttackRequestSchema);

  // Register resources
  const eventQueue = new EventQueue();
  world.resources.register("eventQueue", eventQueue);
  registerGameResources(world, width, height);

  return world;
}

describe("Dungeon to ECS Integration", () => {
  let world: World;
  let templates: EntityTemplateRegistry;

  beforeEach(() => {
    world = createTestWorld(BASE_CONFIG.width, BASE_CONFIG.height);
    templates = createGameTemplateRegistry();
  });

  describe("Dungeon Generation", () => {
    test("should generate BSP dungeon successfully", () => {
      const result = DungeonManager.generateFromSeedSync(
        TEST_SEED,
        BASE_CONFIG,
      );
      expect(result.isOk()).toBeTrue();

      const dungeon = result.value!;
      expect(dungeon.rooms.length).toBeGreaterThan(0);
      expect(dungeon.terrain).toBeDefined();
      expect(dungeon.terrain.width).toBe(BASE_CONFIG.width);
      expect(dungeon.terrain.height).toBe(BASE_CONFIG.height);
      expect(dungeon.spawnData).toBeDefined();
      expect(dungeon.spawnData.playerSpawn).toBeDefined();
    });

    test("should generate cellular dungeon successfully", () => {
      const result = DungeonManager.generateFromSeedSync(
        TEST_SEED,
        CELLULAR_CONFIG,
      );
      expect(result.isOk()).toBeTrue();

      const dungeon = result.value!;
      expect(dungeon.terrain).toBeDefined();
      expect(dungeon.terrain.width).toBe(CELLULAR_CONFIG.width);
      expect(dungeon.terrain.height).toBe(CELLULAR_CONFIG.height);
    });

    test("should be deterministic", () => {
      const result1 = DungeonManager.generateFromSeedSync(
        TEST_SEED,
        BASE_CONFIG,
      );
      const result2 = DungeonManager.generateFromSeedSync(
        TEST_SEED,
        BASE_CONFIG,
      );

      expect(result1.isOk()).toBeTrue();
      expect(result2.isOk()).toBeTrue();

      const dungeon1 = result1.value!;
      const dungeon2 = result2.value!;

      expect(dungeon1.checksum).toBe(dungeon2.checksum);
      expect(dungeon1.rooms.length).toBe(dungeon2.rooms.length);
      expect(dungeon1.spawnData.playerSpawn).toEqual(
        dungeon2.spawnData.playerSpawn,
      );
    });
  });

  describe("validateDungeonCompatibility", () => {
    test("should detect dimension mismatch", () => {
      const smallWorld = createTestWorld(30, 20);
      const smallTemplates = createGameTemplateRegistry();

      const result = DungeonManager.generateFromSeedSync(
        TEST_SEED,
        BASE_CONFIG,
      );
      expect(result.isOk()).toBeTrue();

      const dungeon = result.value!;
      const errors = validateDungeonCompatibility(
        smallWorld,
        dungeon,
        smallTemplates,
      );

      expect(errors.length).toBeGreaterThan(0);
      expect(errors.some((e) => e.includes("dimensions"))).toBeTrue();
    });

    test("should pass for matching dimensions", () => {
      const result = DungeonManager.generateFromSeedSync(
        TEST_SEED,
        BASE_CONFIG,
      );
      expect(result.isOk()).toBeTrue();

      const dungeon = result.value!;
      const errors = validateDungeonCompatibility(world, dungeon, templates);

      // Should have no dimension errors (may have missing template errors which is OK)
      expect(errors.some((e) => e.includes("dimensions"))).toBeFalse();
    });
  });

  describe("loadDungeonIntoWorld", () => {
    test("should load dungeon and return player entity", () => {
      const result = DungeonManager.generateFromSeedSync(
        TEST_SEED,
        BASE_CONFIG,
      );
      expect(result.isOk()).toBeTrue();

      const dungeon = result.value!;
      const playerEntity = loadDungeonIntoWorld(world, dungeon, templates);

      // Entity 0 is valid in our ECS (index 0, generation 0)
      expect(playerEntity).toBeDefined();
      expect(typeof playerEntity).toBe("number");
      expect(playerEntity).toBeGreaterThanOrEqual(0);
    });

    test("should spawn player at correct position", () => {
      const result = DungeonManager.generateFromSeedSync(
        TEST_SEED,
        BASE_CONFIG,
      );
      expect(result.isOk()).toBeTrue();

      const dungeon = result.value!;
      const playerEntity = loadDungeonIntoWorld(world, dungeon, templates);

      const position = world.getComponent<{ x: number; y: number }>(
        playerEntity,
        "Position",
      );
      expect(position).toBeDefined();
      expect(position!.x).toBe(dungeon.spawnData.playerSpawn.x);
      expect(position!.y).toBe(dungeon.spawnData.playerSpawn.y);
    });

    test("should populate GameMap terrain", () => {
      const result = DungeonManager.generateFromSeedSync(
        TEST_SEED,
        BASE_CONFIG,
      );
      expect(result.isOk()).toBeTrue();

      const dungeon = result.value!;
      loadDungeonIntoWorld(world, dungeon, templates);

      const gameMap = world.resources.get<GameMap>("gameMap");
      expect(gameMap).toBeDefined();

      // Verify terrain was loaded by checking tile consistency
      let matchingTiles = 0;
      const sampleSize = 100;

      for (let i = 0; i < sampleSize; i++) {
        const x = Math.floor(Math.random() * dungeon.terrain.width);
        const y = Math.floor(Math.random() * dungeon.terrain.height);
        const dungeonTile =
          dungeon.terrain.tiles[y * dungeon.terrain.width + x];
        const mapTile = gameMap!.getTile(x, y);

        if (dungeonTile === mapTile) {
          matchingTiles++;
        }
      }

      // All sampled tiles should match (zero-copy transfer)
      expect(matchingTiles).toBe(sampleSize);
    });

    test("should throw if dimensions mismatch", () => {
      const smallWorld = createTestWorld(30, 20);

      const result = DungeonManager.generateFromSeedSync(
        TEST_SEED,
        BASE_CONFIG,
      );
      expect(result.isOk()).toBeTrue();

      const dungeon = result.value!;

      expect(() => {
        loadDungeonIntoWorld(smallWorld, dungeon, templates);
      }).toThrow(/dimensions/);
    });
  });

  describe("clearDungeonEntities", () => {
    test("should remove all entities from world", () => {
      const result = DungeonManager.generateFromSeedSync(
        TEST_SEED,
        BASE_CONFIG,
      );
      expect(result.isOk()).toBeTrue();

      const dungeon = result.value!;
      loadDungeonIntoWorld(world, dungeon, templates);

      // Verify at least player exists
      const statsBefore = getDungeonStats(world);
      expect(statsBefore.playerCount).toBe(1);

      // Clear entities
      clearDungeonEntities(world);

      // Verify entities are gone
      const statsAfter = getDungeonStats(world);
      expect(statsAfter.totalEntities).toBe(0);
      expect(statsAfter.playerCount).toBe(0);
    });

    test("should allow reloading dungeon after clear", () => {
      const result1 = DungeonManager.generateFromSeedSync(
        TEST_SEED,
        BASE_CONFIG,
      );
      expect(result1.isOk()).toBeTrue();

      loadDungeonIntoWorld(world, result1.value!, templates);
      clearDungeonEntities(world);

      // Generate a different dungeon with different seed
      const result2 = DungeonManager.generateFromSeedSync(
        TEST_SEED + 1,
        BASE_CONFIG,
      );
      expect(result2.isOk()).toBeTrue();

      // Should be able to load new dungeon
      const player2 = loadDungeonIntoWorld(world, result2.value!, templates);
      expect(player2).toBeDefined();

      const stats = getDungeonStats(world);
      expect(stats.playerCount).toBe(1);
    });
  });

  describe("getDungeonStats", () => {
    test("should return player count after loading", () => {
      const result = DungeonManager.generateFromSeedSync(
        TEST_SEED,
        BASE_CONFIG,
      );
      expect(result.isOk()).toBeTrue();

      const dungeon = result.value!;
      loadDungeonIntoWorld(world, dungeon, templates);

      const stats = getDungeonStats(world);

      expect(stats.playerCount).toBe(1);
      expect(stats.totalEntities).toBeGreaterThanOrEqual(1);
    });

    test("should return zero counts for empty world", () => {
      const stats = getDungeonStats(world);

      expect(stats.totalEntities).toBe(0);
      expect(stats.playerCount).toBe(0);
      expect(stats.enemyCount).toBe(0);
      expect(stats.itemCount).toBe(0);
    });
  });

  describe("Full Integration Flow", () => {
    test("should complete dungeon lifecycle: generate → load → clear → reload", () => {
      // Step 1: Generate dungeon
      const result1 = DungeonManager.generateFromSeedSync(
        TEST_SEED,
        BASE_CONFIG,
      );
      expect(result1.isOk()).toBeTrue();
      const dungeon1 = result1.value!;

      // Step 2: Load dungeon
      const player1 = loadDungeonIntoWorld(world, dungeon1, templates);
      expect(player1).toBeDefined();

      // Step 3: Verify player state
      const stats1 = getDungeonStats(world);
      expect(stats1.playerCount).toBe(1);

      const pos1 = world.getComponent<{ x: number; y: number }>(
        player1,
        "Position",
      );
      expect(pos1).toBeDefined();
      expect(pos1!.x).toBe(dungeon1.spawnData.playerSpawn.x);
      expect(pos1!.y).toBe(dungeon1.spawnData.playerSpawn.y);

      // Step 4: Clear dungeon (simulating level transition)
      clearDungeonEntities(world);
      expect(getDungeonStats(world).totalEntities).toBe(0);

      // Step 5: Generate new dungeon (next level)
      const result2 = DungeonManager.generateFromSeedSync(
        TEST_SEED + 100,
        BASE_CONFIG,
      );
      expect(result2.isOk()).toBeTrue();
      const dungeon2 = result2.value!;

      // Step 6: Load new dungeon
      const player2 = loadDungeonIntoWorld(world, dungeon2, templates);
      expect(player2).toBeDefined();

      // Step 7: Verify new state
      const stats2 = getDungeonStats(world);
      expect(stats2.playerCount).toBe(1);

      const pos2 = world.getComponent<{ x: number; y: number }>(
        player2,
        "Position",
      );
      expect(pos2).toBeDefined();
      expect(pos2!.x).toBe(dungeon2.spawnData.playerSpawn.x);
      expect(pos2!.y).toBe(dungeon2.spawnData.playerSpawn.y);
    });
  });
});
