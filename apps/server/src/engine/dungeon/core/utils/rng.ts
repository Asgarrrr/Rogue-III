/**
 * Utility functions for random operations using any number generator
 */

/**
 * Random integer between min and max (inclusive)
 * @param rng - Random number generator function (returns 0 to 1)
 * @param min - The minimum value
 * @param max - The maximum value
 * @returns A random integer between min and max
 */
export function range(rng: () => number, min: number, max: number): number {
  return ~~(rng() * (max - min + 1)) + min;
}

/**
 * Random choice from array
 * @param rng - Random number generator function (returns 0 to 1)
 * @param array - The array to choose from
 * @returns A random choice from the array
 */
export function choice<T>(rng: () => number, array: T[]): T {
  return array[range(rng, 0, array.length - 1)];
}

/**
 * Fisher-Yates array shuffle
 * @param rng - Random number generator function (returns 0 to 1)
 * @param array - The array to shuffle
 * @returns The shuffled array
 */
export function shuffle<T>(rng: () => number, array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = range(rng, 0, i);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Boolean with given probability
 * @param rng - Random number generator function (returns 0 to 1)
 * @param chance - The probability of the boolean
 */
export function probability(rng: () => number, chance: number): boolean {
  return rng() < chance;
}
