/**
 * Union-Find (Disjoint Set Union) data structure optimized for grid-based connected component analysis.
 * Uses path compression and union by rank for near-constant time operations.
 */
export class UnionFind {
  private parent: Uint32Array;
  private rank: Uint8Array;
  private componentSize: Uint32Array;
  private numComponents: number;

  constructor(size: number) {
    this.parent = new Uint32Array(size);
    this.rank = new Uint8Array(size);
    this.componentSize = new Uint32Array(size);
    this.numComponents = size;

    // Initialize each element as its own parent
    for (let i = 0; i < size; i++) {
      this.parent[i] = i;
      this.componentSize[i] = 1;
    }
  }

  /**
   * Find root of element with path compression
   */
  find(x: number): number {
    if (this.parent[x] !== x) {
      this.parent[x] = this.find(this.parent[x]); // Path compression
    }
    return this.parent[x];
  }

  /**
   * Union two elements by rank
   */
  union(x: number, y: number): boolean {
    const rootX = this.find(x);
    const rootY = this.find(y);

    if (rootX === rootY) return false; // Already in same component

    // Union by rank
    if (this.rank[rootX] < this.rank[rootY]) {
      this.parent[rootX] = rootY;
      this.componentSize[rootY] += this.componentSize[rootX];
    } else if (this.rank[rootX] > this.rank[rootY]) {
      this.parent[rootY] = rootX;
      this.componentSize[rootX] += this.componentSize[rootY];
    } else {
      this.parent[rootY] = rootX;
      this.componentSize[rootX] += this.componentSize[rootY];
      this.rank[rootX]++;
    }

    this.numComponents--;
    return true;
  }

  /**
   * Check if two elements are in the same component
   */
  connected(x: number, y: number): boolean {
    return this.find(x) === this.find(y);
  }

  /**
   * Get size of component containing element
   */
  getComponentSize(x: number): number {
    return this.componentSize[this.find(x)];
  }

  /**
   * Get total number of components
   */
  getNumComponents(): number {
    return this.numComponents;
  }

  /**
   * Get all components as arrays of element indices
   */
  getAllComponents(): number[][] {
    const components = new Map<number, number[]>();

    for (let i = 0; i < this.parent.length; i++) {
      const root = this.find(i);
      if (!components.has(root)) {
        components.set(root, []);
      }
      components.get(root)!.push(i);
    }

    return Array.from(components.values());
  }

  /**
   * Get components above minimum size threshold
   */
  getLargeComponents(minSize: number): number[][] {
    return this.getAllComponents().filter(
      (component) => component.length >= minSize,
    );
  }

  /**
   * Reset the union-find structure
   */
  reset(): void {
    this.numComponents = this.parent.length;
    for (let i = 0; i < this.parent.length; i++) {
      this.parent[i] = i;
      this.rank[i] = 0;
      this.componentSize[i] = 1;
    }
  }
}
