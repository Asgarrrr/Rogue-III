/**
 * Modular cellular automaton dungeon generator
 *
 * This package provides a high-performance, extensible cellular automaton
 * generator with the following optimizations:
 *
 * - Grid operations using Uint8Array for better cache locality
 * - Union-Find for O(α(n)) connected component analysis
 * - Spatial hashing for O(1) average collision detection
 * - Scanline flood fill for efficient region detection
 * - Object pooling to reduce garbage collection pressure
 * - A* pathfinding with multiple heuristics and path smoothing
 */

export * from "./cellular-generator";
export * from "./automaton-rules";
export * from "./cavern-analyzer";
export * from "./room-placer";
export * from "./path-finder";

// Re-export main generator and default config for convenience
export {
  CellularGenerator,
  DEFAULT_CELLULAR_CONFIG,
  type CellularGeneratorConfig,
} from "./cellular-generator";


