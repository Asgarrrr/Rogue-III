/**
 * BSP Corridor Carver
 *
 * Creates corridors between rooms in a BSP dungeon.
 * Supports multiple algorithms: L-shaped (classic BSP), straight, and A*.
 */

import type { Grid, Point } from "../../../core/grid";
import type { SeededRandom } from "../../../core/random/seeded-random";
import { ConnectionImpl } from "../../../entities/connection";
import type { RoomImpl } from "../../../entities/room";
import { PathFinder, type PathfindingConfig } from "../cellular/path-finder";
import type { BspCorridorConfig, BspLeaf } from "./config";

/**
 * Handles corridor creation between BSP rooms.
 */
export class BspCorridorCarver {
  private readonly pathFinder: PathFinder;

  constructor(
    private readonly config: BspCorridorConfig,
    private readonly rng: SeededRandom,
  ) {
    // Configure pathfinder for A* algorithm
    const pathfindingConfig: PathfindingConfig = {
      algorithm: "astar",
      heuristic: "manhattan",
      allowDiagonal: false,
      maxPathLength: 500,
      pathSmoothingPasses: 1,
      tunnelWallCost: 1, // Low cost since we're carving anyway
      corridorWidth: config.width,
      preferJPS: false,
    };
    this.pathFinder = new PathFinder(pathfindingConfig);
  }

  /**
   * Create connections between rooms using BSP sibling pairs.
   *
   * @param rooms - All placed rooms
   * @param siblingPairs - Pairs of leaves that should be connected
   * @param grid - The dungeon grid
   * @returns Array of connections
   */
  createConnections(
    rooms: RoomImpl[],
    siblingPairs: Array<[BspLeaf, BspLeaf]>,
    grid: Grid,
  ): ConnectionImpl[] {
    const connections: ConnectionImpl[] = [];
    const _roomMap = this.buildRoomMap(rooms);

    // Connect sibling pairs (ensures all partitions are connected)
    for (const [leftLeaf, rightLeaf] of siblingPairs) {
      const leftRoom = this.findRoomInLeaf(rooms, leftLeaf);
      const rightRoom = this.findRoomInLeaf(rooms, rightLeaf);

      if (leftRoom && rightRoom) {
        const connection = this.createConnection(leftRoom, rightRoom, grid);
        if (connection) {
          connections.push(connection);
        }
      }
    }

    // Add extra connections for redundancy if configured
    if (this.config.extraConnections > 0) {
      const extraConns = this.createExtraConnections(rooms, connections, grid);
      connections.push(...extraConns);
    }

    return connections;
  }

  /**
   * Create a single connection between two rooms.
   */
  private createConnection(
    from: RoomImpl,
    to: RoomImpl,
    grid: Grid,
  ): ConnectionImpl | null {
    let path: Point[];

    switch (this.config.algorithm) {
      case "lshaped":
        path = this.createLShapedPath(from, to);
        break;
      case "straight":
        path = this.createStraightPath(from, to);
        break;
      case "astar":
        path = this.pathFinder.findPath(from, to, grid);
        break;
      default:
        path = this.createLShapedPath(from, to);
    }

    if (path.length === 0) {
      // Fallback to L-shaped if A* fails
      path = this.createLShapedPath(from, to);
    }

    if (path.length === 0) {
      return null;
    }

    return new ConnectionImpl(from, to, path, `bsp-${this.config.algorithm}`);
  }

  /**
   * Create an L-shaped corridor path (classic BSP style).
   * Goes horizontal first, then vertical (or vice versa randomly).
   */
  private createLShapedPath(from: RoomImpl, to: RoomImpl): Point[] {
    const path: Point[] = [];
    const startX = from.centerX;
    const startY = from.centerY;
    const endX = to.centerX;
    const endY = to.centerY;

    // Randomly choose to go horizontal-first or vertical-first
    const horizontalFirst = this.rng.next() > 0.5;

    if (horizontalFirst) {
      // Horizontal segment
      const stepX = startX < endX ? 1 : -1;
      for (let x = startX; x !== endX; x += stepX) {
        path.push({ x, y: startY });
      }
      // Vertical segment
      const stepY = startY < endY ? 1 : -1;
      for (let y = startY; y !== endY + stepY; y += stepY) {
        path.push({ x: endX, y });
      }
    } else {
      // Vertical segment
      const stepY = startY < endY ? 1 : -1;
      for (let y = startY; y !== endY; y += stepY) {
        path.push({ x: startX, y });
      }
      // Horizontal segment
      const stepX = startX < endX ? 1 : -1;
      for (let x = startX; x !== endX + stepX; x += stepX) {
        path.push({ x, y: endY });
      }
    }

    return path;
  }

  /**
   * Create a straight-line corridor path.
   */
  private createStraightPath(from: RoomImpl, to: RoomImpl): Point[] {
    const path: Point[] = [];
    const startX = from.centerX;
    const startY = from.centerY;
    const endX = to.centerX;
    const endY = to.centerY;

    const dx = endX - startX;
    const dy = endY - startY;
    const steps = Math.max(Math.abs(dx), Math.abs(dy));

    if (steps === 0) {
      return [{ x: startX, y: startY }];
    }

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = Math.round(startX + dx * t);
      const y = Math.round(startY + dy * t);
      path.push({ x, y });
    }

    return path;
  }

  /**
   * Create additional connections for better dungeon flow.
   */
  private createExtraConnections(
    rooms: RoomImpl[],
    existingConnections: ConnectionImpl[],
    grid: Grid,
  ): ConnectionImpl[] {
    if (rooms.length < 3) return [];

    const connections: ConnectionImpl[] = [];
    const existingPairs = new Set<string>();

    // Track existing connections
    for (const conn of existingConnections) {
      existingPairs.add(`${conn.from.id}-${conn.to.id}`);
      existingPairs.add(`${conn.to.id}-${conn.from.id}`);
    }

    // Find candidate pairs by distance
    const candidates: Array<{
      from: RoomImpl;
      to: RoomImpl;
      distance: number;
    }> = [];

    for (const roomA of rooms) {
      for (const roomB of rooms) {
        if (roomA.id >= roomB.id) continue;
        if (existingPairs.has(`${roomA.id}-${roomB.id}`)) continue;

        const distance = this.calculateDistance(roomA, roomB);
        candidates.push({ from: roomA, to: roomB, distance });
      }
    }

    // Sort by distance and take the closest ones
    candidates.sort((a, b) => a.distance - b.distance);

    const toAdd = Math.min(this.config.extraConnections, candidates.length);
    for (let i = 0; i < toAdd; i++) {
      const { from, to } = candidates[i];
      const connection = this.createConnection(from, to, grid);
      if (connection) {
        connections.push(connection);
      }
    }

    return connections;
  }

  /**
   * Build a map of room ID to room for quick lookup.
   */
  private buildRoomMap(rooms: RoomImpl[]): Map<number, RoomImpl> {
    const map = new Map<number, RoomImpl>();
    for (const room of rooms) {
      map.set(room.id, room);
    }
    return map;
  }

  /**
   * Find the room that was placed in a given leaf.
   * Uses center point containment check.
   */
  private findRoomInLeaf(
    rooms: RoomImpl[],
    leaf: BspLeaf,
  ): RoomImpl | undefined {
    return rooms.find((room) => {
      const centerX = room.centerX;
      const centerY = room.centerY;
      return (
        centerX >= leaf.x &&
        centerX < leaf.x + leaf.width &&
        centerY >= leaf.y &&
        centerY < leaf.y + leaf.height
      );
    });
  }

  /**
   * Calculate distance between two rooms.
   */
  private calculateDistance(roomA: RoomImpl, roomB: RoomImpl): number {
    const dx = roomA.centerX - roomB.centerX;
    const dy = roomA.centerY - roomB.centerY;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Get the configured corridor width.
   */
  get corridorWidth(): number {
    return this.config.width;
  }
}
