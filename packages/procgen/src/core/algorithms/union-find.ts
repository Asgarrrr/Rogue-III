/**
 * Union-Find (Disjoint Set Union) data structure.
 *
 * Efficiently tracks connected components with near-constant time operations
 * using path compression and union by rank optimizations.
 *
 * @example
 * ```typescript
 * const uf = new UnionFind(10);
 * uf.union(0, 1);  // Connect nodes 0 and 1
 * uf.union(2, 3);  // Connect nodes 2 and 3
 * uf.connected(0, 1);  // true
 * uf.connected(0, 2);  // false
 * uf.union(1, 2);  // Connect the two components
 * uf.connected(0, 3);  // true (all connected now)
 * ```
 */
export class UnionFind {
  private readonly parent: number[];
  private readonly rank: number[];

  /**
   * Create a new Union-Find structure with n elements.
   * @param size - Number of elements (0 to size-1)
   */
  constructor(size: number) {
    this.parent = new Array(size);
    this.rank = new Array(size);
    for (let i = 0; i < size; i++) {
      this.parent[i] = i;
      this.rank[i] = 0;
    }
  }

  /**
   * Find the root representative of the set containing x.
   * Uses path compression for O(α(n)) amortized time.
   * @param x - Element to find root for
   * @returns Root element of the set
   */
  find(x: number): number {
    const parent = this.parent[x];
    if (parent === undefined) return x;
    if (parent !== x) {
      this.parent[x] = this.find(parent);
      return this.parent[x]!;
    }
    return parent;
  }

  /**
   * Merge the sets containing x and y.
   * Uses union by rank to keep trees balanced.
   * @param x - First element
   * @param y - Second element
   * @returns True if a merge was performed, false if already in same set
   */
  union(x: number, y: number): boolean {
    const rootX = this.find(x);
    const rootY = this.find(y);

    if (rootX === rootY) return false;

    const rankX = this.rank[rootX];
    const rankY = this.rank[rootY];
    if (rankX === undefined || rankY === undefined) return false;

    // Union by rank
    if (rankX < rankY) {
      this.parent[rootX] = rootY;
    } else if (rankX > rankY) {
      this.parent[rootY] = rootX;
    } else {
      this.parent[rootY] = rootX;
      this.rank[rootX]!++;
    }
    return true;
  }

  /**
   * Check if two elements are in the same set.
   * @param x - First element
   * @param y - Second element
   * @returns True if x and y are connected
   */
  connected(x: number, y: number): boolean {
    return this.find(x) === this.find(y);
  }
}
