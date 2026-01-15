/**
 * Constraint Combinators
 *
 * Algebraic operations for composing constraints.
 * Enables building complex constraints from simple primitives.
 *
 * Operations:
 * - AND: All constraints must be satisfied
 * - OR: At least one constraint must be satisfied
 * - NOT: Inverts a constraint
 * - IMPLIES: If A then B (A implies B)
 * - WEIGHTED: Weighted combination of constraints
 */

import type {
  Constraint,
  ConstraintContext,
  ConstraintPriority,
  ConstraintResult,
  ConstraintViolation,
  RepairSuggestion,
} from "./types";

// =============================================================================
// COMBINATOR IMPLEMENTATIONS
// =============================================================================

/**
 * AND combinator - all constraints must be satisfied.
 */
export function and(
  id: string,
  name: string,
  constraints: readonly Constraint[],
  priority: ConstraintPriority = "critical",
): Constraint {
  return {
    id,
    name,
    description: `All of: ${constraints.map(c => c.name).join(", ")}`,
    priority,

    evaluate(ctx: ConstraintContext): ConstraintResult {
      const results = constraints.map(c => c.evaluate(ctx));
      const violations: ConstraintViolation[] = results.flatMap(r => [...r.violations]);

      // Score is the minimum score (weakest link)
      const score = results.length > 0
        ? Math.min(...results.map(r => r.score))
        : 1;

      const satisfied = results.every(r => r.satisfied);

      return {
        constraintId: id,
        satisfied,
        score,
        violations,
      };
    },

    suggest(ctx: ConstraintContext): readonly RepairSuggestion[] {
      // Collect suggestions from all violated constraints
      const suggestions: RepairSuggestion[] = [];

      for (const constraint of constraints) {
        const result = constraint.evaluate(ctx);
        if (!result.satisfied && constraint.suggest) {
          suggestions.push(...constraint.suggest(ctx));
        }
      }

      // Sort by priority (highest first)
      return suggestions.sort((a, b) => b.priority - a.priority);
    },
  };
}

/**
 * OR combinator - at least one constraint must be satisfied.
 */
export function or(
  id: string,
  name: string,
  constraints: readonly Constraint[],
  priority: ConstraintPriority = "important",
): Constraint {
  return {
    id,
    name,
    description: `Any of: ${constraints.map(c => c.name).join(", ")}`,
    priority,

    evaluate(ctx: ConstraintContext): ConstraintResult {
      const results = constraints.map(c => c.evaluate(ctx));

      // Score is the maximum score (best option)
      const score = results.length > 0
        ? Math.max(...results.map(r => r.score))
        : 0;

      const satisfied = results.some(r => r.satisfied);

      // Only report violations if none satisfied
      const violations: ConstraintViolation[] = satisfied
        ? []
        : [{
            constraint: id,
            message: `None of the alternatives satisfied: ${constraints.map(c => c.name).join(", ")}`,
            severity: priority === "critical" ? "error" : "warning",
          }];

      return {
        constraintId: id,
        satisfied,
        score,
        violations,
      };
    },

    suggest(ctx: ConstraintContext): readonly RepairSuggestion[] {
      // Find the constraint closest to being satisfied and suggest its repairs
      let bestConstraint: Constraint | null = null;
      let bestScore = -1;

      for (const constraint of constraints) {
        const result = constraint.evaluate(ctx);
        if (result.score > bestScore) {
          bestScore = result.score;
          bestConstraint = constraint;
        }
      }

      if (bestConstraint?.suggest) {
        return bestConstraint.suggest(ctx);
      }

      return [];
    },
  };
}

/**
 * NOT combinator - inverts a constraint.
 */
export function not(
  id: string,
  name: string,
  constraint: Constraint,
  priority: ConstraintPriority = "important",
): Constraint {
  return {
    id,
    name,
    description: `Not: ${constraint.name}`,
    priority,

    evaluate(ctx: ConstraintContext): ConstraintResult {
      const result = constraint.evaluate(ctx);

      // Invert satisfaction and score
      const satisfied = !result.satisfied;
      const score = 1 - result.score;

      const violations: ConstraintViolation[] = satisfied
        ? []
        : [{
            constraint: id,
            message: `Constraint should not be satisfied: ${constraint.name}`,
            severity: priority === "critical" ? "error" : "warning",
          }];

      return {
        constraintId: id,
        satisfied,
        score,
        violations,
      };
    },

    // NOT constraints typically can't suggest repairs
    // (we'd need to know how to un-satisfy the inner constraint)
  };
}

/**
 * IMPLIES combinator - if A then B (A → B).
 * Equivalent to (NOT A) OR B.
 */
export function implies(
  id: string,
  name: string,
  antecedent: Constraint,
  consequent: Constraint,
  priority: ConstraintPriority = "important",
): Constraint {
  return {
    id,
    name,
    description: `If ${antecedent.name} then ${consequent.name}`,
    priority,

    evaluate(ctx: ConstraintContext): ConstraintResult {
      const antecedentResult = antecedent.evaluate(ctx);
      const consequentResult = consequent.evaluate(ctx);

      // A → B is equivalent to ¬A ∨ B
      // If A is false, implication is satisfied
      // If A is true, B must be true
      const satisfied = !antecedentResult.satisfied || consequentResult.satisfied;

      // Score: if antecedent false, score is 1; otherwise use consequent score
      const score = antecedentResult.satisfied
        ? consequentResult.score
        : 1;

      const violations: ConstraintViolation[] = satisfied
        ? []
        : [{
            constraint: id,
            message: `${antecedent.name} is satisfied but ${consequent.name} is not`,
            severity: priority === "critical" ? "error" : "warning",
          }];

      return {
        constraintId: id,
        satisfied,
        score,
        violations,
      };
    },

    suggest(ctx: ConstraintContext): readonly RepairSuggestion[] {
      const antecedentResult = antecedent.evaluate(ctx);
      const consequentResult = consequent.evaluate(ctx);

      // If antecedent is satisfied but consequent isn't, suggest consequent repairs
      if (antecedentResult.satisfied && !consequentResult.satisfied && consequent.suggest) {
        return consequent.suggest(ctx);
      }

      return [];
    },
  };
}

/**
 * Weighted constraint with custom weight.
 */
export interface WeightedConstraint {
  readonly constraint: Constraint;
  readonly weight: number;
}

/**
 * WEIGHTED combinator - weighted average of constraints.
 */
export function weighted(
  id: string,
  name: string,
  weightedConstraints: readonly WeightedConstraint[],
  priority: ConstraintPriority = "important",
  satisfactionThreshold: number = 0.7,
): Constraint {
  return {
    id,
    name,
    description: `Weighted: ${weightedConstraints.map(wc => `${wc.constraint.name}(${wc.weight})`).join(", ")}`,
    priority,

    evaluate(ctx: ConstraintContext): ConstraintResult {
      const results = weightedConstraints.map(wc => ({
        weight: wc.weight,
        result: wc.constraint.evaluate(ctx),
      }));

      // Calculate weighted score
      const totalWeight = results.reduce((sum, r) => sum + r.weight, 0);
      const weightedScore = totalWeight > 0
        ? results.reduce((sum, r) => sum + r.weight * r.result.score, 0) / totalWeight
        : 0;

      const satisfied = weightedScore >= satisfactionThreshold;

      // Collect violations from all, weighted by importance
      const violations: ConstraintViolation[] = results
        .filter(r => !r.result.satisfied)
        .flatMap(r => r.result.violations);

      return {
        constraintId: id,
        satisfied,
        score: weightedScore,
        violations,
      };
    },

    suggest(ctx: ConstraintContext): readonly RepairSuggestion[] {
      // Suggest repairs from the most impactful violated constraint
      const suggestions: RepairSuggestion[] = [];

      for (const wc of weightedConstraints) {
        const result = wc.constraint.evaluate(ctx);
        if (!result.satisfied && wc.constraint.suggest) {
          const constraintSuggestions = wc.constraint.suggest(ctx);
          // Boost priority by weight
          for (const suggestion of constraintSuggestions) {
            suggestions.push({
              ...suggestion,
              priority: suggestion.priority * wc.weight,
            });
          }
        }
      }

      return suggestions.sort((a, b) => b.priority - a.priority);
    },
  };
}

// =============================================================================
// CONSTRAINT BUILDER (Fluent API)
// =============================================================================

/**
 * Constraint builder for fluent composition.
 */
export class ConstraintBuilder {
  private idCounter = 0;

  private generateId(prefix: string): string {
    return `${prefix}_${this.idCounter++}`;
  }

  /**
   * Create an AND constraint.
   */
  all(
    constraints: readonly Constraint[],
    options?: { name?: string; priority?: ConstraintPriority },
  ): Constraint {
    const id = this.generateId("and");
    return and(
      id,
      options?.name ?? `All(${constraints.length})`,
      constraints,
      options?.priority ?? "critical",
    );
  }

  /**
   * Create an OR constraint.
   */
  any(
    constraints: readonly Constraint[],
    options?: { name?: string; priority?: ConstraintPriority },
  ): Constraint {
    const id = this.generateId("or");
    return or(
      id,
      options?.name ?? `Any(${constraints.length})`,
      constraints,
      options?.priority ?? "important",
    );
  }

  /**
   * Create a NOT constraint.
   */
  not(
    constraint: Constraint,
    options?: { name?: string; priority?: ConstraintPriority },
  ): Constraint {
    const id = this.generateId("not");
    return not(
      id,
      options?.name ?? `Not(${constraint.name})`,
      constraint,
      options?.priority ?? "important",
    );
  }

  /**
   * Create an IMPLIES constraint.
   */
  ifThen(
    antecedent: Constraint,
    consequent: Constraint,
    options?: { name?: string; priority?: ConstraintPriority },
  ): Constraint {
    const id = this.generateId("implies");
    return implies(
      id,
      options?.name ?? `If(${antecedent.name})Then(${consequent.name})`,
      antecedent,
      consequent,
      options?.priority ?? "important",
    );
  }

  /**
   * Create a WEIGHTED constraint.
   */
  weighted(
    weightedConstraints: readonly WeightedConstraint[],
    options?: {
      name?: string;
      priority?: ConstraintPriority;
      threshold?: number;
    },
  ): Constraint {
    const id = this.generateId("weighted");
    return weighted(
      id,
      options?.name ?? `Weighted(${weightedConstraints.length})`,
      weightedConstraints,
      options?.priority ?? "important",
      options?.threshold ?? 0.7,
    );
  }
}

/**
 * Create a constraint builder instance.
 */
export function createConstraintBuilder(): ConstraintBuilder {
  return new ConstraintBuilder();
}
