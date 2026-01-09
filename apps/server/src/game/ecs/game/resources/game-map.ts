/**
 * Game Map Resource
 *
 * Grid-based map for collision detection and pathfinding.
 */

import type { Entity } from "../../types";

/**
 * Tile types.
 */
export enum TileType {
  Wall = 0,
  Floor = 1,
  Door = 2,
  Water = 3,
  Lava = 4,
}

/**
 * Tile flags for properties.
 */
export const TileFlags = {
  WALKABLE: 1 << 0,
  TRANSPARENT: 1 << 1,
  EXPLORED: 1 << 2,
  VISIBLE: 1 << 3,
} as const;

/**
 * Game map for spatial queries and pathfinding.
 */
export class GameMap {
  private readonly tiles: Uint8Array;
  private readonly flags: Uint8Array;
  private readonly entities: Map<number, Set<Entity>>; // Packed coord -> entities

  constructor(
    public readonly width: number,
    public readonly height: number,
  ) {
    const size = width * height;
    this.tiles = new Uint8Array(size).fill(TileType.Wall);
    this.flags = new Uint8Array(size);
    this.entities = new Map();
  }

  /**
   * Converts x,y to array index.
   */
  private toIndex(x: number, y: number): number {
    return y * this.width + x;
  }

  /**
   * Packs coordinates for entity map.
   */
  private packCoord(x: number, y: number): number {
    return ((x & 0xffff) << 16) | (y & 0xffff);
  }

  /**
   * Checks if coordinates are in bounds.
   */
  isInBounds(x: number, y: number): boolean {
    return x >= 0 && x < this.width && y >= 0 && y < this.height;
  }

  /**
   * Gets the tile type at position.
   */
  getTile(x: number, y: number): TileType {
    if (!this.isInBounds(x, y)) return TileType.Wall;
    return this.tiles[this.toIndex(x, y)];
  }

  /**
   * Sets the tile type at position.
   */
  setTile(x: number, y: number, type: TileType): void {
    if (!this.isInBounds(x, y)) return;
    this.tiles[this.toIndex(x, y)] = type;

    // Update default flags based on tile type
    const idx = this.toIndex(x, y);
    switch (type) {
      case TileType.Floor:
        this.flags[idx] |= TileFlags.WALKABLE | TileFlags.TRANSPARENT;
        break;
      case TileType.Wall:
        this.flags[idx] &= ~(TileFlags.WALKABLE | TileFlags.TRANSPARENT);
        break;
      case TileType.Door:
        this.flags[idx] |= TileFlags.WALKABLE;
        this.flags[idx] &= ~TileFlags.TRANSPARENT;
        break;
      case TileType.Water:
        this.flags[idx] |= TileFlags.TRANSPARENT;
        this.flags[idx] &= ~TileFlags.WALKABLE;
        break;
      case TileType.Lava:
        this.flags[idx] |= TileFlags.TRANSPARENT;
        this.flags[idx] &= ~TileFlags.WALKABLE;
        break;
    }
  }

  /**
   * Checks if tile is walkable.
   */
  isWalkable(x: number, y: number): boolean {
    if (!this.isInBounds(x, y)) return false;
    return (this.flags[this.toIndex(x, y)] & TileFlags.WALKABLE) !== 0;
  }

  /**
   * Checks if tile is transparent (for FOV).
   */
  isTransparent(x: number, y: number): boolean {
    if (!this.isInBounds(x, y)) return false;
    return (this.flags[this.toIndex(x, y)] & TileFlags.TRANSPARENT) !== 0;
  }

  /**
   * Checks if tile is opaque (blocks vision).
   */
  isOpaque(x: number, y: number): boolean {
    return !this.isTransparent(x, y);
  }

  /**
   * Sets tile as explored.
   */
  setExplored(x: number, y: number, explored: boolean): void {
    if (explored) {
      this.setFlag(x, y, TileFlags.EXPLORED);
    } else {
      this.clearFlag(x, y, TileFlags.EXPLORED);
    }
  }

  /**
   * Sets a flag on a tile.
   */
  setFlag(x: number, y: number, flag: number): void {
    if (!this.isInBounds(x, y)) return;
    this.flags[this.toIndex(x, y)] |= flag;
  }

  /**
   * Clears a flag on a tile.
   */
  clearFlag(x: number, y: number, flag: number): void {
    if (!this.isInBounds(x, y)) return;
    this.flags[this.toIndex(x, y)] &= ~flag;
  }

  /**
   * Checks if a flag is set.
   */
  hasFlag(x: number, y: number, flag: number): boolean {
    if (!this.isInBounds(x, y)) return false;
    return (this.flags[this.toIndex(x, y)] & flag) !== 0;
  }

  /**
   * Marks tile as explored.
   */
  explore(x: number, y: number): void {
    this.setFlag(x, y, TileFlags.EXPLORED);
  }

  /**
   * Checks if tile is explored.
   */
  isExplored(x: number, y: number): boolean {
    return this.hasFlag(x, y, TileFlags.EXPLORED);
  }

  /**
   * Marks tile as visible (current FOV).
   */
  setVisible(x: number, y: number, visible: boolean): void {
    if (visible) {
      this.setFlag(x, y, TileFlags.VISIBLE);
    } else {
      this.clearFlag(x, y, TileFlags.VISIBLE);
    }
  }

  /**
   * Checks if tile is currently visible.
   */
  isVisible(x: number, y: number): boolean {
    return this.hasFlag(x, y, TileFlags.VISIBLE);
  }

  /**
   * Clears all visible flags (call before FOV recalculation).
   */
  clearVisibility(): void {
    for (let i = 0; i < this.flags.length; i++) {
      this.flags[i] &= ~TileFlags.VISIBLE;
    }
  }

  /**
   * Adds an entity to a position.
   */
  addEntity(x: number, y: number, entity: Entity): void {
    const key = this.packCoord(x, y);
    const set = this.entities.get(key);
    if (set) {
      set.add(entity);
    } else {
      this.entities.set(key, new Set([entity]));
    }
  }

  /**
   * Removes an entity from a position.
   */
  removeEntity(x: number, y: number, entity: Entity): void {
    const key = this.packCoord(x, y);
    const set = this.entities.get(key);
    if (set) {
      set.delete(entity);
      if (set.size === 0) {
        this.entities.delete(key);
      }
    }
  }

  /**
   * Gets entities at a position.
   */
  getEntitiesAt(x: number, y: number): ReadonlySet<Entity> {
    const key = this.packCoord(x, y);
    return this.entities.get(key) ?? new Set();
  }

  /**
   * Checks if position has any entities.
   */
  hasEntities(x: number, y: number): boolean {
    const key = this.packCoord(x, y);
    const set = this.entities.get(key);
    return set !== undefined && set.size > 0;
  }

  /**
   * Moves an entity from one position to another.
   */
  moveEntity(
    entity: Entity,
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
  ): void {
    this.removeEntity(fromX, fromY, entity);
    this.addEntity(toX, toY, entity);
  }

  /**
   * Fills a rectangular area with a tile type.
   */
  fillRect(x: number, y: number, w: number, h: number, type: TileType): void {
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        this.setTile(x + dx, y + dy, type);
      }
    }
  }

  /**
   * Creates a room (floor area with walls).
   */
  carveRoom(x: number, y: number, w: number, h: number): void {
    this.fillRect(x, y, w, h, TileType.Floor);
  }

  /**
   * Creates a corridor between two points.
   */
  carveCorridor(x1: number, y1: number, x2: number, y2: number): void {
    // L-shaped corridor
    const midX = x1;

    // Vertical first
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);
    for (let y = minY; y <= maxY; y++) {
      this.setTile(midX, y, TileType.Floor);
    }

    // Then horizontal
    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    for (let x = minX; x <= maxX; x++) {
      this.setTile(x, y2, TileType.Floor);
    }
  }

  /**
   * Gets the raw tiles array (for serialization).
   */
  getRawTiles(): Uint8Array {
    return this.tiles;
  }

  /**
   * Sets tiles from raw array (for deserialization).
   */
  setRawTiles(data: Uint8Array): void {
    if (data.length !== this.tiles.length) {
      throw new Error("Tile data size mismatch");
    }
    this.tiles.set(data);

    // Rebuild flags
    for (let i = 0; i < data.length; i++) {
      const x = i % this.width;
      const y = Math.floor(i / this.width);
      this.setTile(x, y, data[i]);
    }
  }
}
