/**
 * Common Initialize State Pass
 *
 * Shared initialization logic for creating a wall-filled dungeon-state artifact.
 */

import { CellType, Grid } from "../../core/grid";
import type {
  DungeonStateArtifact,
  EmptyArtifact,
  Pass,
} from "../../pipeline/types";

/**
 * Create an initialize-state pass for a specific generator namespace.
 */
export function createInitializeStatePass(
  namespace: string,
): Pass<EmptyArtifact, DungeonStateArtifact, never> {
  const passId = `${namespace}.initialize-state`;

  return {
    id: passId,
    inputType: "empty",
    outputType: "dungeon-state",
    requiredStreams: [] as const,
    run(_input, ctx) {
      const grid = new Grid(ctx.config.width, ctx.config.height, CellType.WALL);

      ctx.trace.decision(
        passId,
        "Initialize grid",
        ["walls", "floors"],
        "walls",
        `Created ${ctx.config.width}x${ctx.config.height} grid filled with walls`,
      );

      return {
        type: "dungeon-state",
        id: "dungeon-state",
        width: ctx.config.width,
        height: ctx.config.height,
        grid,
        rooms: [],
        edges: [],
        connections: [],
        spawns: [],
      };
    },
  };
}

