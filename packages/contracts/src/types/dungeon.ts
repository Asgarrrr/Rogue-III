import type { z } from "zod";
import type { DungeonConfigSchema } from "../schemas/dungeon";
import type { DungeonSeedSchema } from "../schemas/seed";

export type DungeonConfig = z.infer<typeof DungeonConfigSchema>;

// Brand symbol for compile-time safety
declare const DungeonSeedBrand: unique symbol;

// Brand the type to prevent raw objects from being accepted
export type DungeonSeed = z.infer<typeof DungeonSeedSchema> & {
  readonly [DungeonSeedBrand]: true;
};
