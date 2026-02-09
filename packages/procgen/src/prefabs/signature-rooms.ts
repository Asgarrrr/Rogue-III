/**
 * Signature Room Prefabs
 *
 * Distinctive room templates with unique structural characteristics.
 * These provide variety in dungeon layouts through different shapes and features.
 */

import { createTemplate } from "./template-utils";
import type { RoomTemplate } from "./types";

// =============================================================================
// OCTAGONAL_LARGE - Large octagonal shape (12x12)
// =============================================================================

/**
 * Large octagonal room - spacious symmetric shape
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
export const OCTAGONAL_LARGE = createTemplate(
  "octagonal-large",
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
    minLeafSize: 14, // 12x12 + padding
    compatibleTypes: ["normal"],
    tags: ["octagonal", "large", "symmetric", "spacious"],
  },
);

// =============================================================================
// CROSS_ALCOVED - Cross-shaped with corner alcoves (10x10)
// =============================================================================

/**
 * Cross with alcoves - symmetric cross with corner spaces
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
export const CROSS_ALCOVED = createTemplate(
  "cross-alcoved",
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
    minLeafSize: 14, // 12x10 + padding
    compatibleTypes: ["normal"],
    tags: ["cross", "alcoves", "symmetric"],
  },
);

// =============================================================================
// COLUMNED_HALL - Rectangular with columns (12x8)
// =============================================================================

/**
 * Columned hall - wide hall with pillar spaces
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
export const COLUMNED_HALL = createTemplate(
  "columned-hall",
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
    minLeafSize: 14, // 12x8 + padding
    compatibleTypes: ["normal"],
    tags: ["hall", "columns", "rectangular"],
  },
);

// =============================================================================
// CIRCULAR_MEDIUM - Circular shape (9x9)
// =============================================================================

/**
 * Medium circular room - round symmetric shape
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
export const CIRCULAR_MEDIUM = createTemplate(
  "circular-medium",
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
    minLeafSize: 11, // 9x9 + padding
    compatibleTypes: ["normal"],
    tags: ["circular", "medium", "symmetric"],
  },
);

// =============================================================================
// JUNCTION_CROSS - 4-way intersection (10x10)
// =============================================================================

/**
 * Cross junction - central hub for multiple paths
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
export const JUNCTION_CROSS = createTemplate(
  "junction-cross",
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
    minLeafSize: 12, // 10x10 + padding
    compatibleTypes: ["normal"],
    tags: ["junction", "cross", "hub", "symmetric"],
  },
);

// =============================================================================
// L_SHAPED - L-shaped asymmetric (10x8)
// =============================================================================

/**
 * L-shaped room - asymmetric corner layout
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
export const L_SHAPED = createTemplate(
  "l-shaped",
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
    minLeafSize: 12, // 10x8 + padding
    compatibleTypes: ["normal"],
    tags: ["l-shape", "asymmetric", "corner"],
  },
);

// =============================================================================
// DUAL_PIT - Rectangular with two pits (10x8)
// =============================================================================

/**
 * Dual pit room - symmetric layout with two recessed areas
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
export const DUAL_PIT = createTemplate(
  "dual-pit",
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
    minLeafSize: 12, // 10x8 + padding
    compatibleTypes: ["normal"],
    tags: ["pits", "symmetric", "rectangular"],
  },
);

// =============================================================================
// ALCOVED_SYMMETRIC - Rectangular with alcoves (10x8)
// =============================================================================

/**
 * Symmetric alcoved room - rectangular with side recesses
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
export const ALCOVED_SYMMETRIC = createTemplate(
  "alcoved-symmetric",
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
    minLeafSize: 12, // 10x8 + padding
    compatibleTypes: ["normal"],
    tags: ["alcoves", "symmetric", "rectangular"],
  },
);

// =============================================================================
// ORGANIC_BLOB - Organic irregular shape (11x9)
// =============================================================================

/**
 * Organic blob - natural irregular shape
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
export const ORGANIC_BLOB = createTemplate(
  "organic-blob",
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
    minLeafSize: 13, // 11x9 + padding
    compatibleTypes: ["normal", "cavern"],
    tags: ["organic", "natural", "irregular"],
  },
);

// =============================================================================
// GRAND_PILLARED - Large with pillars and platform (14x10)
// =============================================================================

/**
 * Grand pillared room - spacious with pillars and entry platform
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
export const GRAND_PILLARED = createTemplate(
  "grand-pillared",
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
    minLeafSize: 16, // 14x10 + padding
    compatibleTypes: ["normal"],
    tags: ["pillars", "large", "grand", "platform"],
  },
);

// =============================================================================
// SIGNATURE PREFABS COLLECTION
// =============================================================================

/**
 * All signature room templates
 */
export const SIGNATURE_PREFABS: readonly RoomTemplate[] = [
  OCTAGONAL_LARGE,
  CROSS_ALCOVED,
  COLUMNED_HALL,
  CIRCULAR_MEDIUM,
  JUNCTION_CROSS,
  L_SHAPED,
  DUAL_PIT,
  ALCOVED_SYMMETRIC,
  ORGANIC_BLOB,
  GRAND_PILLARED,
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
