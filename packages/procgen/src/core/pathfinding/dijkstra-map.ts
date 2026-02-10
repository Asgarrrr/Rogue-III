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
   * Get the path from a point to the nearest goal by following the distance gradient.
   * @param from - Starting point
   * @returns Array of points forming the path to the nearest goal, or empty if unreachable
   */
  getPathToGoal(from: Point): Point[] {
    const path: Point[] = [{ x: from.x, y: from.y }];
    let current = from;
    const maxSteps = this.width * this.height; // Prevent infinite loops

    for (let step = 0; step < maxSteps; step++) {
      const dist = this.get(current.x, current.y);
      if (dist === 0) break; // Reached goal
      if (dist === Infinity) return []; // Unreachable

      const next = this.getDownhillDirection(current.x, current.y);
      if (!next) break;

      current = { x: current.x + next.x, y: current.y + next.y };
      path.push({ x: current.x, y: current.y });
    }

    return path;
  }

  /**
   * Iterate over all cells in the distance map.
   * @param callback - Function called for each cell with (x, y, distance)
   */
  forEach(callback: (x: number, y: number, distance: number) => void): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        callback(x, y, this.get(x, y));
      }
    }
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

/**
 * Typed array based min-heap for better cache performance.
 * Stores x, y, dist in parallel typed arrays.
 */
class TypedMinHeap {
  private x: Uint16Array;
  private y: Uint16Array;
  private dist: Float32Array;
  private size = 0;
  private capacity: number;

  constructor(capacity: number = 1024) {
    this.capacity = capacity;
    this.x = new Uint16Array(capacity);
    this.y = new Uint16Array(capacity);
    this.dist = new Float32Array(capacity);
  }

  get length(): number {
    return this.size;
  }

  push(x: number, y: number, dist: number): void {
    if (this.size >= this.capacity) {
      this.grow();
    }
    const i = this.size++;
    this.x[i] = x;
    this.y[i] = y;
    this.dist[i] = dist;
    this.bubbleUp(i);
  }

  pop(): { x: number; y: number; dist: number } | undefined {
    if (this.size === 0) return undefined;
    const result = { x: this.x[0]!, y: this.y[0]!, dist: this.dist[0]! };
    this.size--;
    if (this.size > 0) {
      this.x[0] = this.x[this.size]!;
      this.y[0] = this.y[this.size]!;
      this.dist[0] = this.dist[this.size]!;
      this.bubbleDown(0);
    }
    return result;
  }

  clear(): void {
    this.size = 0;
  }

  getCapacity(): number {
    return this.capacity;
  }

  private grow(): void {
    this.capacity *= 2;
    const newX = new Uint16Array(this.capacity);
    const newY = new Uint16Array(this.capacity);
    const newDist = new Float32Array(this.capacity);
    newX.set(this.x);
    newY.set(this.y);
    newDist.set(this.dist);
    this.x = newX;
    this.y = newY;
    this.dist = newDist;
  }

  private bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.dist[i]! >= this.dist[parent]!) break;
      this.swap(i, parent);
      i = parent;
    }
  }

  private bubbleDown(i: number): void {
    while (true) {
      const left = 2 * i + 1;
      const right = 2 * i + 2;
      let smallest = i;

      if (left < this.size && this.dist[left]! < this.dist[smallest]!) {
        smallest = left;
      }
      if (right < this.size && this.dist[right]! < this.dist[smallest]!) {
        smallest = right;
      }
      if (smallest === i) break;
      this.swap(i, smallest);
      i = smallest;
    }
  }

  private swap(i: number, j: number): void {
    const x = this.x[i]!;
    const y = this.y[i]!;
    const dist = this.dist[i]!;
    this.x[i] = this.x[j]!;
    this.y[i] = this.y[j]!;
    this.dist[i] = this.dist[j]!;
    this.x[j] = x;
    this.y[j] = y;
    this.dist[j] = dist;
  }
}

const TYPED_HEAP_POOL_MAX = 4;
const TYPED_HEAP_MAX_RETAINED_CAPACITY = 1 << 16;
const typedHeapPool: TypedMinHeap[] = [];

function acquireTypedMinHeap(): TypedMinHeap {
  const heap = typedHeapPool.pop();
  if (heap) return heap;
  return new TypedMinHeap();
}

function releaseTypedMinHeap(heap: TypedMinHeap): void {
  heap.clear();
  if (heap.getCapacity() > TYPED_HEAP_MAX_RETAINED_CAPACITY) {
    return;
  }
  if (typedHeapPool.length < TYPED_HEAP_POOL_MAX) {
    typedHeapPool.push(heap);
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

  // Priority queue using typed array based heap for O(log n) operations.
  const queue = acquireTypedMinHeap();

  try {
    // Initialize goals with distance 0
    for (const goal of goals) {
      if (grid.isInBounds(goal.x, goal.y)) {
        map.set(goal.x, goal.y, 0);
        queue.push(goal.x, goal.y, 0);
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
          queue.push(nx, ny, newDist);
        }
      }
    }

    return map;
  } finally {
    releaseTypedMinHeap(queue);
  }
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
