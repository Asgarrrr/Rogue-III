/**
 * Hot Reload Tests
 */

import { describe, it, expect, beforeEach } from "bun:test";
import {
  World,
  defineSystem,
  SystemPhase,
  type HotReloadManager,
  createHotReloadManager,
} from "../../src/game/ecs";

describe("HotReload", () => {
  let world: World;
  let hotReload: HotReloadManager;

  beforeEach(() => {
    world = new World();
    hotReload = createHotReloadManager(world);
  });

  describe("reloadSystem", () => {
    it("should replace an existing system", () => {
      let executionCount = 0;

      const system1 = defineSystem("TestSystem")
        .inPhase(SystemPhase.Update)
        .execute(() => {
          executionCount += 1;
        });

      const system2 = defineSystem("TestSystem")
        .inPhase(SystemPhase.Update)
        .execute(() => {
          executionCount += 10;
        });

      world.systems.register(system1);
      world.initialize();
      world.tick();

      expect(executionCount).toBe(1);

      // Reload with new implementation
      hotReload.reloadSystem("TestSystem", system2);

      world.tick();

      expect(executionCount).toBe(11); // 1 + 10
    });

    it("should register new system if not found", () => {
      const system = defineSystem("NewSystem")
        .inPhase(SystemPhase.Update)
        .execute(() => {});

      const result = hotReload.reloadSystem("NewSystem", system);

      expect(result).toBe(true);
      expect(world.systems.getSystem("NewSystem")).toBeDefined();
    });

    it("should not reload when disabled", () => {
      const system1 = defineSystem("TestSystem")
        .inPhase(SystemPhase.Update)
        .execute(() => {});

      const system2 = defineSystem("TestSystem")
        .inPhase(SystemPhase.Update)
        .execute(() => {});

      world.systems.register(system1);

      hotReload.disable();

      const result = hotReload.reloadSystem("TestSystem", system2);

      expect(result).toBe(false);
    });
  });

  describe("callbacks", () => {
    it("should notify callbacks on reload", () => {
      let notified = false;
      let oldSys: unknown = null;
      let newSys: unknown = null;

      hotReload.onReload((name, old, next) => {
        notified = true;
        oldSys = old;
        newSys = next;
      });

      const system1 = defineSystem("TestSystem")
        .inPhase(SystemPhase.Update)
        .execute(() => {});

      const system2 = defineSystem("TestSystem")
        .inPhase(SystemPhase.Update)
        .execute(() => {});

      world.systems.register(system1);
      hotReload.reloadSystem("TestSystem", system2);

      expect(notified).toBe(true);
      expect(oldSys).toBe(system1);
      expect(newSys).toBe(system2);
    });

    it("should allow unsubscribing from callbacks", () => {
      let count = 0;

      const unsubscribe = hotReload.onReload(() => {
        count++;
      });

      const system = defineSystem("TestSystem")
        .inPhase(SystemPhase.Update)
        .execute(() => {});

      world.systems.register(system);
      hotReload.reloadSystem("TestSystem", system);

      expect(count).toBe(1);

      unsubscribe();

      hotReload.reloadSystem("TestSystem", system);

      expect(count).toBe(1); // Still 1, callback was removed
    });
  });

  describe("enable/disable", () => {
    it("should toggle hot reload state", () => {
      expect(hotReload.isEnabled()).toBe(true);

      hotReload.disable();
      expect(hotReload.isEnabled()).toBe(false);

      hotReload.enable();
      expect(hotReload.isEnabled()).toBe(true);
    });
  });

  describe("SystemScheduler.replaceSystem", () => {
    it("should preserve system position", () => {
      const order: string[] = [];

      const systemA = defineSystem("A")
        .inPhase(SystemPhase.Update)
        .execute(() => {
          order.push("A");
        });

      const systemB = defineSystem("B")
        .inPhase(SystemPhase.Update)
        .runAfter("A")
        .execute(() => {
          order.push("B");
        });

      const systemC = defineSystem("C")
        .inPhase(SystemPhase.Update)
        .runAfter("B")
        .execute(() => {
          order.push("C");
        });

      world.systems.register(systemA);
      world.systems.register(systemB);
      world.systems.register(systemC);
      world.initialize();
      world.tick();

      expect(order).toEqual(["A", "B", "C"]);

      // Replace B with new implementation
      const newSystemB = defineSystem("B")
        .inPhase(SystemPhase.Update)
        .runAfter("A")
        .execute(() => {
          order.push("B-new");
        });

      world.systems.replaceSystem("B", newSystemB);
      world.tick();

      expect(order).toEqual(["A", "B", "C", "A", "B-new", "C"]);
    });

    it("should return false for non-existent system", () => {
      const system = defineSystem("NonExistent")
        .inPhase(SystemPhase.Update)
        .execute(() => {});

      const result = world.systems.replaceSystem("NonExistent", system);

      expect(result).toBe(false);
    });
  });
});
