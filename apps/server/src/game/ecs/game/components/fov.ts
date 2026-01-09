/**
 * Field of View Components
 *
 * Components for vision and visibility.
 */

import { ComponentSchema, ComponentType } from "../../core/component";

/**
 * FOV configuration component.
 */
export interface FOVData {
  radius: number;
  dirty: boolean; // Needs recalculation
}

export const FOVSchema = ComponentSchema.define<FOVData>("FOV")
  .field("radius", ComponentType.U8, 8)
  .field("dirty", ComponentType.U8, 1) // 1 = true
  .useAoS()
  .build();

/**
 * Visible cells cache.
 * Uses packed coordinates for efficient storage.
 *
 * Packing: ((x & 0xFFFF) << 16) | (y & 0xFFFF)
 */
export interface VisibleCellsData {
  cells: Uint32Array; // Packed coordinates array
  count: number; // Number of valid cells in array
  centerX: number; // Cache key - X position
  centerY: number; // Cache key - Y position
  radius: number; // Cache key - FOV radius
  version: number; // Cache version for invalidation
}

export const VisibleCellsSchema = ComponentSchema.define<VisibleCellsData>(
  "VisibleCells",
)
  .field("cells", ComponentType.Object, () => new Uint32Array(0))
  .field("count", ComponentType.U32, 0)
  .field("centerX", ComponentType.I32, 0)
  .field("centerY", ComponentType.I32, 0)
  .field("radius", ComponentType.U8, 0)
  .field("version", ComponentType.U32, 0)
  .useAoS()
  .build();

/**
 * Memory component - remembers seen tiles.
 */
export interface MemoryData {
  seenCells: Set<number>; // Packed coordinates
}

export const MemorySchema = ComponentSchema.define<MemoryData>("Memory")
  .field("seenCells", ComponentType.Object, () => new Set<number>())
  .useAoS()
  .build();

/**
 * Pack coordinates into a single number.
 */
export function packCoords(x: number, y: number): number {
  return ((x & 0xffff) << 16) | (y & 0xffff);
}

/**
 * Unpack coordinates from a packed number.
 */
export function unpackCoords(packed: number): { x: number; y: number } {
  const x = (packed >> 16) & 0xffff;
  const y = packed & 0xffff;
  // Handle signed values
  return {
    x: x > 0x7fff ? x - 0x10000 : x,
    y: y > 0x7fff ? y - 0x10000 : y,
  };
}
