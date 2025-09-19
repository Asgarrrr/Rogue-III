import { describe, expect, it } from "bun:test";
import { PipelineSnapshotSchema, ProgressEventSchema } from "../src";

describe("Pipeline contracts", () => {
  it("validates a grid snapshot (raw)", () => {
    const res = PipelineSnapshotSchema.safeParse({
      kind: "grid",
      payload: {
        id: "cellular.grid",
        width: 10,
        height: 10,
        cells: new Uint8Array(100),
        encoding: "raw",
      },
    });
    expect(res.success).toBe(true);
  });

  it("validates a progress event", () => {
    const res = ProgressEventSchema.safeParse({
      stepId: "step-1",
      progress: 50,
    });
    expect(res.success).toBe(true);
  });
});
