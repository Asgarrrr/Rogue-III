/**
 * Simulation Module
 *
 * Lightweight playthrough simulation for validating dungeon playability.
 */

// Types
export type {
  DifficultyPoint,
  DifficultySpike,
  DimensionalScores,
  EngagementPoint,
  ExplorationStrategy,
  PacingAnalysis,
  PacingIssue,
  SimulationConfig,
  SimulationEvent,
  SimulationEventType,
  SimulationInventory,
  SimulationMetrics,
  SimulationState,
  SoftlockInfo,
  WalkerResult,
} from "./types";
export {
  DEFAULT_DIMENSIONAL_SCORES,
  DEFAULT_SIMULATION_CONFIG,
  PacingIssueError,
  SoftlockDetectedError,
} from "./types";

// Walker
export { simulatePlaythrough } from "./walker";

// Analyzers
export { analyzePacing } from "./analyzers";
