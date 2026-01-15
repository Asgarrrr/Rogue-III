/**
 * Grammar Expansion Pass
 *
 * Pipeline pass that generates an experience graph from a grammar
 * and maps it to physical rooms.
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
  CLASSIC_GRAMMAR,
  expandGrammar,
  type ExperienceGraph,
  getGrammar,
  type Grammar,
  type GrammarConstraints,
  getRoomTypeAssignments,
  mapGraphToRooms,
  type SpatialMappingResult,
} from "../grammar";

// =============================================================================
// PASS CONFIGURATION
// =============================================================================

/**
 * Configuration for the grammar expansion pass.
 */
export interface GrammarExpansionPassConfig {
  /** Grammar ID or custom grammar definition */
  readonly grammar: string | Grammar;

  /** Constraint overrides */
  readonly constraints?: Partial<GrammarConstraints>;

  /** Whether to update room types based on experience nodes */
  readonly updateRoomTypes: boolean;

  /** Whether to fail if mapping is incomplete */
  readonly failOnIncompletMapping: boolean;
}

/**
 * Default configuration.
 */
export const DEFAULT_GRAMMAR_EXPANSION_CONFIG: GrammarExpansionPassConfig = {
  grammar: "classic",
  updateRoomTypes: true,
  failOnIncompletMapping: false,
};

// =============================================================================
// HELPER FUNCTIONS (using shared utilities from core/graph)
// =============================================================================

/**
 * Calculate distances from entrance room using BFS.
 * Uses shared utility from core/graph.
 */
function calculateDistancesFromEntrance(
  rooms: readonly Room[],
  adjacency: Map<number, readonly number[]>,
): Map<number, number> {
  const entranceRoom = rooms.find((r) => r.type === "entrance");

  if (!entranceRoom) {
    // No entrance, use first room with distance 0
    const distances = new Map<number, number>();
    const firstRoom = rooms[0];
    if (firstRoom) {
      distances.set(firstRoom.id, 0);
    }
    return distances;
  }

  const { distances } = calculateRoomGraphDistances(entranceRoom.id, adjacency);
  return distances;
}

/**
 * Update room types based on experience node mapping.
 */
function updateRoomTypes(
  rooms: Room[],
  graph: ExperienceGraph,
  mapping: SpatialMappingResult,
): Room[] {
  const typeAssignments = getRoomTypeAssignments(graph, mapping);

  return rooms.map((room) => {
    const newType = typeAssignments.get(room.id);
    if (newType && newType !== room.type) {
      return { ...room, type: newType };
    }
    return room;
  });
}

// =============================================================================
// EXTENDED STATE
// =============================================================================

/**
 * State extended with experience graph.
 */
export interface GrammarExpandedState extends DungeonStateArtifact {
  readonly experienceGraph: ExperienceGraph;
  readonly experienceMapping: SpatialMappingResult;
}

// =============================================================================
// PASS IMPLEMENTATION
// =============================================================================

/**
 * Create a grammar expansion pass.
 *
 * This pass generates an experience graph from a grammar and maps it
 * to the physical dungeon rooms.
 *
 * @example
 * ```typescript
 * const pass = createGrammarExpansionPass({
 *   grammar: "metroidvania",
 *   updateRoomTypes: true,
 * });
 * ```
 */
export function createGrammarExpansionPass(
  config: Partial<GrammarExpansionPassConfig> = {},
): Pass<DungeonStateArtifact, GrammarExpandedState> {
  const fullConfig: GrammarExpansionPassConfig = {
    ...DEFAULT_GRAMMAR_EXPANSION_CONFIG,
    ...config,
  };

  return {
    id: "intelligence.grammar-expansion",
    inputType: "dungeon-state",
    outputType: "dungeon-state",

    run(input: DungeonStateArtifact, ctx: PassContext): GrammarExpandedState {
      // Get grammar
      let grammar: Grammar;
      if (typeof fullConfig.grammar === "string") {
        const found = getGrammar(fullConfig.grammar);
        if (!found) {
          throw new Error(`Unknown grammar: ${fullConfig.grammar}`);
        }
        grammar = found;
      } else {
        grammar = fullConfig.grammar;
      }

      // Generate experience graph
      const seed = Math.floor(ctx.streams.layout.next() * 1000000);
      const rng = () => ctx.streams.layout.next();

      const graph = expandGrammar(
        grammar,
        seed,
        rng,
        fullConfig.constraints,
      );

      ctx.trace.decision(
        "intelligence.grammar-expansion",
        "Experience graph generated",
        [grammar.id, `${graph.nodes.length} nodes`],
        "success",
        `Combat: ${graph.metadata.combatCount}, Treasure: ${graph.metadata.treasureCount}`,
      );

      // Build spatial context using shared utilities
      const adjacency = buildRoomAdjacency(input.rooms, input.connections);
      const roomDistances = calculateDistancesFromEntrance(input.rooms, adjacency);

      // Map to physical rooms
      const mapping = mapGraphToRooms(
        graph,
        input.rooms,
        roomDistances,
        adjacency,
      );

      ctx.trace.decision(
        "intelligence.grammar-expansion",
        "Spatial mapping complete",
        [`${mapping.mappings.length} mapped`, `${mapping.unmappedNodes.length} unmapped`],
        mapping.unmappedNodes.length === 0 ? "success" : "partial",
        mapping.unmappedNodes.length > 0
          ? `Unmapped: ${mapping.unmappedNodes.join(", ")}`
          : "All nodes mapped",
      );

      // Check for incomplete mapping
      if (fullConfig.failOnIncompletMapping && mapping.unmappedNodes.length > 0) {
        throw new Error(
          `Incomplete mapping: ${mapping.unmappedNodes.length} nodes could not be mapped`,
        );
      }

      // Update room types if enabled
      let updatedRooms = input.rooms;
      if (fullConfig.updateRoomTypes) {
        updatedRooms = updateRoomTypes([...input.rooms], graph, mapping);

        const changedCount = updatedRooms.filter(
          (r, i) => r.type !== input.rooms[i]?.type,
        ).length;

        if (changedCount > 0) {
          ctx.trace.decision(
            "intelligence.grammar-expansion",
            "Room types updated",
            [`${changedCount} rooms changed`],
            changedCount,
            summarizeRoomTypes(updatedRooms),
          );
        }
      }

      return {
        ...input,
        rooms: updatedRooms,
        experienceGraph: graph,
        experienceMapping: mapping,
      };
    },
  };
}

/**
 * Summarize room type distribution.
 */
function summarizeRoomTypes(rooms: readonly Room[]): string {
  const typeCounts = new Map<string, number>();
  for (const room of rooms) {
    typeCounts.set(room.type, (typeCounts.get(room.type) ?? 0) + 1);
  }

  return Array.from(typeCounts.entries())
    .map(([type, count]) => `${type}:${count}`)
    .join(", ");
}
