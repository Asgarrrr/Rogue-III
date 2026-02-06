/**
 * Geometry operations unit tests
 */

import { describe, expect, it } from "bun:test";
import {
  bresenhamLine,
  chebyshevDistance,
  distance,
  expandRect,
  manhattanDistance,
  rectCenter,
  rectContains,
  rectContainsPoint,
  rectIntersection,
  rectsOverlap,
} from "../src/core/geometry";
import type { Rect } from "../src/core/geometry/types";

describe("distance functions", () => {
  describe("distance (Euclidean)", () => {
    it("calculates distance between two points", () => {
      expect(distance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(5);
    });

    it("returns 0 for same point", () => {
      expect(distance({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0);
    });
  });

  describe("manhattanDistance", () => {
    it("calculates manhattan distance", () => {
      expect(manhattanDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(7);
    });

    it("returns 0 for same point", () => {
      expect(manhattanDistance({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0);
    });
  });

  describe("chebyshevDistance", () => {
    it("calculates chebyshev (chessboard) distance", () => {
      expect(chebyshevDistance({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(4);
    });

    it("returns 0 for same point", () => {
      expect(chebyshevDistance({ x: 5, y: 5 }, { x: 5, y: 5 })).toBe(0);
    });
  });
});

describe("rect operations", () => {
  describe("rectCenter", () => {
    it("calculates center of rectangle", () => {
      const rect: Rect = { x: 0, y: 0, width: 10, height: 10 };
      const center = rectCenter(rect);
      expect(center.x).toBe(5);
      expect(center.y).toBe(5);
    });

    it("handles odd dimensions", () => {
      const rect: Rect = { x: 0, y: 0, width: 5, height: 5 };
      const center = rectCenter(rect);
      expect(center.x).toBe(2);
      expect(center.y).toBe(2);
    });

    it("handles offset rectangles", () => {
      const rect: Rect = { x: 10, y: 20, width: 6, height: 8 };
      const center = rectCenter(rect);
      expect(center.x).toBe(13);
      expect(center.y).toBe(24);
    });
  });

  describe("rectContains", () => {
    it("returns true when outer contains inner", () => {
      const outer: Rect = { x: 0, y: 0, width: 20, height: 20 };
      const inner: Rect = { x: 5, y: 5, width: 5, height: 5 };
      expect(rectContains(outer, inner)).toBe(true);
    });

    it("returns false when inner extends outside", () => {
      const outer: Rect = { x: 0, y: 0, width: 10, height: 10 };
      const inner: Rect = { x: 5, y: 5, width: 10, height: 10 };
      expect(rectContains(outer, inner)).toBe(false);
    });

    it("returns true when rects are equal", () => {
      const rect: Rect = { x: 5, y: 5, width: 10, height: 10 };
      expect(rectContains(rect, rect)).toBe(true);
    });
  });

  describe("rectContainsPoint", () => {
    it("returns true for point inside rect", () => {
      const rect: Rect = { x: 0, y: 0, width: 10, height: 10 };
      expect(rectContainsPoint(rect, { x: 5, y: 5 })).toBe(true);
    });

    it("returns false for point outside rect", () => {
      const rect: Rect = { x: 0, y: 0, width: 10, height: 10 };
      expect(rectContainsPoint(rect, { x: 15, y: 5 })).toBe(false);
    });

    it("returns true for point on edge", () => {
      const rect: Rect = { x: 0, y: 0, width: 10, height: 10 };
      expect(rectContainsPoint(rect, { x: 0, y: 0 })).toBe(true);
      expect(rectContainsPoint(rect, { x: 9, y: 9 })).toBe(true);
    });
  });

  describe("rectsOverlap", () => {
    it("returns true for overlapping rects", () => {
      const a: Rect = { x: 0, y: 0, width: 10, height: 10 };
      const b: Rect = { x: 5, y: 5, width: 10, height: 10 };
      expect(rectsOverlap(a, b)).toBe(true);
    });

    it("returns false for non-overlapping rects", () => {
      const a: Rect = { x: 0, y: 0, width: 5, height: 5 };
      const b: Rect = { x: 10, y: 10, width: 5, height: 5 };
      expect(rectsOverlap(a, b)).toBe(false);
    });

    it("returns false for adjacent rects (touching edges)", () => {
      const a: Rect = { x: 0, y: 0, width: 5, height: 5 };
      const b: Rect = { x: 5, y: 0, width: 5, height: 5 };
      expect(rectsOverlap(a, b)).toBe(false);
    });
  });

  describe("rectIntersection", () => {
    it("returns intersection of overlapping rects", () => {
      const a: Rect = { x: 0, y: 0, width: 10, height: 10 };
      const b: Rect = { x: 5, y: 5, width: 10, height: 10 };
      const result = rectIntersection(a, b);

      expect(result).not.toBeNull();
      expect(result?.x).toBe(5);
      expect(result?.y).toBe(5);
      expect(result?.width).toBe(5);
      expect(result?.height).toBe(5);
    });

    it("returns null for non-overlapping rects", () => {
      const a: Rect = { x: 0, y: 0, width: 5, height: 5 };
      const b: Rect = { x: 10, y: 10, width: 5, height: 5 };
      expect(rectIntersection(a, b)).toBeNull();
    });
  });

  describe("expandRect", () => {
    it("expands rectangle by amount", () => {
      const rect: Rect = { x: 5, y: 5, width: 10, height: 10 };
      const expanded = expandRect(rect, 2);

      expect(expanded.x).toBe(3);
      expect(expanded.y).toBe(3);
      expect(expanded.width).toBe(14);
      expect(expanded.height).toBe(14);
    });

    it("shrinks rectangle with negative amount", () => {
      const rect: Rect = { x: 5, y: 5, width: 10, height: 10 };
      const shrunk = expandRect(rect, -2);

      expect(shrunk.x).toBe(7);
      expect(shrunk.y).toBe(7);
      expect(shrunk.width).toBe(6);
      expect(shrunk.height).toBe(6);
    });
  });
});

describe("bresenhamLine", () => {
  it("draws horizontal line", () => {
    const points = bresenhamLine({ x: 0, y: 0 }, { x: 5, y: 0 });
    expect(points).toHaveLength(6);
    expect(points[0]).toEqual({ x: 0, y: 0 });
    expect(points[5]).toEqual({ x: 5, y: 0 });
  });

  it("draws vertical line", () => {
    const points = bresenhamLine({ x: 0, y: 0 }, { x: 0, y: 5 });
    expect(points).toHaveLength(6);
    expect(points[0]).toEqual({ x: 0, y: 0 });
    expect(points[5]).toEqual({ x: 0, y: 5 });
  });

  it("draws diagonal line", () => {
    const points = bresenhamLine({ x: 0, y: 0 }, { x: 5, y: 5 });
    expect(points).toHaveLength(6);
    expect(points[0]).toEqual({ x: 0, y: 0 });
    expect(points[5]).toEqual({ x: 5, y: 5 });
  });

  it("draws line in negative direction", () => {
    const points = bresenhamLine({ x: 5, y: 5 }, { x: 0, y: 0 });
    expect(points).toHaveLength(6);
    expect(points[0]).toEqual({ x: 5, y: 5 });
    expect(points[5]).toEqual({ x: 0, y: 0 });
  });

  it("handles single point", () => {
    const points = bresenhamLine({ x: 3, y: 3 }, { x: 3, y: 3 });
    expect(points).toHaveLength(1);
    expect(points[0]).toEqual({ x: 3, y: 3 });
  });

  it("creates continuous path (no gaps)", () => {
    const points = bresenhamLine({ x: 0, y: 0 }, { x: 10, y: 7 });

    // Check that each point is adjacent to the next
    for (let i = 0; i < points.length - 1; i++) {
      const curr = points[i];
      const next = points[i + 1];
      if (!curr || !next) continue;

      const dx = Math.abs(curr.x - next.x);
      const dy = Math.abs(curr.y - next.y);

      // Chebyshev distance should be 1 (8-connected)
      expect(Math.max(dx, dy)).toBe(1);
    }
  });
});
