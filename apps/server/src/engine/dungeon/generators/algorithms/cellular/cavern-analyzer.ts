import {
  CellType,
  FloodFill,
  type Grid,
  type Point,
  type Region,
  UnionFind,
} from "../../../core/grid";

export interface CavernLabels {
  labels: Uint32Array;
  width: number;
  height: number;
}

/**
 * Configuration for cavern analysis
 */
export interface CavernAnalysisConfig {
  readonly minCavernSize: number;
  readonly maxCavernSize: number;
  readonly connectivityMode: "4" | "8";
}

/**
 * Default configuration for cavern analysis
 */
export const DEFAULT_CAVERN_CONFIG: CavernAnalysisConfig = {
  minCavernSize: 20,
  maxCavernSize: 10000,
  connectivityMode: "8",
};

/**
 * Analyzes cellular automaton grids to identify and classify cavern systems.
 * Uses Union-Find for efficient connected component analysis.
 */
export class CavernAnalyzer {
  private readonly config: CavernAnalysisConfig;

  constructor(config: CavernAnalysisConfig = DEFAULT_CAVERN_CONFIG) {
    this.config = config;
  }

  /**
   * Find all caverns in the grid using optimized flood fill
   */
  findCaverns(grid: Grid): Region[] {
    const diagonal = this.config.connectivityMode === "8";
    return FloodFill.findRegions(
      grid,
      CellType.FLOOR,
      this.config.minCavernSize,
      diagonal,
    );
  }

  /**
   * Find caverns using Union-Find for maximum performance
   * and return both regions and a label map (0 = wall/unused, >0 = regionId+1)
   */
  findCavernsUnionFind(grid: Grid): Region[] {
    return this.findCavernsUnionFindWithLabels(grid).regions;
  }

  findCavernsUnionFindWithLabels(grid: Grid): {
    regions: Region[];
    labels: Uint32Array;
  } {
    const width = grid.width;
    const height = grid.height;
    const uf = new UnionFind(width * height);
    const data = grid.getRawData();
    const floor = CellType.FLOOR;

    // Connect adjacent floor cells using raw data to avoid repeated bounds checks
    for (let y = 0; y < height; y++) {
      const rowOff = y * width;
      const nextRowOff = rowOff + width;
      for (let x = 0; x < width; x++) {
        const idx = rowOff + x;
        if (data[idx] !== floor) continue;

        // Right neighbor
        if (x + 1 < width && data[idx + 1] === floor) {
          uf.union(idx, idx + 1);
        }

        // Bottom neighbor (row below)
        if (y + 1 < height && data[nextRowOff + x] === floor) {
          uf.union(idx, nextRowOff + x);
        }

        // Diagonal neighbors for 8-connectivity
        if (this.config.connectivityMode === "8" && y + 1 < height) {
          if (x + 1 < width && data[nextRowOff + x + 1] === floor) {
            uf.union(idx, nextRowOff + x + 1);
          }
          if (x > 0 && data[nextRowOff + x - 1] === floor) {
            uf.union(idx, nextRowOff + x - 1);
          }
        }
      }
    }

    // Group cells by component
    const components = new Map<number, number[]>();
    const labels = new Uint32Array(width * height);

    for (let y = 0; y < height; y++) {
      const rowOff = y * width;
      for (let x = 0; x < width; x++) {
        const idx = rowOff + x;
        if (data[idx] !== floor) continue;

        const root = uf.find(idx);

        if (!components.has(root)) {
          components.set(root, []);
        }
        components.get(root)?.push(idx);
      }
    }

    // Convert to regions
    const regions: Region[] = [];
    let regionId = 0;

    for (const indices of components.values()) {
      const size = indices.length;
      if (
        size < this.config.minCavernSize ||
        size > this.config.maxCavernSize
      ) {
        continue;
      }

      // Convert back to points while calculating bounds
      let minX = width,
        maxX = 0,
        minY = height,
        maxY = 0;
      const points: Point[] = [];
      const labelValue = regionId + 1; // reserve 0 for non-floor

      for (let i = 0; i < size; i++) {
        const idx = indices[i];
        const y = Math.floor(idx / width);
        const x = idx - y * width;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        points.push({ x, y });
        labels[idx] = labelValue;
      }

      regions.push({
        id: regionId++,
        points,
        bounds: { minX, minY, maxX, maxY },
        size,
      });
    }

    return {
      regions: regions.sort((a, b) => b.size - a.size), // Sort by size, largest first
      labels,
    };
  }

  /**
   * Classify caverns by their characteristics
   */
  classifyCaverns(caverns: Region[]): {
    large: Region[];
    medium: Region[];
    small: Region[];
    elongated: Region[];
    compact: Region[];
  } {
    const large: Region[] = [];
    const medium: Region[] = [];
    const small: Region[] = [];
    const elongated: Region[] = [];
    const compact: Region[] = [];

    // Size thresholds based on typical dungeon room requirements:
    // - Large (>500 cells): Can fit multiple rooms, ideal for main chambers
    // - Medium (100-500 cells): Good for single rooms with features
    // - Small (<100 cells): May be too cramped for gameplay
    // Aspect ratio threshold (2.5): Corridors vs chambers - higher = more corridor-like
    const SIZE_THRESHOLD_LARGE = 500;
    const SIZE_THRESHOLD_MEDIUM = 100;
    const ASPECT_RATIO_ELONGATED = 2.5;

    for (const cavern of caverns) {
      // Size classification
      if (cavern.size > SIZE_THRESHOLD_LARGE) {
        large.push(cavern);
      } else if (cavern.size > SIZE_THRESHOLD_MEDIUM) {
        medium.push(cavern);
      } else {
        small.push(cavern);
      }

      // Shape classification
      const aspectRatio = this.calculateAspectRatio(cavern);
      if (aspectRatio > ASPECT_RATIO_ELONGATED) {
        elongated.push(cavern);
      } else {
        compact.push(cavern);
      }
    }

    return { large, medium, small, elongated, compact };
  }

  /**
   * Calculate aspect ratio of a cavern
   */
  private calculateAspectRatio(cavern: Region): number {
    const width = cavern.bounds.maxX - cavern.bounds.minX + 1;
    const height = cavern.bounds.maxY - cavern.bounds.minY + 1;
    return Math.max(width, height) / Math.min(width, height);
  }

  /**
   * Find the main cavern (largest connected floor area)
   */
  findMainCavern(grid: Grid): Region | null {
    const caverns = this.findCavernsUnionFind(grid);
    return caverns.length > 0 ? caverns[0] : null;
  }

  /**
   * Calculate cavern density (ratio of floor to total area in bounds)
   */
  calculateCavernDensity(cavern: Region): number {
    const boundsArea =
      (cavern.bounds.maxX - cavern.bounds.minX + 1) *
      (cavern.bounds.maxY - cavern.bounds.minY + 1);
    return cavern.size / boundsArea;
  }

  /**
   * Find caverns suitable for room placement
   */
  findRoomSuitableCaverns(caverns: Region[], minRoomSize: number): Region[] {
    return caverns.filter((cavern) => {
      const width = cavern.bounds.maxX - cavern.bounds.minX + 1;
      const height = cavern.bounds.maxY - cavern.bounds.minY + 1;

      // Must be large enough for minimum room size plus padding
      const minRequiredSize = (minRoomSize + 2) * (minRoomSize + 2);

      // For very small caverns, be more lenient with spacing requirements
      const minSpacing = Math.min(
        4,
        Math.max(2, Math.floor(Math.min(width, height) * 0.2)),
      );

      return (
        cavern.size >= minRequiredSize &&
        width >= minRoomSize + minSpacing &&
        height >= minRoomSize + minSpacing
      );
    });
  }

  /**
   * Analyze cavern connectivity patterns
   */
  analyzeCavernConnectivity(
    caverns: Region[],
    grid: Grid,
  ): {
    isolatedCaverns: Region[];
    connectedGroups: Region[][];
    mainNetwork: Region[];
  } {
    const isolatedCaverns: Region[] = [];
    const connectedGroups: Region[][] = [];
    const connectionGraph = this.buildCavernConnectionGraph(caverns, grid);

    // Find connected components in the cavern graph
    const visited = new Set<number>();

    for (const cavern of caverns) {
      if (visited.has(cavern.id)) continue;

      const group = this.findConnectedCavernGroup(
        cavern.id,
        connectionGraph,
        visited,
      );

      if (group.length === 1) {
        const single = caverns.find((c) => c.id === group[0]);
        if (single) isolatedCaverns.push(single);
      } else {
        const cavernGroup: Region[] = [];
        for (const id of group) {
          const found = caverns.find((c) => c.id === id);
          if (found) cavernGroup.push(found);
        }
        connectedGroups.push(cavernGroup);
      }
    }

    // Find the largest connected group as the main network
    const mainNetwork =
      connectedGroups.length > 0
        ? connectedGroups.reduce((largest, current) =>
            current.length > largest.length ? current : largest,
          )
        : [];

    return { isolatedCaverns, connectedGroups, mainNetwork };
  }

  /**
   * Build a graph of cavern connections
   */
  private buildCavernConnectionGraph(
    caverns: Region[],
    grid: Grid,
  ): Map<number, number[]> {
    const graph = new Map<number, number[]>();

    // Initialize graph
    for (const cavern of caverns) {
      graph.set(cavern.id, []);
    }

    // Check connections between all pairs of caverns
    for (let i = 0; i < caverns.length; i++) {
      for (let j = i + 1; j < caverns.length; j++) {
        if (this.areCavernsConnected(caverns[i], caverns[j], grid)) {
          const a = graph.get(caverns[i].id);
          const b = graph.get(caverns[j].id);
          if (a) a.push(caverns[j].id);
          if (b) b.push(caverns[i].id);
        }
      }
    }

    return graph;
  }

  /**
   * Check if two caverns are connected by floor tiles
   */
  private areCavernsConnected(
    cavern1: Region,
    cavern2: Region,
    grid: Grid,
  ): boolean {
    // Simple heuristic: check if there's a floor path between closest points
    const point1 = this.findClosestPoint(cavern1, cavern2);
    const point2 = this.findClosestPoint(cavern2, cavern1);

    return FloodFill.areConnected(grid, point1, point2, CellType.FLOOR, false);
  }

  /**
   * Find the closest point in cavern1 to cavern2
   */
  private findClosestPoint(
    cavern1: Region,
    cavern2: Region,
  ): { x: number; y: number } {
    let closestPoint = cavern1.points[0];
    let minDistance = Infinity;

    const center2 = {
      x: (cavern2.bounds.minX + cavern2.bounds.maxX) / 2,
      y: (cavern2.bounds.minY + cavern2.bounds.maxY) / 2,
    };

    for (const point of cavern1.points) {
      const distance = (point.x - center2.x) ** 2 + (point.y - center2.y) ** 2;

      if (distance < minDistance) {
        minDistance = distance;
        closestPoint = point;
      }
    }

    return closestPoint;
  }

  /**
   * Find connected cavern group using DFS
   */
  private findConnectedCavernGroup(
    startId: number,
    graph: Map<number, number[]>,
    visited: Set<number>,
  ): number[] {
    const group: number[] = [];
    const stack = [startId];

    while (stack.length > 0) {
      const currentId = stack.pop();
      if (currentId === undefined) continue;

      if (visited.has(currentId)) continue;

      visited.add(currentId);
      group.push(currentId);

      const neighbors = graph.get(currentId) || [];
      for (const neighborId of neighbors) {
        if (!visited.has(neighborId)) {
          stack.push(neighborId);
        }
      }
    }

    return group;
  }

  /**
   * Generate statistics about the cavern system
   */
  generateCavernStatistics(caverns: Region[]): {
    totalCaverns: number;
    totalFloorArea: number;
    averageCavernSize: number;
    largestCavernSize: number;
    smallestCavernSize: number;
    averageAspectRatio: number;
  } {
    if (caverns.length === 0) {
      return {
        totalCaverns: 0,
        totalFloorArea: 0,
        averageCavernSize: 0,
        largestCavernSize: 0,
        smallestCavernSize: 0,
        averageAspectRatio: 0,
      };
    }

    const totalFloorArea = caverns.reduce(
      (sum, cavern) => sum + cavern.size,
      0,
    );
    const sizes = caverns.map((c) => c.size);
    const aspectRatios = caverns.map((c) => this.calculateAspectRatio(c));

    return {
      totalCaverns: caverns.length,
      totalFloorArea,
      averageCavernSize: totalFloorArea / caverns.length,
      largestCavernSize: Math.max(...sizes),
      smallestCavernSize: Math.min(...sizes),
      averageAspectRatio:
        aspectRatios.reduce((sum, ratio) => sum + ratio, 0) /
        aspectRatios.length,
    };
  }
}
