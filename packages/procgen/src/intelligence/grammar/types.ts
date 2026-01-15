/**
 * Graph Grammar Types
 *
 * Types for defining composable narrative/gameplay patterns that generate
 * experience graphs before spatial mapping.
 *
 * Pattern: dungeon := entrance → exploration+ → climax → reward
 */

import type { Room } from "../../pipeline/types";

// =============================================================================
// EXPERIENCE GRAPH
// =============================================================================

/**
 * Node types in the experience graph.
 */
export type ExperienceNodeType =
  | "entrance" // Player entry point
  | "combat" // Combat encounter
  | "puzzle" // Puzzle/skill challenge
  | "treasure" // Reward room
  | "rest" // Safe area/healing
  | "story" // Lore/narrative point
  | "shop" // Merchant/upgrade
  | "miniboss" // Mid-level challenge
  | "boss" // Major climactic encounter
  | "exit" // Dungeon completion
  | "secret" // Optional hidden content
  | "shortcut"; // Connection that reduces backtracking

/**
 * A node in the experience graph.
 */
export interface ExperienceNode {
  /** Unique identifier */
  readonly id: string;

  /** Type of experience */
  readonly type: ExperienceNodeType;

  /** Display label */
  readonly label: string;

  /** Prerequisites (node IDs that must be visited first) */
  readonly requirements: readonly string[];

  /** What this node provides (unlocks, keys, abilities) */
  readonly provides: readonly string[];

  /** Minimum distance from entrance (graph distance) */
  readonly minDepth: number;

  /** Maximum distance from entrance */
  readonly maxDepth: number;

  /** Importance weight (for placement priority) */
  readonly weight: number;

  /** Tags for filtering and customization */
  readonly tags: readonly string[];
}

/**
 * Edge types between experience nodes.
 */
export type ExperienceEdgeType =
  | "required" // Must traverse this edge
  | "optional" // Can skip this path
  | "locked" // Requires specific key/item
  | "oneway" // Can only go one direction
  | "shortcut"; // Connects distant areas

/**
 * An edge in the experience graph.
 */
export interface ExperienceEdge {
  /** Source node ID */
  readonly from: string;

  /** Target node ID */
  readonly to: string;

  /** Edge type */
  readonly type: ExperienceEdgeType;

  /** What's required to traverse (key ID, ability, etc.) */
  readonly requires?: string;

  /** Whether this edge is bidirectional */
  readonly bidirectional: boolean;
}

/**
 * Complete experience graph.
 */
export interface ExperienceGraph {
  /** All nodes in the graph */
  readonly nodes: readonly ExperienceNode[];

  /** All edges in the graph */
  readonly edges: readonly ExperienceEdge[];

  /** Entry node ID */
  readonly entryId: string;

  /** Exit node ID(s) */
  readonly exitIds: readonly string[];

  /** Graph metadata */
  readonly metadata: ExperienceGraphMetadata;
}

/**
 * Metadata about the experience graph.
 */
export interface ExperienceGraphMetadata {
  /** Grammar ID that generated this graph */
  readonly grammarId: string;

  /** Seed used for generation */
  readonly seed: number;

  /** Number of combat encounters */
  readonly combatCount: number;

  /** Number of treasure rooms */
  readonly treasureCount: number;

  /** Estimated playtime factor */
  readonly complexityScore: number;
}

// =============================================================================
// GRAMMAR PRODUCTIONS
// =============================================================================

/**
 * A production rule in the grammar.
 *
 * Format: symbol := replacement1 | replacement2 | ...
 * Each replacement can be a sequence of symbols.
 */
export interface GrammarProduction {
  /** The non-terminal symbol being defined */
  readonly symbol: string;

  /** Possible replacements with weights */
  readonly replacements: readonly GrammarReplacement[];
}

/**
 * A single replacement option in a production.
 */
export interface GrammarReplacement {
  /** Sequence of symbols (terminals and non-terminals) */
  readonly symbols: readonly GrammarSymbol[];

  /** Weight for selection (higher = more likely) */
  readonly weight: number;

  /** Condition for this replacement (optional) */
  readonly condition?: GrammarCondition;
}

/**
 * A symbol in a grammar sequence.
 */
export interface GrammarSymbol {
  /** Symbol name (matches ExperienceNodeType or non-terminal) */
  readonly name: string;

  /** Whether this is a terminal (node type) or non-terminal */
  readonly terminal: boolean;

  /** Repetition: "once", "optional", "oneOrMore", "zeroOrMore" */
  readonly repetition: SymbolRepetition;

  /** Minimum repetitions (for oneOrMore/zeroOrMore) */
  readonly minRepeat?: number;

  /** Maximum repetitions (for oneOrMore/zeroOrMore) */
  readonly maxRepeat?: number;

  /** Tags to add to generated nodes */
  readonly tags?: readonly string[];
}

/**
 * Repetition modes for symbols.
 */
export type SymbolRepetition = "once" | "optional" | "oneOrMore" | "zeroOrMore";

/**
 * Condition for applying a production rule.
 */
export interface GrammarCondition {
  /** Type of condition */
  readonly type: "depth" | "count" | "random" | "has_node";

  /** Condition parameters */
  readonly params: Record<string, number | string | boolean>;
}

// =============================================================================
// GRAMMAR DEFINITION
// =============================================================================

/**
 * Complete grammar definition for experience generation.
 */
export interface Grammar {
  /** Unique identifier */
  readonly id: string;

  /** Human-readable name */
  readonly name: string;

  /** Description of the experience type */
  readonly description: string;

  /** Start symbol */
  readonly startSymbol: string;

  /** Production rules */
  readonly productions: readonly GrammarProduction[];

  /** Default tags for nodes */
  readonly defaultTags: Record<ExperienceNodeType, readonly string[]>;

  /** Generation constraints */
  readonly constraints: GrammarConstraints;
}

/**
 * Constraints for grammar expansion.
 */
export interface GrammarConstraints {
  /** Minimum total nodes */
  readonly minNodes: number;

  /** Maximum total nodes */
  readonly maxNodes: number;

  /** Minimum combat encounters */
  readonly minCombat: number;

  /** Maximum combat encounters */
  readonly maxCombat: number;

  /** Minimum treasure rooms */
  readonly minTreasure: number;

  /** Maximum depth from entrance */
  readonly maxDepth: number;

  /** Whether to require a boss */
  readonly requireBoss: boolean;

  /** Whether to allow shortcuts */
  readonly allowShortcuts: boolean;
}

/**
 * Default grammar constraints.
 */
export const DEFAULT_GRAMMAR_CONSTRAINTS: GrammarConstraints = {
  minNodes: 5,
  maxNodes: 20,
  minCombat: 2,
  maxCombat: 10,
  minTreasure: 1,
  maxDepth: 8,
  requireBoss: true,
  allowShortcuts: true,
};

// =============================================================================
// EXPANSION STATE
// =============================================================================

/**
 * Budget configuration for a node type.
 */
export interface NodeTypeBudget {
  /** Minimum count required */
  readonly min: number;
  /** Maximum count allowed */
  readonly max: number;
  /** Soft target (for quality scoring) */
  readonly target?: number;
}

/**
 * Budget allocation for all node types.
 */
export type BudgetAllocation = Partial<Record<ExperienceNodeType, NodeTypeBudget>>;

/**
 * Default budget allocation.
 */
export const DEFAULT_BUDGET_ALLOCATION: BudgetAllocation = {
  entrance: { min: 1, max: 1, target: 1 },
  exit: { min: 1, max: 1, target: 1 },
  combat: { min: 2, max: 10, target: 5 },
  treasure: { min: 1, max: 5, target: 2 },
  rest: { min: 0, max: 3, target: 1 },
  boss: { min: 0, max: 2, target: 1 },
  miniboss: { min: 0, max: 3, target: 1 },
  puzzle: { min: 0, max: 4, target: 2 },
  shop: { min: 0, max: 2, target: 1 },
  story: { min: 0, max: 3, target: 1 },
  secret: { min: 0, max: 3, target: 1 },
  shortcut: { min: 0, max: 2, target: 1 },
};

/**
 * Budget status for a single node type.
 */
export interface BudgetStatus {
  /** Node type */
  readonly type: ExperienceNodeType;
  /** Spent count */
  readonly spent: number;
  /** Remaining until max */
  readonly remaining: number;
  /** Whether minimum is satisfied */
  readonly minSatisfied: boolean;
  /** Whether at capacity */
  readonly atCapacity: boolean;
  /** Distance from target (negative = under, positive = over) */
  readonly targetDelta: number;
}

/**
 * Tracks budget spending during expansion.
 */
export interface BudgetTracker {
  /** Get status for a specific type */
  getStatus(type: ExperienceNodeType): BudgetStatus;
  /** Check if we can spend on a type */
  canSpend(type: ExperienceNodeType): boolean;
  /** Record spending on a type */
  spend(type: ExperienceNodeType): void;
  /** Get overall budget health score (0-1) */
  getHealthScore(): number;
  /** Get all unsatisfied minimums */
  getUnsatisfiedMinimums(): ExperienceNodeType[];
  /** Get all types at capacity */
  getAtCapacity(): ExperienceNodeType[];
  /** Get summary of all budgets */
  getSummary(): readonly BudgetStatus[];
}

/**
 * State during grammar expansion.
 */
export interface ExpansionState {
  /** Generated nodes so far */
  readonly nodes: ExperienceNode[];

  /** Generated edges so far */
  readonly edges: ExperienceEdge[];

  /** Current depth in the graph */
  readonly currentDepth: number;

  /** Nodes by type count */
  readonly typeCounts: Map<ExperienceNodeType, number>;

  /** Items/keys provided so far */
  readonly provided: Set<string>;

  /** Next node ID */
  nextNodeId: number;

  /** Budget tracker for node type limits */
  readonly budget?: BudgetTracker;
}

/**
 * Context for grammar expansion.
 */
export interface ExpansionContext {
  /** The grammar being expanded */
  readonly grammar: Grammar;

  /** Expansion constraints */
  readonly constraints: GrammarConstraints;

  /** RNG function */
  readonly rng: () => number;

  /** Maximum expansion iterations (safety limit) */
  readonly maxIterations: number;

  /** Budget allocation (optional) */
  readonly budgetAllocation?: BudgetAllocation;
}

// =============================================================================
// SPATIAL MAPPING
// =============================================================================

/**
 * Mapping from experience node to physical room.
 */
export interface NodeRoomMapping {
  /** Experience node ID */
  readonly nodeId: string;

  /** Physical room ID */
  readonly roomId: number;

  /** Whether this is a primary mapping (node owns the room) */
  readonly primary: boolean;
}

/**
 * Result of spatial mapping.
 */
export interface SpatialMappingResult {
  /** Node to room mappings */
  readonly mappings: readonly NodeRoomMapping[];

  /** Rooms that need to be created */
  readonly requiredRooms: readonly SpatialRoomRequirement[];

  /** Connections that need to be created */
  readonly requiredConnections: readonly SpatialConnectionRequirement[];

  /** Unmapped nodes (if any) */
  readonly unmappedNodes: readonly string[];
}

/**
 * Requirement for a physical room.
 */
export interface SpatialRoomRequirement {
  /** Experience node ID this room is for */
  readonly forNodeId: string;

  /** Required room type */
  readonly roomType: Room["type"];

  /** Preferred size category */
  readonly sizeCategory: "small" | "medium" | "large";

  /** Minimum distance from entrance */
  readonly minDistance: number;

  /** Maximum distance from entrance */
  readonly maxDistance: number;
}

/**
 * Requirement for a physical connection.
 */
export interface SpatialConnectionRequirement {
  /** Experience edge this is for */
  readonly forEdge: ExperienceEdge;

  /** Whether a door/lock is needed */
  readonly needsLock: boolean;

  /** Lock type if needed */
  readonly lockType?: string;
}

// =============================================================================
// ERRORS
// =============================================================================

/**
 * Error during grammar expansion.
 */
export class GrammarExpansionError extends Error {
  constructor(
    message: string,
    public readonly symbol?: string,
    public readonly depth?: number,
  ) {
    super(message);
    this.name = "GrammarExpansionError";
  }
}

/**
 * Error during spatial mapping.
 */
export class SpatialMappingError extends Error {
  constructor(
    message: string,
    public readonly nodeId?: string,
  ) {
    super(message);
    this.name = "SpatialMappingError";
  }
}
