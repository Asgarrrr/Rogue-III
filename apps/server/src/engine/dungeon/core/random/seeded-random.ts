import { choice, probability, range, shuffle } from "../utils";

/**
 * Deterministic PRNG using the 64-bit xorshift128+ algorithm.
 *
 * - Two 64-bit lanes with SplitMix64 seeding for decorrelated streams
 * - Returns a 53-bit mantissa-friendly double in [0, 1)
 * - State can be saved/restored for perfect replayability
 *
 * Reference: http://xorshift.di.unimi.it/xorshift128plus.c
 */
const UINT64_MASK = (1n << 64n) - 1n;
const DOUBLE_DENOMINATOR = 0x1fffffffffffffn; // 2^53 - 1, max safe mantissa

function splitMix64(seed: bigint): bigint {
  let z = (seed + 0x9e3779b97f4a7c15n) & UINT64_MASK;
  z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & UINT64_MASK;
  z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & UINT64_MASK;
  return z ^ (z >> 31n);
}

export class SeededRandom {
  private state: [bigint, bigint];

  constructor(seed: number | bigint) {
    const normalized = BigInt.asUintN(64, BigInt(seed));
    const s0 = splitMix64(normalized);
    let s1 = splitMix64(normalized ^ 0x9e3779b97f4a7c15n);
    // Avoid the all-zero forbidden state
    if ((s0 | s1) === 0n) {
      s1 = 1n;
    }
    this.state = [s0 & UINT64_MASK, s1 & UINT64_MASK];

    // Warm up to scatter initial correlation
    for (let i = 0; i < 8; i++) {
      this.next();
    }
  }

  private next64(): bigint {
    let s1 = this.state[0];
    const s0 = this.state[1];

    this.state[0] = s0;
    s1 ^= s1 << 23n;
    s1 ^= s1 >> 17n;
    s1 ^= s0;
    s1 ^= s0 >> 26n;
    this.state[1] = s1 & UINT64_MASK;

    return (this.state[0] + this.state[1]) & UINT64_MASK;
  }

  /**
   * Generate next random number (0 to 1)
   */
  next(): number {
    // Use the upper 53 bits to create a stable double in [0, 1)
    const value = this.next64() >> 11n;
    return Number(value) / Number(DOUBLE_DENOMINATOR);
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
   * Random choice from array
   * @param array - The array to choose from
   * @returns A random choice from the array
   */
  choice<T>(array: T[]): T {
    return choice(() => this.next(), array);
  }

  /**
   * Fisher-Yates array shuffle
   * @param array - The array to shuffle
   * @returns The shuffled array
   */
  shuffle<T>(array: T[]): T[] {
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
   * @returns The current state
   */
  getState(): [bigint, bigint] {
    return [...this.state];
  }

  /**
   * Restore saved state
   * @param state - The state to restore
   */
  setState(state: [bigint, bigint]): void {
    this.state = [state[0] & UINT64_MASK, state[1] & UINT64_MASK];
  }
}
