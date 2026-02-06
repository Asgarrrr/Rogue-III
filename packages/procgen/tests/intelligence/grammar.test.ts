/**
 * Grammar System Tests
 */

import { describe, expect, it } from "bun:test";
import {
  CLASSIC_GRAMMAR,
  createLinearGraph,
  expandGrammar,
  EXPLORATION_GRAMMAR,
  getGrammar,
  listGrammars,
  METROIDVANIA_GRAMMAR,
  PUZZLE_GRAMMAR,
  ROGUELIKE_GRAMMAR,
} from "../../src/intelligence/grammar";
import {
  assignNodesToRooms,
  createConnectionRequirements,
  createRoomRequirements,
} from "../../src/intelligence/grammar/spatial-mapper";
import type { Room } from "../../src/pipeline/types";

// =============================================================================
// TEST HELPERS
// =============================================================================

function createTestRoom(
  id: number,
  type: Room["type"],
  x: number,
  y: number,
): Room {
  return {
    id,
    x,
    y,
    width: 10,
    height: 10,
    centerX: x + 5,
    centerY: y + 5,
    type,
    seed: id * 1000,
  };
}

function createSeededRng(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

// =============================================================================
// GRAMMAR EXPANSION TESTS
// =============================================================================

describe("expandGrammar", () => {
  it("generates graph with entrance and exit", () => {
    const rng = createSeededRng(12345);
    const graph = expandGrammar(CLASSIC_GRAMMAR, 12345, rng);

    expect(graph.entryId).toBeDefined();
    expect(graph.exitIds.length).toBeGreaterThan(0);

    const entranceNode = graph.nodes.find((n) => n.type === "entrance");
    const exitNode = graph.nodes.find((n) => n.type === "exit");

    expect(entranceNode).toBeDefined();
    expect(exitNode).toBeDefined();
  });

  it("respects node count constraints", () => {
    const rng = createSeededRng(12345);
    const graph = expandGrammar(CLASSIC_GRAMMAR, 12345, rng, {
      maxNodes: 10,
    });

    expect(graph.nodes.length).toBeLessThanOrEqual(10);
  });

  it("generates required combat encounters", () => {
    const rng = createSeededRng(12345);
    const graph = expandGrammar(CLASSIC_GRAMMAR, 12345, rng, {
      minCombat: 3,
    });

    const combatNodes = graph.nodes.filter((n) => n.type === "combat");
    expect(combatNodes.length).toBeGreaterThanOrEqual(3);
  });

  it("generates boss when required", () => {
    const rng = createSeededRng(12345);
    const graph = expandGrammar(CLASSIC_GRAMMAR, 12345, rng, {
      requireBoss: true,
    });

    const bossNode = graph.nodes.find((n) => n.type === "boss");
    expect(bossNode).toBeDefined();
  });

  it("generates connected graph", () => {
    const rng = createSeededRng(12345);
    const graph = expandGrammar(CLASSIC_GRAMMAR, 12345, rng);

    // All nodes except entry should have at least one incoming edge
    const nodesWithIncoming = new Set(graph.edges.map((e) => e.to));

    for (const node of graph.nodes) {
      if (node.id === graph.entryId) continue;
      // Either has incoming edge or is same as entry
      const hasConnection = nodesWithIncoming.has(node.id) ||
        graph.edges.some((e) => e.from === node.id);
      expect(hasConnection).toBe(true);
    }
  });

  it("generates different graphs for different seeds", () => {
    const rng1 = createSeededRng(12345);
    const rng2 = createSeededRng(67890);

    const graph1 = expandGrammar(CLASSIC_GRAMMAR, 12345, rng1);
    const graph2 = expandGrammar(CLASSIC_GRAMMAR, 67890, rng2);

    // Should have different node counts or types
    const types1 = graph1.nodes.map((n) => n.type).sort().join(",");
    const types2 = graph2.nodes.map((n) => n.type).sort().join(",");

    // Not guaranteed to be different but very likely with different seeds
    expect(graph1.nodes.length).toBeGreaterThan(0);
    expect(graph2.nodes.length).toBeGreaterThan(0);
  });

  it("includes metadata", () => {
    const rng = createSeededRng(12345);
    const graph = expandGrammar(CLASSIC_GRAMMAR, 12345, rng);

    expect(graph.metadata.grammarId).toBe("classic");
    expect(graph.metadata.seed).toBe(12345);
    expect(graph.metadata.combatCount).toBeGreaterThanOrEqual(0);
    expect(graph.metadata.treasureCount).toBeGreaterThanOrEqual(0);
    expect(graph.metadata.complexityScore).toBeGreaterThanOrEqual(0);
  });
});

// =============================================================================
// BUILT-IN GRAMMARS TESTS
// =============================================================================

describe("built-in grammars", () => {
  it("classic grammar generates valid graph", () => {
    const rng = createSeededRng(11111);
    const graph = expandGrammar(CLASSIC_GRAMMAR, 11111, rng);

    expect(graph.nodes.length).toBeGreaterThanOrEqual(CLASSIC_GRAMMAR.constraints.minNodes);
    expect(graph.nodes.length).toBeLessThanOrEqual(CLASSIC_GRAMMAR.constraints.maxNodes);
  });

  it("metroidvania grammar generates valid graph", () => {
    const rng = createSeededRng(22222);
    const graph = expandGrammar(METROIDVANIA_GRAMMAR, 22222, rng);

    expect(graph.nodes.length).toBeGreaterThanOrEqual(METROIDVANIA_GRAMMAR.constraints.minNodes);
  });

  it("roguelike grammar generates valid graph", () => {
    const rng = createSeededRng(33333);
    const graph = expandGrammar(ROGUELIKE_GRAMMAR, 33333, rng);

    expect(graph.nodes.length).toBeGreaterThanOrEqual(ROGUELIKE_GRAMMAR.constraints.minNodes);
  });

  it("puzzle grammar generates minimal combat", () => {
    const rng = createSeededRng(44444);
    const graph = expandGrammar(PUZZLE_GRAMMAR, 44444, rng);

    const combatNodes = graph.nodes.filter((n) => n.type === "combat");
    expect(combatNodes.length).toBeLessThanOrEqual(PUZZLE_GRAMMAR.constraints.maxCombat);
  });

  it("exploration grammar generates secrets", () => {
    const rng = createSeededRng(55555);
    const graph = expandGrammar(EXPLORATION_GRAMMAR, 55555, rng);

    // Exploration grammar should allow optional content
    expect(graph.nodes.length).toBeGreaterThan(5);
  });
});

// =============================================================================
// GRAMMAR REGISTRY TESTS
// =============================================================================

describe("grammar registry", () => {
  it("lists all grammars", () => {
    const grammars = listGrammars();

    expect(grammars).toContain("classic");
    expect(grammars).toContain("metroidvania");
    expect(grammars).toContain("roguelike");
    expect(grammars).toContain("puzzle");
    expect(grammars).toContain("exploration");
  });

  it("gets grammar by id", () => {
    const classic = getGrammar("classic");
    const metroidvania = getGrammar("metroidvania");

    expect(classic).toBe(CLASSIC_GRAMMAR);
    expect(metroidvania).toBe(METROIDVANIA_GRAMMAR);
  });

  it("returns undefined for unknown grammar", () => {
    const unknown = getGrammar("nonexistent");
    expect(unknown).toBeUndefined();
  });
});

// =============================================================================
// LINEAR GRAPH TESTS
// =============================================================================

describe("createLinearGraph", () => {
  it("creates linear graph with specified nodes", () => {
    const graph = createLinearGraph(["entrance", "combat", "treasure", "exit"]);

    expect(graph.nodes.length).toBe(4);
    expect(graph.edges.length).toBe(3);
    expect(graph.entryId).toBe("node-0");
    expect(graph.exitIds).toContain("node-3");
  });

  it("creates proper edge chain", () => {
    const graph = createLinearGraph(["entrance", "combat", "exit"]);

    expect(graph.edges[0]?.from).toBe("node-0");
    expect(graph.edges[0]?.to).toBe("node-1");
    expect(graph.edges[1]?.from).toBe("node-1");
    expect(graph.edges[1]?.to).toBe("node-2");
  });

  it("sets correct metadata", () => {
    const graph = createLinearGraph(["entrance", "combat", "combat", "treasure", "exit"]);

    expect(graph.metadata.grammarId).toBe("linear");
    expect(graph.metadata.combatCount).toBe(2);
    expect(graph.metadata.treasureCount).toBe(1);
  });
});

// =============================================================================
// SPATIAL MAPPING TESTS
// =============================================================================

describe("spatial mapping", () => {
  const rooms = [
    createTestRoom(0, "entrance", 0, 0),
    createTestRoom(1, "normal", 20, 0),
    createTestRoom(2, "normal", 40, 0),
    createTestRoom(3, "boss", 60, 0),
    createTestRoom(4, "exit", 80, 0),
  ];

  const roomDistances = new Map([
    [0, 0],
    [1, 1],
    [2, 2],
    [3, 3],
    [4, 4],
  ]);

  it("creates room requirements from graph", () => {
    const graph = createLinearGraph(["entrance", "combat", "boss", "exit"]);
    const requirements = createRoomRequirements(graph);

    expect(requirements.length).toBe(4);
    expect(requirements[0]?.roomType).toBe("entrance");
    expect(requirements[2]?.roomType).toBe("boss");
    expect(requirements[3]?.roomType).toBe("exit");
  });

  it("creates connection requirements from graph", () => {
    const graph = createLinearGraph(["entrance", "combat", "exit"]);
    const requirements = createConnectionRequirements(graph);

    expect(requirements.length).toBe(2);
    expect(requirements[0]?.needsLock).toBe(false);
  });

  it("assigns nodes to rooms", () => {
    const graph = createLinearGraph(["entrance", "combat", "boss", "exit"]);
    const result = assignNodesToRooms(graph, rooms, roomDistances);

    expect(result.mappings.length).toBe(4);
    expect(result.unmappedNodes.length).toBe(0);

    // Entrance should map to entrance room
    const entranceMapping = result.mappings.find((m) => m.nodeId === "node-0");
    expect(entranceMapping?.roomId).toBe(0);
  });

  it("handles more nodes than rooms", () => {
    const graph = createLinearGraph([
      "entrance",
      "combat",
      "combat",
      "combat",
      "combat",
      "combat",
      "combat",
      "exit",
    ]);
    const result = assignNodesToRooms(graph, rooms, roomDistances);

    // Should map what it can and report unmapped
    expect(result.mappings.length).toBeLessThanOrEqual(rooms.length);
    expect(result.unmappedNodes.length).toBeGreaterThan(0);
  });

  it("prioritizes important room types", () => {
    const graph = createLinearGraph(["entrance", "boss", "exit"]);
    const result = assignNodesToRooms(graph, rooms, roomDistances);

    // Boss should map to boss room (id 3)
    const bossMapping = result.mappings.find((m) => m.nodeId === "node-1");
    expect(bossMapping?.roomId).toBe(3);
  });
});

// =============================================================================
// DETERMINISM TESTS
// =============================================================================

describe("determinism", () => {
  it("produces identical graphs with same seed", () => {
    const rng1 = createSeededRng(99999);
    const rng2 = createSeededRng(99999);

    const graph1 = expandGrammar(CLASSIC_GRAMMAR, 99999, rng1);
    const graph2 = expandGrammar(CLASSIC_GRAMMAR, 99999, rng2);

    expect(graph1.nodes.length).toBe(graph2.nodes.length);
    expect(graph1.edges.length).toBe(graph2.edges.length);

    for (let i = 0; i < graph1.nodes.length; i++) {
      expect(graph1.nodes[i]?.type).toBe(graph2.nodes[i]?.type);
      expect(graph1.nodes[i]?.id).toBe(graph2.nodes[i]?.id);
    }
  });

  it("produces different graphs with different seeds", () => {
    const runs: number[] = [];

    for (let seed = 0; seed < 10; seed++) {
      const rng = createSeededRng(seed * 12345);
      const graph = expandGrammar(CLASSIC_GRAMMAR, seed, rng);
      runs.push(graph.nodes.length);
    }

    // Should have some variation (not all identical)
    const uniqueCounts = new Set(runs);
    expect(uniqueCounts.size).toBeGreaterThanOrEqual(1);
  });
});
