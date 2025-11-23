import { Position, Velocity } from "../components/basic";
import { query } from "../core/query";
import { defineSystem } from "../core/scheduler";
import type { World } from "../core/world";

export const runMovement = defineSystem({
  name: "movement",
  phase: "update" as const,
  run(world: World) {
    for (const [e, _pos, vel] of query(world, { with: [Position, Velocity] })) {
      world.set(e, Position, (p) => ({
        x: p.x + (vel as { x: number; y: number }).x,
        y: p.y + (vel as { x: number; y: number }).y,
      }));
    }
  },
});
