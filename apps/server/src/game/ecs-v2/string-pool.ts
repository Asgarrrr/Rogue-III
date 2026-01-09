/**
 * String Interning Pool
 *
 * Provides efficient string storage for ECS components by interning strings
 * and storing only their indices. This preserves the SoA (Structure of Arrays)
 * layout since string indices are stored as u32 values.
 *
 * Benefits:
 * - Identical strings share memory (interned)
 * - String comparison is O(1) (compare indices)
 * - SoA layout preserved (indices are numbers)
 * - Efficient serialization (export pool + indices)
 */

/**
 * Global string pool for ECS string fields.
 * All string field values are interned here.
 */
export class StringPool {
  /** Array of interned strings. Index 0 is always empty string. */
  private readonly strings: string[] = [""];

  /** Reverse lookup: string → index for O(1) interning */
  private readonly lookup: Map<string, number> = new Map([["", 0]]);

  /** Track reference counts for potential garbage collection */
  private readonly refCounts: number[] = [0];

  /**
   * Intern a string and return its index.
   * If the string already exists, returns the existing index.
   *
   * @param str - The string to intern
   * @returns The index of the interned string
   */
  intern(str: string): number {
    // Fast path: already interned
    const existing = this.lookup.get(str);
    if (existing !== undefined) {
      return existing;
    }

    // New string: add to pool
    const index = this.strings.length;
    this.strings.push(str);
    this.lookup.set(str, index);
    this.refCounts.push(0);

    return index;
  }

  /**
   * Get the string at the given index.
   *
   * @param index - The string index
   * @returns The interned string, or empty string if index is invalid
   */
  get(index: number): string {
    return this.strings[index] ?? "";
  }

  /**
   * Check if a string is already interned.
   *
   * @param str - The string to check
   * @returns true if the string is interned
   */
  has(str: string): boolean {
    return this.lookup.has(str);
  }

  /**
   * Get the index of an interned string without interning it.
   *
   * @param str - The string to look up
   * @returns The index, or -1 if not interned
   */
  indexOf(str: string): number {
    return this.lookup.get(str) ?? -1;
  }

  /**
   * Increment the reference count for a string index.
   * Used for tracking string usage in components.
   */
  addRef(index: number): void {
    if (index > 0 && index < this.refCounts.length) {
      this.refCounts[index]++;
    }
  }

  /**
   * Decrement the reference count for a string index.
   * Used when a component is removed or entity despawned.
   */
  releaseRef(index: number): void {
    if (index > 0 && index < this.refCounts.length) {
      this.refCounts[index] = Math.max(0, this.refCounts[index] - 1);
    }
  }

  /**
   * Get the reference count for a string index.
   */
  getRefCount(index: number): number {
    return this.refCounts[index] ?? 0;
  }

  /**
   * Get the total number of interned strings.
   */
  get size(): number {
    return this.strings.length;
  }

  /**
   * Get all interned strings (for debugging/serialization).
   */
  getAll(): readonly string[] {
    return this.strings;
  }

  /**
   * Export the pool for serialization.
   * Only exports strings with index > 0 (excludes empty string).
   */
  export(): string[] {
    return this.strings.slice(1);
  }

  /**
   * Import strings from a serialized pool.
   * Merges with existing strings, returning a mapping from old indices to new.
   *
   * @param strings - The strings to import (without empty string at index 0)
   * @returns A mapping from import index (1-based) to new index
   */
  import(strings: string[]): Map<number, number> {
    const indexMap = new Map<number, number>();
    indexMap.set(0, 0); // Empty string always maps to 0

    for (let i = 0; i < strings.length; i++) {
      const oldIndex = i + 1; // Import indices are 1-based
      const newIndex = this.intern(strings[i]);
      indexMap.set(oldIndex, newIndex);
    }

    return indexMap;
  }

  /**
   * Clear all strings except the empty string.
   * WARNING: This invalidates all existing string indices!
   */
  clear(): void {
    this.strings.length = 1;
    this.lookup.clear();
    this.lookup.set("", 0);
    this.refCounts.length = 1;
  }

  /**
   * Get memory statistics.
   */
  getStats(): StringPoolStats {
    let totalChars = 0;
    let totalRefs = 0;

    for (let i = 0; i < this.strings.length; i++) {
      totalChars += this.strings[i].length;
      totalRefs += this.refCounts[i];
    }

    return {
      stringCount: this.strings.length,
      totalCharacters: totalChars,
      totalReferences: totalRefs,
      averageLength: totalChars / this.strings.length,
    };
  }
}

export interface StringPoolStats {
  stringCount: number;
  totalCharacters: number;
  totalReferences: number;
  averageLength: number;
}

/**
 * Global string pool instance.
 * Used by all ECS worlds by default.
 */
export const globalStringPool = new StringPool();

/**
 * Get the global string pool.
 */
export function getStringPool(): StringPool {
  return globalStringPool;
}
