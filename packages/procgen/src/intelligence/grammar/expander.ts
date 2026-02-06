/**
 * Grammar Expander
 *
 * Expands grammar productions into an experience graph.
 */

import type {
  BudgetAllocation,
  BudgetTracker,
  ExperienceEdge,
  ExperienceGraph,
  ExperienceGraphMetadata,
  ExperienceNode,
  ExperienceNodeType,
  ExpansionContext,
  ExpansionState,
  Grammar,
  GrammarConstraints,
  GrammarProduction,
  GrammarReplacement,
  GrammarSymbol,
} from "./types";
import { DEFAULT_GRAMMAR_CONSTRAINTS, GrammarExpansionError } from "./types";
import { createBudgetTracker } from "./budget-tracker";

// =============================================================================
// RECURSION GUARD
// =============================================================================

/**
 * Maximum recursion depth to prevent stack overflow on malformed grammars.
 * This limits how deep the grammar expansion can recurse before failing safely.
 */
const MAX_RECURSION_DEPTH = 50;

/**
 * Error thrown when grammar expansion exceeds maximum recursion depth.
 */
export class GrammarRecursionError extends Error {
  constructor(
    public readonly currentDepth: number,
    public readonly symbol: string,
  ) {
    super(
      `Grammar expansion exceeded maximum recursion depth (${MAX_RECURSION_DEPTH}) ` +
      `while expanding symbol "${symbol}" at depth ${currentDepth}. ` +
      `This usually indicates a malformed grammar with infinite loops. ` +
      `Check productions for cycles like A -> ... A ... without proper termination.`
    );
    this.name = "GrammarRecursionError";
  }
}

// =============================================================================
// EXPANSION HELPERS
// =============================================================================

/**
 * Create initial expansion state.
 */
function createInitialState(budgetAllocation?: BudgetAllocation): ExpansionState {
  return {
    nodes: [],
    edges: [],
    currentDepth: 0,
    typeCounts: new Map(),
    provided: new Set(),
    nextNodeId: 0,
    budget: budgetAllocation ? createBudgetTracker(budgetAllocation) : undefined,
  };
}

/**
 * Check if a condition is satisfied.
 */
function checkCondition(
  condition: GrammarReplacement["condition"],
  state: ExpansionState,
  ctx: ExpansionContext,
): boolean {
  if (!condition) return true;

  switch (condition.type) {
    case "depth":
      const minDepth = (condition.params.min as number) ?? 0;
      const maxDepth = (condition.params.max as number) ?? Infinity;
      return state.currentDepth >= minDepth && state.currentDepth <= maxDepth;

    case "count":
      const nodeType = condition.params.type as ExperienceNodeType;
      const count = state.typeCounts.get(nodeType) ?? 0;
      const minCount = (condition.params.min as number) ?? 0;
      const maxCount = (condition.params.max as number) ?? Infinity;
      return count >= minCount && count <= maxCount;

    case "random":
      const chance = (condition.params.chance as number) ?? 0.5;
      return ctx.rng() < chance;

    case "has_node":
      const requiredType = condition.params.type as ExperienceNodeType;
      return (state.typeCounts.get(requiredType) ?? 0) > 0;

    default:
      return true;
  }
}

/**
 * Select a replacement based on weights and conditions.
 */
function selectReplacement(
  production: GrammarProduction,
  state: ExpansionState,
  ctx: ExpansionContext,
): GrammarReplacement | null {
  // Filter replacements by condition
  const valid = production.replacements.filter((r) =>
    checkCondition(r.condition, state, ctx),
  );

  if (valid.length === 0) return null;

  // Calculate total weight
  const totalWeight = valid.reduce((sum, r) => sum + r.weight, 0);

  // Select based on weight
  const roll = ctx.rng() * totalWeight;
  let cumulative = 0;

  for (const replacement of valid) {
    cumulative += replacement.weight;
    if (roll < cumulative) {
      return replacement;
    }
  }

  return valid[valid.length - 1] ?? null;
}

/**
 * Calculate repetition count for a symbol.
 */
function calculateRepetitions(
  symbol: GrammarSymbol,
  state: ExpansionState,
  ctx: ExpansionContext,
): number {
  const { rng, constraints } = ctx;

  switch (symbol.repetition) {
    case "once":
      return 1;

    case "optional":
      return rng() < 0.5 ? 1 : 0;

    case "oneOrMore": {
      const min = symbol.minRepeat ?? 1;
      const max = Math.min(symbol.maxRepeat ?? 3, constraints.maxNodes - state.nodes.length);
      if (max < min) return min;
      return min + Math.floor(rng() * (max - min + 1));
    }

    case "zeroOrMore": {
      const min = symbol.minRepeat ?? 0;
      const max = Math.min(symbol.maxRepeat ?? 2, constraints.maxNodes - state.nodes.length);
      if (max < min) return 0;
      return min + Math.floor(rng() * (max - min + 1));
    }

    default:
      return 1;
  }
}

// =============================================================================
// NODE CREATION
// =============================================================================

/**
 * Check if we can create a node of the given type.
 * Returns false if budget is exhausted for this type.
 */
function canCreateNode(
  type: ExperienceNodeType,
  state: ExpansionState,
): boolean {
  if (!state.budget) return true;
  return state.budget.canSpend(type);
}

/**
 * Create an experience node from a terminal symbol.
 * Returns null if budget doesn't allow this node type.
 */
function createNode(
  type: ExperienceNodeType,
  state: ExpansionState,
  ctx: ExpansionContext,
  tags: readonly string[] = [],
): ExperienceNode | null {
  // Check budget before creating
  if (!canCreateNode(type, state)) {
    return null;
  }

  const id = `node-${state.nextNodeId++}`;

  // Get default tags for this type
  const defaultTags = ctx.grammar.defaultTags[type] ?? [];

  // Determine what this node provides
  const provides: string[] = [];
  if (type === "treasure") {
    provides.push(`loot-${id}`);
  } else if (type === "boss") {
    provides.push("boss-defeated");
  } else if (type === "shop") {
    provides.push("shop-visited");
  }

  const node: ExperienceNode = {
    id,
    type,
    label: `${type}-${state.typeCounts.get(type) ?? 0}`,
    requirements: [],
    provides,
    minDepth: state.currentDepth,
    maxDepth: state.currentDepth + 2,
    weight: getNodeWeight(type),
    tags: [...defaultTags, ...(tags ?? [])],
  };

  // Update state
  state.nodes.push(node);
  state.typeCounts.set(type, (state.typeCounts.get(type) ?? 0) + 1);

  // Update budget
  if (state.budget) {
    state.budget.spend(type);
  }

  for (const p of provides) {
    state.provided.add(p);
  }

  return node;
}

/**
 * Get base weight for a node type.
 */
function getNodeWeight(type: ExperienceNodeType): number {
  switch (type) {
    case "entrance":
    case "exit":
      return 1.0;
    case "boss":
      return 0.9;
    case "treasure":
    case "miniboss":
      return 0.8;
    case "combat":
    case "puzzle":
      return 0.6;
    case "rest":
    case "shop":
      return 0.5;
    case "story":
      return 0.4;
    case "secret":
    case "shortcut":
      return 0.3;
    default:
      return 0.5;
  }
}

/**
 * Create an edge between two nodes.
 */
function createEdge(
  fromId: string,
  toId: string,
  state: ExpansionState,
  bidirectional = true,
): ExperienceEdge {
  const edge: ExperienceEdge = {
    from: fromId,
    to: toId,
    type: "required",
    bidirectional,
  };

  state.edges.push(edge);
  return edge;
}

// =============================================================================
// EXPANSION ENGINE
// =============================================================================

/**
 * Expand a single symbol.
 */
function expandSymbol(
  symbol: GrammarSymbol,
  state: ExpansionState,
  ctx: ExpansionContext,
  parentNodeId: string | null,
  depth: number,
): string[] {
  const createdNodeIds: string[] = [];

  // Recursion guard - prevent stack overflow on malformed grammars
  if (depth > MAX_RECURSION_DEPTH) {
    throw new GrammarRecursionError(depth, symbol.name);
  }

  // Check constraints
  if (state.nodes.length >= ctx.constraints.maxNodes) {
    return createdNodeIds;
  }

  // Calculate repetitions
  const repetitions = calculateRepetitions(symbol, state, ctx);

  for (let i = 0; i < repetitions; i++) {
    if (state.nodes.length >= ctx.constraints.maxNodes) break;

    if (symbol.terminal) {
      // Create a node for this terminal
      const nodeType = symbol.name as ExperienceNodeType;
      const node = createNode(nodeType, state, ctx, symbol.tags);

      // Budget may have rejected the node
      if (!node) {
        continue;
      }

      createdNodeIds.push(node.id);

      // Connect to parent
      if (parentNodeId) {
        createEdge(parentNodeId, node.id, state);
      }
    } else {
      // Find production for this non-terminal
      const production = ctx.grammar.productions.find(
        (p) => p.symbol === symbol.name,
      );

      if (!production) {
        throw new GrammarExpansionError(
          `No production found for symbol: ${symbol.name}`,
          symbol.name,
          depth,
        );
      }

      // Select and expand replacement
      const replacement = selectReplacement(production, state, ctx);

      if (replacement) {
        const expandedIds = expandSequence(
          replacement.symbols,
          state,
          ctx,
          parentNodeId,
          depth + 1,
        );
        createdNodeIds.push(...expandedIds);
      }
    }
  }

  return createdNodeIds;
}

/**
 * Expand a sequence of symbols.
 */
function expandSequence(
  symbols: readonly GrammarSymbol[],
  state: ExpansionState,
  ctx: ExpansionContext,
  parentNodeId: string | null,
  depth: number,
): string[] {
  const createdNodeIds: string[] = [];
  let lastNodeId = parentNodeId;

  for (const symbol of symbols) {
    if (state.nodes.length >= ctx.constraints.maxNodes) break;

    // Update depth tracking
    state.currentDepth = depth;

    const newIds = expandSymbol(symbol, state, ctx, lastNodeId, depth);

    if (newIds.length > 0) {
      createdNodeIds.push(...newIds);
      // Connect sequence: last created becomes parent for next
      lastNodeId = newIds[newIds.length - 1]!;
    }
  }

  return createdNodeIds;
}

// =============================================================================
// POST-PROCESSING
// =============================================================================

/**
 * Add shortcuts to reduce backtracking.
 */
function addShortcuts(
  state: ExpansionState,
  ctx: ExpansionContext,
): void {
  if (!ctx.constraints.allowShortcuts) return;

  const nodes = state.nodes;
  if (nodes.length < 6) return;

  // Find nodes that are far apart in the graph but could be connected
  const shortcutChance = 0.3;
  const maxShortcuts = Math.floor(nodes.length / 5);
  let shortcuts = 0;

  for (let i = 0; i < nodes.length && shortcuts < maxShortcuts; i++) {
    for (let j = i + 3; j < nodes.length && shortcuts < maxShortcuts; j++) {
      if (ctx.rng() < shortcutChance) {
        const nodeA = nodes[i]!;
        const nodeB = nodes[j]!;

        // Don't create shortcuts to/from entrance/exit
        if (
          nodeA.type === "entrance" ||
          nodeA.type === "exit" ||
          nodeB.type === "entrance" ||
          nodeB.type === "exit"
        ) {
          continue;
        }

        // Create shortcut edge
        state.edges.push({
          from: nodeA.id,
          to: nodeB.id,
          type: "shortcut",
          bidirectional: true,
        });

        shortcuts++;
      }
    }
  }
}

/**
 * Force-create a node, bypassing budget limits.
 * Used for critical nodes (entrance/exit/boss) that MUST exist.
 */
function forceCreateNode(
  type: ExperienceNodeType,
  state: ExpansionState,
  ctx: ExpansionContext,
  tags: readonly string[] = [],
): ExperienceNode {
  const id = `node-${state.nextNodeId++}`;
  const defaultTags = ctx.grammar.defaultTags[type] ?? [];

  const provides: string[] = [];
  if (type === "treasure") {
    provides.push(`loot-${id}`);
  } else if (type === "boss") {
    provides.push("boss-defeated");
  } else if (type === "shop") {
    provides.push("shop-visited");
  }

  const node: ExperienceNode = {
    id,
    type,
    label: `${type}-${state.typeCounts.get(type) ?? 0}`,
    requirements: [],
    provides,
    minDepth: state.currentDepth,
    maxDepth: state.currentDepth + 2,
    weight: getNodeWeight(type),
    tags: [...defaultTags, ...tags],
  };

  state.nodes.push(node);
  state.typeCounts.set(type, (state.typeCounts.get(type) ?? 0) + 1);

  // Note: We don't update budget here since this bypasses limits

  for (const p of provides) {
    state.provided.add(p);
  }

  return node;
}

/**
 * Validate and fix the generated graph.
 */
function validateAndFix(
  state: ExpansionState,
  ctx: ExpansionContext,
): void {
  const { constraints } = ctx;

  // Ensure we have required node types
  const hasEntrance = (state.typeCounts.get("entrance") ?? 0) > 0;
  const hasExit = (state.typeCounts.get("exit") ?? 0) > 0;
  const hasBoss = (state.typeCounts.get("boss") ?? 0) > 0;

  if (!hasEntrance) {
    // Add entrance at the start (force-create bypasses budget)
    const entranceNode = forceCreateNode("entrance", state, ctx);
    // Reconnect first node if exists
    if (state.nodes.length > 1) {
      createEdge(entranceNode.id, state.nodes[1]!.id, state);
    }
    // Move entrance to front
    const idx = state.nodes.indexOf(entranceNode);
    if (idx > 0) {
      state.nodes.splice(idx, 1);
      state.nodes.unshift(entranceNode);
    }
  }

  if (!hasExit) {
    // Add exit at the end (force-create bypasses budget)
    const lastNode = state.nodes[state.nodes.length - 1];
    const exitNode = forceCreateNode("exit", state, ctx);
    if (lastNode && lastNode.id !== exitNode.id) {
      createEdge(lastNode.id, exitNode.id, state);
    }
  }

  if (constraints.requireBoss && !hasBoss) {
    // Add boss before exit (force-create bypasses budget)
    const exitNode = state.nodes.find((n) => n.type === "exit");
    const bossNode = forceCreateNode("boss", state, ctx);

    if (exitNode) {
      // Find edge leading to exit and intercept
      const exitEdge = state.edges.find((e) => e.to === exitNode.id);
      if (exitEdge) {
        // Modify edge to go to boss instead
        const modifiedEdge = { ...exitEdge, to: bossNode.id };
        const edgeIdx = state.edges.indexOf(exitEdge);
        state.edges[edgeIdx] = modifiedEdge;
        // Add edge from boss to exit
        createEdge(bossNode.id, exitNode.id, state);
      }
    }
  }

  // Ensure minimum combat (respects budget for non-critical nodes)
  const combatCount = state.typeCounts.get("combat") ?? 0;
  if (combatCount < constraints.minCombat) {
    const needed = constraints.minCombat - combatCount;
    for (let i = 0; i < needed && state.nodes.length < constraints.maxNodes; i++) {
      // Insert combat nodes at random positions
      const insertAfterIdx = Math.floor(ctx.rng() * (state.nodes.length - 2)) + 1;
      const prevNode = state.nodes[insertAfterIdx];
      const combatNode = createNode("combat", state, ctx);

      // Skip if budget rejected the node
      if (!combatNode) continue;

      if (prevNode) {
        // Find and update edges
        const outEdges = state.edges.filter((e) => e.from === prevNode.id);
        if (outEdges.length > 0) {
          const edge = outEdges[0]!;
          const oldTo = edge.to;
          const edgeIdx = state.edges.indexOf(edge);
          state.edges[edgeIdx] = { ...edge, to: combatNode.id };
          createEdge(combatNode.id, oldTo, state);
        }
      }
    }
  }

  // Ensure minimum treasure (respects budget for non-critical nodes)
  const treasureCount = state.typeCounts.get("treasure") ?? 0;
  if (treasureCount < constraints.minTreasure) {
    const needed = constraints.minTreasure - treasureCount;
    for (let i = 0; i < needed && state.nodes.length < constraints.maxNodes; i++) {
      const treasureNode = createNode("treasure", state, ctx);
      if (!treasureNode) break; // Budget exhausted
    }
  }
}

/**
 * Build metadata for the graph.
 */
function buildMetadata(
  state: ExpansionState,
  ctx: ExpansionContext,
  seed: number,
): ExperienceGraphMetadata {
  return {
    grammarId: ctx.grammar.id,
    seed,
    combatCount: state.typeCounts.get("combat") ?? 0,
    treasureCount: state.typeCounts.get("treasure") ?? 0,
    complexityScore: calculateComplexity(state),
  };
}

/**
 * Calculate complexity score.
 */
function calculateComplexity(state: ExpansionState): number {
  const nodeScore = state.nodes.length * 0.1;
  const edgeScore = state.edges.length * 0.05;
  const combatScore = (state.typeCounts.get("combat") ?? 0) * 0.15;
  const bossScore = (state.typeCounts.get("boss") ?? 0) * 0.3;

  return Math.min(1, nodeScore + edgeScore + combatScore + bossScore);
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Options for grammar expansion.
 */
export interface ExpandGrammarOptions {
  /** Constraint overrides */
  readonly constraintOverrides?: Partial<GrammarConstraints>;
  /** Budget allocation for node types */
  readonly budgetAllocation?: BudgetAllocation;
}

/**
 * Expand a grammar into an experience graph.
 */
export function expandGrammar(
  grammar: Grammar,
  seed: number,
  rng: () => number,
  options: ExpandGrammarOptions | Partial<GrammarConstraints> = {},
): ExperienceGraph {
  // Support legacy API (passing constraintOverrides directly)
  const opts: ExpandGrammarOptions = "budgetAllocation" in options || "constraintOverrides" in options
    ? options as ExpandGrammarOptions
    : { constraintOverrides: options as Partial<GrammarConstraints> };

  const constraints: GrammarConstraints = {
    ...DEFAULT_GRAMMAR_CONSTRAINTS,
    ...grammar.constraints,
    ...opts.constraintOverrides,
  };

  const ctx: ExpansionContext = {
    grammar,
    constraints,
    rng,
    maxIterations: constraints.maxNodes * 10,
    budgetAllocation: opts.budgetAllocation,
  };

  // Initialize state with budget tracking
  const state = createInitialState(opts.budgetAllocation);

  // Find start production
  const startProduction = grammar.productions.find(
    (p) => p.symbol === grammar.startSymbol,
  );

  if (!startProduction) {
    throw new GrammarExpansionError(
      `Start symbol not found: ${grammar.startSymbol}`,
      grammar.startSymbol,
      0,
    );
  }

  // Select and expand start replacement
  const replacement = selectReplacement(startProduction, state, ctx);
  if (replacement) {
    expandSequence(replacement.symbols, state, ctx, null, 0);
  }

  // Post-processing
  validateAndFix(state, ctx);
  addShortcuts(state, ctx);

  // Find entry and exit
  const entryNode = state.nodes.find((n) => n.type === "entrance");
  const exitNodes = state.nodes.filter((n) => n.type === "exit");

  if (!entryNode) {
    throw new GrammarExpansionError("No entrance node generated", "entrance", 0);
  }

  return {
    nodes: state.nodes,
    edges: state.edges,
    entryId: entryNode.id,
    exitIds: exitNodes.map((n) => n.id),
    metadata: buildMetadata(state, ctx, seed),
  };
}

/**
 * Create a simple linear experience graph (for testing/simple dungeons).
 */
export function createLinearGraph(
  nodeTypes: readonly ExperienceNodeType[],
): ExperienceGraph {
  const nodes: ExperienceNode[] = [];
  const edges: ExperienceEdge[] = [];

  for (let i = 0; i < nodeTypes.length; i++) {
    const type = nodeTypes[i]!;
    nodes.push({
      id: `node-${i}`,
      type,
      label: `${type}-${i}`,
      requirements: i > 0 ? [`node-${i - 1}`] : [],
      provides: [],
      minDepth: i,
      maxDepth: i + 1,
      weight: getNodeWeight(type),
      tags: [],
    });

    if (i > 0) {
      edges.push({
        from: `node-${i - 1}`,
        to: `node-${i}`,
        type: "required",
        bidirectional: true,
      });
    }
  }

  const combatCount = nodeTypes.filter((t) => t === "combat").length;
  const treasureCount = nodeTypes.filter((t) => t === "treasure").length;

  return {
    nodes,
    edges,
    entryId: nodes[0]?.id ?? "",
    exitIds: nodes.filter((n) => n.type === "exit").map((n) => n.id),
    metadata: {
      grammarId: "linear",
      seed: 0,
      combatCount,
      treasureCount,
      complexityScore: nodes.length * 0.1,
    },
  };
}
