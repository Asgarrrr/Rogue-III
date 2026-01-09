import type { Archetype, ArchetypeGraph } from "./archetype";

export interface QueryDescriptor {
  readonly withMask: bigint;
  readonly withoutMask: bigint;
}

interface CachedEntry {
  archetypes: Archetype[];
  lastArchetypeCount: number;
}

export class QueryCache {
  private readonly cache: Map<string, CachedEntry> = new Map();
  private readonly graph: ArchetypeGraph;
  private _hits = 0;
  private _misses = 0;

  constructor(graph: ArchetypeGraph) {
    this.graph = graph;
  }

  resolve(descriptor: QueryDescriptor): Archetype[] {
    const key = this.descriptorKey(descriptor);
    const allArchetypes = this.graph.getAllArchetypes();
    const currentCount = allArchetypes.length;

    const cached = this.cache.get(key);

    if (cached && cached.lastArchetypeCount === currentCount) {
      this._hits++;
      return cached.archetypes;
    }

    this._misses++;
    const archetypes = this.graph.getMatchingArchetypes(
      descriptor.withMask,
      descriptor.withoutMask,
    );

    this.cache.set(key, {
      archetypes,
      lastArchetypeCount: currentCount,
    });

    return archetypes;
  }

  invalidateAll(): void {
    this.cache.clear();
  }

  getCacheSize(): number {
    return this.cache.size;
  }

  getHitRate(): { hits: number; misses: number } {
    return { hits: this._hits, misses: this._misses };
  }

  resetStats(): void {
    this._hits = 0;
    this._misses = 0;
  }

  private descriptorKey(descriptor: QueryDescriptor): string {
    return `${descriptor.withMask.toString(36)}|${descriptor.withoutMask.toString(36)}`;
  }
}
