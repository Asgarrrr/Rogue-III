import { describe, expect, it } from "bun:test";
import { MinHeap } from "../src/core/data-structures";

describe("MinHeap", () => {
  it("returns values in ascending order", () => {
    const heap = new MinHeap<number>((a, b) => a - b);
    heap.push(4);
    heap.push(1);
    heap.push(3);
    heap.push(2);

    expect(heap.pop()).toBe(1);
    expect(heap.pop()).toBe(2);
    expect(heap.pop()).toBe(3);
    expect(heap.pop()).toBe(4);
    expect(heap.pop()).toBeUndefined();
  });

  it("supports deterministic tie-breaks via comparator", () => {
    type Node = { cost: number; id: number };
    const heap = new MinHeap<Node>((a, b) => {
      if (a.cost !== b.cost) return a.cost - b.cost;
      return a.id - b.id;
    });

    heap.push({ cost: 2, id: 5 });
    heap.push({ cost: 1, id: 9 });
    heap.push({ cost: 1, id: 3 });

    expect(heap.pop()).toEqual({ cost: 1, id: 3 });
    expect(heap.pop()).toEqual({ cost: 1, id: 9 });
    expect(heap.pop()).toEqual({ cost: 2, id: 5 });
  });

  it("supports peek/size/clear", () => {
    const heap = new MinHeap<number>((a, b) => a - b);
    expect(heap.isEmpty).toBe(true);
    expect(heap.size).toBe(0);
    expect(heap.peek()).toBeUndefined();

    heap.push(10);
    heap.push(5);
    expect(heap.peek()).toBe(5);
    expect(heap.size).toBe(2);

    heap.clear();
    expect(heap.isEmpty).toBe(true);
    expect(heap.size).toBe(0);
    expect(heap.peek()).toBeUndefined();
  });
});
