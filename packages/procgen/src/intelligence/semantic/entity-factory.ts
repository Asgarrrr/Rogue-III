/**
 * Entity Factory
 *
 * Creates semantic entities from spawn points, assigning appropriate
 * roles, behaviors, and loot based on context.
 */

import type { Room, SpawnPoint } from "../../pipeline/types";
import type {
  ComputedLoot,
  EnemyTemplate,
  EntityBehavior,
  EntityRelationship,
  EntityRole,
  ItemPurpose,
  ItemTemplate,
  LootDrop,
  SemanticConfig,
  SemanticEntity,
  SemanticItem,
} from "./types";
import {
  DEFAULT_BEHAVIORS,
  DEFAULT_SEMANTIC_CONFIG,
} from "./types";

// =============================================================================
// CONTEXT
// =============================================================================

/**
 * Context for entity creation.
 */
export interface EntityCreationContext {
  /** All rooms in the dungeon */
  readonly rooms: readonly Room[];

  /** Room lookup by ID */
  readonly roomById: ReadonlyMap<number, Room>;

  /** Distance from entrance for each room */
  readonly roomDistances: ReadonlyMap<number, number>;

  /** Maximum distance in dungeon */
  readonly maxDistance: number;

  /** Entities created so far (for relationships) */
  readonly createdEntities: Map<string, SemanticEntity>;

  /** Items created so far (for relationships) */
  readonly createdItems: Map<string, SemanticItem>;

  /** Semantic configuration */
  readonly config: SemanticConfig;

  /** RNG function */
  readonly rng: () => number;
}

// =============================================================================
// ROLE ASSIGNMENT
// =============================================================================

/**
 * Assign a role to an entity based on context.
 */
export function assignRole(
  spawn: SpawnPoint,
  room: Room,
  template: EnemyTemplate,
  ctx: EntityCreationContext,
): EntityRole {
  const { rng, config } = ctx;

  // Check for explicit role tag
  const roleTag = spawn.tags.find((t) => t.startsWith("role:"));
  if (roleTag) {
    const explicitRole = roleTag.substring(5) as EntityRole;
    if (template.preferredRoles.includes(explicitRole)) {
      return explicitRole;
    }
  }

  // Check for guardian tag
  if (spawn.tags.some((t) => t.startsWith("guards:"))) {
    return "guardian";
  }

  // Get weights for this room type
  const roomWeights = config.roleWeightsByRoomType.get(room.type);
  const preferredRoles = template.preferredRoles;

  if (roomWeights && preferredRoles.length > 0) {
    // Calculate weighted probabilities
    const weights: { role: EntityRole; weight: number }[] = [];
    let totalWeight = 0;

    for (const role of preferredRoles) {
      const weight = roomWeights.get(role) ?? 0.1;
      weights.push({ role, weight });
      totalWeight += weight;
    }

    // Select based on RNG
    const roll = rng() * totalWeight;
    let cumulative = 0;

    for (const { role, weight } of weights) {
      cumulative += weight;
      if (roll < cumulative) {
        return role;
      }
    }
  }

  // Default to first preferred role
  return preferredRoles[0] ?? "minion";
}

/**
 * Determine what an entity guards based on context.
 */
export function determineGuardTarget(
  spawn: SpawnPoint,
  room: Room,
  role: EntityRole,
  ctx: EntityCreationContext,
): string | undefined {
  if (role !== "guardian") return undefined;

  // Check for explicit guard tag
  const guardTag = spawn.tags.find((t) => t.startsWith("guards:"));
  if (guardTag) {
    return guardTag.substring(7);
  }

  // Infer from room type
  switch (room.type) {
    case "treasure":
      return `treasure-room-${room.id}`;
    case "boss":
      return `boss-room-${room.id}`;
    case "secret":
      return `secret-room-${room.id}`;
    default:
      // Guard the exit of this room
      return `room-exit-${room.id}`;
  }
}

// =============================================================================
// BEHAVIOR CREATION
// =============================================================================

/**
 * Create behavior for an entity based on role and context.
 */
export function createBehavior(
  role: EntityRole,
  room: Room,
  ctx: EntityCreationContext,
): EntityBehavior {
  const baseBehavior = DEFAULT_BEHAVIORS[role];
  const { rng } = ctx;

  // Adjust detection range based on room size
  const roomSize = Math.min(room.width, room.height);
  const adjustedRange = Math.min(
    baseBehavior.detectionRange,
    Math.floor(roomSize * 0.6),
  );

  // Create patrol path if needed
  let patrolPath: readonly number[] | undefined;
  if (baseBehavior.movement === "patrol") {
    // Simple patrol: stay in current room
    patrolPath = [room.id];
  }

  return {
    ...baseBehavior,
    detectionRange: adjustedRange,
    patrolPath,
  };
}

// =============================================================================
// LOOT COMPUTATION
// =============================================================================

/**
 * Compute loot table for an entity based on template and context.
 */
export function computeLoot(
  template: EnemyTemplate,
  role: EntityRole,
  difficulty: number,
  ctx: EntityCreationContext,
): ComputedLoot {
  const { config, rng } = ctx;
  const baseLoot = template.baseLoot;

  // Scale gold based on difficulty
  const goldMultiplier = 1 + difficulty * config.difficultyScaling;
  const scaledGoldRange: readonly [number, number] = [
    Math.floor(baseLoot.goldRange[0] * goldMultiplier),
    Math.floor(baseLoot.goldRange[1] * goldMultiplier),
  ];

  // Scale experience
  const scaledExperience = Math.floor(
    baseLoot.experience * (1 + difficulty * config.difficultyScaling),
  );

  // Boss and elite get bonus drops
  let bonusDrops: LootDrop[] = [];
  if (role === "boss") {
    bonusDrops.push({
      itemId: "boss_trophy",
      dropChance: 1,
      quantity: [1, 1],
      rarity: "epic",
    });
  } else if (role === "elite") {
    bonusDrops.push({
      itemId: "rare_material",
      dropChance: 0.5,
      quantity: [1, 2],
      rarity: "rare",
    });
  }

  return {
    guaranteed: [...baseLoot.guaranteed, ...bonusDrops.filter((d) => d.dropChance >= 1)],
    random: [...baseLoot.random, ...bonusDrops.filter((d) => d.dropChance < 1)],
    goldRange: scaledGoldRange,
    experience: scaledExperience,
  };
}

// =============================================================================
// RELATIONSHIP DETECTION
// =============================================================================

/**
 * Detect relationships between entities.
 */
export function detectRelationships(
  entity: Omit<SemanticEntity, "relationships">,
  ctx: EntityCreationContext,
): readonly EntityRelationship[] {
  const relationships: EntityRelationship[] = [];

  // Guardian relationship
  if (entity.guards) {
    relationships.push({
      type: "guards",
      targetId: entity.guards,
      strength: 1,
    });
  }

  // Command relationship for bosses
  if (entity.role === "boss") {
    // Boss commands all minions in same room
    for (const [id, other] of ctx.createdEntities) {
      if (other.roomId === entity.roomId && other.role === "minion") {
        relationships.push({
          type: "commands",
          targetId: id,
          strength: 0.8,
        });
      }
    }
  }

  // Alliance relationship for entities in same room
  for (const [id, other] of ctx.createdEntities) {
    if (
      other.roomId === entity.roomId &&
      other.id !== entity.id &&
      other.role !== "neutral" &&
      other.role !== "merchant"
    ) {
      relationships.push({
        type: "allies_with",
        targetId: id,
        strength: 0.5,
      });
    }
  }

  return relationships;
}

// =============================================================================
// ENTITY CREATION
// =============================================================================

/**
 * Select template for a spawn based on difficulty and tags.
 */
export function selectTemplate(
  spawn: SpawnPoint,
  targetDifficulty: number,
  ctx: EntityCreationContext,
): EnemyTemplate {
  const { config, rng } = ctx;
  const templates = config.enemyTemplates;

  // Check for explicit template tag
  const templateTag = spawn.tags.find((t) => t.startsWith("template:"));
  if (templateTag) {
    const templateId = templateTag.substring(9);
    const explicit = templates.find((t) => t.id === templateId);
    if (explicit) return explicit;
  }

  // Filter templates by tag compatibility
  const compatible = templates.filter((t) => {
    // Check if spawn requires specific tags
    const requiredTags = spawn.tags.filter((tag) => tag.startsWith("require:"));
    return requiredTags.every((req) => {
      const tagName = req.substring(8);
      return t.tags.includes(tagName);
    });
  });

  const candidates = compatible.length > 0 ? compatible : templates;

  // Score templates by difficulty match
  const scored = candidates.map((t) => ({
    template: t,
    score: 1 - Math.abs(t.baseDifficulty - targetDifficulty),
  }));

  // Sort by score and add some randomness
  scored.sort((a, b) => b.score - a.score);

  // Take from top 3 with weighted selection
  const top = scored.slice(0, 3);
  const totalScore = top.reduce((sum, s) => sum + s.score, 0);
  const roll = rng() * totalScore;

  let cumulative = 0;
  for (const { template, score } of top) {
    cumulative += score;
    if (roll < cumulative) {
      return template;
    }
  }

  return top[0]?.template ?? templates[0]!;
}

/**
 * Create a semantic entity from a spawn point.
 */
export function createSemanticEntity(
  spawn: SpawnPoint,
  ctx: EntityCreationContext,
): SemanticEntity {
  const room = ctx.roomById.get(spawn.roomId);
  if (!room) {
    throw new Error(`Room ${spawn.roomId} not found for spawn`);
  }

  // Calculate difficulty based on distance
  const distance = ctx.roomDistances.get(spawn.roomId) ?? 0;
  const normalizedDistance = ctx.maxDistance > 0 ? distance / ctx.maxDistance : 0;
  const targetDifficulty = normalizedDistance * ctx.config.difficultyScaling;

  // Select template
  const template = selectTemplate(spawn, targetDifficulty, ctx);

  // Assign role
  const role = assignRole(spawn, room, template, ctx);

  // Determine guard target
  const guards = determineGuardTarget(spawn, room, role, ctx);

  // Create behavior
  const behavior = createBehavior(role, room, ctx);

  // Compute difficulty
  const difficulty = Math.min(
    1,
    template.baseDifficulty * (1 + normalizedDistance * 0.5),
  );

  // Compute loot
  const drops = computeLoot(template, role, difficulty, ctx);

  // Create entity without relationships first
  const entityBase: Omit<SemanticEntity, "relationships"> = {
    id: `entity-${spawn.roomId}-${ctx.createdEntities.size}`,
    spawnId: `spawn-${spawn.roomId}-${spawn.type}-${spawn.position.x}-${spawn.position.y}`,
    template: template.id,
    role,
    guards,
    behavior,
    drops,
    roomId: spawn.roomId,
    position: spawn.position,
    distanceFromStart: spawn.distanceFromStart,
    difficulty,
    tags: [...template.tags, ...spawn.tags],
  };

  // Detect relationships
  const relationships = detectRelationships(entityBase, ctx);

  return {
    ...entityBase,
    relationships,
  };
}

// =============================================================================
// ITEM CREATION
// =============================================================================

/**
 * Determine item purpose from spawn and tags.
 */
export function determineItemPurpose(spawn: SpawnPoint): ItemPurpose {
  // Check for explicit purpose tag
  const purposeTag = spawn.tags.find((t) => t.startsWith("purpose:"));
  if (purposeTag) {
    return purposeTag.substring(8) as ItemPurpose;
  }

  // Infer from spawn type
  switch (spawn.type) {
    case "treasure":
      return "treasure";
    case "potion":
      return "healing";
    case "key":
      return "key";
    default:
      return "consumable";
  }
}

/**
 * Select item template based on spawn.
 */
export function selectItemTemplate(
  spawn: SpawnPoint,
  purpose: ItemPurpose,
  ctx: EntityCreationContext,
): ItemTemplate {
  const { config, rng } = ctx;

  // Check for explicit template
  const templateTag = spawn.tags.find((t) => t.startsWith("template:"));
  if (templateTag) {
    const templateId = templateTag.substring(9);
    const explicit = config.itemTemplates.find((t) => t.id === templateId);
    if (explicit) return explicit;
  }

  // Find templates matching purpose
  const matching = config.itemTemplates.filter((t) => t.purpose === purpose);
  if (matching.length === 0) {
    // Fallback to first template
    return config.itemTemplates[0]!;
  }

  // Random selection
  const index = Math.floor(rng() * matching.length);
  return matching[index]!;
}

/**
 * Create a semantic item from a spawn point.
 */
export function createSemanticItem(
  spawn: SpawnPoint,
  ctx: EntityCreationContext,
): SemanticItem {
  const room = ctx.roomById.get(spawn.roomId);
  if (!room) {
    throw new Error(`Room ${spawn.roomId} not found for spawn`);
  }

  // Determine purpose
  const purpose = determineItemPurpose(spawn);

  // Select template
  const template = selectItemTemplate(spawn, purpose, ctx);

  // Calculate value based on distance
  const distance = ctx.roomDistances.get(spawn.roomId) ?? 0;
  const normalizedDistance = ctx.maxDistance > 0 ? distance / ctx.maxDistance : 0;
  const value = Math.min(1, template.baseValue / 100 * (1 + normalizedDistance * 0.5));

  // Determine what guards this item
  let guardedBy: string | undefined;
  for (const [id, entity] of ctx.createdEntities) {
    if (
      entity.roomId === spawn.roomId &&
      entity.role === "guardian" &&
      entity.guards?.includes(`room-${spawn.roomId}`)
    ) {
      guardedBy = id;
      break;
    }
  }

  // Determine what this unlocks
  let unlocks: string | undefined;
  if (purpose === "key") {
    const lockTag = spawn.tags.find((t) => t.startsWith("unlocks:"));
    if (lockTag) {
      unlocks = lockTag.substring(8);
    }
  }

  return {
    id: `item-${spawn.roomId}-${ctx.createdItems.size}`,
    spawnId: `spawn-${spawn.roomId}-${spawn.type}-${spawn.position.x}-${spawn.position.y}`,
    template: template.id,
    purpose,
    value,
    roomId: spawn.roomId,
    position: spawn.position,
    guardedBy,
    unlocks,
    tags: [...template.tags, ...spawn.tags],
  };
}

// =============================================================================
// FACTORY INTERFACE
// =============================================================================

/**
 * Create a semantic entity factory.
 */
export function createEntityFactory(
  config: Partial<SemanticConfig> = {},
): {
  createEntity: (spawn: SpawnPoint, ctx: EntityCreationContext) => SemanticEntity;
  createItem: (spawn: SpawnPoint, ctx: EntityCreationContext) => SemanticItem;
} {
  const fullConfig: SemanticConfig = {
    ...DEFAULT_SEMANTIC_CONFIG,
    ...config,
  };

  return {
    createEntity: (spawn, ctx) =>
      createSemanticEntity(spawn, { ...ctx, config: fullConfig }),
    createItem: (spawn, ctx) =>
      createSemanticItem(spawn, { ...ctx, config: fullConfig }),
  };
}
