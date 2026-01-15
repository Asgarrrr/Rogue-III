import { getComponentMeta } from "../core/component";
import { assertDefined, type ComponentClass, type Entity } from "../core/types";
import type { World } from "../core/world";

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
 * The queryNearest method uses a max-heap for O(n log k) complexity
 * instead of naive O(n log n) sorting, making it very efficient when
 * k << n (e.g., finding nearest entity among thousands).
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
 *
 * // Find 5 nearest entities (very efficient even with thousands of candidates)
 * const nearest = grid.queryNearest(100, 150, 5);
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

  private getEntityPosition(entity: Entity): { x: number; y: number } {
    const pos = this.entityPositions.get(entity);
    assertDefined(pos, `SpatialGrid: entity ${entity} not found in grid`);
    return pos;
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
          const pos = this.getEntityPosition(entity);
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
          const pos = this.getEntityPosition(entity);
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
   * Uses a max-heap to efficiently find k nearest in O(n log k) instead of O(n log n).
   *
   * @param x - X coordinate of query point
   * @param y - Y coordinate of query point
   * @param count - Number of nearest entities to return
   * @param maxRadius - Maximum radius to search within (optional)
   * @returns Array of entities sorted by distance (nearest first)
   */
  queryNearest(
    x: number,
    y: number,
    count: number,
    maxRadius?: number,
  ): Entity[] {
    if (count <= 0) return [];

    // Collect all candidates within maxRadius
    const max = maxRadius ?? Math.max(this.worldWidth, this.worldHeight);
    const candidates = this.queryRadius(x, y, max);

    if (candidates.length === 0) return [];

    // If we have fewer candidates than requested, sort and return all
    if (candidates.length <= count) {
      return this.sortByDistance(candidates, x, y);
    }

    // Use max-heap of size k to find k nearest in O(n log k)
    // Max-heap property: parent >= children (root is maximum)
    // This allows us to efficiently track the k nearest by replacing the farthest
    const heap: Array<{ entity: Entity; distSq: number }> = [];

    for (const entity of candidates) {
      const pos = this.getEntityPosition(entity);
      const dx = pos.x - x;
      const dy = pos.y - y;
      const distSq = dx * dx + dy * dy;

      if (heap.length < count) {
        // Heap not full, push new element and maintain heap property
        heap.push({ entity, distSq });
        this.heapBubbleUp(heap, heap.length - 1);
      } else if (distSq < heap[0]!.distSq) {
        // Found closer entity than current farthest (root)
        // Replace root and restore heap property
        heap[0] = { entity, distSq };
        this.heapBubbleDown(heap, 0);
      }
    }

    // Extract sorted result from heap (smallest to largest)
    // Extract max repeatedly, which gives us descending order
    // Then reverse to get ascending order (nearest first)
    const result: Entity[] = new Array(heap.length);
    for (let i = heap.length - 1; i >= 0; i--) {
      result[i] = heap[0]!.entity;
      const last = heap.pop()!;
      if (heap.length > 0) {
        heap[0] = last;
        this.heapBubbleDown(heap, 0);
      }
    }

    return result;
  }

  /**
   * Sort entities by distance to a point.
   * Used for small arrays where heap overhead isn't worth it.
   */
  private sortByDistance(entities: Entity[], x: number, y: number): Entity[] {
    return entities
      .map((entity) => {
        const pos = this.getEntityPosition(entity);
        const dx = pos.x - x;
        const dy = pos.y - y;
        return { entity, distSq: dx * dx + dy * dy };
      })
      .sort((a, b) => a.distSq - b.distSq)
      .map((e) => e.entity);
  }

  /**
   * Restore max-heap property by bubbling element up.
   * Used after inserting at the end of the heap.
   *
   * Time complexity: O(log k) where k is heap size
   */
  private heapBubbleUp(
    heap: Array<{ entity: Entity; distSq: number }>,
    index: number,
  ): void {
    while (index > 0) {
      const parentIndex = (index - 1) >> 1; // Fast divide by 2
      if (heap[index]!.distSq <= heap[parentIndex]!.distSq) break;

      // Swap with parent
      const temp = heap[index]!;
      heap[index] = heap[parentIndex]!;
      heap[parentIndex] = temp;
      index = parentIndex;
    }
  }

  /**
   * Restore max-heap property by bubbling element down.
   * Used after replacing the root.
   *
   * Time complexity: O(log k) where k is heap size
   */
  private heapBubbleDown(
    heap: Array<{ entity: Entity; distSq: number }>,
    index: number,
  ): void {
    const length = heap.length;
    while (true) {
      let largest = index;
      const left = 2 * index + 1;
      const right = 2 * index + 2;

      // Find largest among node and its children
      if (left < length && heap[left]!.distSq > heap[largest]!.distSq) {
        largest = left;
      }
      if (right < length && heap[right]!.distSq > heap[largest]!.distSq) {
        largest = right;
      }

      // If node is already largest, heap property satisfied
      if (largest === index) break;

      // Swap with largest child
      const temp = heap[index]!;
      heap[index] = heap[largest]!;
      heap[largest] = temp;
      index = largest;
    }
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
  private xFieldName: string;
  private yFieldName: string;

  constructor(config: SpatialGridConfig, xField = "x", yField = "y") {
    this.grid = new SpatialGrid(config);
    this.xFieldName = xField;
    this.yFieldName = yField;
  }

  /**
   * Configure which Position-like component to track.
   * Returns the component index for reference.
   */
  trackComponent<T>(componentType: ComponentClass<T>): number {
    const meta = getComponentMeta(componentType);
    return meta.id.index;
  }

  /**
   * Manually sync an entity's position from its component data.
   */
  syncEntity(
    world: World,
    entity: Entity,
    componentType: ComponentClass,
  ): void {
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
