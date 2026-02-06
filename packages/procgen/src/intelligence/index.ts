/**
 * Intelligence Module
 *
 * Structural validation and pattern-based generation for dungeons.
 *
 * This module focuses on STRUCTURAL concerns:
 * - Constraint validation (connectivity, key-before-lock, paths)
 * - Graph grammar patterns for layout structure
 * - Traversal simulation for softlock detection
 * - Statistical evaluation of generation quality
 *
 * Game-specific logic (entities, combat, loot) belongs in the game layer.
 *
 * @example
 * ```typescript
 * import {
 *   createConstraintValidationPass,
 *   createKeyBeforeLockConstraint,
 *   createFullConnectivityConstraint,
 *   createGrammarExpansionPass,
 * } from "./intelligence";
 *
 * const pipeline = createPipeline("intelligent", config)
 *   .pipe(createGrammarExpansionPass({ grammar: "metroidvania" }))
 *   .pipe(createConstraintValidationPass({
 *     constraints: [
 *       createKeyBeforeLockConstraint(),
 *       createFullConnectivityConstraint(),
 *     ],
 *   }))
 *   .build();
 * ```
 */

// =============================================================================
// CONSTRAINTS (Structural validation)
// =============================================================================

export type {
  Constraint,
  ConstraintContext,
  ConstraintResult,
  ConstraintSolverResult,
  ProgressionGraph,
  RepairAction,
  RepairSuggestion,
  RoomMetadata,
} from "./constraints";

export {
  buildConstraintContext,
  ConstraintViolationError,
  createConstraintSolver,
  createDefaultConstraints,
  createFullConnectivityConstraint,
  createKeyBeforeLockConstraint,
  createMinRoomCountConstraint,
  createMultiPathToBossConstraint,
  createProgressionConstraints,
  createSecretRoomBacktrackConstraint,
} from "./constraints";

// =============================================================================
// CONSTRAINT COMBINATORS
// =============================================================================

export type { WeightedConstraint } from "./constraints";
export {
  and,
  createConstraintBuilder,
  implies,
  not,
  or,
  weighted,
  ConstraintBuilder,
} from "./constraints";

// =============================================================================
// SIMULATION (Traversal validation only)
// =============================================================================
// Note: Combat simulation has been deprecated. Use simulatePlaythrough
// for softlock detection and traversal validation only.

export type {
  ExplorationStrategy,
  SimulationConfig,
  SimulationEvent,
  SimulationEventType,
  SimulationState,
  SoftlockInfo,
  WalkerResult,
} from "./simulation";

export {
  DEFAULT_SIMULATION_CONFIG,
  simulatePlaythrough,
  SoftlockDetectedError,
} from "./simulation";

// =============================================================================
// GRAMMAR (Layout patterns)
// =============================================================================

export type {
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
  SpatialConnectionRequirement,
  SpatialMappingResult,
  SpatialRoomRequirement,
  SymbolRepetition,
} from "./grammar";

export {
  assignNodesToRooms,
  BUILT_IN_GRAMMARS,
  CLASSIC_GRAMMAR,
  createConnectionRequirements,
  createLinearGraph,
  createRoomRequirements,
  DEFAULT_GRAMMAR_CONSTRAINTS,
  expandGrammar,
  EXPLORATION_GRAMMAR,
  getGrammar,
  getRoomTypeAssignments,
  GrammarExpansionError,
  listGrammars,
  mapGraphToRooms,
  METROIDVANIA_GRAMMAR,
  PUZZLE_GRAMMAR,
  ROGUELIKE_GRAMMAR,
  SpatialMappingError,
  validateMapping,
} from "./grammar";

// =============================================================================
// GRAMMAR BUDGET TRACKING
// =============================================================================

export type {
  BudgetAllocation,
  BudgetStatus,
  BudgetTracker,
  NodeTypeBudget,
  ExpandGrammarOptions,
} from "./grammar";

export {
  createBudgetAllocation,
  createBudgetTracker,
  DEFAULT_BUDGET_ALLOCATION,
  mergeBudgetAllocations,
  scaleBudgetAllocation,
} from "./grammar";

// =============================================================================
// PASSES (Pipeline integration)
// =============================================================================

export type {
  ConstraintValidationPassConfig,
  GrammarExpandedState,
  GrammarExpansionPassConfig,
  SimulationValidationPassConfig,
} from "./passes";

export {
  createConstraintValidationPass,
  createGrammarExpansionPass,
  createSimulationValidationPass,
  DEFAULT_CONSTRAINT_VALIDATION_CONFIG,
  DEFAULT_GRAMMAR_EXPANSION_CONFIG,
  DEFAULT_SIMULATION_VALIDATION_CONFIG,
} from "./passes";

// =============================================================================
// EVALUATION (Statistical analysis)
// =============================================================================

export type {
  EvaluationConfig,
  EvaluationResult,
  FailureAnalysis,
  GeneratorFn,
  HistogramBin,
  MetricCollector,
  MetricStats,
  SampleMetrics,
  SampleResult,
  SimulatorFn,
  ValidatorFn,
} from "./evaluation";

export {
  createMetricCollector,
  DEFAULT_EVALUATION_CONFIG,
  formatEvaluationReport,
  runEvaluation,
} from "./evaluation";

