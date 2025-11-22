import type { EntityId } from "./types";

// 32-bit entity id encoding: [generation (12 bits)][index (20 bits)]
const INDEX_BITS = 20;
const GEN_BITS = 12;
const INDEX_MASK = (1 << INDEX_BITS) - 1; // 0x000F_FFFF
const GEN_MASK = (1 << GEN_BITS) - 1; // 0x0000_0FFF

function encodeEntityId(index: number, generation: number): EntityId {
	return ((generation & GEN_MASK) << INDEX_BITS) | (index & INDEX_MASK);
}

export function getIndexFromEntityId(id: EntityId): number {
	return id & INDEX_MASK;
}

export function getGenerationFromEntityId(id: EntityId): number {
	return (id >>> INDEX_BITS) & GEN_MASK;
}

export class EntityManager {
	private capacity: number;
	private size: number;
	private generationByIndex: Uint16Array;
	private freeList: number[];

	constructor(initialCapacity: number = 1024) {
		this.capacity = Math.max(16, initialCapacity);
		this.size = 0;
		this.generationByIndex = new Uint16Array(this.capacity);
		this.freeList = [];
	}

	getCapacity(): number {
		return this.capacity;
	}

	getAliveCount(): number {
		return this.size - this.freeList.length;
	}

	create(): EntityId {
		let index: number;
		if (this.freeList.length > 0) {
			index = this.freeList.pop() as number;
		} else {
			if (this.size >= this.capacity) this.grow(this.capacity * 2);
			index = this.size++;
		}
		const generation = this.generationByIndex[index];
		return encodeEntityId(index, generation);
	}

	destroy(id: EntityId): void {
		const index = getIndexFromEntityId(id);
		const generation = getGenerationFromEntityId(id);
		if (!this.isAlive(id)) return;
		// Invalidate by bumping generation
		this.generationByIndex[index] = (generation + 1) & GEN_MASK;
		this.freeList.push(index);
	}

	isAlive(id: EntityId): boolean {
		const index = getIndexFromEntityId(id);
		const generation = getGenerationFromEntityId(id);
		if (index >= this.capacity) return false;
		return this.generationByIndex[index] === generation;
	}

	private grow(newCapacity: number): void {
		const next = new Uint16Array(newCapacity);
		next.set(this.generationByIndex);
		this.generationByIndex = next;
		this.capacity = newCapacity;
	}
}
