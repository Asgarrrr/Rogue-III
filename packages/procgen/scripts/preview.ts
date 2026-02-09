#!/usr/bin/env bun
/**
 * Dungeon Preview Script
 *
 * Usage:
 *   bun run scripts/preview.ts [options]
 *
 * Options:
 *   --seed <n>         Seed for generation (default: random)
 *   --width <n>        Dungeon width (default: 80)
 *   --height <n>       Dungeon height (default: 50)
 *   --algorithm <alg>  Algorithm: bsp, cellular, hybrid (default: bsp)
 *   --count <n>        Number of dungeons to generate (default: 1)
 *   --output <dir>     Output directory (default: output)
 *   --format <fmt>     Output formats: ascii, svg, html, all (default: all)
 *   --grid             Generate grid comparison SVG (with --count > 1)
 *   --trace            Show pipeline trace/decisions
 *   --quiet            Minimal console output
 *   --no-color         Disable ANSI colors
 *   --help             Show this help
 *
 * Examples:
 *   bun run scripts/preview.ts --seed 12345
 *   bun run scripts/preview.ts --algorithm cellular --width 60 --height 40
 *   bun run scripts/preview.ts --count 4 --grid
 *   bun run scripts/preview.ts --trace --format ascii
 */

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import {
  createSeed,
  type DungeonArtifact,
  generate,
  generateSnapshotHTML,
  printDungeon,
  printDungeonWithStats,
  renderSVG,
  renderSVGGrid,
} from "../src";

// Local type definition (matches GenerationConfig.algorithm)
type Algorithm = "bsp" | "cellular" | "hybrid";

// =============================================================================
// CLI PARSING
// =============================================================================

interface Options {
  seed: number;
  width: number;
  height: number;
  algorithm: Algorithm;
  count: number;
  output: string;
  formats: Set<"ascii" | "svg" | "html">;
  grid: boolean;
  trace: boolean;
  quiet: boolean;
  color: boolean;
  help: boolean;
}

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const options: Options = {
    seed: Date.now(),
    width: 80,
    height: 50,
    algorithm: "bsp",
    count: 1,
    output: "output",
    formats: new Set(["ascii", "svg", "html"]),
    grid: false,
    trace: false,
    quiet: false,
    color: true,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    switch (arg) {
      case "--seed":
      case "-s":
        options.seed = parseInt(next!, 10);
        i++;
        break;
      case "--width":
      case "-w":
        options.width = parseInt(next!, 10);
        i++;
        break;
      case "--height":
      case "-h":
        options.height = parseInt(next!, 10);
        i++;
        break;
      case "--algorithm":
      case "-a":
        options.algorithm = next as Algorithm;
        i++;
        break;
      case "--count":
      case "-c":
        options.count = parseInt(next!, 10);
        i++;
        break;
      case "--output":
      case "-o":
        options.output = next!;
        i++;
        break;
      case "--format":
      case "-f":
        if (next === "all") {
          options.formats = new Set(["ascii", "svg", "html"]);
        } else {
          options.formats = new Set(
            next!.split(",") as Array<"ascii" | "svg" | "html">,
          );
        }
        i++;
        break;
      case "--grid":
      case "-g":
        options.grid = true;
        break;
      case "--trace":
      case "-t":
        options.trace = true;
        break;
      case "--quiet":
      case "-q":
        options.quiet = true;
        break;
      case "--no-color":
        options.color = false;
        break;
      case "--help":
        options.help = true;
        break;
      default:
        // Support bare seed as first argument for backwards compatibility
        if (!arg!.startsWith("-") && i === 0) {
          options.seed = parseInt(arg!, 10);
        }
    }
  }

  return options;
}

function showHelp(): void {
  console.log(`
Dungeon Preview Script

Usage:
  bun run scripts/preview.ts [options]

Options:
  --seed, -s <n>         Seed for generation (default: random)
  --width, -w <n>        Dungeon width (default: 80)
  --height, -h <n>       Dungeon height (default: 50)
  --algorithm, -a <alg>  Algorithm: bsp, cellular, hybrid (default: bsp)
  --count, -c <n>        Number of dungeons to generate (default: 1)
  --output, -o <dir>     Output directory (default: output)
  --format, -f <fmt>     Output formats: ascii, svg, html, all (default: all)
  --grid, -g             Generate grid comparison SVG (with --count > 1)
  --trace, -t            Show pipeline trace/decisions
  --quiet, -q            Minimal console output
  --no-color             Disable ANSI colors
  --help                 Show this help

Examples:
  bun run scripts/preview.ts --seed 12345
  bun run scripts/preview.ts --algorithm cellular --width 60 --height 40
  bun run scripts/preview.ts --count 4 --grid
  bun run scripts/preview.ts --trace --format ascii
`);
}

// =============================================================================
// COLORS
// =============================================================================

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
};

function c(color: keyof typeof colors, text: string, enabled: boolean): string {
  return enabled ? `${colors[color]}${text}${colors.reset}` : text;
}

// =============================================================================
// GENERATION
// =============================================================================

interface TraceEvent {
  readonly timestamp: number;
  readonly passId: string;
  readonly eventType: string;
  readonly data?: unknown;
}

interface PipelineSnapshot {
  readonly passId: string;
  readonly passIndex: number;
  readonly timestamp: number;
  readonly terrain?: Uint8Array;
  readonly roomCount: number;
  readonly connectionCount: number;
}

interface GenerationResult {
  dungeon: DungeonArtifact;
  seed: number;
  snapshots: readonly PipelineSnapshot[];
  duration: number;
  traceEvents?: readonly TraceEvent[];
}

function generateDungeon(
  options: Options,
  seedOffset: number,
): GenerationResult | null {
  const seed = createSeed(options.seed + seedOffset);
  const start = performance.now();

  const result = generate(
    {
      width: options.width,
      height: options.height,
      seed,
      algorithm: options.algorithm,
      trace: options.trace,
    },
    { captureSnapshots: options.formats.has("html") },
  );

  const duration = performance.now() - start;

  if (!result.success) {
    return null;
  }

  return {
    dungeon: result.artifact,
    seed: seed.primary,
    snapshots: result.snapshots,
    duration,
    traceEvents: options.trace ? result.trace : undefined,
  };
}

// =============================================================================
// OUTPUT
// =============================================================================

function ensureOutputDir(dir: string): void {
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
}

function formatDuration(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`;
  if (ms < 1000) return `${ms.toFixed(1)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function printHeader(options: Options): void {
  if (options.quiet) return;

  console.log(c("bold", "\n🏰 Dungeon Preview", options.color));
  console.log(c("dim", "─".repeat(40), options.color));
  console.log(`  Algorithm:  ${c("cyan", options.algorithm, options.color)}`);
  console.log(
    `  Dimensions: ${c("cyan", `${options.width}x${options.height}`, options.color)}`,
  );
  console.log(
    `  Seed:       ${c("cyan", options.seed.toString(), options.color)}`,
  );
  if (options.count > 1) {
    console.log(
      `  Count:      ${c("cyan", options.count.toString(), options.color)}`,
    );
  }
  console.log(c("dim", "─".repeat(40), options.color));
}

function printResult(
  result: GenerationResult,
  index: number,
  options: Options,
): void {
  if (options.quiet) return;

  const d = result.dungeon;
  const prefix = options.count > 1 ? `[${index + 1}/${options.count}] ` : "";

  console.log(
    `\n${prefix}${c("green", "✓", options.color)} Generated in ${c("yellow", formatDuration(result.duration), options.color)}`,
  );
  console.log(
    `  Rooms: ${c("cyan", d.rooms.length.toString(), options.color)}  ` +
      `Connections: ${c("cyan", d.connections.length.toString(), options.color)}  ` +
      `Spawns: ${c("cyan", d.spawns.length.toString(), options.color)}`,
  );
}

function printTrace(result: GenerationResult, options: Options): void {
  if (!options.trace || !result.traceEvents || options.quiet) return;

  console.log(c("dim", "\n─── Pipeline Trace ───", options.color));

  for (const event of result.traceEvents) {
    const passId = c("blue", `[${event.passId}]`, options.color);
    const eventType = c("magenta", event.eventType, options.color);

    // Format data based on event type
    let details = "";
    if (event.eventType === "decision" && event.data) {
      const data = event.data as { question?: string; chosen?: unknown };
      details = data.question
        ? `${data.question} → ${JSON.stringify(data.chosen)}`
        : "";
    } else if (event.eventType === "warning" && event.data) {
      const data = event.data as { message?: string };
      details = c(
        "yellow",
        data.message || JSON.stringify(event.data),
        options.color,
      );
    }

    console.log(`  ${eventType} ${passId} ${details}`);
  }
}

function saveOutputs(results: GenerationResult[], options: Options): void {
  ensureOutputDir(options.output);

  const isSingle = results.length === 1;

  for (let i = 0; i < results.length; i++) {
    const result = results[i]!;
    const suffix = isSingle ? "" : `-${i + 1}`;

    // ASCII to console
    if (options.formats.has("ascii") && !options.quiet) {
      if (options.count > 1) {
        console.log(c("dim", `\n─── Dungeon ${i + 1} ───`, options.color));
        printDungeon(result.dungeon);
      } else {
        printDungeonWithStats(result.dungeon);
      }
    }

    // SVG
    if (options.formats.has("svg")) {
      const svgPath = `${options.output}/dungeon${suffix}.svg`;
      writeFileSync(
        svgPath,
        renderSVG(result.dungeon, {
          showRoomIds: true,
          showSpawns: true,
          showConnections: true,
        }),
      );
      if (!options.quiet) {
        console.log(
          `  ${c("dim", "→", options.color)} SVG: ${c("cyan", svgPath, options.color)}`,
        );
      }
    }

    // HTML Viewer
    if (options.formats.has("html") && result.snapshots.length > 0) {
      const htmlPath = `${options.output}/viewer${suffix}.html`;
      writeFileSync(
        htmlPath,
        generateSnapshotHTML(result.snapshots, result.dungeon, {
          title: `Dungeon Preview (seed: ${result.seed})`,
          showStats: true,
        }),
      );
      if (!options.quiet) {
        console.log(
          `  ${c("dim", "→", options.color)} HTML: ${c("cyan", htmlPath, options.color)}`,
        );
      }
    }
  }

  // Grid comparison SVG
  if (options.grid && results.length > 1 && options.formats.has("svg")) {
    const gridPath = `${options.output}/grid.svg`;
    const dungeons = results.map((r) => r.dungeon);
    const columns = Math.min(4, Math.ceil(Math.sqrt(results.length)));
    writeFileSync(
      gridPath,
      renderSVGGrid(dungeons, {
        columns,
        cellSize: 6,
        gap: 20,
        showRoomIds: false,
      }),
    );
    if (!options.quiet) {
      console.log(
        `\n  ${c("dim", "→", options.color)} Grid: ${c("cyan", gridPath, options.color)} (${results.length} dungeons)`,
      );
    }
  }
}

function printSummary(results: GenerationResult[], options: Options): void {
  if (options.quiet || results.length <= 1) return;

  const totalTime = results.reduce((sum, r) => sum + r.duration, 0);
  const avgTime = totalTime / results.length;
  const totalRooms = results.reduce(
    (sum, r) => sum + r.dungeon.rooms.length,
    0,
  );
  const avgRooms = totalRooms / results.length;

  console.log(c("dim", "\n─── Summary ───", options.color));
  console.log(
    `  Total time:   ${c("yellow", formatDuration(totalTime), options.color)}`,
  );
  console.log(
    `  Avg time:     ${c("yellow", formatDuration(avgTime), options.color)}`,
  );
  console.log(
    `  Avg rooms:    ${c("cyan", avgRooms.toFixed(1), options.color)}`,
  );
}

// =============================================================================
// MAIN
// =============================================================================

async function main(): Promise<void> {
  const options = parseArgs();

  if (options.help) {
    showHelp();
    process.exit(0);
  }

  printHeader(options);

  const results: GenerationResult[] = [];

  for (let i = 0; i < options.count; i++) {
    const result = generateDungeon(options, i);

    if (result) {
      results.push(result);
      printResult(result, i, options);
      printTrace(result, options);
    } else {
      console.error(c("red", `✗ Generation ${i + 1} failed`, options.color));
    }
  }

  if (results.length > 0) {
    saveOutputs(results, options);
    printSummary(results, options);
  }

  if (!options.quiet) {
    console.log();
  }
}

main().catch(console.error);
