/**
 * BSP Room Placer
 *
 * Places rooms within BSP leaf nodes, respecting size constraints
 * and padding requirements.
 */

import type { SeededRandom } from "../../../core/random/seeded-random";
import { RoomImpl } from "../../../entities/room";
import type { BspRoomConfig, BspLeaf } from "./config";

/**
 * Room type categories for variety.
 */
const ROOM_TYPES = [
  "standard",
  "large",
  "corridor",
  "treasure",
  "monster",
] as const;

/**
 * Handles room placement within BSP leaf partitions.
 */
export class BspRoomPlacer {
  constructor(
    private readonly config: BspRoomConfig,
    private readonly rng: SeededRandom,
  ) {}

  /**
   * Place rooms in all leaf nodes.
   *
   * @param leaves - BSP leaf nodes to place rooms in
   * @returns Array of placed rooms
   */
  placeRooms(leaves: BspLeaf[]): RoomImpl[] {
    const rooms: RoomImpl[] = [];

    for (let i = 0; i < leaves.length; i++) {
      const leaf = leaves[i];
      const room = this.placeRoomInLeaf(leaf, i);

      if (room) {
        rooms.push(room);
      }
    }

    return rooms;
  }

  /**
   * Place a room within a single leaf partition.
   *
   * @param leaf - The leaf node to place a room in
   * @param id - Room identifier
   * @returns The placed room, or null if placement failed
   */
  private placeRoomInLeaf(leaf: BspLeaf, id: number): RoomImpl | null {
    const { minRoomRatio, maxRoomRatio, padding, minRoomSize } = this.config;

    // Calculate available space after padding
    const availableWidth = leaf.width - padding * 2;
    const availableHeight = leaf.height - padding * 2;

    // Check if there's enough space
    if (availableWidth < minRoomSize || availableHeight < minRoomSize) {
      return null;
    }

    // Calculate room size within ratio constraints
    const roomRatio =
      minRoomRatio + this.rng.next() * (maxRoomRatio - minRoomRatio);

    let roomWidth = Math.floor(availableWidth * roomRatio);
    let roomHeight = Math.floor(availableHeight * roomRatio);

    // Ensure minimum size
    roomWidth = Math.max(roomWidth, minRoomSize);
    roomHeight = Math.max(roomHeight, minRoomSize);

    // Clamp to available space
    roomWidth = Math.min(roomWidth, availableWidth);
    roomHeight = Math.min(roomHeight, availableHeight);

    // Calculate room position (random within available space)
    const maxOffsetX = availableWidth - roomWidth;
    const maxOffsetY = availableHeight - roomHeight;

    const offsetX = maxOffsetX > 0 ? this.rng.range(0, maxOffsetX) : 0;
    const offsetY = maxOffsetY > 0 ? this.rng.range(0, maxOffsetY) : 0;

    const roomX = leaf.x + padding + offsetX;
    const roomY = leaf.y + padding + offsetY;

    // Determine room type
    const roomType = this.determineRoomType(roomWidth, roomHeight);

    // Create room using proper constructor
    return new RoomImpl({
      id,
      x: roomX,
      y: roomY,
      width: roomWidth,
      height: roomHeight,
      type: roomType,
      seed: this.rng.range(0, 999999),
    });
  }

  /**
   * Determine room type based on dimensions and randomness.
   */
  private determineRoomType(width: number, height: number): string {
    const area = width * height;
    const aspectRatio = width / height;

    // Large rooms
    if (area > 100) {
      return this.rng.next() > 0.7 ? "treasure" : "large";
    }

    // Long narrow rooms are corridors
    if (aspectRatio > 2.5 || aspectRatio < 0.4) {
      return "corridor";
    }

    // Small rooms might be special
    if (area < 25) {
      return this.rng.next() > 0.8 ? "monster" : "standard";
    }

    // Random type for medium rooms
    const roll = this.rng.next();
    if (roll > 0.9) {
      return "treasure";
    } else if (roll > 0.7) {
      return "monster";
    }

    return "standard";
  }

  /**
   * Get statistics about placed rooms.
   */
  getRoomStatistics(rooms: RoomImpl[]): {
    totalRooms: number;
    averageArea: number;
    typeDistribution: Record<string, number>;
  } {
    if (rooms.length === 0) {
      return {
        totalRooms: 0,
        averageArea: 0,
        typeDistribution: {},
      };
    }

    const totalArea = rooms.reduce((sum, room) => sum + room.width * room.height, 0);
    const typeDistribution: Record<string, number> = {};

    for (const room of rooms) {
      typeDistribution[room.type] = (typeDistribution[room.type] || 0) + 1;
    }

    return {
      totalRooms: rooms.length,
      averageArea: totalArea / rooms.length,
      typeDistribution,
    };
  }
}
