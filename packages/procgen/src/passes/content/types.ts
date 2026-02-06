/**
 * Content Placement Types
 *
 * Types for rule-based content spawning in dungeons.
 */

import type { Point } from "../../core/geometry/types";
import type { Expression } from "../../core/rules/expression";

/**
 * Spawn action - what to place in the dungeon
 */
export interface SpawnAction {
  readonly type: "spawn";
  /** Template name for the entity to spawn */
  readonly template: string;
  /** Number of entities to spawn (can be expression) */
  readonly count: number | Expression;
  /** Tags to apply to spawned entities */
  readonly tags: readonly string[];
  /** Spawn weight for random selection */
  readonly weight?: number;
  /** Minimum distance from entrance (in room hops) */
  readonly minDistanceFromStart?: number;
  /** Maximum distance from entrance (in room hops) */
  readonly maxDistanceFromStart?: number;
  /** Restrict to specific room types */
  readonly roomTypes?: readonly string[];
  /** Avoid specific room types */
  readonly excludeRoomTypes?: readonly string[];
}

/**
 * Decoration action - place visual elements
 */
export interface DecorationAction {
  readonly type: "decoration";
  /** Template name for the decoration */
  readonly template: string;
  /** Density per floor tile (0-1) */
  readonly density: number;
  /** Tags for filtering */
  readonly tags: readonly string[];
  /** Whether decoration blocks movement */
  readonly blocking?: boolean;
}

/**
 * Marker action - place invisible markers for game logic
 */
export interface MarkerAction {
  readonly type: "marker";
  /** Marker identifier */
  readonly markerId: string;
  /** Data to attach to the marker */
  readonly data?: Record<string, unknown>;
}

/**
 * Union of all content actions
 */
export type ContentAction = SpawnAction | DecorationAction | MarkerAction;

/**
 * Context available to spawn rules
 */
export interface SpawnRuleContext {
  /** Room properties */
  readonly room: {
    readonly id: number;
    readonly type: string;
    readonly width: number;
    readonly height: number;
    readonly area: number;
    readonly centerX: number;
    readonly centerY: number;
    /** Distance from entrance in room hops */
    readonly distanceFromStart: number;
    /** Normalized distance (0-1 range) */
    readonly normalizedDistance: number;
    /** Number of connections to this room */
    readonly connectionCount: number;
    /** Whether this is a dead end (1 connection) */
    readonly isDeadEnd: boolean;
    /** Whether this is a hub (3+ connections) */
    readonly isHub: boolean;
  };
  /** Dungeon properties */
  readonly dungeon: {
    readonly width: number;
    readonly height: number;
    readonly roomCount: number;
    readonly connectionCount: number;
    readonly depth: number;
    readonly difficulty: number;
  };
  /** Current placement state */
  readonly state: {
    /** Total spawns placed so far */
    readonly totalSpawns: number;
    /** Spawns by type */
    readonly spawnsByType: Readonly<Record<string, number>>;
    /** Rooms already processed */
    readonly processedRooms: number;
  };
}

/**
 * Result of placing a spawn
 */
export interface PlacedSpawn {
  readonly position: Point;
  readonly roomId: number;
  readonly template: string;
  readonly type: string;
  readonly tags: readonly string[];
  readonly weight: number;
  readonly distanceFromStart: number;
  readonly ruleId: string;
}

/**
 * Spawn placement options
 */
export interface SpawnPlacementOptions {
  /** Minimum distance between spawns of same type */
  readonly minSpawnDistance?: number;
  /** Whether to avoid placing on room edges */
  readonly avoidEdges?: boolean;
  /** Edge padding (tiles from room boundary) */
  readonly edgePadding?: number;
  /** Whether spawns must be on floor tiles */
  readonly requireFloor?: boolean;
  /** Maximum retries for finding valid position */
  readonly maxRetries?: number;
}

/**
 * Default spawn placement options
 */
export const DEFAULT_SPAWN_OPTIONS: Required<SpawnPlacementOptions> = {
  minSpawnDistance: 2,
  avoidEdges: true,
  edgePadding: 1,
  requireFloor: true,
  maxRetries: 10,
};

/**
 * Configuration for rule-based spawning
 */
export interface RuleSpawnerConfig {
  /** JSON rules or parsed rules */
  readonly rules: string | readonly ContentRule[];
  /** Spawn placement options */
  readonly placement?: SpawnPlacementOptions;
  /** Custom context data to inject */
  readonly context?: Record<string, unknown>;
  /** Whether to trace rule evaluations */
  readonly trace?: boolean;
}

/**
 * A content placement rule
 */
export interface ContentRule {
  readonly id: string;
  readonly priority: number;
  readonly condition: Expression;
  readonly action: ContentAction;
  readonly description?: string;
  readonly tags?: readonly string[];
  readonly enabled?: boolean;
  readonly exclusive?: boolean;
}
