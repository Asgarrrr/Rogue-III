/**
 * Intelligent Content Placement Rules
 *
 * Spawns follow room PURPOSE, not random distribution.
 * Theme: Medieval Fantasy / Abyss
 *
 * This system provides:
 * - Purpose-driven spawning (treasure rooms get treasure, not random loot)
 * - Distance-based scaling (enemies/loot scale with depth)
 * - Positioning strategies (center, corners, edges, scattered, cluster)
 * - Conditional placement (room size, traits, neighbors)
 */

import type { SeededRandom } from "@rogue/contracts";
import type { Room, Connection, SpawnPoint } from "../../pipeline/types";

// =============================================================================
// CORE TYPES
// =============================================================================

/**
 * Positioning strategy for spawn placement
 */
export type PositioningStrategy =
  | "center" // Single entity at room center
  | "corners" // Place at room corners
  | "edges" // Place along room edges
  | "scattered" // Random distribution
  | "cluster" // Grouped placement
  | "symmetric"; // Mirror placement across axes

/**
 * Entity type categories
 */
export type EntityType =
  | "enemy"
  | "item"
  | "hazard"
  | "decoration"
  | "interactive";

/**
 * Spawn template - what to place and how
 */
export interface SpawnTemplate {
  readonly type: EntityType;
  readonly tags: readonly string[];
  readonly count: { readonly min: number; readonly max: number };
  readonly positioning: PositioningStrategy;
  readonly distanceScaling?: boolean;
}

/**
 * Placement condition types
 */
export type ConditionType = "distance" | "roomSize" | "trait" | "neighborType";

/**
 * Comparison operators
 */
export type ConditionOperator = "gt" | "lt" | "eq" | "contains";

/**
 * Condition for placement
 */
export interface PlacementCondition {
  readonly type: ConditionType;
  readonly operator: ConditionOperator;
  readonly value: number | string;
}

/**
 * Placement rule - applies to specific room types
 */
export interface PlacementRule {
  readonly id: string;
  readonly roomTypes: readonly string[];
  readonly spawnTemplates: readonly SpawnTemplate[];
  readonly conditions?: readonly PlacementCondition[];
  readonly weight: number;
  readonly description?: string;
}

// =============================================================================
// DISTANCE-BASED SCALING
// =============================================================================

/**
 * Scale enemy level based on distance from entrance.
 */
export function scaleByDistance(
  baseLevel: number,
  distance: number,
  maxDistance: number,
): number {
  if (maxDistance === 0) return baseLevel;
  const ratio = distance / maxDistance;
  const scale = 1 + ratio * 2;
  return Math.floor(baseLevel * scale);
}

/**
 * Scale loot quality (tier) based on distance.
 */
export function scaleLootQuality(
  baseTier: number,
  distance: number,
  maxDistance: number,
): number {
  if (maxDistance === 0) return baseTier;
  const ratio = distance / maxDistance;
  const bonus = Math.floor(ratio * 3);
  return Math.min(3, baseTier + bonus);
}

// =============================================================================
// POSITIONING STRATEGIES
// =============================================================================

function getPositionsForStrategy(
  room: Room,
  strategy: PositioningStrategy,
  count: number,
  rng: SeededRandom,
  padding: number = 1,
): Array<{ x: number; y: number }> {
  const positions: Array<{ x: number; y: number }> = [];

  switch (strategy) {
    case "center":
      positions.push({ x: room.centerX, y: room.centerY });
      break;

    case "corners": {
      const corners = [
        { x: room.x + padding, y: room.y + padding },
        { x: room.x + room.width - padding - 1, y: room.y + padding },
        { x: room.x + padding, y: room.y + room.height - padding - 1 },
        {
          x: room.x + room.width - padding - 1,
          y: room.y + room.height - padding - 1,
        },
      ];
      const shuffled = shuffleArray(corners, rng);
      positions.push(...shuffled.slice(0, count));
      break;
    }

    case "edges": {
      const edges: Array<{ x: number; y: number }> = [];
      for (let x = room.x + padding; x < room.x + room.width - padding; x++) {
        edges.push({ x, y: room.y + padding });
        edges.push({ x, y: room.y + room.height - padding - 1 });
      }
      for (
        let y = room.y + padding + 1;
        y < room.y + room.height - padding - 1;
        y++
      ) {
        edges.push({ x: room.x + padding, y });
        edges.push({ x: room.x + room.width - padding - 1, y });
      }
      const shuffled = shuffleArray(edges, rng);
      positions.push(...shuffled.slice(0, count));
      break;
    }

    case "scattered": {
      const minSpacing = 2;
      let attempts = 0;
      const maxAttempts = count * 10;

      while (positions.length < count && attempts < maxAttempts) {
        const x =
          room.x +
          padding +
          Math.floor(rng.next() * (room.width - 2 * padding));
        const y =
          room.y +
          padding +
          Math.floor(rng.next() * (room.height - 2 * padding));

        const tooClose = positions.some(
          (pos) => Math.abs(pos.x - x) + Math.abs(pos.y - y) < minSpacing,
        );

        if (!tooClose) {
          positions.push({ x, y });
        }
        attempts++;
      }
      break;
    }

    case "cluster": {
      const clusterX =
        room.x +
        padding +
        Math.floor(rng.next() * (room.width - 2 * padding));
      const clusterY =
        room.y +
        padding +
        Math.floor(rng.next() * (room.height - 2 * padding));

      positions.push({ x: clusterX, y: clusterY });

      const offsets = [
        { dx: 1, dy: 0 },
        { dx: -1, dy: 0 },
        { dx: 0, dy: 1 },
        { dx: 0, dy: -1 },
        { dx: 1, dy: 1 },
        { dx: -1, dy: -1 },
        { dx: 1, dy: -1 },
        { dx: -1, dy: 1 },
      ];

      const shuffled = shuffleArray(offsets, rng);
      for (let i = 0; i < count - 1 && i < shuffled.length; i++) {
        const offset = shuffled[i]!;
        const x = clusterX + offset.dx;
        const y = clusterY + offset.dy;

        if (
          x >= room.x + padding &&
          x < room.x + room.width - padding &&
          y >= room.y + padding &&
          y < room.y + room.height - padding
        ) {
          positions.push({ x, y });
        }
      }
      break;
    }

    case "symmetric": {
      const halfCount = Math.ceil(count / 2);
      for (let i = 0; i < halfCount; i++) {
        const offsetX = Math.floor(rng.next() * (room.width / 2 - padding));
        const offsetY = Math.floor(
          rng.next() * (room.height / 2 - padding),
        );

        const x1 = room.centerX - offsetX;
        const y1 = room.centerY - offsetY;
        const x2 = room.centerX + offsetX;
        const y2 = room.centerY + offsetY;

        positions.push({ x: x1, y: y1 });
        if (positions.length < count) {
          positions.push({ x: x2, y: y2 });
        }
      }
      break;
    }
  }

  return positions.slice(0, count);
}

function shuffleArray<T>(array: T[], rng: SeededRandom): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    const temp = result[i]!;
    result[i] = result[j]!;
    result[j] = temp;
  }
  return result;
}

// =============================================================================
// CONDITION EVALUATION
// =============================================================================

function evaluateCondition(
  condition: PlacementCondition,
  room: Room,
  distance: number,
  neighbors: readonly string[],
): boolean {
  switch (condition.type) {
    case "distance": {
      const value = typeof condition.value === "number" ? condition.value : 0;
      switch (condition.operator) {
        case "gt":
          return distance > value;
        case "lt":
          return distance < value;
        case "eq":
          return distance === value;
        default:
          return false;
      }
    }

    case "roomSize": {
      const area = room.width * room.height;
      const value = typeof condition.value === "number" ? condition.value : 0;
      switch (condition.operator) {
        case "gt":
          return area > value;
        case "lt":
          return area < value;
        case "eq":
          return area === value;
        default:
          return false;
      }
    }

    case "trait": {
      if (!room.traits) return false;
      const parts =
        typeof condition.value === "string"
          ? condition.value.split(":")
          : ["", "0"];
      const traitName = parts[0] ?? "";
      const threshold = parts[1] ?? "0";
      const traitValue = (room.traits as Record<string, number>)[traitName] ?? 0;
      const thresholdNum = parseFloat(threshold);

      switch (condition.operator) {
        case "gt":
          return traitValue > thresholdNum;
        case "lt":
          return traitValue < thresholdNum;
        case "eq":
          return Math.abs(traitValue - thresholdNum) < 0.01;
        default:
          return false;
      }
    }

    case "neighborType": {
      const type = typeof condition.value === "string" ? condition.value : "";
      switch (condition.operator) {
        case "contains":
          return neighbors.includes(type);
        case "eq":
          return neighbors.length === 1 && neighbors[0] === type;
        default:
          return false;
      }
    }

    default:
      return false;
  }
}

// =============================================================================
// MAIN PLACEMENT FUNCTION
// =============================================================================

/**
 * Apply placement rules to rooms and generate spawn points
 */
export function applyPlacementRules(
  rooms: readonly Room[],
  connections: readonly Connection[],
  rules: readonly PlacementRule[],
  rng: SeededRandom,
): SpawnPoint[] {
  const spawns: SpawnPoint[] = [];

  const distances = calculateRoomDistances(rooms, connections);
  const maxDistance = Math.max(...Array.from(distances.values()), 1);

  const neighbors = buildNeighborMap(rooms, connections);

  for (const room of rooms) {
    const distance = distances.get(room.id) ?? 0;
    const roomNeighbors = neighbors.get(room.id) ?? [];

    const applicableRules = rules.filter((rule) =>
      rule.roomTypes.includes(room.type),
    );

    const validRules = applicableRules.filter((rule) => {
      if (!rule.conditions || rule.conditions.length === 0) return true;
      return rule.conditions.every((cond) =>
        evaluateCondition(cond, room, distance, roomNeighbors),
      );
    });

    if (validRules.length === 0) continue;

    const totalWeight = validRules.reduce((sum, rule) => sum + rule.weight, 0);
    let roll = rng.next() * totalWeight;
    let selectedRule: PlacementRule | null = null;

    for (const rule of validRules) {
      roll -= rule.weight;
      if (roll <= 0) {
        selectedRule = rule;
        break;
      }
    }

    if (!selectedRule) continue;

    for (const template of selectedRule.spawnTemplates) {
      const count =
        template.count.min +
        Math.floor(
          rng.next() * (template.count.max - template.count.min + 1),
        );

      const positions = getPositionsForStrategy(
        room,
        template.positioning,
        count,
        rng,
      );

      for (const pos of positions) {
        const baseLevel = 1;
        const scaledLevel = template.distanceScaling
          ? scaleByDistance(baseLevel, distance, maxDistance)
          : baseLevel;

        spawns.push({
          type: "spawn",
          position: { x: pos.x, y: pos.y },
          roomId: room.id,
          tags: [template.type, ...template.tags, `level:${scaledLevel}`],
          weight: scaledLevel / maxDistance,
          distanceFromStart: distance,
        });
      }
    }
  }

  return spawns;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function calculateRoomDistances(
  rooms: readonly Room[],
  connections: readonly Connection[],
): Map<number, number> {
  const distances = new Map<number, number>();
  const entrance = rooms.find((r) => r.type === "entrance");

  if (!entrance) {
    for (const room of rooms) {
      distances.set(room.id, 0);
    }
    return distances;
  }

  const adjacency = new Map<number, number[]>();
  for (const room of rooms) {
    adjacency.set(room.id, []);
  }
  for (const conn of connections) {
    adjacency.get(conn.fromRoomId)?.push(conn.toRoomId);
    adjacency.get(conn.toRoomId)?.push(conn.fromRoomId);
  }

  const queue: Array<{ id: number; dist: number }> = [
    { id: entrance.id, dist: 0 },
  ];
  distances.set(entrance.id, 0);

  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;

    const neighborIds = adjacency.get(current.id) ?? [];
    for (const neighborId of neighborIds) {
      if (!distances.has(neighborId)) {
        distances.set(neighborId, current.dist + 1);
        queue.push({ id: neighborId, dist: current.dist + 1 });
      }
    }
  }

  return distances;
}

function buildNeighborMap(
  rooms: readonly Room[],
  connections: readonly Connection[],
): Map<number, string[]> {
  const map = new Map<number, string[]>();
  const roomTypesById = new Map(rooms.map((r) => [r.id, r.type]));

  for (const room of rooms) {
    map.set(room.id, []);
  }

  for (const conn of connections) {
    const fromType = roomTypesById.get(conn.fromRoomId);
    const toType = roomTypesById.get(conn.toRoomId);

    if (fromType) {
      map.get(conn.toRoomId)?.push(fromType);
    }
    if (toType) {
      map.get(conn.fromRoomId)?.push(toType);
    }
  }

  return map;
}

// =============================================================================
// STANDARD PLACEMENT RULES - MEDIEVAL FANTASY / ABYSS
// =============================================================================

export const ABYSS_PLACEMENT_RULES: readonly PlacementRule[] = [
  {
    id: "entrance-safe",
    roomTypes: ["entrance"],
    spawnTemplates: [
      {
        type: "item",
        tags: ["hint", "tutorial"],
        count: { min: 1, max: 1 },
        positioning: "center",
        distanceScaling: false,
      },
    ],
    weight: 100,
    description: "Tutorial hint in entrance, no enemies",
  },

  {
    id: "arena-combat",
    roomTypes: ["combat", "arena", "normal"],
    spawnTemplates: [
      {
        type: "enemy",
        tags: ["warrior", "aggressive"],
        count: { min: 2, max: 4 },
        positioning: "scattered",
        distanceScaling: true,
      },
      {
        type: "hazard",
        tags: ["spike", "trap"],
        count: { min: 0, max: 2 },
        positioning: "edges",
        distanceScaling: false,
      },
    ],
    weight: 90,
    description: "Combat encounter with enemies and optional hazards",
  },

  {
    id: "treasure-guarded",
    roomTypes: ["treasure"],
    spawnTemplates: [
      {
        type: "item",
        tags: ["loot", "gold"],
        count: { min: 1, max: 3 },
        positioning: "center",
        distanceScaling: false,
      },
      {
        type: "enemy",
        tags: ["guardian", "elite"],
        count: { min: 0, max: 1 },
        positioning: "center",
        distanceScaling: true,
      },
    ],
    weight: 80,
    description: "Treasure with optional guardian",
  },

  {
    id: "boss-arena",
    roomTypes: ["boss"],
    spawnTemplates: [
      {
        type: "enemy",
        tags: ["boss", "legendary", "abyss"],
        count: { min: 1, max: 1 },
        positioning: "center",
        distanceScaling: false,
      },
      {
        type: "hazard",
        tags: ["fire", "arena", "void"],
        count: { min: 2, max: 4 },
        positioning: "symmetric",
        distanceScaling: false,
      },
    ],
    weight: 100,
    description: "Boss encounter with arena hazards",
  },

  {
    id: "shrine-rest",
    roomTypes: ["rest", "shrine"],
    spawnTemplates: [
      {
        type: "interactive",
        tags: ["healing", "shrine", "blessed"],
        count: { min: 1, max: 1 },
        positioning: "center",
        distanceScaling: false,
      },
      {
        type: "decoration",
        tags: ["candle", "religious", "ancient"],
        count: { min: 2, max: 4 },
        positioning: "corners",
        distanceScaling: false,
      },
    ],
    weight: 100,
    description: "Safe rest area with healing",
  },

  {
    id: "secret-trapped",
    roomTypes: ["secret"],
    spawnTemplates: [
      {
        type: "item",
        tags: ["rare", "artifact", "cursed"],
        count: { min: 1, max: 2 },
        positioning: "center",
        distanceScaling: false,
      },
      {
        type: "hazard",
        tags: ["trap", "poison", "ancient"],
        count: { min: 1, max: 1 },
        positioning: "edges",
        distanceScaling: false,
      },
    ],
    weight: 70,
    description: "Secret room with rare loot and trap",
  },

  {
    id: "crypt-undead",
    roomTypes: ["crypt"],
    spawnTemplates: [
      {
        type: "enemy",
        tags: ["undead", "skeleton", "cursed"],
        count: { min: 2, max: 5 },
        positioning: "scattered",
        distanceScaling: true,
      },
      {
        type: "item",
        tags: ["cursed", "bone", "ancient"],
        count: { min: 0, max: 1 },
        positioning: "corners",
        distanceScaling: false,
      },
    ],
    weight: 85,
    description: "Crypt with undead enemies",
  },

  {
    id: "forge-fire",
    roomTypes: ["forge"],
    spawnTemplates: [
      {
        type: "hazard",
        tags: ["fire", "forge", "heat"],
        count: { min: 2, max: 3 },
        positioning: "edges",
        distanceScaling: false,
      },
      {
        type: "item",
        tags: ["weapon", "metal", "forged"],
        count: { min: 1, max: 2 },
        positioning: "center",
        distanceScaling: false,
      },
    ],
    weight: 80,
    description: "Forge with fire hazards and weapons",
  },

  {
    id: "library-magic",
    roomTypes: ["library"],
    spawnTemplates: [
      {
        type: "item",
        tags: ["scroll", "magic", "knowledge"],
        count: { min: 1, max: 3 },
        positioning: "scattered",
        distanceScaling: false,
      },
      {
        type: "enemy",
        tags: ["mage", "ethereal", "arcane"],
        count: { min: 0, max: 2 },
        positioning: "corners",
        distanceScaling: true,
      },
    ],
    weight: 75,
    description: "Library with scrolls and magic enemies",
  },

  {
    id: "cavern-natural",
    roomTypes: ["cavern", "cave"],
    spawnTemplates: [
      {
        type: "decoration",
        tags: ["stalagmite", "mushroom", "crystal"],
        count: { min: 3, max: 6 },
        positioning: "scattered",
        distanceScaling: false,
      },
      {
        type: "enemy",
        tags: ["beast", "wild", "spider"],
        count: { min: 1, max: 2 },
        positioning: "cluster",
        distanceScaling: true,
      },
    ],
    weight: 70,
    description: "Natural cavern with decorations and beasts",
  },

  {
    id: "hub-crossroads",
    roomTypes: ["hub", "crossroads"],
    spawnTemplates: [
      {
        type: "decoration",
        tags: ["pillar", "statue", "ancient"],
        count: { min: 2, max: 4 },
        positioning: "corners",
        distanceScaling: false,
      },
      {
        type: "enemy",
        tags: ["patrol", "guard"],
        count: { min: 0, max: 1 },
        positioning: "center",
        distanceScaling: true,
      },
    ],
    weight: 60,
    description: "Hub room with decorations",
  },
];

// =============================================================================
// RULE BUILDER UTILITIES
// =============================================================================

export function createPlacementRule(
  id: string,
  roomTypes: string[],
  spawnTemplates: SpawnTemplate[],
  options: {
    conditions?: PlacementCondition[];
    weight?: number;
    description?: string;
  } = {},
): PlacementRule {
  return {
    id,
    roomTypes,
    spawnTemplates,
    conditions: options.conditions,
    weight: options.weight ?? 50,
    description: options.description,
  };
}

export function createSpawnTemplate(
  type: EntityType,
  tags: string[],
  count: { min: number; max: number },
  positioning: PositioningStrategy,
  distanceScaling: boolean = false,
): SpawnTemplate {
  return {
    type,
    tags,
    count,
    positioning,
    distanceScaling,
  };
}

export function createCondition(
  type: ConditionType,
  operator: ConditionOperator,
  value: number | string,
): PlacementCondition {
  return {
    type,
    operator,
    value,
  };
}
