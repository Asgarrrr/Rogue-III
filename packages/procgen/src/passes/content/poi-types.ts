/**
 * Point of Interest (POI) Types
 *
 * POIs are special structures placed in rooms to add visual interest
 * and gameplay variety. They can be blocking (pillars) or non-blocking (altars).
 *
 * @example
 * ```typescript
 * const pillar = POI_DEFINITIONS.pillar;
 * // { blocking: true, minRoomArea: 64, ... }
 * ```
 */

import type { RoomType } from "../../pipeline/types";

// =============================================================================
// POI CATEGORIES
// =============================================================================

/**
 * POI category classification
 */
export type POICategory =
  | "structural" // Pillars, columns - structural elements
  | "religious" // Altars, shrines - divine/arcane
  | "utility" // Fountains, wells - provide resources
  | "storage" // Bookshelves, weapon racks - containers
  | "decorative" // Statues, banners - pure visual
  | "natural"; // Mushrooms, stalagmites - cave elements

// =============================================================================
// POI DEFINITION
// =============================================================================

/**
 * Point of Interest definition
 */
export interface POIDefinition {
  /** POI identifier */
  readonly id: string;
  /** Display name */
  readonly name: string;
  /** Category for grouping */
  readonly category: POICategory;
  /** Whether this POI blocks movement */
  readonly blocking: boolean;
  /** Minimum room area required (in tiles) */
  readonly minRoomArea: number;
  /** Minimum room width required */
  readonly minRoomWidth?: number;
  /** Minimum room height required */
  readonly minRoomHeight?: number;
  /** Room types this POI can appear in */
  readonly compatibleRoomTypes: readonly RoomType[];
  /** Tags for filtering and game logic */
  readonly tags: readonly string[];
  /** Visual size (tiles wide/tall, for collision) */
  readonly size: { width: number; height: number };
  /** Minimum distance from room edges */
  readonly edgePadding: number;
  /** Minimum distance between same POI type */
  readonly minSpacing: number;
  /** Preferred placement zone: center, edges, corners, scattered */
  readonly placement: POIPlacement;
  /** Whether to spawn in patterns (e.g., rows of pillars) */
  readonly pattern?: POIPattern;
}

/**
 * Placement preference for POIs
 */
export type POIPlacement =
  | "center"
  | "edges"
  | "corners"
  | "scattered"
  | "symmetric";

/**
 * Pattern for POI placement
 */
export interface POIPattern {
  /** Pattern type */
  readonly type: "row" | "grid" | "frame" | "diagonal";
  /** Spacing between elements in pattern */
  readonly spacing: number;
  /** Minimum elements in pattern */
  readonly minCount: number;
  /** Maximum elements in pattern */
  readonly maxCount: number;
}

// =============================================================================
// POI DEFINITIONS
// =============================================================================

/**
 * Standard POI definitions
 */
export const POI_DEFINITIONS: Record<string, POIDefinition> = {
  // Structural
  pillar: {
    id: "pillar",
    name: "Stone Pillar",
    category: "structural",
    blocking: true,
    minRoomArea: 64, // 8x8
    compatibleRoomTypes: ["normal", "boss", "library", "armory", "treasure"],
    tags: ["structural", "stone"],
    size: { width: 1, height: 1 },
    edgePadding: 2,
    minSpacing: 3,
    placement: "symmetric",
    pattern: {
      type: "grid",
      spacing: 4,
      minCount: 2,
      maxCount: 8,
    },
  },

  column: {
    id: "column",
    name: "Ornate Column",
    category: "structural",
    blocking: true,
    minRoomArea: 100,
    compatibleRoomTypes: ["boss", "treasure", "library"],
    tags: ["structural", "ornate"],
    size: { width: 1, height: 1 },
    edgePadding: 2,
    minSpacing: 4,
    placement: "edges",
    pattern: {
      type: "frame",
      spacing: 4,
      minCount: 4,
      maxCount: 12,
    },
  },

  // Religious
  altar: {
    id: "altar",
    name: "Stone Altar",
    category: "religious",
    blocking: false,
    minRoomArea: 49, // 7x7
    compatibleRoomTypes: ["treasure", "boss"],
    tags: ["religious", "altar", "interactive"],
    size: { width: 2, height: 1 },
    edgePadding: 2,
    minSpacing: 10, // Only one per room typically
    placement: "center",
  },

  shrine: {
    id: "shrine",
    name: "Shrine",
    category: "religious",
    blocking: false,
    minRoomArea: 36, // 6x6
    compatibleRoomTypes: ["normal", "treasure", "library"],
    tags: ["religious", "shrine", "interactive"],
    size: { width: 1, height: 1 },
    edgePadding: 1,
    minSpacing: 8,
    placement: "corners",
  },

  // Utility
  fountain: {
    id: "fountain",
    name: "Water Fountain",
    category: "utility",
    blocking: true,
    minRoomArea: 36, // 6x6
    compatibleRoomTypes: ["normal", "entrance", "cavern"],
    tags: ["water", "fountain", "interactive"],
    size: { width: 2, height: 2 },
    edgePadding: 2,
    minSpacing: 15,
    placement: "center",
  },

  well: {
    id: "well",
    name: "Stone Well",
    category: "utility",
    blocking: true,
    minRoomArea: 49, // 7x7
    compatibleRoomTypes: ["normal", "entrance", "cavern"],
    tags: ["water", "well", "interactive"],
    size: { width: 2, height: 2 },
    edgePadding: 2,
    minSpacing: 20,
    placement: "center",
  },

  // Storage
  bookshelf: {
    id: "bookshelf",
    name: "Bookshelf",
    category: "storage",
    blocking: true,
    minRoomArea: 30,
    minRoomWidth: 5,
    compatibleRoomTypes: ["library"],
    tags: ["storage", "books", "interactive"],
    size: { width: 2, height: 1 },
    edgePadding: 0, // Against walls
    minSpacing: 2,
    placement: "edges",
    pattern: {
      type: "row",
      spacing: 2,
      minCount: 2,
      maxCount: 6,
    },
  },

  weapon_rack: {
    id: "weapon_rack",
    name: "Weapon Rack",
    category: "storage",
    blocking: true,
    minRoomArea: 30,
    compatibleRoomTypes: ["armory"],
    tags: ["storage", "weapons", "interactive"],
    size: { width: 2, height: 1 },
    edgePadding: 0,
    minSpacing: 2,
    placement: "edges",
    pattern: {
      type: "row",
      spacing: 2,
      minCount: 2,
      maxCount: 4,
    },
  },

  // Decorative
  statue: {
    id: "statue",
    name: "Stone Statue",
    category: "decorative",
    blocking: true,
    minRoomArea: 49, // 7x7
    compatibleRoomTypes: ["boss", "treasure", "library"],
    tags: ["decorative", "statue"],
    size: { width: 1, height: 1 },
    edgePadding: 2,
    minSpacing: 5,
    placement: "symmetric",
  },

  brazier: {
    id: "brazier",
    name: "Burning Brazier",
    category: "decorative",
    blocking: true,
    minRoomArea: 36, // 6x6
    compatibleRoomTypes: ["normal", "boss", "armory", "treasure"],
    tags: ["decorative", "light", "fire"],
    size: { width: 1, height: 1 },
    edgePadding: 1,
    minSpacing: 4,
    placement: "corners",
  },

  // Nature
  mushroom_cluster: {
    id: "mushroom_cluster",
    name: "Glowing Mushrooms",
    category: "decorative",
    blocking: false,
    minRoomArea: 25,
    compatibleRoomTypes: ["cavern"],
    tags: ["natural", "light", "mushroom"],
    size: { width: 1, height: 1 },
    edgePadding: 0,
    minSpacing: 3,
    placement: "scattered",
  },

  stalagmite: {
    id: "stalagmite",
    name: "Stalagmite",
    category: "structural",
    blocking: true,
    minRoomArea: 36,
    compatibleRoomTypes: ["cavern"],
    tags: ["natural", "stone"],
    size: { width: 1, height: 1 },
    edgePadding: 1,
    minSpacing: 3,
    placement: "scattered",
  },
};

/**
 * Get POI definitions compatible with a room type
 */
export function getPOIsForRoomType(
  roomType: RoomType,
): readonly POIDefinition[] {
  return Object.values(POI_DEFINITIONS).filter((poi) =>
    poi.compatibleRoomTypes.includes(roomType),
  );
}

/**
 * Get POI definitions by category
 */
export function getPOIsByCategory(
  category: POICategory,
): readonly POIDefinition[] {
  return Object.values(POI_DEFINITIONS).filter(
    (poi) => poi.category === category,
  );
}

/**
 * Get POI definitions by tag
 */
export function getPOIsByTag(tag: string): readonly POIDefinition[] {
  return Object.values(POI_DEFINITIONS).filter((poi) => poi.tags.includes(tag));
}

/**
 * All POI IDs as readonly array
 */
export const ALL_POI_IDS = Object.keys(POI_DEFINITIONS) as readonly string[];
