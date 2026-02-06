/**
 * Semantic Content Types
 *
 * Types for entities with meaning and context - not just "an enemy" but
 * "a guardian protecting treasure with patrol behavior".
 */

import type { SpawnPoint } from "../../pipeline/types";

// =============================================================================
// ENTITY ROLES
// =============================================================================

/**
 * The narrative/gameplay role an entity plays.
 */
export type EntityRole =
  | "guardian" // Protects something specific
  | "patrol" // Moves around, provides tension
  | "ambush" // Hidden, triggers on proximity
  | "minion" // Weak, numerous, fodder
  | "elite" // Strong, special abilities
  | "boss" // Major encounter, climactic
  | "neutral" // Non-hostile, informational
  | "merchant"; // Trading NPC

/**
 * The combat style/behavior pattern.
 */
export type CombatStyle =
  | "aggressive" // Charges at player
  | "defensive" // Waits for player approach
  | "ranged" // Keeps distance, shoots
  | "support" // Buffs allies, debuffs player
  | "summoner" // Creates minions
  | "berserker"; // Low health = more dangerous

/**
 * Movement patterns for enemies.
 */
export type MovementPattern =
  | "stationary" // Doesn't move
  | "wander" // Random movement in area
  | "patrol" // Fixed path back and forth
  | "chase" // Follows player
  | "flee" // Runs from player
  | "territorial"; // Attacks if player enters area

// =============================================================================
// ENTITY BEHAVIOR
// =============================================================================

/**
 * Complete behavior specification for an entity.
 */
export interface EntityBehavior {
  /** How the entity moves */
  readonly movement: MovementPattern;

  /** How it fights */
  readonly combatStyle: CombatStyle;

  /** Patrol path (room IDs) if movement is "patrol" */
  readonly patrolPath?: readonly number[];

  /** Detection range (in tiles) */
  readonly detectionRange: number;

  /** Whether it can alert nearby enemies */
  readonly alertsAllies: boolean;

  /** Chance to flee when low health (0-1) */
  readonly fleeThreshold: number;
}

/**
 * Default behaviors for each role.
 */
export const DEFAULT_BEHAVIORS: Record<EntityRole, EntityBehavior> = {
  guardian: {
    movement: "stationary",
    combatStyle: "defensive",
    detectionRange: 5,
    alertsAllies: false,
    fleeThreshold: 0,
  },
  patrol: {
    movement: "patrol",
    combatStyle: "aggressive",
    detectionRange: 6,
    alertsAllies: true,
    fleeThreshold: 0.2,
  },
  ambush: {
    movement: "stationary",
    combatStyle: "aggressive",
    detectionRange: 3,
    alertsAllies: false,
    fleeThreshold: 0,
  },
  minion: {
    movement: "wander",
    combatStyle: "aggressive",
    detectionRange: 4,
    alertsAllies: false,
    fleeThreshold: 0.3,
  },
  elite: {
    movement: "territorial",
    combatStyle: "aggressive",
    detectionRange: 7,
    alertsAllies: true,
    fleeThreshold: 0,
  },
  boss: {
    movement: "territorial",
    combatStyle: "berserker",
    detectionRange: 10,
    alertsAllies: false,
    fleeThreshold: 0,
  },
  neutral: {
    movement: "stationary",
    combatStyle: "defensive",
    detectionRange: 0,
    alertsAllies: false,
    fleeThreshold: 1,
  },
  merchant: {
    movement: "stationary",
    combatStyle: "defensive",
    detectionRange: 0,
    alertsAllies: false,
    fleeThreshold: 1,
  },
};

// =============================================================================
// ENTITY RELATIONSHIPS
// =============================================================================

/**
 * Types of relationships between entities.
 */
export type RelationshipType =
  | "guards" // This entity guards the target
  | "commands" // This entity commands the target
  | "fears" // This entity fears the target
  | "allies_with" // This entity is allied with target
  | "hunts"; // This entity actively hunts target

/**
 * A relationship between two entities.
 */
export interface EntityRelationship {
  /** Type of relationship */
  readonly type: RelationshipType;

  /** ID of the related entity or item */
  readonly targetId: string;

  /** Strength of relationship (0-1) */
  readonly strength: number;
}

// =============================================================================
// LOOT COMPUTATION
// =============================================================================

/**
 * Rarity tiers for loot.
 */
export type LootRarity = "common" | "uncommon" | "rare" | "epic" | "legendary";

/**
 * A single loot drop.
 */
export interface LootDrop {
  /** Item template ID */
  readonly itemId: string;

  /** Chance to drop (0-1) */
  readonly dropChance: number;

  /** Min-max quantity */
  readonly quantity: readonly [number, number];

  /** Rarity tier */
  readonly rarity: LootRarity;
}

/**
 * Computed loot table for an entity.
 */
export interface ComputedLoot {
  /** Guaranteed drops */
  readonly guaranteed: readonly LootDrop[];

  /** Random drops from pool */
  readonly random: readonly LootDrop[];

  /** Gold/currency amount range */
  readonly goldRange: readonly [number, number];

  /** Experience points */
  readonly experience: number;
}

// =============================================================================
// SEMANTIC ENTITY
// =============================================================================

/**
 * An entity with full semantic context.
 *
 * This is the core type - an enemy isn't just "goblin" but:
 * - A patrol (role) that wanders the north corridor
 * - Guards the treasure room entrance
 * - Will alert nearby allies
 * - Drops common loot
 */
export interface SemanticEntity {
  /** Unique identifier */
  readonly id: string;

  /** Reference to the original spawn point */
  readonly spawnId: string;

  /** Template ID (e.g., "goblin", "skeleton_warrior") */
  readonly template: string;

  /** The narrative role this entity plays */
  readonly role: EntityRole;

  /** What this entity guards (if guardian) */
  readonly guards?: string;

  /** Complete behavior specification */
  readonly behavior: EntityBehavior;

  /** Relationships with other entities */
  readonly relationships: readonly EntityRelationship[];

  /** Computed loot table */
  readonly drops: ComputedLoot;

  /** Room ID where entity spawns */
  readonly roomId: number;

  /** Position within room */
  readonly position: { readonly x: number; readonly y: number };

  /** Distance from dungeon entrance */
  readonly distanceFromStart: number;

  /** Difficulty rating (0-1) */
  readonly difficulty: number;

  /** Tags for additional metadata */
  readonly tags: readonly string[];
}

// =============================================================================
// SEMANTIC ITEM
// =============================================================================

/**
 * Item purpose/function.
 */
export type ItemPurpose =
  | "healing" // Restores health
  | "buff" // Temporary buff
  | "key" // Unlocks something
  | "weapon" // Combat equipment
  | "armor" // Defensive equipment
  | "treasure" // Pure value/collectible
  | "quest" // Quest-related item
  | "consumable"; // Single-use effect

/**
 * A semantic item with context.
 */
export interface SemanticItem {
  /** Unique identifier */
  readonly id: string;

  /** Reference to the original spawn point */
  readonly spawnId: string;

  /** Template ID */
  readonly template: string;

  /** What this item is for */
  readonly purpose: ItemPurpose;

  /** Value/importance (0-1) */
  readonly value: number;

  /** Room ID where item spawns */
  readonly roomId: number;

  /** Position within room */
  readonly position: { readonly x: number; readonly y: number };

  /** What guards this item (entity ID) */
  readonly guardedBy?: string;

  /** What this unlocks (lock ID) */
  readonly unlocks?: string;

  /** Tags for additional metadata */
  readonly tags: readonly string[];
}

// =============================================================================
// ENRICHED STATE
// =============================================================================

/**
 * Dungeon state enriched with semantic content.
 */
export interface SemanticEnrichment {
  /** All semantic entities */
  readonly entities: readonly SemanticEntity[];

  /** All semantic items */
  readonly items: readonly SemanticItem[];

  /** Entity lookup by spawn ID */
  readonly entityBySpawnId: ReadonlyMap<string, SemanticEntity>;

  /** Item lookup by spawn ID */
  readonly itemBySpawnId: ReadonlyMap<string, SemanticItem>;

  /** Entities by room */
  readonly entitiesByRoom: ReadonlyMap<number, readonly SemanticEntity[]>;

  /** Items by room */
  readonly itemsByRoom: ReadonlyMap<number, readonly SemanticItem[]>;
}

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Template definition for enemy types.
 */
export interface EnemyTemplate {
  /** Template ID */
  readonly id: string;

  /** Display name */
  readonly name: string;

  /** Base difficulty (0-1) */
  readonly baseDifficulty: number;

  /** Preferred roles for this template */
  readonly preferredRoles: readonly EntityRole[];

  /** Base loot table */
  readonly baseLoot: ComputedLoot;

  /** Tags that apply to this template */
  readonly tags: readonly string[];
}

/**
 * Template definition for item types.
 */
export interface ItemTemplate {
  /** Template ID */
  readonly id: string;

  /** Display name */
  readonly name: string;

  /** Item purpose */
  readonly purpose: ItemPurpose;

  /** Base value */
  readonly baseValue: number;

  /** Rarity */
  readonly rarity: LootRarity;

  /** Tags that apply to this template */
  readonly tags: readonly string[];
}

/**
 * Configuration for semantic enrichment.
 */
export interface SemanticConfig {
  /** Available enemy templates */
  readonly enemyTemplates: readonly EnemyTemplate[];

  /** Available item templates */
  readonly itemTemplates: readonly ItemTemplate[];

  /** Role assignment weights by room type */
  readonly roleWeightsByRoomType: ReadonlyMap<string, ReadonlyMap<EntityRole, number>>;

  /** Difficulty scaling factor (higher = harder late game) */
  readonly difficultyScaling: number;

  /** Base gold drop range */
  readonly baseGoldRange: readonly [number, number];

  /** Base experience per difficulty unit */
  readonly baseExperience: number;
}

/**
 * Default enemy templates.
 */
export const DEFAULT_ENEMY_TEMPLATES: readonly EnemyTemplate[] = [
  {
    id: "goblin",
    name: "Goblin",
    baseDifficulty: 0.2,
    preferredRoles: ["minion", "patrol", "ambush"],
    baseLoot: {
      guaranteed: [],
      random: [{ itemId: "gold_coin", dropChance: 0.5, quantity: [1, 3], rarity: "common" }],
      goldRange: [5, 15],
      experience: 10,
    },
    tags: ["humanoid", "weak"],
  },
  {
    id: "skeleton",
    name: "Skeleton",
    baseDifficulty: 0.3,
    preferredRoles: ["patrol", "guardian", "minion"],
    baseLoot: {
      guaranteed: [],
      random: [{ itemId: "bone", dropChance: 0.3, quantity: [1, 2], rarity: "common" }],
      goldRange: [0, 5],
      experience: 15,
    },
    tags: ["undead"],
  },
  {
    id: "orc_warrior",
    name: "Orc Warrior",
    baseDifficulty: 0.5,
    preferredRoles: ["guardian", "elite", "patrol"],
    baseLoot: {
      guaranteed: [],
      random: [{ itemId: "orc_weapon", dropChance: 0.2, quantity: [1, 1], rarity: "uncommon" }],
      goldRange: [10, 30],
      experience: 25,
    },
    tags: ["humanoid", "strong"],
  },
  {
    id: "dark_mage",
    name: "Dark Mage",
    baseDifficulty: 0.6,
    preferredRoles: ["elite", "guardian", "ambush"],
    baseLoot: {
      guaranteed: [],
      random: [{ itemId: "spell_scroll", dropChance: 0.3, quantity: [1, 1], rarity: "rare" }],
      goldRange: [20, 50],
      experience: 40,
    },
    tags: ["humanoid", "magic"],
  },
  {
    id: "troll",
    name: "Troll",
    baseDifficulty: 0.8,
    preferredRoles: ["elite", "boss", "guardian"],
    baseLoot: {
      guaranteed: [{ itemId: "troll_hide", dropChance: 1, quantity: [1, 1], rarity: "uncommon" }],
      random: [],
      goldRange: [30, 80],
      experience: 60,
    },
    tags: ["monster", "regenerating"],
  },
];

/**
 * Default item templates.
 */
export const DEFAULT_ITEM_TEMPLATES: readonly ItemTemplate[] = [
  { id: "health_potion", name: "Health Potion", purpose: "healing", baseValue: 25, rarity: "common", tags: ["consumable"] },
  { id: "gold_coin", name: "Gold Coin", purpose: "treasure", baseValue: 1, rarity: "common", tags: ["currency"] },
  { id: "key_bronze", name: "Bronze Key", purpose: "key", baseValue: 50, rarity: "uncommon", tags: ["key", "bronze"] },
  { id: "key_silver", name: "Silver Key", purpose: "key", baseValue: 100, rarity: "rare", tags: ["key", "silver"] },
  { id: "key_gold", name: "Gold Key", purpose: "key", baseValue: 200, rarity: "epic", tags: ["key", "gold"] },
  { id: "sword_rusty", name: "Rusty Sword", purpose: "weapon", baseValue: 15, rarity: "common", tags: ["weapon", "melee"] },
  { id: "treasure_chest_loot", name: "Chest Contents", purpose: "treasure", baseValue: 100, rarity: "rare", tags: ["treasure"] },
];

/**
 * Default semantic configuration.
 */
export const DEFAULT_SEMANTIC_CONFIG: SemanticConfig = {
  enemyTemplates: DEFAULT_ENEMY_TEMPLATES,
  itemTemplates: DEFAULT_ITEM_TEMPLATES,
  roleWeightsByRoomType: new Map([
    ["entrance", new Map([["minion", 0.8], ["patrol", 0.2]])],
    ["normal", new Map([["minion", 0.4], ["patrol", 0.4], ["ambush", 0.2]])],
    ["treasure", new Map([["guardian", 0.7], ["ambush", 0.3]])],
    ["boss", new Map([["boss", 0.8], ["elite", 0.2]])],
    ["secret", new Map([["guardian", 0.5], ["elite", 0.5]])],
  ]),
  difficultyScaling: 1.5,
  baseGoldRange: [10, 50],
  baseExperience: 20,
};

// =============================================================================
// ERRORS
// =============================================================================

/**
 * Error thrown when semantic enrichment fails.
 */
export class SemanticEnrichmentError extends Error {
  constructor(
    message: string,
    public readonly spawnId?: string,
  ) {
    super(message);
    this.name = "SemanticEnrichmentError";
  }
}
