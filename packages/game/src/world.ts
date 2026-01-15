import { World } from "@rogue/ecs";

/**
 * Create and configure a new game world.
 *
 * This is the entry point for setting up the ECS world with all
 * game systems, resources, and initial state.
 *
 * @example
 * ```typescript
 * const world = createGameWorld();
 *
 * // Spawn entities
 * const player = world.spawn(Position, Health, Player);
 *
 * // Run game loop
 * world.runTick();
 * ```
 */
export function createGameWorld(): World {
  const world = new World();

  // Register systems
  // world.addSystem(MovementSystem);
  // world.addSystem(CombatSystem);
  // world.addSystem(AISystem);

  // Set up resources
  // world.resources.set("turnNumber", 0);

  return world;
}
