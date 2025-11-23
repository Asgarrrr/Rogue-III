import { z } from "zod";

const Uint8ArraySchema = z.instanceof(Uint8Array);

export const GridSnapshotSchema = z.object({
  id: z.string(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  // Prefer raw typed array for performance; allow base64url for transport
  cells: z.union([Uint8ArraySchema, z.base64url()]),
  encoding: z.enum(["raw", "base64url"]).optional(),
});

export const RoomsSnapshotSchema = z.object({
  id: z.string(),
  rooms: z.array(
    z.object({
      x: z.number().int(),
      y: z.number().int(),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    }),
  ),
});

export const ConnectionsSnapshotSchema = z.object({
  id: z.string(),
  connections: z.array(
    z.object({
      from: z.number().int().nonnegative(),
      to: z.number().int().nonnegative(),
      path: z.array(z.object({ x: z.number().int(), y: z.number().int() })),
    }),
  ),
});

export const RegionsSnapshotSchema = z.object({
  id: z.string(),
  regions: z.array(
    z.object({
      id: z.number().int().nonnegative(),
      size: z.number().int().nonnegative(),
    }),
  ),
});

export const PipelineSnapshotSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("grid"), payload: GridSnapshotSchema }),
  z.object({ kind: z.literal("rooms"), payload: RoomsSnapshotSchema }),
  z.object({
    kind: z.literal("connections"),
    payload: ConnectionsSnapshotSchema,
  }),
  z.object({ kind: z.literal("regions"), payload: RegionsSnapshotSchema }),
]);

export const ProgressEventSchema = z.object({
  stepId: z.string(),
  progress: z.number().min(0).max(100),
  /** Zero-based index of the step within the pipeline (optional). */
  stepIndex: z.number().int().nonnegative().optional(),
  /** Total number of steps in the pipeline (optional). */
  totalSteps: z.number().int().positive().optional(),
  /** Duration of the step in milliseconds (optional). */
  durationMs: z.number().nonnegative().optional(),
  /** Elapsed time since pipeline start in milliseconds (optional). */
  elapsedMs: z.number().nonnegative().optional(),
});

export type PipelineSnapshot = z.infer<typeof PipelineSnapshotSchema>;
export type ProgressEvent = z.infer<typeof ProgressEventSchema>;
