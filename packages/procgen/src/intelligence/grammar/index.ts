/**
 * Graph Grammar Module
 *
 * Provides grammar-based experience graph generation and spatial mapping.
 */

// Types
export type {
  BudgetAllocation,
  BudgetStatus,
  BudgetTracker,
  ExperienceEdge,
  ExperienceEdgeType,
  ExperienceGraph,
  ExperienceGraphMetadata,
  ExperienceNode,
  ExperienceNodeType,
  ExpansionContext,
  ExpansionState,
  Grammar,
  GrammarCondition,
  GrammarConstraints,
  GrammarProduction,
  GrammarReplacement,
  GrammarSymbol,
  NodeRoomMapping,
  NodeTypeBudget,
  SpatialConnectionRequirement,
  SpatialMappingResult,
  SpatialRoomRequirement,
  SymbolRepetition,
} from "./types";
export {
  DEFAULT_BUDGET_ALLOCATION,
  DEFAULT_GRAMMAR_CONSTRAINTS,
  GrammarExpansionError,
  SpatialMappingError,
} from "./types";

// Expander
export {
  createLinearGraph,
  expandGrammar,
  GrammarRecursionError,
} from "./expander";
export type { ExpandGrammarOptions } from "./expander";

// Budget Tracker
export {
  createBudgetAllocation,
  createBudgetTracker,
  mergeBudgetAllocations,
  scaleBudgetAllocation,
} from "./budget-tracker";

// Spatial Mapper
export {
  assignNodesToRooms,
  createConnectionRequirements,
  createRoomRequirements,
  getRoomTypeAssignments,
  mapGraphToRooms,
  validateMapping,
} from "./spatial-mapper";
export type { MapGraphToRoomsOptions } from "./spatial-mapper";

// Built-in Grammars
export {
  BUILT_IN_GRAMMARS,
  CLASSIC_GRAMMAR,
  EXPLORATION_GRAMMAR,
  getGrammar,
  listGrammars,
  METROIDVANIA_GRAMMAR,
  PUZZLE_GRAMMAR,
  ROGUELIKE_GRAMMAR,
} from "./built-in-grammars";

// Density Profiles (Room counts and branching)
export type { DensityProfile, DensityLevel, TopologyConfig } from "./density-profiles";
export {
  DENSITY_PROFILES,
  DEFAULT_TOPOLOGY_CONFIG,
  getDensityProfile,
  getRecommendedRoomCount,
  getTopologyFromDensity,
  selectDensityLevel,
  validateRoomCount,
} from "./density-profiles";

// Topology (Non-linearity validation)
export type { GraphMetrics } from "./topology";
export {
  calculateGraphMetrics,
  countPaths,
  findHubNodes,
  findReachableNodes,
  getCriticalPath,
  hasCycles,
  validateNonLinearity,
  validateTopologyConfig,
  verifyTopology,
} from "./topology";
