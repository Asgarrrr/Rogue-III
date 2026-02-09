/**
 * SVG Dungeon Renderer
 *
 * Renders dungeons as SVG for high-quality visualization and export.
 *
 * @example
 * ```typescript
 * import { generate, createSeed } from "@rogue/procgen";
 * import { renderSVG } from "@rogue/procgen/utils/svg-renderer";
 *
 * const result = generate({ width: 60, height: 40, seed: createSeed(12345) });
 * if (result.success) {
 *   const svg = renderSVG(result.artifact);
 *   // Write to file or embed in HTML
 * }
 * ```
 */

import { CellType } from "../core/grid";
import type { Connection, DungeonArtifact, Room } from "../pipeline/types";

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Color palette for SVG rendering
 */
export interface SVGColorPalette {
  readonly wall: string;
  readonly floor: string;
  readonly corridor: string;
  readonly entrance: string;
  readonly exit: string;
  readonly roomOutline: string;
  readonly connectionLine: string;
  readonly doorOpen: string;
  readonly doorLocked: string;
  readonly doorSecret: string;
  readonly grid: string;
  readonly text: string;
  readonly background: string;
}

/**
 * Default dark palette
 */
export const DARK_PALETTE: SVGColorPalette = {
  wall: "#1a1a2e",
  floor: "#16213e",
  corridor: "#0f3460",
  entrance: "#4ade80",
  exit: "#f87171",
  roomOutline: "#e94560",
  connectionLine: "#fbbf24",
  doorOpen: "#60a5fa",
  doorLocked: "#f59e0b",
  doorSecret: "#8b5cf6",
  grid: "#374151",
  text: "#e5e7eb",
  background: "#0f0f1a",
};

/**
 * Neutral dark palette (matches Tailwind neutral)
 */
export const NEUTRAL_DARK_PALETTE: SVGColorPalette = {
  wall: "#171717",       // neutral-900
  floor: "#404040",      // neutral-700
  corridor: "#525252",   // neutral-600
  entrance: "#22c55e",   // green-500
  exit: "#ef4444",       // red-500
  roomOutline: "#525252", // neutral-600
  connectionLine: "#525252", // neutral-600
  doorOpen: "#a3a3a3",   // neutral-400
  doorLocked: "#f59e0b", // amber-500
  doorSecret: "#8b5cf6", // violet-500
  grid: "#262626",       // neutral-800
  text: "#e5e5e5",       // neutral-200
  background: "#0a0a0a", // neutral-950
};

/**
 * Neutral light palette (matches Tailwind neutral)
 */
export const NEUTRAL_LIGHT_PALETTE: SVGColorPalette = {
  wall: "#e5e5e5",       // neutral-200
  floor: "#fafafa",      // neutral-50
  corridor: "#f5f5f5",   // neutral-100
  entrance: "#22c55e",   // green-500
  exit: "#ef4444",       // red-500
  roomOutline: "#a3a3a3", // neutral-400
  connectionLine: "#a3a3a3", // neutral-400
  doorOpen: "#525252",   // neutral-600
  doorLocked: "#f59e0b", // amber-500
  doorSecret: "#8b5cf6", // violet-500
  grid: "#d4d4d4",       // neutral-300
  text: "#171717",       // neutral-900
  background: "#fafafa", // neutral-50
};

/**
 * Light palette for printing
 */
export const LIGHT_PALETTE: SVGColorPalette = {
  wall: "#1f2937",
  floor: "#f3f4f6",
  corridor: "#e5e7eb",
  entrance: "#22c55e",
  exit: "#ef4444",
  roomOutline: "#3b82f6",
  connectionLine: "#f59e0b",
  doorOpen: "#3b82f6",
  doorLocked: "#dc2626",
  doorSecret: "#7c3aed",
  grid: "#d1d5db",
  text: "#1f2937",
  background: "#ffffff",
};

/**
 * SVG render options
 */
export interface SVGOptions {
  /** Pixels per cell (default: 10) */
  readonly cellSize?: number;
  /** Show room IDs at centers */
  readonly showRoomIds?: boolean;
  /** Show connection lines between rooms */
  readonly showConnections?: boolean;
  /** Show room outlines */
  readonly showRoomOutlines?: boolean;
  /** Show spawn points (entrance/exit) */
  readonly showSpawns?: boolean;
  /** Show grid lines */
  readonly showGrid?: boolean;
  /** Show door markers on connections */
  readonly showDoors?: boolean;
  /** Color palette to use */
  readonly palette?: SVGColorPalette;
  /** Include CSS styles in SVG (for standalone use) */
  readonly embedStyles?: boolean;
  /** Add a title to the SVG */
  readonly title?: string;
  /** Margin around the dungeon in pixels */
  readonly margin?: number;
}

// =============================================================================
// SVG HELPERS
// =============================================================================

/**
 * Escape XML special characters
 */
function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Create an SVG rect element
 */
function rect(
  x: number,
  y: number,
  width: number,
  height: number,
  fill: string,
  attrs: Record<string, string | number> = {},
): string {
  const attrStr = Object.entries(attrs)
    .map(([k, v]) => `${k}="${escapeXml(String(v))}"`)
    .join(" ");
  return `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${fill}" ${attrStr}/>`;
}

/**
 * Create an SVG line element
 */
function line(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  stroke: string,
  strokeWidth: number = 1,
  attrs: Record<string, string | number> = {},
): string {
  const attrStr = Object.entries(attrs)
    .map(([k, v]) => `${k}="${escapeXml(String(v))}"`)
    .join(" ");
  return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${stroke}" stroke-width="${strokeWidth}" ${attrStr}/>`;
}

/**
 * Create an SVG text element
 */
function text(
  x: number,
  y: number,
  content: string,
  fill: string,
  fontSize: number = 12,
  attrs: Record<string, string | number> = {},
): string {
  const attrStr = Object.entries(attrs)
    .map(([k, v]) => `${k}="${escapeXml(String(v))}"`)
    .join(" ");
  return `<text x="${x}" y="${y}" fill="${fill}" font-size="${fontSize}" text-anchor="middle" dominant-baseline="middle" ${attrStr}>${escapeXml(content)}</text>`;
}

/**
 * Create an SVG polygon element (for spawn markers)
 */
function polygon(
  points: [number, number][],
  fill: string,
  attrs: Record<string, string | number> = {},
): string {
  const pointsStr = points.map(([x, y]) => `${x},${y}`).join(" ");
  const attrStr = Object.entries(attrs)
    .map(([k, v]) => `${k}="${escapeXml(String(v))}"`)
    .join(" ");
  return `<polygon points="${pointsStr}" fill="${fill}" ${attrStr}/>`;
}

// =============================================================================
// MAIN RENDER FUNCTION
// =============================================================================

/**
 * Render a dungeon as SVG
 */
export function renderSVG(
  dungeon: DungeonArtifact,
  options: SVGOptions = {},
): string {
  const {
    cellSize = 10,
    showRoomIds = false,
    showConnections = true,
    showRoomOutlines = true,
    showSpawns = true,
    showGrid = false,
    showDoors = true,
    palette = DARK_PALETTE,
    embedStyles = true,
    title,
    margin = 10,
  } = options;

  const { width, height, terrain, rooms, connections, spawns } = dungeon;

  const svgWidth = width * cellSize + margin * 2;
  const svgHeight = height * cellSize + margin * 2;

  const elements: string[] = [];

  // Background
  elements.push(rect(0, 0, svgWidth, svgHeight, palette.background));

  // Grid lines (optional)
  if (showGrid) {
    elements.push(`<g class="grid" opacity="0.3">`);
    for (let x = 0; x <= width; x++) {
      elements.push(
        line(
          margin + x * cellSize,
          margin,
          margin + x * cellSize,
          margin + height * cellSize,
          palette.grid,
          0.5,
        ),
      );
    }
    for (let y = 0; y <= height; y++) {
      elements.push(
        line(
          margin,
          margin + y * cellSize,
          margin + width * cellSize,
          margin + y * cellSize,
          palette.grid,
          0.5,
        ),
      );
    }
    elements.push(`</g>`);
  }

  // Terrain cells
  elements.push(`<g class="terrain">`);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = terrain[y * width + x];
      const color = cell === CellType.FLOOR ? palette.floor : palette.wall;
      elements.push(
        rect(margin + x * cellSize, margin + y * cellSize, cellSize, cellSize, color),
      );
    }
  }
  elements.push(`</g>`);

  // Room outlines
  if (showRoomOutlines) {
    elements.push(`<g class="room-outlines">`);
    for (const room of rooms) {
      elements.push(
        rect(
          margin + room.x * cellSize,
          margin + room.y * cellSize,
          room.width * cellSize,
          room.height * cellSize,
          "none",
          {
            stroke: palette.roomOutline,
            "stroke-width": 2,
            opacity: 0.7,
          },
        ),
      );
    }
    elements.push(`</g>`);
  }

  // Connection lines
  if (showConnections) {
    elements.push(`<g class="connections">`);
    const roomMap = new Map<number, Room>(rooms.map((r) => [r.id, r]));

    for (const conn of connections) {
      const fromRoom = roomMap.get(conn.fromRoomId);
      const toRoom = roomMap.get(conn.toRoomId);
      if (!fromRoom || !toRoom) continue;

      const x1 = margin + fromRoom.centerX * cellSize + cellSize / 2;
      const y1 = margin + fromRoom.centerY * cellSize + cellSize / 2;
      const x2 = margin + toRoom.centerX * cellSize + cellSize / 2;
      const y2 = margin + toRoom.centerY * cellSize + cellSize / 2;

      elements.push(
        line(x1, y1, x2, y2, palette.connectionLine, 1.5, {
          opacity: 0.5,
          "stroke-dasharray": "4,2",
        }),
      );

      // Door marker
      if (showDoors && conn.doorPosition) {
        const doorColor = getDoorColor(conn, palette);
        const dx = margin + conn.doorPosition.x * cellSize + cellSize / 2;
        const dy = margin + conn.doorPosition.y * cellSize + cellSize / 2;
        elements.push(
          rect(dx - 3, dy - 3, 6, 6, doorColor, {
            stroke: palette.text,
            "stroke-width": 1,
          }),
        );
      }
    }
    elements.push(`</g>`);
  }

  // Spawn points
  if (showSpawns) {
    elements.push(`<g class="spawns">`);
    for (const spawn of spawns) {
      const cx = margin + spawn.position.x * cellSize + cellSize / 2;
      const cy = margin + spawn.position.y * cellSize + cellSize / 2;
      const size = cellSize * 0.6;

      if (spawn.type === "entrance") {
        // Triangle pointing up
        elements.push(
          polygon(
            [
              [cx, cy - size / 2],
              [cx - size / 2, cy + size / 2],
              [cx + size / 2, cy + size / 2],
            ],
            palette.entrance,
            { stroke: palette.text, "stroke-width": 1 },
          ),
        );
      } else if (spawn.type === "exit") {
        // Triangle pointing down
        elements.push(
          polygon(
            [
              [cx, cy + size / 2],
              [cx - size / 2, cy - size / 2],
              [cx + size / 2, cy - size / 2],
            ],
            palette.exit,
            { stroke: palette.text, "stroke-width": 1 },
          ),
        );
      }
    }
    elements.push(`</g>`);
  }

  // Room IDs
  if (showRoomIds) {
    elements.push(`<g class="room-ids">`);
    for (const room of rooms) {
      const cx = margin + room.centerX * cellSize + cellSize / 2;
      const cy = margin + room.centerY * cellSize + cellSize / 2;
      elements.push(text(cx, cy, String(room.id), palette.text, cellSize * 0.8));
    }
    elements.push(`</g>`);
  }

  // Build SVG
  const styles = embedStyles
    ? `<style>
    .terrain rect { shape-rendering: crispEdges; }
    text { font-family: monospace; font-weight: bold; }
  </style>`
    : "";

  const titleElement = title
    ? `<title>${escapeXml(title)}</title>`
    : `<title>Dungeon ${width}x${height}</title>`;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}">
  ${titleElement}
  ${styles}
  ${elements.join("\n  ")}
</svg>`;

  return svg;
}

/**
 * Get the color for a door based on connection type
 */
function getDoorColor(conn: Connection, palette: SVGColorPalette): string {
  switch (conn.type) {
    case "door":
      return palette.doorOpen;
    case "locked_door":
      return palette.doorLocked;
    case "secret":
      return palette.doorSecret;
    default:
      return palette.doorOpen;
  }
}

// =============================================================================
// BATCH RENDERING
// =============================================================================

/**
 * Render multiple dungeons as a grid of SVGs (useful for comparison)
 */
export function renderSVGGrid(
  dungeons: DungeonArtifact[],
  options: SVGOptions & {
    /** Number of columns in the grid */
    columns?: number;
    /** Gap between dungeons */
    gap?: number;
  } = {},
): string {
  const { columns = 3, gap = 20, ...svgOptions } = options;
  const cellSize = svgOptions.cellSize ?? 10;
  const margin = svgOptions.margin ?? 10;

  if (dungeons.length === 0) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"></svg>`;
  }

  // Calculate grid dimensions
  const rows = Math.ceil(dungeons.length / columns);
  const maxWidth = Math.max(...dungeons.map((d) => d.width));
  const maxHeight = Math.max(...dungeons.map((d) => d.height));

  const dungeonWidth = maxWidth * cellSize + margin * 2;
  const dungeonHeight = maxHeight * cellSize + margin * 2;

  const totalWidth = columns * dungeonWidth + (columns - 1) * gap;
  const totalHeight = rows * dungeonHeight + (rows - 1) * gap;

  const elements: string[] = [];
  elements.push(
    rect(0, 0, totalWidth, totalHeight, svgOptions.palette?.background ?? DARK_PALETTE.background),
  );

  for (let i = 0; i < dungeons.length; i++) {
    const dungeon = dungeons[i];
    if (!dungeon) continue;

    const col = i % columns;
    const row = Math.floor(i / columns);
    const x = col * (dungeonWidth + gap);
    const y = row * (dungeonHeight + gap);

    // Render individual dungeon (without outer XML declaration)
    const innerSVG = renderSVG(dungeon, { ...svgOptions, embedStyles: false })
      .replace(/^<\?xml.*?\?>\s*/i, "")
      .replace(/<svg[^>]*>/, `<g transform="translate(${x}, ${y})">`)
      .replace(/<\/svg>/, "</g>");

    elements.push(innerSVG);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${totalHeight}" width="${totalWidth}" height="${totalHeight}">
  <title>Dungeon Grid (${dungeons.length} dungeons)</title>
  <style>
    .terrain rect { shape-rendering: crispEdges; }
    text { font-family: monospace; font-weight: bold; }
  </style>
  ${elements.join("\n  ")}
</svg>`;
}

// =============================================================================
// LEGEND RENDERING
// =============================================================================

/**
 * Render a legend for the SVG
 */
export function renderSVGLegend(
  palette: SVGColorPalette = DARK_PALETTE,
): string {
  const items = [
    { label: "Wall", color: palette.wall },
    { label: "Floor", color: palette.floor },
    { label: "Entrance", color: palette.entrance },
    { label: "Exit", color: palette.exit },
    { label: "Room Outline", color: palette.roomOutline },
    { label: "Connection", color: palette.connectionLine },
    { label: "Door (open)", color: palette.doorOpen },
    { label: "Door (locked)", color: palette.doorLocked },
    { label: "Secret", color: palette.doorSecret },
  ];

  const itemHeight = 24;
  const width = 150;
  const height = items.length * itemHeight + 20;

  const elements: string[] = [];
  elements.push(rect(0, 0, width, height, palette.background));

  items.forEach((item, i) => {
    const y = 10 + i * itemHeight;
    elements.push(rect(10, y + 4, 16, 16, item.color, { stroke: palette.text, "stroke-width": 0.5 }));
    elements.push(text(90, y + 12, item.label, palette.text, 11, { "text-anchor": "start" }));
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">
  <title>Dungeon Legend</title>
  <style>text { font-family: sans-serif; }</style>
  ${elements.join("\n  ")}
</svg>`;
}
