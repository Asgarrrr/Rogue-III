/**
 * Resource Registry
 *
 * Shared state accessible to all systems.
 * Resources are singletons that don't belong to any specific entity.
 */

/**
 * Resource Registry for managing shared resources.
 */
export class ResourceRegistry {
  private readonly resources = new Map<string, unknown>();

  /**
   * Registers a new resource.
   */
  register<T>(name: string, resource: T): void {
    if (this.resources.has(name)) {
      throw new Error(`Resource "${name}" already registered`);
    }
    this.resources.set(name, resource);
  }

  /**
   * Sets a resource (overwrites if exists).
   */
  set<T>(name: string, resource: T): void {
    this.resources.set(name, resource);
  }

  /**
   * Gets a resource by name.
   */
  get<T>(name: string): T {
    const resource = this.resources.get(name);
    if (resource === undefined) {
      throw new Error(`Resource "${name}" not found`);
    }
    return resource as T;
  }

  /**
   * Gets a resource or returns a default value.
   */
  getOr<T>(name: string, defaultValue: T): T {
    const resource = this.resources.get(name);
    return (resource !== undefined ? resource : defaultValue) as T;
  }

  /**
   * Gets a resource or undefined if not found.
   */
  tryGet<T>(name: string): T | undefined {
    return this.resources.get(name) as T | undefined;
  }

  /**
   * Checks if a resource exists.
   */
  has(name: string): boolean {
    return this.resources.has(name);
  }

  /**
   * Removes a resource.
   */
  remove(name: string): boolean {
    return this.resources.delete(name);
  }

  /**
   * Clears all resources.
   */
  clear(): void {
    this.resources.clear();
  }

  /**
   * Returns all resource names.
   */
  getAllNames(): string[] {
    return Array.from(this.resources.keys());
  }
}

/**
 * Typed Resource Registry for compile-time type checking.
 * Usage: Define a Resources interface and use this registry.
 *
 * @example
 * interface GameResources {
 *   grid: Grid;
 *   rng: SeededRandom;
 *   currentTick: number;
 * }
 *
 * const resources = new TypedResourceRegistry<GameResources>();
 * resources.register( "grid", new Grid(...) );
 * const grid = resources.get( "grid" ); // Type: Grid
 */
export class TypedResourceRegistry<TResources extends Record<string, unknown>> {
  private readonly registry = new ResourceRegistry();

  register<K extends keyof TResources>(name: K, resource: TResources[K]): void {
    this.registry.register(name as string, resource);
  }

  set<K extends keyof TResources>(name: K, resource: TResources[K]): void {
    this.registry.set(name as string, resource);
  }

  get<K extends keyof TResources>(name: K): TResources[K] {
    return this.registry.get(name as string);
  }

  getOr<K extends keyof TResources>(
    name: K,
    defaultValue: TResources[K],
  ): TResources[K] {
    return this.registry.getOr(name as string, defaultValue);
  }

  tryGet<K extends keyof TResources>(name: K): TResources[K] | undefined {
    return this.registry.tryGet(name as string);
  }

  has(name: keyof TResources): boolean {
    return this.registry.has(name as string);
  }

  remove(name: keyof TResources): boolean {
    return this.registry.remove(name as string);
  }

  clear(): void {
    this.registry.clear();
  }
}
