import { SpatialHash } from "../../dungeon/core/grid/spatial-hash";
import type { Bounds } from "../../dungeon/core/grid/types";
import type { EntityId } from "../core/types";

interface SpatialPoint {
  entity: EntityId;
  x: number;
  y: number;
}

export class SpatialIndexResource {
  private readonly hash: SpatialHash<SpatialPoint>;
  private readonly byEntity: Map<EntityId, SpatialPoint> = new Map();

  constructor(cellSize: number, width: number, height: number) {
    const bounds: Bounds = {
      minX: 0,
      minY: 0,
      maxX: width,
      maxY: height,
    };
    this.hash = new SpatialHash<SpatialPoint>(cellSize, bounds);
  }

  setBounds(width: number, height: number): void {
    const bounds: Bounds = { minX: 0, minY: 0, maxX: width, maxY: height };
    this.hash.setBounds(bounds);
  }

  upsert(entity: EntityId, x: number, y: number): void {
    const existing = this.byEntity.get(entity);
    if (existing) {
      // If position changed, update spatial hash
      if (existing.x !== x || existing.y !== y) {
        this.hash.remove({ x: existing.x, y: existing.y }, existing);
        existing.x = x;
        existing.y = y;
        this.hash.insert({ x, y }, existing);
      }
      return;
    }
    const point: SpatialPoint = { entity, x, y };
    this.byEntity.set(entity, point);
    this.hash.insert({ x, y }, point);
  }

  remove(entity: EntityId): void {
    const existing = this.byEntity.get(entity);
    if (!existing) return;
    this.hash.remove({ x: existing.x, y: existing.y }, existing);
    this.byEntity.delete(entity);
  }

  queryRect(x: number, y: number, width: number, height: number): EntityId[] {
    const points = this.hash.queryRect(x, y, width, height);
    return points.map((p) => p.entity);
  }

  queryRadius(x: number, y: number, radius: number): EntityId[] {
    const points = this.hash.queryRadius({ x, y }, radius);
    return points.map((p) => p.entity);
  }

  stats() {
    return this.hash.getStats();
  }
}
