/**
 * Corridor Carving Algorithms
 *
 * Reusable corridor carving passes for different dungeon generators.
 */

import type { Point } from "../../core/geometry/types";
import { MinHeap } from "../../core/data-structures";
import { CellType, type Grid } from "../../core/grid";

/**
 * Style of corridor carving algorithm.
 * - "l-shaped": Creates an L-shaped corridor with one turn (horizontal then vertical or vice versa)
 * - "bresenham": Creates a direct line using Bresenham's line algorithm
 * - "straight": Alias for bresenham
 * - "astar": Uses A* pathfinding to route around existing floor structures
 * - "branching": Creates a corridor that may split into multiple branches
 */
export type CorridorStyle =
  | "l-shaped"
  | "straight"
  | "bresenham"
  | "astar"
  | "branching";

/**
 * Options for corridor carving.
 */
export interface CorridorOptions {
  /** Width of the corridor in cells */
  readonly width: number;
  /** Style of corridor to create */
  readonly style: CorridorStyle;
  /** If false, don't collect path points (saves allocations). Default: true */
  readonly collectPath?: boolean;
  /** A* only: cost for traversing WALL cells. Higher values favor existing floor. Default: 4 */
  readonly astarWallCost?: number;
  /** A* only: cost for traversing FLOOR cells. Lower values make floor reuse more attractive. Default: 1 */
  readonly astarFloorCost?: number;
}

/**
 * Options for branching corridors.
 */
export interface BranchingCorridorOptions extends CorridorOptions {
  /** Random number generator function (returns 0-1) */
  readonly rng: () => number;
  /** Probability of creating a branch (0-1). Default: 0.3 */
  readonly branchProbability?: number;
  /** Maximum number of branches per corridor. Default: 2 */
  readonly maxBranches?: number;
  /** Minimum distance from start before a branch can occur. Default: 5 */
  readonly minBranchDistance?: number;
  /** Length of branch corridors (relative to remaining main length, 0-1). Default: 0.3 */
  readonly branchLengthRatio?: number;
}

/**
 * Carve an L-shaped corridor between two points (fast version, no allocation).
 * Returns the number of cells carved. Use this for internal/hot paths.
 *
 * @param grid - The grid to carve into
 * @param from - Starting point of the corridor
 * @param to - Ending point of the corridor
 * @param width - Width of the corridor in cells
 * @param horizontalFirst - If true, go horizontal then vertical; if false, go vertical then horizontal
 * @returns Number of cells carved
 */
export function carveLShapedCorridorFast(
  grid: Grid,
  from: Point,
  to: Point,
  width: number,
  horizontalFirst: boolean,
): number {
  let pathLength = 0;
  const halfWidth = Math.floor(width / 2);

  if (horizontalFirst) {
    // Horizontal segment first
    const startX = Math.min(from.x, to.x);
    const endX = Math.max(from.x, to.x);
    for (let x = startX; x <= endX; x++) {
      for (let dy = -halfWidth; dy <= halfWidth; dy++) {
        const y = from.y + dy;
        if (grid.isInBounds(x, y)) {
          grid.set(x, y, CellType.FLOOR);
          pathLength++;
        }
      }
    }

    // Vertical segment
    const startY = Math.min(from.y, to.y);
    const endY = Math.max(from.y, to.y);
    for (let y = startY; y <= endY; y++) {
      for (let dx = -halfWidth; dx <= halfWidth; dx++) {
        const x = to.x + dx;
        if (grid.isInBounds(x, y)) {
          grid.set(x, y, CellType.FLOOR);
          pathLength++;
        }
      }
    }
  } else {
    // Vertical segment first
    const startY = Math.min(from.y, to.y);
    const endY = Math.max(from.y, to.y);
    for (let y = startY; y <= endY; y++) {
      for (let dx = -halfWidth; dx <= halfWidth; dx++) {
        const x = from.x + dx;
        if (grid.isInBounds(x, y)) {
          grid.set(x, y, CellType.FLOOR);
          pathLength++;
        }
      }
    }

    // Horizontal segment
    const startX = Math.min(from.x, to.x);
    const endX = Math.max(from.x, to.x);
    for (let x = startX; x <= endX; x++) {
      for (let dy = -halfWidth; dy <= halfWidth; dy++) {
        const y = to.y + dy;
        if (grid.isInBounds(x, y)) {
          grid.set(x, y, CellType.FLOOR);
          pathLength++;
        }
      }
    }
  }

  return pathLength;
}

/**
 * Carve an L-shaped corridor between two points.
 * Creates a corridor that goes in one direction first (horizontal or vertical),
 * then turns 90 degrees to reach the destination. The corridor width is centered
 * on the path.
 *
 * @param grid - The grid to carve into
 * @param from - Starting point of the corridor
 * @param to - Ending point of the corridor
 * @param width - Width of the corridor in cells
 * @param horizontalFirst - If true, go horizontal then vertical; if false, go vertical then horizontal
 * @param collectPath - If true, collect and return carved points (default: true)
 * @returns Array of points that were carved as floor tiles
 * @example
 * ```typescript
 * // Create a 2-cell wide L-shaped corridor from (5,5) to (15,10)
 * const path = carveLShapedCorridor(grid, { x: 5, y: 5 }, { x: 15, y: 10 }, 2, true);
 * console.log(`Carved ${path.length} cells`);
 * ```
 */
export function carveLShapedCorridor(
  grid: Grid,
  from: Point,
  to: Point,
  width: number,
  horizontalFirst: boolean,
  collectPath = true,
): Point[] {
  // Fast path: no allocation needed
  if (!collectPath) {
    carveLShapedCorridorFast(grid, from, to, width, horizontalFirst);
    return [];
  }

  const path: Point[] = [];
  const halfWidth = Math.floor(width / 2);

  if (horizontalFirst) {
    // Horizontal segment first
    const startX = Math.min(from.x, to.x);
    const endX = Math.max(from.x, to.x);
    for (let x = startX; x <= endX; x++) {
      for (let dy = -halfWidth; dy <= halfWidth; dy++) {
        const y = from.y + dy;
        if (grid.isInBounds(x, y)) {
          grid.set(x, y, CellType.FLOOR);
          path.push({ x, y });
        }
      }
    }

    // Vertical segment
    const startY = Math.min(from.y, to.y);
    const endY = Math.max(from.y, to.y);
    for (let y = startY; y <= endY; y++) {
      for (let dx = -halfWidth; dx <= halfWidth; dx++) {
        const x = to.x + dx;
        if (grid.isInBounds(x, y)) {
          grid.set(x, y, CellType.FLOOR);
          path.push({ x, y });
        }
      }
    }
  } else {
    // Vertical segment first
    const startY = Math.min(from.y, to.y);
    const endY = Math.max(from.y, to.y);
    for (let y = startY; y <= endY; y++) {
      for (let dx = -halfWidth; dx <= halfWidth; dx++) {
        const x = from.x + dx;
        if (grid.isInBounds(x, y)) {
          grid.set(x, y, CellType.FLOOR);
          path.push({ x, y });
        }
      }
    }

    // Horizontal segment
    const startX = Math.min(from.x, to.x);
    const endX = Math.max(from.x, to.x);
    for (let x = startX; x <= endX; x++) {
      for (let dy = -halfWidth; dy <= halfWidth; dy++) {
        const y = to.y + dy;
        if (grid.isInBounds(x, y)) {
          grid.set(x, y, CellType.FLOOR);
          path.push({ x, y });
        }
      }
    }
  }

  return path;
}

/**
 * Carve a straight diagonal corridor using Bresenham's line algorithm.
 * Creates a direct line between two points, with the specified width applied
 * perpendicular to the line direction. Uses Bresenham's algorithm for efficient
 * line rasterization.
 *
 * @param grid - The grid to carve into
 * @param from - Starting point of the corridor
 * @param to - Ending point of the corridor
 * @param width - Width of the corridor in cells
 * @returns Array of points that were carved as floor tiles
 * @example
 * ```typescript
 * // Create a 3-cell wide straight corridor from (10,10) to (20,15)
 * const path = carveBresenhamCorridor(grid, { x: 10, y: 10 }, { x: 20, y: 15 }, 3);
 * console.log(`Carved ${path.length} cells`);
 * ```
 */
export function carveBresenhamCorridor(
  grid: Grid,
  from: Point,
  to: Point,
  width: number,
  collectPath = true,
): Point[] {
  const path: Point[] = [];
  const halfWidth = Math.floor(width / 2);

  let x0 = from.x;
  let y0 = from.y;
  const x1 = to.x;
  const y1 = to.y;

  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;

  while (true) {
    // Carve a square around the current point
    for (let dx2 = -halfWidth; dx2 <= halfWidth; dx2++) {
      for (let dy2 = -halfWidth; dy2 <= halfWidth; dy2++) {
        const nx = x0 + dx2;
        const ny = y0 + dy2;
        if (grid.isInBounds(nx, ny)) {
          grid.set(nx, ny, CellType.FLOOR);
          if (collectPath) path.push({ x: nx, y: ny });
        }
      }
    }

    if (x0 === x1 && y0 === y1) break;

    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      y0 += sy;
    }
  }

  return path;
}

/**
 * Carve a corridor using A* pathfinding over the grid.
 * Uses 4-connectivity and deterministic neighbor ordering.
 */
export function carveAStarCorridor(
  grid: Grid,
  from: Point,
  to: Point,
  width: number,
  horizontalFirst = true,
  collectPath = true,
  astarWallCost = 4,
  astarFloorCost = 1,
): Point[] {
  if (!grid.isInBounds(from.x, from.y) || !grid.isInBounds(to.x, to.y)) {
    return [];
  }

  const clampedWallCost = Math.max(1, astarWallCost);
  const clampedFloorCost = Math.max(1, astarFloorCost);

  const widthCells = grid.width;
  const heightCells = grid.height;
  const totalCells = widthCells * heightCells;

  const toIndex = (x: number, y: number) => y * widthCells + x;
  const fromIndex = toIndex(from.x, from.y);
  const goalIndex = toIndex(to.x, to.y);

  if (fromIndex === goalIndex) {
    const singlePointPath = carvePathWithWidth(grid, [from], width, collectPath);
    return singlePointPath;
  }

  const gScore = new Float64Array(totalCells);
  const fScore = new Float64Array(totalCells);
  gScore.fill(Infinity);
  fScore.fill(Infinity);

  const cameFrom = new Int32Array(totalCells);
  cameFrom.fill(-1);

  const closed = new Uint8Array(totalCells);

  const manhattan = (aX: number, aY: number, bX: number, bY: number) =>
    Math.abs(aX - bX) + Math.abs(aY - bY);
  const heuristicForNode = (node: number): number => {
    const x = node % widthCells;
    const y = Math.floor(node / widthCells);
    return manhattan(x, y, to.x, to.y);
  };
  const compareNodes = (a: number, b: number): number => {
    const fA = fScore[a] ?? Infinity;
    const fB = fScore[b] ?? Infinity;
    if (fA !== fB) return fA - fB;

    const hA = heuristicForNode(a);
    const hB = heuristicForNode(b);
    if (hA !== hB) return hA - hB;

    return a - b;
  };
  const openHeap = new MinHeap<number>(compareNodes);

  gScore[fromIndex] = 0;
  fScore[fromIndex] = manhattan(from.x, from.y, to.x, to.y);
  openHeap.push(fromIndex);

  const processNeighbor = (current: number, nx: number, ny: number): void => {
    if (!grid.isInBounds(nx, ny)) return;

    const neighborIndex = toIndex(nx, ny);
    if (closed[neighborIndex] === 1) return;

    const terrainCost =
      grid.getUnsafe(nx, ny) === CellType.WALL ? clampedWallCost : clampedFloorCost;
    const currentScore = gScore[current] ?? Infinity;
    const tentativeG = currentScore + terrainCost;

    const neighborScore = gScore[neighborIndex] ?? Infinity;
    if (tentativeG >= neighborScore) return;

    cameFrom[neighborIndex] = current;
    gScore[neighborIndex] = tentativeG;
    fScore[neighborIndex] = tentativeG + manhattan(nx, ny, to.x, to.y);

    openHeap.push(neighborIndex);
  };

  while (openHeap.size > 0) {
    const current = openHeap.pop();
    if (current === undefined) break;
    if (closed[current] === 1) continue;

    if (current === goalIndex) {
      const reversedPath: Point[] = [];
      let walk = current;
      while (walk !== -1) {
        const x = walk % widthCells;
        const y = Math.floor(walk / widthCells);
        reversedPath.push({ x, y });
        const next = cameFrom[walk];
        walk = next === undefined ? -1 : next;
      }
      reversedPath.reverse();
      return carvePathWithWidth(grid, reversedPath, width, collectPath);
    }

    closed[current] = 1;
    const currentX = current % widthCells;
    const currentY = Math.floor(current / widthCells);
    const stepX = to.x - currentX >= 0 ? 1 : -1;
    const stepY = to.y - currentY >= 0 ? 1 : -1;

    if (horizontalFirst) {
      processNeighbor(current, currentX + stepX, currentY);
      processNeighbor(current, currentX, currentY + stepY);
      processNeighbor(current, currentX - stepX, currentY);
      processNeighbor(current, currentX, currentY - stepY);
    } else {
      processNeighbor(current, currentX, currentY + stepY);
      processNeighbor(current, currentX + stepX, currentY);
      processNeighbor(current, currentX, currentY - stepY);
      processNeighbor(current, currentX - stepX, currentY);
    }
  }

  // Fallback: if pathfinding fails unexpectedly, still connect rooms.
  return carveBresenhamCorridor(grid, from, to, width, collectPath);
}

function carvePathWithWidth(
  grid: Grid,
  path: readonly Point[],
  width: number,
  collectPath: boolean,
): Point[] {
  const carved: Point[] = [];
  const halfWidth = Math.floor(width / 2);

  for (const cell of path) {
    for (let dx = -halfWidth; dx <= halfWidth; dx++) {
      for (let dy = -halfWidth; dy <= halfWidth; dy++) {
        const nx = cell.x + dx;
        const ny = cell.y + dy;
        if (!grid.isInBounds(nx, ny)) continue;
        grid.set(nx, ny, CellType.FLOOR);
        if (collectPath) carved.push({ x: nx, y: ny });
      }
    }
  }

  return carved;
}

/**
 * Carve a corridor using the specified style.
 * Main corridor carving function that delegates to the appropriate algorithm
 * based on the options provided.
 *
 * @param grid - The grid to carve into
 * @param from - Starting point of the corridor
 * @param to - Ending point of the corridor
 * @param options - Configuration options for the corridor
 * @param horizontalFirst - For L-shaped corridors, whether to go horizontal first (default: true)
 * @returns Array of points that were carved as floor tiles
 * @example
 * ```typescript
 * // Create an L-shaped corridor
 * const lPath = carveCorridor(
 *   grid,
 *   { x: 5, y: 5 },
 *   { x: 15, y: 10 },
 *   { width: 2, style: "l-shaped" },
 *   true
 * );
 *
 * // Create a straight corridor
 * const straightPath = carveCorridor(
 *   grid,
 *   { x: 5, y: 5 },
 *   { x: 15, y: 10 },
 *   { width: 1, style: "bresenham" }
 * );
 * ```
 */
export function carveCorridor(
  grid: Grid,
  from: Point,
  to: Point,
  options: CorridorOptions,
  horizontalFirst = true,
): Point[] {
  const collectPath = options.collectPath ?? true;

  switch (options.style) {
    case "l-shaped":
      return carveLShapedCorridor(
        grid,
        from,
        to,
        options.width,
        horizontalFirst,
        collectPath,
      );
    case "bresenham":
    case "straight":
      return carveBresenhamCorridor(grid, from, to, options.width, collectPath);
    case "astar":
      return carveAStarCorridor(
        grid,
        from,
        to,
        options.width,
        horizontalFirst,
        collectPath,
        options.astarWallCost,
        options.astarFloorCost,
      );
    case "branching":
      // Branching requires rng, fall back to l-shaped if not provided
      return carveLShapedCorridor(
        grid,
        from,
        to,
        options.width,
        horizontalFirst,
        collectPath,
      );
    default:
      return carveLShapedCorridor(
        grid,
        from,
        to,
        options.width,
        horizontalFirst,
        collectPath,
      );
  }
}

// =============================================================================
// BRANCHING CORRIDOR
// =============================================================================

/**
 * Result of carving a branching corridor.
 */
export interface BranchingCorridorResult {
  /** Main path from start to end */
  readonly mainPath: Point[];
  /** Branch paths (if any were created) */
  readonly branches: Point[][];
  /** All carved points combined */
  readonly allPoints: Point[];
}

/**
 * Carve a branching corridor that may split into multiple paths.
 * The main corridor always connects from -> to, but branches may extend
 * to create exploration opportunities.
 *
 * @param grid - The grid to carve into
 * @param from - Starting point of the corridor
 * @param to - Ending point of the corridor
 * @param options - Configuration options including RNG for randomization
 * @param horizontalFirst - For the main L-shaped path, whether to go horizontal first
 * @returns Object containing main path, branches, and all carved points
 *
 * @example
 * ```typescript
 * const result = carveBranchingCorridor(
 *   grid,
 *   { x: 5, y: 5 },
 *   { x: 25, y: 15 },
 *   {
 *     width: 1,
 *     style: "branching",
 *     rng: () => seededRandom.next(),
 *     branchProbability: 0.4,
 *     maxBranches: 2,
 *   },
 * );
 * console.log(`Main path: ${result.mainPath.length} cells`);
 * console.log(`Branches: ${result.branches.length}`);
 * ```
 */
export function carveBranchingCorridor(
  grid: Grid,
  from: Point,
  to: Point,
  options: BranchingCorridorOptions,
  horizontalFirst = true,
): BranchingCorridorResult {
  const {
    width,
    rng,
    branchProbability = 0.3,
    maxBranches = 2,
    minBranchDistance = 5,
    branchLengthRatio = 0.3,
    collectPath = true,
  } = options;

  // First, carve the main L-shaped corridor
  const mainPath = carveLShapedCorridor(
    grid,
    from,
    to,
    width,
    horizontalFirst,
    collectPath,
  );

  const branches: Point[][] = [];

  // Only add branches if the corridor is long enough
  if (mainPath.length < minBranchDistance * 2) {
    return {
      mainPath,
      branches: [],
      allPoints: mainPath,
    };
  }

  // Find potential branch points along the main path
  // We'll check points after minBranchDistance and before the end
  const branchableStart = Math.floor(minBranchDistance);
  const branchableEnd = mainPath.length - Math.floor(minBranchDistance);

  let branchesCreated = 0;

  for (let i = branchableStart; i < branchableEnd && branchesCreated < maxBranches; i++) {
    // Check probability for each potential branch point
    if (rng() >= branchProbability) continue;

    const branchPoint = mainPath[i];
    if (!branchPoint) continue;

    // Determine branch direction (perpendicular to main corridor direction)
    // Look at the direction of travel at this point
    const prevPoint = mainPath[i - 1];
    const nextPoint = mainPath[i + 1];
    if (!prevPoint || !nextPoint) continue;

    const dx = nextPoint.x - prevPoint.x;
    const dy = nextPoint.y - prevPoint.y;

    // Branch perpendicular to current direction
    let branchDx: number;
    let branchDy: number;

    if (Math.abs(dx) > Math.abs(dy)) {
      // Moving horizontally, branch vertically
      branchDx = 0;
      branchDy = rng() > 0.5 ? 1 : -1;
    } else {
      // Moving vertically, branch horizontally
      branchDx = rng() > 0.5 ? 1 : -1;
      branchDy = 0;
    }

    // Calculate branch length based on remaining corridor length
    const remainingLength = mainPath.length - i;
    const branchLength = Math.floor(remainingLength * branchLengthRatio);

    if (branchLength < 3) continue;

    // Calculate branch endpoint
    const branchEnd: Point = {
      x: branchPoint.x + branchDx * branchLength,
      y: branchPoint.y + branchDy * branchLength,
    };

    // Check if branch endpoint is valid
    if (!grid.isInBounds(branchEnd.x, branchEnd.y)) continue;

    // Carve the branch using Bresenham for a straight line
    const branchPath = carveBresenhamCorridor(
      grid,
      branchPoint,
      branchEnd,
      width,
      collectPath,
    );

    if (branchPath.length > 0) {
      branches.push(branchPath);
      branchesCreated++;
    }

    // Skip ahead to avoid branches too close together
    i += Math.floor(minBranchDistance / 2);
  }

  // Combine all points
  const allPoints = [...mainPath];
  for (const branch of branches) {
    allPoints.push(...branch);
  }

  return {
    mainPath,
    branches,
    allPoints,
  };
}

/**
 * Check if branching options are provided
 */
export function isBranchingOptions(
  options: CorridorOptions,
): options is BranchingCorridorOptions {
  return (
    options.style === "branching" &&
    "rng" in options &&
    typeof (options as BranchingCorridorOptions).rng === "function"
  );
}

/**
 * Carve a corridor with full options support including branching.
 * This is the most flexible corridor carving function.
 *
 * @param grid - The grid to carve into
 * @param from - Starting point
 * @param to - Ending point
 * @param options - Corridor options (may include branching config)
 * @param horizontalFirst - For L-shaped paths
 * @returns All carved points (for branching, includes main path + all branches)
 */
export function carveCorridorFull(
  grid: Grid,
  from: Point,
  to: Point,
  options: CorridorOptions | BranchingCorridorOptions,
  horizontalFirst = true,
): Point[] {
  if (isBranchingOptions(options)) {
    const result = carveBranchingCorridor(grid, from, to, options, horizontalFirst);
    return result.allPoints;
  }
  return carveCorridor(grid, from, to, options, horizontalFirst);
}
