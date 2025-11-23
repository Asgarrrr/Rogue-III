import { Position } from "../components/basic";
import { query } from "../core/query";
import { after, defineSystem } from "../core/scheduler";
import type { EntityId } from "../core/types";
import type { World } from "../core/world";
import { R } from "../resources";

export const runSpatialSync = defineSystem({
  name: "spatialSync",
  phase: "postUpdate" as const,
  ...after("movement" as const),
  run(world: World) {
    const spatial = R.get("spatial", world.resources);
    if (!spatial) return;
    for (const [e, pos] of query(world, { with: [Position] })) {
      const p = pos as { x: number; y: number };
      spatial.upsert(e as EntityId, p.x, p.y);
    }
  },
});
