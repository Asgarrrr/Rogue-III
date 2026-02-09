/**
 * Pipeline Artifacts
 *
 * Typed intermediate and final data products for generation pipelines.
 */

import type { DungeonSeed } from "@rogue/contracts";
import type { Point } from "../../core/geometry/types";
import type { Grid } from "../../core/grid/grid";
import type { Region } from "../../core/grid/types";
import type { RoomTemplate } from "../../prefabs/types";

// =============================================================================
// BASE ARTIFACT
// =============================================================================

/**
 * Base artifact interface. All artifacts have a type discriminant and unique ID.
 */
export interface Artifact<T extends string = string> {
  readonly type: T;
  readonly id: string;
}

// =============================================================================
// ARTIFACT TYPES
// =============================================================================

/**
 * Empty artifact - starting point for pipelines
 */
export interface EmptyArtifact extends Artifact<"empty"> {
  readonly type: "empty";
}

/**
 * Grid artifact - 2D cell grid
 */
export interface GridArtifact extends Artifact<"grid"> {
  readonly type: "grid";
  readonly width: number;
  readonly height: number;
  readonly cells: Uint8Array;
  readonly grid?: Grid;
}

/**
 * Room type - structural categories only.
 * Game-specific types (boss, treasure, library, etc.) should be handled by game layer.
 */
export type RoomType = "normal" | "cavern";

/**
 * Room definition with structural metadata.
 * Game layer can use metadata to make decisions about room purpose.
 */
export interface Room {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly centerX: number;
  readonly centerY: number;
  /** Structural type - game layer adds semantic meaning */
  readonly type: RoomType;
  readonly seed: number;
  /** Optional room template for non-rectangular shapes */
  readonly template?: RoomTemplate;

  // === Structural Metadata (computed by procgen) ===

  /** Number of corridor connections to other rooms */
  readonly connectionCount?: number;
  /** True if room has only one connection (dead-end) */
  readonly isDeadEnd?: boolean;
  /** Manhattan distance from entrance room */
  readonly distanceFromEntrance?: number;
}

/**
 * Rooms artifact - collection of placed rooms
 */
export interface RoomsArtifact extends Artifact<"rooms"> {
  readonly type: "rooms";
  readonly rooms: readonly Room[];
}

/**
 * Connection type - describes the nature of the connection between rooms.
 *
 * - "open": No obstruction, free passage
 * - "door": Standard door (can be opened/closed)
 * - "locked_door": Requires key to open
 * - "secret": Hidden passage, not visible by default
 * - "bridge": Passage over void/water/hazard
 * - "one_way": Can only be traversed in one direction (fromRoom -> toRoom)
 */
export type ConnectionType =
  | "open"
  | "door"
  | "locked_door"
  | "secret"
  | "bridge"
  | "one_way";

/**
 * Connection metadata - extensible data for game-specific properties.
 */
export interface ConnectionMeta {
  /** Required key ID for locked doors */
  readonly keyId?: string;
  /** Whether this connection is visible on map (false for secrets until discovered) */
  readonly visible?: boolean;
  /** Traversability cost modifier (1.0 = normal, higher = harder) */
  readonly traversalCost?: number;
  /** Tags for game logic (e.g., ["requires_lever", "trapped"]) */
  readonly tags?: readonly string[];
}

/**
 * Connection between two rooms
 */
export interface Connection {
  readonly fromRoomId: number;
  readonly toRoomId: number;
  readonly pathLength: number;
  readonly path?: readonly Point[];
  /** Type of connection - defaults to "open" if not specified */
  readonly type?: ConnectionType;
  /** Position of the door/gate if applicable */
  readonly doorPosition?: Point;
  /** Optional metadata for game-specific properties */
  readonly metadata?: ConnectionMeta;
}

/**
 * Graph artifact - room connectivity graph
 */
export interface GraphArtifact extends Artifact<"graph"> {
  readonly type: "graph";
  readonly nodes: readonly number[];
  readonly edges: readonly [number, number][];
  readonly connections?: readonly Connection[];
}

/**
 * Regions artifact - identified connected regions
 */
export interface RegionsArtifact extends Artifact<"regions"> {
  readonly type: "regions";
  readonly regions: readonly Region[];
}

/**
 * BSP tree node
 */
export interface BSPNode {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly leftChild?: BSPNode;
  readonly rightChild?: BSPNode;
  readonly room?: Room;
}

/**
 * BSP tree artifact
 */
export interface BSPTreeArtifact extends Artifact<"bsp-tree"> {
  readonly type: "bsp-tree";
  readonly root: BSPNode;
  readonly leaves: readonly BSPNode[];
}

/**
 * Spawn point types - structural positions only.
 * Game-specific spawns (enemies, treasures) should be handled by game layer.
 */
export type SpawnPointType = "entrance" | "exit";

/**
 * Individual spawn point.
 */
export interface SpawnPoint {
  readonly position: Point;
  readonly roomId: number;
  /** Structural type - use tags for game-specific categorization */
  readonly type: SpawnPointType;
  /** Free-form tags for game layer to interpret */
  readonly tags: readonly string[];
  /** Hint for relative importance (0-1) */
  readonly weight: number;
  /** Structural info: distance from entrance in room-hops */
  readonly distanceFromStart: number;
}

/**
 * Spawn artifact - placement points for game entities
 */
export interface SpawnArtifact extends Artifact<"spawns"> {
  readonly type: "spawns";
  readonly points: readonly SpawnPoint[];
}

/**
 * Validation violation
 */
export interface Violation {
  readonly type: string;
  readonly message: string;
  readonly severity: "error" | "warning";
}

/**
 * Successful validation artifact.
 * May contain warnings, but no errors.
 */
export interface ValidationArtifactSuccess extends Artifact<"validation"> {
  readonly type: "validation";
  readonly violations: readonly Violation[];
  readonly success: true;
}

/**
 * Failed validation artifact.
 * Contains at least one error-level violation.
 */
export interface ValidationArtifactFailure extends Artifact<"validation"> {
  readonly type: "validation";
  readonly violations: readonly Violation[];
  readonly success: false;
}

/**
 * Validation artifact - discriminated union.
 * Use `if (artifact.success)` to narrow to success/failure types.
 */
export type ValidationArtifact =
  | ValidationArtifactSuccess
  | ValidationArtifactFailure;

/**
 * Final dungeon artifact - complete generation result
 */
export interface DungeonArtifact extends Artifact<"dungeon"> {
  readonly type: "dungeon";
  readonly width: number;
  readonly height: number;
  readonly terrain: Uint8Array;
  readonly rooms: readonly Room[];
  readonly connections: readonly Connection[];
  readonly spawns: readonly SpawnPoint[];
  readonly checksum: string;
  readonly seed: DungeonSeed;
}

/**
 * Custom artifact for extensibility
 */
export interface CustomArtifact<T = unknown> extends Artifact<"custom"> {
  readonly type: "custom";
  readonly customType: string;
  readonly data: T;
}

/**
 * Dungeon generation state - carries all data through pipeline passes.
 */
export interface DungeonStateArtifact extends Artifact<"dungeon-state"> {
  readonly type: "dungeon-state";
  readonly width: number;
  readonly height: number;
  readonly grid: Grid;
  readonly bspTree?: BSPNode;
  readonly bspLeaves?: readonly BSPNode[];
  readonly rooms: readonly Room[];
  readonly edges: readonly [number, number][];
  readonly connections: readonly Connection[];
  readonly spawns: readonly SpawnPoint[];
}

/**
 * Union of all built-in artifact types
 */
export type AnyArtifact =
  | EmptyArtifact
  | GridArtifact
  | RoomsArtifact
  | GraphArtifact
  | RegionsArtifact
  | BSPTreeArtifact
  | SpawnArtifact
  | ValidationArtifact
  | DungeonArtifact
  | DungeonStateArtifact
  | CustomArtifact;

// =============================================================================
// FACTORY FUNCTIONS
// =============================================================================

/**
 * Create an empty artifact
 */
export function createEmptyArtifact(): EmptyArtifact {
  return { type: "empty", id: "empty" };
}

/**
 * Create a grid artifact
 */
export function createGridArtifact(
  grid: Grid,
  id: string = "grid",
): GridArtifact {
  return {
    type: "grid",
    id,
    width: grid.width,
    height: grid.height,
    cells: grid.getRawDataCopy(),
    grid,
  };
}

/**
 * Create a rooms artifact
 */
export function createRoomsArtifact(
  rooms: readonly Room[],
  id: string = "rooms",
): RoomsArtifact {
  return { type: "rooms", id, rooms };
}

/**
 * Create a graph artifact
 */
export function createGraphArtifact(
  nodes: readonly number[],
  edges: readonly [number, number][],
  connections?: readonly Connection[],
  id: string = "graph",
): GraphArtifact {
  return { type: "graph", id, nodes, edges, connections };
}

/**
 * Create a validation artifact.
 * Automatically determines success based on presence of error-level violations.
 */
export function createValidationArtifact(
  violations: readonly Violation[],
  id: string = "validation",
): ValidationArtifact {
  const hasErrors = violations.some((v) => v.severity === "error");
  if (hasErrors) {
    return { type: "validation", id, violations, success: false };
  }
  return { type: "validation", id, violations, success: true };
}

/**
 * Create a dungeon state artifact
 */
export function createDungeonStateArtifact(
  grid: Grid,
  id: string = "dungeon-state",
): DungeonStateArtifact {
  return {
    type: "dungeon-state",
    id,
    width: grid.width,
    height: grid.height,
    grid,
    rooms: [],
    edges: [],
    connections: [],
    spawns: [],
  };
}
