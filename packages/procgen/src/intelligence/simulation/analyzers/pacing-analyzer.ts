/**
 * Pacing Analyzer
 *
 * Analyzes the pacing of a simulated playthrough to detect issues
 * like difficulty spikes, boring stretches, and resource starvation.
 */

import type { DungeonStateArtifact } from "../../../pipeline/types";
import type {
  DifficultyPoint,
  DimensionalScores,
  EngagementPoint,
  PacingAnalysis,
  PacingIssue,
  SimulationEvent,
  WalkerResult,
} from "../types";

// =============================================================================
// DIFFICULTY ANALYSIS
// =============================================================================

/**
 * Calculate difficulty progression from simulation events.
 */
function calculateDifficultyProgression(
  history: readonly SimulationEvent[],
  maxDamage: number,
): DifficultyPoint[] {
  const points: DifficultyPoint[] = [];

  for (const event of history) {
    if (event.type === "combat") {
      const damage = (event.data?.damage as number) ?? 0;
      points.push({
        step: event.step,
        roomId: event.roomId,
        difficulty: maxDamage > 0 ? damage / maxDamage : 0,
        type: "combat",
      });
    }
  }

  return points;
}

/**
 * Calculate engagement curve from events.
 */
function calculateEngagementCurve(
  history: readonly SimulationEvent[],
): EngagementPoint[] {
  const points: EngagementPoint[] = [];

  // Define engagement weights for different event types
  const engagementWeights: Record<string, number> = {
    combat: 0.8,
    collect_treasure: 0.7,
    collect_key: 0.9,
    unlock_door: 0.8,
    reach_exit: 1.0,
    enter_room: 0.2,
    softlock: 0,
    death: 0,
    use_potion: 0.4,
    collect_potion: 0.3,
  };

  for (const event of history) {
    const engagement = engagementWeights[event.type] ?? 0.1;
    points.push({
      step: event.step,
      roomId: event.roomId,
      engagement,
      eventType: event.type,
    });
  }

  return points;
}

// =============================================================================
// ISSUE DETECTION
// =============================================================================

/**
 * Detect difficulty spikes in the progression.
 */
function detectDifficultySpikes(
  progression: readonly DifficultyPoint[],
): PacingIssue[] {
  const issues: PacingIssue[] = [];

  if (progression.length < 2) return issues;

  for (let i = 1; i < progression.length; i++) {
    const current = progression[i]!;
    const previous = progression[i - 1]!;

    const jump = current.difficulty - previous.difficulty;

    if (jump > 0.4) {
      issues.push({
        type: "difficulty_spike",
        startStep: previous.step,
        endStep: current.step,
        severity: Math.min(1, jump * 2),
        description: `Sudden difficulty increase from ${(previous.difficulty * 100).toFixed(0)}% to ${(current.difficulty * 100).toFixed(0)}%`,
      });
    }
  }

  return issues;
}

/**
 * Detect boring stretches (low engagement periods).
 */
function detectBoringStretches(
  engagement: readonly EngagementPoint[],
): PacingIssue[] {
  const issues: PacingIssue[] = [];

  let lowEngagementStart: number | null = null;
  let lowEngagementCount = 0;

  const BORING_THRESHOLD = 0.3;
  const MIN_BORING_LENGTH = 4;

  for (const point of engagement) {
    if (point.engagement < BORING_THRESHOLD) {
      if (lowEngagementStart === null) {
        lowEngagementStart = point.step;
      }
      lowEngagementCount++;
    } else {
      if (lowEngagementCount >= MIN_BORING_LENGTH && lowEngagementStart !== null) {
        issues.push({
          type: "boring_stretch",
          startStep: lowEngagementStart,
          endStep: point.step - 1,
          severity: Math.min(1, lowEngagementCount / 10),
          description: `${lowEngagementCount} steps with low engagement`,
        });
      }
      lowEngagementStart = null;
      lowEngagementCount = 0;
    }
  }

  // Check trailing boring stretch
  if (lowEngagementCount >= MIN_BORING_LENGTH && lowEngagementStart !== null) {
    const lastStep = engagement[engagement.length - 1]?.step ?? 0;
    issues.push({
      type: "boring_stretch",
      startStep: lowEngagementStart,
      endStep: lastStep,
      severity: Math.min(1, lowEngagementCount / 10),
      description: `${lowEngagementCount} steps with low engagement at end`,
    });
  }

  return issues;
}

/**
 * Detect resource starvation (running low on health/potions).
 */
function detectResourceStarvation(
  history: readonly SimulationEvent[],
  startHealth: number,
): PacingIssue[] {
  const issues: PacingIssue[] = [];

  let currentHealth = startHealth;
  let lowHealthStart: number | null = null;
  let lowHealthSteps = 0;

  const LOW_HEALTH_THRESHOLD = 0.25;
  const MIN_STARVING_LENGTH = 3;

  for (const event of history) {
    if (event.type === "combat") {
      currentHealth -= (event.data?.damage as number) ?? 0;
    } else if (event.type === "use_potion") {
      currentHealth += (event.data?.healthRestored as number) ?? 40;
      currentHealth = Math.min(currentHealth, startHealth);
    }

    const healthRatio = currentHealth / startHealth;

    if (healthRatio < LOW_HEALTH_THRESHOLD) {
      if (lowHealthStart === null) {
        lowHealthStart = event.step;
      }
      lowHealthSteps++;
    } else {
      if (lowHealthSteps >= MIN_STARVING_LENGTH && lowHealthStart !== null) {
        issues.push({
          type: "resource_starvation",
          startStep: lowHealthStart,
          endStep: event.step,
          severity: Math.min(1, lowHealthSteps / 5),
          description: `Health critically low for ${lowHealthSteps} steps`,
        });
      }
      lowHealthStart = null;
      lowHealthSteps = 0;
    }
  }

  return issues;
}

/**
 * Detect backtrack fatigue (visiting same rooms repeatedly).
 */
function detectBacktrackFatigue(
  pathTaken: readonly number[],
): PacingIssue[] {
  const issues: PacingIssue[] = [];

  // Count room visits
  const visitCounts = new Map<number, number>();
  for (const roomId of pathTaken) {
    visitCounts.set(roomId, (visitCounts.get(roomId) ?? 0) + 1);
  }

  // Find rooms visited too many times
  const overvisited = Array.from(visitCounts.entries()).filter(
    ([, count]) => count > 2,
  );

  if (overvisited.length > pathTaken.length * 0.2) {
    issues.push({
      type: "backtrack_fatigue",
      startStep: 0,
      endStep: pathTaken.length - 1,
      severity: Math.min(1, overvisited.length / 5),
      description: `${overvisited.length} rooms visited 3+ times`,
    });
  }

  return issues;
}

// =============================================================================
// RECOMMENDATIONS
// =============================================================================

/**
 * Generate recommendations based on detected issues.
 */
function generateRecommendations(issues: readonly PacingIssue[]): string[] {
  const recommendations: string[] = [];

  const issueTypes = new Set(issues.map((i) => i.type));

  if (issueTypes.has("difficulty_spike")) {
    recommendations.push("Consider adding healing items before difficult encounters");
    recommendations.push("Gradual enemy difficulty scaling would improve flow");
  }

  if (issueTypes.has("boring_stretch")) {
    recommendations.push("Add more content to empty rooms");
    recommendations.push("Consider reducing corridor length or adding points of interest");
  }

  if (issueTypes.has("resource_starvation")) {
    recommendations.push("Add more potion drops in mid-game areas");
    recommendations.push("Consider reducing enemy damage or adding healing fountains");
  }

  if (issueTypes.has("backtrack_fatigue")) {
    recommendations.push("Add shortcuts to reduce backtracking");
    recommendations.push("Consider one-way paths or teleporters");
  }

  return recommendations;
}

/**
 * Calculate dimensional pacing scores.
 * Each dimension is scored 0-1 based on relevant issues and metrics.
 */
function calculateDimensionalScores(
  issues: readonly PacingIssue[],
  metrics: WalkerResult["metrics"],
  engagement: readonly EngagementPoint[],
  pathTaken: readonly number[],
): DimensionalScores {
  // Combat score: penalized by difficulty spikes
  const combatIssues = issues.filter(i => i.type === "difficulty_spike");
  const combatPenalty = combatIssues.reduce((sum, i) => sum + i.severity * 0.3, 0);
  const combat = Math.max(0, Math.min(1, 1 - combatPenalty));

  // Treasure score: based on treasure discovery rate and distribution
  const treasureEvents = engagement.filter(e => e.eventType === "collect_treasure");
  const treasureDistribution = treasureEvents.length > 0
    ? calculateDistribution(treasureEvents.map(e => e.step), metrics.totalSteps)
    : 1; // No treasures = not a problem necessarily
  const treasure = treasureDistribution;

  // Exploration score: based on completion ratio and room discovery rate
  const explorationBase = metrics.completionRatio;
  const boringIssues = issues.filter(i => i.type === "boring_stretch");
  const boringPenalty = boringIssues.reduce((sum, i) => sum + i.severity * 0.2, 0);
  const exploration = Math.max(0, Math.min(1, explorationBase - boringPenalty));

  // Resource score: penalized by resource starvation
  const resourceIssues = issues.filter(i => i.type === "resource_starvation");
  const resourcePenalty = resourceIssues.reduce((sum, i) => sum + i.severity * 0.4, 0);
  const resources = Math.max(0, Math.min(1, 1 - resourcePenalty));

  // Flow score: penalized by backtracking
  const backtrackIssues = issues.filter(i => i.type === "backtrack_fatigue");
  const backtrackPenalty = backtrackIssues.reduce((sum, i) => sum + i.severity * 0.25, 0);
  // Also consider unique rooms vs total steps ratio
  const uniqueRooms = new Set(pathTaken).size;
  const efficiency = pathTaken.length > 0 ? uniqueRooms / pathTaken.length : 1;
  const flowBase = Math.min(1, efficiency * 2); // Scale up, cap at 1
  const flow = Math.max(0, Math.min(1, flowBase - backtrackPenalty));

  return { combat, treasure, exploration, resources, flow };
}

/**
 * Calculate how well-distributed values are across a range.
 * Returns 1 for perfectly even distribution, lower for clustered.
 */
function calculateDistribution(steps: readonly number[], totalSteps: number): number {
  if (steps.length <= 1 || totalSteps === 0) return 1;

  // Calculate ideal spacing
  const idealSpacing = totalSteps / (steps.length + 1);
  const sortedSteps = [...steps].sort((a, b) => a - b);

  // Calculate variance from ideal positions
  let totalDeviation = 0;
  for (let i = 0; i < sortedSteps.length; i++) {
    const idealPosition = idealSpacing * (i + 1);
    const deviation = Math.abs((sortedSteps[i] ?? 0) - idealPosition) / totalSteps;
    totalDeviation += deviation;
  }

  const avgDeviation = totalDeviation / sortedSteps.length;
  return Math.max(0, 1 - avgDeviation * 2);
}

/**
 * Calculate overall pacing score from dimensional scores and issues.
 */
function calculatePacingScore(
  dimensionalScores: DimensionalScores,
  issues: readonly PacingIssue[],
): number {
  // Average of all dimensional scores
  const scores = [
    dimensionalScores.combat,
    dimensionalScores.treasure,
    dimensionalScores.exploration,
    dimensionalScores.resources,
    dimensionalScores.flow,
  ];
  const avgDimensionalScore = scores.reduce((sum, s) => sum + s, 0) / scores.length;

  // Additional penalty for severe issues (severity > 0.7)
  const severeIssues = issues.filter(i => i.severity > 0.7);
  const severePenalty = severeIssues.length * 0.05;

  return Math.max(0, Math.min(1, avgDimensionalScore - severePenalty));
}

// =============================================================================
// MAIN ANALYSIS
// =============================================================================

/**
 * Analyze the pacing of a simulated playthrough.
 */
export function analyzePacing(
  result: WalkerResult,
  dungeon: DungeonStateArtifact,
  startHealth = 100,
): PacingAnalysis {
  const { finalState, pathTaken, metrics } = result;

  // Calculate progressions
  const maxDamage = metrics.totalDamageReceived / Math.max(1, metrics.combatEncounters);
  const difficultyProgression = calculateDifficultyProgression(
    finalState.history,
    maxDamage * 2, // Normalize to max expected damage
  );
  const engagementCurve = calculateEngagementCurve(finalState.history);

  // Detect issues
  const issues: PacingIssue[] = [
    ...detectDifficultySpikes(difficultyProgression),
    ...detectBoringStretches(engagementCurve),
    ...detectResourceStarvation(finalState.history, startHealth),
    ...detectBacktrackFatigue(pathTaken),
  ];

  // Sort issues by severity
  issues.sort((a, b) => b.severity - a.severity);

  // Generate recommendations
  const recommendations = generateRecommendations(issues);

  // Calculate dimensional scores for granular analysis
  const dimensionalScores = calculateDimensionalScores(
    issues,
    metrics,
    engagementCurve,
    pathTaken,
  );

  // Calculate overall score from dimensional scores
  const overallScore = calculatePacingScore(dimensionalScores, issues);

  return {
    overallScore,
    dimensionalScores,
    difficultyProgression,
    engagementCurve,
    issues,
    recommendations,
  };
}
