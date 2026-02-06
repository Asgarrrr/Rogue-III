/**
 * BSP Dungeon Generator
 *
 * Generates dungeons using Binary Space Partitioning.
 * Now uses the composable pass system with PipelineBuilder.
 */

import { PipelineBuilder } from "../../pipeline/builder";
import type {
  DungeonArtifact,
  EmptyArtifact,
  GenerationConfig,
  Generator,
  Pipeline,
  ValidationArtifact,
  Violation,
} from "../../pipeline/types";
import { DEFAULT_BSP_CONFIG } from "../../pipeline/types";
import {
  assignRoomTypes,
  buildConnectivity,
  calculateSpawns,
  carveCorridors,
  carveRooms,
  finalizeDungeon,
  initializeState,
  partitionBSP,
  placeRooms,
} from "./passes";

/**
 * BSP Generator implementation using composable passes
 */
export class BSPGenerator implements Generator {
  readonly id = "bsp";
  readonly name = "Binary Space Partitioning";
  readonly description =
    "Generates dungeons using recursive space partitioning for non-overlapping rooms";

  getDefaultConfig(): Partial<GenerationConfig> {
    return {
      algorithm: "bsp",
      bsp: DEFAULT_BSP_CONFIG,
    };
  }

  validateConfig(config: GenerationConfig): ValidationArtifact {
    const violations: Violation[] = [];

    // Validate dimensions
    if (config.width < 20) {
      violations.push({
        type: "config.width",
        message: "Width must be at least 20 (recommended: 60+)",
        severity: "error",
      });
    }

    if (config.height < 20) {
      violations.push({
        type: "config.height",
        message: "Height must be at least 20 (recommended: 40+)",
        severity: "error",
      });
    }

    // Validate BSP config
    const bsp = config.bsp ?? DEFAULT_BSP_CONFIG;

    if (bsp.minRoomSize > bsp.maxRoomSize) {
      violations.push({
        type: "config.bsp.roomSize",
        message: "minRoomSize cannot be greater than maxRoomSize",
        severity: "error",
      });
    }

    if (bsp.minRoomSize < 3) {
      violations.push({
        type: "config.bsp.minRoomSize",
        message: "minRoomSize should be at least 3 for meaningful rooms",
        severity: "warning",
      });
    }

    if (bsp.splitRatioMin < 0.2 || bsp.splitRatioMax > 0.8) {
      violations.push({
        type: "config.bsp.splitRatio",
        message:
          "Split ratio should be between 0.2 and 0.8 for balanced partitions",
        severity: "warning",
      });
    }

    if (bsp.corridorWidth < 1) {
      violations.push({
        type: "config.bsp.corridorWidth",
        message: "Corridor width must be at least 1",
        severity: "error",
      });
    }

    // Check if dimensions are too small for the room size
    const minLeafSize = bsp.minRoomSize * 2 + bsp.roomPadding * 2;
    if (config.width < minLeafSize || config.height < minLeafSize) {
      violations.push({
        type: "config.dimensions",
        message: `Dimensions (${config.width}x${config.height}) may be too small for room size ${bsp.minRoomSize} with padding ${bsp.roomPadding}`,
        severity: "warning",
      });
    }

    return {
      type: "validation",
      id: "config-validation",
      violations,
      passed: violations.every((v) => v.severity !== "error"),
    };
  }

  /**
   * Creates a pipeline using the composable pass system
   */
  createPipeline(
    config: GenerationConfig,
  ): Pipeline<EmptyArtifact, DungeonArtifact> {
    // Build pipeline using PipelineBuilder with all passes
    const pipeline = PipelineBuilder.create<EmptyArtifact>(
      "bsp-pipeline",
      config,
    )
      .pipe(initializeState())
      .pipe(partitionBSP())
      .pipe(placeRooms())
      .pipe(buildConnectivity())
      .pipe(assignRoomTypes()) // Assign semantic types after connectivity is built
      .pipe(carveRooms())
      .pipe(carveCorridors())
      .pipe(calculateSpawns())
      .pipe(finalizeDungeon())
      .build();

    return pipeline;
  }
}

/**
 * Create BSP generator instance
 */
export function createBSPGenerator(): Generator {
  return new BSPGenerator();
}
