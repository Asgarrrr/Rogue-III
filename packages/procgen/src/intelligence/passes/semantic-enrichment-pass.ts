/**
 * Semantic Enrichment Pass
 *
 * Pipeline pass that enriches spawn points with semantic context,
 * transforming raw spawns into meaningful entities with roles,
 * behaviors, and relationships.
 */

import {
  buildRoomAdjacency,
  calculateRoomGraphDistances,
} from "../../core/graph";
import type {
  DungeonStateArtifact,
  Pass,
  PassContext,
  Room,
} from "../../pipeline/types";
import {
  createEntityFactory,
  type EntityCreationContext,
  type SemanticConfig,
  type SemanticEnrichment,
  type SemanticEntity,
  type SemanticItem,
} from "../semantic";
import { DEFAULT_SEMANTIC_CONFIG } from "../semantic/types";

// =============================================================================
// PASS CONFIGURATION
// =============================================================================

/**
 * Configuration for the semantic enrichment pass.
 */
export interface SemanticEnrichmentPassConfig {
  /** Semantic configuration for entity/item creation */
  readonly semanticConfig: Partial<SemanticConfig>;

  /** Whether to validate enrichment results */
  readonly validate: boolean;

  /** Whether to log detailed enrichment info */
  readonly verbose: boolean;
}

/**
 * Default configuration.
 */
export const DEFAULT_SEMANTIC_ENRICHMENT_CONFIG: SemanticEnrichmentPassConfig = {
  semanticConfig: {},
  validate: true,
  verbose: false,
};

// =============================================================================
// DISTANCE CALCULATION (using shared utilities from core/graph)
// =============================================================================

/**
 * Calculate distances from entrance room using BFS.
 * Uses shared utility from core/graph.
 */
function calculateDistances(
  rooms: readonly Room[],
  adjacency: ReadonlyMap<number, readonly number[]>,
): { distances: Map<number, number>; maxDistance: number } {
  const entranceRoom = rooms.find((r) => r.type === "entrance");

  if (!entranceRoom) {
    // No entrance, use first room
    const distances = new Map<number, number>();
    const firstRoom = rooms[0];
    if (firstRoom) {
      distances.set(firstRoom.id, 0);
    }
    return { distances, maxDistance: 0 };
  }

  const result = calculateRoomGraphDistances(entranceRoom.id, adjacency);
  return result;
}

// =============================================================================
// ENRICHMENT EXECUTION
// =============================================================================

/**
 * Enrich all spawns in the dungeon.
 */
function enrichSpawns(
  state: DungeonStateArtifact,
  config: SemanticConfig,
  rng: () => number,
): SemanticEnrichment {
  const factory = createEntityFactory(config);

  // Build context
  const roomById = new Map<number, Room>();
  for (const room of state.rooms) {
    roomById.set(room.id, room);
  }

  const adjacency = buildRoomAdjacency(state.rooms, state.connections);
  const { distances, maxDistance } = calculateDistances(state.rooms, adjacency);

  const createdEntities = new Map<string, SemanticEntity>();
  const createdItems = new Map<string, SemanticItem>();

  const ctx: EntityCreationContext = {
    rooms: state.rooms,
    roomById,
    roomDistances: distances,
    maxDistance,
    createdEntities,
    createdItems,
    config,
    rng,
  };

  // Process enemy spawns first (so items can reference guardians)
  for (const spawn of state.spawns) {
    if (spawn.type === "enemy") {
      const entity = factory.createEntity(spawn, ctx);
      createdEntities.set(entity.id, entity);
    }
  }

  // Process item spawns
  for (const spawn of state.spawns) {
    if (spawn.type !== "enemy") {
      const item = factory.createItem(spawn, ctx);
      createdItems.set(item.id, item);
    }
  }

  // Build lookup maps
  const entityBySpawnId = new Map<string, SemanticEntity>();
  const itemBySpawnId = new Map<string, SemanticItem>();
  const entitiesByRoom = new Map<number, SemanticEntity[]>();
  const itemsByRoom = new Map<number, SemanticItem[]>();

  for (const entity of createdEntities.values()) {
    entityBySpawnId.set(entity.spawnId, entity);

    const roomEntities = entitiesByRoom.get(entity.roomId) ?? [];
    roomEntities.push(entity);
    entitiesByRoom.set(entity.roomId, roomEntities);
  }

  for (const item of createdItems.values()) {
    itemBySpawnId.set(item.spawnId, item);

    const roomItems = itemsByRoom.get(item.roomId) ?? [];
    roomItems.push(item);
    itemsByRoom.set(item.roomId, roomItems);
  }

  return {
    entities: Array.from(createdEntities.values()),
    items: Array.from(createdItems.values()),
    entityBySpawnId,
    itemBySpawnId,
    entitiesByRoom,
    itemsByRoom,
  };
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate enrichment results.
 */
function validateEnrichment(
  enrichment: SemanticEnrichment,
  state: DungeonStateArtifact,
): string[] {
  const warnings: string[] = [];

  // Check all enemy spawns have entities
  const enemySpawns = state.spawns.filter((s) => s.type === "enemy").length;
  if (enrichment.entities.length !== enemySpawns) {
    warnings.push(
      `Entity count mismatch: ${enrichment.entities.length} entities for ${enemySpawns} enemy spawns`,
    );
  }

  // Check for orphaned guardians
  for (const entity of enrichment.entities) {
    if (entity.role === "guardian" && !entity.guards) {
      warnings.push(`Guardian ${entity.id} has no guard target`);
    }
  }

  // Check for boss without minions
  const bosses = enrichment.entities.filter((e) => e.role === "boss");
  for (const boss of bosses) {
    const roomMinions = enrichment.entities.filter(
      (e) => e.roomId === boss.roomId && e.role === "minion",
    );
    if (roomMinions.length === 0) {
      // Not necessarily a problem, just note it
    }
  }

  return warnings;
}

// =============================================================================
// PASS IMPLEMENTATION
// =============================================================================

/**
 * Extended state with semantic enrichment.
 */
export interface EnrichedDungeonState extends DungeonStateArtifact {
  readonly semanticEnrichment: SemanticEnrichment;
}

/**
 * Create a semantic enrichment pass.
 *
 * This pass transforms raw spawn points into semantic entities
 * with meaningful roles, behaviors, and relationships.
 *
 * @example
 * ```typescript
 * const pass = createSemanticEnrichmentPass({
 *   semanticConfig: {
 *     difficultyScaling: 1.5,
 *   },
 * });
 * ```
 */
export function createSemanticEnrichmentPass(
  config: Partial<SemanticEnrichmentPassConfig> = {},
): Pass<DungeonStateArtifact, EnrichedDungeonState> {
  const fullConfig: SemanticEnrichmentPassConfig = {
    ...DEFAULT_SEMANTIC_ENRICHMENT_CONFIG,
    ...config,
  };

  const semanticConfig: SemanticConfig = {
    ...DEFAULT_SEMANTIC_CONFIG,
    ...fullConfig.semanticConfig,
  };

  return {
    id: "intelligence.semantic-enrichment",
    inputType: "dungeon-state",
    outputType: "dungeon-state",

    run(input: DungeonStateArtifact, ctx: PassContext): EnrichedDungeonState {
      const rng = () => ctx.streams.details.next();

      // Perform enrichment
      const enrichment = enrichSpawns(input, semanticConfig, rng);

      // Log summary
      ctx.trace.decision(
        "intelligence.semantic-enrichment",
        "Enrichment complete",
        [
          `${enrichment.entities.length} entities`,
          `${enrichment.items.length} items`,
        ],
        "success",
        `Roles: ${summarizeRoles(enrichment.entities)}`,
      );

      // Validate if enabled
      if (fullConfig.validate) {
        const warnings = validateEnrichment(enrichment, input);
        if (warnings.length > 0) {
          ctx.trace.decision(
            "intelligence.semantic-enrichment",
            "Validation warnings",
            warnings,
            warnings.length,
            warnings.slice(0, 2).join("; "),
          );
        }
      }

      // Verbose logging
      if (fullConfig.verbose) {
        for (const entity of enrichment.entities) {
          ctx.trace.decision(
            "intelligence.semantic-enrichment",
            `Entity: ${entity.template}`,
            [entity.role, entity.guards ?? "none"],
            entity.difficulty.toFixed(2),
            `Room ${entity.roomId}, ${entity.relationships.length} relationships`,
          );
        }
      }

      return {
        ...input,
        semanticEnrichment: enrichment,
      };
    },
  };
}

/**
 * Summarize role distribution.
 */
function summarizeRoles(entities: readonly SemanticEntity[]): string {
  const roleCounts = new Map<string, number>();
  for (const entity of entities) {
    roleCounts.set(entity.role, (roleCounts.get(entity.role) ?? 0) + 1);
  }

  return Array.from(roleCounts.entries())
    .map(([role, count]) => `${role}:${count}`)
    .join(", ");
}
