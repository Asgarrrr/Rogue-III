/**
 * BSP Partitioning Fragment
 *
 * Standalone BSP space partitioning that can be composed with other algorithms.
 */

import type { Point } from "../core/geometry/types";

/**
 * A node in the BSP tree
 */
export interface BSPNode {
  /** X position of this partition */
  readonly x: number;
  /** Y position of this partition */
  readonly y: number;
  /** Width of this partition */
  readonly width: number;
  /** Height of this partition */
  readonly height: number;
  /** Left/top child after split */
  readonly left: BSPNode | null;
  /** Right/bottom child after split */
  readonly right: BSPNode | null;
  /** Whether this node was split horizontally */
  readonly splitHorizontal?: boolean;
  /** Split position (relative to node origin) */
  readonly splitPosition?: number;
}

/**
 * Configuration for BSP partitioning
 */
export interface PartitionConfig {
  /** Minimum partition size before stopping subdivision */
  readonly minSize: number;
  /** Target split ratio (0.5 = even split) */
  readonly splitRatio: number;
  /** Variance in split ratio for randomness */
  readonly splitVariance: number;
  /** Maximum recursion depth */
  readonly maxDepth?: number;
  /** Aspect ratio threshold for preferring certain split directions */
  readonly aspectRatioThreshold?: number;
}

/**
 * Default partition configuration
 */
export const DEFAULT_PARTITION_CONFIG: Required<PartitionConfig> = {
  minSize: 10,
  splitRatio: 0.5,
  splitVariance: 0.15,
  maxDepth: 10,
  aspectRatioThreshold: 1.25,
};

/**
 * Simple RNG interface
 */
interface RNG {
  next(): number;
}

/**
 * Create a mutable BSP node (internal use)
 */
interface MutableBSPNode {
  x: number;
  y: number;
  width: number;
  height: number;
  left: MutableBSPNode | null;
  right: MutableBSPNode | null;
  splitHorizontal?: boolean;
  splitPosition?: number;
}

/**
 * Partition a rectangular space using BSP algorithm
 *
 * @example
 * ```typescript
 * const root = bspPartition(100, 80, { minSize: 10, splitRatio: 0.5, splitVariance: 0.1 }, rng);
 * const leaves = getBSPLeaves(root);
 * // Each leaf is a potential room location
 * ```
 */
export function bspPartition(
  width: number,
  height: number,
  config: Partial<PartitionConfig>,
  rng: RNG,
): BSPNode {
  const opts = { ...DEFAULT_PARTITION_CONFIG, ...config };

  const root: MutableBSPNode = {
    x: 0,
    y: 0,
    width,
    height,
    left: null,
    right: null,
  };

  splitNode(root, opts, rng, 0);

  return root as BSPNode;
}

/**
 * Recursively split a BSP node
 */
function splitNode(
  node: MutableBSPNode,
  config: Required<PartitionConfig>,
  rng: RNG,
  depth: number,
): void {
  // Stop if too small or max depth reached
  if (depth >= config.maxDepth) return;
  if (node.width < config.minSize * 2 && node.height < config.minSize * 2) {
    return;
  }

  // Decide split direction based on aspect ratio
  const aspectRatio = node.width / node.height;
  let splitHorizontal: boolean;

  if (aspectRatio > config.aspectRatioThreshold) {
    splitHorizontal = false; // Split vertically (wider rooms)
  } else if (1 / aspectRatio > config.aspectRatioThreshold) {
    splitHorizontal = true; // Split horizontally (taller rooms)
  } else {
    splitHorizontal = rng.next() < 0.5;
  }

  // Check if we can split in this direction
  const dimension = splitHorizontal ? node.height : node.width;
  if (dimension < config.minSize * 2) {
    // Try the other direction
    splitHorizontal = !splitHorizontal;
    const otherDimension = splitHorizontal ? node.height : node.width;
    if (otherDimension < config.minSize * 2) {
      return; // Can't split in either direction
    }
  }

  // Calculate split position with variance
  const baseRatio = config.splitRatio;
  const variance = (rng.next() - 0.5) * 2 * config.splitVariance;
  const ratio = Math.max(0.3, Math.min(0.7, baseRatio + variance));

  if (splitHorizontal) {
    const splitY = Math.floor(node.height * ratio);
    if (splitY < config.minSize || node.height - splitY < config.minSize) {
      return;
    }

    node.splitHorizontal = true;
    node.splitPosition = splitY;
    node.left = {
      x: node.x,
      y: node.y,
      width: node.width,
      height: splitY,
      left: null,
      right: null,
    };
    node.right = {
      x: node.x,
      y: node.y + splitY,
      width: node.width,
      height: node.height - splitY,
      left: null,
      right: null,
    };
  } else {
    const splitX = Math.floor(node.width * ratio);
    if (splitX < config.minSize || node.width - splitX < config.minSize) {
      return;
    }

    node.splitHorizontal = false;
    node.splitPosition = splitX;
    node.left = {
      x: node.x,
      y: node.y,
      width: splitX,
      height: node.height,
      left: null,
      right: null,
    };
    node.right = {
      x: node.x + splitX,
      y: node.y,
      width: node.width - splitX,
      height: node.height,
      left: null,
      right: null,
    };
  }

  // Recurse
  splitNode(node.left, config, rng, depth + 1);
  splitNode(node.right, config, rng, depth + 1);
}

/**
 * Get all leaf nodes from a BSP tree
 *
 * Leaves are the terminal partitions where rooms can be placed.
 */
export function getBSPLeaves(root: BSPNode): BSPNode[] {
  const leaves: BSPNode[] = [];
  const stack: BSPNode[] = [root];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) break;

    if (node.left === null && node.right === null) {
      leaves.push(node);
    } else {
      if (node.right) stack.push(node.right);
      if (node.left) stack.push(node.left);
    }
  }

  return leaves;
}

/**
 * Get the depth of a BSP tree
 */
export function getBSPDepth(root: BSPNode): number {
  if (root.left === null && root.right === null) {
    return 0;
  }

  const leftDepth = root.left ? getBSPDepth(root.left) : 0;
  const rightDepth = root.right ? getBSPDepth(root.right) : 0;

  return 1 + Math.max(leftDepth, rightDepth);
}

/**
 * Find sibling pairs at each level of the BSP tree
 *
 * Useful for corridor placement (connect siblings).
 */
export function getBSPSiblingPairs(
  root: BSPNode,
): Array<{ left: BSPNode; right: BSPNode; splitHorizontal: boolean }> {
  const pairs: Array<{
    left: BSPNode;
    right: BSPNode;
    splitHorizontal: boolean;
  }> = [];
  const stack: BSPNode[] = [root];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!node) break;

    if (node.left && node.right) {
      pairs.push({
        left: node.left,
        right: node.right,
        splitHorizontal: node.splitHorizontal ?? false,
      });

      stack.push(node.left);
      stack.push(node.right);
    }
  }

  return pairs;
}

/**
 * Place a room within a BSP partition
 *
 * @param partition - The BSP leaf node
 * @param padding - Minimum padding from partition edges
 * @param minRoomSize - Minimum room dimension
 * @param rng - Random number generator
 * @returns Room bounds or null if room can't fit
 */
export function placeRoomInPartition(
  partition: BSPNode,
  padding: number,
  minRoomSize: number,
  rng: RNG,
): { x: number; y: number; width: number; height: number } | null {
  const maxRoomWidth = partition.width - padding * 2;
  const maxRoomHeight = partition.height - padding * 2;

  if (maxRoomWidth < minRoomSize || maxRoomHeight < minRoomSize) {
    return null;
  }

  // Random room size within bounds
  const roomWidth =
    minRoomSize + Math.floor(rng.next() * (maxRoomWidth - minRoomSize + 1));
  const roomHeight =
    minRoomSize + Math.floor(rng.next() * (maxRoomHeight - minRoomSize + 1));

  // Random position within partition (with padding)
  const maxOffsetX = maxRoomWidth - roomWidth;
  const maxOffsetY = maxRoomHeight - roomHeight;

  const x = partition.x + padding + Math.floor(rng.next() * (maxOffsetX + 1));
  const y = partition.y + padding + Math.floor(rng.next() * (maxOffsetY + 1));

  return { x, y, width: roomWidth, height: roomHeight };
}

/**
 * Get the center point of a BSP node
 */
export function getBSPCenter(node: BSPNode): Point {
  return {
    x: node.x + Math.floor(node.width / 2),
    y: node.y + Math.floor(node.height / 2),
  };
}
