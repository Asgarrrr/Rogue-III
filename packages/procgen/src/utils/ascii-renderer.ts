/**
 * ASCII Dungeon Renderer
 *
 * Renders dungeons as ASCII art for visualization and debugging.
 *
 * @example
 * ```typescript
 * import { generate, createSeed } from "@rogue/procgen-v2";
 * import { renderAscii, printDungeon } from "@rogue/procgen-v2/utils/ascii-renderer";
 *
 * const result = generate({ width: 60, height: 40, seed: createSeed(12345) });
 * if (result.success) {
 *   printDungeon(result.artifact);
 * }
 * ```
 */

import { CellType } from "../core/grid";
import type { DungeonArtifact, Room, SpawnPoint } from "../pipeline/types";

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * ASCII character mapping for cell types
 */
export interface AsciiCharset {
  readonly wall: string;
  readonly floor: string;
  readonly entrance: string;
  readonly exit: string;
  readonly enemy: string;
  readonly treasure: string;
  readonly item: string;
  readonly decoration: string;
  readonly roomCenter: string;
  readonly corridor: string;
  readonly unknown: string;
}

/**
 * Default ASCII charset
 */
export const DEFAULT_CHARSET: AsciiCharset = {
  wall: "█",
  floor: "·",
  entrance: "▲",
  exit: "▼",
  enemy: "E",
  treasure: "$",
  item: "?",
  decoration: "○",
  roomCenter: "+",
  corridor: "░",
  unknown: " ",
};

/**
 * Simple ASCII charset (for terminals without unicode support)
 */
export const SIMPLE_CHARSET: AsciiCharset = {
  wall: "#",
  floor: ".",
  entrance: "@",
  exit: ">",
  enemy: "E",
  treasure: "$",
  item: "?",
  decoration: "o",
  roomCenter: "+",
  corridor: ",",
  unknown: " ",
};

/**
 * Render options
 */
export interface RenderOptions {
  /** Character set to use */
  readonly charset?: AsciiCharset;
  /** Show spawn points */
  readonly showSpawns?: boolean;
  /** Show room centers */
  readonly showRoomCenters?: boolean;
  /** Show room IDs at centers */
  readonly showRoomIds?: boolean;
  /** Show coordinates on edges */
  readonly showCoordinates?: boolean;
  /** Highlight specific rooms */
  readonly highlightRooms?: readonly number[];
  /** Custom spawn character mapping */
  readonly spawnChars?: Record<string, string>;
  /** Color output (ANSI escape codes) */
  readonly useColors?: boolean;
}

// =============================================================================
// ANSI COLOR CODES
// =============================================================================

const ANSI = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  // Foreground colors
  black: "\x1b[30m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  // Background colors
  bgBlack: "\x1b[40m",
  bgRed: "\x1b[41m",
  bgGreen: "\x1b[42m",
  bgYellow: "\x1b[43m",
  bgBlue: "\x1b[44m",
  bgMagenta: "\x1b[45m",
  bgCyan: "\x1b[46m",
  bgWhite: "\x1b[47m",
} as const;

/**
 * Color a string with ANSI codes
 */
function colorize(text: string, ...codes: string[]): string {
  return codes.join("") + text + ANSI.reset;
}

// =============================================================================
// RENDER FUNCTIONS
// =============================================================================

/**
 * Render a dungeon as ASCII art
 */
export function renderAscii(
  dungeon: DungeonArtifact,
  options: RenderOptions = {},
): string {
  const {
    charset = DEFAULT_CHARSET,
    showSpawns = true,
    showRoomCenters = false,
    showRoomIds = false,
    showCoordinates = false,
    highlightRooms = [],
    spawnChars = {},
    useColors = false,
  } = options;

  const { width, height, terrain, rooms, spawns } = dungeon;

  // Create character grid
  const grid: string[][] = [];
  for (let y = 0; y < height; y++) {
    grid[y] = [];
    for (let x = 0; x < width; x++) {
      const cell = terrain[y * width + x];
      let char = cell === CellType.FLOOR ? charset.floor : charset.wall;

      if (useColors) {
        char =
          cell === CellType.FLOOR
            ? colorize(char, ANSI.dim, ANSI.white)
            : colorize(char, ANSI.blue);
      }

      const row = grid[y];
      if (row) row[x] = char;
    }
  }

  // Highlight rooms
  const highlightSet = new Set(highlightRooms);
  for (const room of rooms) {
    if (highlightSet.has(room.id)) {
      for (let dy = 0; dy < room.height; dy++) {
        for (let dx = 0; dx < room.width; dx++) {
          const x = room.x + dx;
          const y = room.y + dy;
          if (x >= 0 && x < width && y >= 0 && y < height) {
            const cell = terrain[y * width + x];
            if (cell === CellType.FLOOR) {
              let char = charset.floor;
              if (useColors) {
                char = colorize(char, ANSI.bgYellow, ANSI.black);
              }
              const row = grid[y];
              if (row) row[x] = char;
            }
          }
        }
      }
    }
  }

  // Show room centers
  if (showRoomCenters || showRoomIds) {
    for (const room of rooms) {
      const x = room.centerX;
      const y = room.centerY;
      if (x >= 0 && x < width && y >= 0 && y < height) {
        if (showRoomIds) {
          const idStr = room.id.toString();
          let char = idStr.length === 1 ? idStr : (idStr[0] ?? "?");
          if (useColors) {
            char = colorize(char, ANSI.bold, ANSI.cyan);
          }
          const row = grid[y];
          if (row) row[x] = char;
        } else {
          let char = charset.roomCenter;
          if (useColors) {
            char = colorize(char, ANSI.cyan);
          }
          const row = grid[y];
          if (row) row[x] = char;
        }
      }
    }
  }

  // Show spawn points
  if (showSpawns) {
    for (const spawn of spawns) {
      const { x, y } = spawn.position;
      if (x >= 0 && x < width && y >= 0 && y < height) {
        let char = getSpawnChar(spawn, charset, spawnChars);
        if (useColors) {
          char = colorize(char, getSpawnColor(spawn.type));
        }
        const row = grid[y];
        if (row) row[x] = char;
      }
    }
  }

  // Build output string
  const lines: string[] = [];

  // Top coordinate row
  if (showCoordinates) {
    let coordLine = "   ";
    for (let x = 0; x < width; x += 10) {
      const label = x.toString().padEnd(10);
      coordLine += label;
    }
    lines.push(coordLine);
  }

  // Grid rows
  for (let y = 0; y < height; y++) {
    let line = "";
    if (showCoordinates) {
      line = `${y.toString().padStart(3)} `;
    }
    const row = grid[y];
    line += row ? row.join("") : "";
    lines.push(line);
  }

  return lines.join("\n");
}

/**
 * Get the character for a spawn point
 */
function getSpawnChar(
  spawn: SpawnPoint,
  charset: AsciiCharset,
  customChars: Record<string, string>,
): string {
  const customChar = customChars[spawn.type];
  if (customChar) {
    return customChar;
  }

  switch (spawn.type) {
    case "entrance":
      return charset.entrance;
    case "exit":
      return charset.exit;
    case "enemy":
      return charset.enemy;
    case "treasure":
      return charset.treasure;
    case "item":
      return charset.item;
    case "decoration":
      return charset.decoration;
    default:
      return charset.unknown;
  }
}

/**
 * Get ANSI color for spawn type
 */
function getSpawnColor(type: string): string {
  switch (type) {
    case "entrance":
      return ANSI.green;
    case "exit":
      return ANSI.red;
    case "enemy":
      return ANSI.red;
    case "treasure":
      return ANSI.yellow;
    case "item":
      return ANSI.magenta;
    case "decoration":
      return ANSI.dim + ANSI.white;
    default:
      return ANSI.white;
  }
}

/**
 * Print dungeon to console
 */
export function printDungeon(
  dungeon: DungeonArtifact,
  options: RenderOptions = {},
): void {
  console.log(renderAscii(dungeon, options));
}

/**
 * Print dungeon with stats
 */
export function printDungeonWithStats(
  dungeon: DungeonArtifact,
  options: RenderOptions = {},
): void {
  const ascii = renderAscii(dungeon, options);

  console.log(`╔${"═".repeat(dungeon.width + 2)}╗`);
  console.log(
    `║ Dungeon ${dungeon.width}×${dungeon.height}`.padEnd(dungeon.width + 3) +
      "║",
  );
  console.log(`╠${"═".repeat(dungeon.width + 2)}╣`);

  for (const line of ascii.split("\n")) {
    console.log(`║ ${line.padEnd(dungeon.width)} ║`);
  }

  console.log(`╠${"═".repeat(dungeon.width + 2)}╣`);
  console.log(
    `${`║ Rooms: ${dungeon.rooms.length}`.padEnd(dungeon.width + 3)}║`,
  );
  console.log(
    `║ Connections: ${dungeon.connections.length}`.padEnd(dungeon.width + 3) +
      "║",
  );
  console.log(
    `${`║ Spawns: ${dungeon.spawns.length}`.padEnd(dungeon.width + 3)}║`,
  );
  console.log(
    `║ Checksum: ${dungeon.checksum.slice(0, 16)}`.padEnd(dungeon.width + 3) +
      "║",
  );
  console.log(`╚${"═".repeat(dungeon.width + 2)}╝`);
}

// =============================================================================
// ROOM DETAIL RENDERER
// =============================================================================

/**
 * Render a single room in detail
 */
export function renderRoom(
  room: Room,
  dungeon: DungeonArtifact,
  options: RenderOptions = {},
): string {
  const {
    charset = DEFAULT_CHARSET,
    showSpawns = true,
    useColors = false,
  } = options;
  const { terrain, width, spawns } = dungeon;

  const lines: string[] = [];
  lines.push(`Room ${room.id} (${room.type})`);
  lines.push(`Position: (${room.x}, ${room.y})`);
  lines.push(`Size: ${room.width}×${room.height}`);
  lines.push(`Center: (${room.centerX}, ${room.centerY})`);
  lines.push("");

  // Render room grid
  for (let dy = -1; dy <= room.height; dy++) {
    let line = "";
    for (let dx = -1; dx <= room.width; dx++) {
      const x = room.x + dx;
      const y = room.y + dy;

      if (x < 0 || x >= width || y < 0 || y >= dungeon.height) {
        line += charset.unknown;
        continue;
      }

      const cell = terrain[y * width + x];
      let char = cell === CellType.FLOOR ? charset.floor : charset.wall;

      // Check for spawns
      if (showSpawns) {
        const spawn = spawns.find(
          (s) => s.position.x === x && s.position.y === y,
        );
        if (spawn) {
          char = getSpawnChar(spawn, charset, {});
          if (useColors) {
            char = colorize(char, getSpawnColor(spawn.type));
          }
        }
      }

      // Mark center
      if (x === room.centerX && y === room.centerY && !showSpawns) {
        char = charset.roomCenter;
        if (useColors) {
          char = colorize(char, ANSI.cyan);
        }
      }

      line += char;
    }
    lines.push(line);
  }

  // Room spawns
  const roomSpawns = spawns.filter((s) => s.roomId === room.id);
  if (roomSpawns.length > 0) {
    lines.push("");
    lines.push("Spawns:");
    for (const spawn of roomSpawns) {
      lines.push(
        `  - ${spawn.type} at (${spawn.position.x}, ${spawn.position.y})`,
      );
    }
  }

  return lines.join("\n");
}

// =============================================================================
// COMPARISON RENDERER
// =============================================================================

/**
 * Render two dungeons side by side for comparison
 */
export function renderComparison(
  dungeon1: DungeonArtifact,
  dungeon2: DungeonArtifact,
  options: RenderOptions = {},
): string {
  const lines1 = renderAscii(dungeon1, options).split("\n");
  const lines2 = renderAscii(dungeon2, options).split("\n");

  const maxLines = Math.max(lines1.length, lines2.length);
  const width1 = dungeon1.width;
  const width2 = dungeon2.width;

  const result: string[] = [];

  // Header
  result.push(`${"Dungeon 1".padEnd(width1 + 4)}${"Dungeon 2".padEnd(width2)}`);
  result.push("-".repeat(width1 + width2 + 6));

  // Side by side
  for (let i = 0; i < maxLines; i++) {
    const l1 = lines1[i];
    const l2 = lines2[i];
    const line1 = (l1 ?? "").padEnd(width1);
    const line2 = l2 ?? "";
    result.push(`${line1}    ${line2}`);
  }

  // Stats comparison
  result.push("-".repeat(width1 + width2 + 6));
  result.push(
    `Rooms: ${dungeon1.rooms.length}`.padEnd(width1 + 4) +
      `Rooms: ${dungeon2.rooms.length}`,
  );
  result.push(
    `Connections: ${dungeon1.connections.length}`.padEnd(width1 + 4) +
      `Connections: ${dungeon2.connections.length}`,
  );
  result.push(
    `Checksum: ${dungeon1.checksum.slice(0, 8)}`.padEnd(width1 + 4) +
      `Checksum: ${dungeon2.checksum.slice(0, 8)}`,
  );

  return result.join("\n");
}

// =============================================================================
// LEGEND
// =============================================================================

/**
 * Generate a legend for the current charset
 */
export function renderLegend(charset: AsciiCharset = DEFAULT_CHARSET): string {
  return [
    "Legend:",
    `  ${charset.wall} Wall`,
    `  ${charset.floor} Floor`,
    `  ${charset.entrance} Entrance`,
    `  ${charset.exit} Exit`,
    `  ${charset.enemy} Enemy`,
    `  ${charset.treasure} Treasure`,
    `  ${charset.item} Item`,
    `  ${charset.decoration} Decoration`,
    `  ${charset.roomCenter} Room Center`,
  ].join("\n");
}
