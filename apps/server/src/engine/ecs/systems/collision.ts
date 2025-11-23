import { Position, Velocity } from "../components/basic";
import { query } from "../core/query";
import { before, defineSystem } from "../core/scheduler";
import type { World } from "../core/world";
import { R } from "../resources";

// Simple grid-based collision: cancel velocity if target tile is blocked
export const runCollision = defineSystem({
  name: "collision",
  phase: "update" as const,
  ...before("movement" as const),
  run(world: World) {
    const grid = R.get("grid", world.resources);
    if (!grid) return;
    for (const [e, pos, vel] of query(world, { with: [Position, Velocity] })) {
      const nextX = Math.round(
        (pos as { x: number; y: number }).x +
          (vel as { x: number; y: number }).x,
      );
      const nextY = Math.round(
        (pos as { x: number; y: number }).y +
          (vel as { x: number; y: number }).y,
      );
      if (grid.isBlocked(nextX, nextY)) {
        world.set(e, Velocity, () => ({ x: 0, y: 0 }));
      }
    }
  },
});
