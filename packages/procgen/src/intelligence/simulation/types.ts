/**
 * Simulation Types
 *
 * Types for the lightweight playthrough simulation system.
 * Simulates a virtual player traversing the dungeon to detect issues.
 */

import type { Point } from "../../core/geometry/types";

// =============================================================================
// SIMULATION STATE
// =============================================================================

/**
 * Inventory state during simulation.
 */
export interface SimulationInventory {
  readonly potions: number;
  readonly ammo: number;
  readonly gold: number;
  readonly keys: ReadonlySet<string>;
}

/**
 * State of the virtual player during simulation.
 */
export interface SimulationState {
  readonly currentRoomId: number;
  readonly visitedRooms: ReadonlySet<number>;
  readonly inventory: SimulationInventory;
  readonly health: number;
  readonly maxHealth: number;
  readonly steps: number;
  readonly history: readonly SimulationEvent[];
}

// =============================================================================
// SIMULATION EVENTS
// =============================================================================

/**
 * Types of events that can occur during simulation.
 */
export type SimulationEventType =
  | "enter_room"
  | "collect_key"
  | "unlock_door"
  | "combat"
  | "collect_treasure"
  | "collect_potion"
  | "use_potion"
  | "softlock"
  | "death"
  | "reach_exit";

/**
 * Base simulation event.
 */
export interface SimulationEvent {
  readonly step: number;
  readonly type: SimulationEventType;
  readonly roomId: number;
  readonly data?: Record<string, unknown>;
}

// =============================================================================
// SIMULATION CONFIGURATION
// =============================================================================

/**
 * Strategy for choosing next room during exploration.
 */
export type ExplorationStrategy =
  | "shortest_path"    // Always take shortest path to exit
  | "completionist"    // Visit every reachable room
  | "treasure_hunter"  // Prioritize treasure rooms
  | "cautious";        // Avoid combat when possible

/**
 * Configuration for simulation.
 */
export interface SimulationConfig {
  /** Starting health */
  readonly startHealth: number;
  /** Maximum health */
  readonly maxHealth: number;
  /** Starting potions */
  readonly startPotions: number;
  /** Starting ammo */
  readonly startAmmo: number;

  /** Damage taken per enemy encounter */
  readonly enemyDamage: number;
  /** Ammo cost per enemy */
  readonly ammoCostPerEnemy: number;
  /** Health restored per potion */
  readonly potionHeal: number;
  /** Health threshold to use potion */
  readonly usePotionThreshold: number;

  /** Maximum simulation steps (prevents infinite loops) */
  readonly maxSteps: number;

  /** Strategy for choosing next room */
  readonly explorationStrategy: ExplorationStrategy;
}

/**
 * Default simulation configuration.
 */
export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  startHealth: 100,
  maxHealth: 100,
  startPotions: 2,
  startAmmo: 20,
  enemyDamage: 15,
  ammoCostPerEnemy: 3,
  potionHeal: 40,
  usePotionThreshold: 0.3,
  maxSteps: 200,
  explorationStrategy: "completionist",
};

// =============================================================================
// SIMULATION RESULTS
// =============================================================================

/**
 * Information about a detected softlock.
 */
export interface SoftlockInfo {
  readonly step: number;
  readonly roomId: number;
  readonly reason: string;
  readonly requiredKey?: string;
  readonly unreachableRooms: readonly number[];
}

/**
 * Information about a difficulty spike.
 */
export interface DifficultySpike {
  readonly roomId: number;
  readonly step: number;
  readonly damageReceived: number;
  readonly healthBefore: number;
  readonly healthAfter: number;
  readonly severity: "minor" | "moderate" | "severe";
}

/**
 * Metrics collected during simulation.
 */
export interface SimulationMetrics {
  readonly totalSteps: number;
  readonly roomsVisited: number;
  readonly roomsTotal: number;
  readonly completionRatio: number;

  readonly combatEncounters: number;
  readonly totalDamageReceived: number;
  readonly potionsUsed: number;
  readonly ammoUsed: number;

  readonly treasuresFound: number;
  readonly keysCollected: number;
  readonly doorsUnlocked: number;

  readonly healthRemaining: number;
  readonly healthRemainingRatio: number;

  readonly difficultySpikes: readonly DifficultySpike[];
  readonly averageDifficulty: number;
}

/**
 * Result of running a simulation.
 */
export interface WalkerResult {
  readonly completed: boolean;
  readonly reachedExit: boolean;
  readonly finalState: SimulationState;
  readonly metrics: SimulationMetrics;
  readonly softlocks: readonly SoftlockInfo[];
  readonly pathTaken: readonly number[];
  readonly durationMs: number;
}

// =============================================================================
// PACING ANALYSIS
// =============================================================================

/**
 * A point on the difficulty curve.
 */
export interface DifficultyPoint {
  readonly step: number;
  readonly roomId: number;
  readonly difficulty: number;
  readonly type: "combat" | "puzzle" | "exploration";
}

/**
 * A point on the engagement curve.
 */
export interface EngagementPoint {
  readonly step: number;
  readonly roomId: number;
  readonly engagement: number;
  readonly eventType: SimulationEventType;
}

/**
 * Pacing issue detected during analysis.
 */
export interface PacingIssue {
  readonly type: "difficulty_spike" | "boring_stretch" | "resource_starvation" | "backtrack_fatigue";
  readonly startStep: number;
  readonly endStep: number;
  readonly severity: number;
  readonly description: string;
}

/**
 * Per-dimension scores for detailed pacing analysis.
 * Each dimension is scored 0-1, where 1 is optimal.
 */
export interface DimensionalScores {
  /** Combat pacing - smooth difficulty curve, no spikes */
  readonly combat: number;
  /** Treasure pacing - rewards well-distributed */
  readonly treasure: number;
  /** Exploration pacing - good ratio of new discoveries */
  readonly exploration: number;
  /** Resource pacing - health/potions available when needed */
  readonly resources: number;
  /** Flow pacing - minimal backtracking, good engagement */
  readonly flow: number;
}

/**
 * Default dimensional scores (all dimensions at perfect score).
 */
export const DEFAULT_DIMENSIONAL_SCORES: DimensionalScores = {
  combat: 1,
  treasure: 1,
  exploration: 1,
  resources: 1,
  flow: 1,
};

/**
 * Result of pacing analysis.
 */
export interface PacingAnalysis {
  /** Overall pacing score (0-1, where 1 is optimal). Average of dimensional scores minus penalties. */
  readonly overallScore: number;
  /** Per-dimension scores for targeted analysis */
  readonly dimensionalScores: DimensionalScores;
  readonly difficultyProgression: readonly DifficultyPoint[];
  readonly engagementCurve: readonly EngagementPoint[];
  readonly issues: readonly PacingIssue[];
  readonly recommendations: readonly string[];
}

// =============================================================================
// ERRORS
// =============================================================================

/**
 * Error thrown when a softlock is detected.
 */
export class SoftlockDetectedError extends Error {
  readonly softlocks: readonly SoftlockInfo[];

  constructor(softlocks: readonly SoftlockInfo[]) {
    const messages = softlocks
      .map((s) => `Room ${s.roomId}: ${s.reason}`)
      .join("\n");

    super(`Softlock detected:\n${messages}`);
    this.name = "SoftlockDetectedError";
    this.softlocks = softlocks;
  }
}

/**
 * Error thrown when pacing issues are too severe.
 */
export class PacingIssueError extends Error {
  readonly analysis: PacingAnalysis;

  constructor(analysis: PacingAnalysis) {
    const messages = analysis.issues
      .map((i) => `[${i.severity.toFixed(1)}] ${i.type}: ${i.description}`)
      .join("\n");

    super(`Pacing issues detected (score: ${analysis.overallScore.toFixed(2)}):\n${messages}`);
    this.name = "PacingIssueError";
    this.analysis = analysis;
  }
}
