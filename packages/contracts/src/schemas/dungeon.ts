import { z } from "zod";

export const MAX_DUNGEON_CELLS = 1_000_000;
export const ROOM_DENSITY_DIVISOR = 25;

const ContentGenerationParamsSchema = z
  .object({
    difficulty: z.number().int().min(1).max(10).optional(),
    enemyDensity: z.number().min(0).max(1).optional(),
    itemDensity: z.number().min(0).max(1).optional(),
    trapChance: z.number().min(0).max(1).optional(),
    decorationChance: z.number().min(0).max(1).optional(),
    enableTreasureRooms: z.boolean().optional(),
    enableTraps: z.boolean().optional(),
  })
  .optional();

const SharedFields = {
  width: z.number().int("Width must be an integer").min(10).max(10000),
  height: z.number().int("Height must be an integer").min(10).max(10000),
  roomSizeRange: z
    .tuple([
      z.number().int().min(3, "Minimum room size must be at least 3"),
      z.number().int().max(100, "Maximum room size cannot exceed 100"),
    ])
    .refine(([min, max]) => min <= max, {
      message: "Minimum room size must be <= maximum room size",
    }),
  content: ContentGenerationParamsSchema,
};

const ensureDimensionsSafe = (
  data: { width: number; height: number; roomSizeRange: [number, number] },
  ctx: z.RefinementCtx,
) => {
  const maxRoom = data.roomSizeRange[1];
  if (!(maxRoom < data.width && maxRoom < data.height)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Maximum room size exceeds dungeon dimensions",
      path: ["roomSizeRange"],
    });
  }
};

const clampRoomCount = <
  T extends { width: number; height: number; roomCount: number },
>(
  data: T,
  minimumRoomCount: number,
): T => {
  const area = data.width * data.height;
  const maxRooms = Math.max(
    minimumRoomCount,
    Math.floor(area / ROOM_DENSITY_DIVISOR),
  );
  const clampedRoomCount = Math.min(data.roomCount, maxRooms);
  return { ...data, roomCount: clampedRoomCount };
};

const CellularSchema = z
  .object({
    ...SharedFields,
    algorithm: z.literal("cellular"),
    roomCount: z.number().int().min(0).max(1000),
  })
  .superRefine((data, ctx) => {
    ensureDimensionsSafe(data, ctx);
  })
  .transform((data) => clampRoomCount(data, 0));

const BSPSchema = z
  .object({
    ...SharedFields,
    algorithm: z.literal("bsp"),
    roomCount: z.number().int().min(1).max(1000),
  })
  .superRefine((data, ctx) => {
    ensureDimensionsSafe(data, ctx);
  })
  .transform((data) => clampRoomCount(data, 1));

export const DungeonConfigSchema = z.discriminatedUnion("algorithm", [
  CellularSchema,
  BSPSchema,
]);

export type ValidatedDungeonConfig = z.infer<typeof DungeonConfigSchema>;
