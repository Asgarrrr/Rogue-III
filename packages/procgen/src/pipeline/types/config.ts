/**
 * Pipeline Configuration Types
 *
 * Configuration interfaces and defaults for generation algorithms.
 */

import type { DungeonSeed } from "@rogue/contracts";

// =============================================================================
// ALGORITHM CONFIGURATION
// =============================================================================

/**
 * BSP algorithm configuration
 */
export interface BSPConfig {
  readonly minRoomSize: number;
  readonly maxRoomSize: number;
  readonly splitRatioMin: number;
  readonly splitRatioMax: number;
  readonly roomPadding: number;
  readonly corridorWidth: number;
  /** Corridor routing strategy */
  readonly corridorStyle?: "l-shaped" | "bresenham" | "astar";
  readonly maxDepth?: number;
  /** Probability of placing a room in each BSP leaf (0.0-1.0, default 1.0) */
  readonly roomPlacementChance?: number;
}

/**
 * Cellular automata configuration
 */
export interface CellularConfig {
  readonly initialFillRatio: number;
  readonly birthLimit: number;
  readonly deathLimit: number;
  readonly iterations: number;
  readonly minRegionSize: number;
  /** Connect all floor regions instead of keeping only the largest (default false) */
  readonly connectAllRegions?: boolean;
}

/**
 * Generation configuration.
 * Optional fields have defaults applied during validation.
 */
export interface GenerationConfig {
  readonly width: number;
  readonly height: number;
  readonly seed: DungeonSeed;
  readonly algorithm?: "bsp" | "cellular" | "hybrid";
  readonly trace?: boolean;
  readonly snapshots?: boolean;
  readonly bsp?: BSPConfig;
  readonly cellular?: CellularConfig;
}

/**
 * Validated BSP configuration (all optionals resolved)
 */
export interface ValidatedBSPConfig {
  readonly minRoomSize: number;
  readonly maxRoomSize: number;
  readonly splitRatioMin: number;
  readonly splitRatioMax: number;
  readonly roomPadding: number;
  readonly corridorWidth: number;
  readonly corridorStyle: "l-shaped" | "bresenham" | "astar";
  readonly maxDepth: number;
  readonly roomPlacementChance: number;
}

/**
 * Validated Cellular configuration (all optionals resolved)
 */
export interface ValidatedCellularConfig {
  readonly initialFillRatio: number;
  readonly birthLimit: number;
  readonly deathLimit: number;
  readonly iterations: number;
  readonly minRegionSize: number;
  readonly connectAllRegions: boolean;
}

/**
 * Validated generation configuration.
 * All optional fields have been resolved to concrete values.
 * Use `validateConfig()` to convert GenerationConfig to ValidatedConfig.
 */
export interface ValidatedConfig {
  readonly width: number;
  readonly height: number;
  readonly seed: DungeonSeed;
  readonly algorithm: "bsp" | "cellular" | "hybrid";
  readonly trace: boolean;
  readonly snapshots: boolean;
  readonly bsp: ValidatedBSPConfig;
  readonly cellular: ValidatedCellularConfig;
}

/**
 * Validate and fill defaults for generation configuration.
 * Converts partial GenerationConfig to fully-populated ValidatedConfig.
 */
export function validateConfig(config: GenerationConfig): ValidatedConfig {
  // Merge BSP config with defaults (validated has all required fields)
  const bsp: ValidatedBSPConfig = {
    minRoomSize: config.bsp?.minRoomSize ?? DEFAULT_BSP_CONFIG.minRoomSize,
    maxRoomSize: config.bsp?.maxRoomSize ?? DEFAULT_BSP_CONFIG.maxRoomSize,
    splitRatioMin:
      config.bsp?.splitRatioMin ?? DEFAULT_BSP_CONFIG.splitRatioMin,
    splitRatioMax:
      config.bsp?.splitRatioMax ?? DEFAULT_BSP_CONFIG.splitRatioMax,
    roomPadding: config.bsp?.roomPadding ?? DEFAULT_BSP_CONFIG.roomPadding,
    corridorWidth:
      config.bsp?.corridorWidth ?? DEFAULT_BSP_CONFIG.corridorWidth,
    corridorStyle:
      config.bsp?.corridorStyle ?? DEFAULT_BSP_CONFIG.corridorStyle,
    maxDepth: config.bsp?.maxDepth ?? DEFAULT_BSP_CONFIG.maxDepth,
    roomPlacementChance:
      config.bsp?.roomPlacementChance ?? DEFAULT_BSP_CONFIG.roomPlacementChance,
  };

  // Merge Cellular config with defaults
  const cellular: ValidatedCellularConfig = {
    initialFillRatio:
      config.cellular?.initialFillRatio ??
      DEFAULT_CELLULAR_CONFIG.initialFillRatio,
    birthLimit:
      config.cellular?.birthLimit ?? DEFAULT_CELLULAR_CONFIG.birthLimit,
    deathLimit:
      config.cellular?.deathLimit ?? DEFAULT_CELLULAR_CONFIG.deathLimit,
    iterations:
      config.cellular?.iterations ?? DEFAULT_CELLULAR_CONFIG.iterations,
    minRegionSize:
      config.cellular?.minRegionSize ?? DEFAULT_CELLULAR_CONFIG.minRegionSize,
    connectAllRegions:
      config.cellular?.connectAllRegions ??
      DEFAULT_CELLULAR_CONFIG.connectAllRegions,
  };

  return {
    width: config.width,
    height: config.height,
    seed: config.seed,
    algorithm: config.algorithm ?? "bsp",
    trace: config.trace ?? false,
    snapshots: config.snapshots ?? false,
    bsp,
    cellular,
  };
}

// =============================================================================
// DEFAULTS
// =============================================================================

/**
 * Default BSP configuration (fully validated)
 *
 * maxDepth: 5 creates larger BSP leaves (15-20 tiles) that can fit signature rooms.
 * For 80x50 dungeons, this produces ~10-15 rooms with good variety.
 * Use maxDepth: 6-8 for more numerous smaller rooms.
 */
export const DEFAULT_BSP_CONFIG: ValidatedBSPConfig = Object.freeze({
  minRoomSize: 6,
  maxRoomSize: 18,
  splitRatioMin: 0.4,
  splitRatioMax: 0.6,
  roomPadding: 1,
  corridorWidth: 1,
  corridorStyle: "l-shaped",
  maxDepth: 5,
  roomPlacementChance: 1.0,
});

/**
 * Default cellular configuration (fully validated)
 */
export const DEFAULT_CELLULAR_CONFIG: ValidatedCellularConfig = Object.freeze({
  initialFillRatio: 0.45,
  birthLimit: 5,
  deathLimit: 4,
  iterations: 4,
  minRegionSize: 50,
  connectAllRegions: false,
});

// =============================================================================
// QUALITY THRESHOLDS
// =============================================================================

/**
 * Quality thresholds for detecting degenerate outputs.
 */
export interface QualityThresholds {
  /** Minimum number of rooms (default: 3) */
  readonly minRooms: number;
  /** Maximum number of rooms (default: 100) */
  readonly maxRooms: number;
  /** Minimum floor ratio (default: 0.15) */
  readonly minFloorRatio: number;
  /** Maximum floor ratio (default: 0.6) */
  readonly maxFloorRatio: number;
  /** Minimum average room size in tiles (default: 16) */
  readonly minAvgRoomSize: number;
  /** Maximum dead-end ratio (default: 0.5) */
  readonly maxDeadEndRatio: number;
  /** Minimum shortest path length between entrance and exit (default: 12) */
  readonly minEntranceExitPathLength: number;
  /**
   * Maximum shortest path ratio relative to floor cell count (default: 0.9).
   * Helps catch overly long/snaking layouts.
   */
  readonly maxEntranceExitPathFloorRatio: number;
  /** Minimum connectivity (all rooms reachable) */
  readonly requireFullConnectivity: boolean;
}

/**
 * Default quality thresholds
 */
export const DEFAULT_QUALITY_THRESHOLDS: Readonly<QualityThresholds> =
  Object.freeze({
    minRooms: 3,
    maxRooms: 100,
    minFloorRatio: 0.15,
    maxFloorRatio: 0.6,
    minAvgRoomSize: 16,
    maxDeadEndRatio: 0.5,
    minEntranceExitPathLength: 12,
    maxEntranceExitPathFloorRatio: 0.9,
    requireFullConnectivity: true,
  });

/**
 * Quality assessment result
 */
export interface QualityAssessment {
  /** Whether all checks passed */
  readonly success: boolean;
  /** Individual check results */
  readonly checks: readonly QualityCheck[];
  /** Overall quality score (0-100) */
  readonly score: number;
}

/**
 * Individual quality check result
 */
export interface QualityCheck {
  readonly name: string;
  readonly success: boolean;
  readonly value: number;
  readonly threshold: number;
  readonly message: string;
}
