/**
 * BSP Tree Partitioner
 *
 * Recursively divides a rectangular space into smaller partitions
 * using Binary Space Partitioning. Each split alternates between
 * horizontal and vertical directions for balanced results.
 */

import type { SeededRandom } from "../../../core/random/seeded-random";
import {
  type BspPartitionConfig,
  type BspNode,
  type BspLeaf,
  isBspLeaf,
} from "./config";

/**
 * Handles recursive space partitioning for BSP dungeon generation.
 */
export class BspPartitioner {
  constructor(
    private readonly config: BspPartitionConfig,
    private readonly rng: SeededRandom,
  ) {}

  /**
   * Partition the given space into a BSP tree.
   *
   * @param width - Total width of the space
   * @param height - Total height of the space
   * @returns Root node of the BSP tree
   */
  partition(width: number, height: number): BspNode {
    const root: BspNode = {
      x: 0,
      y: 0,
      width,
      height,
      left: null,
      right: null,
      splitDirection: null,
      depth: 0,
    };

    return this.splitNode(root);
  }

  /**
   * Recursively split a node into children.
   */
  private splitNode(node: BspNode): BspNode {
    // Stop if we've reached max depth
    if (node.depth >= this.config.maxDepth) {
      return node;
    }

    // Determine split direction based on aspect ratio
    const splitDirection = this.chooseSplitDirection(node);

    // Check if we can split in the chosen direction
    if (!this.canSplit(node, splitDirection)) {
      // Try the other direction
      const altDirection =
        splitDirection === "horizontal" ? "vertical" : "horizontal";
      if (!this.canSplit(node, altDirection)) {
        // Cannot split in either direction, this is a leaf
        return node;
      }
      // Use alternative direction
      return this.performSplit(node, altDirection);
    }

    return this.performSplit(node, splitDirection);
  }

  /**
   * Choose split direction based on node dimensions.
   * Prefers to split the longer dimension.
   */
  private chooseSplitDirection(
    node: BspNode,
  ): "horizontal" | "vertical" {
    const aspectRatio = node.width / node.height;

    if (aspectRatio > 1.25) {
      // Wider than tall, split vertically
      return "vertical";
    } else if (aspectRatio < 0.8) {
      // Taller than wide, split horizontally
      return "horizontal";
    } else {
      // Roughly square, random choice
      return this.rng.next() > 0.5 ? "horizontal" : "vertical";
    }
  }

  /**
   * Check if a node can be split in the given direction.
   */
  private canSplit(
    node: BspNode,
    direction: "horizontal" | "vertical",
  ): boolean {
    const minSize = this.config.minPartitionSize;

    if (direction === "horizontal") {
      // Need enough height to create two valid children
      return node.height >= minSize * 2;
    } else {
      // Need enough width to create two valid children
      return node.width >= minSize * 2;
    }
  }

  /**
   * Perform the actual split and recurse into children.
   */
  private performSplit(
    node: BspNode,
    direction: "horizontal" | "vertical",
  ): BspNode {
    const { minSplitRatio, maxSplitRatio } = this.config;

    // Calculate split position
    const splitRatio =
      minSplitRatio + this.rng.next() * (maxSplitRatio - minSplitRatio);

    let left: BspNode;
    let right: BspNode;

    if (direction === "horizontal") {
      // Split along Y axis
      const splitY = Math.floor(node.height * splitRatio);

      left = {
        x: node.x,
        y: node.y,
        width: node.width,
        height: splitY,
        left: null,
        right: null,
        splitDirection: null,
        depth: node.depth + 1,
      };

      right = {
        x: node.x,
        y: node.y + splitY,
        width: node.width,
        height: node.height - splitY,
        left: null,
        right: null,
        splitDirection: null,
        depth: node.depth + 1,
      };
    } else {
      // Split along X axis
      const splitX = Math.floor(node.width * splitRatio);

      left = {
        x: node.x,
        y: node.y,
        width: splitX,
        height: node.height,
        left: null,
        right: null,
        splitDirection: null,
        depth: node.depth + 1,
      };

      right = {
        x: node.x + splitX,
        y: node.y,
        width: node.width - splitX,
        height: node.height,
        left: null,
        right: null,
        splitDirection: null,
        depth: node.depth + 1,
      };
    }

    // Recursively split children
    const splitLeft = this.splitNode(left);
    const splitRight = this.splitNode(right);

    return {
      ...node,
      left: splitLeft,
      right: splitRight,
      splitDirection: direction,
    };
  }

  /**
   * Collect all leaf nodes from the BSP tree.
   *
   * @param root - Root of the BSP tree
   * @returns Array of leaf nodes
   */
  collectLeaves(root: BspNode): BspLeaf[] {
    const leaves: BspLeaf[] = [];
    this.collectLeavesRecursive(root, leaves);
    return leaves;
  }

  private collectLeavesRecursive(node: BspNode, leaves: BspLeaf[]): void {
    if (isBspLeaf(node)) {
      leaves.push(node);
    } else {
      if (node.left) {
        this.collectLeavesRecursive(node.left, leaves);
      }
      if (node.right) {
        this.collectLeavesRecursive(node.right, leaves);
      }
    }
  }

  /**
   * Find sibling pairs for corridor connections.
   * Returns pairs of nodes that share a parent (were split from the same partition).
   *
   * @param root - Root of the BSP tree
   * @returns Array of [leftLeaf, rightLeaf] pairs
   */
  findSiblingPairs(root: BspNode): Array<[BspLeaf, BspLeaf]> {
    const pairs: Array<[BspLeaf, BspLeaf]> = [];
    this.findSiblingPairsRecursive(root, pairs);
    return pairs;
  }

  private findSiblingPairsRecursive(
    node: BspNode,
    pairs: Array<[BspLeaf, BspLeaf]>,
  ): BspLeaf | null {
    if (isBspLeaf(node)) {
      return node;
    }

    // Get representative leaves from children
    const leftLeaf = node.left
      ? this.findSiblingPairsRecursive(node.left, pairs)
      : null;
    const rightLeaf = node.right
      ? this.findSiblingPairsRecursive(node.right, pairs)
      : null;

    // Add this pair for connection
    if (leftLeaf && rightLeaf) {
      pairs.push([leftLeaf, rightLeaf]);
    }

    // Return one leaf to represent this subtree
    return leftLeaf || rightLeaf;
  }
}
