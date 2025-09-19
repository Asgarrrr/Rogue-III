import { z } from "zod";

const SharedFields = {
  width: z.number().int("Width must be an integer").min(10).max(10000),
  height: z.number().int("Height must be an integer").min(10).max(10000),
  roomSizeRange: z
    .tuple([
      z.number().int().min(3, "Minimum room size must be at least 3"),
      z.number().int().max(100, "Maximum room size cannot exceed 100"),
    ])
    .refine(([min, max]) => min <= max, {
      message: "Minimum room size must be ≤ maximum room size",
    }),
};

const CellularSchema = z
  .object({
    ...SharedFields,
    algorithm: z.literal("cellular"),
    roomCount: z.number().int().min(0).max(1000),
  })
  .superRefine((data, ctx) => {
    const max = data.roomSizeRange[1];
    if (!(max < data.width && max < data.height)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Maximum room size exceeds dungeon dimensions",
        path: ["roomSizeRange"],
      });
    }
    const maxReasonableRooms = (data.width * data.height) / 25;
    if (data.roomCount > maxReasonableRooms) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Too many rooms for dungeon size (max 1 room per 25 cells)",
        path: ["roomCount"],
      });
    }
  });

const BSPSchema = z
  .object({
    ...SharedFields,
    algorithm: z.literal("bsp"),
    roomCount: z.number().int().min(1).max(1000),
  })
  .superRefine((data, ctx) => {
    const max = data.roomSizeRange[1];
    if (!(max < data.width && max < data.height)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Maximum room size exceeds dungeon dimensions",
        path: ["roomSizeRange"],
      });
    }
    const maxReasonableRooms = (data.width * data.height) / 25;
    if (data.roomCount > maxReasonableRooms) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Too many rooms for dungeon size (max 1 room per 25 cells)",
        path: ["roomCount"],
      });
    }
  });

export const DungeonConfigSchema = z.discriminatedUnion("algorithm", [
  CellularSchema,
  BSPSchema,
]);

export type ValidatedDungeonConfig = z.infer<typeof DungeonConfigSchema>;
