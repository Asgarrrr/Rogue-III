/**
 * Algorithm Fragments
 *
 * Standalone algorithm components that can be composed to create custom
 * dungeon generation pipelines.
 *
 * @example
 * ```typescript
 * import {
 *   bspPartition,
 *   getBSPLeaves,
 *   placeRoomInPartition,
 *   buildCompleteGraph,
 *   buildMST,
 *   initializeRandomGrid,
 *   cellularSmooth,
 *   keepLargestRegion,
 * } from "@rogue/procgen-v2/fragments";
 *
 * // BSP-based dungeon
 * const tree = bspPartition(100, 80, { minSize: 10 }, rng);
 * const leaves = getBSPLeaves(tree);
 * const rooms = leaves.map(leaf => placeRoomInPartition(leaf, 2, 4, rng));
 *
 * // Connect rooms with MST
 * const centers = rooms.map(r => ({ x: r.x + r.width/2, y: r.y + r.height/2 }));
 * const edges = buildCompleteGraph(centers);
 * const mst = buildMST(rooms.length, edges);
 *
 * // Cellular automata cave
 * let cave = initializeRandomGrid(100, 80, 0.45, rng);
 * cave = cellularSmooth(cave, 5);
 * keepLargestRegion(cave);
 * ```
 */

export * from "./cellular";
export * from "./connectivity";
export * from "./partitioning";
