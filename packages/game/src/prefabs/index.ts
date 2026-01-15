/**
 * Game Prefabs
 *
 * Define entity templates (prefabs) here.
 *
 * @example
 * ```typescript
 * import { definePrefab } from "@rogue/ecs";
 * import { Position, Health, Name, AI } from "../components";
 *
 * export const PlayerPrefab = definePrefab("Player")
 *   .with(Position, { x: 0, y: 0 })
 *   .with(Health, { current: 100, max: 100 })
 *   .with(Name, { value: "Hero" });
 *
 * export const GoblinPrefab = definePrefab("Goblin")
 *   .with(Position)
 *   .with(Health, { current: 30, max: 30 })
 *   .with(AI, { behavior: "aggressive" })
 *   .with(Name, { value: "Goblin" });
 * ```
 */

export {};
