import { z } from "zod";

export const DungeonConfigSchema = z
	.object({
		width: z
			.number()
			.int("Width must be an integer")
			.min(10, "Width must be at least 10")
			.max(10000, "Width cannot exceed 10000"),

		height: z
			.number()
			.int("Height must be an integer")
			.min(10, "Height must be at least 10")
			.max(10000, "Height cannot exceed 10000"),

		roomCount: z
			.number()
			.int("Room count must be an integer")
			.min(1, "Must have at least 1 room")
			.max(1000, "Cannot exceed 1000 rooms"),

		roomSizeRange: z
			.tuple([
				z.number().int().min(3, "Minimum room size must be at least 3"),
				z.number().int().max(100, "Maximum room size cannot exceed 100"),
			])
			.refine(([min, max]) => min <= max, {
				message: "Minimum room size must be ≤ maximum room size",
			}),

		algorithm: z.enum(["cellular", "bsp"], {
			message: 'Algorithm must be "cellular" or "bsp"',
		}),
	})
	.refine(
		(config) => {
			const maxReasonableRooms = (config.width * config.height) / 25;
			return config.roomCount <= maxReasonableRooms;
		},
		{
			message: "Too many rooms for dungeon size (max 1 room per 25 cells)",
			path: ["roomCount"],
		}
	)
	.refine(
		(config) => {
			const maxRoomSize = config.roomSizeRange[1];
			return maxRoomSize < config.width && maxRoomSize < config.height;
		},
		{
			message: "Maximum room size exceeds dungeon dimensions",
			path: ["roomSizeRange"],
		}
	);

export type ValidatedDungeonConfig = z.infer<typeof DungeonConfigSchema>;
