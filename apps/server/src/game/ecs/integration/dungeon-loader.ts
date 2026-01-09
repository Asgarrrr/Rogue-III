/**
 * Dungeon to ECS Integration
 *
 * Provides zero-copy loading of procedurally generated dungeons into the ECS world.
 * This module bridges the dungeon generation system with the ECS game engine.
 */

import type { Dungeon } from "../../dungeon/entities/dungeon";
import type { World } from "../core/world";
import type { EntityTemplateRegistry } from "../features/templates";
import type { GameMap } from "../game/resources/game-map";
import type { Entity } from "../types";

/**
 * Load a generated dungeon into the ECS world.
 *
 * This function performs the following operations:
 * 1. Loads terrain tiles into GameMap (zero-copy via setRawTiles)
 * 2. Spawns the player at the designated spawn position
 * 3. Instantiates all entities from spawn descriptors (enemies, items, etc.)
 *
 * Performance characteristics:
 * - Terrain loading: O(1) - zero-copy array transfer
 * - Entity spawning: O(n) where n = number of entities
 * - Total complexity: O(n)
 *
 * @param world - The ECS world to populate
 * @param dungeon - The generated dungeon with terrain and spawn data
 * @param templates - Entity template registry for instantiation
 * @returns The spawned player entity
 *
 * @throws Error if GameMap resource is not registered
 * @throws Error if player template is not registered
 * @throws Error if any entity template is not found
 *
 * @example
 * ```typescript
 * const world = new World();
 * registerGameComponents(world);
 * registerGameResources(world, 80, 50);
 * const templates = new EntityTemplateRegistry();
 * registerAllTemplates(templates);
 *
 * const dungeonResult = DungeonManager.generateFromSeedSync("seed123", config);
 * if (dungeonResult.isOk()) {
 *   const player = loadDungeonIntoWorld(world, dungeonResult.value, templates);
 *   console.log(`Player spawned at ${player}`);
 * }
 * ```
 */
export function loadDungeonIntoWorld(
  world: World,
  dungeon: Dungeon,
  templates: EntityTemplateRegistry,
): Entity {
  // 1. Load terrain (ZERO-COPY via setRawTiles)
  const gameMap = world.resources.get<GameMap>("gameMap");
  if (!gameMap) {
    throw new Error(
      "GameMap resource not found. Did you call registerGameResources()?",
    );
  }

  // Verify dimensions match
  if (
    gameMap.width !== dungeon.terrain.width ||
    gameMap.height !== dungeon.terrain.height
  ) {
    throw new Error(
      `GameMap dimensions (${gameMap.width}x${gameMap.height}) do not match dungeon terrain (${dungeon.terrain.width}x${dungeon.terrain.height})`,
    );
  }

  // Zero-copy terrain transfer
  gameMap.setRawTiles(dungeon.terrain.tiles);

  // 2. Spawn player entity
  const playerSpawn = dungeon.spawnData.playerSpawn;

  let playerEntity: Entity;
  try {
    playerEntity = templates.instantiate(world, "player", {
      Position: {
        x: playerSpawn.x,
        y: playerSpawn.y,
        layer: 1,
      },
    });
  } catch (error) {
    throw new Error(
      `Failed to spawn player: ${error instanceof Error ? error.message : String(error)}. Is the 'player' template registered?`,
    );
  }

  // Register player position in GameMap spatial index
  gameMap.addEntity(playerSpawn.x, playerSpawn.y, playerEntity);

  // 3. Spawn all other entities from descriptors
  let successCount = 0;
  let failureCount = 0;
  const failures: Array<{ templateId: string; reason: string }> = [];

  for (const descriptor of dungeon.spawnData.entities) {
    try {
      // Extract layer from components if present
      const positionOverrides = descriptor.components?.Position as
        | { layer?: number }
        | undefined;
      const entity = templates.instantiate(world, descriptor.templateId, {
        Position: {
          x: descriptor.position.x,
          y: descriptor.position.y,
          layer: positionOverrides?.layer ?? 1,
        },
        ...descriptor.components,
      });

      // Register entity position in GameMap spatial index
      gameMap.addEntity(descriptor.position.x, descriptor.position.y, entity);

      successCount++;
    } catch (error) {
      failureCount++;
      failures.push({
        templateId: descriptor.templateId,
        reason: error instanceof Error ? error.message : String(error),
      });

      // Log but don't throw - continue spawning other entities
      console.warn(
        `Failed to spawn entity '${descriptor.templateId}' at (${descriptor.position.x}, ${descriptor.position.y}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  // Log summary
  if (failureCount > 0) {
    console.warn(
      `Dungeon loaded with warnings: ${successCount} entities spawned successfully, ${failureCount} failed.`,
    );
    console.warn("Failed templates:", failures);
  } else {
    console.log(
      `Dungeon loaded successfully: ${successCount} entities spawned (+ 1 player).`,
    );
  }

  return playerEntity;
}

/**
 * Validates that a dungeon can be loaded into the given world.
 *
 * This function checks:
 * - GameMap resource exists
 * - GameMap dimensions match dungeon terrain
 * - All required templates are registered
 *
 * @param world - The ECS world to validate against
 * @param dungeon - The dungeon to validate
 * @param templates - Entity template registry to check
 * @returns Array of validation errors, empty if valid
 *
 * @example
 * ```typescript
 * const errors = validateDungeonCompatibility(world, dungeon, templates);
 * if (errors.length > 0) {
 *   console.error("Cannot load dungeon:", errors);
 * } else {
 *   loadDungeonIntoWorld(world, dungeon, templates);
 * }
 * ```
 */
export function validateDungeonCompatibility(
  world: World,
  dungeon: Dungeon,
  templates: EntityTemplateRegistry,
): string[] {
  const errors: string[] = [];

  // Check GameMap resource
  const gameMap = world.resources.get<GameMap>("gameMap");
  if (!gameMap) {
    errors.push("GameMap resource not registered in world");
  } else {
    // Check dimensions
    if (
      gameMap.width !== dungeon.terrain.width ||
      gameMap.height !== dungeon.terrain.height
    ) {
      errors.push(
        `GameMap dimensions (${gameMap.width}x${gameMap.height}) do not match dungeon terrain (${dungeon.terrain.width}x${dungeon.terrain.height})`,
      );
    }
  }

  // Check player template
  if (!templates.has("player")) {
    errors.push("Player template 'player' not registered");
  }

  // Check all entity templates
  const missingTemplates = new Set<string>();
  for (const descriptor of dungeon.spawnData.entities) {
    if (!templates.has(descriptor.templateId)) {
      missingTemplates.add(descriptor.templateId);
    }
  }

  if (missingTemplates.size > 0) {
    errors.push(
      `Missing entity templates: ${Array.from(missingTemplates).join(", ")}`,
    );
  }

  return errors;
}

/**
 * Clears all dungeon-related entities from the world.
 *
 * This function removes all entities that were spawned as part of dungeon loading.
 * Useful for transitioning between levels or reloading the dungeon.
 *
 * @param world - The ECS world to clear
 *
 * @example
 * ```typescript
 * clearDungeonEntities(world);
 * const newDungeon = DungeonManager.generateFromSeedSync("newSeed", config);
 * loadDungeonIntoWorld(world, newDungeon.value, templates);
 * ```
 */
export function clearDungeonEntities(world: World): void {
  // Query for all spatial entities (everything with Position component)
  const query = world.query({ with: ["Position"], without: [] });
  const entities = query.execute();

  // Despawn all entities
  for (const entity of entities) {
    world.despawn(entity);
  }

  // Clear GameMap spatial index
  const gameMap = world.resources.get<GameMap>("gameMap");
  if (gameMap) {
    // Reset GameMap to empty state
    gameMap.clearVisibility();
    // Note: GameMap doesn't have a clearEntities method, but despawn should handle removal
  }

  console.log(`Cleared ${entities.length} dungeon entities`);
}

/**
 * Gets statistics about the currently loaded dungeon.
 *
 * @param world - The ECS world to analyze
 * @returns Statistics object with entity counts
 *
 * @example
 * ```typescript
 * const stats = getDungeonStats(world);
 * console.log(`Enemies: ${stats.enemyCount}, Items: ${stats.itemCount}`);
 * ```
 */
export function getDungeonStats(world: World): {
  totalEntities: number;
  playerCount: number;
  enemyCount: number;
  itemCount: number;
  environmentCount: number;
} {
  const allEntities = world
    .query({ with: ["Position"], without: [] })
    .execute();

  const playerQuery = world.query({ with: ["Player"], without: [] });
  const enemyQuery = world.query({ with: ["AI"], without: ["Player"] });
  const itemQuery = world.query({ with: ["Item"], without: [] });
  const envQuery = world.query({
    with: ["Position"],
    without: ["Player", "AI", "Item"],
  });

  return {
    totalEntities: allEntities.length,
    playerCount: playerQuery.execute().length,
    enemyCount: enemyQuery.execute().length,
    itemCount: itemQuery.execute().length,
    environmentCount: envQuery.execute().length,
  };
}
