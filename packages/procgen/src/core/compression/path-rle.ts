/**
 * Path Run-Length Encoding
 *
 * Compresses corridor paths by encoding as direction + count pairs.
 * A 50-point corridor becomes ~5-10 direction commands.
 */

import type { Point } from "../geometry/types";

/**
 * Movement direction
 */
export type Direction = "N" | "NE" | "E" | "SE" | "S" | "SW" | "W" | "NW";

/**
 * Direction vector mapping
 */
const DIRECTION_VECTORS: Readonly<
  Record<Direction, Readonly<[number, number]>>
> = {
  N: [0, -1],
  NE: [1, -1],
  E: [1, 0],
  SE: [1, 1],
  S: [0, 1],
  SW: [-1, 1],
  W: [-1, 0],
  NW: [-1, -1],
} as const;

/**
 * Reverse mapping from vector to direction
 */
const VECTOR_TO_DIRECTION: ReadonlyMap<string, Direction> = new Map([
  ["0,-1", "N"],
  ["1,-1", "NE"],
  ["1,0", "E"],
  ["1,1", "SE"],
  ["0,1", "S"],
  ["-1,1", "SW"],
  ["-1,0", "W"],
  ["-1,-1", "NW"],
]);

/**
 * A single move in the compressed path
 */
export interface PathMove {
  /** Direction of movement */
  readonly dir: Direction;
  /** Number of steps in this direction */
  readonly count: number;
}

/**
 * Run-Length Encoded path representation
 */
export interface PathRLE {
  /** Starting point */
  readonly start: Point;
  /** Sequence of moves */
  readonly moves: readonly PathMove[];
  /** Original path length (for validation) */
  readonly originalLength: number;
}

/**
 * Compress a path using Run-Length Encoding.
 *
 * @param points - Array of path points
 * @returns RLE-encoded path
 * @throws Error if path is empty or has invalid points
 */
export function compressPath(points: readonly Point[]): PathRLE {
  if (points.length === 0) {
    throw new Error("Cannot compress empty path");
  }

  if (points.length === 1) {
    const first = points[0];
    if (!first) throw new Error("Invalid path state");
    return {
      start: { x: first.x, y: first.y },
      moves: [],
      originalLength: 1,
    };
  }

  const first = points[0];
  if (!first) throw new Error("Invalid path state");
  const start: Point = { x: first.x, y: first.y };
  const moves: PathMove[] = [];

  let currentDir: Direction | null = null;
  let count = 0;

  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    if (!prev || !curr) continue;

    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;

    // Validate step size
    if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
      throw new Error(
        `Invalid step at index ${i}: (${dx}, ${dy}) - steps must be at most 1 in each direction`,
      );
    }

    // Skip stationary points
    if (dx === 0 && dy === 0) {
      continue;
    }

    const dir = getDirection(dx, dy);

    if (dir === currentDir) {
      count++;
    } else {
      // Save previous run if exists
      if (currentDir !== null) {
        moves.push({ dir: currentDir, count });
      }
      currentDir = dir;
      count = 1;
    }
  }

  // Don't forget the last run
  if (currentDir !== null) {
    moves.push({ dir: currentDir, count });
  }

  return {
    start,
    moves,
    originalLength: points.length,
  };
}

/**
 * Decompress an RLE path back to points.
 *
 * @param rle - RLE-encoded path
 * @returns Array of path points
 */
export function decompressPath(rle: PathRLE): Point[] {
  const points: Point[] = [{ x: rle.start.x, y: rle.start.y }];

  let x = rle.start.x;
  let y = rle.start.y;

  for (const move of rle.moves) {
    const [dx, dy] = DIRECTION_VECTORS[move.dir];

    for (let i = 0; i < move.count; i++) {
      x += dx;
      y += dy;
      points.push({ x, y });
    }
  }

  return points;
}

/**
 * Get direction from delta values.
 */
function getDirection(dx: number, dy: number): Direction {
  const key = `${dx},${dy}`;
  const dir = VECTOR_TO_DIRECTION.get(key);

  if (!dir) {
    throw new Error(`Invalid direction vector: (${dx}, ${dy})`);
  }

  return dir;
}

/**
 * Calculate compression statistics for a path.
 */
export interface CompressionStats {
  /** Original point count */
  readonly originalSize: number;
  /** Compressed size (start + moves) */
  readonly compressedSize: number;
  /** Number of move commands */
  readonly moveCount: number;
  /** Compression ratio (original / compressed) */
  readonly ratio: number;
  /** Bytes saved (estimated) */
  readonly bytesSaved: number;
}

/**
 * Calculate compression statistics.
 *
 * @param original - Original path
 * @param compressed - Compressed path
 * @returns Compression statistics
 */
export function getCompressionStats(
  original: readonly Point[],
  compressed: PathRLE,
): CompressionStats {
  // Estimate sizes:
  // - Original: 8 bytes per point (2 x 32-bit ints)
  // - Compressed: 8 bytes for start + 2 bytes per move (1 byte dir + 1 byte count)
  const originalBytes = original.length * 8;
  const compressedBytes = 8 + compressed.moves.length * 2;

  return {
    originalSize: original.length,
    compressedSize: 1 + compressed.moves.length, // start + moves
    moveCount: compressed.moves.length,
    ratio: originalBytes / compressedBytes,
    bytesSaved: originalBytes - compressedBytes,
  };
}

/**
 * Validate that compression is lossless.
 *
 * @param original - Original path
 * @param compressed - Compressed path
 * @returns True if decompression produces original path
 */
export function validateCompression(
  original: readonly Point[],
  compressed: PathRLE,
): boolean {
  const decompressed = decompressPath(compressed);

  if (decompressed.length !== original.length) {
    return false;
  }

  for (let i = 0; i < original.length; i++) {
    if (
      decompressed[i]?.x !== original[i]?.x ||
      decompressed[i]?.y !== original[i]?.y
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Serialize PathRLE to a compact string format.
 * Format: "x,y:DIR COUNT;DIR COUNT;..."
 */
export function serializePathRLE(rle: PathRLE): string {
  const movesStr = rle.moves.map((m) => `${m.dir}${m.count}`).join(";");
  return `${rle.start.x},${rle.start.y}:${movesStr}`;
}

/**
 * Deserialize PathRLE from string format.
 */
export function deserializePathRLE(str: string): PathRLE {
  const [startStr, movesStr] = str.split(":");
  if (!startStr) {
    throw new Error("Invalid PathRLE string: missing start");
  }

  const [xStr, yStr] = startStr.split(",");
  if (!xStr || !yStr) {
    throw new Error("Invalid PathRLE string: malformed start coordinates");
  }
  const start: Point = {
    x: parseInt(xStr, 10),
    y: parseInt(yStr, 10),
  };

  const moves: PathMove[] = [];
  if (movesStr && movesStr.length > 0) {
    for (const moveStr of movesStr.split(";")) {
      if (!moveStr) continue;

      const dir = moveStr.slice(0, moveStr.length === 2 ? 1 : 2) as Direction;
      const count = parseInt(moveStr.slice(dir.length), 10);
      moves.push({ dir, count });
    }
  }

  return {
    start,
    moves,
    originalLength: 1 + moves.reduce((sum, m) => sum + m.count, 0),
  };
}
