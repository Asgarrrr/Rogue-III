/**
 * Configuration types for the BSP dungeon generator.
 *
 * BSP (Binary Space Partitioning) recursively divides space into
 * smaller regions, then places rooms within leaf nodes.
 */

/**
 * Configuration for the BSP tree partitioning phase.
 */
export interface BspPartitionConfig {
  /** Minimum width/height of a partition before stopping recursion */
  readonly minPartitionSize: number;
  /** Minimum ratio for split position (0.3 = 30% from edge minimum) */
  readonly minSplitRatio: number;
  /** Maximum ratio for split position (0.7 = 70% from edge maximum) */
  readonly maxSplitRatio: number;
  /** Maximum recursion depth (prevents infinite splitting) */
  readonly maxDepth: number;
}

/**
 * Configuration for room placement within BSP leaf nodes.
 */
export interface BspRoomConfig {
  /** Minimum room size relative to partition */
  readonly minRoomRatio: number;
  /** Maximum room size relative to partition */
  readonly maxRoomRatio: number;
  /** Minimum padding from partition edges */
  readonly padding: number;
  /** Minimum absolute room dimension */
  readonly minRoomSize: number;
}

/**
 * Configuration for corridor generation between rooms.
 */
export interface BspCorridorConfig {
  /** Width of corridors in cells */
  readonly width: number;
  /** Whether to add extra connections beyond MST for redundancy */
  readonly extraConnections: number;
  /** Pathfinding algorithm to use */
  readonly algorithm: "astar" | "straight" | "lshaped";
}

/**
 * Complete configuration for the BSP generator.
 */
export interface BspGeneratorConfig {
  readonly partition: BspPartitionConfig;
  readonly rooms: BspRoomConfig;
  readonly corridors: BspCorridorConfig;
}

/**
 * Default configuration for BSP generation.
 * Produces well-balanced dungeons with connected rooms.
 */
export const DEFAULT_BSP_CONFIG: BspGeneratorConfig = {
  partition: {
    minPartitionSize: 10,
    minSplitRatio: 0.35,
    maxSplitRatio: 0.65,
    maxDepth: 6,
  },
  rooms: {
    minRoomRatio: 0.5,
    maxRoomRatio: 0.9,
    padding: 1,
    minRoomSize: 4,
  },
  corridors: {
    width: 2,
    extraConnections: 1,
    algorithm: "lshaped",
  },
} as const;

/**
 * Configuration preset for compact dungeons with smaller rooms.
 */
export const COMPACT_BSP_CONFIG: BspGeneratorConfig = {
  partition: {
    minPartitionSize: 8,
    minSplitRatio: 0.4,
    maxSplitRatio: 0.6,
    maxDepth: 7,
  },
  rooms: {
    minRoomRatio: 0.4,
    maxRoomRatio: 0.7,
    padding: 1,
    minRoomSize: 3,
  },
  corridors: {
    width: 1,
    extraConnections: 0,
    algorithm: "lshaped",
  },
} as const;

/**
 * Configuration preset for spacious dungeons with larger rooms.
 */
export const SPACIOUS_BSP_CONFIG: BspGeneratorConfig = {
  partition: {
    minPartitionSize: 14,
    minSplitRatio: 0.3,
    maxSplitRatio: 0.7,
    maxDepth: 5,
  },
  rooms: {
    minRoomRatio: 0.6,
    maxRoomRatio: 0.95,
    padding: 2,
    minRoomSize: 6,
  },
  corridors: {
    width: 3,
    extraConnections: 2,
    algorithm: "astar",
  },
} as const;

/**
 * BSP tree node representing a partition of space.
 */
export interface BspNode {
  /** Bounds of this partition */
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  /** Child nodes (null for leaf nodes) */
  readonly left: BspNode | null;
  readonly right: BspNode | null;
  /** Split direction used to create children */
  readonly splitDirection: "horizontal" | "vertical" | null;
  /** Depth in the tree (root = 0) */
  readonly depth: number;
}

/**
 * A leaf node in the BSP tree that can contain a room.
 */
export interface BspLeaf extends BspNode {
  readonly left: null;
  readonly right: null;
  readonly splitDirection: null;
}

/**
 * Check if a BSP node is a leaf (has no children).
 */
export function isBspLeaf(node: BspNode): node is BspLeaf {
  return node.left === null && node.right === null;
}
