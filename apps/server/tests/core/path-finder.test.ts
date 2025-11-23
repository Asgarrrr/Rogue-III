import { describe, expect, test } from "bun:test";
import { CellType, Grid } from "../../src/engine/dungeon/core/grid";
import { RoomImpl } from "../../src/engine/dungeon/entities/room";
import {
  DEFAULT_PATHFINDING_CONFIG,
  PathFinder,
  type PathfindingConfig,
} from "../../src/engine/dungeon/generators/algorithms/cellular/path-finder";

// Helper to create a room at specific position
function createRoom(
  id: number,
  x: number,
  y: number,
  width: number,
  height: number,
): RoomImpl {
  return new RoomImpl({
    id,
    x,
    y,
    width,
    height,
    type: "test",
    seed: id,
  });
}

// Helper to create a grid with floor in specified areas
function createGridWithFloor(
  width: number,
  height: number,
  floorAreas: { x: number; y: number; w: number; h: number }[],
): Grid {
  const grid = new Grid({ width, height }, CellType.WALL);
  // Add floor areas
  for (const area of floorAreas) {
    for (let dy = 0; dy < area.h; dy++) {
      for (let dx = 0; dx < area.w; dx++) {
        grid.setCell(area.x + dx, area.y + dy, CellType.FLOOR);
      }
    }
  }
  return grid;
}

// Helper to check if path is contiguous (each point is 1 step from previous)
function isPathContiguous(
  path: { x: number; y: number }[],
  allowDiagonal: boolean,
): boolean {
  for (let i = 1; i < path.length; i++) {
    const dx = Math.abs(path[i].x - path[i - 1].x);
    const dy = Math.abs(path[i].y - path[i - 1].y);

    if (allowDiagonal) {
      if (dx > 1 || dy > 1) return false;
    } else {
      // Manhattan movement: either dx=1,dy=0 or dx=0,dy=1
      if (
        !(
          (dx === 1 && dy === 0) ||
          (dx === 0 && dy === 1) ||
          (dx === 0 && dy === 0)
        )
      ) {
        return false;
      }
    }
  }
  return true;
}

describe("PathFinder", () => {
  describe("Connectivity Guarantees", () => {
    test("empty rooms array produces no connections", () => {
      const pathFinder = new PathFinder();
      const grid = new Grid({ width: 20, height: 20 });

      const connections = pathFinder.createConnections([], grid);

      expect(connections).toHaveLength(0);
    });

    test("single room produces no connections", () => {
      const pathFinder = new PathFinder();
      const grid = createGridWithFloor(20, 20, [{ x: 5, y: 5, w: 5, h: 5 }]);
      const rooms = [createRoom(0, 5, 5, 5, 5)];

      const connections = pathFinder.createConnections(rooms, grid);

      expect(connections).toHaveLength(0);
    });

    test("two rooms produce at least one connection", () => {
      const pathFinder = new PathFinder();
      const grid = createGridWithFloor(30, 20, [
        { x: 2, y: 5, w: 5, h: 5 },
        { x: 20, y: 5, w: 5, h: 5 },
      ]);
      const rooms = [createRoom(0, 2, 5, 5, 5), createRoom(1, 20, 5, 5, 5)];

      const connections = pathFinder.createConnections(rooms, grid);

      expect(connections.length).toBeGreaterThanOrEqual(1);
    });

    test("MST produces N-1 connections for N rooms (minimum connectivity)", () => {
      const pathFinder = new PathFinder();
      const grid = createGridWithFloor(50, 50, [
        { x: 5, y: 5, w: 5, h: 5 },
        { x: 20, y: 5, w: 5, h: 5 },
        { x: 35, y: 5, w: 5, h: 5 },
        { x: 5, y: 20, w: 5, h: 5 },
        { x: 20, y: 20, w: 5, h: 5 },
      ]);
      const rooms = [
        createRoom(0, 5, 5, 5, 5),
        createRoom(1, 20, 5, 5, 5),
        createRoom(2, 35, 5, 5, 5),
        createRoom(3, 5, 20, 5, 5),
        createRoom(4, 20, 20, 5, 5),
      ];

      const connections = pathFinder.createConnections(rooms, grid);

      // Should have at least N-1 connections (MST) but may have more for redundancy
      expect(connections.length).toBeGreaterThanOrEqual(rooms.length - 1);
    });

    test("all rooms are reachable (graph connectivity)", () => {
      const pathFinder = new PathFinder();
      const grid = createGridWithFloor(40, 40, [
        { x: 5, y: 5, w: 5, h: 5 },
        { x: 25, y: 5, w: 5, h: 5 },
        { x: 5, y: 25, w: 5, h: 5 },
        { x: 25, y: 25, w: 5, h: 5 },
      ]);
      const rooms = [
        createRoom(0, 5, 5, 5, 5),
        createRoom(1, 25, 5, 5, 5),
        createRoom(2, 5, 25, 5, 5),
        createRoom(3, 25, 25, 5, 5),
      ];

      const connections = pathFinder.createConnections(rooms, grid);

      // Build adjacency list
      const adjacency = new Map<number, Set<number>>();
      for (const room of rooms) {
        adjacency.set(room.id, new Set());
      }
      for (const conn of connections) {
        adjacency.get(conn.from.id)?.add(conn.to.id);
        adjacency.get(conn.to.id)?.add(conn.from.id);
      }

      // BFS to check connectivity
      const visited = new Set<number>();
      const queue = [rooms[0].id];
      visited.add(rooms[0].id);

      while (queue.length > 0) {
        const current = queue.shift();
        if (current === undefined) {
          break;
        }

        const neighbors = adjacency.get(current);
        if (!neighbors) {
          continue;
        }

        for (const neighbor of neighbors) {
          if (!visited.has(neighbor)) {
            visited.add(neighbor);
            queue.push(neighbor);
          }
        }
      }

      expect(visited.size).toBe(rooms.length);
    });
  });

  describe("Path Validity", () => {
    test("paths are contiguous (4-directional)", () => {
      const config: PathfindingConfig = {
        ...DEFAULT_PATHFINDING_CONFIG,
        allowDiagonal: false,
        pathSmoothingPasses: 0, // Disable smoothing to test raw path contiguity
      };
      const pathFinder = new PathFinder(config);
      const grid = createGridWithFloor(30, 20, [
        { x: 2, y: 5, w: 5, h: 5 },
        { x: 20, y: 5, w: 5, h: 5 },
      ]);
      const rooms = [createRoom(0, 2, 5, 5, 5), createRoom(1, 20, 5, 5, 5)];

      const connections = pathFinder.createConnections(rooms, grid);

      for (const conn of connections) {
        expect(conn.path.length).toBeGreaterThan(0);
        expect(isPathContiguous(conn.path, false)).toBe(true);
      }
    });

    test("paths start at source room center", () => {
      const pathFinder = new PathFinder();
      const grid = createGridWithFloor(30, 20, [
        { x: 2, y: 5, w: 5, h: 5 },
        { x: 20, y: 5, w: 5, h: 5 },
      ]);
      const rooms = [createRoom(0, 2, 5, 5, 5), createRoom(1, 20, 5, 5, 5)];

      const connections = pathFinder.createConnections(rooms, grid);

      for (const conn of connections) {
        const start = conn.path[0];
        expect(start.x).toBe(conn.from.centerX);
        expect(start.y).toBe(conn.from.centerY);
      }
    });

    test("paths end at destination room center", () => {
      const pathFinder = new PathFinder();
      const grid = createGridWithFloor(30, 20, [
        { x: 2, y: 5, w: 5, h: 5 },
        { x: 20, y: 5, w: 5, h: 5 },
      ]);
      const rooms = [createRoom(0, 2, 5, 5, 5), createRoom(1, 20, 5, 5, 5)];

      const connections = pathFinder.createConnections(rooms, grid);

      for (const conn of connections) {
        const end = conn.path[conn.path.length - 1];
        expect(end.x).toBe(conn.to.centerX);
        expect(end.y).toBe(conn.to.centerY);
      }
    });

    test("paths respect maxPathLength", () => {
      const config: PathfindingConfig = {
        ...DEFAULT_PATHFINDING_CONFIG,
        maxPathLength: 50,
      };
      const pathFinder = new PathFinder(config);
      const grid = createGridWithFloor(60, 20, [
        { x: 2, y: 5, w: 5, h: 5 },
        { x: 50, y: 5, w: 5, h: 5 },
      ]);
      const rooms = [createRoom(0, 2, 5, 5, 5), createRoom(1, 50, 5, 5, 5)];

      const connections = pathFinder.createConnections(rooms, grid);

      for (const conn of connections) {
        expect(conn.path.length).toBeLessThanOrEqual(config.maxPathLength);
      }
    });
  });

  describe("Algorithm Correctness", () => {
    test("A* finds path in open grid", () => {
      const config: PathfindingConfig = {
        ...DEFAULT_PATHFINDING_CONFIG,
        algorithm: "astar",
        preferJPS: false,
      };
      const pathFinder = new PathFinder(config);

      // Create grid with floor everywhere (default is 0 = FLOOR)
      const grid = new Grid({ width: 20, height: 20 });

      // Create adjacent rooms so path is trivial
      const rooms = [
        createRoom(0, 2, 5, 5, 5), // center at (4, 7)
        createRoom(1, 10, 5, 5, 5), // center at (12, 7)
      ];

      const connections = pathFinder.createConnections(rooms, grid);

      expect(connections.length).toBeGreaterThan(0);
      if (connections.length > 0) {
        expect(connections[0].path.length).toBeGreaterThan(0);
      }
    });

    test("Dijkstra finds path in open grid", () => {
      const config: PathfindingConfig = {
        ...DEFAULT_PATHFINDING_CONFIG,
        algorithm: "dijkstra",
      };
      const pathFinder = new PathFinder(config);

      const grid = new Grid({ width: 20, height: 20 });

      const rooms = [createRoom(0, 2, 5, 5, 5), createRoom(1, 10, 5, 5, 5)];

      const connections = pathFinder.createConnections(rooms, grid);

      expect(connections.length).toBeGreaterThan(0);
      if (connections.length > 0) {
        expect(connections[0].path.length).toBeGreaterThan(0);
      }
    });

    test("JPS finds path when preferJPS enabled", () => {
      const config: PathfindingConfig = {
        ...DEFAULT_PATHFINDING_CONFIG,
        preferJPS: true,
        allowDiagonal: false,
      };
      const pathFinder = new PathFinder(config);

      const grid = new Grid({ width: 20, height: 20 });

      const rooms = [createRoom(0, 2, 5, 5, 5), createRoom(1, 10, 5, 5, 5)];

      const connections = pathFinder.createConnections(rooms, grid);

      expect(connections.length).toBeGreaterThan(0);
    });

    test("A* can tunnel through walls", () => {
      const config: PathfindingConfig = {
        ...DEFAULT_PATHFINDING_CONFIG,
        algorithm: "astar",
        preferJPS: false,
        tunnelWallCost: 5,
      };
      const pathFinder = new PathFinder(config);

      // Create grid with rooms separated by wall
      const grid = createGridWithFloor(30, 10, [
        { x: 2, y: 2, w: 5, h: 5 },
        { x: 22, y: 2, w: 5, h: 5 },
      ]);

      const rooms = [createRoom(0, 2, 2, 5, 5), createRoom(1, 22, 2, 5, 5)];

      const connections = pathFinder.createConnections(rooms, grid);

      // Should still find a path by tunneling
      expect(connections.length).toBeGreaterThan(0);
      expect(connections[0].path.length).toBeGreaterThan(0);
    });
  });

  describe("Heuristics", () => {
    test("Manhattan heuristic produces valid path", () => {
      const config: PathfindingConfig = {
        ...DEFAULT_PATHFINDING_CONFIG,
        heuristic: "manhattan",
      };
      const pathFinder = new PathFinder(config);

      const grid = new Grid({ width: 20, height: 20 });

      const rooms = [createRoom(0, 2, 5, 5, 5), createRoom(1, 10, 5, 5, 5)];

      const connections = pathFinder.createConnections(rooms, grid);
      expect(connections.length).toBeGreaterThan(0);
    });

    test("Euclidean heuristic produces valid path", () => {
      const config: PathfindingConfig = {
        ...DEFAULT_PATHFINDING_CONFIG,
        heuristic: "euclidean",
      };
      const pathFinder = new PathFinder(config);

      const grid = new Grid({ width: 20, height: 20 });

      const rooms = [createRoom(0, 2, 5, 5, 5), createRoom(1, 10, 5, 5, 5)];

      const connections = pathFinder.createConnections(rooms, grid);
      expect(connections.length).toBeGreaterThan(0);
    });

    test("Chebyshev heuristic produces valid path", () => {
      const config: PathfindingConfig = {
        ...DEFAULT_PATHFINDING_CONFIG,
        heuristic: "chebyshev",
      };
      const pathFinder = new PathFinder(config);

      const grid = new Grid({ width: 20, height: 20 });

      const rooms = [createRoom(0, 2, 5, 5, 5), createRoom(1, 10, 5, 5, 5)];

      const connections = pathFinder.createConnections(rooms, grid);
      expect(connections.length).toBeGreaterThan(0);
    });
  });

  describe("Path Smoothing", () => {
    test("smoothing reduces waypoints in straight corridors", () => {
      const configNoSmooth: PathfindingConfig = {
        ...DEFAULT_PATHFINDING_CONFIG,
        pathSmoothingPasses: 0,
      };
      const configSmooth: PathfindingConfig = {
        ...DEFAULT_PATHFINDING_CONFIG,
        pathSmoothingPasses: 2,
      };

      const pathFinderNoSmooth = new PathFinder(configNoSmooth);
      const pathFinderSmooth = new PathFinder(configSmooth);

      const grid = new Grid({ width: 30, height: 10 });

      const rooms = [createRoom(0, 2, 2, 5, 5), createRoom(1, 20, 2, 5, 5)];

      const connNoSmooth = pathFinderNoSmooth.createConnections(rooms, grid);
      const connSmooth = pathFinderSmooth.createConnections(rooms, grid);

      // Both should produce valid connections
      expect(connNoSmooth.length).toBeGreaterThan(0);
      expect(connSmooth.length).toBeGreaterThan(0);

      // Smoothed path should have same or fewer points
      expect(connSmooth[0].path.length).toBeLessThanOrEqual(
        connNoSmooth[0].path.length,
      );
    });
  });

  describe("Edge Cases", () => {
    test("handles rooms at grid edges", () => {
      const pathFinder = new PathFinder();
      const grid = createGridWithFloor(30, 20, [
        { x: 0, y: 0, w: 5, h: 5 },
        { x: 25, y: 15, w: 5, h: 5 },
      ]);
      const rooms = [createRoom(0, 0, 0, 5, 5), createRoom(1, 25, 15, 5, 5)];

      const connections = pathFinder.createConnections(rooms, grid);

      expect(connections.length).toBeGreaterThan(0);
    });

    test("handles adjacent rooms", () => {
      const pathFinder = new PathFinder();
      const grid = createGridWithFloor(20, 10, [
        { x: 2, y: 2, w: 5, h: 5 },
        { x: 7, y: 2, w: 5, h: 5 },
      ]);
      const rooms = [createRoom(0, 2, 2, 5, 5), createRoom(1, 7, 2, 5, 5)];

      const connections = pathFinder.createConnections(rooms, grid);

      expect(connections.length).toBeGreaterThan(0);
      // Path should be short for adjacent rooms
      expect(connections[0].path.length).toBeLessThan(10);
    });

    test("handles many rooms efficiently", () => {
      const pathFinder = new PathFinder();

      // Create 10x10 grid of small rooms
      const floorAreas: { x: number; y: number; w: number; h: number }[] = [];
      const rooms: RoomImpl[] = [];

      for (let row = 0; row < 4; row++) {
        for (let col = 0; col < 4; col++) {
          const x = col * 12 + 2;
          const y = row * 12 + 2;
          floorAreas.push({ x, y, w: 5, h: 5 });
          rooms.push(createRoom(row * 4 + col, x, y, 5, 5));
        }
      }

      const grid = createGridWithFloor(50, 50, floorAreas);

      const startTime = performance.now();
      const connections = pathFinder.createConnections(rooms, grid);
      const elapsed = performance.now() - startTime;

      // Should complete in reasonable time
      expect(elapsed).toBeLessThan(1000);

      // Should have at least N-1 connections (MST)
      expect(connections.length).toBeGreaterThanOrEqual(rooms.length - 1);
    });

    test("deterministic for same input", () => {
      const pathFinder = new PathFinder();
      const grid = createGridWithFloor(40, 40, [
        { x: 5, y: 5, w: 5, h: 5 },
        { x: 25, y: 5, w: 5, h: 5 },
        { x: 5, y: 25, w: 5, h: 5 },
        { x: 25, y: 25, w: 5, h: 5 },
      ]);
      const rooms = [
        createRoom(0, 5, 5, 5, 5),
        createRoom(1, 25, 5, 5, 5),
        createRoom(2, 5, 25, 5, 5),
        createRoom(3, 25, 25, 5, 5),
      ];

      const conn1 = pathFinder.createConnections(rooms, grid);
      const conn2 = pathFinder.createConnections(rooms, grid);

      expect(conn1.length).toBe(conn2.length);

      for (let i = 0; i < conn1.length; i++) {
        expect(conn1[i].from.id).toBe(conn2[i].from.id);
        expect(conn1[i].to.id).toBe(conn2[i].to.id);
        expect(conn1[i].path.length).toBe(conn2[i].path.length);
      }
    });
  });
});
