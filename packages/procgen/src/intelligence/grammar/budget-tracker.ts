/**
 * Budget Tracker Implementation
 *
 * Tracks and enforces node type budgets during grammar expansion.
 * Prevents overproduction of certain node types while ensuring minimums.
 */

import type {
  BudgetAllocation,
  BudgetStatus,
  BudgetTracker,
  ExperienceNodeType,
  NodeTypeBudget,
} from "./types";
import { DEFAULT_BUDGET_ALLOCATION } from "./types";

/**
 * All node types for iteration.
 */
const ALL_NODE_TYPES: readonly ExperienceNodeType[] = [
  "entrance",
  "combat",
  "puzzle",
  "treasure",
  "rest",
  "story",
  "shop",
  "miniboss",
  "boss",
  "exit",
  "secret",
  "shortcut",
];

/**
 * Default budget for types not specified in allocation.
 */
const DEFAULT_UNSPECIFIED_BUDGET: NodeTypeBudget = {
  min: 0,
  max: Infinity,
  target: 0,
};

/**
 * Create a budget tracker with the given allocation.
 */
export function createBudgetTracker(
  allocation: BudgetAllocation = DEFAULT_BUDGET_ALLOCATION,
): BudgetTracker {
  // Track spending per type
  const spent = new Map<ExperienceNodeType, number>();

  // Initialize all types to 0
  for (const type of ALL_NODE_TYPES) {
    spent.set(type, 0);
  }

  /**
   * Get budget config for a type.
   */
  function getBudget(type: ExperienceNodeType): NodeTypeBudget {
    return allocation[type] ?? DEFAULT_UNSPECIFIED_BUDGET;
  }

  return {
    getStatus(type: ExperienceNodeType): BudgetStatus {
      const budget = getBudget(type);
      const spentCount = spent.get(type) ?? 0;
      const remaining = budget.max - spentCount;
      const target = budget.target ?? budget.min;

      return {
        type,
        spent: spentCount,
        remaining: Math.max(0, remaining),
        minSatisfied: spentCount >= budget.min,
        atCapacity: spentCount >= budget.max,
        targetDelta: spentCount - target,
      };
    },

    canSpend(type: ExperienceNodeType): boolean {
      const budget = getBudget(type);
      const spentCount = spent.get(type) ?? 0;
      return spentCount < budget.max;
    },

    spend(type: ExperienceNodeType): void {
      const current = spent.get(type) ?? 0;
      spent.set(type, current + 1);
    },

    getHealthScore(): number {
      let satisfiedCount = 0;
      let totalChecks = 0;

      for (const type of ALL_NODE_TYPES) {
        const budget = getBudget(type);
        const spentCount = spent.get(type) ?? 0;

        // Check minimum satisfaction
        if (budget.min > 0) {
          totalChecks++;
          if (spentCount >= budget.min) {
            satisfiedCount++;
          }
        }

        // Check maximum not exceeded
        if (budget.max < Infinity) {
          totalChecks++;
          if (spentCount <= budget.max) {
            satisfiedCount++;
          }
        }

        // Check target proximity (softer scoring)
        if (budget.target !== undefined) {
          totalChecks++;
          const delta = Math.abs(spentCount - budget.target);
          const tolerance = Math.max(1, budget.target * 0.5);
          if (delta <= tolerance) {
            satisfiedCount++;
          } else {
            // Partial credit for being close
            satisfiedCount += Math.max(0, 1 - delta / (tolerance * 2));
          }
        }
      }

      return totalChecks > 0 ? satisfiedCount / totalChecks : 1;
    },

    getUnsatisfiedMinimums(): ExperienceNodeType[] {
      const unsatisfied: ExperienceNodeType[] = [];

      for (const type of ALL_NODE_TYPES) {
        const budget = getBudget(type);
        const spentCount = spent.get(type) ?? 0;
        if (spentCount < budget.min) {
          unsatisfied.push(type);
        }
      }

      return unsatisfied;
    },

    getAtCapacity(): ExperienceNodeType[] {
      const atCap: ExperienceNodeType[] = [];

      for (const type of ALL_NODE_TYPES) {
        const budget = getBudget(type);
        const spentCount = spent.get(type) ?? 0;
        if (spentCount >= budget.max) {
          atCap.push(type);
        }
      }

      return atCap;
    },

    getSummary(): readonly BudgetStatus[] {
      return ALL_NODE_TYPES.map((type) => this.getStatus(type));
    },
  };
}

/**
 * Create a budget allocation from simple min/max pairs.
 */
export function createBudgetAllocation(
  overrides: Partial<Record<ExperienceNodeType, { min?: number; max?: number; target?: number }>>,
): BudgetAllocation {
  const allocation: BudgetAllocation = { ...DEFAULT_BUDGET_ALLOCATION };

  for (const [type, config] of Object.entries(overrides)) {
    const nodeType = type as ExperienceNodeType;
    const existing = allocation[nodeType] ?? DEFAULT_UNSPECIFIED_BUDGET;

    allocation[nodeType] = {
      min: config.min ?? existing.min,
      max: config.max ?? existing.max,
      target: config.target ?? existing.target,
    };
  }

  return allocation;
}

/**
 * Scale a budget allocation by a factor.
 * Useful for adjusting budgets based on dungeon size.
 */
export function scaleBudgetAllocation(
  allocation: BudgetAllocation,
  factor: number,
): BudgetAllocation {
  const scaled: BudgetAllocation = {};

  for (const [type, budget] of Object.entries(allocation)) {
    const nodeType = type as ExperienceNodeType;
    if (budget) {
      scaled[nodeType] = {
        min: Math.round(budget.min * factor),
        max: budget.max === Infinity ? Infinity : Math.round(budget.max * factor),
        target: budget.target !== undefined ? Math.round(budget.target * factor) : undefined,
      };
    }
  }

  return scaled;
}

/**
 * Merge two budget allocations, taking the more restrictive values.
 */
export function mergeBudgetAllocations(
  a: BudgetAllocation,
  b: BudgetAllocation,
): BudgetAllocation {
  const merged: BudgetAllocation = {};

  const allTypes = new Set([
    ...Object.keys(a),
    ...Object.keys(b),
  ]) as Set<ExperienceNodeType>;

  for (const type of allTypes) {
    const budgetA = a[type];
    const budgetB = b[type];

    if (budgetA && budgetB) {
      // Take more restrictive values
      merged[type] = {
        min: Math.max(budgetA.min, budgetB.min),
        max: Math.min(budgetA.max, budgetB.max),
        target: budgetA.target !== undefined && budgetB.target !== undefined
          ? Math.round((budgetA.target + budgetB.target) / 2)
          : (budgetA.target ?? budgetB.target),
      };
    } else {
      merged[type] = budgetA ?? budgetB;
    }
  }

  return merged;
}
