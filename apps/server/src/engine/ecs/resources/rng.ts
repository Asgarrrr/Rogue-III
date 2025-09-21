import { SeededRandom } from "../../dungeon/core/random/seeded-random";

function hashStringToNumber(input: string): number {
	let h = 2166136261 >>> 0; // FNV-1a base
	for (let i = 0; i < input.length; i++) {
		h ^= input.charCodeAt(i);
		h = Math.imul(h, 16777619);
	}
	return h >>> 0;
}

export class RngResource {
	private readonly baseSeed: number;
	private readonly base: SeededRandom;

	constructor(baseSeed: number) {
		this.baseSeed = baseSeed >>> 0;
		this.base = new SeededRandom(this.baseSeed);
	}

	next(): number {
		return this.base.next();
	}

	systemRng(systemName: string): SeededRandom {
		const s = (this.baseSeed ^ hashStringToNumber(systemName)) >>> 0;
		return new SeededRandom(s);
	}
}
