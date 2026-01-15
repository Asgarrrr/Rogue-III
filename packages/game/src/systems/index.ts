/**
 * Game Systems
 *
 * Define all ECS systems here. Systems contain game logic.
 *
 * @example
 * ```typescript
 * import { defineSystem, Phase } from "@rogue/ecs";
 * import { Position, Velocity } from "../components";
 *
 * export const MovementSystem = defineSystem("Movement")
 *   .inPhase(Phase.Update)
 *   .execute((world) => {
 *     world.query(Position, Velocity).run((view) => {
 *       const x = view.column(Position, "x");
 *       const y = view.column(Position, "y");
 *       const vx = view.column(Velocity, "vx");
 *       const vy = view.column(Velocity, "vy");
 *
 *       for (let i = 0; i < view.count; i++) {
 *         x[i] += vx[i];
 *         y[i] += vy[i];
 *       }
 *     });
 *   });
 * ```
 */

export {};
