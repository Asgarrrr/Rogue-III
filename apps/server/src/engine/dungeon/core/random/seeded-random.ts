import { choice, probability, range, shuffle } from "../utils";

/**
 * Deterministic PRNG using xorshift128+ algorithm
 * Faster than Math.random() and fully reproducible
 * @see {@link http://xorshift.di.unimi.it/xorshift128plus.c|Xorshift128+ algorithm}
 */
export class SeededRandom {
	private state: [number, number, number, number];

	constructor(seed: number) {
		this.state = [
			seed & 0xffffffff,
			(seed >>> 16) & 0xffffffff,
			seed * 0x41c64e6d + 0x3039,
			seed * 0x6c078965 + 0x1,
		];

		for (let i = 0; i < 10; i++) this.next();
	}

	/**
	 * Generate next random number (0 to 1)
	 */
	next(): number {
		const [s0, s1, s2, s3] = this.state;

		// xorshift128+ algorithm
		let t = s1 << 11;
		t ^= t >>> 8;
		t ^= s0;
		t ^= s0 >>> 19;

		this.state[0] = s1;
		this.state[1] = s2;
		this.state[2] = s3;
		this.state[3] = t;

		return ((s0 + t) >>> 0) / 0xffffffff;
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
	getState(): [number, number, number, number] {
		return [...this.state];
	}

	/**
	 * Restore saved state
	 * @param state - The state to restore
	 */
	setState(state: [number, number, number, number]): void {
		this.state = [...state];
	}
}
