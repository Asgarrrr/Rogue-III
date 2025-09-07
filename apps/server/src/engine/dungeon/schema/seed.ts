import { z } from "zod";

export const DungeonSeedSchema = z.object({
	primary: z.int(),
	layout: z.int(),
	rooms: z.int(),
	connections: z.int(),
	details: z.int(),
	version: z
		.string()
		.regex(/^\d+\.\d+\.\d+$/, { error: "Invalid version format" }),
	timestamp: z.int().positive({ error: "Timestamp must be positive" }),
});

export const EncodedSeedSchema = z
	.base64url()
	.min(1, { error: "Encoded seed cannot be empty" });

export const SeedPartsSchema = z
	.array(z.int())
	.length(6, { error: "Seed must have exactly 6 parts" })
	.refine((parts) => parts.every((part: number) => part >= 0), {
		error: "All seed parts must be non-negative",
	});
