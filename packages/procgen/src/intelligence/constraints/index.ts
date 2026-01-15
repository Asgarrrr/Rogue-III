/**
 * Constraint-Based Generation Module
 *
 * Provides gameplay constraints that must be satisfied by generated dungeons.
 */

// Types
export type {
  AppliedRepair,
  Constraint,
  ConstraintContext,
  ConstraintFactory,
  ConstraintPriority,
  ConstraintResult,
  ConstraintSolver,
  ConstraintSolverConfig,
  ConstraintViolation,
  Key,
  Lock,
  ProgressionGraph,
  RepairSuggestion,
  RepairType,
  RoomMetadata,
  SolverResult,
} from "./types";
export { ConstraintViolationError } from "./types";

// Solver
export {
  buildConstraintContext,
  computeReachableRooms,
  countDisjointPaths,
  createConstraintSolver,
  pearsonCorrelation,
} from "./solver";

// Built-in Constraints (structural only)
export {
  createDefaultConstraints,
  createFullConnectivityConstraint,
  createKeyBeforeLockConstraint,
  createMinRoomCountConstraint,
  createMultiPathToBossConstraint,
  createProgressionConstraints,
  createSecretRoomBacktrackConstraint,
} from "./built-in-constraints";
export type {
  MinRoomCountConfig,
  MultiPathToBossConfig,
} from "./built-in-constraints";

// Combinators (Constraint Composition Algebra)
export {
  and,
  createConstraintBuilder,
  implies,
  not,
  or,
  weighted,
  ConstraintBuilder,
} from "./combinators";
export type { WeightedConstraint } from "./combinators";
