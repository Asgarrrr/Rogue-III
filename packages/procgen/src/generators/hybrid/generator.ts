/**
 * Hybrid Dungeon Generator
 *
 * Combines BSP and Cellular automata for varied dungeon layouts.
 * Divides the dungeon into zones and applies different algorithms per zone.
 */

import { PipelineBuilder } from "../../pipeline/builder";
import type {
  DungeonArtifact,
  DungeonStateArtifact,
  EmptyArtifact,
  GenerationConfig,
  Generator,
  PassContext,
  Pipeline,
  ValidationArtifact,
  Violation,
} from "../../pipeline/types";
import { DEFAULT_BSP_CONFIG, DEFAULT_CELLULAR_CONFIG } from "../../pipeline/types";
import type { HybridConfig, ZoneDefinition, ZoneSplitResult } from "./types";
import { DEFAULT_HYBRID_CONFIG } from "./types";
import { splitIntoZones } from "./zone-splitter";

// BSP passes for constructed zones
import {
  buildConnectivity,
  calculateSpawns,
  carveCorridors,
  carveRooms,
  finalizeDungeon,
  initializeState,
  partitionBSP,
  placeRooms,
  assignRoomTypes,
} from "../bsp/passes";

/**
 * Extended artifact for hybrid generation carrying zone info
 */
interface HybridStateArtifact extends DungeonStateArtifact {
  readonly zones?: readonly ZoneDefinition[];
  readonly zoneSplitResult?: ZoneSplitResult;
}

/**
 * Hybrid Generator combining BSP and Cellular algorithms
 */
export class HybridGenerator implements Generator {
  readonly id = "hybrid";
  readonly name = "Hybrid (BSP + Cellular)";
  readonly description =
    "Generates varied dungeons by combining rectangular rooms (BSP) with organic caves (Cellular)";

  private config: HybridConfig = DEFAULT_HYBRID_CONFIG;

  constructor(config?: Partial<HybridConfig>) {
    if (config) {
      this.config = { ...DEFAULT_HYBRID_CONFIG, ...config };
    }
  }

  getDefaultConfig(): Partial<GenerationConfig> {
    return {
      algorithm: "bsp", // Fallback algorithm
      bsp: DEFAULT_BSP_CONFIG,
      cellular: DEFAULT_CELLULAR_CONFIG,
    };
  }

  validateConfig(config: GenerationConfig): ValidationArtifact {
    const violations: Violation[] = [];

    // Validate dimensions
    if (config.width < 40) {
      violations.push({
        type: "config.width",
        message: "Hybrid generator requires width >= 40 for zone splitting",
        severity: "error",
      });
    }

    if (config.height < 40) {
      violations.push({
        type: "config.height",
        message: "Hybrid generator requires height >= 40 for zone splitting",
        severity: "error",
      });
    }

    // Validate zone configuration
    const zoneSplit = this.config.zoneSplit;
    if (zoneSplit.minZones < 2) {
      violations.push({
        type: "config.zoneSplit.minZones",
        message: "Minimum 2 zones required for hybrid generation",
        severity: "error",
      });
    }

    if (zoneSplit.maxZones < zoneSplit.minZones) {
      violations.push({
        type: "config.zoneSplit.maxZones",
        message: "Maximum zones must be >= minimum zones",
        severity: "error",
      });
    }

    return {
      type: "validation",
      id: "hybrid-config-validation",
      violations,
      passed: violations.every((v) => v.severity !== "error"),
    };
  }

  createPipeline(config: GenerationConfig): Pipeline<EmptyArtifact, DungeonArtifact> {
    // For now, use BSP pipeline as base with zone awareness
    // In future iterations, this will dynamically compose BSP and Cellular passes per zone
    const hybridConfig = this.config;

    const pipeline = PipelineBuilder.create<EmptyArtifact>(
      "hybrid-pipeline",
      config,
    )
      .pipe(initializeState())
      .pipe({
        id: "hybrid-zone-split",
        inputType: "dungeon-state" as const,
        outputType: "dungeon-state" as const,
        run: (artifact: DungeonStateArtifact, ctx: PassContext): HybridStateArtifact => {
          const { rng } = ctx;
          const { width, height } = artifact;

          // Split into zones
          const zoneSplitResult = splitIntoZones(
            width,
            height,
            hybridConfig.zoneSplit,
            rng,
          );

          return {
            ...artifact,
            zones: zoneSplitResult.zones,
            zoneSplitResult,
          };
        },
      })
      .pipe(partitionBSP())
      .pipe(placeRooms())
      .pipe(buildConnectivity())
      .pipe(assignRoomTypes())
      .pipe(carveRooms())
      .pipe(carveCorridors())
      .pipe(calculateSpawns())
      .pipe(finalizeDungeon())
      .build();

    return pipeline;
  }

  /**
   * Get the current hybrid configuration
   */
  getHybridConfig(): HybridConfig {
    return this.config;
  }

  /**
   * Update the hybrid configuration
   */
  setHybridConfig(config: Partial<HybridConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Create a hybrid generator with custom configuration
 */
export function createHybridGenerator(config?: Partial<HybridConfig>): HybridGenerator {
  return new HybridGenerator(config);
}

/**
 * Default hybrid generator instance
 */
export const hybridGenerator = new HybridGenerator();
