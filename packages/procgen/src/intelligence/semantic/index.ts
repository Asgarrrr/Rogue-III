/**
 * Semantic Content Module
 *
 * Provides semantic enrichment for dungeon entities and items,
 * giving them purpose, context, and meaningful relationships.
 */

// Types
export type {
  CombatStyle,
  ComputedLoot,
  EnemyTemplate,
  EntityBehavior,
  EntityRelationship,
  EntityRole,
  ItemPurpose,
  ItemTemplate,
  LootDrop,
  LootRarity,
  MovementPattern,
  RelationshipType,
  SemanticConfig,
  SemanticEnrichment,
  SemanticEntity,
  SemanticItem,
} from "./types";
export {
  DEFAULT_BEHAVIORS,
  DEFAULT_ENEMY_TEMPLATES,
  DEFAULT_ITEM_TEMPLATES,
  DEFAULT_SEMANTIC_CONFIG,
  SemanticEnrichmentError,
} from "./types";

// Factory
export type { EntityCreationContext } from "./entity-factory";
export {
  assignRole,
  computeLoot,
  createBehavior,
  createEntityFactory,
  createSemanticEntity,
  createSemanticItem,
  detectRelationships,
  determineGuardTarget,
  determineItemPurpose,
  selectItemTemplate,
  selectTemplate,
} from "./entity-factory";
