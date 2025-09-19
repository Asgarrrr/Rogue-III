import type { PipelineSnapshot, ProgressEvent } from "@rogue/contracts";
// import z from "zod"; // unused
import { buildDungeonConfig } from "./config/builder";
import type { DungeonConfig } from "./core/types";
import { AsciiDisplay } from "./core/utils";
import { DungeonManager } from "./dungeon-manager";
import { setGlobalPipelineHandlers } from "./generators/pipeline";

export * from "./core/types";
export * from "./core/utils";
export { DungeonManager } from "./dungeon-manager";
export * from "./entities";
export { DungeonGenerator } from "./generators/base/dungeon-generator";
export { SeedManager } from "./serialization";

function parseArgs(argv: string[]) {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const [k, v] = a.slice(2).split("=");
    if (v !== undefined) out[k] = v;
    else if (i + 1 < argv.length && !argv[i + 1].startsWith("--"))
      out[k] = argv[++i];
    else out[k] = "true";
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const algorithmArg = (args.algorithm || args.a || "bsp").toLowerCase();
const seed = Number(args.seed ?? 1);
const width = Number(args.width ?? 60);
const height = Number(args.height ?? 30);
// Default rooms: cellular can be 0; bsp should have rooms
const roomCount = Number(
  args.rooms ??
    (String(args.algorithm || args.a || "bsp").toLowerCase() === "cellular"
      ? 0
      : 8),
);

function buildConfig(algorithm: "cellular" | "bsp"): DungeonConfig {
  const built = buildDungeonConfig({
    width,
    height,
    roomCount,
    roomSizeRange: [5, 12],
    algorithm,
  });
  if (!built.success) throw built.error;
  return built.value as DungeonConfig;
}

function render(algorithm: "cellular" | "bsp") {
  const config = buildConfig(algorithm);

  // Example: subscribe to pipeline events globally via local handlers
  const snapshots: PipelineSnapshot[] = [];
  const progressEvents: ProgressEvent[] = [];

  // Install temporary global handlers (demo)
  setGlobalPipelineHandlers({
    onProgressEvent: (e) => {
      progressEvents.push(e);
      // Verbose: live progress log
      const pct = e.progress.toFixed(1).padStart(6, " ");
      console.log(`progress ${pct}% @ ${e.stepId}`);
    },
    onSnapshotEvent: (s) => {
      snapshots.push(s);
      // Verbose: short snapshot log
      if (s.kind === "grid") {
        console.log(
          `snapshot(grid) ${s.payload.id} ${s.payload.width}x${s.payload.height} (${s.payload.encoding ?? "raw"})`,
        );
      } else if (s.kind === "rooms") {
        console.log(
          `snapshot(rooms) ${s.payload.id} count=${s.payload.rooms.length}`,
        );
      } else if (s.kind === "connections") {
        console.log(
          `snapshot(connections) ${s.payload.id} count=${s.payload.connections.length}`,
        );
      } else if (s.kind === "regions") {
        console.log(
          `snapshot(regions) ${s.payload.id} count=${s.payload.regions.length}`,
        );
      }
    },
  });

  try {
    const dungeon = DungeonManager.generateFromSeedSync(seed, config);

    // Print an example summary of events
    if (progressEvents.length > 0) {
      console.log(`progress events: ${progressEvents.length}`);
    }
    if (snapshots.length > 0) {
      const lastGrid = snapshots.reverse().find((s) => s.kind === "grid");
      if (lastGrid && lastGrid.kind === "grid") {
        console.log(
          `last grid snapshot: ${lastGrid.payload.width}x${lastGrid.payload.height} (${lastGrid.payload.id})`,
        );
      }
    }

    console.log(
      `\n=== ${algorithm.toUpperCase()} (${config.width}x${config.height}), seed=${seed} ===`,
    );
    console.log(AsciiDisplay.displayDungeon(dungeon, false));
  } finally {
    // Remove handlers after one run to avoid cross-run accumulation
    setGlobalPipelineHandlers({});
  }
}

if (algorithmArg === "both") {
  render("cellular");
  render("bsp");
} else if (algorithmArg === "cellular" || algorithmArg === "bsp") {
  render(algorithmArg);
} else {
  console.warn(`Unknown --algorithm ${algorithmArg}, defaulting to bsp`);
  render("bsp");
}
