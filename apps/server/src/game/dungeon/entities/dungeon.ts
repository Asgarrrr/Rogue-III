import type { Room } from "../core/types";
import type { DungeonConfig, DungeonSeed } from "../core/types/dungeon.types";
import type { Connection } from "./connection";

/**
 * Tile types matching GameMap TileType enum for zero-copy integration
 */
export enum TerrainTileType {
  Wall = 0,
  Floor = 1,
  Door = 2,
  Water = 3,
  Lava = 4,
}

/**
 * Entity spawn descriptor for ECS integration.
 * Describes an entity to be instantiated from a template with optional overrides.
 */
export interface EntitySpawnDescriptor {
  /** Template ID to instantiate (e.g., "orc", "health_potion", "door") */
  templateId: string;

  /** Position in dungeon coordinates */
  position: { x: number; y: number };

  /** Optional component overrides for the template */
  components?: Record<string, unknown>;

  /** Optional metadata for debugging and analytics */
  metadata?: {
    /** Source of the spawn ("room" | "corridor" | "treasure" | "entrance") */
    source?: string;
    /** Room ID if spawned in a room */
    roomId?: number;
    /** Difficulty tier (for balancing) */
    tier?: number;
  };
}

/**
 * Optimized terrain representation for zero-copy transfer to GameMap.
 * Uses Uint8Array for direct compatibility with ECS GameMap resource.
 */
export interface DungeonTerrain {
  /** Terrain width in tiles */
  width: number;

  /** Terrain height in tiles */
  height: number;

  /**
   * Flat tile array: tiles[y * width + x]
   * Values are TerrainTileType (0=Wall, 1=Floor, 2=Door, etc.)
   * Can be directly transferred to GameMap.setRawTiles() with ZERO COPY
   */
  tiles: Uint8Array;
}

/**
 * Entity spawn data generated procedurally during dungeon generation.
 * Includes player spawn and all other entities (enemies, items, decorations, etc.)
 */
export interface DungeonSpawnData {
  /** Player spawn position (typically center of starting room) */
  playerSpawn: { x: number; y: number };

  /** All entities to spawn in the dungeon */
  entities: EntitySpawnDescriptor[];
}

/**
 * Complete dungeon representation optimized for ECS integration.
 *
 * Design principles:
 * - Zero-copy terrain transfer (Uint8Array → GameMap)
 * - Declarative entity spawning (descriptors → templates)
 * - Full determinism (reproducible from seeds + checksum)
 * - No ECS coupling (dungeon module doesn't depend on ECS)
 */
export interface Dungeon {
  /** Room definitions (geometry, metadata) */
  rooms: Room[];

  /** Corridor connections between rooms */
  connections: Connection[];

  /** Generation configuration used */
  config: DungeonConfig;

  /** Seeds used for deterministic generation */
  seeds: DungeonSeed;

  /** Checksum for validation and sharing */
  checksum: string;

  /** Optimized terrain data (zero-copy compatible with GameMap) */
  terrain: DungeonTerrain;

  /** Entity spawn descriptors (procedurally generated content) */
  spawnData: DungeonSpawnData;

  /** Get the dungeon checksum */
  getChecksum(): string;

  /** Gets terrain tile at position. Returns Wall for out-of-bounds. */
  getTile(x: number, y: number): TerrainTileType;

  /** Checks if position is walkable (floor or door). */
  isWalkable(x: number, y: number): boolean;

  /** Converts terrain to legacy boolean grid format (for debugging/visualization). */
  toLegacyGrid(): boolean[][];
}

/**
 * Concrete implementation of Dungeon interface.
 */
export class DungeonImpl implements Dungeon {
  rooms: Room[];
  connections: Connection[];
  config: DungeonConfig;
  seeds: DungeonSeed;
  checksum: string;
  terrain: DungeonTerrain;
  spawnData: DungeonSpawnData;

  constructor(options: {
    rooms: Room[];
    connections: Connection[];
    config: DungeonConfig;
    seeds: DungeonSeed;
    checksum: string;
    terrain: DungeonTerrain;
    spawnData: DungeonSpawnData;
  }) {
    this.rooms = options.rooms;
    this.connections = options.connections;
    this.config = options.config;
    this.seeds = options.seeds;
    this.checksum = options.checksum;
    this.terrain = options.terrain;
    this.spawnData = options.spawnData;
  }

  getChecksum(): string {
    return this.checksum;
  }

  /**
   * Converts terrain to legacy boolean grid format (for debugging/visualization).
   * Note: This is a utility method, the canonical format is terrain.tiles.
   */
  toLegacyGrid(): boolean[][] {
    const grid: boolean[][] = [];
    for (let y = 0; y < this.terrain.height; y++) {
      grid[y] = [];
      for (let x = 0; x < this.terrain.width; x++) {
        const tile = this.terrain.tiles[y * this.terrain.width + x];
        grid[y][x] = tile === TerrainTileType.Wall;
      }
    }
    return grid;
  }

  /**
   * Gets terrain tile at position.
   */
  getTile(x: number, y: number): TerrainTileType {
    if (x < 0 || x >= this.terrain.width || y < 0 || y >= this.terrain.height) {
      return TerrainTileType.Wall;
    }
    return this.terrain.tiles[y * this.terrain.width + x];
  }

  /**
   * Checks if position is walkable floor.
   */
  isWalkable(x: number, y: number): boolean {
    const tile = this.getTile(x, y);
    return tile === TerrainTileType.Floor || tile === TerrainTileType.Door;
  }
}
