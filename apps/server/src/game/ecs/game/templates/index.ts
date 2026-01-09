/**
 * Game Entity Templates
 *
 * Predefined entity configurations for quick spawning.
 */

import type { World } from "../../core/world";
import { EntityTemplateRegistry } from "../../features/templates";

// Actors
export {
  ALL_ACTOR_TEMPLATES,
  BaseEnemyTemplate,
  GhostTemplate,
  GoblinTemplate,
  OrcTemplate,
  OrcWarriorTemplate,
  PlayerTemplate,
  RatTemplate,
  SkeletonTemplate,
  TrollTemplate,
} from "./actors";
// Component Helpers (type-safe factories to avoid 'as' casts)
export * from "./component-helpers";
// Environment
export {
  ALL_ENVIRONMENT_TEMPLATES,
  ArrowTrapTemplate,
  ChestTemplate,
  DoorTemplate,
  FireTrapTemplate,
  FountainTemplate,
  LockedChestTemplate,
  LockedDoorTemplate,
  PillarTemplate,
  SecretDoorTemplate,
  SpikeTrapTemplate,
  StairsDownTemplate,
  StairsUpTemplate,
  StatueTemplate,
  TeleportTrapTemplate,
} from "./environment";
// Items
export {
  ALL_ITEM_TEMPLATES,
  AxeTemplate,
  BaseItemTemplate,
  BowTemplate,
  ChainmailTemplate,
  DaggerTemplate,
  GoldTemplate,
  GreaterHealthPotionTemplate,
  HealthPotionTemplate,
  KeyTemplate,
  LeatherArmorTemplate,
  ManaPotionTemplate,
  PlateArmorTemplate,
  ScrollRevealTemplate,
  ScrollTeleportTemplate,
  SwordTemplate,
} from "./items";

import { ALL_ACTOR_TEMPLATES } from "./actors";
import { ALL_ENVIRONMENT_TEMPLATES } from "./environment";
import { ALL_ITEM_TEMPLATES } from "./items";

/**
 * All game templates combined.
 */
export const ALL_GAME_TEMPLATES = [
  ...ALL_ACTOR_TEMPLATES,
  ...ALL_ITEM_TEMPLATES,
  ...ALL_ENVIRONMENT_TEMPLATES,
];

/**
 * Creates and initializes a template registry with all game templates.
 */
export function createGameTemplateRegistry(): EntityTemplateRegistry {
  const registry = new EntityTemplateRegistry();

  for (const template of ALL_GAME_TEMPLATES) {
    registry.register(template);
  }

  return registry;
}

/**
 * Sets up templates in the world.
 * Returns the template registry for spawning entities.
 */
export function setupGameTemplates(world: World): EntityTemplateRegistry {
  const registry = createGameTemplateRegistry();
  world.resources.register("templates", registry);
  return registry;
}
