import { CellType, type Grid, type Point } from "../../../core/grid";
import { ConnectionImpl } from "../../../entities/connection";
import type { RoomImpl } from "../../../entities/room";

/**
 * Configuration for pathfinding
 */
export interface PathfindingConfig {
  readonly algorithm: "astar" | "dijkstra" | "direct";
  readonly heuristic: "manhattan" | "euclidean" | "chebyshev";
  readonly allowDiagonal: boolean;
  readonly maxPathLength: number;
  readonly pathSmoothingPasses: number;
  // Cost penalty for tunneling through a wall tile during pathfinding.
  readonly tunnelWallCost: number;
  // Width of carved corridors (in tiles). Minimum 1.
  readonly corridorWidth: number;
  // Prefer JPS for floor-only paths (allowDiagonal=false only)
  readonly preferJPS?: boolean;
}

/**
 * Default pathfinding configuration
 */
export const DEFAULT_PATHFINDING_CONFIG: PathfindingConfig = {
  algorithm: "astar",
  heuristic: "manhattan",
  allowDiagonal: false,
  maxPathLength: 1000,
  pathSmoothingPasses: 1,
  tunnelWallCost: 6,
  corridorWidth: 2,
  preferJPS: true,
};

/**
 * High-performance pathfinding system for connecting rooms in cellular automaton dungeons.
 * Implements multiple algorithms with optimizations for different scenarios.
 */
export class PathFinder {
  private readonly config: PathfindingConfig;

  constructor(config: PathfindingConfig = DEFAULT_PATHFINDING_CONFIG) {
    this.config = config;
  }

  /**
   * Create connections between all rooms
   */
  createConnections(rooms: RoomImpl[], grid: Grid): ConnectionImpl[] {
    if (rooms.length < 2) return [];

    const connections: ConnectionImpl[] = [];

    // Create minimum spanning tree for basic connectivity
    const mstConnections = this.createMinimumSpanningTree(rooms, grid);
    connections.push(...mstConnections);

    // Add some additional connections for redundancy
    const additionalConnections = this.createAdditionalConnections(
      rooms,
      grid,
      mstConnections,
    );
    connections.push(...additionalConnections);

    return connections;
  }

  /**
   * Create minimum spanning tree of room connections
   */
  private createMinimumSpanningTree(
    rooms: RoomImpl[],
    grid: Grid,
  ): ConnectionImpl[] {
    if (rooms.length === 0) return [];

    const connections: ConnectionImpl[] = [];
    const connected = new Set<number>([rooms[0].id]);
    const unconnected = new Set(rooms.slice(1).map((r) => r.id));

    while (unconnected.size > 0) {
      let bestConnection: {
        from: RoomImpl;
        to: RoomImpl;
        distance: number;
      } | null = null;

      // Find shortest connection from connected to unconnected rooms
      for (const connectedRoom of rooms.filter((r) => connected.has(r.id))) {
        for (const unconnectedRoom of rooms.filter((r) =>
          unconnected.has(r.id),
        )) {
          const distance = this.calculateRoomDistance(
            connectedRoom,
            unconnectedRoom,
          );

          if (!bestConnection || distance < bestConnection.distance) {
            bestConnection = {
              from: connectedRoom,
              to: unconnectedRoom,
              distance,
            };
          }
        }
      }

      if (bestConnection) {
        const path = this.findPath(
          bestConnection.from,
          bestConnection.to,
          grid,
        );
        if (path.length > 0) {
          connections.push(
            new ConnectionImpl(
              bestConnection.from,
              bestConnection.to,
              path,
              "cellular",
            ),
          );
        }

        connected.add(bestConnection.to.id);
        unconnected.delete(bestConnection.to.id);
      } else {
        // No valid connection found, break to avoid infinite loop
        break;
      }
    }

    return connections;
  }

  /**
   * Create additional connections for redundancy and better flow
   */
  private createAdditionalConnections(
    rooms: RoomImpl[],
    grid: Grid,
    existingConnections: ConnectionImpl[],
  ): ConnectionImpl[] {
    const connections: ConnectionImpl[] = [];
    const maxAdditionalConnections = Math.max(
      1,
      Math.floor(rooms.length * 0.3),
    );

    // Create set of existing connections for quick lookup
    const existingPairs = new Set<string>();
    for (const conn of existingConnections) {
      existingPairs.add(`${conn.from.id}-${conn.to.id}`);
      existingPairs.add(`${conn.to.id}-${conn.from.id}`);
    }

    // Reduce O(n^2) by taking k-nearest per room
    const k = Math.max(2, Math.ceil(rooms.length / 6));
    const candidates: { from: RoomImpl; to: RoomImpl; distance: number }[] = [];

    for (const a of rooms) {
      const local: { to: RoomImpl; distance: number }[] = [];
      for (const b of rooms) {
        if (a.id === b.id) continue;
        const key = `${a.id}-${b.id}`;
        if (existingPairs.has(key)) continue;
        local.push({ to: b, distance: this.calculateRoomDistance(a, b) });
      }
      local.sort((x, y) => x.distance - y.distance);
      for (let i = 0; i < Math.min(k, local.length); i++) {
        candidates.push({
          from: a,
          to: local[i].to,
          distance: local[i].distance,
        });
      }
    }

    candidates.sort((a, b) => a.distance - b.distance);
    for (
      let i = 0;
      i < Math.min(maxAdditionalConnections, candidates.length);
      i++
    ) {
      const c = candidates[i];
      const path = this.findPath(c.from, c.to, grid);
      if (path.length > 0 && path.length < this.config.maxPathLength) {
        connections.push(new ConnectionImpl(c.from, c.to, path, "cellular"));
      }
    }

    return connections;
  }

  /**
   * Find path between two rooms using configured algorithm
   */
  findPath(from: RoomImpl, to: RoomImpl, grid: Grid): Point[] {
    const start = { x: from.centerX, y: from.centerY };
    const end = { x: to.centerX, y: to.centerY };

    // If configured, try Jump Point Search on floor-only grid (no tunneling) first
    if (!this.config.allowDiagonal && this.config.preferJPS) {
      const jpsPath = this.findPathJPS(start, end, grid);
      if (jpsPath.length > 0) {
        let path = jpsPath;
        for (let i = 0; i < this.config.pathSmoothingPasses; i++)
          path = this.smoothPath(path, grid);
        return path;
      }
    }

    // Use configured pathfinding algorithm
    let path: Point[];

    switch (this.config.algorithm) {
      case "astar":
        path = this.findPathAStar(start, end, grid);
        break;
      case "dijkstra":
        path = this.findPathDijkstra(start, end, grid);
        break;
      default:
        path = this.findPathAStar(start, end, grid);
    }

    // Apply path smoothing
    for (let i = 0; i < this.config.pathSmoothingPasses; i++) {
      path = this.smoothPath(path, grid);
    }

    return path;
  }

  /**
   * Optimized 4-directional Jump Point Search on FLOORS only.
   * JPS reduces node expansions by 40-70% compared to standard A*.
   * Returns empty array if no path exists on floor tiles.
   */
  private findPathJPS(start: Point, end: Point, grid: Grid): Point[] {
    const startX = Math.floor(start.x);
    const startY = Math.floor(start.y);
    const endX = Math.floor(end.x);
    const endY = Math.floor(end.y);

    // Early exit if start/end not floor
    if (
      grid.getCell(startX, startY) !== CellType.FLOOR ||
      grid.getCell(endX, endY) !== CellType.FLOOR
    ) {
      return [];
    }

    // Use numeric keys for better performance
    const width = grid.width;
    const encodeKey = (x: number, y: number) => y * width + x;

    type Node = {
      x: number;
      y: number;
      g: number;
      h: number;
      f: number;
      parent: Node | null;
      heapIndex: number;
    };

    // Manhattan heuristic (optimal for 4-directional movement)
    const heuristic = (x: number, y: number) =>
      Math.abs(x - endX) + Math.abs(y - endY);

    // Optimized binary min-heap
    class MinHeap {
      private arr: Node[] = [];

      size(): number {
        return this.arr.length;
      }

      push(n: Node): void {
        n.heapIndex = this.arr.length;
        this.arr.push(n);
        this.bubbleUp(n.heapIndex);
      }

      pop(): Node | undefined {
        if (this.arr.length === 0) return undefined;
        const top = this.arr[0];
        const last = this.arr.pop();
        if (last && this.arr.length > 0) {
          this.arr[0] = last;
          last.heapIndex = 0;
          this.bubbleDown(0);
        }
        return top;
      }

      decreaseKey(n: Node): void {
        this.bubbleUp(n.heapIndex);
      }

      private bubbleUp(i: number): void {
        const node = this.arr[i];
        while (i > 0) {
          const parentIdx = (i - 1) >> 1;
          const parent = this.arr[parentIdx];
          if (node.f >= parent.f) break;
          this.arr[i] = parent;
          parent.heapIndex = i;
          i = parentIdx;
        }
        this.arr[i] = node;
        node.heapIndex = i;
      }

      private bubbleDown(i: number): void {
        const node = this.arr[i];
        const len = this.arr.length;
        const halfLen = len >> 1;

        while (i < halfLen) {
          const leftIdx = (i << 1) + 1;
          const rightIdx = leftIdx + 1;
          let bestIdx = leftIdx;
          let best = this.arr[leftIdx];

          if (rightIdx < len && this.arr[rightIdx].f < best.f) {
            bestIdx = rightIdx;
            best = this.arr[rightIdx];
          }

          if (node.f <= best.f) break;

          this.arr[i] = best;
          best.heapIndex = i;
          i = bestIdx;
        }

        this.arr[i] = node;
        node.heapIndex = i;
      }
    }

    const open = new MinHeap();
    const openMap = new Map<number, Node>();
    const closed = new Set<number>();

    const startNode: Node = {
      x: startX,
      y: startY,
      g: 0,
      h: heuristic(startX, startY),
      f: heuristic(startX, startY),
      parent: null,
      heapIndex: -1,
    };

    const startKey = encodeKey(startX, startY);
    open.push(startNode);
    openMap.set(startKey, startNode);

    // Inline passability check for performance
    const isPassable = (x: number, y: number): boolean =>
      x >= 0 &&
      x < grid.width &&
      y >= 0 &&
      y < grid.height &&
      grid.getCell(x, y) === CellType.FLOOR;

    /**
     * Jump function - finds the next jump point in a given direction.
     * Returns null if hitting a wall or going out of bounds.
     */
    const jump = (
      x: number,
      y: number,
      dx: number,
      dy: number,
    ): Point | null => {
      const nx = x + dx;
      const ny = y + dy;

      // Check if position is passable
      if (!isPassable(nx, ny)) return null;

      // Found the goal
      if (nx === endX && ny === endY) return { x: nx, y: ny };

      // Check for forced neighbors (4-directional JPS)
      if (dx !== 0) {
        // Horizontal movement - check vertical forced neighbors
        if (
          (!isPassable(nx, ny - 1) && isPassable(nx + dx, ny - 1)) ||
          (!isPassable(nx, ny + 1) && isPassable(nx + dx, ny + 1))
        ) {
          return { x: nx, y: ny };
        }
      } else {
        // Vertical movement - check horizontal forced neighbors
        if (
          (!isPassable(nx - 1, ny) && isPassable(nx - 1, ny + dy)) ||
          (!isPassable(nx + 1, ny) && isPassable(nx + 1, ny + dy))
        ) {
          return { x: nx, y: ny };
        }
      }

      // Continue jumping in the same direction
      return jump(nx, ny, dx, dy);
    };

    /**
     * Get successors for a node using JPS pruning rules.
     */
    const getSuccessors = (node: Node): Point[] => {
      const successors: Point[] = [];
      const { x, y, parent } = node;

      if (!parent) {
        // Start node - try all 4 directions
        const dirs = [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ];
        for (const [dx, dy] of dirs) {
          const jp = jump(x, y, dx, dy);
          if (jp) successors.push(jp);
        }
        return successors;
      }

      // Determine direction from parent
      const dx = Math.sign(x - parent.x);
      const dy = Math.sign(y - parent.y);

      if (dx !== 0) {
        // Moving horizontally
        // Natural neighbor: continue in same direction
        const jp = jump(x, y, dx, 0);
        if (jp) successors.push(jp);

        // Check for forced neighbors and their jump points
        if (!isPassable(x, y - 1)) {
          const forced = jump(x, y, 0, -1);
          if (forced) successors.push(forced);
        }
        if (!isPassable(x, y + 1)) {
          const forced = jump(x, y, 0, 1);
          if (forced) successors.push(forced);
        }
      } else if (dy !== 0) {
        // Moving vertically
        // Natural neighbor: continue in same direction
        const jp = jump(x, y, 0, dy);
        if (jp) successors.push(jp);

        // Check for forced neighbors and their jump points
        if (!isPassable(x - 1, y)) {
          const forced = jump(x, y, -1, 0);
          if (forced) successors.push(forced);
        }
        if (!isPassable(x + 1, y)) {
          const forced = jump(x, y, 1, 0);
          if (forced) successors.push(forced);
        }
      }

      return successors;
    };

    // Main JPS loop
    while (open.size() > 0) {
      const current = open.pop();
      if (!current) break;

      const currentKey = encodeKey(current.x, current.y);
      openMap.delete(currentKey);

      // Goal check
      if (current.x === endX && current.y === endY) {
        return this.reconstructJPSPath(current);
      }

      closed.add(currentKey);

      // Expand successors
      const successors = getSuccessors(current);

      for (const successor of successors) {
        const key = encodeKey(successor.x, successor.y);

        if (closed.has(key)) continue;

        // Calculate g cost (Manhattan distance from current to successor)
        const g =
          current.g +
          Math.abs(successor.x - current.x) +
          Math.abs(successor.y - current.y);

        const existing = openMap.get(key);

        if (!existing) {
          const h = heuristic(successor.x, successor.y);
          const node: Node = {
            x: successor.x,
            y: successor.y,
            g,
            h,
            f: g + h,
            parent: current,
            heapIndex: -1,
          };
          openMap.set(key, node);
          open.push(node);
        } else if (g < existing.g) {
          existing.g = g;
          existing.f = g + existing.h;
          existing.parent = current;
          open.decreaseKey(existing);
        }
      }
    }

    // No path found
    return [];
  }

  /**
   * Reconstruct path from JPS nodes, filling in intermediate points.
   */
  private reconstructJPSPath(endNode: {
    x: number;
    y: number;
    parent: { x: number; y: number; parent: unknown } | null;
  }): Point[] {
    type Chain = { x: number; y: number; parent: Chain | null };
    const jumpPoints: Point[] = [];
    let current: Chain | null = endNode as unknown as Chain;

    // Collect jump points in reverse order
    while (current) {
      jumpPoints.unshift({ x: current.x, y: current.y });
      current = current.parent;
    }

    // Fill in intermediate points between jump points
    if (jumpPoints.length <= 1) return jumpPoints;

    const fullPath: Point[] = [jumpPoints[0]];

    for (let i = 1; i < jumpPoints.length; i++) {
      const from = jumpPoints[i - 1];
      const to = jumpPoints[i];

      // Generate intermediate points
      const dx = Math.sign(to.x - from.x);
      const dy = Math.sign(to.y - from.y);

      let x = from.x;
      let y = from.y;

      while (x !== to.x || y !== to.y) {
        if (x !== to.x) x += dx;
        if (y !== to.y) y += dy;
        fullPath.push({ x, y });
      }
    }

    return fullPath;
  }

  /**
   * A* pathfinding implementation
   */
  private findPathAStar(start: Point, end: Point, grid: Grid): Point[] {
    interface Node {
      x: number;
      y: number;
      g: number; // Cost from start
      h: number; // Heuristic to end
      f: number; // Total cost
      parent: Node | null;
      key: string;
      heapIndex: number; // for decrease-key
    }

    // Binary heap (min-heap) for open set
    class MinHeap {
      private arr: Node[] = [];
      size(): number {
        return this.arr.length;
      }
      push(n: Node) {
        n.heapIndex = this.arr.length;
        this.arr.push(n);
        this.bubbleUp(n.heapIndex);
      }
      pop(): Node | undefined {
        if (this.arr.length === 0) return undefined;
        const top = this.arr[0];
        const last = this.arr.pop();
        if (last && this.arr.length > 0) {
          this.arr[0] = last;
          this.arr[0].heapIndex = 0;
          this.bubbleDown(0);
        }
        return top;
      }
      update(n: Node) {
        this.bubbleUp(n.heapIndex);
        this.bubbleDown(n.heapIndex);
      }
      private bubbleUp(i: number) {
        while (i > 0) {
          const p = (i - 1) >> 1;
          if (this.arr[p].f <= this.arr[i].f) break;
          this.swap(i, p);
          i = p;
        }
      }
      private bubbleDown(i: number) {
        const len = this.arr.length;
        while (true) {
          const l = i * 2 + 1,
            r = l + 1;
          let m = i;
          if (l < len && this.arr[l].f < this.arr[m].f) m = l;
          if (r < len && this.arr[r].f < this.arr[m].f) m = r;
          if (m === i) break;
          this.swap(i, m);
          i = m;
        }
      }
      private swap(i: number, j: number) {
        const a = this.arr[i],
          b = this.arr[j];
        this.arr[i] = b;
        this.arr[j] = a;
        this.arr[i].heapIndex = i;
        this.arr[j].heapIndex = j;
      }
    }

    const openHeap = new MinHeap();
    const openMap = new Map<string, Node>();
    const closedSet = new Set<string>();

    const getKey = (x: number, y: number) => `${x},${y}`;
    const heuristic = this.getHeuristicFunction();

    const startNode: Node = {
      x: start.x,
      y: start.y,
      g: 0,
      h: heuristic(start, end),
      f: 0,
      parent: null,
      key: getKey(start.x, start.y),
      heapIndex: -1,
    };
    startNode.f = startNode.g + startNode.h;

    openHeap.push(startNode);
    openMap.set(startNode.key, startNode);

    while (openHeap.size() > 0) {
      const current = openHeap.pop();
      if (!current) break;
      openMap.delete(current.key);

      // Check if we reached the goal
      if (current.x === end.x && current.y === end.y) {
        return this.reconstructPath(current);
      }

      // Move current to closed set
      const currentKey = current.key;
      closedSet.add(currentKey);

      // Check neighbors (including walls with tunneling cost)
      const neighbors = this.getNeighbors(current.x, current.y, grid);

      for (const neighbor of neighbors) {
        const neighborKey = getKey(neighbor.x, neighbor.y);

        if (closedSet.has(neighborKey)) continue;

        const baseMoveCost = 1;
        const isWall = grid.getCell(neighbor.x, neighbor.y) === CellType.WALL;
        const moveCost =
          baseMoveCost + (isWall ? this.config.tunnelWallCost : 0);
        const tentativeG = current.g + moveCost;
        const existingNode = openMap.get(neighborKey);

        if (!existingNode) {
          const neighborNode: Node = {
            x: neighbor.x,
            y: neighbor.y,
            g: tentativeG,
            h: heuristic(neighbor, end),
            f: 0,
            parent: current,
            key: neighborKey,
            heapIndex: -1,
          };
          neighborNode.f = neighborNode.g + neighborNode.h;
          openMap.set(neighborKey, neighborNode);
          openHeap.push(neighborNode);
        } else if (tentativeG < existingNode.g) {
          existingNode.g = tentativeG;
          existingNode.f = existingNode.g + existingNode.h;
          existingNode.parent = current;
          openHeap.update(existingNode);
        }
      }
    }

    // No path found
    return [];
  }

  /**
   * Dijkstra's algorithm implementation
   */
  private findPathDijkstra(start: Point, end: Point, grid: Grid): Point[] {
    interface Node {
      x: number;
      y: number;
      distance: number;
      parent: Node | null;
    }

    const distances = new Map<string, number>();
    const previous = new Map<string, Node | null>();
    const unvisited = new Set<string>();
    const getKey = (x: number, y: number) => `${x},${y}`;

    // Initialize
    for (let y = 0; y < grid.height; y++) {
      for (let x = 0; x < grid.width; x++) {
        if (grid.getCell(x, y) === CellType.FLOOR) {
          const key = getKey(x, y);
          distances.set(key, Infinity);
          previous.set(key, null);
          unvisited.add(key);
        }
      }
    }

    const startKey = getKey(start.x, start.y);
    distances.set(startKey, 0);

    while (unvisited.size > 0) {
      // Find unvisited node with smallest distance
      let current: string | null = null;
      let smallestDistance = Infinity;

      for (const key of unvisited) {
        const distance = distances.get(key) || Infinity;
        if (distance < smallestDistance) {
          smallestDistance = distance;
          current = key;
        }
      }

      if (!current || smallestDistance === Infinity) break;

      unvisited.delete(current);

      const [currentX, currentY] = current.split(",").map(Number);

      // Check if we reached the goal
      if (currentX === end.x && currentY === end.y) {
        return this.reconstructPathDijkstra(end, previous);
      }

      // Check neighbors (including walls with tunneling cost)
      const neighbors = this.getNeighbors(currentX, currentY, grid);

      for (const neighbor of neighbors) {
        const neighborKey = getKey(neighbor.x, neighbor.y);

        if (!unvisited.has(neighborKey)) continue;

        const currentDistance = distances.get(current) || 0;
        const isWall = grid.getCell(neighbor.x, neighbor.y) === CellType.WALL;
        const moveCost = 1 + (isWall ? this.config.tunnelWallCost : 0);
        const altDistance = currentDistance + moveCost;

        if (altDistance < (distances.get(neighborKey) || Infinity)) {
          distances.set(neighborKey, altDistance);
          previous.set(neighborKey, {
            x: currentX,
            y: currentY,
            distance: altDistance,
            parent: null,
          });
        }
      }
    }

    // No path found
    return [];
  }

  /**
   * Get valid neighbors for pathfinding
   */
  private getNeighbors(x: number, y: number, grid: Grid): Point[] {
    const neighbors: Point[] = [];
    const isFloor = (cx: number, cy: number) =>
      grid.isInBounds(cx, cy) && grid.getCell(cx, cy) === CellType.FLOOR;

    const directions = this.config.allowDiagonal
      ? [
          { x: -1, y: -1 },
          { x: 0, y: -1 },
          { x: 1, y: -1 },
          { x: -1, y: 0 },
          { x: 1, y: 0 },
          { x: -1, y: 1 },
          { x: 0, y: 1 },
          { x: 1, y: 1 },
        ]
      : [
          { x: 0, y: -1 },
          { x: 1, y: 0 },
          { x: 0, y: 1 },
          { x: -1, y: 0 },
        ];

    for (const dir of directions) {
      const nx = x + dir.x;
      const ny = y + dir.y;

      if (grid.isInBounds(nx, ny)) {
        if (dir.x !== 0 && dir.y !== 0) {
          // For diagonals, block corner cutting unless both adjacent tiles are open floor
          if (
            !isFloor(nx, ny) ||
            !isFloor(x + dir.x, y) ||
            !isFloor(x, y + dir.y)
          ) {
            continue;
          }
        }
        neighbors.push({ x: nx, y: ny });
      }
    }

    return neighbors;
  }

  /**
   * Get heuristic function based on configuration
   */
  private getHeuristicFunction(): (a: Point, b: Point) => number {
    switch (this.config.heuristic) {
      case "manhattan":
        return (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
      case "euclidean":
        return (a, b) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
      case "chebyshev":
        return (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
      default:
        return (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    }
  }

  /**
   * Reconstruct path from A* node
   */
  private reconstructPath(endNode: {
    x: number;
    y: number;
    parent: { x: number; y: number; parent: unknown } | null;
  }): Point[] {
    // Use a simple chain type to avoid unknown while preserving structure
    type Chain = { x: number; y: number; parent: Chain | null };
    const path: Point[] = [];
    let current: Chain | null = endNode as unknown as Chain;

    while (current) {
      path.unshift({ x: current.x, y: current.y });
      current = current.parent;
    }

    return path;
  }

  /**
   * Reconstruct path from Dijkstra's previous map
   */
  private reconstructPathDijkstra(
    end: Point,
    previous: Map<string, { x: number; y: number } | null>,
  ): Point[] {
    const path: Point[] = [];
    const getKey = (x: number, y: number) => `${x},${y}`;

    let current: { x: number; y: number } | null = end;

    while (current) {
      path.unshift(current);
      current = previous.get(getKey(current.x, current.y)) || null;
    }

    return path;
  }

  /**
   * Check if direct path is clear
   */
  private isDirectPathClear(start: Point, end: Point, grid: Grid): boolean {
    const dx = Math.abs(end.x - start.x);
    const dy = Math.abs(end.y - start.y);
    const steps = Math.max(dx, dy);

    if (steps === 0) return true;

    const stepX = (end.x - start.x) / steps;
    const stepY = (end.y - start.y) / steps;

    for (let i = 0; i <= steps; i++) {
      const x = Math.round(start.x + stepX * i);
      const y = Math.round(start.y + stepY * i);

      if (grid.getCell(x, y) !== CellType.FLOOR) {
        return false;
      }
    }

    return true;
  }

  /**
   * Create direct line path
   */
  // Removed direct-line carving helper; tunneling A* will carve as needed

  /**
   * Smooth path by removing unnecessary waypoints
   */
  private smoothPath(path: Point[], grid: Grid): Point[] {
    if (path.length <= 2) return path;

    const smoothed: Point[] = [path[0]];
    let current = 0;

    while (current < path.length - 1) {
      let farthest = current + 1;

      // Find the farthest point we can reach directly
      for (let i = current + 2; i < path.length; i++) {
        if (this.isDirectPathClear(path[current], path[i], grid)) {
          farthest = i;
        } else {
          break;
        }
      }

      smoothed.push(path[farthest]);
      current = farthest;
    }

    return smoothed;
  }

  /**
   * Calculate distance between room centers
   */
  private calculateRoomDistance(room1: RoomImpl, room2: RoomImpl): number {
    const dx = room1.centerX - room2.centerX;
    const dy = room1.centerY - room2.centerY;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
