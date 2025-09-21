import { World } from "../core/world";
import { query } from "../core/query";
import type { EntityId } from "../core/types";
import { R } from "../resources";
import { Position } from "../components/basic";
import { defineSystem } from "../core/scheduler";
import { after } from "../core/scheduler";

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
