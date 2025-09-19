import type { Grid } from "./grid";
import {
  CellType,
  DIRECTIONS_4,
  DIRECTIONS_8,
  type FloodFillConfig,
  type Point,
  type Region,
} from "./types";

/**
 * High-performance flood fill implementations using scanline algorithm
 * and optimized data structures to minimize memory allocations.
 */
const DEFAULT_CONFIG: Required<FloodFillConfig> = {
  maxSize: Number.MAX_SAFE_INTEGER,
  targetValue: CellType.FLOOR,
  fillValue: CellType.WALL,
  diagonal: false,
};

// Scanline flood fill - most efficient for large connected areas
function scanlineFill(
  grid: Grid,
  startX: number,
  startY: number,
  config: FloodFillConfig = {},
): Point[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const points: Point[] = [];

  if (
    !grid.isInBounds(startX, startY) ||
    grid.getCell(startX, startY) !== cfg.targetValue
  ) {
    return points;
  }

  const visited = new Set<string>();
  const stack: { x: number; y: number }[] = [{ x: startX, y: startY }];

  while (stack.length > 0 && points.length < cfg.maxSize) {
    const top = stack.pop();
    if (!top) break;
    const { x, y } = top;
    const key = `${x},${y}`;

    if (
      visited.has(key) ||
      !grid.isInBounds(x, y) ||
      grid.getCell(x, y) !== cfg.targetValue
    ) {
      continue;
    }

    // Scanline: find the extent of this horizontal line
    let leftX = x;
    let rightX = x;

    // Extend left
    while (
      leftX > 0 &&
      grid.getCell(leftX - 1, y) === cfg.targetValue &&
      !visited.has(`${leftX - 1},${y}`)
    ) {
      leftX--;
    }

    // Extend right
    while (
      rightX < grid.width - 1 &&
      grid.getCell(rightX + 1, y) === cfg.targetValue &&
      !visited.has(`${rightX + 1},${y}`)
    ) {
      rightX++;
    }

    // Fill the scanline and mark as visited
    for (let scanX = leftX; scanX <= rightX; scanX++) {
      const scanKey = `${scanX},${y}`;
      if (!visited.has(scanKey)) {
        visited.add(scanKey);
        points.push({ x: scanX, y });
        grid.setCell(scanX, y, cfg.fillValue);
      }
    }

    // Check lines above and below for connected areas
    for (const dy of [-1, 1]) {
      const checkY = y + dy;
      if (checkY >= 0 && checkY < grid.height) {
        for (let scanX = leftX; scanX <= rightX; scanX++) {
          if (
            grid.getCell(scanX, checkY) === cfg.targetValue &&
            !visited.has(`${scanX},${checkY}`)
          ) {
            stack.push({ x: scanX, y: checkY });
          }
        }
      }
    }
  }

  return points;
}

// Standard flood fill with 4 or 8 connectivity
function standardFill(
  grid: Grid,
  startX: number,
  startY: number,
  config: FloodFillConfig = {},
): Point[] {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const points: Point[] = [];

  if (
    !grid.isInBounds(startX, startY) ||
    grid.getCell(startX, startY) !== cfg.targetValue
  ) {
    return points;
  }

  const visited = new Set<string>();
  const queue: Point[] = [{ x: startX, y: startY }];
  const directions = cfg.diagonal ? DIRECTIONS_8 : DIRECTIONS_4;

  let queueIndex = 0;
  while (queueIndex < queue.length && points.length < cfg.maxSize) {
    const current = queue[queueIndex++];
    const key = `${current.x},${current.y}`;

    if (visited.has(key)) continue;

    visited.add(key);
    points.push(current);
    grid.setCell(current.x, current.y, cfg.fillValue);

    // Check all neighbors
    for (const dir of directions) {
      const nx = current.x + dir.x;
      const ny = current.y + dir.y;
      const neighborKey = `${nx},${ny}`;

      if (
        !visited.has(neighborKey) &&
        grid.isInBounds(nx, ny) &&
        grid.getCell(nx, ny) === cfg.targetValue
      ) {
        queue.push({ x: nx, y: ny });
      }
    }
  }

  return points;
}

// Find all connected regions without modifying the grid
function findRegions(
  grid: Grid,
  targetType: CellType = CellType.FLOOR,
  minSize: number = 1,
  diagonal: boolean = false,
): Region[] {
  const regions: Region[] = [];
  const width = grid.width;
  const height = grid.height;
  const visited = new Uint8Array(width * height);
  const directions = diagonal ? DIRECTIONS_8 : DIRECTIONS_4;
  const qx = new Int32Array(width * height);
  const qy = new Int32Array(width * height);
  let regionId = 0;

  const idx = (x: number, y: number) => y * width + x;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = idx(x, y);
      if (visited[i] || grid.getCell(x, y) !== targetType) continue;

      let head = 0,
        tail = 0;
      qx[tail] = x;
      qy[tail] = y;
      tail++;
      let minX = x,
        maxX = x,
        minY = y,
        maxY = y;
      const points: Point[] = [];

      while (head < tail) {
        const cx = qx[head];
        const cy = qy[head];
        head++;
        const ci = idx(cx, cy);
        if (visited[ci]) continue;
        visited[ci] = 1;
        points.push({ x: cx, y: cy });
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        for (const d of directions) {
          const nx = cx + d.x;
          const ny = cy + d.y;
          if (
            nx >= 0 &&
            nx < width &&
            ny >= 0 &&
            ny < height &&
            !visited[idx(nx, ny)] &&
            grid.getCell(nx, ny) === targetType
          ) {
            qx[tail] = nx;
            qy[tail] = ny;
            tail++;
          }
        }
      }

      if (points.length >= minSize) {
        regions.push({
          id: regionId++,
          points,
          bounds: { minX, minY, maxX, maxY },
          size: points.length,
        });
      }
    }
  }

  return regions;
}

// Find the largest connected region
function findLargestRegion(
  grid: Grid,
  targetType: CellType = CellType.FLOOR,
  diagonal: boolean = false,
): Region | null {
  const regions = findRegions(grid, targetType, 1, diagonal);

  if (regions.length === 0) return null;

  return regions.reduce((largest, current) =>
    current.size > largest.size ? current : largest,
  );
}

// Check if two points are connected
function areConnected(
  grid: Grid,
  point1: Point,
  point2: Point,
  targetType: CellType = CellType.FLOOR,
  diagonal: boolean = false,
): boolean {
  if (
    grid.getCell(point1.x, point1.y) !== targetType ||
    grid.getCell(point2.x, point2.y) !== targetType
  )
    return false;

  const width = grid.width,
    height = grid.height;
  const visited = new Uint8Array(width * height);
  const qx = new Int32Array(width * height);
  const qy = new Int32Array(width * height);
  const directions = diagonal ? DIRECTIONS_8 : DIRECTIONS_4;
  const idx = (x: number, y: number) => y * width + x;
  let head = 0,
    tail = 0;
  qx[tail] = point1.x;
  qy[tail] = point1.y;
  tail++;

  while (head < tail) {
    const cx = qx[head];
    const cy = qy[head];
    head++;
    const ci = idx(cx, cy);
    if (visited[ci]) continue;
    visited[ci] = 1;
    if (cx === point2.x && cy === point2.y) return true;

    for (const d of directions) {
      const nx = cx + d.x;
      const ny = cy + d.y;
      if (
        nx >= 0 &&
        nx < width &&
        ny >= 0 &&
        ny < height &&
        !visited[idx(nx, ny)] &&
        grid.getCell(nx, ny) === targetType
      ) {
        qx[tail] = nx;
        qy[tail] = ny;
        tail++;
      }
    }
  }

  return false;
}

export const FloodFill = {
  scanlineFill,
  standardFill,
  findRegions,
  findLargestRegion,
  areConnected,
} as const;
