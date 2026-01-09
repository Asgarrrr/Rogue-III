/**
 * Entity Manager
 *
 * Responsible for the lifecycle of entities: creation, destruction, and recycling.
 * Uses generation counters to detect stale references.
 */

import { __DEV__, ENTITY_CONFIG, type Entity } from "../types";
import {
  createEntity,
  GENERATION_MASK,
  getGeneration,
  getIndex,
} from "./entity";

const { MAX_ENTITIES } = ENTITY_CONFIG;

export interface EntityManager {
  // Creation
  spawn(): Entity;
  spawnBatch(count: number): Entity[];

  // Destruction
  despawn(entity: Entity): void;
  despawnBatch(entities: Entity[]): void;

  // Queries
  isAlive(entity: Entity): boolean;
  getAliveCount(): number;
  getAllAlive(): Entity[];

  // Internals
  recycle(entity: Entity): void;
}

/**
 * Implementation of EntityManager with ID recycling and generation tracking.
 */
export class EntityManagerImpl implements EntityManager {
  private readonly alive: Uint8Array;
  private readonly generation: Uint16Array;
  private readonly freeList: number[];
  private nextId: number;
  private aliveCount: number;

  constructor(maxEntities: number = MAX_ENTITIES) {
    this.alive = new Uint8Array(maxEntities);
    this.generation = new Uint16Array(maxEntities);
    this.freeList = [];
    this.nextId = 0;
    this.aliveCount = 0;
  }

  spawn(): Entity {
    let index: number;

    if (this.freeList.length > 0) {
      index = this.freeList.pop()!;
    } else {
      index = this.nextId++;
      if (index >= MAX_ENTITIES) {
        throw new Error(`Max entities (${MAX_ENTITIES}) reached`);
      }
    }

    this.alive[index] = 1;
    this.aliveCount++;
    const gen = this.generation[index];

    return createEntity(index, gen);
  }

  spawnBatch(count: number): Entity[] {
    const entities: Entity[] = new Array(count);
    for (let i = 0; i < count; i++) {
      entities[i] = this.spawn();
    }
    return entities;
  }

  despawn(entity: Entity): void {
    const index = getIndex(entity);
    const gen = getGeneration(entity);

    if (__DEV__) {
      if (this.generation[index] !== gen) {
        throw new Error("Stale entity reference: generation mismatch");
      }
      if (!this.alive[index]) {
        throw new Error("Entity already dead");
      }
    }

    this.alive[index] = 0;
    this.aliveCount--;
    this.generation[index] = (gen + 1) & GENERATION_MASK;
    this.freeList.push(index);
  }

  despawnBatch(entities: Entity[]): void {
    for (const entity of entities) {
      this.despawn(entity);
    }
  }

  isAlive(entity: Entity): boolean {
    const index = getIndex(entity);
    const gen = getGeneration(entity);

    return this.alive[index] === 1 && this.generation[index] === gen;
  }

  getAliveCount(): number {
    return this.aliveCount;
  }

  getAllAlive(): Entity[] {
    const result: Entity[] = [];
    const maxIndex = this.nextId;

    for (let i = 0; i < maxIndex; i++) {
      if (this.alive[i] === 1) {
        result.push(createEntity(i, this.generation[i]));
      }
    }

    return result;
  }

  recycle(entity: Entity): void {
    this.despawn(entity);
  }

  /**
   * Resets the entity manager to initial state.
   */
  reset(): void {
    this.alive.fill(0);
    this.generation.fill(0);
    this.freeList.length = 0;
    this.nextId = 0;
    this.aliveCount = 0;
  }

  /**
   * Returns the current generation for a given index.
   * Useful for debugging and validation.
   */
  getGenerationAt(index: number): number {
    return this.generation[index];
  }
}
