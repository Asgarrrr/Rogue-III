/**
 * Cellular Automata Dungeon Generator
 *
 * Generates cave-like dungeons using cellular automata.
 * Uses the composable pass system with PipelineBuilder.
 */

import { finalizeDungeon } from "../../passes/common";
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
import { DEFAULT_CELLULAR_CONFIG } from "../../pipeline/types";
import {
  applyCellularRules,
  connectRegions,
  initializeRandom,
  keepLargestRegion,
  placeEntranceExit,
} from "./passes";

/**
 * Cellular Automata Generator implementation using composable passes
 */
export class CellularGenerator implements Generator {
  readonly id = "cellular";
  readonly name = "Cellular Automata";
  readonly description =
    "Generates cave-like dungeons using cellular automata for natural-looking caverns";

  getDefaultConfig(): Partial<GenerationConfig> {
    return {
      algorithm: "cellular",
      cellular: DEFAULT_CELLULAR_CONFIG,
    };
  }

  validateConfig(config: GenerationConfig): ValidationArtifact {
    const violations: Violation[] = [];

    // Validate dimensions
    if (config.width < 30) {
      violations.push({
        type: "config.width",
        message:
          "Width must be at least 30 for cellular automata (recommended: 80+)",
        severity: "error",
      });
    }

    if (config.height < 30) {
      violations.push({
        type: "config.height",
        message:
          "Height must be at least 30 for cellular automata (recommended: 60+)",
        severity: "error",
      });
    }

    // Validate cellular config
    const cellular = config.cellular ?? DEFAULT_CELLULAR_CONFIG;

    if (cellular.initialFillRatio < 0.3 || cellular.initialFillRatio > 0.7) {
      violations.push({
        type: "config.cellular.initialFillRatio",
        message:
          "initialFillRatio should be between 0.3 and 0.7 for good cave generation",
        severity: "warning",
      });
    }

    if (cellular.birthLimit < 1 || cellular.birthLimit > 8) {
      violations.push({
        type: "config.cellular.birthLimit",
        message: "birthLimit must be between 1 and 8",
        severity: "error",
      });
    }

    if (cellular.deathLimit < 1 || cellular.deathLimit > 8) {
      violations.push({
        type: "config.cellular.deathLimit",
        message: "deathLimit must be between 1 and 8",
        severity: "error",
      });
    }

    if (cellular.iterations < 1) {
      violations.push({
        type: "config.cellular.iterations",
        message: "iterations must be at least 1",
        severity: "error",
      });
    }

    if (cellular.iterations > 10) {
      violations.push({
        type: "config.cellular.iterations",
        message: "iterations > 10 may cause over-smoothing",
        severity: "warning",
      });
    }

    if (cellular.minRegionSize < 10) {
      violations.push({
        type: "config.cellular.minRegionSize",
        message: "minRegionSize should be at least 10 for playable areas",
        severity: "warning",
      });
    }

    // Check if dimensions are too small for meaningful caves
    const totalCells = config.width * config.height;
    const expectedFloor = totalCells * cellular.initialFillRatio;

    if (expectedFloor < cellular.minRegionSize * 2) {
      violations.push({
        type: "config.dimensions",
        message: `Dimensions (${config.width}x${config.height}) may be too small for minRegionSize ${cellular.minRegionSize}`,
        severity: "warning",
      });
    }

    return {
      type: "validation",
      id: "config-validation",
      violations,
      success: violations.every((v) => v.severity !== "error"),
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
      "cellular-pipeline",
      config,
    )
      .pipe(initializeRandom())
      .pipe(applyCellularRules())
      .pipe(keepLargestRegion())
      .pipe(connectRegions())
      .pipe(placeEntranceExit())
      .pipe(finalizeDungeon("cellular"))
      .build();

    return pipeline;
  }
}

/**
 * Create Cellular generator instance
 */
export function createCellularGenerator(): Generator {
  return new CellularGenerator();
}
