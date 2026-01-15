/**
 * Constraint-Based Generation Types
 *
 * Defines gameplay invariants that MUST be satisfied by generated dungeons.
 * Constraints are evaluated after generation to validate correctness,
 * or used to guide generation decisions through repairs.
 */

import type { Point } from "../../core/geometry/types";
import type { Grid } from "../../core/grid/grid";
import type {
  Connection,
  DungeonStateArtifact,
  Room,
  SpawnPoint,
} from "../../pipeline/types";

// =============================================================================
// CONSTRAINT CONTEXT
// =============================================================================

/**
 * Metadata computed for each room during constraint evaluation.
 */
export interface RoomMetadata {
  readonly roomId: number;
  readonly distanceFromEntrance: number;
  readonly connectionCount: number;
  readonly isDeadEnd: boolean;
  readonly isHub: boolean;
  readonly isOnCriticalPath: boolean;
}

/**
 * Lock definition for progression constraints.
 */
export interface Lock {
  readonly id: string;
  readonly type: string;
  readonly connectionIndex: number;
  readonly variant?: "door" | "gate" | "barrier" | "puzzle";
}

/**
 * Key definition for progression constraints.
 */
export interface Key {
  readonly id: string;
  readonly type: string;
  readonly roomId: number;
  readonly position: Point;
  readonly variant?: "key" | "switch" | "item" | "boss_drop";
}

/**
 * Progression graph for lock-and-key analysis.
 */
export interface ProgressionGraph {
  readonly locks: readonly Lock[];
  readonly keys: readonly Key[];
  readonly solvable: boolean;
  readonly criticalPath: readonly number[];
  readonly keyCountsByType: Readonly<Record<string, number>>;
}

/**
 * Context provided to constraints for evaluation.
 */
export interface ConstraintContext {
  readonly rooms: readonly Room[];
  readonly connections: readonly Connection[];
  readonly spawns: readonly SpawnPoint[];
  readonly progression: ProgressionGraph | null;
  readonly roomDistances: ReadonlyMap<number, number>;
  readonly roomMetadata: ReadonlyMap<number, RoomMetadata>;
  readonly adjacency: ReadonlyMap<number, readonly number[]>;
  readonly grid: Grid;
  readonly rng: () => number;
}

// =============================================================================
// CONSTRAINT RESULTS
// =============================================================================

/**
 * A specific violation of a constraint.
 */
export interface ConstraintViolation {
  readonly constraint: string;
  readonly message: string;
  readonly location?: {
    readonly roomId?: number;
    readonly position?: Point;
    readonly connectionIndex?: number;
  };
  readonly severity: "error" | "warning";
}

/**
 * Result of evaluating a single constraint.
 */
export interface ConstraintResult {
  readonly constraintId: string;
  readonly satisfied: boolean;
  /** Score from 0 (fully violated) to 1 (fully satisfied) */
  readonly score: number;
  readonly violations: readonly ConstraintViolation[];
}

// =============================================================================
// REPAIR SUGGESTIONS
// =============================================================================

/**
 * Type of repair action.
 */
export type RepairType =
  | "add_connection"
  | "remove_connection"
  | "move_spawn"
  | "add_spawn"
  | "remove_spawn"
  | "modify_room_type"
  | "add_key"
  | "move_key"
  | "add_lock"
  | "remove_lock";

/**
 * A suggested repair action to fix a constraint violation.
 */
export interface RepairSuggestion {
  readonly type: RepairType;
  readonly description: string;
  readonly priority: number;
  /**
   * Apply the repair to the dungeon state.
   * Returns a new state with the repair applied.
   */
  readonly apply: (state: DungeonStateArtifact) => DungeonStateArtifact;
}

// =============================================================================
// CONSTRAINT INTERFACE
// =============================================================================

/**
 * Constraint priority levels.
 * - critical: Must be satisfied, generation fails otherwise
 * - important: Should be satisfied, repairs will be attempted
 * - nice-to-have: Optional, no repairs attempted
 */
export type ConstraintPriority = "critical" | "important" | "nice-to-have";

/**
 * A gameplay constraint that must be satisfied.
 */
export interface Constraint {
  readonly id: string;
  readonly name: string;
  readonly description?: string;
  readonly priority: ConstraintPriority;

  /**
   * Evaluate whether the constraint is satisfied.
   * @param ctx - Constraint evaluation context
   * @returns Result with satisfaction status, score, and violations
   */
  evaluate(ctx: ConstraintContext): ConstraintResult;

  /**
   * Optional: Generate repair suggestions when violated.
   * @param ctx - Constraint evaluation context
   * @returns Ordered list of repair suggestions (highest priority first)
   */
  suggest?(ctx: ConstraintContext): readonly RepairSuggestion[];
}

// =============================================================================
// SOLVER TYPES
// =============================================================================

/**
 * Configuration for the constraint solver.
 */
export interface ConstraintSolverConfig {
  readonly constraints: readonly Constraint[];
  readonly maxRepairAttempts: number;
  readonly minSatisfactionScore: number;
  readonly repairCriticalOnly?: boolean;
}

/**
 * Record of an applied repair.
 */
export interface AppliedRepair {
  readonly constraintId: string;
  readonly suggestion: RepairSuggestion;
  readonly beforeScore: number;
  readonly afterScore: number;
}

/**
 * Result of running the constraint solver.
 */
export interface SolverResult {
  readonly satisfied: boolean;
  readonly finalScore: number;
  readonly results: readonly ConstraintResult[];
  readonly repairs: readonly AppliedRepair[];
  readonly iterations: number;
}

/**
 * Constraint solver interface.
 */
export interface ConstraintSolver {
  /**
   * Validate a dungeon against all constraints without repairs.
   */
  validate(state: DungeonStateArtifact, rng: () => number): SolverResult;

  /**
   * Validate and attempt repairs for violated constraints.
   */
  solveWithRepairs(
    state: DungeonStateArtifact,
    rng: () => number,
  ): { result: SolverResult; state: DungeonStateArtifact };
}

// =============================================================================
// UTILITY TYPES
// =============================================================================

/**
 * Helper type for constraint factory functions.
 */
export type ConstraintFactory<TConfig = void> = TConfig extends void
  ? () => Constraint
  : (config: TConfig) => Constraint;

/**
 * Error thrown when critical constraints are violated.
 */
export class ConstraintViolationError extends Error {
  readonly results: readonly ConstraintResult[];

  constructor(results: readonly ConstraintResult[]) {
    const violations = results
      .filter((r) => !r.satisfied)
      .flatMap((r) => r.violations)
      .map((v) => `[${v.severity}] ${v.constraint}: ${v.message}`)
      .join("\n");

    super(`Constraint violations:\n${violations}`);
    this.name = "ConstraintViolationError";
    this.results = results;
  }
}
