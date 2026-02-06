/**
 * Hybrid Generator Types
 *
 * Types for the hybrid BSP + Cellular generator.
 */

import type { Grid } from "../../core/grid";
import type { DungeonStateArtifact, Room } from "../../pipeline/types";

/**
 * Zone type determines the generation algorithm
 */
export type ZoneType = "constructed" | "natural" | "mixed";

/**
 * Algorithm to use for generation
 */
export type GenerationAlgorithm = "bsp" | "cellular";

/**
 * Zone definition for hybrid generation
 */
export interface ZoneDefinition {
  /** Unique zone identifier */
  readonly id: string;

  /** Zone type (affects algorithm selection) */
  readonly type: ZoneType;

  /** Physical bounds */
  readonly bounds: ZoneBounds;

  /** Algorithm to use */
  readonly algorithm: GenerationAlgorithm;

  /** Optional theme for the zone */
  readonly theme?: string;

  /** Room count constraints */
  readonly minRooms?: number;
  readonly maxRooms?: number;

  /** Depth range (0-1) for progression */
  readonly depthRange?: { min: number; max: number };
}

/**
 * Zone bounds
 */
export interface ZoneBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * Configuration for zone splitting
 */
export interface ZoneSplitConfig {
  /** Minimum number of zones to create */
  readonly minZones: number;

  /** Maximum number of zones to create */
  readonly maxZones: number;

  /** Ratio of natural (cellular) zones (0-1) */
  readonly naturalRatio: number;

  /** Width of transition corridors between zones */
  readonly transitionWidth: number;

  /** Minimum zone size (width or height) */
  readonly minZoneSize: number;

  /** Whether to split horizontally or vertically (or auto) */
  readonly splitDirection: "horizontal" | "vertical" | "auto";
}

/**
 * Default zone split configuration
 */
export const DEFAULT_ZONE_SPLIT_CONFIG: Readonly<ZoneSplitConfig> =
  Object.freeze({
    minZones: 2,
    maxZones: 4,
    naturalRatio: 0.3,
    transitionWidth: 3,
    minZoneSize: 20,
    splitDirection: "auto",
  });

/**
 * Hybrid generator configuration
 */
export interface HybridConfig {
  /** Zone splitting configuration */
  readonly zoneSplit: ZoneSplitConfig;

  /** Whether to use signature prefabs */
  readonly useSignaturePrefabs: boolean;

  /** Prefab usage probability (0-1) */
  readonly prefabChance: number;

  /** Whether zones should have different themes */
  readonly enableZoneTheming: boolean;
}

/**
 * Partial config patch with deep partial support for zoneSplit.
 */
export type HybridConfigPatch = Partial<Omit<HybridConfig, "zoneSplit">> & {
  readonly zoneSplit?: Partial<ZoneSplitConfig>;
};

/**
 * Default hybrid configuration
 */
export const DEFAULT_HYBRID_CONFIG: Readonly<HybridConfig> = Object.freeze({
  zoneSplit: DEFAULT_ZONE_SPLIT_CONFIG,
  useSignaturePrefabs: true,
  prefabChance: 0.7,
  enableZoneTheming: true,
});

/**
 * Zone transition (connection between zones)
 */
export interface ZoneTransition {
  /** Source zone ID */
  readonly fromZoneId: string;

  /** Target zone ID */
  readonly toZoneId: string;

  /** Connection point in source zone */
  readonly fromPoint: { x: number; y: number };

  /** Connection point in target zone */
  readonly toPoint: { x: number; y: number };

  /** Width of the transition corridor */
  readonly width: number;
}

/**
 * Result of zone splitting
 */
export interface ZoneSplitResult {
  /** Generated zones */
  readonly zones: readonly ZoneDefinition[];

  /** Transitions between zones */
  readonly transitions: readonly ZoneTransition[];
}

/**
 * Extended artifact for hybrid generation carrying zone info
 */
export interface HybridStateArtifact extends DungeonStateArtifact {
  readonly zones?: readonly ZoneDefinition[];
  readonly transitions?: readonly ZoneTransition[];
  readonly zoneGrids?: Map<string, Grid>;
  readonly zoneRooms?: Map<string, Room[]>;
}
