/**
 * Pass Library
 *
 * Reusable passes and utilities for dungeon generation pipelines.
 *
 * @example
 * ```typescript
 * import { carving, connectivity, validation } from "@rogue/procgen-v2/passes";
 *
 * // Use corridor carving utilities
 * carving.carveLShapedCorridor(grid, from, to, 2, true);
 *
 * // Use graph algorithms
 * const edges = connectivity.buildCompleteGraph(rooms);
 * const mst = connectivity.buildMST(rooms.length, edges);
 *
 * // Validate dungeon
 * const result = validation.runAllChecks(dungeon);
 * ```
 */

export * as carving from "./carving";
export * as connectivity from "./connectivity";
export * as content from "./content";
export * as progression from "./progression";
export * as traits from "./traits";
export * as validation from "./validation";
