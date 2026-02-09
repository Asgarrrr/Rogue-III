/**
 * Zone Splitter
 *
 * Divides the dungeon grid into distinct zones for hybrid generation.
 * Each zone can use a different generation algorithm.
 */

import type { SeededRandom } from "@rogue/contracts";
import type {
  GenerationAlgorithm,
  ZoneBounds,
  ZoneDefinition,
  ZoneSplitConfig,
  ZoneSplitResult,
  ZoneTransition,
  ZoneType,
} from "./types";
import { DEFAULT_ZONE_SPLIT_CONFIG } from "./types";

/**
 * Split the grid into zones for hybrid generation
 */
export function splitIntoZones(
  width: number,
  height: number,
  config: ZoneSplitConfig = DEFAULT_ZONE_SPLIT_CONFIG,
  rng: SeededRandom,
): ZoneSplitResult {
  const zones: ZoneDefinition[] = [];
  const transitions: ZoneTransition[] = [];

  // Determine number of zones
  const numZones =
    config.minZones +
    Math.floor(rng.next() * (config.maxZones - config.minZones + 1));

  // Determine split direction based on aspect ratio
  let splitDirection = config.splitDirection;
  if (splitDirection === "auto") {
    splitDirection = width >= height ? "vertical" : "horizontal";
  }

  // Create initial zone covering entire area
  const rootBounds: ZoneBounds = {
    x: 0,
    y: 0,
    width,
    height,
  };

  // Split recursively
  const splitZones = recursiveSplit(
    rootBounds,
    numZones,
    splitDirection,
    config,
    rng,
    0,
  );

  // Assign zone types and algorithms
  const naturalCount = Math.round(splitZones.length * config.naturalRatio);
  const shuffledIndices = shuffleArray(
    Array.from({ length: splitZones.length }, (_, i) => i),
    rng,
  );

  for (let i = 0; i < splitZones.length; i++) {
    const bounds = splitZones[i]!;
    const isNatural = shuffledIndices.indexOf(i) < naturalCount;

    const zoneType: ZoneType = isNatural ? "natural" : "constructed";
    const algorithm: GenerationAlgorithm = isNatural ? "cellular" : "bsp";

    // Calculate depth range based on position
    const centerX = bounds.x + bounds.width / 2;
    const centerY = bounds.y + bounds.height / 2;
    const normalizedDepth = (centerX + centerY) / (width + height);

    zones.push({
      id: `zone_${i}`,
      type: zoneType,
      bounds,
      algorithm,
      depthRange: {
        min: Math.max(0, normalizedDepth - 0.2),
        max: Math.min(1, normalizedDepth + 0.2),
      },
    });
  }

  // Create transitions between adjacent zones
  for (let i = 0; i < zones.length; i++) {
    for (let j = i + 1; j < zones.length; j++) {
      const transition = createTransition(
        zones[i]!,
        zones[j]!,
        config.transitionWidth,
        rng,
      );
      if (transition) {
        transitions.push(transition);
      }
    }
  }

  return { zones, transitions };
}

/**
 * Recursively split a bounds into smaller zones
 */
function recursiveSplit(
  bounds: ZoneBounds,
  targetCount: number,
  direction: "horizontal" | "vertical",
  config: ZoneSplitConfig,
  rng: SeededRandom,
  depth: number,
): ZoneBounds[] {
  // Base case: only one zone needed or bounds too small
  if (targetCount <= 1) {
    return [bounds];
  }

  const canSplitHorizontal = bounds.height >= config.minZoneSize * 2;
  const canSplitVertical = bounds.width >= config.minZoneSize * 2;

  if (!canSplitHorizontal && !canSplitVertical) {
    return [bounds];
  }

  // Determine actual split direction
  let actualDirection = direction;
  if (direction === "horizontal" && !canSplitHorizontal) {
    actualDirection = "vertical";
  } else if (direction === "vertical" && !canSplitVertical) {
    actualDirection = "horizontal";
  }

  // Calculate split position with some randomness
  const variance = 0.3; // Allow 30% variance from center
  const baseRatio = 0.5 + (rng.next() - 0.5) * variance;

  // Calculate bounds based on split direction
  const [leftBounds, rightBounds]: [ZoneBounds, ZoneBounds] =
    actualDirection === "horizontal"
      ? (() => {
          const splitY = Math.floor(bounds.y + bounds.height * baseRatio);
          const topHeight = splitY - bounds.y;
          const bottomHeight = bounds.height - topHeight;
          return [
            {
              x: bounds.x,
              y: bounds.y,
              width: bounds.width,
              height: topHeight,
            },
            {
              x: bounds.x,
              y: splitY,
              width: bounds.width,
              height: bottomHeight,
            },
          ];
        })()
      : (() => {
          const splitX = Math.floor(bounds.x + bounds.width * baseRatio);
          const leftWidth = splitX - bounds.x;
          const rightWidth = bounds.width - leftWidth;
          return [
            {
              x: bounds.x,
              y: bounds.y,
              width: leftWidth,
              height: bounds.height,
            },
            {
              x: splitX,
              y: bounds.y,
              width: rightWidth,
              height: bounds.height,
            },
          ];
        })();

  // Distribute remaining zones between left and right
  const leftCount = Math.ceil(targetCount / 2);
  const rightCount = targetCount - leftCount;

  // Alternate direction for children
  const nextDirection =
    actualDirection === "horizontal" ? "vertical" : "horizontal";

  // Recursively split both halves
  const leftZones = recursiveSplit(
    leftBounds,
    leftCount,
    nextDirection,
    config,
    rng,
    depth + 1,
  );
  const rightZones = recursiveSplit(
    rightBounds,
    rightCount,
    nextDirection,
    config,
    rng,
    depth + 1,
  );

  return [...leftZones, ...rightZones];
}

/**
 * Create a transition between two adjacent zones
 */
function createTransition(
  zoneA: ZoneDefinition,
  zoneB: ZoneDefinition,
  width: number,
  rng: SeededRandom,
): ZoneTransition | null {
  const boundsA = zoneA.bounds;
  const boundsB = zoneB.bounds;

  // Check if zones are adjacent horizontally
  if (
    boundsA.x + boundsA.width === boundsB.x ||
    boundsB.x + boundsB.width === boundsA.x
  ) {
    // Vertical adjacency - find overlap in Y
    const overlapStart = Math.max(boundsA.y, boundsB.y);
    const overlapEnd = Math.min(
      boundsA.y + boundsA.height,
      boundsB.y + boundsB.height,
    );

    if (overlapEnd - overlapStart >= width) {
      const y =
        overlapStart +
        Math.floor(rng.next() * (overlapEnd - overlapStart - width));

      const isALeft = boundsA.x + boundsA.width === boundsB.x;
      const fromX = isALeft ? boundsA.x + boundsA.width - 1 : boundsA.x;
      const toX = isALeft ? boundsB.x : boundsB.x + boundsB.width - 1;

      return {
        fromZoneId: zoneA.id,
        toZoneId: zoneB.id,
        fromPoint: { x: fromX, y: y + Math.floor(width / 2) },
        toPoint: { x: toX, y: y + Math.floor(width / 2) },
        width,
      };
    }
  }

  // Check if zones are adjacent vertically
  if (
    boundsA.y + boundsA.height === boundsB.y ||
    boundsB.y + boundsB.height === boundsA.y
  ) {
    // Horizontal adjacency - find overlap in X
    const overlapStart = Math.max(boundsA.x, boundsB.x);
    const overlapEnd = Math.min(
      boundsA.x + boundsA.width,
      boundsB.x + boundsB.width,
    );

    if (overlapEnd - overlapStart >= width) {
      const x =
        overlapStart +
        Math.floor(rng.next() * (overlapEnd - overlapStart - width));

      const isATop = boundsA.y + boundsA.height === boundsB.y;
      const fromY = isATop ? boundsA.y + boundsA.height - 1 : boundsA.y;
      const toY = isATop ? boundsB.y : boundsB.y + boundsB.height - 1;

      return {
        fromZoneId: zoneA.id,
        toZoneId: zoneB.id,
        fromPoint: { x: x + Math.floor(width / 2), y: fromY },
        toPoint: { x: x + Math.floor(width / 2), y: toY },
        width,
      };
    }
  }

  return null;
}

/**
 * Shuffle array using Fisher-Yates
 */
function shuffleArray<T>(array: T[], rng: SeededRandom): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    const temp = result[i]!;
    result[i] = result[j]!;
    result[j] = temp;
  }
  return result;
}

/**
 * Get algorithm for a zone type
 */
export function getAlgorithmForZoneType(
  type: ZoneType,
  rng: SeededRandom,
): GenerationAlgorithm {
  switch (type) {
    case "natural":
      return "cellular";
    case "constructed":
      return "bsp";
    case "mixed":
      return rng.next() > 0.5 ? "bsp" : "cellular";
  }
}

/**
 * Check if a point is within zone bounds
 */
export function isPointInZone(
  x: number,
  y: number,
  zone: ZoneDefinition,
): boolean {
  return (
    x >= zone.bounds.x &&
    x < zone.bounds.x + zone.bounds.width &&
    y >= zone.bounds.y &&
    y < zone.bounds.y + zone.bounds.height
  );
}

/**
 * Find zone containing a point
 */
export function findZoneAtPoint(
  x: number,
  y: number,
  zones: readonly ZoneDefinition[],
): ZoneDefinition | undefined {
  return zones.find((zone) => isPointInZone(x, y, zone));
}
