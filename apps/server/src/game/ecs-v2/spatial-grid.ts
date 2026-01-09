import type { Entity, ComponentClass } from "./types";
import type { World } from "./world";
import { getComponentMeta } from "./component";

/**
 * Configuration for spatial grid.
 */
export interface SpatialGridConfig {
  /** Width of the world in units */
  worldWidth: number;
  /** Height of the world in units */
  worldHeight: number;
  /** Size of each cell in units */
  cellSize: number;
}

/**
 * A spatial hash grid for efficient spatial queries.
 *
 * Provides O(1) insertion/removal and O(k) range queries
 * where k is the number of entities in the queried area.
 *
 * @example
 * const grid = new SpatialGrid({ worldWidth: 1000, worldHeight: 1000, cellSize: 32 });
 *
 * // Insert entity at position
 * grid.insert(entity, 100, 150);
 *
 * // Query entities in rectangle
 * const nearby = grid.queryRect(90, 140, 20, 20);
 *
 * // Query entities in radius
 * const inRange = grid.queryRadius(100, 150, 50);
 */
export class SpatialGrid {
  private readonly cells: Map<number, Set<Entity>> = new Map();
  private readonly entityPositions: Map<Entity, { x: number; y: number }> =
    new Map();
  private readonly entityCells: Map<Entity, number> = new Map();

  readonly cellSize: number;
  readonly worldWidth: number;
  readonly worldHeight: number;
  readonly gridWidth: number;
  readonly gridHeight: number;

  constructor(config: SpatialGridConfig) {
    this.cellSize = config.cellSize;
    this.worldWidth = config.worldWidth;
    this.worldHeight = config.worldHeight;
    this.gridWidth = Math.ceil(config.worldWidth / config.cellSize);
    this.gridHeight = Math.ceil(config.worldHeight / config.cellSize);
  }

  /**
   * Convert world coordinates to cell index.
   */
  private getCellIndex(x: number, y: number): number {
    const cellX = Math.floor(x / this.cellSize);
    const cellY = Math.floor(y / this.cellSize);
    // Clamp to grid bounds
    const clampedX = Math.max(0, Math.min(cellX, this.gridWidth - 1));
    const clampedY = Math.max(0, Math.min(cellY, this.gridHeight - 1));
    return clampedY * this.gridWidth + clampedX;
  }

  /**
   * Convert cell index to cell coordinates.
   */
  private getCellCoords(index: number): { cellX: number; cellY: number } {
    return {
      cellX: index % this.gridWidth,
      cellY: Math.floor(index / this.gridWidth),
    };
  }

  /**
   * Insert an entity at a position.
   */
  insert(entity: Entity, x: number, y: number): void {
    // Remove from old position if exists
    this.remove(entity);

    const cellIndex = this.getCellIndex(x, y);

    let cell = this.cells.get(cellIndex);
    if (!cell) {
      cell = new Set();
      this.cells.set(cellIndex, cell);
    }

    cell.add(entity);
    this.entityPositions.set(entity, { x, y });
    this.entityCells.set(entity, cellIndex);
  }

  /**
   * Update an entity's position.
   * More efficient than remove + insert when staying in same cell.
   */
  update(entity: Entity, x: number, y: number): void {
    const oldCellIndex = this.entityCells.get(entity);
    const newCellIndex = this.getCellIndex(x, y);

    // Update position
    this.entityPositions.set(entity, { x, y });

    // If cell changed, move entity
    if (oldCellIndex !== newCellIndex) {
      // Remove from old cell
      if (oldCellIndex !== undefined) {
        const oldCell = this.cells.get(oldCellIndex);
        if (oldCell) {
          oldCell.delete(entity);
          if (oldCell.size === 0) {
            this.cells.delete(oldCellIndex);
          }
        }
      }

      // Add to new cell
      let newCell = this.cells.get(newCellIndex);
      if (!newCell) {
        newCell = new Set();
        this.cells.set(newCellIndex, newCell);
      }
      newCell.add(entity);
      this.entityCells.set(entity, newCellIndex);
    }
  }

  /**
   * Remove an entity from the grid.
   */
  remove(entity: Entity): boolean {
    const cellIndex = this.entityCells.get(entity);
    if (cellIndex === undefined) return false;

    const cell = this.cells.get(cellIndex);
    if (cell) {
      cell.delete(entity);
      if (cell.size === 0) {
        this.cells.delete(cellIndex);
      }
    }

    this.entityPositions.delete(entity);
    this.entityCells.delete(entity);
    return true;
  }

  /**
   * Get the position of an entity.
   */
  getPosition(entity: Entity): { x: number; y: number } | null {
    return this.entityPositions.get(entity) ?? null;
  }

  /**
   * Check if an entity is in the grid.
   */
  has(entity: Entity): boolean {
    return this.entityCells.has(entity);
  }

  /**
   * Query entities in a rectangular area.
   */
  queryRect(x: number, y: number, width: number, height: number): Entity[] {
    const results: Entity[] = [];

    const minCellX = Math.max(0, Math.floor(x / this.cellSize));
    const minCellY = Math.max(0, Math.floor(y / this.cellSize));
    const maxCellX = Math.min(
      this.gridWidth - 1,
      Math.floor((x + width) / this.cellSize),
    );
    const maxCellY = Math.min(
      this.gridHeight - 1,
      Math.floor((y + height) / this.cellSize),
    );

    for (let cy = minCellY; cy <= maxCellY; cy++) {
      for (let cx = minCellX; cx <= maxCellX; cx++) {
        const cellIndex = cy * this.gridWidth + cx;
        const cell = this.cells.get(cellIndex);
        if (!cell) continue;

        for (const entity of cell) {
          const pos = this.entityPositions.get(entity)!;
          // Precise check within rectangle
          if (
            pos.x >= x &&
            pos.x <= x + width &&
            pos.y >= y &&
            pos.y <= y + height
          ) {
            results.push(entity);
          }
        }
      }
    }

    return results;
  }

  /**
   * Query entities within a circular radius.
   */
  queryRadius(centerX: number, centerY: number, radius: number): Entity[] {
    const results: Entity[] = [];
    const radiusSq = radius * radius;

    // Get bounding box of circle in cell coordinates
    const minCellX = Math.max(
      0,
      Math.floor((centerX - radius) / this.cellSize),
    );
    const minCellY = Math.max(
      0,
      Math.floor((centerY - radius) / this.cellSize),
    );
    const maxCellX = Math.min(
      this.gridWidth - 1,
      Math.floor((centerX + radius) / this.cellSize),
    );
    const maxCellY = Math.min(
      this.gridHeight - 1,
      Math.floor((centerY + radius) / this.cellSize),
    );

    for (let cy = minCellY; cy <= maxCellY; cy++) {
      for (let cx = minCellX; cx <= maxCellX; cx++) {
        const cellIndex = cy * this.gridWidth + cx;
        const cell = this.cells.get(cellIndex);
        if (!cell) continue;

        for (const entity of cell) {
          const pos = this.entityPositions.get(entity)!;
          const dx = pos.x - centerX;
          const dy = pos.y - centerY;
          const distSq = dx * dx + dy * dy;

          if (distSq <= radiusSq) {
            results.push(entity);
          }
        }
      }
    }

    return results;
  }

  /**
   * Query the N nearest entities to a point.
   */
  queryNearest(
    x: number,
    y: number,
    count: number,
    maxRadius?: number,
  ): Entity[] {
    // Start with a small radius and expand until we have enough
    let radius = this.cellSize;
    const max = maxRadius ?? Math.max(this.worldWidth, this.worldHeight);

    while (radius <= max) {
      const candidates = this.queryRadius(x, y, radius);

      if (candidates.length >= count) {
        // Sort by distance and return top N
        return candidates
          .map((entity) => {
            const pos = this.entityPositions.get(entity)!;
            const dx = pos.x - x;
            const dy = pos.y - y;
            return { entity, distSq: dx * dx + dy * dy };
          })
          .sort((a, b) => a.distSq - b.distSq)
          .slice(0, count)
          .map((e) => e.entity);
      }

      radius *= 2;
    }

    // Return all found if we couldn't find enough
    const all = this.queryRadius(x, y, max);
    return all
      .map((entity) => {
        const pos = this.entityPositions.get(entity)!;
        const dx = pos.x - x;
        const dy = pos.y - y;
        return { entity, distSq: dx * dx + dy * dy };
      })
      .sort((a, b) => a.distSq - b.distSq)
      .slice(0, count)
      .map((e) => e.entity);
  }

  /**
   * Get all entities in a specific cell.
   */
  getCell(cellX: number, cellY: number): ReadonlySet<Entity> | null {
    const cellIndex = cellY * this.gridWidth + cellX;
    return this.cells.get(cellIndex) ?? null;
  }

  /**
   * Get the total number of entities in the grid.
   */
  get size(): number {
    return this.entityPositions.size;
  }

  /**
   * Clear all entities from the grid.
   */
  clear(): void {
    this.cells.clear();
    this.entityPositions.clear();
    this.entityCells.clear();
  }

  /**
   * Get statistics about the grid.
   */
  getStats(): {
    totalEntities: number;
    occupiedCells: number;
    avgEntitiesPerCell: number;
    maxEntitiesInCell: number;
  } {
    let maxInCell = 0;
    for (const cell of this.cells.values()) {
      if (cell.size > maxInCell) {
        maxInCell = cell.size;
      }
    }

    return {
      totalEntities: this.entityPositions.size,
      occupiedCells: this.cells.size,
      avgEntitiesPerCell:
        this.cells.size > 0 ? this.entityPositions.size / this.cells.size : 0,
      maxEntitiesInCell: maxInCell,
    };
  }
}

/**
 * A spatial index that automatically syncs with ECS Position components.
 * Use this as a resource in your World.
 */
export class SpatialIndex {
  readonly grid: SpatialGrid;
  private positionComponentIndex: number | null = null;
  private xFieldName: string;
  private yFieldName: string;

  constructor(
    config: SpatialGridConfig,
    xField = "x",
    yField = "y",
  ) {
    this.grid = new SpatialGrid(config);
    this.xFieldName = xField;
    this.yFieldName = yField;
  }

  /**
   * Configure which Position-like component to track.
   */
  trackComponent<T>(componentType: ComponentClass<T>): void {
    const meta = getComponentMeta(componentType);
    this.positionComponentIndex = meta.id.index;
  }

  /**
   * Manually sync an entity's position from its component data.
   */
  syncEntity(world: World, entity: Entity, componentType: ComponentClass): void {
    const data = world.get(entity, componentType);
    if (!data) {
      this.grid.remove(entity);
      return;
    }

    const x = (data as Record<string, number>)[this.xFieldName];
    const y = (data as Record<string, number>)[this.yFieldName];

    if (x !== undefined && y !== undefined) {
      if (this.grid.has(entity)) {
        this.grid.update(entity, x, y);
      } else {
        this.grid.insert(entity, x, y);
      }
    }
  }

  /**
   * Remove an entity from the spatial index.
   */
  removeEntity(entity: Entity): void {
    this.grid.remove(entity);
  }

  // Delegate common queries to the grid
  queryRect(x: number, y: number, width: number, height: number): Entity[] {
    return this.grid.queryRect(x, y, width, height);
  }

  queryRadius(centerX: number, centerY: number, radius: number): Entity[] {
    return this.grid.queryRadius(centerX, centerY, radius);
  }

  queryNearest(
    x: number,
    y: number,
    count: number,
    maxRadius?: number,
  ): Entity[] {
    return this.grid.queryNearest(x, y, count, maxRadius);
  }

  getPosition(entity: Entity): { x: number; y: number } | null {
    return this.grid.getPosition(entity);
  }

  get size(): number {
    return this.grid.size;
  }

  clear(): void {
    this.grid.clear();
  }

  getStats() {
    return this.grid.getStats();
  }
}
