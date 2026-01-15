/**
 * Predefined Room Template Shapes
 *
 * L-shape, T-shape, Cross/Plus templates with all rotation variants.
 */

import type { RoomType } from "../pipeline/types";
import { createTemplate, generateAllVariants } from "./template-utils";
import type { RoomTemplate } from "./types";

// =============================================================================
// L-SHAPE TEMPLATES
// =============================================================================

/**
 * Base L-shape template (3x3)
 *
 * ```
 * ##.
 * #..
 * #..
 * ```
 */
export const L_SHAPE_BASE = createTemplate(
  "l-shape",
  "l-shape",
  [
    [1, 1, 0],
    [1, 0, 0],
    [1, 0, 0],
  ],
  {
    minLeafSize: 4,
    compatibleTypes: ["normal", "library", "armory"],
    tags: ["asymmetric", "corner"],
  },
);

/**
 * Large L-shape template (4x4)
 *
 * ```
 * ###.
 * ##..
 * #...
 * #...
 * ```
 */
export const L_SHAPE_LARGE = createTemplate(
  "l-shape-large",
  "l-shape",
  [
    [1, 1, 1, 0],
    [1, 1, 0, 0],
    [1, 0, 0, 0],
    [1, 0, 0, 0],
  ],
  {
    minLeafSize: 5,
    compatibleTypes: ["normal", "library", "armory", "boss"],
    tags: ["asymmetric", "corner", "large"],
  },
);

// =============================================================================
// T-SHAPE TEMPLATES
// =============================================================================

/**
 * Base T-shape template (3x3)
 *
 * ```
 * ###
 * .#.
 * .#.
 * ```
 */
export const T_SHAPE_BASE = createTemplate(
  "t-shape",
  "t-shape",
  [
    [1, 1, 1],
    [0, 1, 0],
    [0, 1, 0],
  ],
  {
    minLeafSize: 4,
    compatibleTypes: ["normal", "treasure", "library"],
    tags: ["junction", "symmetric-x"],
  },
);

/**
 * Large T-shape template (5x4)
 *
 * ```
 * #####
 * ..#..
 * ..#..
 * ..#..
 * ```
 */
export const T_SHAPE_LARGE = createTemplate(
  "t-shape-large",
  "t-shape",
  [
    [1, 1, 1, 1, 1],
    [0, 0, 1, 0, 0],
    [0, 0, 1, 0, 0],
    [0, 0, 1, 0, 0],
  ],
  {
    minLeafSize: 6,
    compatibleTypes: ["normal", "treasure", "boss"],
    tags: ["junction", "symmetric-x", "large"],
  },
);

// =============================================================================
// CROSS/PLUS TEMPLATES
// =============================================================================

/**
 * Base cross template (3x3)
 *
 * ```
 * .#.
 * ###
 * .#.
 * ```
 */
export const CROSS_BASE = createTemplate(
  "cross",
  "cross",
  [
    [0, 1, 0],
    [1, 1, 1],
    [0, 1, 0],
  ],
  {
    minLeafSize: 4,
    compatibleTypes: ["treasure", "boss", "normal"],
    tags: ["symmetric", "central"],
  },
);

/**
 * Large cross template (5x5)
 *
 * ```
 * ..#..
 * ..#..
 * #####
 * ..#..
 * ..#..
 * ```
 */
export const CROSS_LARGE = createTemplate(
  "cross-large",
  "cross",
  [
    [0, 0, 1, 0, 0],
    [0, 0, 1, 0, 0],
    [1, 1, 1, 1, 1],
    [0, 0, 1, 0, 0],
    [0, 0, 1, 0, 0],
  ],
  {
    minLeafSize: 6,
    compatibleTypes: ["boss", "treasure"],
    tags: ["symmetric", "central", "large"],
  },
);

/**
 * Plus template (wider arms, 5x5)
 *
 * ```
 * .###.
 * #####
 * #####
 * #####
 * .###.
 * ```
 */
export const PLUS_BASE = createTemplate(
  "plus",
  "plus",
  [
    [0, 1, 1, 1, 0],
    [1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1],
    [0, 1, 1, 1, 0],
  ],
  {
    minLeafSize: 6,
    compatibleTypes: ["boss", "treasure", "entrance"],
    tags: ["symmetric", "central", "spacious"],
  },
);

// =============================================================================
// SPECIALTY TEMPLATES
// =============================================================================

/**
 * Diamond template (5x5)
 *
 * ```
 * ..#..
 * .###.
 * #####
 * .###.
 * ..#..
 * ```
 */
export const DIAMOND = createTemplate(
  "diamond",
  "custom",
  [
    [0, 0, 1, 0, 0],
    [0, 1, 1, 1, 0],
    [1, 1, 1, 1, 1],
    [0, 1, 1, 1, 0],
    [0, 0, 1, 0, 0],
  ],
  {
    minLeafSize: 6,
    compatibleTypes: ["treasure", "boss"],
    tags: ["symmetric", "central", "unique"],
  },
);

/**
 * Corridor room (long and narrow, 7x3)
 *
 * ```
 * #######
 * #######
 * #######
 * ```
 */
export const CORRIDOR_ROOM = createTemplate(
  "corridor",
  "custom",
  [
    [1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1],
  ],
  {
    minLeafSize: 8,
    compatibleTypes: ["normal", "armory"],
    tags: ["elongated", "passage"],
  },
);

// =============================================================================
// TEMPLATE COLLECTIONS
// =============================================================================

/**
 * All base templates (without rotations)
 */
export const BASE_TEMPLATES: readonly RoomTemplate[] = [
  L_SHAPE_BASE,
  L_SHAPE_LARGE,
  T_SHAPE_BASE,
  T_SHAPE_LARGE,
  CROSS_BASE,
  CROSS_LARGE,
  PLUS_BASE,
  DIAMOND,
  CORRIDOR_ROOM,
];

/**
 * All L-shape variants (all rotations + mirrors)
 */
export const L_SHAPE_VARIANTS: readonly RoomTemplate[] = [
  ...generateAllVariants(L_SHAPE_BASE),
  ...generateAllVariants(L_SHAPE_LARGE),
];

/**
 * All T-shape variants (all rotations)
 */
export const T_SHAPE_VARIANTS: readonly RoomTemplate[] = [
  ...generateAllVariants(T_SHAPE_BASE),
  ...generateAllVariants(T_SHAPE_LARGE),
];

/**
 * All cross/plus variants (symmetric, fewer variants needed)
 */
export const CROSS_VARIANTS: readonly RoomTemplate[] = [
  CROSS_BASE,
  CROSS_LARGE,
  PLUS_BASE,
  DIAMOND,
];

/**
 * All corridor variants (horizontal + rotated for vertical layouts)
 */
export const CORRIDOR_VARIANTS: readonly RoomTemplate[] =
  generateAllVariants(CORRIDOR_ROOM);

/**
 * All templates with all variants expanded
 */
export const ALL_TEMPLATES: readonly RoomTemplate[] = [
  ...L_SHAPE_VARIANTS,
  ...T_SHAPE_VARIANTS,
  ...CROSS_VARIANTS,
  ...CORRIDOR_VARIANTS,
];

// Note: SIGNATURE_PREFABS are imported separately and should be combined
// with ALL_TEMPLATES when calling selectTemplateForLeaf for full variety.

/**
 * Small templates (fit in 8x8 leaves)
 */
export const SMALL_TEMPLATES: readonly RoomTemplate[] = ALL_TEMPLATES.filter(
  (t) => t.minLeafSize <= 8,
);

/**
 * Large templates (require 10+ leaves)
 */
export const LARGE_TEMPLATES: readonly RoomTemplate[] = ALL_TEMPLATES.filter(
  (t) => t.minLeafSize >= 10,
);

/**
 * Get templates compatible with a room type
 */
export function getTemplatesForRoomType(
  roomType: RoomType,
): readonly RoomTemplate[] {
  return ALL_TEMPLATES.filter(
    (t) => !t.compatibleTypes || t.compatibleTypes.includes(roomType),
  );
}

/**
 * Get templates by tag
 */
export function getTemplatesByTag(tag: string): readonly RoomTemplate[] {
  return ALL_TEMPLATES.filter((t) => t.tags?.includes(tag));
}
