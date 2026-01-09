/**
 * Game Initialization
 *
 * Sets up the ECS World and GameServer for the Rogue III game.
 * This module provides the main entry point for initializing the game engine.
 */

import { SeededRandom } from "./dungeon/core/random/seeded-random";
import { EventQueue } from "./ecs/core/events";
import { World } from "./ecs/core/world";
import type { EntityTemplateRegistry } from "./ecs/features/templates";
import { registerGameComponents } from "./ecs/game/components";
import { GameMap } from "./ecs/game/resources/game-map";
import { TurnStateManager } from "./ecs/game/resources/turn-state";
import { registerGameSystems } from "./ecs/game/systems";
import { initializeFOVResources } from "./ecs/game/systems/fov";
import { createGameTemplateRegistry } from "./ecs/game/templates";
import { GameServer, type GameServerConfig } from "./network";

// =============================================================================
// Game Loop Constants
// =============================================================================

/**
 * Game loop tick rate in milliseconds.
 * 100ms = 10 ticks per second (good for turn-based games)
 */
const GAME_LOOP_INTERVAL_MS = 100;

// =============================================================================
// Configuration
// =============================================================================

/**
 * Default game configuration.
 */
export interface GameConfig {
  /** Map width in tiles */
  mapWidth: number;
  /** Map height in tiles */
  mapHeight: number;
  /** Maximum FOV radius */
  maxFovRadius: number;
  /** FOV result pool size */
  fovPoolSize: number;
  /** Game RNG seed for deterministic AI/combat (defaults to current timestamp) */
  gameSeed?: number;
}

/**
 * Default configuration values.
 */
export const DEFAULT_GAME_CONFIG: GameConfig = {
  mapWidth: 80,
  mapHeight: 50,
  maxFovRadius: 20,
  fovPoolSize: 10,
};

// =============================================================================
// Game Instance
// =============================================================================

/**
 * Complete game instance with all components.
 */
export interface GameInstance {
  /** ECS World */
  world: World;
  /** Entity template registry */
  templates: EntityTemplateRegistry;
  /** Game server (WebSocket handler) */
  gameServer: GameServer;
  /** Start the game loop */
  start: () => void;
  /** Stop the game loop */
  stop: () => void;
  /** Check if game loop is running */
  isRunning: () => boolean;
  /** Shutdown function */
  shutdown: () => void;
}

// =============================================================================
// Singleton
// =============================================================================

/**
 * Global game instance.
 * Initialized lazily on first access.
 */
let gameInstance: GameInstance | null = null;

// =============================================================================
// Initialization Functions
// =============================================================================

/**
 * Initializes the ECS World with all game systems and resources.
 *
 * @param config - Game configuration
 * @returns Initialized World instance
 */
export function initializeWorld(
  config: GameConfig = DEFAULT_GAME_CONFIG,
): World {
  const world = new World();

  // Register all game components
  registerGameComponents(world);

  // Register resources
  world.resources.register("eventQueue", new EventQueue());
  world.resources.register(
    "gameMap",
    new GameMap(config.mapWidth, config.mapHeight),
  );
  world.resources.register("turnState", new TurnStateManager());
  world.resources.register("currentLevel", 1);
  world.resources.register(
    "gameRng",
    new SeededRandom(config.gameSeed ?? Date.now()),
  );

  // Initialize FOV resources
  initializeFOVResources(world, config.maxFovRadius, config.fovPoolSize);

  // Register all game systems
  registerGameSystems(world);

  // Initialize world (compiles systems)
  world.initialize();

  console.log("[GameInit] World initialized with:");
  console.log(`  - Map: ${config.mapWidth}x${config.mapHeight}`);
  console.log(`  - FOV radius: ${config.maxFovRadius}`);

  return world;
}

/**
 * Creates a complete game instance.
 *
 * @param config - Game configuration
 * @returns Game instance with World and GameServer
 */
export function createGameInstance(
  config: GameConfig = DEFAULT_GAME_CONFIG,
): GameInstance {
  // Initialize world
  const world = initializeWorld(config);

  // Create template registry
  const templates = createGameTemplateRegistry();
  world.resources.register("templates", templates);

  // Create game server
  const gameServerConfig: GameServerConfig = {
    templates,
  };
  const gameServer = new GameServer(world, gameServerConfig);

  console.log("[GameInit] Game instance created");

  // Game loop state
  let gameLoopInterval: ReturnType<typeof setInterval> | null = null;
  let running = false;

  /**
   * Executes one game tick.
   */
  const gameTick = () => {
    try {
      // Execute all ECS systems and flush command buffer
      world.tick();

      // Broadcast state updates to all connected clients
      gameServer.broadcastStateUpdates();
    } catch (error) {
      console.error("[GameLoop] Error during tick:", error);
    }
  };

  /**
   * Starts the game loop.
   */
  const start = () => {
    if (running) {
      console.warn("[GameLoop] Already running");
      return;
    }

    running = true;
    gameLoopInterval = setInterval(gameTick, GAME_LOOP_INTERVAL_MS);
    console.log(
      `[GameLoop] Started (${1000 / GAME_LOOP_INTERVAL_MS} ticks/sec)`,
    );
  };

  /**
   * Stops the game loop.
   */
  const stop = () => {
    if (!running) {
      console.warn("[GameLoop] Not running");
      return;
    }

    if (gameLoopInterval) {
      clearInterval(gameLoopInterval);
      gameLoopInterval = null;
    }
    running = false;
    console.log("[GameLoop] Stopped");
  };

  // Create instance
  const instance: GameInstance = {
    world,
    templates,
    gameServer,
    start,
    stop,
    isRunning: () => running,
    shutdown: () => {
      stop();
      gameServer.shutdown();
      world.reset();
      console.log("[GameInit] Game instance shut down");
    },
  };

  // Auto-start the game loop
  start();

  return instance;
}

/**
 * Gets or creates the global game instance.
 * Uses lazy initialization.
 *
 * @param config - Optional configuration (only used on first call)
 * @returns The global game instance
 */
export function getGameInstance(
  config: GameConfig = DEFAULT_GAME_CONFIG,
): GameInstance {
  if (!gameInstance) {
    gameInstance = createGameInstance(config);
  }
  return gameInstance;
}

/**
 * Shuts down and clears the global game instance.
 */
export function shutdownGameInstance(): void {
  if (gameInstance) {
    gameInstance.shutdown();
    gameInstance = null;
    console.log("[GameInit] Global game instance cleared");
  }
}

/**
 * Checks if a game instance exists.
 */
export function hasGameInstance(): boolean {
  return gameInstance !== null;
}

// =============================================================================
// Exports
// =============================================================================

export type { GameServerConfig } from "./network";
