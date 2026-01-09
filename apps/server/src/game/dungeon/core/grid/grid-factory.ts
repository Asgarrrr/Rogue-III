import {
  DungeonError,
  Err,
  MAX_DUNGEON_CELLS,
  Ok,
  type Result,
} from "@rogue/contracts";
import { Grid } from "./grid";
import { CellType, type GridDimensions } from "./types";

/**
 * Factory for creating Grid instances with safe memory allocation.
 * Handles OOM errors gracefully by returning Result types.
 */
export const GridFactory = {
  /**
   * Create a new Grid with safe memory allocation.
   * Returns an error if memory allocation fails.
   */
  create(
    dimensions: GridDimensions,
    initialValue: CellType = CellType.WALL,
  ): Result<Grid, DungeonError> {
    const { width, height } = dimensions;
    const totalCells = width * height;
    const MAX_CELLS = MAX_DUNGEON_CELLS;

    // Pre-allocation guards to avoid crashing before we can surface a DungeonError
    if (
      !Number.isFinite(width) ||
      !Number.isFinite(height) ||
      width <= 0 ||
      height <= 0
    ) {
      return Err(
        DungeonError.configInvalid("Invalid grid dimensions", {
          width,
          height,
        }),
      );
    }

    if (
      !Number.isSafeInteger(totalCells) ||
      totalCells <= 0 ||
      totalCells > MAX_CELLS
    ) {
      return Err(
        DungeonError.memoryExhausted(
          "Grid size exceeds safe allocation threshold",
          {
            width,
            height,
            totalCells,
            maxCells: MAX_CELLS,
            estimatedBytes: totalCells,
          },
        ),
      );
    }

    try {
      const grid = new Grid(dimensions, initialValue);
      return Ok(grid);
    } catch (error) {
      if (error instanceof RangeError) {
        return Err(
          DungeonError.memoryExhausted(
            "Failed to allocate memory for dungeon grid",
            {
              width: dimensions.width,
              height: dimensions.height,
              totalCells: dimensions.width * dimensions.height,
              error: error.message,
            },
          ),
        );
      }

      if (error instanceof Error && error.message.includes("memory")) {
        return Err(
          DungeonError.memoryExhausted(
            "Insufficient memory for dungeon grid allocation",
            {
              width: dimensions.width,
              height: dimensions.height,
              totalCells: dimensions.width * dimensions.height,
              error: error.message,
            },
          ),
        );
      }

      throw error;
    }
  },

  /**
   * Create a Grid from a 2D boolean array with safe allocation.
   */
  fromBooleanGrid(boolGrid: boolean[][]): Result<Grid, DungeonError> {
    const height = boolGrid.length;
    const width = height > 0 ? boolGrid[0].length : 0;
    const totalCells = width * height;
    const MAX_CELLS = MAX_DUNGEON_CELLS;

    if (
      !Number.isSafeInteger(totalCells) ||
      totalCells <= 0 ||
      totalCells > MAX_CELLS
    ) {
      return Err(
        DungeonError.memoryExhausted(
          "Grid size exceeds safe allocation threshold",
          {
            width,
            height,
            totalCells,
            maxCells: MAX_CELLS,
            estimatedBytes: totalCells,
          },
        ),
      );
    }

    try {
      const grid = Grid.fromBooleanGrid(boolGrid);
      return Ok(grid);
    } catch (error) {
      if (
        error instanceof RangeError ||
        (error instanceof Error && error.message.includes("memory"))
      ) {
        return Err(
          DungeonError.memoryExhausted(
            "Failed to allocate memory for grid conversion",
            {
              width,
              height,
              totalCells: width * height,
              error: error instanceof Error ? error.message : "Unknown error",
            },
          ),
        );
      }
      throw error;
    }
  },
} as const;

export type GridFactoryType = typeof GridFactory;
