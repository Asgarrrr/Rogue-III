/**
 * SVG Renderer Tests
 */

import { describe, expect, test } from "bun:test";
import type { DungeonArtifact } from "../src/pipeline/types";
import {
  DARK_PALETTE,
  LIGHT_PALETTE,
  renderSVG,
  renderSVGGrid,
  renderSVGLegend,
} from "../src/utils/svg-renderer";

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function createMockDungeon(width: number, height: number): DungeonArtifact {
  const terrain = new Uint8Array(width * height);

  // Create some floor tiles (cell type 1 = FLOOR)
  for (let y = 5; y < 15; y++) {
    for (let x = 5; x < 20; x++) {
      terrain[y * width + x] = 1;
    }
  }

  return {
    type: "dungeon",
    id: "test-dungeon",
    width,
    height,
    terrain,
    rooms: [
      {
        id: 0,
        x: 5,
        y: 5,
        width: 15,
        height: 10,
        centerX: 12,
        centerY: 10,
        type: "normal",
        seed: 12345,
      },
    ],
    connections: [],
    spawns: [
      {
        position: { x: 6, y: 6 },
        roomId: 0,
        type: "entrance",
        tags: ["spawn"],
        weight: 1,
        distanceFromStart: 0,
      },
      {
        position: { x: 18, y: 13 },
        roomId: 0,
        type: "exit",
        tags: ["exit"],
        weight: 1,
        distanceFromStart: 10,
      },
    ],
    checksum: "abc123",
    seed: { primary: 12345n, dimension: 0n, floor: 0n },
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe("renderSVG", () => {
  test("generates valid SVG document", () => {
    const dungeon = createMockDungeon(40, 30);

    const svg = renderSVG(dungeon);

    expect(svg).toContain('<?xml version="1.0" encoding="UTF-8"?>');
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    expect(svg).toContain("xmlns=");
  });

  test("respects cell size option", () => {
    const dungeon = createMockDungeon(40, 30);

    const svg = renderSVG(dungeon, { cellSize: 20 });

    // SVG dimensions should reflect cell size (40 * 20 + margins)
    expect(svg).toContain("viewBox");
  });

  test("includes terrain cells", () => {
    const dungeon = createMockDungeon(40, 30);

    const svg = renderSVG(dungeon);

    // Should contain rect elements for terrain
    expect(svg).toContain("<rect");
    expect(svg).toContain('class="terrain"');
  });

  test("shows room outlines when enabled", () => {
    const dungeon = createMockDungeon(40, 30);

    const svg = renderSVG(dungeon, { showRoomOutlines: true });

    expect(svg).toContain('class="room-outlines"');
  });

  test("hides room outlines when disabled", () => {
    const dungeon = createMockDungeon(40, 30);

    const svg = renderSVG(dungeon, { showRoomOutlines: false });

    expect(svg).not.toContain('class="room-outlines"');
  });

  test("shows spawn points when enabled", () => {
    const dungeon = createMockDungeon(40, 30);

    const svg = renderSVG(dungeon, { showSpawns: true });

    expect(svg).toContain('class="spawns"');
    // Should contain polygon elements for spawn markers
    expect(svg).toContain("<polygon");
  });

  test("hides spawn points when disabled", () => {
    const dungeon = createMockDungeon(40, 30);

    const svg = renderSVG(dungeon, { showSpawns: false });

    expect(svg).not.toContain('class="spawns"');
  });

  test("shows room IDs when enabled", () => {
    const dungeon = createMockDungeon(40, 30);

    const svg = renderSVG(dungeon, { showRoomIds: true });

    expect(svg).toContain('class="room-ids"');
    expect(svg).toContain("<text");
    expect(svg).toContain(">0<"); // Room ID 0
  });

  test("shows grid when enabled", () => {
    const dungeon = createMockDungeon(40, 30);

    const svg = renderSVG(dungeon, { showGrid: true });

    expect(svg).toContain('class="grid"');
    expect(svg).toContain("<line");
  });

  test("uses dark palette by default", () => {
    const dungeon = createMockDungeon(40, 30);

    const svg = renderSVG(dungeon);

    expect(svg).toContain(DARK_PALETTE.background);
  });

  test("uses light palette when specified", () => {
    const dungeon = createMockDungeon(40, 30);

    const svg = renderSVG(dungeon, { palette: LIGHT_PALETTE });

    expect(svg).toContain(LIGHT_PALETTE.background);
  });

  test("includes title element", () => {
    const dungeon = createMockDungeon(40, 30);

    const svg = renderSVG(dungeon, { title: "Test Dungeon" });

    expect(svg).toContain("<title>Test Dungeon</title>");
  });

  test("uses default title when not specified", () => {
    const dungeon = createMockDungeon(40, 30);

    const svg = renderSVG(dungeon);

    expect(svg).toContain("<title>Dungeon 40x30</title>");
  });

  test("embeds styles when enabled", () => {
    const dungeon = createMockDungeon(40, 30);

    const svg = renderSVG(dungeon, { embedStyles: true });

    expect(svg).toContain("<style>");
  });

  test("excludes styles when disabled", () => {
    const dungeon = createMockDungeon(40, 30);

    const svg = renderSVG(dungeon, { embedStyles: false });

    expect(svg).not.toContain("<style>");
  });
});

describe("renderSVGGrid", () => {
  test("renders multiple dungeons in a grid", () => {
    const dungeons = [
      createMockDungeon(30, 20),
      createMockDungeon(30, 20),
      createMockDungeon(30, 20),
      createMockDungeon(30, 20),
    ];

    const svg = renderSVGGrid(dungeons, { columns: 2 });

    expect(svg).toContain('<?xml version="1.0"');
    expect(svg).toContain("<svg");
    expect(svg).toContain("<title>Dungeon Grid (4 dungeons)</title>");
    // Should contain transform attributes for positioning
    expect(svg).toContain("translate(");
  });

  test("handles empty dungeon array", () => {
    const svg = renderSVGGrid([]);

    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
  });

  test("respects columns option", () => {
    const dungeons = [
      createMockDungeon(20, 20),
      createMockDungeon(20, 20),
      createMockDungeon(20, 20),
    ];

    const svg = renderSVGGrid(dungeons, { columns: 3 });

    // All should be in one row
    expect(svg).toContain("translate(0,");
    expect(svg).not.toContain("translate(0, 2"); // No second row offset
  });
});

describe("renderSVGLegend", () => {
  test("generates legend SVG", () => {
    const svg = renderSVGLegend();

    expect(svg).toContain('<?xml version="1.0"');
    expect(svg).toContain("<svg");
    expect(svg).toContain("<text");
    expect(svg).toContain("Wall");
    expect(svg).toContain("Floor");
    expect(svg).toContain("Entrance");
    expect(svg).toContain("Exit");
  });

  test("uses specified palette", () => {
    const svg = renderSVGLegend(LIGHT_PALETTE);

    expect(svg).toContain(LIGHT_PALETTE.background);
  });
});

describe("SVG palette", () => {
  test("DARK_PALETTE has all required colors", () => {
    expect(DARK_PALETTE.wall).toBeDefined();
    expect(DARK_PALETTE.floor).toBeDefined();
    expect(DARK_PALETTE.entrance).toBeDefined();
    expect(DARK_PALETTE.exit).toBeDefined();
    expect(DARK_PALETTE.roomOutline).toBeDefined();
    expect(DARK_PALETTE.connectionLine).toBeDefined();
    expect(DARK_PALETTE.doorOpen).toBeDefined();
    expect(DARK_PALETTE.doorLocked).toBeDefined();
    expect(DARK_PALETTE.doorSecret).toBeDefined();
    expect(DARK_PALETTE.grid).toBeDefined();
    expect(DARK_PALETTE.text).toBeDefined();
    expect(DARK_PALETTE.background).toBeDefined();
  });

  test("LIGHT_PALETTE has all required colors", () => {
    expect(LIGHT_PALETTE.wall).toBeDefined();
    expect(LIGHT_PALETTE.floor).toBeDefined();
    expect(LIGHT_PALETTE.entrance).toBeDefined();
    expect(LIGHT_PALETTE.exit).toBeDefined();
    expect(LIGHT_PALETTE.roomOutline).toBeDefined();
    expect(LIGHT_PALETTE.connectionLine).toBeDefined();
    expect(LIGHT_PALETTE.doorOpen).toBeDefined();
    expect(LIGHT_PALETTE.doorLocked).toBeDefined();
    expect(LIGHT_PALETTE.doorSecret).toBeDefined();
    expect(LIGHT_PALETTE.grid).toBeDefined();
    expect(LIGHT_PALETTE.text).toBeDefined();
    expect(LIGHT_PALETTE.background).toBeDefined();
  });
});
