/**
 * POI Placement Rules
 *
 * Defines when and how POIs should be placed based on room characteristics.
 * Uses the rule engine for flexible, data-driven placement.
 */

import type { Expression } from "../../core/rules/expression";
import type { POICategory, POIDefinition } from "./poi-types";
import { POI_DEFINITIONS } from "./poi-types";
import type { ContentRule, SpawnAction } from "./types";

// =============================================================================
// RULE CONSTRUCTION HELPERS
// =============================================================================

/**
 * Create a spawn action from a POI definition
 */
function createPOIAction(
  poi: POIDefinition,
  count: number | Expression,
  weight = 1,
): SpawnAction {
  return {
    type: "spawn",
    template: poi.id,
    count,
    tags: [...poi.tags, "poi", poi.category],
    weight,
    // Spread to convert readonly RoomType[] to string[] (RoomType extends string)
    roomTypes: [...poi.compatibleRoomTypes],
  };
}

/**
 * Create a rule condition for room area check
 */
function roomAreaCondition(minArea: number): Expression {
  return {
    type: "op",
    op: ">=",
    left: { type: "field", path: "room.area" },
    right: { type: "literal", value: minArea },
  };
}

/**
 * Create a rule condition for room type check
 */
function roomTypeCondition(roomTypes: readonly string[]): Expression {
  const firstType = roomTypes[0];
  if (roomTypes.length === 1 && firstType) {
    return {
      type: "op",
      op: "==",
      left: { type: "field", path: "room.type" },
      right: { type: "literal", value: firstType },
    };
  }

  // Multiple types: use OR chain
  let condition: Expression = {
    type: "op",
    op: "==",
    left: { type: "field", path: "room.type" },
    right: { type: "literal", value: firstType ?? "normal" },
  };

  for (let i = 1; i < roomTypes.length; i++) {
    const roomType = roomTypes[i];
    if (!roomType) continue;

    condition = {
      type: "op",
      op: "||",
      left: condition,
      right: {
        type: "op",
        op: "==",
        left: { type: "field", path: "room.type" },
        right: { type: "literal", value: roomType },
      },
    };
  }

  return condition;
}

/**
 * Combine conditions with AND
 */
function andConditions(...conditions: Expression[]): Expression {
  if (conditions.length === 0) {
    return { type: "literal", value: true };
  }

  const firstCondition = conditions[0];
  if (conditions.length === 1 && firstCondition) {
    return firstCondition;
  }

  let result: Expression = firstCondition ?? { type: "literal", value: true };
  for (let i = 1; i < conditions.length; i++) {
    const condition = conditions[i];
    if (condition) {
      result = {
        type: "op",
        op: "&&",
        left: result,
        right: condition,
      };
    }
  }

  return result;
}

// =============================================================================
// STANDARD POI RULES
// =============================================================================

/**
 * Create pillar placement rules for large rooms
 */
export function createPillarRules(): ContentRule[] {
  const pillar = POI_DEFINITIONS.pillar;
  if (!pillar) return [];

  return [
    {
      id: "poi-pillars-large-rooms",
      priority: 50,
      condition: andConditions(
        roomAreaCondition(100),
        {
          type: "unary",
          op: "!",
          operand: { type: "field", path: "room.isDeadEnd" },
        },
        roomTypeCondition(pillar.compatibleRoomTypes),
      ),
      action: createPOIAction(pillar, {
        type: "fn",
        name: "floor",
        args: [
          {
            type: "op",
            op: "/",
            left: { type: "field", path: "room.area" },
            right: { type: "literal", value: 50 },
          },
        ],
      }),
      description: "Place pillars in large rooms (1 per 50 tiles)",
      tags: ["structural"],
    },
  ];
}

/**
 * Create altar placement rules for treasure/boss rooms
 */
export function createAltarRules(): ContentRule[] {
  const altar = POI_DEFINITIONS.altar;
  if (!altar) return [];

  return [
    {
      id: "poi-altar-treasure",
      priority: 70,
      condition: andConditions(
        roomAreaCondition(altar.minRoomArea),
        roomTypeCondition(["treasure", "boss"]),
      ),
      action: createPOIAction(altar, 1, 2),
      description: "Place altar in treasure and boss rooms",
      tags: ["religious"],
      exclusive: true, // Only one altar per room
    },
  ];
}

/**
 * Create fountain placement rules
 */
export function createFountainRules(): ContentRule[] {
  const fountain = POI_DEFINITIONS.fountain;
  if (!fountain) return [];

  return [
    {
      id: "poi-fountain-hubs",
      priority: 60,
      condition: andConditions(
        roomAreaCondition(fountain.minRoomArea),
        { type: "field", path: "room.isHub" },
        roomTypeCondition(fountain.compatibleRoomTypes),
      ),
      action: createPOIAction(fountain, 1),
      description: "Place fountain in hub rooms",
      tags: ["utility"],
      exclusive: true,
    },
  ];
}

/**
 * Create bookshelf placement rules for libraries
 */
export function createBookshelfRules(): ContentRule[] {
  const bookshelf = POI_DEFINITIONS.bookshelf;
  if (!bookshelf) return [];

  return [
    {
      id: "poi-bookshelves-library",
      priority: 80,
      condition: andConditions(
        roomAreaCondition(bookshelf.minRoomArea),
        roomTypeCondition(["library"]),
      ),
      action: createPOIAction(bookshelf, {
        type: "fn",
        name: "floor",
        args: [
          {
            type: "op",
            op: "/",
            left: { type: "field", path: "room.width" },
            right: { type: "literal", value: 3 },
          },
        ],
      }),
      description: "Place bookshelves in libraries",
      tags: ["storage"],
    },
  ];
}

/**
 * Create weapon rack rules for armories
 */
export function createWeaponRackRules(): ContentRule[] {
  const rack = POI_DEFINITIONS.weapon_rack;
  if (!rack) return [];

  return [
    {
      id: "poi-weapon-racks-armory",
      priority: 80,
      condition: andConditions(
        roomAreaCondition(rack.minRoomArea),
        roomTypeCondition(["armory"]),
      ),
      action: createPOIAction(rack, {
        type: "fn",
        name: "min",
        args: [
          {
            type: "fn",
            name: "floor",
            args: [
              {
                type: "op",
                op: "/",
                left: { type: "field", path: "room.width" },
                right: { type: "literal", value: 4 },
              },
            ],
          },
          { type: "literal", value: 4 },
        ],
      }),
      description: "Place weapon racks in armories",
      tags: ["storage"],
    },
  ];
}

/**
 * Create brazier rules for corners
 */
export function createBrazierRules(): ContentRule[] {
  const brazier = POI_DEFINITIONS.brazier;
  if (!brazier) return [];

  return [
    {
      id: "poi-braziers-large-rooms",
      priority: 40,
      condition: andConditions(
        roomAreaCondition(64),
        roomTypeCondition(brazier.compatibleRoomTypes),
      ),
      action: createPOIAction(brazier, 4),
      description: "Place braziers in room corners",
      tags: ["decorative", "light"],
    },
  ];
}

/**
 * Create cavern-specific POI rules
 */
export function createCavernRules(): ContentRule[] {
  const mushrooms = POI_DEFINITIONS.mushroom_cluster;
  const stalagmite = POI_DEFINITIONS.stalagmite;

  const rules: ContentRule[] = [];

  if (mushrooms) {
    rules.push({
      id: "poi-mushrooms-cavern",
      priority: 30,
      condition: andConditions(
        roomAreaCondition(25),
        roomTypeCondition(["cavern"]),
      ),
      action: createPOIAction(mushrooms, {
        type: "fn",
        name: "floor",
        args: [
          {
            type: "op",
            op: "*",
            left: { type: "field", path: "room.area" },
            right: { type: "literal", value: 0.05 },
          },
        ],
      }),
      description: "Scatter mushrooms in caverns",
      tags: ["natural", "decorative"],
    });
  }

  if (stalagmite) {
    rules.push({
      id: "poi-stalagmites-cavern",
      priority: 35,
      condition: andConditions(
        roomAreaCondition(36),
        roomTypeCondition(["cavern"]),
      ),
      action: createPOIAction(stalagmite, {
        type: "fn",
        name: "floor",
        args: [
          {
            type: "op",
            op: "*",
            left: { type: "field", path: "room.area" },
            right: { type: "literal", value: 0.03 },
          },
        ],
      }),
      description: "Scatter stalagmites in caverns",
      tags: ["natural", "structural"],
    });
  }

  return rules;
}

/**
 * Create statue rules for special rooms
 */
export function createStatueRules(): ContentRule[] {
  const statue = POI_DEFINITIONS.statue;
  if (!statue) return [];

  return [
    {
      id: "poi-statues-special",
      priority: 55,
      condition: andConditions(
        roomAreaCondition(49),
        roomTypeCondition(["boss", "treasure", "library"]),
      ),
      action: createPOIAction(statue, 2),
      description: "Place statues in special rooms",
      tags: ["decorative"],
    },
  ];
}

// =============================================================================
// AGGREGATE RULE SETS
// =============================================================================

/**
 * Get all standard POI rules
 */
export function createAllPOIRules(): ContentRule[] {
  return [
    ...createPillarRules(),
    ...createAltarRules(),
    ...createFountainRules(),
    ...createBookshelfRules(),
    ...createWeaponRackRules(),
    ...createBrazierRules(),
    ...createCavernRules(),
    ...createStatueRules(),
  ];
}

/**
 * Get POI rules filtered by category
 */
export function getPOIRulesByCategory(category: POICategory): ContentRule[] {
  const allRules = createAllPOIRules();
  return allRules.filter((rule) => rule.tags?.includes(category));
}

/**
 * Create custom POI rule from definition
 */
export function createCustomPOIRule(
  id: string,
  poi: POIDefinition,
  condition: Expression,
  count: number | Expression,
  options: {
    priority?: number;
    description?: string;
    exclusive?: boolean;
  } = {},
): ContentRule {
  return {
    id,
    priority: options.priority ?? 50,
    condition,
    action: createPOIAction(poi, count),
    description: options.description ?? `Custom rule for ${poi.name}`,
    tags: [...poi.tags, "poi", poi.category],
    exclusive: options.exclusive,
  };
}
