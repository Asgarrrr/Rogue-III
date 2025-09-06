import { DungeonManager } from "./dungeon-manager";
import { AsciiDisplay } from "./core/utils";

export { DungeonManager } from "./dungeon-manager";
export { DungeonGenerator } from "./generators/base/dungeon-generator";
export { SeedManager } from "./serialization";
export * from "./entities";
export * from "./core/types";
export * from "./core/utils";

export const exampleConfig = {
	width: 100,
	height: 100,
	roomCount: 15,
	roomSizeRange: [8, 20] as [number, number],
	algorithm: "cellular",
};

const dungeon = await DungeonManager.generateFromSeedAsync(
	123456789,
	exampleConfig
);

console.log(dungeon);

console.log(AsciiDisplay.displaySummary(dungeon));
console.log(AsciiDisplay.displayDungeon(dungeon, false));
