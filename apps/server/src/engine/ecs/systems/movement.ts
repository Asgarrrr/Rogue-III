import { World } from "../core/world";
import { query } from "../core/query";
import { defineSystem } from "../core/scheduler";
import { Position, Velocity } from "../components/basic";

export const runMovement = defineSystem({
	name: "movement",
	phase: "update" as const,
	run(world: World) {
		for (const [e, pos, vel] of query(world, { with: [Position, Velocity] })) {
			world.set(e, Position, (p) => ({
				x: p.x + (vel as { x: number; y: number }).x,
				y: p.y + (vel as { x: number; y: number }).y,
			}));
		}
	},
});
