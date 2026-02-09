/**
 * Snapshot Viewer Tests
 */

import { describe, expect, test } from "bun:test";
import type { DungeonArtifact, PipelineSnapshot } from "../src/pipeline/types";
import {
  compareSnapshots,
  generateSnapshotHTML,
  renderSnapshotAscii,
  renderSnapshotSequence,
  renderSnapshotSequenceAscii,
  renderSnapshotSequenceSVG,
  renderSnapshotSVG,
} from "../src/utils/snapshot-viewer";

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function createMockSnapshot(
  passId: string,
  passIndex: number,
  roomCount: number,
  connectionCount: number,
  hasTerrain: boolean = true,
): PipelineSnapshot {
  const width = 20;
  const height = 15;

  let terrain: Uint8Array | undefined;
  if (hasTerrain) {
    terrain = new Uint8Array(width * height);
    // Create a simple pattern (room in the middle)
    for (let y = 5; y < 10; y++) {
      for (let x = 5; x < 15; x++) {
        terrain[y * width + x] = 1; // FLOOR
      }
    }
  }

  return {
    passId,
    passIndex,
    timestamp: passIndex * 100,
    terrain,
    roomCount,
    connectionCount,
  };
}

function createMockDungeon(): DungeonArtifact {
  const width = 20;
  const height = 15;
  const terrain = new Uint8Array(width * height);

  // Create floor area
  for (let y = 3; y < 12; y++) {
    for (let x = 3; x < 17; x++) {
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
        x: 3,
        y: 3,
        width: 14,
        height: 9,
        centerX: 10,
        centerY: 7,
        type: "normal",
        seed: 12345,
      },
    ],
    connections: [],
    spawns: [],
    checksum: "test123",
    seed: { primary: 12345n, dimension: 0n, floor: 0n },
  };
}

// =============================================================================
// ASCII RENDERING TESTS
// =============================================================================

describe("renderSnapshotAscii", () => {
  test("renders snapshot with pass info", () => {
    const snapshot = createMockSnapshot("bsp.carve-rooms", 3, 5, 4);

    const ascii = renderSnapshotAscii(snapshot, 20, 15, { showPassId: true });

    expect(ascii).toContain("Pass 3: bsp.carve-rooms");
    expect(ascii).toContain("Rooms: 5");
    expect(ascii).toContain("Connections: 4");
  });

  test("renders snapshot without pass info", () => {
    const snapshot = createMockSnapshot("bsp.carve-rooms", 3, 5, 4);

    const ascii = renderSnapshotAscii(snapshot, 20, 15, { showPassId: false });

    expect(ascii).not.toContain("Pass 3");
    expect(ascii).not.toContain("bsp.carve-rooms");
  });

  test("handles missing terrain", () => {
    const snapshot = createMockSnapshot("bsp.init", 0, 0, 0, false);

    const ascii = renderSnapshotAscii(snapshot, 20, 15);

    expect(ascii).toContain("No terrain data captured");
  });

  test("renders terrain cells correctly", () => {
    const snapshot = createMockSnapshot("bsp.carve-rooms", 3, 1, 0);

    const ascii = renderSnapshotAscii(snapshot, 20, 15);

    // Should contain floor and wall characters
    expect(ascii).toContain("·"); // Floor
    expect(ascii).toContain("█"); // Wall
  });
});

describe("renderSnapshotSequenceAscii", () => {
  test("renders sequence of snapshots", () => {
    const snapshots = [
      createMockSnapshot("pass1", 0, 0, 0),
      createMockSnapshot("pass2", 1, 3, 0),
      createMockSnapshot("pass3", 2, 3, 2),
    ];

    const sequence = renderSnapshotSequenceAscii(snapshots, 20, 15);

    expect(sequence).toHaveLength(3);
    expect(sequence[0]).toContain("pass1");
    expect(sequence[1]).toContain("pass2");
    expect(sequence[2]).toContain("pass3");
  });

  test("handles empty snapshot array", () => {
    const sequence = renderSnapshotSequenceAscii([], 20, 15);

    expect(sequence).toHaveLength(0);
  });
});

// =============================================================================
// SVG RENDERING TESTS
// =============================================================================

describe("renderSnapshotSVG", () => {
  test("generates valid SVG", () => {
    const snapshot = createMockSnapshot("bsp.carve-rooms", 3, 5, 4);

    const svg = renderSnapshotSVG(snapshot, 20, 15);

    expect(svg).toContain('<?xml version="1.0"');
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
  });

  test("includes pass info in SVG when enabled", () => {
    const snapshot = createMockSnapshot("bsp.carve-rooms", 3, 5, 4);

    const svg = renderSnapshotSVG(snapshot, 20, 15, { showPassId: true });

    expect(svg).toContain("Pass 3: bsp.carve-rooms");
    expect(svg).toContain("Rooms: 5");
  });

  test("handles missing terrain", () => {
    const snapshot = createMockSnapshot("bsp.init", 0, 0, 0, false);

    const svg = renderSnapshotSVG(snapshot, 20, 15);

    expect(svg).toContain("No terrain data");
  });

  test("respects cell size option", () => {
    const snapshot = createMockSnapshot("bsp.carve-rooms", 1, 1, 0);

    const svg = renderSnapshotSVG(snapshot, 20, 15, { cellSize: 12 });

    // SVG should be generated successfully with different cell size
    expect(svg).toContain("<svg");
  });
});

describe("renderSnapshotSequenceSVG", () => {
  test("renders sequence of SVG snapshots", () => {
    const snapshots = [
      createMockSnapshot("pass1", 0, 0, 0),
      createMockSnapshot("pass2", 1, 3, 0),
    ];

    const sequence = renderSnapshotSequenceSVG(snapshots, 20, 15);

    expect(sequence).toHaveLength(2);
    expect(sequence[0]).toContain("<svg");
    expect(sequence[1]).toContain("<svg");
  });
});

// =============================================================================
// UNIFIED RENDERING TESTS
// =============================================================================

describe("renderSnapshotSequence", () => {
  test("renders as ASCII by default", () => {
    const snapshots = [createMockSnapshot("pass1", 0, 1, 0)];

    const sequence = renderSnapshotSequence(snapshots, 20, 15, "ascii");

    expect(sequence[0]).toContain("█"); // ASCII wall character
    expect(sequence[0]).not.toContain("<svg");
  });

  test("renders as SVG when specified", () => {
    const snapshots = [createMockSnapshot("pass1", 0, 1, 0)];

    const sequence = renderSnapshotSequence(snapshots, 20, 15, "svg");

    expect(sequence[0]).toContain("<svg");
  });
});

// =============================================================================
// HTML VIEWER TESTS
// =============================================================================

describe("generateSnapshotHTML", () => {
  test("generates valid HTML document", () => {
    const snapshots = [
      createMockSnapshot("pass1", 0, 0, 0),
      createMockSnapshot("pass2", 1, 2, 1),
    ];
    const dungeon = createMockDungeon();

    const html = generateSnapshotHTML(snapshots, dungeon);

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<html");
    expect(html).toContain("</html>");
  });

  test("includes custom title", () => {
    const snapshots = [createMockSnapshot("pass1", 0, 0, 0)];
    const dungeon = createMockDungeon();

    const html = generateSnapshotHTML(snapshots, dungeon, { title: "My Test Viewer" });

    expect(html).toContain("<title>My Test Viewer</title>");
    expect(html).toContain("<h1>My Test Viewer</h1>");
  });

  test("includes playback controls", () => {
    const snapshots = [createMockSnapshot("pass1", 0, 0, 0)];
    const dungeon = createMockDungeon();

    const html = generateSnapshotHTML(snapshots, dungeon);

    expect(html).toContain('id="playBtn"');
    expect(html).toContain('id="prevBtn"');
    expect(html).toContain('id="nextBtn"');
    expect(html).toContain('id="frameSlider"');
  });

  test("includes pass list", () => {
    const snapshots = [
      createMockSnapshot("bsp.init", 0, 0, 0),
      createMockSnapshot("bsp.carve", 1, 3, 0),
    ];
    const dungeon = createMockDungeon();

    const html = generateSnapshotHTML(snapshots, dungeon);

    expect(html).toContain("bsp.init");
    expect(html).toContain("bsp.carve");
    expect(html).toContain('class="pass-item"');
  });

  test("includes stats when enabled", () => {
    const snapshots = [createMockSnapshot("pass1", 0, 0, 0)];
    const dungeon = createMockDungeon();

    const html = generateSnapshotHTML(snapshots, dungeon, { showStats: true });

    expect(html).toContain('class="stats-grid"');
    expect(html).toContain("Size");
    expect(html).toContain("Rooms");
    expect(html).toContain("Connections");
    expect(html).toContain("Passes");
  });

  test("excludes stats when disabled", () => {
    const snapshots = [createMockSnapshot("pass1", 0, 0, 0)];
    const dungeon = createMockDungeon();

    const html = generateSnapshotHTML(snapshots, dungeon, { showStats: false });

    expect(html).not.toContain('class="stats-grid"');
    expect(html).not.toContain('<div class="card-header">Stats</div>');
  });

  test("includes embedded frames as JavaScript array", () => {
    const snapshots = [
      createMockSnapshot("pass1", 0, 0, 0),
      createMockSnapshot("pass2", 1, 1, 0),
    ];
    const dungeon = createMockDungeon();

    const html = generateSnapshotHTML(snapshots, dungeon);

    expect(html).toContain("const frames = [");
  });

  test("respects autoPlay option", () => {
    const snapshots = [createMockSnapshot("pass1", 0, 0, 0)];
    const dungeon = createMockDungeon();

    const htmlAutoPlay = generateSnapshotHTML(snapshots, dungeon, { autoPlay: true });
    const htmlNoAutoPlay = generateSnapshotHTML(snapshots, dungeon, { autoPlay: false });

    expect(htmlAutoPlay).toContain("isPlaying = true");
    expect(htmlNoAutoPlay).toContain("isPlaying = false");
  });

  test("respects playbackSpeed option", () => {
    const snapshots = [createMockSnapshot("pass1", 0, 0, 0)];
    const dungeon = createMockDungeon();

    const html = generateSnapshotHTML(snapshots, dungeon, { playbackSpeed: 1000 });

    expect(html).toContain("playbackSpeed = 1000");
  });
});

// =============================================================================
// COMPARISON TESTS
// =============================================================================

describe("compareSnapshots", () => {
  test("generates diff SVG", () => {
    const before = createMockSnapshot("before", 0, 0, 0);
    const after = createMockSnapshot("after", 1, 1, 0);

    // Modify the 'after' terrain to show changes
    if (after.terrain) {
      after.terrain[7 * 20 + 10] = 1; // Add a floor tile
    }

    const svg = compareSnapshots(before, after, 20, 15);

    expect(svg).toContain("<svg");
    expect(svg).toContain("Diff:");
    expect(svg).toContain("before");
    expect(svg).toContain("after");
  });

  test("handles missing terrain", () => {
    const before = createMockSnapshot("before", 0, 0, 0, false);
    const after = createMockSnapshot("after", 1, 1, 0);

    const svg = compareSnapshots(before, after, 20, 15);

    expect(svg).toContain("Missing terrain data");
  });
});
