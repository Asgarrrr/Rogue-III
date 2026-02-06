/**
 * POI Spawner Pass
 *
 * Specialized spawner for Points of Interest with pattern support.
 * Uses the rule engine for conditional placement and adds POI-specific
 * features like symmetric placement and pattern generation.
 *
 * @example
 * ```typescript
 * const pass = createPOISpawnerPass({
 *   rules: createAllPOIRules(),
 *   placement: { edgePadding: 2, minSpawnDistance: 3 },
 * });
 *
 * const result = pass.run(dungeonState, ctx);
 * ```
 */

import type { Point } from "../../core/geometry/types";
import { CellType } from "../../core/grid/types";
import {
  createRuleEngine,
  parseRules,
  type Rule,
} from "../../core/rules/engine";
import {
  createObjectResolver,
  createRuleCache,
  evaluate,
} from "../../core/rules/evaluator";
import { builtinFunctions } from "../../core/rules/functions";
import type {
  DungeonStateArtifact,
  Pass,
  Room,
  SpawnPoint,
} from "../../pipeline/types";
import {
  calculateConnectionCounts,
  calculateRoomDistances,
} from "../connectivity/graph-algorithms";
import { POI_DEFINITIONS, type POIDefinition } from "./poi-types";
import type {
  ContentAction,
  ContentRule,
  SpawnPlacementOptions,
  SpawnRuleContext,
} from "./types";
import { DEFAULT_SPAWN_OPTIONS } from "./types";

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * POI spawner configuration
 */
export interface POISpawnerConfig {
  /** POI rules (JSON string or parsed rules) */
  readonly rules: string | readonly ContentRule[];
  /** Spawn placement options */
  readonly placement?: SpawnPlacementOptions;
  /** Custom context data */
  readonly context?: Record<string, unknown>;
  /** Whether to enable trace logging */
  readonly trace?: boolean;
  /** Whether to respect POI patterns (pillars in grids, etc.) */
  readonly usePatterns?: boolean;
}

/**
 * Default POI placement options (more spacing than regular spawns)
 */
export const DEFAULT_POI_OPTIONS: Required<SpawnPlacementOptions> = {
  ...DEFAULT_SPAWN_OPTIONS,
  minSpawnDistance: 3,
  edgePadding: 2,
};

// =============================================================================
// PASS IMPLEMENTATION
// =============================================================================

/**
 * Create the POI spawner pass
 */
export function createPOISpawnerPass(
  config: POISpawnerConfig,
): Pass<DungeonStateArtifact, DungeonStateArtifact> {
  return {
    id: "content.poi-spawner",
    inputType: "dungeon-state",
    outputType: "dungeon-state",

    run(input, ctx) {
      const options = { ...DEFAULT_POI_OPTIONS, ...config.placement };
      const usePatterns = config.usePatterns ?? true;
      const engine = createRuleEngine<ContentAction>();

      // Load rules
      const rules =
        typeof config.rules === "string"
          ? parseRules<ContentAction>(config.rules)
          : (config.rules as Rule<ContentAction>[]);

      for (const rule of rules) {
        engine.addRule(rule);
      }

      // Calculate room metadata
      const entrance = input.rooms.find((r) => r.type === "entrance");
      const entranceId = entrance?.id ?? 0;
      const roomDistances = calculateRoomDistances(
        input.rooms,
        input.connections,
        entranceId,
      );
      const connectionCounts = calculateConnectionCounts(
        input.rooms,
        input.connections,
      );
      const maxDistance = Math.max(...Array.from(roomDistances.values()), 1);

      const rng = ctx.streams.details;
      const newSpawns: SpawnPoint[] = [];

      // Track placed POIs to prevent duplicates in same room
      const placedByRoom = new Map<number, Set<string>>();

      // Process each room
      for (const room of input.rooms) {
        const distance = roomDistances.get(room.id) ?? 0;
        const connectionCount = connectionCounts.get(room.id) ?? 0;

        // Build rule context
        const ruleContext: SpawnRuleContext = {
          room: {
            id: room.id,
            type: room.type,
            width: room.width,
            height: room.height,
            area: room.width * room.height,
            centerX: room.centerX,
            centerY: room.centerY,
            distanceFromStart: distance,
            normalizedDistance: distance / maxDistance,
            connectionCount,
            isDeadEnd: connectionCount === 1,
            isHub: connectionCount >= 3,
          },
          dungeon: {
            width: input.width,
            height: input.height,
            roomCount: input.rooms.length,
            connectionCount: input.connections.length,
            depth: ctx.config.depth ?? 1,
            difficulty: ctx.config.difficulty ?? 0.5,
          },
          state: {
            totalSpawns: input.spawns.length + newSpawns.length,
            spawnsByType: {},
            processedRooms: 0,
          },
          ...(config.context ?? {}),
        };

        const resolver = createObjectResolver(ruleContext);
        const result = engine.evaluate(resolver, () => rng.next());

        // Track which POIs we've placed in this room
        const roomPlaced = placedByRoom.get(room.id) ?? new Set<string>();
        placedByRoom.set(room.id, roomPlaced);

        // Process matched rules
        for (const match of result.matched) {
          const action = match.action;
          if (!action || action.type !== "spawn") continue;

          const poiDef = POI_DEFINITIONS[action.template];
          const isExclusive =
            (rules.find((r) => r.id === match.ruleId) as ContentRule)
              ?.exclusive ?? false;

          // Skip if exclusive and already placed
          if (isExclusive && roomPlaced.has(action.template)) {
            continue;
          }

          // Evaluate count
          let count: number;
          if (typeof action.count === "number") {
            count = action.count;
          } else {
            const evalCtx = {
              fields: resolver,
              functions: builtinFunctions,
              ruleCache: createRuleCache(),
              rng: () => rng.next(),
            };
            const result = evaluate(action.count, evalCtx);
            count = typeof result === "number" ? Math.floor(result) : 1;
          }

          // Get positions based on POI placement preference
          const positions = getPOIPositions(
            room,
            input,
            poiDef ?? null,
            count,
            options,
            newSpawns,
            rng,
            usePatterns,
          );

          // Create spawns
          for (const pos of positions) {
            newSpawns.push({
              position: pos,
              roomId: room.id,
              type: "decoration", // POIs are decorations
              tags: ["poi", action.template, ...(poiDef?.tags ?? action.tags)],
              weight: action.weight ?? 1,
              distanceFromStart: distance,
            });

            roomPlaced.add(action.template);
          }
        }
      }

      if (config.trace) {
        ctx.trace.decision(
          "content.poi-spawner",
          "POI placement",
          [`${rules.length} rules`, `${input.rooms.length} rooms`],
          `${newSpawns.length} POIs placed`,
          `Patterns: ${usePatterns}`,
        );
      }

      return {
        ...input,
        spawns: [...input.spawns, ...newSpawns],
      };
    },
  };
}

// =============================================================================
// POSITION CALCULATION
// =============================================================================

/**
 * Get positions for POI placement based on definition
 */
function getPOIPositions(
  room: Room,
  dungeon: DungeonStateArtifact,
  poiDef: POIDefinition | null,
  count: number,
  options: Required<SpawnPlacementOptions>,
  existingSpawns: readonly SpawnPoint[],
  rng: { next(): number },
  usePatterns: boolean,
): Point[] {
  // Check minRoomWidth/minRoomHeight constraints if POI defines them
  if (poiDef) {
    if (poiDef.minRoomWidth !== undefined && room.width < poiDef.minRoomWidth) {
      return [];
    }
    if (
      poiDef.minRoomHeight !== undefined &&
      room.height < poiDef.minRoomHeight
    ) {
      return [];
    }
  }

  const placement = poiDef?.placement ?? "scattered";
  const padding = poiDef?.edgePadding ?? options.edgePadding;
  const minSpacing = poiDef?.minSpacing ?? options.minSpawnDistance;

  // Collect existing positions for collision checking
  const existingPositions = existingSpawns
    .filter((s) => s.roomId === room.id)
    .map((s) => s.position);

  switch (placement) {
    case "center":
      return getCenterPositions(
        room,
        dungeon,
        count,
        padding,
        existingPositions,
      );

    case "corners":
      return getCornerPositions(
        room,
        dungeon,
        count,
        padding,
        existingPositions,
      );

    case "edges":
      return getEdgePositions(
        room,
        dungeon,
        count,
        padding,
        minSpacing,
        existingPositions,
      );

    case "symmetric":
      return getSymmetricPositions(
        room,
        dungeon,
        count,
        padding,
        minSpacing,
        existingPositions,
        rng,
        poiDef?.pattern && usePatterns ? poiDef.pattern : undefined,
      );
    default:
      return getScatteredPositions(
        room,
        dungeon,
        count,
        padding,
        minSpacing,
        existingPositions,
        rng,
      );
  }
}

/**
 * Get center position(s) for POIs
 */
function getCenterPositions(
  room: Room,
  dungeon: DungeonStateArtifact,
  count: number,
  _padding: number,
  existing: readonly Point[],
): Point[] {
  const positions: Point[] = [];
  const centerX = room.centerX;
  const centerY = room.centerY;

  // For single POI, place at center
  if (count === 1) {
    if (
      dungeon.grid.isInBounds(centerX, centerY) &&
      dungeon.grid.get(centerX, centerY) === CellType.FLOOR &&
      !hasNearbyPosition(existing, centerX, centerY, 1)
    ) {
      positions.push({ x: centerX, y: centerY });
    }
    return positions;
  }

  // For multiple, arrange around center
  const offsets = [
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
  ];

  for (let i = 0; i < Math.min(count, offsets.length); i++) {
    const offset = offsets[i];
    if (!offset) continue;

    const x = centerX + offset.dx;
    const y = centerY + offset.dy;

    if (
      dungeon.grid.isInBounds(x, y) &&
      dungeon.grid.get(x, y) === CellType.FLOOR &&
      !hasNearbyPosition(existing, x, y, 1) &&
      !hasNearbyPosition(positions, x, y, 1)
    ) {
      positions.push({ x, y });
    }
  }

  return positions;
}

/**
 * Get corner positions for POIs
 */
function getCornerPositions(
  room: Room,
  dungeon: DungeonStateArtifact,
  count: number,
  padding: number,
  existing: readonly Point[],
): Point[] {
  const positions: Point[] = [];
  const corners = [
    { x: room.x + padding, y: room.y + padding },
    { x: room.x + room.width - 1 - padding, y: room.y + padding },
    { x: room.x + padding, y: room.y + room.height - 1 - padding },
    {
      x: room.x + room.width - 1 - padding,
      y: room.y + room.height - 1 - padding,
    },
  ];

  for (let i = 0; i < Math.min(count, corners.length); i++) {
    const corner = corners[i];
    if (!corner) continue;

    if (
      dungeon.grid.isInBounds(corner.x, corner.y) &&
      dungeon.grid.get(corner.x, corner.y) === CellType.FLOOR &&
      !hasNearbyPosition(existing, corner.x, corner.y, 1) &&
      !hasNearbyPosition(positions, corner.x, corner.y, 1)
    ) {
      positions.push(corner);
    }
  }

  return positions;
}

/**
 * Get edge positions for POIs (along all 4 walls)
 */
function getEdgePositions(
  room: Room,
  dungeon: DungeonStateArtifact,
  count: number,
  padding: number,
  minSpacing: number,
  existing: readonly Point[],
): Point[] {
  const positions: Point[] = [];

  const tryAddPosition = (x: number, y: number): boolean => {
    if (positions.length >= count) return false;
    if (
      dungeon.grid.isInBounds(x, y) &&
      dungeon.grid.get(x, y) === CellType.FLOOR &&
      !hasNearbyPosition(existing, x, y, minSpacing) &&
      !hasNearbyPosition(positions, x, y, minSpacing)
    ) {
      positions.push({ x, y });
      return true;
    }
    return false;
  };

  // Top edge (left to right)
  const topY = room.y + padding;
  for (
    let x = room.x + padding;
    x < room.x + room.width - padding && positions.length < count;
    x += minSpacing
  ) {
    tryAddPosition(x, topY);
  }

  // Bottom edge (left to right)
  const bottomY = room.y + room.height - 1 - padding;
  for (
    let x = room.x + padding;
    x < room.x + room.width - padding && positions.length < count;
    x += minSpacing
  ) {
    tryAddPosition(x, bottomY);
  }

  // Left edge (top to bottom, skip corners already covered)
  const leftX = room.x + padding;
  for (
    let y = room.y + padding + minSpacing;
    y < room.y + room.height - padding - minSpacing && positions.length < count;
    y += minSpacing
  ) {
    tryAddPosition(leftX, y);
  }

  // Right edge (top to bottom, skip corners already covered)
  const rightX = room.x + room.width - 1 - padding;
  for (
    let y = room.y + padding + minSpacing;
    y < room.y + room.height - padding - minSpacing && positions.length < count;
    y += minSpacing
  ) {
    tryAddPosition(rightX, y);
  }

  return positions;
}

/**
 * Get symmetric positions based on pattern type
 */
function getSymmetricPositions(
  room: Room,
  dungeon: DungeonStateArtifact,
  count: number,
  padding: number,
  minSpacing: number,
  existing: readonly Point[],
  rng: { next(): number },
  pattern?: {
    type: string;
    spacing: number;
    minCount: number;
    maxCount: number;
  },
): Point[] {
  const spacing = pattern?.spacing ?? minSpacing;
  const patternType = pattern?.type ?? "grid";

  // Calculate inner dimensions
  const innerWidth = room.width - 2 * padding;
  const innerHeight = room.height - 2 * padding;

  if (innerWidth < spacing || innerHeight < spacing) {
    return getScatteredPositions(
      room,
      dungeon,
      count,
      padding,
      minSpacing,
      existing,
      rng,
    );
  }

  // Dispatch based on pattern type
  switch (patternType) {
    case "frame":
      return getFramePattern(
        room,
        dungeon,
        count,
        padding,
        spacing,
        minSpacing,
        existing,
      );
    case "row":
      return getRowPattern(
        room,
        dungeon,
        count,
        padding,
        spacing,
        minSpacing,
        existing,
      );
    case "diagonal":
      return getDiagonalPattern(
        room,
        dungeon,
        count,
        padding,
        spacing,
        minSpacing,
        existing,
      );
    default:
      return getGridPattern(
        room,
        dungeon,
        count,
        padding,
        spacing,
        minSpacing,
        existing,
      );
  }
}

/**
 * Grid pattern - evenly spaced grid inside the room
 */
function getGridPattern(
  room: Room,
  dungeon: DungeonStateArtifact,
  count: number,
  padding: number,
  spacing: number,
  minSpacing: number,
  existing: readonly Point[],
): Point[] {
  const positions: Point[] = [];
  const innerWidth = room.width - 2 * padding;
  const innerHeight = room.height - 2 * padding;

  const cols = Math.floor(innerWidth / spacing);
  const rows = Math.floor(innerHeight / spacing);

  if (cols <= 0 || rows <= 0) return positions;

  // Offset to center the grid
  const startX =
    room.x + padding + Math.floor((innerWidth - (cols - 1) * spacing) / 2);
  const startY =
    room.y + padding + Math.floor((innerHeight - (rows - 1) * spacing) / 2);

  for (let row = 0; row < rows && positions.length < count; row++) {
    for (let col = 0; col < cols && positions.length < count; col++) {
      const x = startX + col * spacing;
      const y = startY + row * spacing;

      if (
        dungeon.grid.isInBounds(x, y) &&
        dungeon.grid.get(x, y) === CellType.FLOOR &&
        !hasNearbyPosition(existing, x, y, minSpacing) &&
        !hasNearbyPosition(positions, x, y, minSpacing)
      ) {
        positions.push({ x, y });
      }
    }
  }

  return positions;
}

/**
 * Frame pattern - POIs placed around the room perimeter (picture frame)
 */
function getFramePattern(
  room: Room,
  dungeon: DungeonStateArtifact,
  count: number,
  padding: number,
  spacing: number,
  minSpacing: number,
  existing: readonly Point[],
): Point[] {
  const positions: Point[] = [];

  const tryAddPosition = (x: number, y: number): boolean => {
    if (positions.length >= count) return false;
    if (
      dungeon.grid.isInBounds(x, y) &&
      dungeon.grid.get(x, y) === CellType.FLOOR &&
      !hasNearbyPosition(existing, x, y, minSpacing) &&
      !hasNearbyPosition(positions, x, y, minSpacing)
    ) {
      positions.push({ x, y });
      return true;
    }
    return false;
  };

  const innerLeft = room.x + padding;
  const innerTop = room.y + padding;
  const innerRight = room.x + room.width - 1 - padding;
  const innerBottom = room.y + room.height - 1 - padding;

  // Calculate positions to place evenly along frame
  const topBottomCount = Math.floor((innerRight - innerLeft) / spacing) + 1;
  const leftRightCount = Math.floor((innerBottom - innerTop) / spacing) - 1; // Exclude corners

  // Top edge (left to right)
  for (let i = 0; i < topBottomCount && positions.length < count; i++) {
    const x = innerLeft + i * spacing;
    tryAddPosition(x, innerTop);
  }

  // Bottom edge (left to right)
  for (let i = 0; i < topBottomCount && positions.length < count; i++) {
    const x = innerLeft + i * spacing;
    tryAddPosition(x, innerBottom);
  }

  // Left edge (excluding corners already placed)
  for (let i = 1; i <= leftRightCount && positions.length < count; i++) {
    const y = innerTop + i * spacing;
    tryAddPosition(innerLeft, y);
  }

  // Right edge (excluding corners already placed)
  for (let i = 1; i <= leftRightCount && positions.length < count; i++) {
    const y = innerTop + i * spacing;
    tryAddPosition(innerRight, y);
  }

  return positions;
}

/**
 * Row pattern - POIs placed in a horizontal or vertical line
 */
function getRowPattern(
  room: Room,
  dungeon: DungeonStateArtifact,
  count: number,
  padding: number,
  spacing: number,
  minSpacing: number,
  existing: readonly Point[],
): Point[] {
  const positions: Point[] = [];
  const innerWidth = room.width - 2 * padding;
  const innerHeight = room.height - 2 * padding;

  // Place along the longer axis
  const isHorizontal = innerWidth >= innerHeight;

  const tryAddPosition = (x: number, y: number): boolean => {
    if (positions.length >= count) return false;
    if (
      dungeon.grid.isInBounds(x, y) &&
      dungeon.grid.get(x, y) === CellType.FLOOR &&
      !hasNearbyPosition(existing, x, y, minSpacing) &&
      !hasNearbyPosition(positions, x, y, minSpacing)
    ) {
      positions.push({ x, y });
      return true;
    }
    return false;
  };

  if (isHorizontal) {
    const y = room.centerY;
    const startX = room.x + padding;
    const maxPositions = Math.floor(innerWidth / spacing) + 1;
    // Center the row
    const offset = Math.floor((innerWidth - (maxPositions - 1) * spacing) / 2);

    for (let i = 0; i < maxPositions && positions.length < count; i++) {
      const x = startX + offset + i * spacing;
      tryAddPosition(x, y);
    }
  } else {
    const x = room.centerX;
    const startY = room.y + padding;
    const maxPositions = Math.floor(innerHeight / spacing) + 1;
    // Center the column
    const offset = Math.floor((innerHeight - (maxPositions - 1) * spacing) / 2);

    for (let i = 0; i < maxPositions && positions.length < count; i++) {
      const y = startY + offset + i * spacing;
      tryAddPosition(x, y);
    }
  }

  return positions;
}

/**
 * Diagonal pattern - POIs placed diagonally
 */
function getDiagonalPattern(
  room: Room,
  dungeon: DungeonStateArtifact,
  count: number,
  padding: number,
  spacing: number,
  minSpacing: number,
  existing: readonly Point[],
): Point[] {
  const positions: Point[] = [];
  const innerWidth = room.width - 2 * padding;
  const innerHeight = room.height - 2 * padding;

  const tryAddPosition = (x: number, y: number): boolean => {
    if (positions.length >= count) return false;
    if (
      dungeon.grid.isInBounds(x, y) &&
      dungeon.grid.get(x, y) === CellType.FLOOR &&
      !hasNearbyPosition(existing, x, y, minSpacing) &&
      !hasNearbyPosition(positions, x, y, minSpacing)
    ) {
      positions.push({ x, y });
      return true;
    }
    return false;
  };

  // Diagonal from top-left to bottom-right
  const diagonalLength = Math.min(innerWidth, innerHeight);
  const maxPositions = Math.floor(diagonalLength / spacing) + 1;

  const startX = room.x + padding;
  const startY = room.y + padding;

  for (let i = 0; i < maxPositions && positions.length < count; i++) {
    const x = startX + i * spacing;
    const y = startY + i * spacing;
    tryAddPosition(x, y);
  }

  // If we need more, add anti-diagonal (top-right to bottom-left)
  if (positions.length < count) {
    const antiStartX = room.x + room.width - 1 - padding;
    for (let i = 0; i < maxPositions && positions.length < count; i++) {
      const x = antiStartX - i * spacing;
      const y = startY + i * spacing;
      tryAddPosition(x, y);
    }
  }

  return positions;
}

/**
 * Get scattered (random) positions
 */
function getScatteredPositions(
  room: Room,
  dungeon: DungeonStateArtifact,
  count: number,
  padding: number,
  minSpacing: number,
  existing: readonly Point[],
  rng: { next(): number },
): Point[] {
  const positions: Point[] = [];
  const maxRetries = 20;

  const minX = room.x + padding;
  const minY = room.y + padding;
  const maxX = room.x + room.width - padding - 1;
  const maxY = room.y + room.height - padding - 1;

  if (maxX < minX || maxY < minY) {
    return positions;
  }

  for (let i = 0; i < count; i++) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      // Use Math.min to guard against rng.next() returning exactly 1.0
      const rangeX = maxX - minX + 1;
      const rangeY = maxY - minY + 1;
      const x = minX + Math.min(Math.floor(rng.next() * rangeX), rangeX - 1);
      const y = minY + Math.min(Math.floor(rng.next() * rangeY), rangeY - 1);

      if (
        dungeon.grid.isInBounds(x, y) &&
        dungeon.grid.get(x, y) === CellType.FLOOR &&
        !hasNearbyPosition(existing, x, y, minSpacing) &&
        !hasNearbyPosition(positions, x, y, minSpacing)
      ) {
        positions.push({ x, y });
        break;
      }
    }
  }

  return positions;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Check if there's a position nearby within distance
 */
function hasNearbyPosition(
  positions: readonly Point[],
  x: number,
  y: number,
  minDist: number,
): boolean {
  for (const pos of positions) {
    const dist = Math.abs(pos.x - x) + Math.abs(pos.y - y);
    if (dist < minDist) {
      return true;
    }
  }
  return false;
}

// calculateRoomDistances and calculateConnectionCounts imported from ../connectivity/graph-algorithms
