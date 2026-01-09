/**
 * Dungeon Content Generator
 *
 * Procedurally generates entity spawn descriptors for dungeons.
 * Uses deterministic seeded RNG to ensure reproducibility.
 */

import { SeededRandom } from "../core/random/seeded-random";
import type { Room } from "../core/types";
import type { DungeonSeed } from "../core/types/dungeon.types";
import type { Connection } from "../entities/connection";
import type { EntitySpawnDescriptor } from "../entities/dungeon";

/**
 * Content generation configuration
 */
export interface ContentGenerationConfig {
  /** Difficulty level (1-10) - affects enemy count and tier */
  difficulty: number;

  /** Enemy spawn density (0-1) - 0 = none, 1 = maximum */
  enemyDensity: number;

  /** Item spawn density (0-1) */
  itemDensity: number;

  /** Trap spawn chance in corridors (0-1) */
  trapChance: number;

  /** Decoration spawn chance in rooms (0-1) */
  decorationChance: number;

  /** Enable special treasure rooms */
  enableTreasureRooms: boolean;

  /** Enable trap placement */
  enableTraps: boolean;
}

/**
 * Default content generation configuration
 */
export const DEFAULT_CONTENT_CONFIG: ContentGenerationConfig = {
  difficulty: 5,
  enemyDensity: 0.7,
  itemDensity: 0.5,
  trapChance: 0.2,
  decorationChance: 0.3,
  enableTreasureRooms: true,
  enableTraps: true,
};

/**
 * Weighted entity pool entry
 */
interface WeightedEntity {
  templateId: string;
  weight: number; // Higher = more common
  minDifficulty: number; // Minimum difficulty to spawn
  maxDifficulty: number; // Maximum difficulty to spawn
}

/**
 * Enemy pool - weighted by difficulty
 */
const ENEMY_POOL: readonly WeightedEntity[] = [
  // Easy enemies
  { templateId: "goblin", weight: 100, minDifficulty: 1, maxDifficulty: 10 },
  { templateId: "rat", weight: 80, minDifficulty: 1, maxDifficulty: 5 },

  // Medium enemies
  { templateId: "orc", weight: 60, minDifficulty: 3, maxDifficulty: 10 },
  { templateId: "skeleton", weight: 50, minDifficulty: 3, maxDifficulty: 10 },

  // Hard enemies
  {
    templateId: "orc_warrior",
    weight: 30,
    minDifficulty: 5,
    maxDifficulty: 10,
  },
  { templateId: "troll", weight: 20, minDifficulty: 7, maxDifficulty: 10 },
];

/**
 * Item pool - weighted by rarity
 */
const ITEM_POOL: readonly WeightedEntity[] = [
  // Common items
  {
    templateId: "potion_health",
    weight: 100,
    minDifficulty: 1,
    maxDifficulty: 10,
  },
  {
    templateId: "potion_mana",
    weight: 60,
    minDifficulty: 1,
    maxDifficulty: 10,
  },

  // Uncommon items
  {
    templateId: "weapon_sword",
    weight: 40,
    minDifficulty: 2,
    maxDifficulty: 10,
  },
  {
    templateId: "armor_leather",
    weight: 35,
    minDifficulty: 2,
    maxDifficulty: 10,
  },
  {
    templateId: "weapon_dagger",
    weight: 50,
    minDifficulty: 1,
    maxDifficulty: 10,
  },

  // Rare items
  {
    templateId: "scroll_teleport",
    weight: 20,
    minDifficulty: 4,
    maxDifficulty: 10,
  },
  {
    templateId: "armor_chainmail",
    weight: 15,
    minDifficulty: 5,
    maxDifficulty: 10,
  },
  {
    templateId: "weapon_axe",
    weight: 25,
    minDifficulty: 3,
    maxDifficulty: 10,
  },
];

/**
 * Trap pool
 */
const TRAP_POOL: readonly WeightedEntity[] = [
  {
    templateId: "trap_spike",
    weight: 100,
    minDifficulty: 1,
    maxDifficulty: 10,
  },
  { templateId: "trap_arrow", weight: 60, minDifficulty: 3, maxDifficulty: 10 },
  { templateId: "trap_fire", weight: 30, minDifficulty: 5, maxDifficulty: 10 },
  {
    templateId: "trap_teleport",
    weight: 20,
    minDifficulty: 7,
    maxDifficulty: 10,
  },
];

/**
 * Decoration pool
 */
const DECORATION_POOL: readonly WeightedEntity[] = [
  { templateId: "fountain", weight: 50, minDifficulty: 1, maxDifficulty: 10 },
  { templateId: "statue", weight: 60, minDifficulty: 1, maxDifficulty: 10 },
  { templateId: "pillar", weight: 80, minDifficulty: 1, maxDifficulty: 10 },
];

/**
 * Dungeon content generator
 * Generates procedural entity spawn descriptors using seeded RNG
 */
export class DungeonContentGenerator {
  private readonly rng: SeededRandom;
  private readonly config: Required<ContentGenerationConfig>;

  constructor(
    seeds: DungeonSeed,
    config: Partial<ContentGenerationConfig> = {},
  ) {
    this.rng = new SeededRandom(seeds.details);
    // Merge user config with defaults, ensuring all fields are defined
    this.config = {
      difficulty: config.difficulty ?? DEFAULT_CONTENT_CONFIG.difficulty,
      enemyDensity: config.enemyDensity ?? DEFAULT_CONTENT_CONFIG.enemyDensity,
      itemDensity: config.itemDensity ?? DEFAULT_CONTENT_CONFIG.itemDensity,
      trapChance: config.trapChance ?? DEFAULT_CONTENT_CONFIG.trapChance,
      decorationChance:
        config.decorationChance ?? DEFAULT_CONTENT_CONFIG.decorationChance,
      enableTreasureRooms:
        config.enableTreasureRooms ??
        DEFAULT_CONTENT_CONFIG.enableTreasureRooms,
      enableTraps: config.enableTraps ?? DEFAULT_CONTENT_CONFIG.enableTraps,
    };
  }

  /**
   * Generate all spawn descriptors for the dungeon
   */
  generateContent(
    rooms: Room[],
    connections: Connection[],
  ): EntitySpawnDescriptor[] {
    const entities: EntitySpawnDescriptor[] = [];

    // Generate room contents
    for (const room of rooms) {
      entities.push(...this.generateRoomContent(room));
    }

    // Generate corridor contents
    for (const connection of connections) {
      entities.push(...this.generateCorridorContent(connection));
    }

    return entities;
  }

  /**
   * Generate content for a single room
   */
  private generateRoomContent(room: Room): EntitySpawnDescriptor[] {
    const entities: EntitySpawnDescriptor[] = [];

    // Determine room type
    const isTreasureRoom =
      this.config.enableTreasureRooms && this.rng.probability(0.15);

    if (isTreasureRoom) {
      entities.push(...this.generateTreasureRoom(room));
    } else {
      // Normal room: enemies + items + decorations
      entities.push(...this.generateEnemies(room));
      entities.push(...this.generateItems(room));
      entities.push(...this.generateDecorations(room));
    }

    return entities;
  }

  /**
   * Generate enemies for a room
   */
  private generateEnemies(room: Room): EntitySpawnDescriptor[] {
    const entities: EntitySpawnDescriptor[] = [];

    // Calculate enemy count based on room size
    const area = room.width * room.height;
    const baseCount = Math.floor(area / 30); // ~1 enemy per 30 tiles
    const enemyCount = Math.max(
      0,
      Math.floor(
        baseCount * this.config.enemyDensity * (0.5 + this.rng.next() * 0.5),
      ),
    );

    if (enemyCount === 0) return entities;

    // Filter enemies by difficulty
    const validEnemies = ENEMY_POOL.filter(
      (e) =>
        e.minDifficulty <= this.config.difficulty &&
        e.maxDifficulty >= this.config.difficulty,
    );

    if (validEnemies.length === 0) return entities;

    for (let i = 0; i < enemyCount; i++) {
      const enemy = this.selectWeighted(validEnemies);
      const pos = this.randomRoomPosition(room);

      entities.push({
        templateId: enemy.templateId,
        position: pos,
        metadata: {
          source: "room",
          roomId: room.id,
          tier: this.config.difficulty,
        },
      });
    }

    return entities;
  }

  /**
   * Generate items for a room
   */
  private generateItems(room: Room): EntitySpawnDescriptor[] {
    const entities: EntitySpawnDescriptor[] = [];

    // Calculate item count
    const area = room.width * room.height;
    const baseCount = Math.floor(area / 50); // ~1 item per 50 tiles
    const itemCount = Math.floor(
      baseCount * this.config.itemDensity * (0.3 + this.rng.next() * 0.7),
    );

    if (itemCount === 0) return entities;

    for (let i = 0; i < itemCount; i++) {
      const validItems = ITEM_POOL.filter(
        (e) =>
          e.minDifficulty <= this.config.difficulty &&
          e.maxDifficulty >= this.config.difficulty,
      );

      if (validItems.length === 0) continue;

      const item = this.selectWeighted(validItems);
      const pos = this.randomRoomPosition(room);

      entities.push({
        templateId: item.templateId,
        position: pos,
        metadata: { source: "room", roomId: room.id },
      });
    }

    return entities;
  }

  /**
   * Generate treasure room contents (more valuable items)
   */
  private generateTreasureRoom(room: Room): EntitySpawnDescriptor[] {
    const entities: EntitySpawnDescriptor[] = [];

    // Treasure rooms have fewer but stronger enemies
    const guardianCount = this.rng.range(1, 3);
    const strongEnemies = ENEMY_POOL.filter(
      (e) => e.weight <= 40 && e.minDifficulty <= this.config.difficulty,
    );

    if (strongEnemies.length > 0) {
      for (let i = 0; i < guardianCount; i++) {
        const enemy = this.selectWeighted(strongEnemies);
        const pos = this.randomRoomPosition(room);

        entities.push({
          templateId: enemy.templateId,
          position: pos,
          metadata: {
            source: "treasure",
            roomId: room.id,
            tier: this.config.difficulty,
          },
        });
      }
    }

    // More and better items
    const itemCount = this.rng.range(3, 6);
    const rareItems = ITEM_POOL.filter(
      (e) =>
        e.weight <= 50 &&
        e.minDifficulty <= this.config.difficulty &&
        e.maxDifficulty >= this.config.difficulty,
    );

    if (rareItems.length > 0) {
      for (let i = 0; i < itemCount; i++) {
        const item = this.selectWeighted(rareItems);
        const pos = this.randomRoomPosition(room);

        entities.push({
          templateId: item.templateId,
          position: pos,
          metadata: { source: "treasure", roomId: room.id },
        });
      }
    }

    // Add decorations
    entities.push(...this.generateDecorations(room, 0.6)); // Higher chance

    return entities;
  }

  /**
   * Generate decorations for a room
   */
  private generateDecorations(
    room: Room,
    chanceOverride?: number,
  ): EntitySpawnDescriptor[] {
    const entities: EntitySpawnDescriptor[] = [];
    const chance = chanceOverride ?? this.config.decorationChance;

    if (!this.rng.probability(chance)) return entities;

    const decorationCount = this.rng.range(1, 3);

    for (let i = 0; i < decorationCount; i++) {
      const decoration = this.selectWeighted(DECORATION_POOL);
      const pos = this.randomRoomPosition(room);

      entities.push({
        templateId: decoration.templateId,
        position: pos,
        metadata: { source: "room", roomId: room.id },
      });
    }

    return entities;
  }

  /**
   * Generate corridor content (traps, occasional items)
   */
  private generateCorridorContent(
    connection: Connection,
  ): EntitySpawnDescriptor[] {
    const entities: EntitySpawnDescriptor[] = [];

    // Random chance of trap
    if (
      this.config.enableTraps &&
      this.rng.probability(this.config.trapChance)
    ) {
      const validTraps = TRAP_POOL.filter(
        (e) =>
          e.minDifficulty <= this.config.difficulty &&
          e.maxDifficulty >= this.config.difficulty,
      );

      if (validTraps.length > 0) {
        const trap = this.selectWeighted(validTraps);
        const pos = this.getCorridorMidpoint(connection);

        entities.push({
          templateId: trap.templateId,
          position: pos,
          metadata: { source: "corridor" },
        });
      }
    }

    return entities;
  }

  /**
   * Weighted random selection from pool
   */
  private selectWeighted(pool: readonly WeightedEntity[]): WeightedEntity {
    const totalWeight = pool.reduce((sum, e) => sum + e.weight, 0);
    let random = this.rng.next() * totalWeight;

    for (const entity of pool) {
      random -= entity.weight;
      if (random <= 0) return entity;
    }

    return pool[pool.length - 1]; // Fallback
  }

  /**
   * Get random position inside room (avoiding edges)
   */
  private randomRoomPosition(room: Room): { x: number; y: number } {
    const padding = 1;
    const maxWidth = Math.max(1, room.width - padding * 2);
    const maxHeight = Math.max(1, room.height - padding * 2);

    const x = room.x + padding + this.rng.range(0, maxWidth);
    const y = room.y + padding + this.rng.range(0, maxHeight);
    return { x, y };
  }

  /**
   * Get midpoint of corridor
   */
  private getCorridorMidpoint(connection: Connection): {
    x: number;
    y: number;
  } {
    return {
      x: Math.floor((connection.from.x + connection.to.x) / 2),
      y: Math.floor((connection.from.y + connection.to.y) / 2),
    };
  }
}
