/**
 * Generic binary min-heap.
 *
 * Provides O(log n) push/pop with caller-defined ordering.
 */

export type MinHeapCompare<T> = (a: T, b: T) => number;

export class MinHeap<T> {
  private readonly items: T[] = [];
  private readonly compare: MinHeapCompare<T>;

  constructor(compare: MinHeapCompare<T>) {
    this.compare = compare;
  }

  get size(): number {
    return this.items.length;
  }

  get isEmpty(): boolean {
    return this.items.length === 0;
  }

  peek(): T | undefined {
    return this.items[0];
  }

  push(value: T): void {
    this.items.push(value);
    this.bubbleUp(this.items.length - 1);
  }

  pop(): T | undefined {
    if (this.items.length === 0) {
      return undefined;
    }

    const best = this.items[0];
    const tail = this.items.pop();

    if (best === undefined) {
      return undefined;
    }
    if (tail === undefined || this.items.length === 0) {
      return best;
    }

    this.items[0] = tail;
    this.bubbleDown(0);
    return best;
  }

  clear(): void {
    this.items.length = 0;
  }

  private bubbleUp(startIndex: number): void {
    let index = startIndex;
    const value = this.items[index];
    if (value === undefined) return;

    while (index > 0) {
      const parent = (index - 1) >> 1;
      const parentValue = this.items[parent];
      if (parentValue === undefined) break;
      if (this.compare(parentValue, value) <= 0) break;

      this.items[index] = parentValue;
      index = parent;
    }

    this.items[index] = value;
  }

  private bubbleDown(startIndex: number): void {
    let index = startIndex;
    const value = this.items[index];
    if (value === undefined) return;

    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= this.items.length) break;

      const leftValue = this.items[left];
      if (leftValue === undefined) break;

      let bestChild = left;
      let bestChildValue = leftValue;

      if (right < this.items.length) {
        const rightValue = this.items[right];
        if (
          rightValue !== undefined &&
          this.compare(rightValue, bestChildValue) < 0
        ) {
          bestChild = right;
          bestChildValue = rightValue;
        }
      }

      if (this.compare(value, bestChildValue) <= 0) break;

      this.items[index] = bestChildValue;
      index = bestChild;
    }

    this.items[index] = value;
  }
}
