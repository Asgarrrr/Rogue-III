/**
 * Common Finalize Pass
 *
 * Shared finalization logic for converting dungeon state to final artifact.
 * Used by multiple generators to maintain consistency.
 */

import { calculateChecksum } from "../../core/hash";
import type {
  DungeonArtifact,
  DungeonStateArtifact,
  Pass,
} from "../../pipeline/types";

/**
 * Creates a finalize pass that converts dungeon state to final artifact.
 * Parameterized by namespace to allow different pass IDs per generator.
 *
 * @param namespace - Generator namespace (e.g., "bsp", "cellular")
 * @returns Pass that converts DungeonStateArtifact to DungeonArtifact
 */
export function finalizeDungeon(
  namespace: string,
): Pass<DungeonStateArtifact, DungeonArtifact, never> {
  return {
    id: `${namespace}.finalize`,
    inputType: "dungeon-state",
    outputType: "dungeon",
    requiredStreams: [] as const,
    run(input, ctx) {
      const checksum = calculateChecksum(
        input.grid,
        input.rooms,
        input.connections,
        input.spawns,
      );

      ctx.trace.decision(
        `${namespace}.finalize`,
        "Dungeon checksum",
        [],
        checksum,
        `Checksum computed from grid, rooms, connections, and spawns`,
      );

      return {
        type: "dungeon",
        id: "dungeon",
        width: input.width,
        height: input.height,
        terrain: input.grid.getRawDataCopy(), // Use copy for immutability
        rooms: input.rooms,
        connections: input.connections,
        spawns: input.spawns,
        checksum,
        seed: ctx.seed,
      };
    },
  };
}
