import { CellType, type ReadonlyGrid } from "../core/grid";
import { calculateArtifactChecksum } from "../core/hash";
import {
  buildGridFromDungeon,
  checkEntranceExists,
  checkExitExists,
  checkRoomConnectivity,
} from "../passes/validation/invariant-checks";
import type {
  DungeonArtifact,
  SpawnPoint,
  Violation,
} from "../pipeline/types";
import { hasErrorViolations, type DungeonValidationResult } from "./result-types";

function createEndpointFloorViolation(
  type: "entrance" | "exit",
  spawn: SpawnPoint,
  cell: CellType,
): Violation {
  const label = type === "entrance" ? "Entrance" : "Exit";
  return {
    type: `invariant.${type}.floor`,
    message: `${label} at (${spawn.position.x}, ${spawn.position.y}) is not on a FLOOR tile (cell type: ${cell})`,
    severity: "error",
  };
}

function appendSpawnFloorViolations(
  violations: Violation[],
  spawns: readonly SpawnPoint[],
  grid: ReadonlyGrid,
): void {
  for (const spawn of spawns) {
    const cell = grid.get(spawn.position.x, spawn.position.y);
    if (cell !== CellType.FLOOR) {
      violations.push({
        type: "invariant.spawn.floor",
        message: `Spawn point (${spawn.type}) at (${spawn.position.x}, ${spawn.position.y}) is not on a FLOOR tile (cell type: ${cell})`,
        severity: "error",
      });
    }
  }
}

/**
 * Validate a generated dungeon for invariant assertions.
 *
 * Checks:
 * - Entrance and exit exist
 * - Entrance and exit are on FLOOR tiles
 * - All rooms are connected (reachable from entrance)
 * - All spawn points are on FLOOR tiles
 * - Checksum matches recomputed value
 */
export function validateDungeon(
  dungeon: DungeonArtifact,
): DungeonValidationResult {
  const violations: Violation[] = [];
  const grid = buildGridFromDungeon(dungeon);

  // Reuse shared invariant checks from validation passes.
  violations.push(...checkEntranceExists(dungeon.spawns).violations);
  violations.push(...checkExitExists(dungeon.spawns).violations);

  const entrance = dungeon.spawns.find((spawn) => spawn.type === "entrance");
  const exit = dungeon.spawns.find((spawn) => spawn.type === "exit");

  // Keep dedicated entrance/exit floor violations for backward compatibility.
  if (entrance) {
    const entranceCell = grid.get(entrance.position.x, entrance.position.y);
    if (entranceCell !== CellType.FLOOR) {
      violations.push(
        createEndpointFloorViolation("entrance", entrance, entranceCell),
      );
    }
  }

  if (exit) {
    const exitCell = grid.get(exit.position.x, exit.position.y);
    if (exitCell !== CellType.FLOOR) {
      violations.push(createEndpointFloorViolation("exit", exit, exitCell));
    }
  }

  if (entrance) {
    const connectivity = checkRoomConnectivity(dungeon.rooms, entrance, grid);
    violations.push(...connectivity.violations);
  }

  appendSpawnFloorViolations(violations, dungeon.spawns, grid);

  // Verify checksum
  const recomputedChecksum = calculateArtifactChecksum(dungeon);
  if (recomputedChecksum !== dungeon.checksum) {
    violations.push({
      type: "invariant.checksum",
      message: `Checksum mismatch: stored ${dungeon.checksum}, computed ${recomputedChecksum}`,
      severity: "error",
    });
  }

  if (hasErrorViolations(violations)) {
    return { success: false, violations };
  }
  return { success: true, violations };
}
