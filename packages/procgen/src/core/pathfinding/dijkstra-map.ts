/**
 * Dijkstra Map Implementation
 *
 * Dijkstra maps store the minimum distance from any cell to the nearest goal cell.
 * They enable efficient pathfinding, intelligent spawn placement, and AI behaviors.
 *
 * @see https://www.roguebasin.com/index.php/The_Incredible_Power_of_Dijkstra_Maps
 */

import type { Point } from "../geometry/types";
import type { Grid } from "../grid/grid";
import { CellType } from "../grid/types";

/**
 * A Dijkstra map storing distances from goals.
 *
 * Uses Float32Array for memory efficiency while allowing fractional distances
 * for diagonal movement.
 */
export class DijkstraMap {
  private readonly distances: Float32Array;
  readonly width: number;
  readonly height: number;

  constructor(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.distances = new Float32Array(width * height).fill(Infinity);
  }

  /**
   * Get distance at a position.
   * Returns Infinity for out-of-bounds or unreachable cells.
   */
  get(x: number, y: number): number {
    if (!this.isInBounds(x, y)) return Infinity;
    const value = this.distances[y * this.width + x];
    return value !== undefined ? value : Infinity;
  }

  /**
   * Set distance at a position.
   */
  set(x: number, y: number, value: number): void {
    if (this.isInBounds(x, y)) {
      this.distances[y * this.width + x] = value;
    }
  }

  /**
   * Check if coordinates are within bounds.
   */
  isInBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  /**
   * Get a copy of the raw distance array (safe for external use).
   */
  getRawDataCopy(): Float32Array {
    return new Float32Array(this.distances);
  }

  /**
   * @internal Only for performance-critical internal operations.
   */
  _unsafeGetInternalData(): Float32Array {
    return this.distances;
  }

  /**
   * Find the point with maximum distance (furthest from all goals).
   */
  findFurthestPoint(): { point: Point; distance: number } | null {
    let maxDist = -Infinity;
    let maxPoint: Point | null = null;

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const dist = this.get(x, y);
        if (dist !== Infinity && dist > maxDist) {
          maxDist = dist;
          maxPoint = { x, y };
        }
      }
    }

    return maxPoint ? { point: maxPoint, distance: maxDist } : null;
  }

  /**
   * Get all points within a distance range.
   * Useful for spawning enemies at specific difficulty distances.
   */
  getPointsInRange(minDist: number, maxDist: number): Point[] {
    const points: Point[] = [];

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const dist = this.get(x, y);
        if (dist >= minDist && dist <= maxDist) {
          points.push({ x, y });
        }
      }
    }

    return points;
  }

  /**
   * Get the downhill direction from a point (towards goals).
   * Returns null if already at a goal or unreachable.
   */
  getDownhillDirection(x: number, y: number): Point | null {
    const current = this.get(x, y);
    if (current === 0 || current === Infinity) return null;

    let bestDir: Point | null = null;
    let bestDist = current;

    // Check all 8 directions
    for (const [dx, dy] of DIRECTIONS_8) {
      if (dx === undefined || dy === undefined) continue;
      const nx = x + dx;
      const ny = y + dy;
      const dist = this.get(nx, ny);

      if (dist < bestDist) {
        bestDist = dist;
        bestDir = { x: dx, y: dy };
      }
    }

    return bestDir;
  }

  /**
   * Get the uphill direction from a point (away from goals).
   * Useful for fleeing behavior.
   */
  getUphillDirection(x: number, y: number): Point | null {
    const current = this.get(x, y);
    if (current === Infinity) return null;

    let bestDir: Point | null = null;
    let bestDist = current;

    for (const [dx, dy] of DIRECTIONS_8) {
      if (dx === undefined || dy === undefined) continue;
      const nx = x + dx;
      const ny = y + dy;
      const dist = this.get(nx, ny);

      if (dist !== Infinity && dist > bestDist) {
        bestDist = dist;
        bestDir = { x: dx, y: dy };
      }
    }

    return bestDir;
  }

  /**
   * Calculate statistics about this Dijkstra map.
   */
  getStats(): DijkstraMapStats {
    let min = Infinity;
    let max = -Infinity;
    let sum = 0;
    let count = 0;

    for (let i = 0; i < this.distances.length; i++) {
      const d = this.distances[i];
      if (d !== undefined && d !== Infinity) {
        min = Math.min(min, d);
        max = Math.max(max, d);
        sum += d;
        count++;
      }
    }

    return {
      minDistance: count > 0 ? min : 0,
      maxDistance: count > 0 ? max : 0,
      avgDistance: count > 0 ? sum / count : 0,
      reachableCells: count,
      unreachableCells: this.distances.length - count,
    };
  }
}

/**
 * Statistics about a Dijkstra map
 */
export interface DijkstraMapStats {
  readonly minDistance: number;
  readonly maxDistance: number;
  readonly avgDistance: number;
  readonly reachableCells: number;
  readonly unreachableCells: number;
}

/**
 * 8-directional movement vectors
 */
const DIRECTIONS_8: ReadonlyArray<readonly [number, number]> = [
  [0, -1], // N
  [1, -1], // NE
  [1, 0], // E
  [1, 1], // SE
  [0, 1], // S
  [-1, 1], // SW
  [-1, 0], // W
  [-1, -1], // NW
];

/**
 * 4-directional movement vectors (cardinal only)
 */
const DIRECTIONS_4: ReadonlyArray<readonly [number, number]> = [
  [0, -1], // N
  [1, 0], // E
  [0, 1], // S
  [-1, 0], // W
];

// =============================================================================
// BINARY HEAP PRIORITY QUEUE
// =============================================================================

interface HeapNode {
  x: number;
  y: number;
  dist: number;
}

/**
 * Min-heap priority queue for Dijkstra's algorithm.
 * O(log n) insert and extract-min operations.
 */
class MinHeap {
  private heap: HeapNode[] = [];

  get length(): number {
    return this.heap.length;
  }

  push(node: HeapNode): void {
    this.heap.push(node);
    this.bubbleUp(this.heap.length - 1);
  }

  pop(): HeapNode | undefined {
    if (this.heap.length === 0) return undefined;
    if (this.heap.length === 1) return this.heap.pop();

    const min = this.heap[0];
    const last = this.heap.pop();
    if (last !== undefined && this.heap.length > 0) {
      this.heap[0] = last;
      this.bubbleDown(0);
    }
    return min;
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIdx = (index - 1) >> 1;
      const current = this.heap[index];
      const parent = this.heap[parentIdx];
      if (!current || !parent || current.dist >= parent.dist) break;

      this.heap[index] = parent;
      this.heap[parentIdx] = current;
      index = parentIdx;
    }
  }

  private bubbleDown(index: number): void {
    const length = this.heap.length;

    while (true) {
      const leftIdx = (index << 1) + 1;
      const rightIdx = leftIdx + 1;
      let smallest = index;

      const current = this.heap[smallest];
      const left = this.heap[leftIdx];
      const right = this.heap[rightIdx];

      if (leftIdx < length && left && current && left.dist < current.dist) {
        smallest = leftIdx;
      }

      const smallestNode = this.heap[smallest];
      if (
        rightIdx < length &&
        right &&
        smallestNode &&
        right.dist < smallestNode.dist
      ) {
        smallest = rightIdx;
      }

      if (smallest === index) break;

      const temp = this.heap[index];
      const smallestVal = this.heap[smallest];
      if (temp && smallestVal) {
        this.heap[index] = smallestVal;
        this.heap[smallest] = temp;
      }
      index = smallest;
    }
  }
}

/**
 * Options for Dijkstra map computation
 */
export interface DijkstraMapOptions {
  /** Cell types that are walkable (default: [CellType.FLOOR]) */
  readonly walkable?: readonly CellType[];
  /** Maximum distance to compute (default: Infinity) */
  readonly maxDistance?: number;
  /** Allow diagonal movement (default: true) */
  readonly allowDiagonal?: boolean;
  /** Cost multiplier for diagonal movement (default: 1.414) */
  readonly diagonalCost?: number;
}

const DEFAULT_OPTIONS: Required<DijkstraMapOptions> = {
  walkable: [CellType.FLOOR],
  maxDistance: Infinity,
  allowDiagonal: true,
  diagonalCost: Math.SQRT2,
};

/**
 * Compute a Dijkstra map from one or more goal points.
 *
 * @param grid - The terrain grid
 * @param goals - Goal points (distance 0)
 * @param options - Computation options
 * @returns A Dijkstra map with distances from each cell to nearest goal
 */
export function computeDijkstraMap(
  grid: Grid,
  goals: readonly Point[],
  options: DijkstraMapOptions = {},
): DijkstraMap {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const walkableSet = new Set(opts.walkable);
  const directions = opts.allowDiagonal ? DIRECTIONS_8 : DIRECTIONS_4;

  const map = new DijkstraMap(grid.width, grid.height);

  // Priority queue using binary heap for O(log n) operations
  const queue = new MinHeap();

  // Initialize goals with distance 0
  for (const goal of goals) {
    if (grid.isInBounds(goal.x, goal.y)) {
      map.set(goal.x, goal.y, 0);
      queue.push({ x: goal.x, y: goal.y, dist: 0 });
    }
  }

  // Process queue
  while (queue.length > 0) {
    const current = queue.pop();
    if (!current) break;

    // Skip if we've found a better path
    if (current.dist > map.get(current.x, current.y)) {
      continue;
    }

    // Skip if beyond max distance
    if (current.dist >= opts.maxDistance) {
      continue;
    }

    // Explore neighbors
    for (const [dx, dy] of directions) {
      if (dx === undefined || dy === undefined) continue;
      const nx = current.x + dx;
      const ny = current.y + dy;

      // Check bounds
      if (!grid.isInBounds(nx, ny)) continue;

      // Check walkability
      if (!walkableSet.has(grid.get(nx, ny))) continue;

      // Calculate movement cost
      const isDiagonal = dx !== 0 && dy !== 0;
      const moveCost = isDiagonal ? opts.diagonalCost : 1;
      const newDist = current.dist + moveCost;

      // Update if better path found
      if (newDist < map.get(nx, ny)) {
        map.set(nx, ny, newDist);
        queue.push({ x: nx, y: ny, dist: newDist });
      }
    }
  }

  return map;
}

/**
 * Create a flee map from an existing Dijkstra map.
 *
 * A flee map inverts distances and re-scans to create a map that
 * guides entities away from goals towards exits/safety.
 *
 * @param source - Source Dijkstra map
 * @param multiplier - Inversion multiplier (default: -1.2)
 * @returns A new Dijkstra map for fleeing behavior
 */
export function computeFleeMap(
  source: DijkstraMap,
  multiplier: number = -1.2,
): DijkstraMap {
  const fleeMap = new DijkstraMap(source.width, source.height);
  const srcData = source._unsafeGetInternalData();
  const dstData = fleeMap._unsafeGetInternalData();

  // Invert distances
  for (let i = 0; i < srcData.length; i++) {
    const value = srcData[i];
    if (value !== undefined && value !== Infinity) {
      dstData[i] = value * multiplier;
    }
  }

  // Re-scan to smooth the map
  let changed = true;
  let iterations = 0;
  const maxIterations = Math.max(source.width, source.height) * 2;

  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;

    for (let y = 0; y < source.height; y++) {
      for (let x = 0; x < source.width; x++) {
        const current = fleeMap.get(x, y);
        if (current === Infinity) continue;

        // Find lowest neighbor
        let lowest = current;
        for (const [dx, dy] of DIRECTIONS_4) {
          if (dx === undefined || dy === undefined) continue;
          const neighbor = fleeMap.get(x + dx, y + dy);
          if (neighbor < lowest) {
            lowest = neighbor;
          }
        }

        // If current is more than 1 higher than lowest neighbor, update
        if (current - lowest > 1) {
          fleeMap.set(x, y, lowest + 1);
          changed = true;
        }
      }
    }
  }

  return fleeMap;
}

/**
 * Combine multiple Dijkstra maps with weights.
 * Useful for complex AI that considers multiple goals/threats.
 *
 * @param maps - Array of [map, weight] tuples
 * @returns Combined Dijkstra map
 */
export function combineDijkstraMaps(
  maps: ReadonlyArray<readonly [DijkstraMap, number]>,
): DijkstraMap {
  if (maps.length === 0) {
    throw new Error("Cannot combine empty array of maps");
  }

  const firstEntry = maps[0];
  if (!firstEntry) {
    throw new Error("Cannot combine empty array of maps");
  }
  const [first] = firstEntry;
  const result = new DijkstraMap(first.width, first.height);

  for (let y = 0; y < first.height; y++) {
    for (let x = 0; x < first.width; x++) {
      let sum = 0;
      let hasValue = false;

      for (const [map, weight] of maps) {
        const dist = map.get(x, y);
        if (dist !== Infinity) {
          sum += dist * weight;
          hasValue = true;
        }
      }

      if (hasValue) {
        result.set(x, y, sum);
      }
    }
  }

  return result;
}
