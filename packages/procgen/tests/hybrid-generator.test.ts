import { describe, expect, it } from "bun:test";
import { createHybridGenerator, HybridGenerator } from "../src/generators/hybrid";

describe("HybridGenerator config", () => {
  it("deep-merges zoneSplit patch with defaults", () => {
    const generator = createHybridGenerator({
      zoneSplit: { minZones: 3 },
    });

    const config = generator.getHybridConfig();

    expect(config.zoneSplit.minZones).toBe(3);
    expect(config.zoneSplit.maxZones).toBe(4);
    expect(config.zoneSplit.naturalRatio).toBe(0.3);
  });

  it("withHybridConfig returns a new generator and keeps original unchanged", () => {
    const base = createHybridGenerator({
      zoneSplit: { minZones: 2 },
    });

    const updated = base.withHybridConfig({
      zoneSplit: { minZones: 5 },
    });

    expect(base.getHybridConfig().zoneSplit.minZones).toBe(2);
    expect(updated.getHybridConfig().zoneSplit.minZones).toBe(5);
  });

  it("withHybridConfig supports chained immutable updates", () => {
    const base = new HybridGenerator({
      zoneSplit: { minZones: 2 },
    });

    const updated = base
      .withHybridConfig({ zoneSplit: { minZones: 6 } })
      .withHybridConfig({ zoneSplit: { maxZones: 8 } });

    expect(base.getHybridConfig().zoneSplit.minZones).toBe(2);
    expect(updated.getHybridConfig().zoneSplit.minZones).toBe(6);
    expect(updated.getHybridConfig().zoneSplit.maxZones).toBe(8);
  });

  it("returns frozen config objects", () => {
    const generator = createHybridGenerator();
    const config = generator.getHybridConfig();

    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.zoneSplit)).toBe(true);
  });
});
