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
 * Random choice from a non-empty array
 * @param rng - Random number generator function (returns 0 to 1)
 * @param array - The array to choose from (must have at least one element)
 * @returns A random element from the array
 * @throws {Error} If the array is empty
 */
export function choice<T>(rng: () => number, array: readonly [T, ...T[]]): T;
export function choice<T>(rng: () => number, array: readonly T[]): T | undefined;
export function choice<T>(rng: () => number, array: readonly T[]): T | undefined {
  if (array.length === 0) return undefined;
  const index = range(rng, 0, array.length - 1);
  return array[index];
}

/**
 * Fisher-Yates array shuffle
 * @param rng - Random number generator function (returns 0 to 1)
 * @param array - The array to shuffle
 * @returns A new shuffled array
 */
export function shuffle<T>(rng: () => number, array: readonly T[]): T[] {
  const result: T[] = Array.from(array);
  for (let i = result.length - 1; i > 0; i--) {
    const j = range(rng, 0, i);
    const temp = result[i] as T;
    result[i] = result[j] as T;
    result[j] = temp;
  }
  return result;
}

/**
 * Boolean with given probability
 * @param rng - Random number generator function (returns 0 to 1)
 * @param chance - The probability (0 to 1) of returning true
 */
export function probability(rng: () => number, chance: number): boolean {
  return rng() < chance;
}
