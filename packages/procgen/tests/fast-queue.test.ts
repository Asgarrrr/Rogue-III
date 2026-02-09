import { describe, expect, it } from "bun:test";
import {
  CoordSet,
  coordFromKey,
  coordKey,
  FastQueue,
} from "../src/core/data-structures/fast-queue";

describe("FastQueue", () => {
  it("should enqueue and dequeue in FIFO order", () => {
    const queue = new FastQueue<number>();

    queue.enqueue(1);
    queue.enqueue(2);
    queue.enqueue(3);

    expect(queue.dequeue()).toBe(1);
    expect(queue.dequeue()).toBe(2);
    expect(queue.dequeue()).toBe(3);
  });

  it("should return undefined when dequeuing from empty queue", () => {
    const queue = new FastQueue<number>();
    expect(queue.dequeue()).toBeUndefined();
  });

  it("should track isEmpty correctly", () => {
    const queue = new FastQueue<number>();

    expect(queue.isEmpty).toBe(true);

    queue.enqueue(1);
    expect(queue.isEmpty).toBe(false);

    queue.dequeue();
    expect(queue.isEmpty).toBe(true);
  });

  it("should track length correctly", () => {
    const queue = new FastQueue<number>();

    expect(queue.length).toBe(0);

    queue.enqueue(1);
    queue.enqueue(2);
    queue.enqueue(3);
    expect(queue.length).toBe(3);

    queue.dequeue();
    expect(queue.length).toBe(2);

    queue.dequeue();
    queue.dequeue();
    expect(queue.length).toBe(0);
  });

  it("should peek at the first item without removing it", () => {
    const queue = new FastQueue<number>();

    queue.enqueue(1);
    queue.enqueue(2);

    expect(queue.peek()).toBe(1);
    expect(queue.length).toBe(2);

    queue.dequeue();
    expect(queue.peek()).toBe(2);
  });

  it("should return undefined when peeking at empty queue", () => {
    const queue = new FastQueue<number>();
    expect(queue.peek()).toBeUndefined();
  });

  it("should clear all items", () => {
    const queue = new FastQueue<number>();

    queue.enqueue(1);
    queue.enqueue(2);
    queue.enqueue(3);

    queue.clear();

    expect(queue.isEmpty).toBe(true);
    expect(queue.length).toBe(0);
    expect(queue.dequeue()).toBeUndefined();
  });

  it("should compact internal array after many dequeues", () => {
    const queue = new FastQueue<number>();

    // Enqueue 2000 items
    for (let i = 0; i < 2000; i++) {
      queue.enqueue(i);
    }

    // Dequeue 1500 items (exceeds compaction threshold of 1000)
    for (let i = 0; i < 1500; i++) {
      queue.dequeue();
    }

    // Queue should still function correctly after compaction
    expect(queue.length).toBe(500);
    expect(queue.dequeue()).toBe(1500);
    expect(queue.dequeue()).toBe(1501);
  });

  it("should handle mixed enqueue/dequeue operations", () => {
    const queue = new FastQueue<string>();

    queue.enqueue("a");
    queue.enqueue("b");
    expect(queue.dequeue()).toBe("a");

    queue.enqueue("c");
    queue.enqueue("d");
    expect(queue.dequeue()).toBe("b");
    expect(queue.dequeue()).toBe("c");

    queue.enqueue("e");
    expect(queue.dequeue()).toBe("d");
    expect(queue.dequeue()).toBe("e");

    expect(queue.isEmpty).toBe(true);
  });

  it("should create queue from array using FastQueue.from()", () => {
    const queue = FastQueue.from([1, 2, 3, 4, 5]);

    expect(queue.length).toBe(5);
    expect(queue.dequeue()).toBe(1);
    expect(queue.dequeue()).toBe(2);
    expect(queue.dequeue()).toBe(3);
    expect(queue.dequeue()).toBe(4);
    expect(queue.dequeue()).toBe(5);
    expect(queue.isEmpty).toBe(true);
  });

  it("should create queue from Set using FastQueue.from()", () => {
    const set = new Set(["apple", "banana", "cherry"]);
    const queue = FastQueue.from(set);

    expect(queue.length).toBe(3);
    expect(queue.dequeue()).toBe("apple");
    expect(queue.dequeue()).toBe("banana");
    expect(queue.dequeue()).toBe("cherry");
  });

  it("should create empty queue from empty iterable", () => {
    const queue = FastQueue.from([]);

    expect(queue.isEmpty).toBe(true);
    expect(queue.length).toBe(0);
  });

  it("should handle complex objects", () => {
    type Coord = { x: number; y: number };
    const queue = new FastQueue<Coord>();

    const coord1 = { x: 1, y: 2 };
    const coord2 = { x: 3, y: 4 };

    queue.enqueue(coord1);
    queue.enqueue(coord2);

    expect(queue.dequeue()).toEqual(coord1);
    expect(queue.dequeue()).toEqual(coord2);
  });
});

describe("CoordSet", () => {
  it("should add and check coordinates", () => {
    const set = new CoordSet(10, 10);

    expect(set.has(0, 0)).toBe(false);

    set.add(0, 0);
    expect(set.has(0, 0)).toBe(true);

    set.add(5, 5);
    expect(set.has(5, 5)).toBe(true);

    set.add(9, 9);
    expect(set.has(9, 9)).toBe(true);
  });

  it("should delete coordinates", () => {
    const set = new CoordSet(10, 10);

    set.add(3, 4);
    expect(set.has(3, 4)).toBe(true);

    set.delete(3, 4);
    expect(set.has(3, 4)).toBe(false);
  });

  it("should clear all coordinates", () => {
    const set = new CoordSet(10, 10);

    set.add(1, 1);
    set.add(2, 2);
    set.add(3, 3);

    expect(set.has(1, 1)).toBe(true);
    expect(set.has(2, 2)).toBe(true);
    expect(set.has(3, 3)).toBe(true);

    set.clear();

    expect(set.has(1, 1)).toBe(false);
    expect(set.has(2, 2)).toBe(false);
    expect(set.has(3, 3)).toBe(false);
  });

  it("should handle multiple adds to same coordinate", () => {
    const set = new CoordSet(10, 10);

    set.add(5, 5);
    set.add(5, 5);
    set.add(5, 5);

    expect(set.has(5, 5)).toBe(true);
  });

  it("should handle delete on non-existent coordinate", () => {
    const set = new CoordSet(10, 10);

    expect(set.has(7, 7)).toBe(false);
    set.delete(7, 7); // Should not throw
    expect(set.has(7, 7)).toBe(false);
  });

  it("should handle independent coordinates", () => {
    const set = new CoordSet(10, 10);

    set.add(1, 2);
    set.add(2, 1);

    expect(set.has(1, 2)).toBe(true);
    expect(set.has(2, 1)).toBe(true);
    expect(set.has(1, 1)).toBe(false);
    expect(set.has(2, 2)).toBe(false);
  });

  it("should handle large grids", () => {
    const set = new CoordSet(100, 100);

    set.add(0, 0);
    set.add(99, 99);
    set.add(50, 50);

    expect(set.has(0, 0)).toBe(true);
    expect(set.has(99, 99)).toBe(true);
    expect(set.has(50, 50)).toBe(true);
    expect(set.has(0, 99)).toBe(false);
    expect(set.has(99, 0)).toBe(false);
  });

  it("should handle all coordinates in small grid", () => {
    const width = 5;
    const height = 5;
    const set = new CoordSet(width, height);

    // Add all coordinates
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        set.add(x, y);
      }
    }

    // Verify all coordinates
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        expect(set.has(x, y)).toBe(true);
      }
    }
  });

  it("should handle edge coordinates", () => {
    const set = new CoordSet(10, 10);

    set.add(0, 0); // Top-left
    set.add(9, 0); // Top-right
    set.add(0, 9); // Bottom-left
    set.add(9, 9); // Bottom-right

    expect(set.has(0, 0)).toBe(true);
    expect(set.has(9, 0)).toBe(true);
    expect(set.has(0, 9)).toBe(true);
    expect(set.has(9, 9)).toBe(true);
  });
});

describe("coordKey and coordFromKey", () => {
  it("should encode and decode coordinates correctly", () => {
    const width = 100;

    const testCases = [
      { x: 0, y: 0 },
      { x: 5, y: 10 },
      { x: 99, y: 99 },
      { x: 50, y: 25 },
      { x: 1, y: 1 },
    ];

    for (const coord of testCases) {
      const key = coordKey(coord.x, coord.y, width);
      const decoded = coordFromKey(key, width);

      expect(decoded.x).toBe(coord.x);
      expect(decoded.y).toBe(coord.y);
    }
  });

  it("should generate unique keys for different coordinates", () => {
    const width = 10;
    const keys = new Set<number>();

    for (let y = 0; y < 10; y++) {
      for (let x = 0; x < 10; x++) {
        const key = coordKey(x, y, width);
        expect(keys.has(key)).toBe(false);
        keys.add(key);
      }
    }

    expect(keys.size).toBe(100);
  });

  it("should handle zero coordinates", () => {
    const width = 50;
    const key = coordKey(0, 0, width);

    expect(key).toBe(0);

    const decoded = coordFromKey(key, width);
    expect(decoded.x).toBe(0);
    expect(decoded.y).toBe(0);
  });

  it("should handle maximum coordinates for given width", () => {
    const width = 10;

    const key = coordKey(9, 9, width);
    const decoded = coordFromKey(key, width);

    expect(decoded.x).toBe(9);
    expect(decoded.y).toBe(9);
  });

  it("should produce sequential keys for row-major order", () => {
    const width = 5;

    // First row: (0,0), (1,0), (2,0), (3,0), (4,0)
    expect(coordKey(0, 0, width)).toBe(0);
    expect(coordKey(1, 0, width)).toBe(1);
    expect(coordKey(2, 0, width)).toBe(2);
    expect(coordKey(3, 0, width)).toBe(3);
    expect(coordKey(4, 0, width)).toBe(4);

    // Second row: (0,1), (1,1), (2,1), (3,1), (4,1)
    expect(coordKey(0, 1, width)).toBe(5);
    expect(coordKey(1, 1, width)).toBe(6);
    expect(coordKey(2, 1, width)).toBe(7);
  });

  it("should work with large grid dimensions", () => {
    const width = 1000;

    const testCoords = [
      { x: 0, y: 0 },
      { x: 999, y: 999 },
      { x: 500, y: 500 },
      { x: 123, y: 456 },
    ];

    for (const coord of testCoords) {
      const key = coordKey(coord.x, coord.y, width);
      const decoded = coordFromKey(key, width);

      expect(decoded.x).toBe(coord.x);
      expect(decoded.y).toBe(coord.y);
    }
  });
});
