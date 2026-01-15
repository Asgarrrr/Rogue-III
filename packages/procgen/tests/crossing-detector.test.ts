/**
 * Corridor Crossing Detection Tests
 */

import { describe, expect, it } from "bun:test";
import {
  detectCorridorCrossings,
  validateProgressionIntegrity,
} from "../src/passes/connectivity/crossing-detector";
import type { Connection } from "../src/pipeline/types";

describe("detectCorridorCrossings", () => {
  it("detects no crossings for non-intersecting corridors", () => {
    const connections: Connection[] = [
      {
        fromRoomId: 0,
        toRoomId: 1,
        path: [
          { x: 0, y: 0 },
          { x: 5, y: 0 },
        ],
      },
      {
        fromRoomId: 2,
        toRoomId: 3,
        path: [
          { x: 0, y: 10 },
          { x: 5, y: 10 },
        ],
      },
    ];

    const result = detectCorridorCrossings(connections);

    expect(result.crossings.length).toBe(0);
    expect(result.hasUnintendedShortcuts).toBe(false);
  });

  it("detects crossing for intersecting corridors", () => {
    const connections: Connection[] = [
      // Horizontal corridor
      {
        fromRoomId: 0,
        toRoomId: 1,
        path: [
          { x: 0, y: 5 },
          { x: 1, y: 5 },
          { x: 2, y: 5 },
          { x: 3, y: 5 },
          { x: 4, y: 5 },
          { x: 5, y: 5 },
        ],
      },
      // Vertical corridor crossing the horizontal one
      {
        fromRoomId: 2,
        toRoomId: 3,
        path: [
          { x: 2, y: 0 },
          { x: 2, y: 1 },
          { x: 2, y: 2 },
          { x: 2, y: 3 },
          { x: 2, y: 4 },
          { x: 2, y: 5 },
          { x: 2, y: 6 },
        ],
      },
    ];

    const result = detectCorridorCrossings(connections);

    expect(result.crossings.length).toBe(1);
    expect(result.hasUnintendedShortcuts).toBe(true);
    expect(result.crossings[0]?.intersectionPoints).toContainEqual({
      x: 2,
      y: 5,
    });
  });

  it("ignores crossings between corridors sharing a room", () => {
    const connections: Connection[] = [
      {
        fromRoomId: 0,
        toRoomId: 1,
        path: [
          { x: 5, y: 5 },
          { x: 6, y: 5 },
        ],
      },
      {
        fromRoomId: 1,
        toRoomId: 2,
        path: [
          { x: 5, y: 5 },
          { x: 5, y: 6 },
        ],
      }, // Shares room 1
    ];

    const result = detectCorridorCrossings(connections);

    expect(result.crossings.length).toBe(0);
  });

  it("calculates implicit connections correctly", () => {
    const connections: Connection[] = [
      {
        fromRoomId: 0,
        toRoomId: 1,
        path: [
          { x: 5, y: 0 },
          { x: 5, y: 5 },
        ],
      },
      {
        fromRoomId: 2,
        toRoomId: 3,
        path: [
          { x: 0, y: 5 },
          { x: 5, y: 5 },
          { x: 10, y: 5 },
        ],
      },
    ];

    const result = detectCorridorCrossings(connections);

    expect(result.crossings.length).toBe(1);
    // Rooms 0,1 are now implicitly connected to rooms 2,3
    expect(result.implicitConnectionCount).toBeGreaterThan(0);
  });

  it("builds actual graph including crossings", () => {
    const connections: Connection[] = [
      {
        fromRoomId: 0,
        toRoomId: 1,
        path: [
          { x: 5, y: 0 },
          { x: 5, y: 5 },
        ],
      },
      {
        fromRoomId: 2,
        toRoomId: 3,
        path: [
          { x: 0, y: 5 },
          { x: 5, y: 5 },
          { x: 10, y: 5 },
        ],
      },
    ];

    const result = detectCorridorCrossings(connections);

    // Check that all 4 rooms are now connected
    const graph = result.actualGraph;
    expect(graph.get(0)?.has(1)).toBe(true); // Explicit
    expect(graph.get(2)?.has(3)).toBe(true); // Explicit
    // Implicit connections from crossing
    expect(graph.get(0)?.has(2) || graph.get(0)?.has(3)).toBe(true);
  });

  it("handles multiple crossings", () => {
    // Build full paths so intersections are detected
    const horizontalPath = [];
    for (let x = 0; x <= 10; x++) {
      horizontalPath.push({ x, y: 5 });
    }

    const vertical1Path = [];
    for (let y = 0; y <= 10; y++) {
      vertical1Path.push({ x: 3, y });
    }

    const vertical2Path = [];
    for (let y = 0; y <= 10; y++) {
      vertical2Path.push({ x: 7, y });
    }

    const connections: Connection[] = [
      { fromRoomId: 0, toRoomId: 1, path: horizontalPath },
      { fromRoomId: 2, toRoomId: 3, path: vertical1Path },
      { fromRoomId: 4, toRoomId: 5, path: vertical2Path },
    ];

    const result = detectCorridorCrossings(connections);

    // Should detect 2 crossings (0-1 with 2-3, and 0-1 with 4-5)
    expect(result.crossings.length).toBe(2);
  });
});

describe("validateProgressionIntegrity", () => {
  it("returns valid when no shortcuts exist", () => {
    const intendedGraph = new Map<number, ReadonlySet<number>>([
      [0, new Set([1])],
      [1, new Set([0, 2])],
      [2, new Set([1])],
    ]);

    const result = validateProgressionIntegrity(
      0,
      2,
      intendedGraph,
      intendedGraph,
    );

    expect(result.valid).toBe(true);
    expect(result.shortestPathReduction).toBe(0);
  });

  it("detects invalid shortcuts", () => {
    const intendedGraph = new Map<number, ReadonlySet<number>>([
      [0, new Set([1])],
      [1, new Set([0, 2])],
      [2, new Set([1, 3])],
      [3, new Set([2])],
    ]);

    // Actual graph has shortcut from 0 to 3
    const actualGraph = new Map<number, ReadonlySet<number>>([
      [0, new Set([1, 3])],
      [1, new Set([0, 2])],
      [2, new Set([1, 3])],
      [3, new Set([0, 2])],
    ]);

    const result = validateProgressionIntegrity(
      0,
      3,
      intendedGraph,
      actualGraph,
    );

    expect(result.shortestPathReduction).toBeGreaterThan(1);
    expect(result.valid).toBe(false);
  });

  it("allows minor shortcuts (1 step)", () => {
    const intendedGraph = new Map<number, ReadonlySet<number>>([
      [0, new Set([1])],
      [1, new Set([0, 2])],
      [2, new Set([1])],
    ]);

    // Shortcut that saves only 1 step is allowed
    const actualGraph = new Map<number, ReadonlySet<number>>([
      [0, new Set([1, 2])],
      [1, new Set([0, 2])],
      [2, new Set([0, 1])],
    ]);

    const result = validateProgressionIntegrity(
      0,
      2,
      intendedGraph,
      actualGraph,
    );

    expect(result.valid).toBe(true);
    expect(result.shortestPathReduction).toBe(1);
  });

  it("handles same start and end", () => {
    const graph = new Map<number, ReadonlySet<number>>([
      [0, new Set([1])],
      [1, new Set([0])],
    ]);

    const result = validateProgressionIntegrity(0, 0, graph, graph);

    expect(result.valid).toBe(true);
    expect(result.shortestPathReduction).toBe(0);
  });
});
