import { DungeonManager } from "./dungeon-manager";
import { AsciiDisplay } from "./core/utils";
import z from "zod";
import { DungeonConfig } from "./core/types";

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
	roomSizeRange: [1, 10],
	algorithm: "cellular",
} satisfies DungeonConfig;

const dungeon = DungeonManager.generateFromSeedSync(
	Math.random(),
	exampleConfig
);

if (dungeon instanceof z.ZodError) {
	console.error("❌ Failed to generate dungeon:", dungeon);
} else {
	// console.log(AsciiDisplay.displaySummary(dungeon));
	console.log(AsciiDisplay.displayDungeon(dungeon, false));
}
