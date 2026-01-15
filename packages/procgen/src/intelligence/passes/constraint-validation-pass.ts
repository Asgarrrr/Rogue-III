/**
 * Constraint Validation Pass
 *
 * Pipeline pass that validates dungeon state against constraints
 * and optionally attempts repairs.
 */

import type { Pass, PassContext, DungeonStateArtifact } from "../../pipeline/types";
import {
  createConstraintSolver,
  type Constraint,
  type ConstraintSolverConfig,
  ConstraintViolationError,
} from "../constraints";

// =============================================================================
// PASS CONFIGURATION
// =============================================================================

/**
 * Configuration for the constraint validation pass.
 */
export interface ConstraintValidationPassConfig {
  /** Constraints to validate against */
  readonly constraints: readonly Constraint[];

  /** Whether to fail on critical constraint violations */
  readonly failOnCritical: boolean;

  /** Whether to attempt repairs for violated constraints */
  readonly attemptRepairs: boolean;

  /** Maximum number of repair attempts */
  readonly maxRepairAttempts: number;

  /** Minimum satisfaction score to pass (0-1) */
  readonly minSatisfactionScore?: number;

  /** Only repair critical constraints */
  readonly repairCriticalOnly?: boolean;
}

/**
 * Default configuration for constraint validation.
 */
export const DEFAULT_CONSTRAINT_VALIDATION_CONFIG: ConstraintValidationPassConfig = {
  constraints: [],
  failOnCritical: true,
  attemptRepairs: true,
  maxRepairAttempts: 5,
  minSatisfactionScore: 0.8,
  repairCriticalOnly: false,
};

// =============================================================================
// PASS IMPLEMENTATION
// =============================================================================

/**
 * Create a constraint validation pass.
 *
 * This pass validates the dungeon state against a set of constraints.
 * If `attemptRepairs` is true, it will try to fix violations.
 * If `failOnCritical` is true, it throws on critical violations.
 *
 * @example
 * ```typescript
 * const pass = createConstraintValidationPass({
 *   constraints: [
 *     createFullConnectivityConstraint(),
 *     createMultiPathToBossConstraint({ minPaths: 2 }),
 *   ],
 *   failOnCritical: true,
 *   attemptRepairs: true,
 *   maxRepairAttempts: 5,
 * });
 * ```
 */
export function createConstraintValidationPass(
  config: Partial<ConstraintValidationPassConfig> & {
    constraints: readonly Constraint[];
  },
): Pass<DungeonStateArtifact, DungeonStateArtifact> {
  const fullConfig: ConstraintValidationPassConfig = {
    ...DEFAULT_CONSTRAINT_VALIDATION_CONFIG,
    ...config,
  };

  const {
    constraints,
    failOnCritical,
    attemptRepairs,
    maxRepairAttempts,
    minSatisfactionScore,
    repairCriticalOnly,
  } = fullConfig;

  return {
    id: "intelligence.constraint-validation",
    inputType: "dungeon-state",
    outputType: "dungeon-state",

    run(input: DungeonStateArtifact, ctx: PassContext): DungeonStateArtifact {
      const solverConfig: ConstraintSolverConfig = {
        constraints: [...constraints],
        maxRepairAttempts,
        minSatisfactionScore: minSatisfactionScore ?? 0.8,
        repairCriticalOnly,
      };

      const solver = createConstraintSolver(solverConfig);
      const rng = () => ctx.streams.details.next();

      if (attemptRepairs) {
        const { result, state } = solver.solveWithRepairs(input, rng);

        // Log to trace
        ctx.trace.decision(
          "intelligence.constraint-validation",
          "Constraint validation with repairs",
          constraints.map((c) => c.id),
          result.satisfied ? "passed" : "failed",
          `Score: ${result.finalScore.toFixed(2)}, Repairs: ${result.repairs.length}, Iterations: ${result.iterations}`,
        );

        // Log individual results
        for (const constraintResult of result.results) {
          if (!constraintResult.satisfied) {
            ctx.trace.decision(
              "intelligence.constraint-validation",
              `Constraint "${constraintResult.constraintId}"`,
              constraintResult.violations.map((v) => v.message),
              constraintResult.score.toFixed(2),
              `${constraintResult.violations.length} violation(s)`,
            );
          }
        }

        if (!result.satisfied && failOnCritical) {
          // Check if any critical constraint failed
          const criticalFailures = result.results.filter((r) => {
            const constraint = constraints.find(
              (c) => c.id === r.constraintId,
            );
            return constraint?.priority === "critical" && !r.satisfied;
          });

          if (criticalFailures.length > 0) {
            throw new ConstraintViolationError(criticalFailures);
          }
        }

        return state;
      } else {
        const result = solver.validate(input, rng);

        ctx.trace.decision(
          "intelligence.constraint-validation",
          "Constraint validation (no repairs)",
          constraints.map((c) => c.id),
          result.satisfied ? "passed" : "failed",
          `Score: ${result.finalScore.toFixed(2)}`,
        );

        if (!result.satisfied && failOnCritical) {
          const criticalFailures = result.results.filter((r) => {
            const constraint = constraints.find(
              (c) => c.id === r.constraintId,
            );
            return constraint?.priority === "critical" && !r.satisfied;
          });

          if (criticalFailures.length > 0) {
            throw new ConstraintViolationError(criticalFailures);
          }
        }

        return input;
      }
    },
  };
}
