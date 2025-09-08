import { Grid, CellType, Region, SpatialHash } from "../../../core/grid";
import { SeededRandom } from "../../../core/random/seeded-random";
import { RoomImpl } from "../../../entities/room";

/**
 * Configuration for room placement
 */
export interface RoomPlacementConfig {
	readonly minRoomSize: number;
	readonly maxRoomSize: number;
	readonly roomCount: number;
	readonly minRoomSpacing: number;
	readonly maxPlacementAttempts: number;
	readonly roomTypes: readonly string[];
}

/**
 * Default room placement configuration
 */
export const DEFAULT_ROOM_PLACEMENT_CONFIG: RoomPlacementConfig = {
	minRoomSize: 4,
	maxRoomSize: 12,
	roomCount: 8,
	minRoomSpacing: 2,
	maxPlacementAttempts: 50,
	roomTypes: ["normal", "treasure", "monster", "special"] as const,
};

/**
 * Optimized room placement system for cellular automaton generated caverns.
 * Uses spatial hashing for efficient collision detection and overlap prevention.
 */
export class RoomPlacer {
	private readonly config: RoomPlacementConfig;
	private readonly rng: SeededRandom;
	private readonly spatialHash: SpatialHash<RoomImpl>;

	constructor(config: RoomPlacementConfig, rng: SeededRandom) {
		this.config = config;
		this.rng = rng;

		// Initialize spatial hash with cell size optimized for room sizes
		const avgRoomSize = (config.minRoomSize + config.maxRoomSize) / 2;
		this.spatialHash = new SpatialHash(
			avgRoomSize + config.minRoomSpacing,
			{ minX: 0, minY: 0, maxX: 1000, maxY: 1000 } // Will be updated per grid
		);
	}

	/**
	 * Place rooms in suitable caverns
	 */
	placeRooms(caverns: Region[], grid: Grid): RoomImpl[] {
		this.spatialHash.clear();
		const rooms: RoomImpl[] = [];

		// Sort caverns by size (largest first) for better room placement
		const sortedCaverns = [...caverns].sort((a, b) => b.size - a.size);

		let roomId = 0;
		let totalAttempts = 0;
		const maxTotalAttempts =
			this.config.maxPlacementAttempts * this.config.roomCount;

		for (const cavern of sortedCaverns) {
			if (
				rooms.length >= this.config.roomCount ||
				totalAttempts >= maxTotalAttempts
			) {
				break;
			}

			const cavernRooms = this.placeRoomsInCavern(
				cavern,
				grid,
				roomId,
				rooms.length
			);

			for (const room of cavernRooms) {
				if (rooms.length < this.config.roomCount) {
					rooms.push(room);
					this.spatialHash.insertRect(
						room.x,
						room.y,
						room.width,
						room.height,
						room
					);
					roomId++;
				}
			}

			totalAttempts += this.config.maxPlacementAttempts;
		}

		return rooms;
	}

	/**
	 * Place multiple rooms within a single cavern
	 */
	private placeRoomsInCavern(
		cavern: Region,
		grid: Grid,
		startRoomId: number,
		existingRoomCount: number
	): RoomImpl[] {
		const rooms: RoomImpl[] = [];
		const remainingRooms = this.config.roomCount - existingRoomCount;

		if (remainingRooms <= 0) return rooms;

		// Estimate how many rooms can fit in this cavern
		const cavernArea = cavern.size;
		const avgRoomArea =
			((this.config.minRoomSize + this.config.maxRoomSize) / 2) ** 2;
		const estimatedCapacity = Math.floor(cavernArea / (avgRoomArea * 3)); // Factor of 3 for spacing

		const roomsToPlace = Math.min(remainingRooms, estimatedCapacity, 3); // Max 3 rooms per cavern

		for (let i = 0; i < roomsToPlace; i++) {
			const room = this.placeSingleRoomInCavern(
				cavern,
				grid,
				startRoomId + i,
				[...rooms] // Pass copy to avoid mutation during iteration
			);

			if (room) {
				rooms.push(room);
			}
		}

		return rooms;
	}

	/**
	 * Place a single room within a cavern
	 */
	private placeSingleRoomInCavern(
		cavern: Region,
		grid: Grid,
		roomId: number,
		existingRooms: RoomImpl[]
	): RoomImpl | null {
		const bounds = cavern.bounds;
		const cavernWidth = bounds.maxX - bounds.minX + 1;
		const cavernHeight = bounds.maxY - bounds.minY + 1;

		// Early exit if cavern is too small
		if (
			cavernWidth < this.config.minRoomSize + 4 ||
			cavernHeight < this.config.minRoomSize + 4
		) {
			return null;
		}

		for (
			let attempt = 0;
			attempt < this.config.maxPlacementAttempts;
			attempt++
		) {
			// Generate room dimensions
			const roomWidth = this.rng.range(
				this.config.minRoomSize,
				Math.min(this.config.maxRoomSize, cavernWidth - 4)
			);
			const roomHeight = this.rng.range(
				this.config.minRoomSize,
				Math.min(this.config.maxRoomSize, cavernHeight - 4)
			);

			// Generate room position within cavern bounds
			const roomX = this.rng.range(
				bounds.minX + 2,
				bounds.maxX - roomWidth - 1
			);
			const roomY = this.rng.range(
				bounds.minY + 2,
				bounds.maxY - roomHeight - 1
			);

			// Check if room fits within cavern and doesn't overlap
			if (
				this.isValidRoomPlacement(
					roomX,
					roomY,
					roomWidth,
					roomHeight,
					cavern,
					grid,
					existingRooms
				)
			) {
				const roomType = this.selectRoomType();

				return new RoomImpl({
					id: roomId,
					x: roomX,
					y: roomY,
					width: roomWidth,
					height: roomHeight,
					type: roomType,
					seed: this.rng.range(0, 999999),
				});
			}
		}

		return null;
	}

	/**
	 * Validate room placement against all constraints
	 */
	private isValidRoomPlacement(
		x: number,
		y: number,
		width: number,
		height: number,
		cavern: Region,
		grid: Grid,
		existingRooms: RoomImpl[]
	): boolean {
		// Check bounds
		if (
			x < 0 ||
			y < 0 ||
			x + width >= grid.width ||
			y + height >= grid.height
		) {
			return false;
		}

		// Check if room area is mostly within cavern floor
		if (!this.isRoomInCavern(x, y, width, height, cavern, grid)) {
			return false;
		}

		// Check overlap with existing rooms using spatial hash
		const nearbyRooms = this.spatialHash.queryRect(
			x - this.config.minRoomSpacing,
			y - this.config.minRoomSpacing,
			width + 2 * this.config.minRoomSpacing,
			height + 2 * this.config.minRoomSpacing
		);

		for (const room of nearbyRooms) {
			if (this.roomsOverlap(x, y, width, height, room)) {
				return false;
			}
		}

		// Additional check against rooms not yet in spatial hash
		for (const room of existingRooms) {
			if (this.roomsOverlap(x, y, width, height, room)) {
				return false;
			}
		}

		return true;
	}

	/**
	 * Check if room is sufficiently within cavern floor area
	 */
	private isRoomInCavern(
		x: number,
		y: number,
		width: number,
		height: number,
		cavern: Region,
		grid: Grid
	): boolean {
		let floorCells = 0;
		const totalCells = width * height;

		// Create a set for fast cavern point lookup
		const cavernPoints = new Set(cavern.points.map((p) => `${p.x},${p.y}`));

		for (let ry = y; ry < y + height; ry++) {
			for (let rx = x; rx < x + width; rx++) {
				if (
					cavernPoints.has(`${rx},${ry}`) &&
					grid.getCell(rx, ry) === CellType.FLOOR
				) {
					floorCells++;
				}
			}
		}

		const coverage = floorCells / totalCells;
		return coverage >= 0.8; // At least 80% of room must be on cavern floor
	}

	/**
	 * Check if two rooms overlap (including spacing buffer)
	 */
	private roomsOverlap(
		x1: number,
		y1: number,
		w1: number,
		h1: number,
		room2: RoomImpl
	): boolean {
		const spacing = this.config.minRoomSpacing;

		return !(
			x1 + w1 + spacing <= room2.x ||
			room2.x + room2.width + spacing <= x1 ||
			y1 + h1 + spacing <= room2.y ||
			room2.y + room2.height + spacing <= y1
		);
	}

	/**
	 * Select room type based on weighted probabilities
	 */
	private selectRoomType(): string {
		const weights = {
			normal: 0.6,
			treasure: 0.15,
			monster: 0.2,
			special: 0.05,
		};

		const random = this.rng.next();
		let cumulativeWeight = 0;

		for (const [type, weight] of Object.entries(weights)) {
			cumulativeWeight += weight;
			if (random <= cumulativeWeight) {
				return type;
			}
		}

		return "normal"; // Fallback
	}

	/**
	 * Optimize room placement using simulated annealing
	 */
	optimizeRoomPlacement(
		rooms: RoomImpl[],
		caverns: Region[],
		grid: Grid
	): RoomImpl[] {
		if (rooms.length === 0) return rooms;

		let currentRooms = [...rooms];
		let bestRooms = [...rooms];
		let bestScore = this.calculatePlacementScore(currentRooms, caverns);

		const maxIterations = 100;
		let temperature = 1.0;
		const coolingRate = 0.95;

		for (let iteration = 0; iteration < maxIterations; iteration++) {
			// Try to improve a random room's placement
			const roomIndex = this.rng.range(0, currentRooms.length - 1);
			const originalRoom = currentRooms[roomIndex];

			// Find the cavern this room belongs to
			const cavern = this.findRoomCavern(originalRoom, caverns);
			if (!cavern) continue;

			// Try to place room in a better position
			const otherRooms = currentRooms.filter((_, i) => i !== roomIndex);
			const newRoom = this.placeSingleRoomInCavern(
				cavern,
				grid,
				originalRoom.id,
				otherRooms
			);

			if (newRoom) {
				currentRooms[roomIndex] = newRoom;
				const newScore = this.calculatePlacementScore(currentRooms, caverns);

				// Accept if better, or with probability based on temperature
				const deltaScore = newScore - bestScore;
				if (
					deltaScore > 0 ||
					Math.exp(deltaScore / temperature) > this.rng.next()
				) {
					if (newScore > bestScore) {
						bestRooms = [...currentRooms];
						bestScore = newScore;
					}
				} else {
					// Revert change
					currentRooms[roomIndex] = originalRoom;
				}
			}

			temperature *= coolingRate;
		}

		return bestRooms;
	}

	/**
	 * Calculate placement quality score
	 */
	private calculatePlacementScore(
		rooms: RoomImpl[],
		caverns: Region[]
	): number {
		let score = 0;

		// Reward room count
		score += rooms.length * 10;

		// Reward good spacing
		for (let i = 0; i < rooms.length; i++) {
			for (let j = i + 1; j < rooms.length; j++) {
				const distance = this.calculateRoomDistance(rooms[i], rooms[j]);
				const optimalDistance =
					(rooms[i].width +
						rooms[i].height +
						rooms[j].width +
						rooms[j].height) /
					2;

				if (distance > optimalDistance) {
					score += 5; // Good spacing
				} else if (distance < optimalDistance * 0.5) {
					score -= 10; // Too close
				}
			}
		}

		// Reward cavern utilization
		const cavernUsage = this.calculateCavernUsage(rooms, caverns);
		score += cavernUsage * 20;

		return score;
	}

	/**
	 * Calculate distance between room centers
	 */
	private calculateRoomDistance(room1: RoomImpl, room2: RoomImpl): number {
		const dx = room1.centerX - room2.centerX;
		const dy = room1.centerY - room2.centerY;
		return Math.sqrt(dx * dx + dy * dy);
	}

	/**
	 * Calculate how well rooms utilize available caverns
	 */
	private calculateCavernUsage(rooms: RoomImpl[], caverns: Region[]): number {
		const usedCaverns = new Set<number>();

		for (const room of rooms) {
			const cavern = this.findRoomCavern(room, caverns);
			if (cavern) {
				usedCaverns.add(cavern.id);
			}
		}

		return usedCaverns.size / Math.max(caverns.length, 1);
	}

	/**
	 * Find which cavern contains a room
	 */
	private findRoomCavern(room: RoomImpl, caverns: Region[]): Region | null {
		const roomCenter = { x: room.centerX, y: room.centerY };

		for (const cavern of caverns) {
			if (
				cavern.points.some((p) => p.x === roomCenter.x && p.y === roomCenter.y)
			) {
				return cavern;
			}
		}

		return null;
	}
}
