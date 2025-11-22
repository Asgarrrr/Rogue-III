/**
 * BSP Dungeon Generator Module
 *
 * Exports all components for BSP-based dungeon generation.
 */

export { BSPGenerator } from "./bsp-generator";
export { BspPartitioner } from "./partitioner";
export { BspRoomPlacer } from "./room-placer";
export { BspCorridorCarver } from "./corridor-carver";
export {
  type BspGeneratorConfig,
  type BspPartitionConfig,
  type BspRoomConfig,
  type BspCorridorConfig,
  type BspNode,
  type BspLeaf,
  DEFAULT_BSP_CONFIG,
  COMPACT_BSP_CONFIG,
  SPACIOUS_BSP_CONFIG,
  isBspLeaf,
} from "./config";
