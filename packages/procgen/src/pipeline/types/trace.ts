/**
 * Pipeline Trace & Debug Types
 *
 * Types for tracing generation decisions and debugging.
 */

import type { AnyArtifact } from "./artifacts";

// =============================================================================
// TRACE TYPES
// =============================================================================

/**
 * Trace event types
 */
export type TraceEventType =
  | "start"
  | "end"
  | "decision"
  | "artifact"
  | "warning";

/**
 * Decision system identifiers for structured tracing.
 */
export type DecisionSystem =
  | "layout" // BSP partitioning, grid initialization
  | "rooms" // Room placement, sizing, type assignment
  | "connectivity" // MST, corridor carving, graph operations
  | "spawns" // Entity placement, content distribution
  | "grammar" // Grammar expansion, symbol selection
  | "constraints" // Constraint evaluation, repair decisions
  | "simulation" // Playthrough simulation, pacing analysis
  | "semantic"; // Semantic enrichment, trait assignment

/**
 * Confidence level for decisions.
 */
export type DecisionConfidence = "high" | "medium" | "low";

/**
 * Structured decision data for enhanced tracing.
 */
export interface StructuredDecisionData {
  /** Which system made this decision */
  readonly system: DecisionSystem;
  /** The question being answered */
  readonly question: string;
  /** Available options */
  readonly options: readonly unknown[];
  /** The chosen option */
  readonly chosen: unknown;
  /** Human-readable reason */
  readonly reason: string;
  /** Confidence in this decision */
  readonly confidence: DecisionConfidence;
  /** Number of RNG calls consumed for this decision */
  readonly rngConsumed: number;
  /** Optional context data */
  readonly context?: Record<string, unknown>;
}

/**
 * Base trace event
 */
export interface TraceEvent {
  readonly timestamp: number;
  readonly passId: string;
  readonly eventType: TraceEventType;
  readonly data?: unknown;
}

/**
 * Decision event for "explain why" debugging
 */
export interface DecisionEvent extends TraceEvent {
  readonly eventType: "decision";
  readonly data: {
    readonly question: string;
    readonly options: readonly unknown[];
    readonly chosen: unknown;
    readonly reason: string;
  };
}

/**
 * Enhanced decision event with structured data.
 */
export interface StructuredDecisionEvent extends TraceEvent {
  readonly eventType: "decision";
  readonly data: StructuredDecisionData;
}

/**
 * Statistics for decision analysis.
 */
export interface DecisionStats {
  readonly totalDecisions: number;
  readonly bySystem: Readonly<Record<DecisionSystem, number>>;
  readonly byConfidence: Readonly<Record<DecisionConfidence, number>>;
  readonly totalRngConsumed: number;
  readonly avgRngPerDecision: number;
}

/**
 * Trace collector interface
 */
export interface TraceCollector {
  readonly enabled: boolean;
  start(passId: string): void;
  end(passId: string, durationMs: number): void;
  decision(
    passId: string,
    question: string,
    options: readonly unknown[],
    chosen: unknown,
    reason: string,
  ): void;
  /**
   * Record a structured decision with full metadata.
   */
  structuredDecision(passId: string, data: StructuredDecisionData): void;
  warning(passId: string, message: string): void;
  artifact(passId: string, artifact: AnyArtifact): void;
  getEvents(): readonly TraceEvent[];
  /**
   * Get all decisions filtered by system.
   */
  getDecisionsBySystem(
    system: DecisionSystem,
  ): readonly StructuredDecisionEvent[];
  /**
   * Get decision statistics.
   */
  getDecisionStats(): DecisionStats;
  clear(): void;
}
