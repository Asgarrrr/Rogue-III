/**
 * Hot Reload System
 *
 * Enables runtime replacement of systems without losing game state.
 * Useful for development iteration on game logic.
 */

import type { World } from "../core/world";
import type { System } from "../core/system";
import { SystemPhase } from "../types";

/**
 * System module definition for hot reloading.
 */
export interface SystemModule {
  /** System instance to be registered */
  readonly system: System;
  /** Optional version for tracking updates */
  readonly version?: string;
}

/**
 * Callback for system reload events.
 */
export type ReloadCallback = (
  systemName: string,
  oldSystem: System | undefined,
  newSystem: System,
) => void;

/**
 * Hot Reload Manager for systems.
 *
 * Allows replacing systems at runtime while preserving entity/component state.
 * The world state remains intact, only the system logic is swapped.
 */
export class HotReloadManager {
  private readonly callbacks = new Set<ReloadCallback>();
  private readonly moduleVersions = new Map<string, string>();
  private enabled = true;

  constructor(private readonly world: World) {}

  /**
   * Registers a callback for reload events.
   */
  onReload(callback: ReloadCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  /**
   * Reloads a system by replacing it with a new implementation.
   *
   * @param name - The system name to replace
   * @param newSystem - The new system implementation
   * @returns true if replacement succeeded
   */
  reloadSystem(name: string, newSystem: System): boolean {
    if (!this.enabled) {
      console.warn(`[HotReload] Hot reload is disabled`);
      return false;
    }

    const scheduler = this.world.systems;
    const oldSystem = scheduler.getSystem(name);

    if (!oldSystem) {
      console.warn(
        `[HotReload] System "${name}" not found, registering as new`,
      );
      scheduler.register(newSystem);
      this.notifyReload(name, undefined, newSystem);
      return true;
    }

    // Replace the system
    const success = scheduler.replaceSystem(name, newSystem);

    if (success) {
      this.notifyReload(name, oldSystem, newSystem);
      console.log(`[HotReload] System "${name}" reloaded successfully`);
    } else {
      console.error(`[HotReload] Failed to replace system "${name}"`);
    }

    return success;
  }

  /**
   * Reloads multiple systems at once.
   */
  reloadSystems(systems: readonly SystemModule[]): void {
    for (const mod of systems) {
      this.reloadSystem(mod.system.name, mod.system);

      if (mod.version) {
        this.moduleVersions.set(mod.system.name, mod.version);
      }
    }

    // Recompile execution order after all replacements
    this.world.systems.compile();
  }

  /**
   * Checks if a system module has a newer version available.
   */
  hasNewerVersion(name: string, version: string): boolean {
    const current = this.moduleVersions.get(name);
    return current !== version;
  }

  /**
   * Enables hot reload functionality.
   */
  enable(): void {
    this.enabled = true;
    console.log("[HotReload] Enabled");
  }

  /**
   * Disables hot reload functionality.
   */
  disable(): void {
    this.enabled = false;
    console.log("[HotReload] Disabled");
  }

  /**
   * Returns whether hot reload is enabled.
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  private notifyReload(
    systemName: string,
    oldSystem: System | undefined,
    newSystem: System,
  ): void {
    for (const callback of this.callbacks) {
      try {
        callback(systemName, oldSystem, newSystem);
      } catch (error) {
        console.error(`[HotReload] Error in reload callback:`, error);
      }
    }
  }
}

/**
 * File watcher configuration for development hot reload.
 */
export interface WatchConfig {
  /** Directories to watch */
  readonly paths: readonly string[];
  /** File extensions to watch */
  readonly extensions?: readonly string[];
  /** Debounce delay in milliseconds */
  readonly debounce?: number;
  /** Custom file-to-system mapper */
  readonly mapper?: (filepath: string) => string | undefined;
}

/**
 * Development file watcher for automatic system reloading.
 * Uses Bun's file watcher API.
 */
export class SystemFileWatcher {
  private watcher: ReturnType<typeof Bun.file> | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly pendingReloads = new Set<string>();

  constructor(
    private readonly hotReload: HotReloadManager,
    private readonly config: WatchConfig,
  ) {}

  /**
   * Starts watching for file changes.
   */
  async start(): Promise<void> {
    const { paths, extensions = [".ts", ".js"], debounce = 100 } = this.config;

    console.log(`[SystemFileWatcher] Watching ${paths.join(", ")}`);

    // Use Bun's watch functionality
    const glob = new Bun.Glob(`**/*{${extensions.join(",")}}`);

    for (const path of paths) {
      const watchPath = path;

      // Note: In real implementation, you'd use fs.watch or chokidar
      // This is a simplified example showing the pattern
      console.log(`[SystemFileWatcher] Would watch: ${watchPath}`);
    }
  }

  /**
   * Handles a file change event.
   */
  async handleFileChange(filepath: string): Promise<void> {
    const { debounce = 100 } = this.config;

    // Determine which system this file maps to
    const systemName =
      this.config.mapper?.(filepath) ?? this.defaultMapper(filepath);

    if (!systemName) {
      console.log(`[SystemFileWatcher] Ignoring: ${filepath}`);
      return;
    }

    this.pendingReloads.add(systemName);

    // Debounce multiple rapid changes
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    this.debounceTimer = setTimeout(async () => {
      await this.processPendingReloads();
    }, debounce);
  }

  /**
   * Stops watching for file changes.
   */
  stop(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }

    this.pendingReloads.clear();
    console.log("[SystemFileWatcher] Stopped");
  }

  private async processPendingReloads(): Promise<void> {
    const systems = [...this.pendingReloads];
    this.pendingReloads.clear();

    for (const systemName of systems) {
      try {
        console.log(`[SystemFileWatcher] Reloading: ${systemName}`);
        // In real implementation, you'd dynamically import the module
        // const module = await import(`./systems/${systemName}.ts?t=${Date.now()}`);
        // this.hotReload.reloadSystem( systemName, module.default );
      } catch (error) {
        console.error(
          `[SystemFileWatcher] Failed to reload ${systemName}:`,
          error,
        );
      }
    }
  }

  private defaultMapper(filepath: string): string | undefined {
    // Extract system name from filepath
    const match = filepath.match(/(\w+)(?:System)?\.(?:ts|js)$/);
    return match ? match[1] : undefined;
  }
}

/**
 * Creates a hot reload manager for the world.
 */
export function createHotReloadManager(world: World): HotReloadManager {
  const manager = new HotReloadManager(world);
  world.resources.register("hotReload", manager);
  return manager;
}
