import type { DungeonConfig, DungeonSeed } from "../core/types";
import { BSPGenerator } from "./algorithms/bsp";
import { CellularGenerator } from "./algorithms/cellular";
import type { DungeonGenerator } from "./base/dungeon-generator";

/**
 * Plugin metadata for generator identification and versioning
 */
export interface GeneratorPluginMetadata {
  /** Unique identifier for the generator */
  readonly name: string;
  /** Semantic version string */
  readonly version: string;
  /** Optional author information */
  readonly author?: string;
  /** Brief description of the generator */
  readonly description?: string;
}

/**
 * Validation result for config checking
 */
export interface ValidationResult {
  readonly valid: boolean;
  readonly errors?: string[];
}

/**
 * Generator plugin interface for extensible dungeon generation
 */
export interface GeneratorPlugin {
  /** Plugin identification and version info */
  readonly metadata: GeneratorPluginMetadata;

  /**
   * Validate configuration before generation
   * @param config - The dungeon configuration to validate
   * @returns Validation result with any errors
   */
  validate?(config: DungeonConfig): ValidationResult;

  /**
   * Create a generator instance
   * @param config - Dungeon configuration
   * @param seeds - Generation seeds for determinism
   * @returns A DungeonGenerator instance
   */
  create(config: DungeonConfig, seeds: DungeonSeed): DungeonGenerator;
}

/**
 * Legacy factory type for backward compatibility
 */
export type GeneratorFactory = (
  config: DungeonConfig,
  seeds: DungeonSeed,
) => DungeonGenerator;

/**
 * Generator Plugin Registry
 * Manages registration and creation of dungeon generators
 */
class GeneratorRegistry {
  private plugins: Map<string, GeneratorPlugin> = new Map();
  private defaultAlgorithm = "cellular";

  constructor() {
    // Register built-in generators
    this.registerBuiltins();
  }

  private registerBuiltins(): void {
    this.register({
      metadata: {
        name: "cellular",
        version: "1.0.0",
        description:
          "Cellular automaton-based cave generator with room placement",
      },
      create: (config, seeds) => new CellularGenerator(config, seeds),
    });

    this.register({
      metadata: {
        name: "bsp",
        version: "1.0.0",
        description:
          "Binary Space Partitioning generator for structured dungeons",
      },
      create: (config, seeds) => new BSPGenerator(config, seeds),
    });
  }

  /**
   * Register a generator plugin
   * @param plugin - The plugin to register
   * @throws Error if a plugin with the same name already exists
   */
  register(plugin: GeneratorPlugin): void {
    const key = plugin.metadata.name.toLowerCase();
    if (this.plugins.has(key)) {
      throw new Error(`Generator plugin '${key}' is already registered`);
    }
    this.plugins.set(key, plugin);
  }

  /**
   * Unregister a generator plugin
   * @param name - The name of the plugin to unregister
   * @returns true if the plugin was found and removed
   */
  unregister(name: string): boolean {
    return this.plugins.delete(name.toLowerCase());
  }

  /**
   * Get a registered plugin by name
   * @param name - The plugin name
   * @returns The plugin or undefined if not found
   */
  get(name: string): GeneratorPlugin | undefined {
    return this.plugins.get(name.toLowerCase());
  }

  /**
   * Check if a plugin is registered
   * @param name - The plugin name to check
   */
  has(name: string): boolean {
    return this.plugins.has(name.toLowerCase());
  }

  /**
   * Get all registered plugin names
   */
  list(): string[] {
    return Array.from(this.plugins.keys());
  }

  /**
   * Get metadata for all registered plugins
   */
  listPlugins(): GeneratorPluginMetadata[] {
    return Array.from(this.plugins.values()).map((p) => p.metadata);
  }

  /**
   * Set the default algorithm used when none is specified
   * @param name - The algorithm name
   */
  setDefault(name: string): void {
    if (!this.has(name)) {
      throw new Error(`Cannot set default to unregistered generator '${name}'`);
    }
    this.defaultAlgorithm = name.toLowerCase();
  }

  /**
   * Create a generator from the registry
   * @param config - Dungeon configuration
   * @param seeds - Generation seeds
   * @returns A DungeonGenerator instance
   */
  create(config: DungeonConfig, seeds: DungeonSeed): DungeonGenerator {
    const key = String(config.algorithm || this.defaultAlgorithm).toLowerCase();
    const plugin =
      this.plugins.get(key) ?? this.plugins.get(this.defaultAlgorithm);

    if (!plugin) {
      throw new Error(`No generator found for algorithm '${key}'`);
    }

    // Run validation if available
    if (plugin.validate) {
      const validation = plugin.validate(config);
      if (!validation.valid) {
        throw new Error(
          `Invalid configuration for '${key}': ${validation.errors?.join(", ") ?? "Unknown error"}`,
        );
      }
    }

    return plugin.create(config, seeds);
  }
}

// Global registry instance
const registry = new GeneratorRegistry();

/**
 * Register a custom generator plugin
 * @example
 * ```typescript
 * registerGeneratorPlugin({
 *   metadata: { name: "maze", version: "1.0.0" },
 *   create: (config, seeds) => new MazeGenerator(config, seeds),
 * });
 * ```
 */
export function registerGeneratorPlugin(plugin: GeneratorPlugin): void {
  registry.register(plugin);
}

/**
 * Unregister a generator plugin
 */
export function unregisterGeneratorPlugin(name: string): boolean {
  return registry.unregister(name);
}

/**
 * List all registered generator plugins
 */
export function listGeneratorPlugins(): GeneratorPluginMetadata[] {
  return registry.listPlugins();
}

/**
 * Check if a generator plugin is available
 */
export function hasGeneratorPlugin(name: string): boolean {
  return registry.has(name);
}

/**
 * Create a generator from the registry (internal use)
 */
export function createGeneratorFromRegistry(
  config: DungeonConfig,
  seeds: DungeonSeed,
): DungeonGenerator {
  return registry.create(config, seeds);
}

// Export the registry for advanced usage
export { registry as generatorRegistry };
