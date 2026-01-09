import type { Dungeon } from "../../entities";
import type { Connection } from "../../entities/connection";
import type { Room } from "../types";

function displayGrid(grid: boolean[][], showCoords = false): string {
  if (!grid.length || !grid[0]?.length) return "";

  const height = grid.length;
  const width = grid[0].length;
  const lines: string[] = [];

  if (showCoords) {
    const xHeader =
      "   " +
      Array.from({ length: width }, (_, x) => (x % 10).toString()).join("");
    const xSpacer = `   ${" ".repeat(width)}`;
    lines.push(xHeader, xSpacer);
  }

  for (let y = 0; y < height; y++) {
    let line = "";
    if (showCoords) line += `${y.toString().padStart(2, " ")} `;
    for (let x = 0; x < width; x++) line += grid[y][x] ? "█" : " ";
    lines.push(line);
  }

  return lines.join("\n");
}

function displayDungeon(dungeon: Dungeon, showCoords = false): string {
  const { width, height } = dungeon.config;
  const header = `Dungeon ${width}x${height} (${dungeon.rooms.length} rooms)\n`;
  const separator = `${"=".repeat(width + (showCoords ? 3 : 0))}\n`;

  // Use terrain if available, fallback to toLegacyGrid() for compatibility
  let gridData: boolean[][] | undefined;

  if (dungeon.terrain) {
    // Convert terrain to boolean grid for display
    gridData = dungeon.toLegacyGrid();
  }

  if (gridData?.[0]?.length) {
    const baseGrid: string[][] = Array.from({ length: height }, (_, y) =>
      Array.from({ length: width }, (_, x) => (gridData[y][x] ? "#" : ".")),
    );
    dungeon.rooms.forEach((room, index) => {
      drawRoom(baseGrid, room, index);
    });
    dungeon.connections.forEach((connection) => {
      drawConnection(baseGrid, connection);
    });
    const gridString = gridToString(baseGrid, showCoords);
    return header + separator + gridString;
  }

  const grid: string[][] = Array.from({ length: height }, () =>
    Array(width).fill(" "),
  );
  drawBorderWalls(grid);
  dungeon.rooms.forEach((room, index) => {
    drawRoom(grid, room, index);
  });
  dungeon.connections.forEach((connection) => {
    drawConnection(grid, connection);
  });
  return header + separator + gridToString(grid, showCoords);
}

function drawBorderWalls(grid: string[][]): void {
  const height = grid.length;
  const width = grid[0]?.length || 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x === 0 || x === width - 1 || y === 0 || y === height - 1)
        grid[y][x] = "█";
    }
  }
}

function drawRoom(grid: string[][], room: Room, index: number): void {
  const { x, y, width, height } = room;
  const gridWidth = grid[0]?.length || 0;
  const gridHeight = grid.length;
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      const gx = x + dx;
      const gy = y + dy;
      if (gx >= 0 && gx < gridWidth && gy >= 0 && gy < gridHeight) {
        if (dx === 0 || dx === width - 1 || dy === 0 || dy === height - 1)
          grid[gy][gx] = "█";
        else grid[gy][gx] = ".";
      }
    }
  }
  const centerX = Math.floor(x + width / 2);
  const centerY = Math.floor(y + height / 2);
  if (
    centerX >= 0 &&
    centerX < gridWidth &&
    centerY >= 0 &&
    centerY < gridHeight
  )
    grid[centerY][centerX] = (index % 10).toString();
}

function drawConnection(grid: string[][], connection: Connection): void {
  const gridWidth = grid[0]?.length || 0;
  const gridHeight = grid.length;
  const startX = connection.from.centerX;
  const startY = connection.from.centerY;
  const endX = connection.to.centerX;
  const endY = connection.to.centerY;
  if (connection.path && connection.path.length > 0) {
    for (const point of connection.path) {
      const x = Math.floor(point.x);
      const y = Math.floor(point.y);
      if (
        x >= 0 &&
        x < gridWidth &&
        y >= 0 &&
        y < gridHeight &&
        grid[y][x] === " "
      )
        grid[y][x] = "#";
    }
  } else {
    drawLine(grid, startX, startY, endX, endY);
  }
}

function drawLine(
  grid: string[][],
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): void {
  const gridWidth = grid[0]?.length || 0;
  const gridHeight = grid.length;
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  let x = x0;
  let y = y0;
  while (true) {
    if (
      x >= 0 &&
      x < gridWidth &&
      y >= 0 &&
      y < gridHeight &&
      grid[y][x] === " "
    )
      grid[y][x] = "#";
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      x += sx;
    }
    if (e2 < dx) {
      err += dx;
      y += sy;
    }
  }
}

function gridToString(grid: string[][], showCoords = false): string {
  const height = grid.length;
  const width = grid[0]?.length || 0;
  const lines: string[] = [];
  if (showCoords) {
    const xHeader =
      "   " +
      Array.from({ length: width }, (_, x) => (x % 10).toString()).join("");
    const xSpacer = `   ${" ".repeat(width)}`;
    lines.push(xHeader, xSpacer);
  }
  for (let y = 0; y < height; y++) {
    let line = "";
    if (showCoords) line += `${y.toString().padStart(2, " ")} `;
    for (let x = 0; x < width; x++) line += grid[y][x];
    lines.push(line);
  }
  return lines.join("\n");
}

function getSummaryData(dungeon: Dungeon): {
  overview: Record<string, string | number>;
  rooms: Array<{
    id: number;
    position: string;
    size: string;
    type: string;
    center: string;
  }>;
  connections: Array<{ from: number; to: number; pathLength: number }>;
} {
  return {
    overview: {
      Dimensions: `${dungeon.config.width}x${dungeon.config.height}`,
      Algorithm: dungeon.config.algorithm,
      "Room Count": dungeon.rooms.length,
      "Connection Count": dungeon.connections.length,
      "Primary Seed": dungeon.seeds.primary,
      Checksum: dungeon.checksum,
    },
    rooms: dungeon.rooms.map((room, i) => ({
      id: i,
      position: `(${room.x}, ${room.y})`,
      size: `${room.width}x${room.height}`,
      type: room.type,
      center: `(${Math.floor(room.x + room.width / 2)}, ${Math.floor(room.y + room.height / 2)})`,
    })),
    connections: dungeon.connections.map((conn) => ({
      from: dungeon.rooms.findIndex((r) => r.id === conn.from.id),
      to: dungeon.rooms.findIndex((r) => r.id === conn.to.id),
      pathLength: conn.path?.length || 0,
    })),
  };
}

function displaySummaryTable(dungeon: Dungeon): void {
  const data = getSummaryData(dungeon);
  console.log("Dungeon Overview");
  console.table(data.overview);
  if (data.rooms.length > 0) {
    console.log("\nRooms");
    console.table(data.rooms);
  }
  if (data.connections.length > 0) {
    console.log("\nConnections");
    console.table(data.connections);
  }
}

function displaySummary(dungeon: Dungeon): string {
  const data = getSummaryData(dungeon);
  const lines: string[] = ["Dungeon Summary", "==============="];
  for (const [key, value] of Object.entries(data.overview)) {
    lines.push(`${key}: ${value}`);
  }
  lines.push("");
  if (data.rooms.length > 0) {
    lines.push("Rooms:");
    data.rooms.forEach((room) => {
      lines.push(
        `  ${room.id}: ${room.position} ${room.size} [${room.type}] (center: ${room.center})`,
      );
    });
    lines.push("");
  }
  if (data.connections.length > 0) {
    lines.push("Connections:");
    data.connections.forEach((conn) => {
      lines.push(
        `  Room ${conn.from} ↔ Room ${conn.to} (${conn.pathLength} steps)`,
      );
    });
  }
  return lines.join("\n");
}

export const AsciiDisplay = {
  displayGrid,
  displayDungeon,
  getSummaryData,
  displaySummaryTable,
  displaySummary,
} as const;
