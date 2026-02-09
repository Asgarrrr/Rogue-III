/**
 * Snapshot Viewer
 *
 * Utilities for visualizing pipeline snapshots and generation progress.
 * Allows stepping through the generation process pass-by-pass.
 *
 * @example
 * ```typescript
 * import { generate, createSeed } from "@rogue/procgen";
 * import { renderSnapshotSequence, generateSnapshotHTML } from "@rogue/procgen/utils/snapshot-viewer";
 *
 * const result = generate({
 *   width: 60,
 *   height: 40,
 *   seed: createSeed(12345),
 * }, { captureSnapshots: true });
 *
 * if (result.success) {
 *   const sequence = renderSnapshotSequence(result.snapshots, "ascii");
 *   sequence.forEach((frame, i) => console.log(`Pass ${i}:\n${frame}`));
 * }
 * ```
 */

import { CellType } from "../core/grid";
import type { DungeonArtifact, PipelineSnapshot } from "../pipeline/types";
import { DEFAULT_CHARSET, type AsciiCharset } from "./ascii-renderer";
import {
  DARK_PALETTE,
  NEUTRAL_DARK_PALETTE,
  type SVGColorPalette,
} from "./svg-renderer";

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Options for snapshot sequence rendering
 */
export interface SnapshotSequenceOptions {
  /** ASCII charset for text rendering */
  readonly charset?: AsciiCharset;
  /** Color palette for SVG rendering */
  readonly palette?: SVGColorPalette;
  /** Cell size for SVG (pixels) */
  readonly cellSize?: number;
  /** Show pass IDs as labels */
  readonly showPassIds?: boolean;
}

/**
 * Options for HTML snapshot viewer
 */
export interface SnapshotHTMLOptions extends SnapshotSequenceOptions {
  /** Page title */
  readonly title?: string;
  /** Auto-play on load */
  readonly autoPlay?: boolean;
  /** Playback speed (ms per frame) */
  readonly playbackSpeed?: number;
  /** Include final dungeon stats */
  readonly showStats?: boolean;
}

// =============================================================================
// ASCII SNAPSHOT RENDERING
// =============================================================================

/**
 * Render a single snapshot as ASCII art
 */
export function renderSnapshotAscii(
  snapshot: PipelineSnapshot,
  width: number,
  height: number,
  options: { charset?: AsciiCharset; showPassId?: boolean } = {},
): string {
  const { charset = DEFAULT_CHARSET, showPassId = true } = options;

  if (!snapshot.terrain) {
    return showPassId
      ? `[${snapshot.passId}] No terrain data captured`
      : `No terrain data captured`;
  }

  const lines: string[] = [];

  // Header with pass info
  if (showPassId) {
    lines.push(`=== Pass ${snapshot.passIndex}: ${snapshot.passId} ===`);
    lines.push(`Rooms: ${snapshot.roomCount} | Connections: ${snapshot.connectionCount}`);
    lines.push("");
  }

  // Render terrain
  for (let y = 0; y < height; y++) {
    let line = "";
    for (let x = 0; x < width; x++) {
      const cell = snapshot.terrain[y * width + x];
      line += cell === CellType.FLOOR ? charset.floor : charset.wall;
    }
    lines.push(line);
  }

  return lines.join("\n");
}

/**
 * Render all snapshots as ASCII sequence
 */
export function renderSnapshotSequenceAscii(
  snapshots: readonly PipelineSnapshot[],
  width: number,
  height: number,
  options: SnapshotSequenceOptions = {},
): string[] {
  const { charset, showPassIds = true } = options;

  return snapshots.map((snapshot) =>
    renderSnapshotAscii(snapshot, width, height, { charset, showPassId: showPassIds }),
  );
}

// =============================================================================
// SVG SNAPSHOT RENDERING
// =============================================================================

/**
 * Render a single snapshot as SVG
 */
export function renderSnapshotSVG(
  snapshot: PipelineSnapshot,
  width: number,
  height: number,
  options: { palette?: SVGColorPalette; cellSize?: number; showPassId?: boolean } = {},
): string {
  const { palette = DARK_PALETTE, cellSize = 8, showPassId = true } = options;
  const margin = 10;
  const headerHeight = showPassId ? 30 : 0;

  if (!snapshot.terrain) {
    const svgWidth = 300;
    const svgHeight = 100;
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}">
  <rect width="100%" height="100%" fill="${palette.background}"/>
  <text x="150" y="50" fill="${palette.text}" text-anchor="middle" font-family="monospace">[${snapshot.passId}] No terrain data</text>
</svg>`;
  }

  const svgWidth = width * cellSize + margin * 2;
  const svgHeight = height * cellSize + margin * 2 + headerHeight;

  const elements: string[] = [];

  // Background
  elements.push(`<rect width="100%" height="100%" fill="${palette.background}"/>`);

  // Header
  if (showPassId) {
    elements.push(
      `<text x="${margin}" y="20" fill="${palette.text}" font-family="monospace" font-size="12">Pass ${snapshot.passIndex}: ${snapshot.passId}</text>`,
    );
    elements.push(
      `<text x="${svgWidth - margin}" y="20" fill="${palette.text}" font-family="monospace" font-size="10" text-anchor="end">Rooms: ${snapshot.roomCount} | Connections: ${snapshot.connectionCount}</text>`,
    );
  }

  // Terrain
  elements.push(`<g class="terrain" transform="translate(${margin}, ${margin + headerHeight})">`);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = snapshot.terrain[y * width + x];
      const color = cell === CellType.FLOOR ? palette.floor : palette.wall;
      elements.push(
        `<rect x="${x * cellSize}" y="${y * cellSize}" width="${cellSize}" height="${cellSize}" fill="${color}"/>`,
      );
    }
  }
  elements.push(`</g>`);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}">
  <style>.terrain rect { shape-rendering: crispEdges; }</style>
  ${elements.join("\n  ")}
</svg>`;
}

/**
 * Render all snapshots as SVG sequence
 */
export function renderSnapshotSequenceSVG(
  snapshots: readonly PipelineSnapshot[],
  width: number,
  height: number,
  options: SnapshotSequenceOptions = {},
): string[] {
  const { palette, cellSize, showPassIds = true } = options;

  return snapshots.map((snapshot) =>
    renderSnapshotSVG(snapshot, width, height, { palette, cellSize, showPassId: showPassIds }),
  );
}

// =============================================================================
// UNIFIED SEQUENCE RENDERING
// =============================================================================

/**
 * Render snapshot sequence in specified format
 */
export function renderSnapshotSequence(
  snapshots: readonly PipelineSnapshot[],
  width: number,
  height: number,
  format: "ascii" | "svg" = "ascii",
  options: SnapshotSequenceOptions = {},
): string[] {
  if (format === "svg") {
    return renderSnapshotSequenceSVG(snapshots, width, height, options);
  }
  return renderSnapshotSequenceAscii(snapshots, width, height, options);
}

// =============================================================================
// HTML VIEWER GENERATION
// =============================================================================

/**
 * Generate an interactive HTML viewer for snapshots
 */
export function generateSnapshotHTML(
  snapshots: readonly PipelineSnapshot[],
  dungeon: DungeonArtifact,
  options: SnapshotHTMLOptions = {},
): string {
  const {
    title = "Dungeon Generation Viewer",
    autoPlay = false,
    playbackSpeed = 500,
    showStats = true,
    cellSize = 6,
  } = options;

  const { width, height } = dungeon;

  // Pre-render frames with dark palette
  const frames = snapshots.map((snapshot, i) => {
    const svg = renderSnapshotSVG(snapshot, width, height, { palette: NEUTRAL_DARK_PALETTE, cellSize, showPassId: false });
    const cleanSvg = svg
      .replace(/^<\?xml[^?]*\?>\s*/i, "")
      .replace(/width="\d+" height="\d+"/, 'preserveAspectRatio="xMidYMid meet" style="width:100%;height:100%"');

    // Calculate deltas from previous snapshot
    const prevSnapshot = i > 0 ? snapshots[i - 1] : null;
    const deltaRooms = prevSnapshot ? snapshot.roomCount - prevSnapshot.roomCount : snapshot.roomCount;
    const deltaConnections = prevSnapshot ? snapshot.connectionCount - prevSnapshot.connectionCount : snapshot.connectionCount;

    return {
      passId: snapshot.passId,
      passIndex: snapshot.passIndex,
      roomCount: snapshot.roomCount,
      connectionCount: snapshot.connectionCount,
      deltaRooms,
      deltaConnections,
      hasTerrain: !!snapshot.terrain,
      svg: cleanSvg,
    };
  });

  // Tailwind neutral dark palette
  const colors = {
    bg: "#0a0a0a",        // neutral-950
    surface: "#171717",   // neutral-900
    card: "#262626",      // neutral-800
    border: "#404040",    // neutral-700
    muted: "#525252",     // neutral-600
    text: "#e5e5e5",      // neutral-200
    textMuted: "#a3a3a3", // neutral-400
    accent: "#fafafa",    // neutral-50
  };

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(title)}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background: ${colors.bg};
      color: ${colors.text};
      min-height: 100vh;
      line-height: 1.5;
    }

    .container {
      max-width: 1280px;
      margin: 0 auto;
      padding: 24px;
    }

    header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 24px;
      padding-bottom: 16px;
      border-bottom: 1px solid ${colors.border};
    }

    h1 {
      font-size: 1.125rem;
      font-weight: 500;
      letter-spacing: -0.025em;
    }

    .badge {
      font-size: 0.75rem;
      font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
      color: ${colors.textMuted};
      background: ${colors.surface};
      padding: 4px 8px;
      border-radius: 4px;
      border: 1px solid ${colors.border};
    }

    .viewer {
      display: grid;
      grid-template-columns: 1fr 280px;
      gap: 24px;
    }

    @media (max-width: 900px) {
      .viewer { grid-template-columns: 1fr; }
    }

    .main-panel {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .canvas-container {
      background: ${colors.surface};
      border: 1px solid ${colors.border};
      border-radius: 8px;
      padding: 16px;
      display: flex;
      justify-content: center;
      align-items: center;
      flex: 1;
      min-height: 450px;
      overflow: hidden;
      position: relative;
    }

    .canvas-container svg {
      width: 100%;
      height: 100%;
      border-radius: 4px;
    }

    .canvas-container.fullscreen {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 1000;
      border-radius: 0;
      padding: 32px;
      min-height: auto;
    }

    .controls {
      display: flex;
      align-items: center;
      gap: 12px;
      background: ${colors.surface};
      border: 1px solid ${colors.border};
      border-radius: 8px;
      padding: 12px 16px;
    }

    .btn-group {
      display: flex;
      gap: 1px;
      background: ${colors.border};
      border-radius: 6px;
      overflow: hidden;
    }

    .btn {
      background: ${colors.card};
      color: ${colors.text};
      border: none;
      padding: 8px 12px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      transition: background 0.15s;
    }

    .btn:hover { background: ${colors.muted}; }
    .btn:active { background: ${colors.border}; }
    .btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .btn:first-child { border-radius: 5px 0 0 5px; }
    .btn:last-child { border-radius: 0 5px 5px 0; }

    .slider-wrapper {
      flex: 1;
      display: flex;
      align-items: center;
      gap: 12px;
      min-width: 200px;
    }

    input[type="range"] {
      flex: 1;
      height: 4px;
      -webkit-appearance: none;
      appearance: none;
      background: ${colors.border};
      border-radius: 2px;
      outline: none;
    }

    input[type="range"]::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 14px;
      height: 14px;
      background: ${colors.text};
      border-radius: 50%;
      cursor: pointer;
      transition: transform 0.1s;
    }

    input[type="range"]::-webkit-slider-thumb:hover {
      transform: scale(1.15);
    }

    .speed-control {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 12px;
      color: ${colors.textMuted};
    }

    .speed-control input {
      width: 56px;
      padding: 4px 6px;
      font-size: 12px;
      font-family: ui-monospace, monospace;
      background: ${colors.card};
      border: 1px solid ${colors.border};
      border-radius: 4px;
      color: ${colors.text};
      text-align: center;
    }

    .speed-control input:focus {
      outline: none;
      border-color: ${colors.muted};
    }

    .sidebar {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .card {
      background: ${colors.surface};
      border: 1px solid ${colors.border};
      border-radius: 8px;
      overflow: hidden;
    }

    .card-header {
      padding: 12px 16px;
      border-bottom: 1px solid ${colors.border};
      font-size: 13px;
      font-weight: 500;
      color: ${colors.textMuted};
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .stats-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
    }

    .stat {
      padding: 16px;
      text-align: center;
      border-bottom: 1px solid ${colors.border};
      border-right: 1px solid ${colors.border};
    }

    .stat:nth-child(even) { border-right: none; }
    .stat:nth-last-child(-n+2) { border-bottom: none; }

    .stat-value {
      font-size: 1.25rem;
      font-weight: 600;
      font-family: ui-monospace, monospace;
      color: ${colors.text};
    }

    .stat-label {
      font-size: 11px;
      color: ${colors.textMuted};
      margin-top: 4px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .pass-list {
      max-height: 320px;
      overflow-y: auto;
    }

    .pass-item {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 16px;
      cursor: pointer;
      transition: background 0.1s;
      border-bottom: 1px solid ${colors.border};
      font-size: 12px;
    }

    .pass-item:last-child { border-bottom: none; }
    .pass-item:hover { background: ${colors.card}; }

    .pass-item.active {
      background: ${colors.card};
      box-shadow: inset 3px 0 0 ${colors.text};
    }

    .pass-name {
      font-family: ui-monospace, monospace;
      color: ${colors.text};
    }

    .pass-meta {
      display: flex;
      align-items: center;
      gap: 8px;
      font-family: ui-monospace, monospace;
      color: ${colors.textMuted};
      font-size: 11px;
    }

    .pass-delta {
      font-size: 10px;
      padding: 1px 4px;
      border-radius: 3px;
      font-weight: 500;
    }

    .pass-delta.positive {
      background: rgba(34, 197, 94, 0.15);
      color: #22c55e;
    }

    .pass-delta.negative {
      background: rgba(239, 68, 68, 0.15);
      color: #ef4444;
    }

    .pass-delta.neutral {
      background: ${colors.card};
      color: ${colors.textMuted};
    }

    .pass-index {
      color: ${colors.muted};
      margin-right: 8px;
    }

    /* Icon buttons */
    .icon-btn {
      background: ${colors.card};
      color: ${colors.textMuted};
      border: 1px solid ${colors.border};
      border-radius: 6px;
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all 0.15s;
    }

    .icon-btn:hover {
      background: ${colors.muted};
      color: ${colors.text};
    }

    .icon-btn svg {
      width: 16px;
      height: 16px;
    }

    .right-controls {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-left: auto;
    }

    /* Scrollbar */
    ::-webkit-scrollbar { width: 6px; height: 6px; }
    ::-webkit-scrollbar-track { background: transparent; }
    ::-webkit-scrollbar-thumb { background: ${colors.border}; border-radius: 3px; }
    ::-webkit-scrollbar-thumb:hover { background: ${colors.muted}; }

    /* Keyboard hint */
    .kbd-hints {
      display: flex;
      gap: 16px;
      justify-content: center;
      padding: 12px;
      font-size: 11px;
      color: ${colors.textMuted};
      border-top: 1px solid ${colors.border};
      margin-top: auto;
    }

    kbd {
      font-family: ui-monospace, monospace;
      background: ${colors.card};
      border: 1px solid ${colors.border};
      border-radius: 3px;
      padding: 2px 6px;
      font-size: 10px;
    }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>${escapeHtml(title)}</h1>
      <span class="badge">${dungeon.checksum}</span>
    </header>

    <div class="viewer">
      <div class="main-panel">
        <div class="canvas-container" id="canvas"></div>

        <div class="controls">
          <div class="btn-group">
            <button class="btn" id="prevBtn" title="Previous (←)">◀</button>
            <button class="btn" id="playBtn" title="Play/Pause (Space)">${autoPlay ? "❚❚" : "▶"}</button>
            <button class="btn" id="nextBtn" title="Next (→)">▶</button>
          </div>

          <div class="slider-wrapper">
            <input type="range" id="frameSlider" min="0" max="${frames.length - 1}" value="0">
          </div>

          <div class="speed-control">
            <span>Speed</span>
            <input type="number" id="speedInput" value="${playbackSpeed}" min="100" max="2000" step="100">
            <span>ms</span>
          </div>

          <div class="right-controls">
            <button class="icon-btn" id="fullscreenBtn" title="Fullscreen (F)">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            </button>
          </div>
        </div>

        <div class="kbd-hints">
          <span><kbd>←</kbd> Previous</span>
          <span><kbd>→</kbd> Next</span>
          <span><kbd>Space</kbd> Play/Pause</span>
          <span><kbd>F</kbd> Fullscreen</span>
        </div>
      </div>

      <div class="sidebar">
        ${
          showStats
            ? `
        <div class="card">
          <div class="card-header">Stats</div>
          <div class="stats-grid">
            <div class="stat">
              <div class="stat-value">${dungeon.width}×${dungeon.height}</div>
              <div class="stat-label">Size</div>
            </div>
            <div class="stat">
              <div class="stat-value">${dungeon.rooms.length}</div>
              <div class="stat-label">Rooms</div>
            </div>
            <div class="stat">
              <div class="stat-value">${dungeon.connections.length}</div>
              <div class="stat-label">Connections</div>
            </div>
            <div class="stat">
              <div class="stat-value">${frames.length}</div>
              <div class="stat-label">Passes</div>
            </div>
          </div>
        </div>
        `
            : ""
        }

        <div class="card">
          <div class="card-header">Pipeline</div>
          <div class="pass-list" id="passList">
            ${frames
              .map(
                (f, i) => {
                  const deltaRClass = f.deltaRooms > 0 ? "positive" : f.deltaRooms < 0 ? "negative" : "neutral";
                  const deltaCClass = f.deltaConnections > 0 ? "positive" : f.deltaConnections < 0 ? "negative" : "neutral";
                  const deltaRStr = f.deltaRooms > 0 ? `+${f.deltaRooms}` : f.deltaRooms.toString();
                  const deltaCStr = f.deltaConnections > 0 ? `+${f.deltaConnections}` : f.deltaConnections.toString();
                  return `
            <div class="pass-item${i === 0 ? " active" : ""}" data-index="${i}">
              <span class="pass-name"><span class="pass-index">${i}.</span>${escapeHtml(f.passId.split(".").pop() || f.passId)}</span>
              <span class="pass-meta">
                <span class="pass-delta ${deltaRClass}" title="Rooms">R${deltaRStr}</span>
                <span class="pass-delta ${deltaCClass}" title="Connections">C${deltaCStr}</span>
              </span>
            </div>
            `;
                },
              )
              .join("")}
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const frames = ${JSON.stringify(frames.map((f) => ({ svg: f.svg, passId: f.passId })))};
    let currentFrame = 0;
    let isPlaying = ${autoPlay};
    let playInterval = null;
    let playbackSpeed = ${playbackSpeed};

    const canvas = document.getElementById('canvas');
    const slider = document.getElementById('frameSlider');
    const playBtn = document.getElementById('playBtn');
    const prevBtn = document.getElementById('prevBtn');
    const nextBtn = document.getElementById('nextBtn');
    const speedInput = document.getElementById('speedInput');
    const fullscreenBtn = document.getElementById('fullscreenBtn');
    const passItems = document.querySelectorAll('.pass-item');

    function showFrame(index) {
      currentFrame = Math.max(0, Math.min(frames.length - 1, index));
      canvas.innerHTML = frames[currentFrame].svg;
      slider.value = currentFrame;

      passItems.forEach((item, i) => {
        item.classList.toggle('active', i === currentFrame);
        if (i === currentFrame) {
          item.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      });
    }

    function togglePlay() {
      isPlaying = !isPlaying;
      playBtn.textContent = isPlaying ? '❚❚' : '▶';

      if (isPlaying) {
        playInterval = setInterval(() => {
          if (currentFrame >= frames.length - 1) {
            // Stop at the end
            isPlaying = false;
            playBtn.textContent = '▶';
            clearInterval(playInterval);
          } else {
            currentFrame++;
            showFrame(currentFrame);
          }
        }, playbackSpeed);
      } else {
        clearInterval(playInterval);
      }
    }

    function toggleFullscreen() {
      canvas.classList.toggle('fullscreen');
      const isFullscreen = canvas.classList.contains('fullscreen');
      fullscreenBtn.innerHTML = isFullscreen
        ? '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>'
        : '<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"/></svg>';
    }

    slider.addEventListener('input', (e) => showFrame(parseInt(e.target.value)));
    playBtn.addEventListener('click', togglePlay);
    prevBtn.addEventListener('click', () => showFrame(currentFrame - 1));
    nextBtn.addEventListener('click', () => showFrame(currentFrame + 1));
    fullscreenBtn.addEventListener('click', toggleFullscreen);
    speedInput.addEventListener('change', (e) => {
      playbackSpeed = parseInt(e.target.value) || 500;
      if (isPlaying) {
        clearInterval(playInterval);
        playInterval = setInterval(() => {
          if (currentFrame >= frames.length - 1) {
            isPlaying = false;
            playBtn.textContent = '▶';
            clearInterval(playInterval);
          } else {
            currentFrame++;
            showFrame(currentFrame);
          }
        }, playbackSpeed);
      }
    });

    passItems.forEach(item => {
      item.addEventListener('click', () => showFrame(parseInt(item.dataset.index)));
    });

    document.addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      if (e.key === 'ArrowLeft') showFrame(currentFrame - 1);
      if (e.key === 'ArrowRight') showFrame(currentFrame + 1);
      if (e.key === ' ') { e.preventDefault(); togglePlay(); }
      if (e.key === 'f' || e.key === 'F') toggleFullscreen();
      if (e.key === 'Escape' && canvas.classList.contains('fullscreen')) toggleFullscreen();
    });

    // Initialize
    showFrame(0);
    if (${autoPlay}) togglePlay();
  </script>
</body>
</html>`;

  return html;
}

/**
 * Escape HTML special characters
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// =============================================================================
// DIFF/COMPARISON UTILITIES
// =============================================================================

/**
 * Compare two snapshots and highlight differences
 */
export function compareSnapshots(
  before: PipelineSnapshot,
  after: PipelineSnapshot,
  width: number,
  height: number,
  options: { palette?: SVGColorPalette; cellSize?: number } = {},
): string {
  const { palette = DARK_PALETTE, cellSize = 8 } = options;
  const margin = 10;

  if (!before.terrain || !after.terrain) {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 50">
      <text x="100" y="25" fill="${palette.text}" text-anchor="middle" font-family="monospace">Missing terrain data</text>
    </svg>`;
  }

  const svgWidth = width * cellSize + margin * 2;
  const svgHeight = height * cellSize + margin * 2 + 40;

  const elements: string[] = [];
  elements.push(`<rect width="100%" height="100%" fill="${palette.background}"/>`);
  elements.push(
    `<text x="${margin}" y="20" fill="${palette.text}" font-family="monospace" font-size="12">Diff: ${before.passId} -> ${after.passId}</text>`,
  );

  const addedColor = "#22c55e";
  const removedColor = "#ef4444";
  const unchangedFloor = palette.floor;
  const unchangedWall = palette.wall;

  elements.push(`<g transform="translate(${margin}, ${margin + 30})">`);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const beforeCell = before.terrain[idx];
      const afterCell = after.terrain[idx];

      let color: string;
      if (beforeCell === afterCell) {
        color = afterCell === CellType.FLOOR ? unchangedFloor : unchangedWall;
      } else if (beforeCell === CellType.WALL && afterCell === CellType.FLOOR) {
        color = addedColor; // Wall became floor (carved)
      } else {
        color = removedColor; // Floor became wall (filled)
      }

      elements.push(
        `<rect x="${x * cellSize}" y="${y * cellSize}" width="${cellSize}" height="${cellSize}" fill="${color}"/>`,
      );
    }
  }
  elements.push(`</g>`);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}">
  <style>.terrain rect { shape-rendering: crispEdges; }</style>
  ${elements.join("\n  ")}
</svg>`;
}
