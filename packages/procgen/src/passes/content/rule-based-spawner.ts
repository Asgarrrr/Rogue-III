/**
 * Rule-Based Content Spawner
 *
 * Data-driven content placement using the rule engine.
 *
 * @example
 * ```typescript
 * const rules = `[
 *   {
 *     "id": "treasure-in-dead-ends",
 *     "priority": 100,
 *     "condition": { "type": "op", "op": "&&",
 *       "left": { "type": "field", "path": "room.isDeadEnd" },
 *       "right": { "type": "op", "op": ">",
 *         "left": { "type": "field", "path": "room.normalizedDistance" },
 *         "right": { "type": "literal", "value": 0.5 }
 *       }
 *     },
 *     "action": { "type": "spawn", "template": "treasure_chest", "count": 1, "tags": ["loot"] }
 *   }
 * ]`;
 *
 * const spawner = createRuleSpawner({ rules });
 * // Use in pipeline or directly
 * ```
 */

import { CellType } from "../../core/grid/types";
import {
  createRuleEngine,
  parseRules,
  type Rule,
} from "../../core/rules/engine";
import {
  createObjectResolver,
  createRuleCache,
  evaluate,
} from "../../core/rules/evaluator";
import type { Expression } from "../../core/rules/expression";
import { builtinFunctions } from "../../core/rules/functions";
import {
  calculateConnectionCounts,
  calculateRoomDistances,
} from "../connectivity/graph-algorithms";
import type {
  DungeonStateArtifact,
  Pass,
  Room,
  SpawnPoint,
} from "../../pipeline/types";
import type {
  ContentAction,
  ContentRule,
  PlacedSpawn,
  RuleSpawnerConfig,
  SpawnAction,
  SpawnPlacementOptions,
  SpawnRuleContext,
} from "./types";
import { DEFAULT_SPAWN_OPTIONS } from "./types";

// =============================================================================
// RULE SPAWNER PASS
// =============================================================================

/**
 * Create a rule-based spawner pass
 *
 * Evaluates rules against each room to determine content placement.
 */
export function createRuleSpawner(
  config: RuleSpawnerConfig,
): Pass<DungeonStateArtifact, DungeonStateArtifact> {
  return {
    id: "content.rule-spawner",
    inputType: "dungeon-state",
    outputType: "dungeon-state",
    run(input, ctx) {
      const options = { ...DEFAULT_SPAWN_OPTIONS, ...config.placement };
      const engine = createRuleEngine<ContentAction>();

      // Load rules
      const rules =
        typeof config.rules === "string"
          ? parseRules<ContentAction>(config.rules)
          : (config.rules as Rule<ContentAction>[]);

      for (const rule of rules) {
        engine.addRule(rule);
      }

      // Calculate room distances from entrance
      const entranceRoom = input.rooms.find((r) => r.type === "entrance");
      const roomDistances = calculateRoomDistances(
        input.rooms,
        input.connections,
        entranceRoom?.id ?? 0,
      );

      // Calculate room connection counts
      const connectionCounts = calculateConnectionCounts(
        input.rooms,
        input.connections,
      );

      // Find max distance for normalization
      const maxDistance = Math.max(...Array.from(roomDistances.values()), 1);

      const rng = ctx.streams.details;
      const newSpawns: SpawnPoint[] = [];

      // State tracking for rules
      const state = {
        totalSpawns: input.spawns.length,
        spawnsByType: countSpawnsByType(input.spawns),
        processedRooms: 0,
      };

      // Process each room
      for (const room of input.rooms) {
        const distance = roomDistances.get(room.id) ?? 0;
        const connectionCount = connectionCounts.get(room.id) ?? 0;

        // Build context for this room
        const ruleContext: SpawnRuleContext = {
          room: {
            id: room.id,
            type: room.type,
            width: room.width,
            height: room.height,
            area: room.width * room.height,
            centerX: room.centerX,
            centerY: room.centerY,
            distanceFromStart: distance,
            normalizedDistance: distance / maxDistance,
            connectionCount,
            isDeadEnd: connectionCount === 1,
            isHub: connectionCount >= 3,
          },
          dungeon: {
            width: input.width,
            height: input.height,
            roomCount: input.rooms.length,
            connectionCount: input.connections.length,
            depth: ctx.config.depth ?? 1,
            difficulty: ctx.config.difficulty ?? 0.5,
          },
          state: { ...state },
          ...(config.context ?? {}),
        };

        const resolver = createObjectResolver(ruleContext);
        const result = engine.evaluate(resolver, () => rng.next());

        // Process matched rules
        for (const match of result.matched) {
          const action = match.action;
          if (!action) continue;

          if (action.type === "spawn") {
            const spawns = processSpawnAction(
              action,
              room,
              input,
              options,
              rng,
              match.ruleId,
              distance,
              resolver,
            );

            for (const spawn of spawns) {
              newSpawns.push({
                position: spawn.position,
                roomId: spawn.roomId,
                type: spawn.type as SpawnPoint["type"],
                tags: spawn.tags,
                weight: spawn.weight,
                distanceFromStart: spawn.distanceFromStart,
              });

              // Update state
              state.totalSpawns++;
              state.spawnsByType[spawn.template] =
                (state.spawnsByType[spawn.template] ?? 0) + 1;
            }
          }
        }

        state.processedRooms++;
      }

      if (config.trace) {
        ctx.trace.decision(
          "content.rule-spawner",
          "Rule-based spawning",
          [`${rules.length} rules`, `${input.rooms.length} rooms processed`],
          `${newSpawns.length} new spawns`,
          `Total spawns: ${input.spawns.length + newSpawns.length}`,
        );
      }

      return {
        ...input,
        spawns: [...input.spawns, ...newSpawns],
      };
    },
  };
}

// =============================================================================
// SPAWN PROCESSING
// =============================================================================

/**
 * Process a spawn action and return placed spawns
 */
function processSpawnAction(
  action: SpawnAction,
  room: Room,
  dungeon: DungeonStateArtifact,
  options: Required<SpawnPlacementOptions>,
  rng: { next(): number },
  ruleId: string,
  distance: number,
  resolver: ReturnType<typeof createObjectResolver>,
): PlacedSpawn[] {
  // Check room type filters
  if (action.roomTypes && !action.roomTypes.includes(room.type)) {
    return [];
  }
  if (action.excludeRoomTypes?.includes(room.type)) {
    return [];
  }

  // Check distance filters
  if (
    action.minDistanceFromStart !== undefined &&
    distance < action.minDistanceFromStart
  ) {
    return [];
  }
  if (
    action.maxDistanceFromStart !== undefined &&
    distance > action.maxDistanceFromStart
  ) {
    return [];
  }

  // Evaluate count (can be expression)
  let count: number;
  if (typeof action.count === "number") {
    count = action.count;
  } else {
    // It's an expression, evaluate it with proper function registry
    const evalCtx = {
      fields: resolver,
      functions: builtinFunctions,
      ruleCache: createRuleCache(),
      rng: () => rng.next(),
    };
    const result = evaluate(action.count, evalCtx);
    count = typeof result === "number" ? Math.floor(result) : 1;
  }

  const spawns: PlacedSpawn[] = [];
  const placedPositions: Array<{ x: number; y: number }> = [];

  for (let i = 0; i < count; i++) {
    const position = findValidSpawnPosition(
      room,
      dungeon,
      options,
      placedPositions,
      rng,
    );

    if (position) {
      placedPositions.push(position);
      spawns.push({
        position,
        roomId: room.id,
        template: action.template,
        type: categorizeSpawnType(action.template, action.tags),
        tags: action.tags,
        weight: action.weight ?? 1,
        distanceFromStart: distance,
        ruleId,
      });
    }
  }

  return spawns;
}

/**
 * Find a valid spawn position within a room
 */
function findValidSpawnPosition(
  room: Room,
  dungeon: DungeonStateArtifact,
  options: Required<SpawnPlacementOptions>,
  existingPositions: readonly { x: number; y: number }[],
  rng: { next(): number },
): { x: number; y: number } | null {
  const padding = options.avoidEdges ? options.edgePadding : 0;
  const minX = room.x + padding;
  const minY = room.y + padding;
  const maxX = room.x + room.width - padding - 1;
  const maxY = room.y + room.height - padding - 1;

  if (maxX < minX || maxY < minY) {
    // Room too small for padding, try center
    return options.requireFloor &&
      dungeon.grid.get(room.centerX, room.centerY) !== CellType.FLOOR
      ? null
      : { x: room.centerX, y: room.centerY };
  }

  for (let attempt = 0; attempt < options.maxRetries; attempt++) {
    const x = minX + Math.floor(rng.next() * (maxX - minX + 1));
    const y = minY + Math.floor(rng.next() * (maxY - minY + 1));

    // Check floor requirement
    if (options.requireFloor && dungeon.grid.get(x, y) !== CellType.FLOOR) {
      continue;
    }

    // Check minimum distance from existing positions
    let tooClose = false;
    for (const pos of existingPositions) {
      const dist = Math.abs(x - pos.x) + Math.abs(y - pos.y);
      if (dist < options.minSpawnDistance) {
        tooClose = true;
        break;
      }
    }

    if (!tooClose) {
      return { x, y };
    }
  }

  return null;
}

/**
 * Categorize spawn template into SpawnPointType.
 *
 * Only structural types ("entrance", "exit") are preserved.
 * All other spawns use "spawn" - the game layer interprets via tags.
 */
function categorizeSpawnType(
  template: string,
  tags: readonly string[],
): "entrance" | "exit" | "spawn" {
  const templateLower = template.toLowerCase();
  const tagSet = new Set(tags.map((t) => t.toLowerCase()));

  // Structural types only
  if (tagSet.has("entrance") || templateLower.includes("entrance"))
    return "entrance";
  if (tagSet.has("exit") || templateLower.includes("exit")) return "exit";

  // Everything else is a generic spawn - game layer interprets via tags
  return "spawn";
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Count spawns by type
 */
function countSpawnsByType(
  spawns: readonly SpawnPoint[],
): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const spawn of spawns) {
    counts[spawn.type] = (counts[spawn.type] ?? 0) + 1;
  }
  return counts;
}

// =============================================================================
// RULE BUILDERS
// =============================================================================

/**
 * Create a spawn rule programmatically
 */
export function createSpawnRule(
  id: string,
  priority: number,
  condition: Expression,
  action: SpawnAction,
  options: { description?: string; tags?: string[]; exclusive?: boolean } = {},
): ContentRule {
  return {
    id,
    priority,
    condition,
    action,
    ...options,
  };
}

/**
 * Create common spawn rules for typical dungeon content
 */
export function createStandardRules(): ContentRule[] {
  return [
    // Enemies scale with distance from entrance
    createSpawnRule(
      "enemies-scale-distance",
      80,
      {
        type: "op",
        op: ">",
        left: { type: "field", path: "room.normalizedDistance" },
        right: { type: "literal", value: 0.2 },
      },
      {
        type: "spawn",
        template: "enemy_basic",
        count: {
          type: "fn",
          name: "floor",
          args: [
            {
              type: "op",
              op: "+",
              left: { type: "literal", value: 1 },
              right: {
                type: "op",
                op: "*",
                left: { type: "field", path: "room.normalizedDistance" },
                right: { type: "literal", value: 3 },
              },
            },
          ],
        },
        tags: ["enemy", "combat"],
        excludeRoomTypes: ["entrance", "exit"],
      },
      { description: "Spawn enemies scaling with distance from entrance" },
    ),

    // Treasure in dead-end rooms far from entrance
    createSpawnRule(
      "treasure-dead-ends",
      100,
      {
        type: "op",
        op: "&&",
        left: { type: "field", path: "room.isDeadEnd" },
        right: {
          type: "op",
          op: ">",
          left: { type: "field", path: "room.normalizedDistance" },
          right: { type: "literal", value: 0.5 },
        },
      },
      {
        type: "spawn",
        template: "treasure_chest",
        count: 1,
        tags: ["loot", "treasure"],
        excludeRoomTypes: ["entrance", "exit"],
      },
      { description: "Place treasure in dead-end rooms" },
    ),

    // Health potions in hub rooms
    createSpawnRule(
      "healing-hubs",
      60,
      { type: "field", path: "room.isHub" },
      {
        type: "spawn",
        template: "health_potion",
        count: 1,
        tags: ["item", "healing"],
        excludeRoomTypes: ["entrance", "exit", "boss"],
      },
      { description: "Place healing potions in hub rooms" },
    ),

    // Boss in boss room
    createSpawnRule(
      "boss-spawn",
      200,
      {
        type: "op",
        op: "==",
        left: { type: "field", path: "room.type" },
        right: { type: "literal", value: "boss" },
      },
      {
        type: "spawn",
        template: "boss_enemy",
        count: 1,
        tags: ["enemy", "boss"],
      },
      { description: "Spawn boss in boss room", exclusive: true },
    ),
  ];
}

/**
 * Serialize rules to JSON
 */
export function serializeRules(rules: readonly ContentRule[]): string {
  return JSON.stringify(rules, null, 2);
}
