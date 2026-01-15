/**
 * Path RLE Compression Tests
 */

import { describe, expect, it } from "bun:test";
import {
  compressPath,
  decompressPath,
  deserializePathRLE,
  getCompressionStats,
  serializePathRLE,
  validateCompression,
} from "../src/core/compression";
import type { Point } from "../src/core/geometry/types";

describe("compressPath", () => {
  it("handles single point path", () => {
    const path: Point[] = [{ x: 5, y: 5 }];
    const rle = compressPath(path);

    expect(rle.start).toEqual({ x: 5, y: 5 });
    expect(rle.moves).toHaveLength(0);
    expect(rle.originalLength).toBe(1);
  });

  it("compresses straight horizontal path", () => {
    const path: Point[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 4, y: 0 },
    ];
    const rle = compressPath(path);

    expect(rle.start).toEqual({ x: 0, y: 0 });
    expect(rle.moves).toHaveLength(1);
    expect(rle.moves[0]).toEqual({ dir: "E", count: 4 });
  });

  it("compresses straight vertical path", () => {
    const path: Point[] = [
      { x: 0, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: 2 },
      { x: 0, y: 3 },
    ];
    const rle = compressPath(path);

    expect(rle.moves).toHaveLength(1);
    expect(rle.moves[0]).toEqual({ dir: "S", count: 3 });
  });

  it("compresses L-shaped path", () => {
    const path: Point[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
    ];
    const rle = compressPath(path);

    expect(rle.moves).toHaveLength(2);
    expect(rle.moves[0]).toEqual({ dir: "E", count: 2 });
    expect(rle.moves[1]).toEqual({ dir: "S", count: 2 });
  });

  it("compresses diagonal path", () => {
    const path: Point[] = [
      { x: 0, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 3 },
    ];
    const rle = compressPath(path);

    expect(rle.moves).toHaveLength(1);
    expect(rle.moves[0]).toEqual({ dir: "SE", count: 3 });
  });

  it("throws on empty path", () => {
    expect(() => compressPath([])).toThrow("Cannot compress empty path");
  });

  it("throws on invalid step size", () => {
    const path: Point[] = [
      { x: 0, y: 0 },
      { x: 2, y: 0 }, // Jump of 2
    ];
    expect(() => compressPath(path)).toThrow("Invalid step");
  });
});

describe("decompressPath", () => {
  it("decompresses single point", () => {
    const rle = { start: { x: 5, y: 5 }, moves: [], originalLength: 1 };
    const path = decompressPath(rle);

    expect(path).toEqual([{ x: 5, y: 5 }]);
  });

  it("decompresses horizontal path", () => {
    const rle = {
      start: { x: 0, y: 0 },
      moves: [{ dir: "E" as const, count: 4 }],
      originalLength: 5,
    };
    const path = decompressPath(rle);

    expect(path).toHaveLength(5);
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path[4]).toEqual({ x: 4, y: 0 });
  });

  it("decompresses L-shaped path", () => {
    const rle = {
      start: { x: 0, y: 0 },
      moves: [
        { dir: "E" as const, count: 2 },
        { dir: "S" as const, count: 2 },
      ],
      originalLength: 5,
    };
    const path = decompressPath(rle);

    expect(path).toHaveLength(5);
    expect(path[0]).toEqual({ x: 0, y: 0 });
    expect(path[2]).toEqual({ x: 2, y: 0 });
    expect(path[4]).toEqual({ x: 2, y: 2 });
  });
});

describe("roundtrip compression", () => {
  it("preserves straight path", () => {
    const original: Point[] = [];
    for (let i = 0; i < 20; i++) {
      original.push({ x: i, y: 0 });
    }

    const compressed = compressPath(original);
    const decompressed = decompressPath(compressed);

    expect(decompressed).toEqual(original);
    expect(validateCompression(original, compressed)).toBe(true);
  });

  it("preserves zigzag path", () => {
    const original: Point[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 1 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
      { x: 3, y: 2 },
    ];

    const compressed = compressPath(original);
    const decompressed = decompressPath(compressed);

    expect(decompressed).toEqual(original);
  });

  it("preserves complex path", () => {
    const original: Point[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 3, y: 1 },
      { x: 3, y: 2 },
      { x: 2, y: 2 },
      { x: 1, y: 2 },
      { x: 1, y: 3 },
      { x: 1, y: 4 },
    ];

    const compressed = compressPath(original);
    const decompressed = decompressPath(compressed);

    expect(decompressed).toEqual(original);
  });
});

describe("getCompressionStats", () => {
  it("calculates stats for straight path", () => {
    const original: Point[] = [];
    for (let i = 0; i < 50; i++) {
      original.push({ x: i, y: 0 });
    }

    const compressed = compressPath(original);
    const stats = getCompressionStats(original, compressed);

    expect(stats.originalSize).toBe(50);
    expect(stats.compressedSize).toBe(2); // start + 1 move
    expect(stats.moveCount).toBe(1);
    expect(stats.ratio).toBeGreaterThan(10);
    expect(stats.bytesSaved).toBeGreaterThan(0);
  });

  it("calculates stats for zigzag path", () => {
    const original: Point[] = [];
    for (let i = 0; i < 20; i++) {
      original.push({ x: i, y: i % 2 });
    }

    const compressed = compressPath(original);
    const stats = getCompressionStats(original, compressed);

    expect(stats.originalSize).toBe(20);
    // Zigzag has many direction changes
    expect(stats.moveCount).toBeGreaterThan(10);
  });
});

describe("serialization", () => {
  it("serializes and deserializes simple path", () => {
    const rle = {
      start: { x: 10, y: 20 },
      moves: [
        { dir: "E" as const, count: 5 },
        { dir: "S" as const, count: 3 },
      ],
      originalLength: 9,
    };

    const serialized = serializePathRLE(rle);
    const deserialized = deserializePathRLE(serialized);

    expect(deserialized.start).toEqual(rle.start);
    expect(deserialized.moves).toHaveLength(2);
    expect(deserialized.moves[0]?.dir).toBe("E");
    expect(deserialized.moves[0]?.count).toBe(5);
  });

  it("handles empty moves", () => {
    const rle = {
      start: { x: 5, y: 5 },
      moves: [],
      originalLength: 1,
    };

    const serialized = serializePathRLE(rle);
    const deserialized = deserializePathRLE(serialized);

    expect(deserialized.start).toEqual({ x: 5, y: 5 });
    expect(deserialized.moves).toHaveLength(0);
  });

  it("roundtrip preserves data", () => {
    const original: Point[] = [
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 1 },
      { x: 2, y: 2 },
    ];

    const compressed = compressPath(original);
    const serialized = serializePathRLE(compressed);
    const deserialized = deserializePathRLE(serialized);
    const decompressed = decompressPath(deserialized);

    expect(decompressed).toEqual(original);
  });
});
