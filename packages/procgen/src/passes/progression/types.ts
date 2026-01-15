/**
 * Progression Types
 *
 * Types for lock-and-key progression patterns in dungeon generation.
 */

import type { Point } from "../../core/geometry/types";

/**
 * A lock that blocks passage through a connection until a key is collected
 */
export interface Lock {
  /** Unique identifier for this lock */
  readonly id: string;
  /** Type of key required to unlock (e.g., "red_key", "boss_defeated") */
  readonly type: string;
  /** ID of the connection that is locked */
  readonly connectionIndex: number;
  /** Visual/game representation hint */
  readonly variant?: "door" | "gate" | "barrier" | "puzzle";
}

/**
 * A key that can unlock a specific type of lock
 */
export interface Key {
  /** Unique identifier for this key */
  readonly id: string;
  /** Type of lock this key opens */
  readonly type: string;
  /** Room where the key is placed */
  readonly roomId: number;
  /** Exact spawn position for the key */
  readonly position: Point;
  /** Visual/game representation hint */
  readonly variant?: "key" | "switch" | "item" | "boss_drop";
}

/**
 * Complete progression graph describing lock-and-key structure
 */
export interface ProgressionGraph {
  /** All locks in the dungeon */
  readonly locks: readonly Lock[];
  /** All keys in the dungeon */
  readonly keys: readonly Key[];
  /** Whether the progression is beatable (exit reachable from entrance) */
  readonly solvable: boolean;
  /** Room IDs in the order they must be visited (critical path) */
  readonly criticalPath: readonly number[];
  /** Total key count by type */
  readonly keyCountsByType: Readonly<Record<string, number>>;
}

/**
 * Configuration for lock-and-key generation
 */
export interface LockAndKeyConfig {
  /** Available key types in order of discovery */
  readonly keyTypes: readonly string[];
  /** Probability (0-1) that a connection is locked */
  readonly lockProbability: number;
  /** Minimum room distance from entrance before placing locks */
  readonly minDistanceFromStart: number;
  /** Maximum number of locks to place */
  readonly maxLocks: number;
  /** Whether to ensure the critical path requires all keys */
  readonly requireAllKeys: boolean;
}

/**
 * Default lock-and-key configuration
 */
export const DEFAULT_LOCK_AND_KEY_CONFIG: LockAndKeyConfig = {
  keyTypes: ["red_key", "blue_key", "gold_key"],
  lockProbability: 0.3,
  minDistanceFromStart: 2,
  maxLocks: 3,
  requireAllKeys: false,
};
