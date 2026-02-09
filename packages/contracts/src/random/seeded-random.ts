import { choice, probability, range, shuffle } from "./rng";

/**
 * Deterministic PRNG using the xoshiro128++ algorithm.
 *
 * - Fast 32-bit operations only (no BigInt overhead)
 * - Four 32-bit state words with SplitMix32 seeding
 * - Returns a double in [0, 1) with good distribution
 * - State can be saved/restored for perfect replayability
 *
 * Reference: https://prng.di.unimi.it/xoshiro128plusplus.c
 * This is the recommended replacement for xorshift128+
 */

/**
 * SplitMix32 for state initialization from a single seed.
 * Ensures good state diffusion even from poor seeds.
 */
function splitmix32(seed: number): () => number {
  let z = seed >>> 0;
  return () => {
    z = (z + 0x9e3779b9) >>> 0;
    let t = z;
    t = Math.imul(t ^ (t >>> 16), 0x21f0aaad);
    t = Math.imul(t ^ (t >>> 15), 0x735a2d97);
    return (t ^ (t >>> 15)) >>> 0;
  };
}

/**
 * 32-bit rotate left
 */
function rotl(x: number, k: number): number {
  return ((x << k) | (x >>> (32 - k))) >>> 0;
}

/**
 * State type for xoshiro128++ (4 x 32-bit words)
 */
export type RngState = [number, number, number, number];

export class SeededRandom {
  private s: RngState;

  constructor(seed: number | bigint) {
    // Convert bigint to number if necessary (take lower 32 bits)
    const seedNum =
      typeof seed === "bigint" ? Number(seed & 0xffffffffn) : seed;
    const mix = splitmix32(seedNum >>> 0);

    // Initialize state with splitmix32
    this.s = [mix(), mix(), mix(), mix()];

    // Ensure non-zero state (xoshiro requires at least one non-zero word)
    if ((this.s[0] | this.s[1] | this.s[2] | this.s[3]) === 0) {
      this.s[0] = 1;
    }

    // Warm up to scatter initial correlation
    for (let i = 0; i < 8; i++) {
      this.next32();
    }
  }

  /**
   * Generate next 32-bit random value (xoshiro128++ algorithm)
   */
  private next32(): number {
    const s = this.s;
    const result = (rotl((s[0] + s[3]) >>> 0, 7) + s[0]) >>> 0;

    const t = (s[1] << 9) >>> 0;

    s[2] ^= s[0];
    s[3] ^= s[1];
    s[1] ^= s[2];
    s[0] ^= s[3];

    s[2] ^= t;
    s[3] = rotl(s[3], 11);

    return result;
  }

  /**
   * Generate next random number in [0, 1)
   */
  next(): number {
    // Use the full 32 bits divided by 2^32
    return this.next32() / 0x100000000;
  }

  /**
   * Random integer between min and max (inclusive)
   * @param min - The minimum value
   * @param max - The maximum value
   * @returns A random integer between min and max
   */
  range(min: number, max: number): number {
    return range(() => this.next(), min, max);
  }

  /**
   * Random choice from a non-empty array
   * @param array - The array to choose from (must have at least one element)
   * @returns A random element from the array
   */
  choice<T>(array: readonly [T, ...T[]]): T;
  choice<T>(array: readonly T[]): T | undefined;
  choice<T>(array: readonly T[]): T | undefined {
    return choice(() => this.next(), array);
  }

  /**
   * Fisher-Yates array shuffle
   * @param array - The array to shuffle
   * @returns A new shuffled array
   */
  shuffle<T>(array: readonly T[]): T[] {
    return shuffle(() => this.next(), array);
  }

  /**
   * Boolean with given probability
   * @param chance - The probability of the boolean
   */
  probability(chance: number): boolean {
    return probability(() => this.next(), chance);
  }

  /**
   * Save internal state for exact reproduction
   * @returns The current state (4 x 32-bit words)
   */
  getState(): RngState {
    return [...this.s] as RngState;
  }

  /**
   * Restore saved state
   * @param state - The state to restore (4 x 32-bit words)
   */
  setState(state: RngState): void {
    this.s = [state[0] >>> 0, state[1] >>> 0, state[2] >>> 0, state[3] >>> 0];
  }

  /**
   * @deprecated Use getState() which now returns RngState (4 numbers)
   * Legacy compatibility: convert old bigint state format
   */
  setStateLegacy(state: [bigint, bigint]): void {
    // Convert old 2x64-bit state to new 4x32-bit state
    // This won't produce identical sequences but allows loading old saves
    const low0 = Number(state[0] & 0xffffffffn);
    const high0 = Number((state[0] >> 32n) & 0xffffffffn);
    const low1 = Number(state[1] & 0xffffffffn);
    const high1 = Number((state[1] >> 32n) & 0xffffffffn);
    this.s = [low0 >>> 0, high0 >>> 0, low1 >>> 0, high1 >>> 0];
  }
}
