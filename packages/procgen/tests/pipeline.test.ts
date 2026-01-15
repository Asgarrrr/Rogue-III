/**
 * Pipeline builder and execution tests
 */

import { describe, expect, it } from "bun:test";
import { CellType, Grid } from "../src/core/grid";
import { createPipeline, PipelineBuilder } from "../src/pipeline/builder";
import { createTraceCollector } from "../src/pipeline/trace";
import type { EmptyArtifact, GridArtifact, Pass } from "../src/pipeline/types";
import { createEmptyArtifact, createGridArtifact } from "../src/pipeline/types";

// Helper to create a simple test seed
function createTestSeed() {
  return {
    primary: 12345,
    layout: 12346,
    rooms: 12347,
    connections: 12348,
    details: 12349,
    version: "2.0.0",
    timestamp: Date.now(),
  };
}

// Helper to create a basic config
function createTestConfig() {
  return {
    width: 50,
    height: 30,
    seed: createTestSeed(),
  };
}

describe("PipelineBuilder", () => {
  describe("create", () => {
    it("creates empty pipeline builder", () => {
      const builder = PipelineBuilder.create<EmptyArtifact>(
        "test",
        createTestConfig(),
      );
      expect(builder).toBeDefined();
    });
  });

  describe("pipe", () => {
    it("chains passes together", () => {
      const config = createTestConfig();

      // Simple pass that creates a grid
      const initPass: Pass<EmptyArtifact, GridArtifact> = {
        id: "init",
        inputType: "empty",
        outputType: "grid",
        run(_input, ctx) {
          const grid = new Grid(ctx.config.width, ctx.config.height);
          return createGridArtifact(grid, "init-grid");
        },
      };

      const pipeline = createPipeline<EmptyArtifact>("test", config)
        .pipe(initPass)
        .build();

      expect(pipeline.id).toBe("test");
    });

    it("maintains type safety through chain", () => {
      const config = createTestConfig();

      const pass1: Pass<EmptyArtifact, GridArtifact> = {
        id: "pass1",
        inputType: "empty",
        outputType: "grid",
        run(_input, ctx) {
          return createGridArtifact(
            new Grid(ctx.config.width, ctx.config.height),
            "g1",
          );
        },
      };

      // This should type-check: GridArtifact -> GridArtifact
      const pass2: Pass<GridArtifact, GridArtifact> = {
        id: "pass2",
        inputType: "grid",
        outputType: "grid",
        run(input, _ctx) {
          // Clone and modify
          const grid = new Grid(input.width, input.height);
          grid.fillRect(0, 0, 5, 5, CellType.FLOOR);
          return createGridArtifact(grid, "g2");
        },
      };

      const pipeline = createPipeline<EmptyArtifact>("test", config)
        .pipe(pass1)
        .pipe(pass2)
        .build();

      expect(pipeline).toBeDefined();
    });
  });

  describe("when", () => {
    it("adds pass when condition is true", () => {
      const config = { ...createTestConfig(), addExtra: true };

      const basePass: Pass<EmptyArtifact, GridArtifact> = {
        id: "base",
        inputType: "empty",
        outputType: "grid",
        run(_input, ctx) {
          return createGridArtifact(
            new Grid(ctx.config.width, ctx.config.height),
            "base",
          );
        },
      };

      const conditionalPass: Pass<GridArtifact, GridArtifact> = {
        id: "conditional",
        inputType: "grid",
        outputType: "grid",
        run(input, _ctx) {
          const grid = new Grid(input.width, input.height, CellType.FLOOR);
          return createGridArtifact(grid, "conditional");
        },
      };

      const pipeline = createPipeline<EmptyArtifact>("test", config)
        .pipe(basePass)
        .when((c) => (c as typeof config).addExtra === true, conditionalPass)
        .build();

      const result = pipeline.runSync(createEmptyArtifact(), createTestSeed());

      expect(result.success).toBe(true);
    });

    it("skips pass when condition is false", () => {
      const config = { ...createTestConfig(), addExtra: false };

      const basePass: Pass<EmptyArtifact, GridArtifact> = {
        id: "base",
        inputType: "empty",
        outputType: "grid",
        run(_input, ctx) {
          return createGridArtifact(
            new Grid(ctx.config.width, ctx.config.height, CellType.WALL),
            "base",
          );
        },
      };

      const conditionalPass: Pass<GridArtifact, GridArtifact> = {
        id: "conditional",
        inputType: "grid",
        outputType: "grid",
        run(input, _ctx) {
          // Would change to floor
          const grid = new Grid(input.width, input.height, CellType.FLOOR);
          return createGridArtifact(grid, "conditional");
        },
      };

      const pipeline = createPipeline<EmptyArtifact>("test", config)
        .pipe(basePass)
        .when((c) => (c as typeof config).addExtra === true, conditionalPass)
        .build();

      const result = pipeline.runSync(createEmptyArtifact(), createTestSeed());

      expect(result.success).toBe(true);
      if (result.success) {
        // Should still be wall (conditional pass skipped)
        expect((result.artifact as GridArtifact).grid.get(0, 0)).toBe(
          CellType.WALL,
        );
      }
    });
  });

  describe("build", () => {
    it("produces executable pipeline", () => {
      const config = createTestConfig();

      const pass: Pass<EmptyArtifact, GridArtifact> = {
        id: "init",
        inputType: "empty",
        outputType: "grid",
        run(_input, ctx) {
          return createGridArtifact(
            new Grid(ctx.config.width, ctx.config.height),
            "test",
          );
        },
      };

      const pipeline = createPipeline<EmptyArtifact>("test", config)
        .pipe(pass)
        .build();

      expect(pipeline.run).toBeDefined();
      expect(pipeline.runSync).toBeDefined();
    });
  });
});

describe("Pipeline execution", () => {
  describe("runSync", () => {
    it("executes passes in order", () => {
      const config = createTestConfig();
      const executionOrder: string[] = [];

      const pass1: Pass<EmptyArtifact, GridArtifact> = {
        id: "pass1",
        inputType: "empty",
        outputType: "grid",
        run(_input, ctx) {
          executionOrder.push("pass1");
          return createGridArtifact(
            new Grid(ctx.config.width, ctx.config.height),
            "g1",
          );
        },
      };

      const pass2: Pass<GridArtifact, GridArtifact> = {
        id: "pass2",
        inputType: "grid",
        outputType: "grid",
        run(input, _ctx) {
          executionOrder.push("pass2");
          return createGridArtifact(new Grid(input.width, input.height), "g2");
        },
      };

      const pipeline = createPipeline<EmptyArtifact>("test", config)
        .pipe(pass1)
        .pipe(pass2)
        .build();

      pipeline.runSync(createEmptyArtifact(), createTestSeed());

      expect(executionOrder).toEqual(["pass1", "pass2"]);
    });

    it("returns success result with artifact", () => {
      const config = createTestConfig();

      const pass: Pass<EmptyArtifact, GridArtifact> = {
        id: "init",
        inputType: "empty",
        outputType: "grid",
        run(_input, ctx) {
          const grid = new Grid(ctx.config.width, ctx.config.height);
          grid.set(5, 5, CellType.FLOOR);
          return createGridArtifact(grid, "test");
        },
      };

      const pipeline = createPipeline<EmptyArtifact>("test", config)
        .pipe(pass)
        .build();

      const result = pipeline.runSync(createEmptyArtifact(), createTestSeed());

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.artifact.type).toBe("grid");
        expect((result.artifact as GridArtifact).grid.get(5, 5)).toBe(
          CellType.FLOOR,
        );
      }
    });

    it("returns error result on failure", () => {
      const config = createTestConfig();

      const failingPass: Pass<EmptyArtifact, GridArtifact> = {
        id: "failing",
        inputType: "empty",
        outputType: "grid",
        run() {
          throw new Error("Intentional failure");
        },
      };

      const pipeline = createPipeline<EmptyArtifact>("test", config)
        .pipe(failingPass)
        .build();

      const result = pipeline.runSync(createEmptyArtifact(), createTestSeed());

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toBe("Intentional failure");
      }
    });

    it("throws for async passes in sync mode", () => {
      const config = createTestConfig();

      const asyncPass: Pass<EmptyArtifact, GridArtifact> = {
        id: "async",
        inputType: "empty",
        outputType: "grid",
        run(_input, ctx) {
          return Promise.resolve(
            createGridArtifact(
              new Grid(ctx.config.width, ctx.config.height),
              "async",
            ),
          );
        },
      };

      const pipeline = createPipeline<EmptyArtifact>("test", config)
        .pipe(asyncPass)
        .build();

      const result = pipeline.runSync(createEmptyArtifact(), createTestSeed());

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("Promise");
      }
    });

    it("tracks duration", () => {
      const config = createTestConfig();

      const pass: Pass<EmptyArtifact, GridArtifact> = {
        id: "slow",
        inputType: "empty",
        outputType: "grid",
        run(_input, ctx) {
          // Simulate some work
          let _sum = 0;
          for (let i = 0; i < 10000; i++) _sum += i;
          return createGridArtifact(
            new Grid(ctx.config.width, ctx.config.height),
            "slow",
          );
        },
      };

      const pipeline = createPipeline<EmptyArtifact>("test", config)
        .pipe(pass)
        .build();

      const result = pipeline.runSync(createEmptyArtifact(), createTestSeed());

      expect(result.durationMs).toBeGreaterThan(0);
    });

    it("calls onProgress callback", () => {
      const config = createTestConfig();
      const progressCalls: { progress: number; passId: string }[] = [];

      const pass1: Pass<EmptyArtifact, GridArtifact> = {
        id: "pass1",
        inputType: "empty",
        outputType: "grid",
        run(_input, ctx) {
          return createGridArtifact(
            new Grid(ctx.config.width, ctx.config.height),
            "g1",
          );
        },
      };

      const pass2: Pass<GridArtifact, GridArtifact> = {
        id: "pass2",
        inputType: "grid",
        outputType: "grid",
        run(input) {
          return createGridArtifact(new Grid(input.width, input.height), "g2");
        },
      };

      const pipeline = createPipeline<EmptyArtifact>("test", config)
        .pipe(pass1)
        .pipe(pass2)
        .build();

      pipeline.runSync(createEmptyArtifact(), createTestSeed(), {
        onProgress(progress, passId) {
          progressCalls.push({ progress, passId });
        },
      });

      expect(progressCalls).toHaveLength(2);
      expect(progressCalls[0]?.progress).toBe(50);
      expect(progressCalls[1]?.progress).toBe(100);
    });
  });

  describe("run (async)", () => {
    it("executes async passes", async () => {
      const config = createTestConfig();

      const asyncPass: Pass<EmptyArtifact, GridArtifact> = {
        id: "async",
        inputType: "empty",
        outputType: "grid",
        async run(_input, ctx) {
          await new Promise((resolve) => setTimeout(resolve, 1));
          return createGridArtifact(
            new Grid(ctx.config.width, ctx.config.height),
            "async",
          );
        },
      };

      const pipeline = createPipeline<EmptyArtifact>("test", config)
        .pipe(asyncPass)
        .build();

      const result = await pipeline.run(
        createEmptyArtifact(),
        createTestSeed(),
      );

      expect(result.success).toBe(true);
    });

    it("respects abort signal", async () => {
      const config = createTestConfig();
      const controller = new AbortController();

      const slowPass: Pass<EmptyArtifact, GridArtifact> = {
        id: "slow",
        inputType: "empty",
        outputType: "grid",
        async run(_input, ctx) {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return createGridArtifact(
            new Grid(ctx.config.width, ctx.config.height),
            "slow",
          );
        },
      };

      const pipeline = createPipeline<EmptyArtifact>("test", config)
        .pipe(slowPass)
        .build();

      // Abort immediately
      controller.abort();

      const result = await pipeline.run(
        createEmptyArtifact(),
        createTestSeed(),
        { signal: controller.signal },
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain("aborted");
      }
    });
  });
});

describe("TraceCollector", () => {
  it("collects trace events when enabled", () => {
    const trace = createTraceCollector(true);

    trace.start("test-pass");
    trace.decision("test-pass", "What to do?", ["A", "B"], "A", "Chose A");
    trace.end("test-pass", 10);

    const events = trace.getEvents();

    expect(events).toHaveLength(3);
    expect(events.map((e) => e.eventType)).toEqual([
      "start",
      "decision",
      "end",
    ]);
  });

  it("is no-op when disabled", () => {
    const trace = createTraceCollector(false);

    trace.start("test-pass");
    trace.decision("test-pass", "What to do?", ["A", "B"], "A", "Chose A");
    trace.end("test-pass", 10);

    const events = trace.getEvents();

    expect(events).toHaveLength(0);
  });
});
