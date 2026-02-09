import { z } from "zod";
import type { DungeonSeed } from "../types/dungeon";

const UINT32_MAX = 0xffffffff;
const NonNegativeIntSchema = z
  .number()
  .int()
  .min(0, { message: "Seed values must be non-negative integers" })
  .max(UINT32_MAX, { message: "Seed values must fit in uint32" });

export const DungeonSeedSchema = z.object({
  primary: NonNegativeIntSchema,
  layout: NonNegativeIntSchema,
  rooms: NonNegativeIntSchema,
  connections: NonNegativeIntSchema,
  details: NonNegativeIntSchema,
  version: z
    .string()
    .regex(/^\d+\.\d+\.\d+$/, { error: "Invalid version format" }),
  timestamp: z.number().int().positive({ error: "Timestamp must be positive" }),
});

/**
 * Factory that validates and brands a DungeonSeed.
 * This ensures only validated seeds can be used at compile time.
 */
export function createValidatedSeed(
  input: z.infer<typeof DungeonSeedSchema>
): DungeonSeed {
  // Validate the input against the schema
  const validated = DungeonSeedSchema.parse(input);
  // Cast to branded type after validation
  return validated as DungeonSeed;
}

export const EncodedSeedSchema = z
  .base64url()
  .min(1, { error: "Encoded seed cannot be empty" });

export const SeedPartsSchema = z.tuple([
  NonNegativeIntSchema, // primary
  NonNegativeIntSchema, // layout
  NonNegativeIntSchema, // rooms
  NonNegativeIntSchema, // connections
  NonNegativeIntSchema, // details
  z
    .number()
    .int()
    .positive({ message: "Timestamp must be positive" }), // timestamp can exceed uint32
  z
    .number()
    .int()
    .min(0, { message: "CRC must be non-negative" })
    .max(UINT32_MAX, { message: "CRC must fit in uint32" }),
]);
