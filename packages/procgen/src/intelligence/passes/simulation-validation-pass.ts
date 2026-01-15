/**
 * Simulation Validation Pass
 *
 * Pipeline pass that simulates a playthrough to validate dungeon playability.
 */

import type {
  DungeonStateArtifact,
  Pass,
  PassContext,
} from "../../pipeline/types";
import type { ProgressionGraph } from "../constraints/types";
import { analyzePacing } from "../simulation/analyzers";
import type {
  ExplorationStrategy,
  SimulationConfig,
} from "../simulation/types";
import {
  DEFAULT_SIMULATION_CONFIG,
  PacingIssueError,
  SoftlockDetectedError,
} from "../simulation/types";
import { simulatePlaythrough } from "../simulation/walker";

// =============================================================================
// PASS CONFIGURATION
// =============================================================================

/**
 * Configuration for the simulation validation pass.
 */
export interface SimulationValidationPassConfig {
  /** Exploration strategy for the virtual player */
  readonly strategy: ExplorationStrategy;

  /** Maximum number of simulation attempts */
  readonly maxSimulations: number;

  /** Whether to fail on softlock detection */
  readonly failOnSoftlock: boolean;

  /** Minimum pacing score to pass (0-1) */
  readonly minPacingScore: number;

  /** Whether to fail on low pacing score */
  readonly failOnLowPacing: boolean;

  /** Simulation configuration overrides */
  readonly simulationConfig?: Partial<SimulationConfig>;
}

/**
 * Default configuration for simulation validation.
 */
export const DEFAULT_SIMULATION_VALIDATION_CONFIG: SimulationValidationPassConfig =
  {
    strategy: "completionist",
    maxSimulations: 1,
    failOnSoftlock: true,
    minPacingScore: 0.5,
    failOnLowPacing: false,
    simulationConfig: {},
  };

// =============================================================================
// PROGRESSION EXTRACTION
// =============================================================================

/**
 * Extract progression graph from state if available.
 * This is a placeholder - actual implementation would depend on
 * how lock-and-key data is stored in the state.
 */
function extractProgression(
  state: DungeonStateArtifact,
): ProgressionGraph | null {
  // Check for progression data in spawns
  const locks: ProgressionGraph["locks"] = [];
  const keys: ProgressionGraph["keys"] = [];

  for (const spawn of state.spawns) {
    // Check for key spawns
    const keyTag = spawn.tags.find((t) => t.startsWith("key:"));
    if (keyTag) {
      keys.push({
        id: `key-${spawn.roomId}-${keyTag}`,
        type: keyTag.substring(4),
        roomId: spawn.roomId,
        position: spawn.position,
      });
    }

    // Check for lock spawns (doors)
    const lockTag = spawn.tags.find((t) => t.startsWith("lock:"));
    if (lockTag) {
      // Find connection index for this lock
      const connectionIndex = state.connections.findIndex(
        (c) => c.fromRoomId === spawn.roomId || c.toRoomId === spawn.roomId,
      );

      if (connectionIndex >= 0) {
        locks.push({
          id: `lock-${spawn.roomId}-${lockTag}`,
          type: lockTag.substring(5),
          connectionIndex,
        });
      }
    }
  }

  if (locks.length === 0 && keys.length === 0) {
    return null;
  }

  // Calculate key counts
  const keyCountsByType: Record<string, number> = {};
  for (const key of keys) {
    keyCountsByType[key.type] = (keyCountsByType[key.type] ?? 0) + 1;
  }

  return {
    locks,
    keys,
    solvable: true, // Assume solvable, constraint system validates this
    criticalPath: [],
    keyCountsByType,
  };
}

// =============================================================================
// PASS IMPLEMENTATION
// =============================================================================

/**
 * Create a simulation validation pass.
 *
 * This pass simulates a virtual player traversing the dungeon to:
 * - Detect softlocks (unreachable areas)
 * - Analyze pacing (difficulty spikes, boring stretches)
 * - Validate resource balance
 *
 * @example
 * ```typescript
 * const pass = createSimulationValidationPass({
 *   strategy: "completionist",
 *   failOnSoftlock: true,
 *   minPacingScore: 0.6,
 * });
 * ```
 */
export function createSimulationValidationPass(
  config: Partial<SimulationValidationPassConfig> = {},
): Pass<DungeonStateArtifact, DungeonStateArtifact> {
  const fullConfig: SimulationValidationPassConfig = {
    ...DEFAULT_SIMULATION_VALIDATION_CONFIG,
    ...config,
  };

  const {
    strategy,
    failOnSoftlock,
    minPacingScore,
    failOnLowPacing,
    simulationConfig,
  } = fullConfig;

  return {
    id: "intelligence.simulation-validation",
    inputType: "dungeon-state",
    outputType: "dungeon-state",

    run(input: DungeonStateArtifact, ctx: PassContext): DungeonStateArtifact {
      const progression = extractProgression(input);
      const rng = () => ctx.streams.details.next();

      // Run simulation
      const simConfig: Partial<SimulationConfig> = {
        ...simulationConfig,
        explorationStrategy: strategy,
        maxSteps: input.rooms.length * 4,
      };

      const result = simulatePlaythrough(input, progression, simConfig, rng);

      // Log results
      ctx.trace.decision(
        "intelligence.simulation-validation",
        "Simulation result",
        [strategy],
        result.completed ? "completed" : "incomplete",
        `Steps: ${result.metrics.totalSteps}, Rooms: ${result.metrics.roomsVisited}/${result.metrics.roomsTotal}, Health: ${result.metrics.healthRemainingRatio.toFixed(1)}`,
      );

      // Check for softlocks
      if (result.softlocks.length > 0) {
        ctx.trace.decision(
          "intelligence.simulation-validation",
          "Softlocks detected",
          result.softlocks.map((s) => s.reason),
          result.softlocks.length,
          `Unreachable rooms: ${result.softlocks.flatMap((s) => s.unreachableRooms).join(", ")}`,
        );

        if (failOnSoftlock) {
          throw new SoftlockDetectedError(result.softlocks);
        }
      }

      // Analyze pacing
      const pacing = analyzePacing(
        result,
        input,
        simulationConfig?.startHealth ?? DEFAULT_SIMULATION_CONFIG.startHealth,
      );

      ctx.trace.decision(
        "intelligence.simulation-validation",
        "Pacing analysis",
        pacing.issues.map((i) => i.type),
        pacing.overallScore.toFixed(2),
        pacing.recommendations.slice(0, 2).join("; ") || "No issues",
      );

      if (pacing.overallScore < minPacingScore && failOnLowPacing) {
        throw new PacingIssueError(pacing);
      }

      return input;
    },
  };
}
