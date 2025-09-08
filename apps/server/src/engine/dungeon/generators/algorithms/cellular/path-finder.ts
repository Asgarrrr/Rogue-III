import { Grid, CellType, Point } from "../../../core/grid";
import { RoomImpl } from "../../../entities/room";
import { ConnectionImpl } from "../../../entities/connection";

/**
 * Configuration for pathfinding
 */
export interface PathfindingConfig {
	readonly algorithm: "astar" | "dijkstra" | "direct";
	readonly heuristic: "manhattan" | "euclidean" | "chebyshev";
	readonly allowDiagonal: boolean;
	readonly maxPathLength: number;
	readonly pathSmoothingPasses: number;
}

/**
 * Default pathfinding configuration
 */
export const DEFAULT_PATHFINDING_CONFIG: PathfindingConfig = {
	algorithm: "astar",
	heuristic: "manhattan",
	allowDiagonal: false,
	maxPathLength: 1000,
	pathSmoothingPasses: 2,
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
			mstConnections
		);
		connections.push(...additionalConnections);

		return connections;
	}

	/**
	 * Create minimum spanning tree of room connections
	 */
	private createMinimumSpanningTree(
		rooms: RoomImpl[],
		grid: Grid
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
					unconnected.has(r.id)
				)) {
					const distance = this.calculateRoomDistance(
						connectedRoom,
						unconnectedRoom
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
					grid
				);
				if (path.length > 0) {
					connections.push(
						new ConnectionImpl(
							bestConnection.from,
							bestConnection.to,
							path,
							"cellular"
						)
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
		existingConnections: ConnectionImpl[]
	): ConnectionImpl[] {
		const connections: ConnectionImpl[] = [];
		const maxAdditionalConnections = Math.max(
			1,
			Math.floor(rooms.length * 0.3)
		);

		// Create set of existing connections for quick lookup
		const existingPairs = new Set<string>();
		for (const conn of existingConnections) {
			const key1 = `${conn.from.id}-${conn.to.id}`;
			const key2 = `${conn.to.id}-${conn.from.id}`;
			existingPairs.add(key1);
			existingPairs.add(key2);
		}

		// Find good additional connections
		const candidates: { from: RoomImpl; to: RoomImpl; distance: number }[] = [];

		for (let i = 0; i < rooms.length; i++) {
			for (let j = i + 1; j < rooms.length; j++) {
				const key = `${rooms[i].id}-${rooms[j].id}`;
				if (!existingPairs.has(key)) {
					const distance = this.calculateRoomDistance(rooms[i], rooms[j]);
					candidates.push({ from: rooms[i], to: rooms[j], distance });
				}
			}
		}

		// Sort by distance and take the shortest ones
		candidates.sort((a, b) => a.distance - b.distance);

		for (
			let i = 0;
			i < Math.min(maxAdditionalConnections, candidates.length);
			i++
		) {
			const candidate = candidates[i];
			const path = this.findPath(candidate.from, candidate.to, grid);

			if (path.length > 0 && path.length < this.config.maxPathLength) {
				connections.push(
					new ConnectionImpl(candidate.from, candidate.to, path, "cellular")
				);
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

		// Try direct path first for performance
		if (
			this.config.algorithm === "direct" ||
			this.isDirectPathClear(start, end, grid)
		) {
			return this.createDirectPath(start, end);
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
		}

		const openSet = new Map<string, Node>();
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
		};
		startNode.f = startNode.g + startNode.h;

		openSet.set(getKey(start.x, start.y), startNode);

		while (openSet.size > 0) {
			// Find node with lowest f score
			let current: Node | null = null;
			let lowestF = Infinity;

			for (const node of openSet.values()) {
				if (node.f < lowestF) {
					lowestF = node.f;
					current = node;
				}
			}

			if (!current) break;

			// Check if we reached the goal
			if (current.x === end.x && current.y === end.y) {
				return this.reconstructPath(current);
			}

			// Move current to closed set
			const currentKey = getKey(current.x, current.y);
			openSet.delete(currentKey);
			closedSet.add(currentKey);

			// Check neighbors
			const neighbors = this.getNeighbors(current.x, current.y, grid);

			for (const neighbor of neighbors) {
				const neighborKey = getKey(neighbor.x, neighbor.y);

				if (closedSet.has(neighborKey)) continue;

				const tentativeG = current.g + 1;
				const existingNode = openSet.get(neighborKey);

				if (!existingNode) {
					const neighborNode: Node = {
						x: neighbor.x,
						y: neighbor.y,
						g: tentativeG,
						h: heuristic(neighbor, end),
						f: 0,
						parent: current,
					};
					neighborNode.f = neighborNode.g + neighborNode.h;
					openSet.set(neighborKey, neighborNode);
				} else if (tentativeG < existingNode.g) {
					existingNode.g = tentativeG;
					existingNode.f = existingNode.g + existingNode.h;
					existingNode.parent = current;
				}
			}
		}

		// No path found, return direct path as fallback
		return this.createDirectPath(start, end);
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

			// Check neighbors
			const neighbors = this.getNeighbors(currentX, currentY, grid);

			for (const neighbor of neighbors) {
				const neighborKey = getKey(neighbor.x, neighbor.y);

				if (!unvisited.has(neighborKey)) continue;

				const altDistance = (distances.get(current) || 0) + 1;

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
		return this.createDirectPath(start, end);
	}

	/**
	 * Get valid neighbors for pathfinding
	 */
	private getNeighbors(x: number, y: number, grid: Grid): Point[] {
		const neighbors: Point[] = [];
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

			if (grid.isInBounds(nx, ny) && grid.getCell(nx, ny) === CellType.FLOOR) {
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
		parent: any;
		x: number;
		y: number;
	}): Point[] {
		const path: Point[] = [];
		let current = endNode;

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
		previous: Map<string, { x: number; y: number } | null>
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
	private createDirectPath(start: Point, end: Point): Point[] {
		const path: Point[] = [];
		const dx = Math.abs(end.x - start.x);
		const dy = Math.abs(end.y - start.y);
		const steps = Math.max(dx, dy);

		if (steps === 0) {
			return [start];
		}

		const stepX = (end.x - start.x) / steps;
		const stepY = (end.y - start.y) / steps;

		for (let i = 0; i <= steps; i++) {
			const x = Math.round(start.x + stepX * i);
			const y = Math.round(start.y + stepY * i);
			path.push({ x, y });
		}

		return path;
	}

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
