/**
 * Room density profiles for different dungeon sizes.
 * Defines room count ranges and branching complexity.
 */

export interface DensityProfile {
  minRooms: number;
  maxRooms: number;
  minBranches: number;
  maxBranches: number;
  hubCount: number;
  optionalBranchRatio: number;
  description: string;
}

export type DensityLevel = "small" | "medium" | "large" | "epic";

export const DENSITY_PROFILES: Record<DensityLevel, DensityProfile> = {
  small: {
    minRooms: 8,
    maxRooms: 12,
    minBranches: 2,
    maxBranches: 3,
    hubCount: 1,
    optionalBranchRatio: 0.3,
    description: "Compact dungeon with focused exploration",
  },

  medium: {
    minRooms: 15,
    maxRooms: 25,
    minBranches: 3,
    maxBranches: 5,
    hubCount: 2,
    optionalBranchRatio: 0.4,
    description: "Balanced dungeon with moderate complexity",
  },

  large: {
    minRooms: 30,
    maxRooms: 50,
    minBranches: 5,
    maxBranches: 8,
    hubCount: 3,
    optionalBranchRatio: 0.5,
    description: "Expansive dungeon with many paths",
  },

  epic: {
    minRooms: 50,
    maxRooms: 100,
    minBranches: 8,
    maxBranches: 15,
    hubCount: 5,
    optionalBranchRatio: 0.6,
    description: "Massive dungeon with complex interconnections",
  },
};

/**
 * Get a density profile by level.
 */
export function getDensityProfile(level: DensityLevel): DensityProfile {
  return DENSITY_PROFILES[level];
}

/**
 * Calculate recommended room count for a density level.
 */
export function getRecommendedRoomCount(
  level: DensityLevel,
  variance: number = 0.5, // 0.0 = min, 1.0 = max
): number {
  const profile = DENSITY_PROFILES[level];
  const range = profile.maxRooms - profile.minRooms;
  return Math.floor(profile.minRooms + range * variance);
}

/**
 * Select appropriate density level based on desired room count.
 */
export function selectDensityLevel(targetRooms: number): DensityLevel {
  if (targetRooms <= DENSITY_PROFILES.small.maxRooms) {
    return "small";
  } else if (targetRooms <= DENSITY_PROFILES.medium.maxRooms) {
    return "medium";
  } else if (targetRooms <= DENSITY_PROFILES.large.maxRooms) {
    return "large";
  } else {
    return "epic";
  }
}

/**
 * Validate that a room count is within acceptable range for a density level.
 */
export function validateRoomCount(
  roomCount: number,
  level: DensityLevel,
): { valid: boolean; error?: string } {
  const profile = DENSITY_PROFILES[level];

  if (roomCount < profile.minRooms) {
    return {
      valid: false,
      error: `Room count ${roomCount} below minimum ${profile.minRooms} for ${level} density`,
    };
  }

  if (roomCount > profile.maxRooms) {
    return {
      valid: false,
      error: `Room count ${roomCount} exceeds maximum ${profile.maxRooms} for ${level} density`,
    };
  }

  return { valid: true };
}

/**
 * Get topology configuration from density profile.
 */
export function getTopologyFromDensity(level: DensityLevel): TopologyConfig {
  const profile = DENSITY_PROFILES[level];
  return {
    minBranches: profile.minBranches,
    maxBranches: profile.maxBranches,
    hubCount: profile.hubCount,
    allowLoops: level !== "small",
    optionalBranchRatio: profile.optionalBranchRatio,
  };
}

/**
 * Topology configuration for graph generation.
 */
export interface TopologyConfig {
  minBranches: number;
  maxBranches: number;
  hubCount: number;
  allowLoops: boolean;
  optionalBranchRatio: number;
}

/**
 * Default topology for medium dungeons.
 */
export const DEFAULT_TOPOLOGY_CONFIG: TopologyConfig = {
  minBranches: 2,
  maxBranches: 5,
  hubCount: 2,
  allowLoops: true,
  optionalBranchRatio: 0.4,
};
