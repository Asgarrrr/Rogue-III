import type { EntityId } from "./types";
import { getIndexFromEntityId } from "./entity";

// Generic SparseSet storing entity ids and aligned component payloads.
// O(1) add/remove/has via sparse index mapping and dense arrays, swap-remove on delete.

export class SparseSet<T> {
	private sparseIndicesByEntityIndex: Int32Array;
	private denseEntities: EntityId[];
	private denseData: T[];

	constructor(entityCapacity: number = 1024) {
		this.sparseIndicesByEntityIndex = new Int32Array(entityCapacity);
		this.sparseIndicesByEntityIndex.fill(-1);
		this.denseEntities = [];
		this.denseData = [];
	}

	ensureSparseCapacity(entityCapacity: number): void {
		if (entityCapacity <= this.sparseIndicesByEntityIndex.length) return;
		const next = new Int32Array(entityCapacity);
		next.fill(-1);
		next.set(this.sparseIndicesByEntityIndex);
		this.sparseIndicesByEntityIndex = next;
	}

	size(): number {
		return this.denseEntities.length;
	}

	has(entity: EntityId): boolean {
		const eIndex = getIndexFromEntityId(entity);
		if (eIndex >= this.sparseIndicesByEntityIndex.length) return false;
		const denseIndex = this.sparseIndicesByEntityIndex[eIndex];
		return denseIndex >= 0 && this.denseEntities[denseIndex] === entity;
	}

	get(entity: EntityId): T | undefined {
		const eIndex = getIndexFromEntityId(entity);
		if (eIndex >= this.sparseIndicesByEntityIndex.length) return undefined;
		const denseIndex = this.sparseIndicesByEntityIndex[eIndex];
		if (denseIndex < 0) return undefined;
		if (this.denseEntities[denseIndex] !== entity) return undefined;
		return this.denseData[denseIndex];
	}

	set(entity: EntityId, data: T): number /* dense index */ {
		const eIndex = getIndexFromEntityId(entity);
		this.ensureSparseCapacity(eIndex + 1);
		const denseIndex = this.sparseIndicesByEntityIndex[eIndex];
		if (denseIndex >= 0 && this.denseEntities[denseIndex] === entity) {
			this.denseData[denseIndex] = data;
			return denseIndex;
		}
		const newDense = this.denseEntities.length;
		this.denseEntities.push(entity);
		this.denseData.push(data);
		this.sparseIndicesByEntityIndex[eIndex] = newDense;
		return newDense;
	}

	getDenseIndex(entity: EntityId): number {
		const eIndex = getIndexFromEntityId(entity);
		if (eIndex >= this.sparseIndicesByEntityIndex.length) return -1;
		const denseIndex = this.sparseIndicesByEntityIndex[eIndex];
		if (denseIndex < 0) return -1;
		if (this.denseEntities[denseIndex] !== entity) return -1;
		return denseIndex;
	}

	remove(entity: EntityId): boolean {
		const eIndex = getIndexFromEntityId(entity);
		if (eIndex >= this.sparseIndicesByEntityIndex.length) return false;
		const denseIndex = this.sparseIndicesByEntityIndex[eIndex];
		if (denseIndex < 0 || this.denseEntities[denseIndex] !== entity)
			return false;

		const lastIndex = this.denseEntities.length - 1;
		if (denseIndex !== lastIndex) {
			// swap with last
			const lastEntity = this.denseEntities[lastIndex];
			this.denseEntities[denseIndex] = lastEntity;
			this.denseData[denseIndex] = this.denseData[lastIndex];
			const lastEntityIndex = getIndexFromEntityId(lastEntity);
			this.sparseIndicesByEntityIndex[lastEntityIndex] = denseIndex;
		}
		// remove last
		this.denseEntities.pop();
		this.denseData.pop();
		this.sparseIndicesByEntityIndex[eIndex] = -1;
		return true;
	}

	forEach(
		callback: (entity: EntityId, data: T, denseIndex: number) => void
	): void {
		for (let i = 0; i < this.denseEntities.length; i++) {
			callback(this.denseEntities[i], this.denseData[i], i);
		}
	}

	getDenseEntities(): readonly EntityId[] {
		return this.denseEntities;
	}

	getDenseData(): readonly T[] {
		return this.denseData;
	}
}
