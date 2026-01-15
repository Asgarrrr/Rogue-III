/**
 * Constraint Solver
 *
 * Validates dungeons against constraints and attempts repairs when violated.
 * Uses deterministic RNG for all repair decisions.
 */

import type { Grid } from "../../core/grid/grid";
import {
  buildAdjacencyFromConnections,
  calculateConnectionCounts,
  calculateRoomDistances,
} from "../../passes/connectivity/graph-algorithms";
import type {
  Connection,
  DungeonStateArtifact,
  Room,
  SpawnPoint,
} from "../../pipeline/types";
import type {
  AppliedRepair,
  Constraint,
  ConstraintContext,
  ConstraintResult,
  ConstraintSolver,
  ConstraintSolverConfig,
  ProgressionGraph,
  RoomMetadata,
  SolverResult,
} from "./types";

// =============================================================================
// CONTEXT BUILDER
// =============================================================================

/**
 * Build constraint evaluation context from dungeon state.
 */
export function buildConstraintContext(
  state: DungeonStateArtifact,
  rng: () => number,
  progression?: ProgressionGraph | null,
): ConstraintContext {
  const { rooms, connections, spawns, grid } = state;

  // Find entrance room
  const entranceRoom = rooms.find((r) => r.type === "entrance");
  const entranceId = entranceRoom?.id ?? rooms[0]?.id ?? 0;

  // Calculate distances from entrance
  const roomDistances = calculateRoomDistances(rooms, connections, entranceId);

  // Build adjacency map
  const adjacency = buildAdjacencyFromConnections(rooms, connections);

  // Calculate room metadata
  const roomMetadata = buildRoomMetadata(
    rooms,
    connections,
    roomDistances,
    progression,
  );

  return {
    rooms,
    connections,
    spawns,
    progression: progression ?? null,
    roomDistances,
    roomMetadata,
    adjacency,
    grid,
    rng,
  };
}

/**
 * Build metadata for each room.
 */
function buildRoomMetadata(
  rooms: readonly Room[],
  connections: readonly Connection[],
  distances: ReadonlyMap<number, number>,
  progression?: ProgressionGraph | null,
): ReadonlyMap<number, RoomMetadata> {
  const metadata = new Map<number, RoomMetadata>();
  const connectionCounts = calculateConnectionCounts(rooms, connections);

  // Get critical path rooms if available
  const criticalPathSet = new Set(progression?.criticalPath ?? []);

  for (const room of rooms) {
    const connectionCount = connectionCounts.get(room.id) ?? 0;

    metadata.set(room.id, {
      roomId: room.id,
      distanceFromEntrance: distances.get(room.id) ?? 0,
      connectionCount,
      isDeadEnd: connectionCount === 1,
      isHub: connectionCount >= 3,
      isOnCriticalPath: criticalPathSet.has(room.id),
    });
  }

  return metadata;
}

// =============================================================================
// REPAIR HISTORY (Oscillation Prevention)
// =============================================================================

/**
 * Create a signature for a repair suggestion to detect duplicates/reversals.
 * The signature captures the essential action being taken.
 */
function createRepairSignature(
  constraintId: string,
  suggestion: { type: string; description: string },
): string {
  // Normalize the description to capture the essence of the repair
  const normalizedDesc = suggestion.description
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
  return `${constraintId}:${suggestion.type}:${normalizedDesc}`;
}

/**
 * Check if a repair would reverse a previous repair.
 * Detects patterns like "add X" followed by "remove X".
 */
function isReversingRepair(
  newSignature: string,
  repairHistory: Set<string>,
): boolean {
  // Check direct duplicate
  if (repairHistory.has(newSignature)) {
    return true;
  }

  // Check for reversal patterns
  // Pattern: "add_connection:rooms 1,2" vs "remove_connection:rooms 1,2"
  const parts = newSignature.split(":");
  if (parts.length >= 3) {
    const [constraintId, type, ...descParts] = parts;
    const desc = descParts.join(":");

    // Check for add/remove reversal
    const reversalType = type?.startsWith("add_")
      ? type.replace("add_", "remove_")
      : type?.startsWith("remove_")
        ? type.replace("remove_", "add_")
        : null;

    if (reversalType) {
      const reversalSignature = `${constraintId}:${reversalType}:${desc}`;
      if (repairHistory.has(reversalSignature)) {
        return true;
      }
    }
  }

  return false;
}

// =============================================================================
// SOLVER IMPLEMENTATION
// =============================================================================

/**
 * Calculate weighted score from constraint results.
 */
function calculateWeightedScore(
  results: readonly { constraint: Constraint; result: ConstraintResult }[],
): number {
  if (results.length === 0) return 1;

  const weights: Record<string, number> = {
    critical: 3,
    important: 2,
    "nice-to-have": 1,
  };

  let totalWeight = 0;
  let weightedSum = 0;

  for (const { constraint, result } of results) {
    const weight = weights[constraint.priority] ?? 1;
    totalWeight += weight;
    weightedSum += result.score * weight;
  }

  return totalWeight > 0 ? weightedSum / totalWeight : 1;
}

/**
 * Create a constraint solver instance.
 */
export function createConstraintSolver(
  config: ConstraintSolverConfig,
): ConstraintSolver {
  const { constraints, maxRepairAttempts, minSatisfactionScore } = config;

  return {
    validate(state: DungeonStateArtifact, rng: () => number): SolverResult {
      const ctx = buildConstraintContext(state, rng);

      const results = constraints.map((constraint) => ({
        constraint,
        result: constraint.evaluate(ctx),
      }));

      const totalScore = calculateWeightedScore(results);
      const allCriticalSatisfied = results.every(
        (r) => r.result.satisfied || r.constraint.priority !== "critical",
      );

      return {
        satisfied:
          allCriticalSatisfied && totalScore >= minSatisfactionScore,
        finalScore: totalScore,
        results: results.map((r) => r.result),
        repairs: [],
        iterations: 1,
      };
    },

    solveWithRepairs(
      state: DungeonStateArtifact,
      rng: () => number,
    ): { result: SolverResult; state: DungeonStateArtifact } {
      let currentState = state;
      const appliedRepairs: AppliedRepair[] = [];
      // Track repair history to prevent oscillation (add then remove same thing)
      const repairHistory = new Set<string>();

      for (let iteration = 0; iteration < maxRepairAttempts; iteration++) {
        const ctx = buildConstraintContext(currentState, rng);

        const results = constraints.map((constraint) => ({
          constraint,
          result: constraint.evaluate(ctx),
        }));

        const totalScore = calculateWeightedScore(results);

        // Check termination conditions
        const criticalViolations = results.filter(
          (r) => !r.result.satisfied && r.constraint.priority === "critical",
        );

        const importantViolations = config.repairCriticalOnly
          ? []
          : results.filter(
              (r) =>
                !r.result.satisfied && r.constraint.priority === "important",
            );

        // All critical satisfied and score meets threshold
        if (
          criticalViolations.length === 0 &&
          totalScore >= minSatisfactionScore
        ) {
          return {
            result: {
              satisfied: true,
              finalScore: totalScore,
              results: results.map((r) => r.result),
              repairs: appliedRepairs,
              iterations: iteration + 1,
            },
            state: currentState,
          };
        }

        // Try to repair violations
        const toRepair =
          criticalViolations[0] ??
          importantViolations[0] ??
          results.find((r) => !r.result.satisfied);

        if (!toRepair || !toRepair.constraint.suggest) {
          // Can't repair further
          break;
        }

        const suggestions = toRepair.constraint.suggest(ctx);
        if (suggestions.length === 0) {
          // No suggestions available
          break;
        }

        // Find a suggestion that doesn't reverse a previous repair
        let selectedSuggestion = null;
        for (const suggestion of suggestions) {
          const signature = createRepairSignature(
            toRepair.constraint.id,
            suggestion,
          );
          if (!isReversingRepair(signature, repairHistory)) {
            selectedSuggestion = suggestion;
            // Record this repair in history
            repairHistory.add(signature);
            break;
          }
        }

        if (!selectedSuggestion) {
          // All suggestions would reverse previous repairs - stop to prevent oscillation
          break;
        }

        const beforeScore = toRepair.result.score;

        try {
          currentState = selectedSuggestion.apply(currentState);
        } catch {
          // Repair failed, try next iteration
          break;
        }

        // Re-evaluate to get after score
        const afterCtx = buildConstraintContext(currentState, rng);
        const afterResult = toRepair.constraint.evaluate(afterCtx);

        appliedRepairs.push({
          constraintId: toRepair.constraint.id,
          suggestion: selectedSuggestion,
          beforeScore,
          afterScore: afterResult.score,
        });

        // If repair didn't improve, stop
        if (afterResult.score <= beforeScore) {
          break;
        }
      }

      // Final evaluation
      const finalCtx = buildConstraintContext(currentState, rng);
      const finalResults = constraints.map((constraint) => ({
        constraint,
        result: constraint.evaluate(finalCtx),
      }));
      const finalScore = calculateWeightedScore(finalResults);

      const allCriticalSatisfied = finalResults.every(
        (r) => r.result.satisfied || r.constraint.priority !== "critical",
      );

      return {
        result: {
          satisfied:
            allCriticalSatisfied && finalScore >= minSatisfactionScore,
          finalScore,
          results: finalResults.map((r) => r.result),
          repairs: appliedRepairs,
          iterations: maxRepairAttempts,
        },
        state: currentState,
      };
    },
  };
}

// =============================================================================
// GRAPH UTILITIES FOR CONSTRAINTS
// =============================================================================

/**
 * Compute reachable rooms from a starting room, optionally excluding certain connections.
 */
export function computeReachableRooms(
  rooms: readonly Room[],
  connections: readonly Connection[],
  startRoomId: number,
  excludedConnectionIndices?: ReadonlySet<number>,
): Set<number> {
  const reachable = new Set<number>();
  const queue: number[] = [startRoomId];
  let queueHead = 0;
  reachable.add(startRoomId);

  // Build adjacency excluding certain connections
  const adjacency = new Map<number, number[]>();
  for (const room of rooms) {
    adjacency.set(room.id, []);
  }

  connections.forEach((conn, index) => {
    if (excludedConnectionIndices?.has(index)) return;
    adjacency.get(conn.fromRoomId)?.push(conn.toRoomId);
    adjacency.get(conn.toRoomId)?.push(conn.fromRoomId);
  });

  while (queueHead < queue.length) {
    const current = queue[queueHead++];
    if (current === undefined) break;

    for (const neighbor of adjacency.get(current) ?? []) {
      if (!reachable.has(neighbor)) {
        reachable.add(neighbor);
        queue.push(neighbor);
      }
    }
  }

  return reachable;
}

/**
 * Count edge-disjoint paths between two nodes using max-flow (Ford-Fulkerson).
 * For small graphs, this is efficient enough.
 */
export function countDisjointPaths(
  rooms: readonly Room[],
  connections: readonly Connection[],
  sourceId: number,
  sinkId: number,
): number {
  if (sourceId === sinkId) return 0;
  if (rooms.length === 0) return 0;

  // Build adjacency with edge capacities (all 1 for counting paths)
  const capacity = new Map<string, number>();
  const neighbors = new Map<number, number[]>();

  for (const room of rooms) {
    neighbors.set(room.id, []);
  }

  for (const conn of connections) {
    const key1 = `${conn.fromRoomId},${conn.toRoomId}`;
    const key2 = `${conn.toRoomId},${conn.fromRoomId}`;
    capacity.set(key1, 1);
    capacity.set(key2, 1);
    neighbors.get(conn.fromRoomId)?.push(conn.toRoomId);
    neighbors.get(conn.toRoomId)?.push(conn.fromRoomId);
  }

  // Ford-Fulkerson with BFS (Edmonds-Karp)
  let maxFlow = 0;

  while (true) {
    // BFS to find augmenting path
    const parent = new Map<number, number>();
    const visited = new Set<number>();
    const queue: number[] = [sourceId];
    let queueHead = 0;
    visited.add(sourceId);

    while (queueHead < queue.length) {
      const current = queue[queueHead++];
      if (current === undefined) break;
      if (current === sinkId) break;

      for (const neighbor of neighbors.get(current) ?? []) {
        const key = `${current},${neighbor}`;
        if (!visited.has(neighbor) && (capacity.get(key) ?? 0) > 0) {
          visited.add(neighbor);
          parent.set(neighbor, current);
          queue.push(neighbor);
        }
      }
    }

    // No path found
    if (!parent.has(sinkId) && sourceId !== sinkId) break;
    if (!visited.has(sinkId)) break;

    // Find min capacity along path
    let pathFlow = Infinity;
    let node = sinkId;
    while (parent.has(node)) {
      const prev = parent.get(node)!;
      const key = `${prev},${node}`;
      pathFlow = Math.min(pathFlow, capacity.get(key) ?? 0);
      node = prev;
    }

    // Update capacities
    node = sinkId;
    while (parent.has(node)) {
      const prev = parent.get(node)!;
      const keyForward = `${prev},${node}`;
      const keyBackward = `${node},${prev}`;
      capacity.set(keyForward, (capacity.get(keyForward) ?? 0) - pathFlow);
      capacity.set(keyBackward, (capacity.get(keyBackward) ?? 0) + pathFlow);
      node = prev;
    }

    maxFlow += pathFlow;
  }

  return maxFlow;
}

/**
 * Calculate Pearson correlation coefficient between two arrays.
 */
export function pearsonCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length < 2) return 0;

  const n = x.length;
  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;

  for (let i = 0; i < n; i++) {
    const xi = x[i] ?? 0;
    const yi = y[i] ?? 0;
    sumX += xi;
    sumY += yi;
    sumXY += xi * yi;
    sumX2 += xi * xi;
    sumY2 += yi * yi;
  }

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt(
    (n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY),
  );

  return denominator === 0 ? 0 : numerator / denominator;
}
