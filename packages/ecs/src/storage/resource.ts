export type ResourceClass<T = unknown> = new (...args: unknown[]) => T;

interface TypedResourceEntry {
  value: unknown;
}

/** Registry for global resources. Supports both string keys and type-based access. */
export class ResourceRegistry {
  private readonly stringResources: Map<string, unknown> = new Map();
  private readonly typedResources: Map<ResourceClass, TypedResourceEntry> =
    new Map();

  set<T>(key: string, value: T): void {
    this.stringResources.set(key, value);
  }

  get<T>(key: string): T | undefined {
    return this.stringResources.get(key) as T | undefined;
  }

  require<T>(key: string): T {
    const value = this.stringResources.get(key);
    if (value === undefined) {
      throw new Error(
        `Resource not found: "${key}". ` +
          `Available: [${this.getKeys().join(", ")}]`,
      );
    }
    return value as T;
  }

  has(key: string): boolean {
    return this.stringResources.has(key);
  }

  delete(key: string): boolean {
    return this.stringResources.delete(key);
  }

  getKeys(): string[] {
    return [...this.stringResources.keys()];
  }

  setByType<T>(type: ResourceClass<T>, value: T): void {
    this.typedResources.set(type, { value });
  }

  getByType<T>(type: ResourceClass<T>): T | null {
    const entry = this.typedResources.get(type);
    return entry ? (entry.value as T) : null;
  }

  requireByType<T>(type: ResourceClass<T>): T {
    const entry = this.typedResources.get(type);
    if (!entry) {
      throw new Error(
        `Resource not found for type: ${type.name}. ` +
          `Available: [${this.getTypeNames().join(", ")}]`,
      );
    }
    return entry.value as T;
  }

  hasByType<T>(type: ResourceClass<T>): boolean {
    return this.typedResources.has(type);
  }

  deleteByType<T>(type: ResourceClass<T>): boolean {
    return this.typedResources.delete(type);
  }

  getTypeNames(): string[] {
    return [...this.typedResources.keys()].map((c) => c.name);
  }

  clear(): void {
    this.stringResources.clear();
    this.typedResources.clear();
  }

  get size(): number {
    return this.stringResources.size + this.typedResources.size;
  }

  isEmpty(): boolean {
    return this.size === 0;
  }

  toJSON(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const [key, value] of this.stringResources) {
      if (this.isSerializable(value)) {
        result[key] = value;
      }
    }
    return result;
  }

  fromJSON(data: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(data)) {
      this.stringResources.set(key, value);
    }
  }

  private isSerializable(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    const type = typeof value;
    if (type === "number" || type === "string" || type === "boolean")
      return true;
    if (Array.isArray(value)) return true;
    if (type === "object" && value?.constructor === Object) return true;
    return false;
  }
}
