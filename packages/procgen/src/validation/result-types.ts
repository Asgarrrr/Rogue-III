import type { Violation } from "../pipeline/types";

/**
 * Successful validation result.
 * May still contain warnings, but no errors.
 */
export interface ValidationSuccess {
  readonly success: true;
  readonly violations: readonly Violation[];
}

/**
 * Failed validation result.
 * Contains at least one error-level violation.
 */
export interface ValidationFailure {
  readonly success: false;
  readonly violations: readonly Violation[];
}

/**
 * Dungeon validation result - discriminated union.
 * Use `if (result.success)` to narrow to success/failure types.
 */
export type DungeonValidationResult = ValidationSuccess | ValidationFailure;

/**
 * Utility for reducing repeated error checks in validation paths.
 */
export function hasErrorViolations(violations: readonly Violation[]): boolean {
  return violations.some((violation) => violation.severity === "error");
}
