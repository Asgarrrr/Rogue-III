/**
 * Hybrid Dungeon Generator
 *
 * Combines BSP and Cellular automata for varied dungeon layouts.
 * Divides the dungeon into zones and applies different algorithms per zone.
 */

// Common passes
import {
  createInitializeStatePass,
  createPlaceEntranceExitPass,
  finalizeDungeon,
} from "../../passes/common";
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
import {
  DEFAULT_BSP_CONFIG,
  DEFAULT_CELLULAR_CONFIG,
} from "../../pipeline/types";
// Hybrid-specific passes
import { connectZones, mergeZones, processZones } from "./passes";
import type {
  HybridConfig,
  HybridConfigPatch,
  HybridStateArtifact,
} from "./types";
import { DEFAULT_HYBRID_CONFIG } from "./types";
import { splitIntoZones } from "./zone-splitter";

/**
 * Merge hybrid config with deep merge for zoneSplit.
 */
function mergeHybridConfig(
  base: Readonly<HybridConfig>,
  patch?: HybridConfigPatch,
): Readonly<HybridConfig> {
  const mergedZoneSplit = Object.freeze({
    ...base.zoneSplit,
    ...(patch?.zoneSplit ?? {}),
  });

  return Object.freeze({
    ...base,
    ...(patch ?? {}),
    zoneSplit: mergedZoneSplit,
  });
}

/**
 * Hybrid Generator combining BSP and Cellular algorithms
 */
export class HybridGenerator implements Generator {
  readonly id = "hybrid";
  readonly name = "Hybrid (BSP + Cellular)";
  readonly description =
    "Generates varied dungeons by combining rectangular rooms (BSP) with organic caves (Cellular)";

  private readonly config: Readonly<HybridConfig>;

  constructor(
    config?: HybridConfigPatch,
    baseConfig: Readonly<HybridConfig> = DEFAULT_HYBRID_CONFIG,
  ) {
    this.config = mergeHybridConfig(baseConfig, config);
  }

  getDefaultConfig(): Partial<GenerationConfig> {
    return {
      algorithm: "hybrid",
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
      success: violations.every((v) => v.severity !== "error"),
    };
  }

  createPipeline(
    config: GenerationConfig,
  ): Pipeline<EmptyArtifact, DungeonArtifact> {
    // Hybrid pipeline: splits into zones, processes each with its algorithm, then merges
    const hybridConfig = this.config;

    const pipeline = PipelineBuilder.create<EmptyArtifact>(
      "hybrid-pipeline",
      config,
    )
      .pipe(createInitializeStatePass("hybrid"))
      .pipe({
        id: "hybrid-zone-split",
        inputType: "dungeon-state" as const,
        outputType: "dungeon-state" as const,
        requiredStreams: ["layout"] as const,
        run: (
          artifact: DungeonStateArtifact,
          ctx: PassContext<"layout">,
        ): HybridStateArtifact => {
          const rng = ctx.streams.layout;
          const { width, height } = artifact;

          // Split into zones with algorithm assignments
          const zoneSplitResult = splitIntoZones(
            width,
            height,
            hybridConfig.zoneSplit,
            rng,
          );

          return {
            ...artifact,
            zones: zoneSplitResult.zones,
            transitions: zoneSplitResult.transitions,
          };
        },
      })
      .pipe(processZones()) // Process each zone with BSP or Cellular
      .pipe(mergeZones()) // Merge zone grids into main grid
      .pipe(connectZones()) // Connect zones with transitions
      .pipe(createPlaceEntranceExitPass("hybrid"))
      .pipe(finalizeDungeon("hybrid"))
      .build();

    return pipeline;
  }

  /**
   * Get the current hybrid configuration
   */
  getHybridConfig(): Readonly<HybridConfig> {
    return this.config;
  }

  /**
   * Return a new generator with merged hybrid configuration.
   */
  withHybridConfig(config: HybridConfigPatch): HybridGenerator {
    return new HybridGenerator(config, this.config);
  }
}

/**
 * Create a hybrid generator with custom configuration
 */
export function createHybridGenerator(
  config?: HybridConfigPatch,
): HybridGenerator {
  return new HybridGenerator(config);
}
