/**
 * ECS Integration Module
 *
 * Bridges external systems (dungeon generation, etc.) with the ECS world.
 */

export {
  clearDungeonEntities,
  getDungeonStats,
  loadDungeonIntoWorld,
  validateDungeonCompatibility,
} from "./dungeon-loader";
