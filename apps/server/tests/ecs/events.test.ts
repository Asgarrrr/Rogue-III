import { describe, it, expect, beforeEach } from "bun:test";
import { EventQueue, type Entity } from "@rogue/ecs";

describe("EventQueue", () => {
  let events: EventQueue;

  beforeEach(() => {
    events = new EventQueue();
  });

  describe("Handler priority ordering", () => {
    it("handlers execute in priority order (lower first)", () => {
      const order: string[] = [];

      events.on("entity.spawned", () => order.push("priority-10"), 10);
      events.on("entity.spawned", () => order.push("priority-0"), 0);
      events.on("entity.spawned", () => order.push("priority-5"), 5);

      events.emit({ type: "entity.spawned", entity: 1 as Entity });
      events.flush();

      expect(order).toEqual(["priority-0", "priority-5", "priority-10"]);
    });

    it("same priority preserves insertion order", () => {
      const order: string[] = [];

      events.on("entity.spawned", () => order.push("first"), 0);
      events.on("entity.spawned", () => order.push("second"), 0);
      events.on("entity.spawned", () => order.push("third"), 0);

      events.emit({ type: "entity.spawned", entity: 1 as Entity });
      events.flush();

      expect(order).toEqual(["first", "second", "third"]);
    });

    it("negative priority executes before default", () => {
      const order: string[] = [];

      events.on("entity.spawned", () => order.push("default"));
      events.on("entity.spawned", () => order.push("early"), -10);
      events.on("entity.spawned", () => order.push("very-early"), -100);

      events.emit({ type: "entity.spawned", entity: 1 as Entity });
      events.flush();

      expect(order).toEqual(["very-early", "early", "default"]);
    });
  });

  describe("Wildcard handler priority", () => {
    it("onAny respects priority", () => {
      const order: string[] = [];

      events.onAny(() => order.push("any-high"), 100);
      events.onAny(() => order.push("any-low"), -100);
      events.on("entity.spawned", () => order.push("specific"), 0);

      events.emit({ type: "entity.spawned", entity: 1 as Entity });
      events.flush();

      expect(order).toEqual(["specific", "any-low", "any-high"]);
    });
  });

  describe("Backward compatibility", () => {
    it("default priority is 0", () => {
      const order: string[] = [];

      events.on("entity.spawned", () => order.push("explicit-0"), 0);
      events.on("entity.spawned", () => order.push("default"));

      events.emit({ type: "entity.spawned", entity: 1 as Entity });
      events.flush();

      expect(order).toEqual(["explicit-0", "default"]);
    });

    it("unsubscribe still works with priority", () => {
      const order: string[] = [];

      const unsub = events.on(
        "entity.spawned",
        () => order.push("removed"),
        5,
      );
      events.on("entity.spawned", () => order.push("kept"), 10);

      unsub();

      events.emit({ type: "entity.spawned", entity: 1 as Entity });
      events.flush();

      expect(order).toEqual(["kept"]);
    });
  });
});
