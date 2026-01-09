import type { z } from "zod";
import type { DungeonConfigSchema } from "../schemas/dungeon";
import type { DungeonSeedSchema } from "../schemas/seed";

export type DungeonConfig = z.infer<typeof DungeonConfigSchema>;
export type DungeonSeed = z.infer<typeof DungeonSeedSchema>;
