/**
 * Signature Room Prefabs
 *
 * Special room templates for key dungeon locations.
 * Theme: Medieval Fantasy / Abyss
 *
 * These prefabs define the iconic rooms that give the dungeon its character:
 * - Boss arenas with dramatic shapes
 * - Treasure vaults with defensive layouts
 * - Entrance halls that set the tone
 * - Hub rooms for non-linear navigation
 */

import { createTemplate } from "./template-utils";
import type { RoomTemplate } from "./types";

// =============================================================================
// BOSS ARENA - Octagonal with pillars (12x12)
// =============================================================================

/**
 * Boss Arena - Large octagonal room for epic encounters
 *
 * ```
 * ....####....
 * ...######...
 * ..########..
 * .##########.
 * ############
 * ############
 * ############
 * ############
 * .##########.
 * ..########..
 * ...######...
 * ....####....
 * ```
 */
export const BOSS_ARENA = createTemplate(
  "boss-arena",
  "custom",
  [
    [0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0],
    [0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0],
    [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
    [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
    [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0],
    [0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0],
    [0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0],
  ],
  {
    minLeafSize: 6,
    compatibleTypes: ["boss"],
    tags: ["boss", "epic", "octagonal", "symmetric", "arena"],
  },
);

// =============================================================================
// TREASURE VAULT - Cross-shaped with alcoves (10x10)
// =============================================================================

/**
 * Treasure Vault - Cross shape with corner alcoves
 *
 * ```
 * ##..####..##
 * ##..####..##
 * ....####....
 * ############
 * ############
 * ############
 * ############
 * ....####....
 * ##..####..##
 * ##..####..##
 * ```
 */
export const TREASURE_VAULT = createTemplate(
  "treasure-vault",
  "cross",
  [
    [1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 1, 1],
    [1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 1, 1],
    [0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0],
    [1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 1, 1],
    [1, 1, 0, 0, 1, 1, 1, 1, 0, 0, 1, 1],
  ],
  {
    minLeafSize: 6,
    compatibleTypes: ["treasure"],
    tags: ["treasure", "vault", "alcoves", "symmetric"],
  },
);

// =============================================================================
// ENTRANCE HALL - Grand rectangular with columns (12x8)
// =============================================================================

/**
 * Entrance Hall - Wide hall for dramatic entrances
 *
 * ```
 * ############
 * #..######..#
 * #..######..#
 * ############
 * ############
 * #..######..#
 * #..######..#
 * ############
 * ```
 */
export const ENTRANCE_HALL = createTemplate(
  "entrance-hall",
  "custom",
  [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 1],
    [1, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 1],
    [1, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  ],
  {
    minLeafSize: 6,
    compatibleTypes: ["entrance"],
    tags: ["entrance", "hall", "grand", "columns"],
  },
);

// =============================================================================
// SHRINE - Circular with altar center (9x9)
// =============================================================================

/**
 * Shrine - Circular room with central altar space
 *
 * ```
 * ...###...
 * ..#####..
 * .#######.
 * #########
 * #########
 * #########
 * .#######.
 * ..#####..
 * ...###...
 * ```
 */
export const SHRINE = createTemplate(
  "shrine",
  "custom",
  [
    [0, 0, 0, 1, 1, 1, 0, 0, 0],
    [0, 0, 1, 1, 1, 1, 1, 0, 0],
    [0, 1, 1, 1, 1, 1, 1, 1, 0],
    [1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1],
    [0, 1, 1, 1, 1, 1, 1, 1, 0],
    [0, 0, 1, 1, 1, 1, 1, 0, 0],
    [0, 0, 0, 1, 1, 1, 0, 0, 0],
  ],
  {
    minLeafSize: 4,
    compatibleTypes: ["normal", "treasure"],
    tags: ["shrine", "circular", "sacred", "symmetric"],
  },
);

// =============================================================================
// CROSSROADS HUB - 4-way intersection (10x10)
// =============================================================================

/**
 * Crossroads - Central hub connecting multiple paths
 *
 * ```
 * ...####...
 * ...####...
 * ...####...
 * ##########
 * ##########
 * ##########
 * ##########
 * ...####...
 * ...####...
 * ...####...
 * ```
 */
export const CROSSROADS = createTemplate(
  "crossroads",
  "cross",
  [
    [0, 0, 0, 1, 1, 1, 1, 0, 0, 0],
    [0, 0, 0, 1, 1, 1, 1, 0, 0, 0],
    [0, 0, 0, 1, 1, 1, 1, 0, 0, 0],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [0, 0, 0, 1, 1, 1, 1, 0, 0, 0],
    [0, 0, 0, 1, 1, 1, 1, 0, 0, 0],
    [0, 0, 0, 1, 1, 1, 1, 0, 0, 0],
  ],
  {
    minLeafSize: 5,
    compatibleTypes: ["normal"],
    tags: ["hub", "crossroads", "junction", "symmetric"],
  },
);

// =============================================================================
// CRYPT - L-shaped with tomb alcoves (10x8)
// =============================================================================

/**
 * Crypt - L-shaped room with alcove spaces for tombs
 *
 * ```
 * #######...
 * #######...
 * #######...
 * ##########
 * ##########
 * ##########
 * ##########
 * ##########
 * ```
 */
export const CRYPT = createTemplate(
  "crypt",
  "l-shape",
  [
    [1, 1, 1, 1, 1, 1, 1, 0, 0, 0],
    [1, 1, 1, 1, 1, 1, 1, 0, 0, 0],
    [1, 1, 1, 1, 1, 1, 1, 0, 0, 0],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  ],
  {
    minLeafSize: 5,
    compatibleTypes: ["normal"],
    tags: ["crypt", "l-shape", "tombs", "asymmetric"],
  },
);

// =============================================================================
// FORGE - Rectangular with central pit (10x8)
// =============================================================================

/**
 * Forge - Working space with central forge pit
 *
 * ```
 * ##########
 * ##########
 * ##..##..##
 * ##..##..##
 * ##..##..##
 * ##..##..##
 * ##########
 * ##########
 * ```
 */
export const FORGE = createTemplate(
  "forge",
  "custom",
  [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 0, 0, 1, 1, 0, 0, 1, 1],
    [1, 1, 0, 0, 1, 1, 0, 0, 1, 1],
    [1, 1, 0, 0, 1, 1, 0, 0, 1, 1],
    [1, 1, 0, 0, 1, 1, 0, 0, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  ],
  {
    minLeafSize: 5,
    compatibleTypes: ["armory", "normal"],
    tags: ["forge", "pits", "industrial", "symmetric"],
  },
);

// =============================================================================
// LIBRARY - Rectangular with shelf spaces (10x8)
// =============================================================================

/**
 * Library - Room with alcoves for bookshelves
 *
 * ```
 * ##########
 * #..####..#
 * #..####..#
 * ##########
 * ##########
 * #..####..#
 * #..####..#
 * ##########
 * ```
 */
export const LIBRARY = createTemplate(
  "library",
  "custom",
  [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 1, 1, 1, 1, 0, 0, 1],
    [1, 0, 0, 1, 1, 1, 1, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 1, 1, 1, 1, 0, 0, 1],
    [1, 0, 0, 1, 1, 1, 1, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  ],
  {
    minLeafSize: 5,
    compatibleTypes: ["library", "normal"],
    tags: ["library", "shelves", "knowledge", "symmetric"],
  },
);

// =============================================================================
// CAVERN - Organic blob shape (11x9)
// =============================================================================

/**
 * Cavern - Natural organic cave shape
 *
 * ```
 * ...#####...
 * ..#######..
 * .#########.
 * ###########
 * ###########
 * ###########
 * .#########.
 * ..#######..
 * ....###....
 * ```
 */
export const CAVERN = createTemplate(
  "cavern",
  "custom",
  [
    [0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0],
    [0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0],
    [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
    [0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0],
    [0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0],
  ],
  {
    minLeafSize: 6,
    compatibleTypes: ["cavern", "normal"],
    tags: ["cavern", "natural", "organic"],
  },
);

// =============================================================================
// THRONE ROOM - Grand with raised platform (14x10)
// =============================================================================

/**
 * Throne Room - Regal room with platform and pillars
 *
 * ```
 * ##############
 * ##############
 * #..########..#
 * #..########..#
 * ##############
 * ##############
 * #..########..#
 * #..########..#
 * ##....####..##
 * ##....####..##
 * ```
 */
export const THRONE_ROOM = createTemplate(
  "throne-room",
  "custom",
  [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1],
    [1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1],
    [1, 0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 1],
    [1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 1, 1],
    [1, 1, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 1, 1],
  ],
  {
    minLeafSize: 6,
    compatibleTypes: ["boss"],
    tags: ["throne", "regal", "grand", "pillars"],
  },
);

// =============================================================================
// SIGNATURE PREFABS COLLECTION
// =============================================================================

/**
 * All signature room templates
 */
export const SIGNATURE_PREFABS: readonly RoomTemplate[] = [
  BOSS_ARENA,
  TREASURE_VAULT,
  ENTRANCE_HALL,
  SHRINE,
  CROSSROADS,
  CRYPT,
  FORGE,
  LIBRARY,
  CAVERN,
  THRONE_ROOM,
];

/**
 * Map of signature prefabs by ID
 */
export const SIGNATURE_PREFABS_MAP: ReadonlyMap<string, RoomTemplate> = new Map(
  SIGNATURE_PREFABS.map((p) => [p.id, p]),
);

/**
 * Get a signature prefab by ID
 */
export function getSignaturePrefab(id: string): RoomTemplate | undefined {
  return SIGNATURE_PREFABS_MAP.get(id);
}

/**
 * Get signature prefabs by tag
 */
export function getSignaturePrefabsByTag(tag: string): readonly RoomTemplate[] {
  return SIGNATURE_PREFABS.filter((p) => p.tags?.includes(tag));
}

/**
 * Get signature prefabs compatible with a room type
 */
export function getSignaturePrefabsForType(
  roomType: string,
): readonly RoomTemplate[] {
  return SIGNATURE_PREFABS.filter(
    (p) =>
      !p.compatibleTypes ||
      (p.compatibleTypes as readonly string[]).includes(roomType),
  );
}
