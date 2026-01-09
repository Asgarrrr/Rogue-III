/**
 * Entity ID Management
 *
 * Provides utilities for creating and manipulating Entity IDs.
 * Entity = 32-bit integer: [index:16][generation:16]
 */

import { __DEV__, ENTITY_CONFIG, type Entity, NULL_ENTITY } from "../types";

const {
  INDEX_BITS,
  GENERATION_BITS,
  MAX_ENTITIES,
  INDEX_MASK,
  GENERATION_MASK,
} = ENTITY_CONFIG;

/**
 * Creates an Entity from index and generation.
 */
export function createEntity(index: number, generation: number): Entity {
  if (__DEV__) {
    if (index < 0 || index >= MAX_ENTITIES) {
      throw new RangeError(
        `Entity index ${index} out of bounds [0, ${MAX_ENTITIES})`,
      );
    }
    if (generation < 0 || generation > GENERATION_MASK) {
      throw new RangeError(
        `Generation ${generation} out of bounds [0, ${GENERATION_MASK}]`,
      );
    }
  }
  return ((index << GENERATION_BITS) | generation) as Entity;
}

/**
 * Extracts the index from an Entity ID.
 */
export function getIndex(entity: Entity): number {
  return entity >>> GENERATION_BITS;
}

/**
 * Extracts the generation from an Entity ID.
 */
export function getGeneration(entity: Entity): number {
  return entity & GENERATION_MASK;
}

/**
 * Checks if an entity is valid (not NULL_ENTITY and non-negative).
 */
export function isValidEntity(entity: Entity): boolean {
  return entity !== NULL_ENTITY && entity >= 0;
}

/**
 * Returns a human-readable string representation of an Entity.
 */
export function entityToString(entity: Entity): string {
  if (entity === NULL_ENTITY) return "Entity(NULL)";
  return `Entity(idx=${getIndex(entity)}, gen=${getGeneration(entity)})`;
}

export { NULL_ENTITY, MAX_ENTITIES, GENERATION_MASK, INDEX_MASK };
