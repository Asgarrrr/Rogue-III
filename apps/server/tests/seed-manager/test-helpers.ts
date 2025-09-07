import { DungeonSeed } from "../../src/engine/dungeon/core/types/dungeon.types";

export const testSeeds = {
	validNumericSeed: 123456789,
	validStringSeed: "test-seed-string",
	emptyStringSeed: "",
	negativeSeed: -123456,
	zeroSeed: 0,
	largeSeed: Number.MAX_SAFE_INTEGER,
	smallSeed: Number.MIN_SAFE_INTEGER,
};

export const mockSeed: DungeonSeed = {
	primary: 123456789,
	layout: 1720929108,
	rooms: 5123456,
	connections: 6234567,
	details: 7345678,
	version: "1.0.0",
	timestamp: 1640995200000,
};

export const createMockSeed = (
	overrides: Partial<DungeonSeed> = {}
): DungeonSeed => ({
	...mockSeed,
	...overrides,
});

export const generateTimestamp = (): number => Date.now();

export const wait = (ms: number): Promise<void> =>
	new Promise((resolve) => setTimeout(resolve, ms));
