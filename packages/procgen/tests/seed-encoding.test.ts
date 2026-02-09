/**
 * Seed Encoding Tests
 */

import { describe, expect, it } from "bun:test";
import type { GenerationConfig } from "../src";
import {
  createSeed,
  decodeSeed,
  decodeSeedPretty,
  encodeSeed,
  encodeSeedPretty,
  generate,
  isValidEncodedSeed,
  pathToSeed,
  randomEncodedSeed,
  SeededRandom,
  seedsAreEquivalent,
  seedToPath,
} from "../src";

describe("encodeSeed", () => {
  it("encodes a seed to a string", () => {
    const seed = createSeed(12345);
    const encoded = encodeSeed(seed);

    expect(typeof encoded).toBe("string");
    expect(encoded.length).toBeLessThanOrEqual(8);
    expect(encoded.length).toBeGreaterThanOrEqual(2);
  });

  it("produces URL-safe output", () => {
    const seed = createSeed(12345);
    const encoded = encodeSeed(seed);

    // Should only contain alphanumeric characters
    expect(/^[0-9A-Za-z]+$/.test(encoded)).toBe(true);
  });

  it("produces consistent output for same seed", () => {
    const seed = createSeed(12345);
    const encoded1 = encodeSeed(seed);
    const encoded2 = encodeSeed(seed);

    expect(encoded1).toBe(encoded2);
  });

  it("produces different output for different seeds", () => {
    const seed1 = createSeed(12345);
    const seed2 = createSeed(54321);

    const encoded1 = encodeSeed(seed1);
    const encoded2 = encodeSeed(seed2);

    expect(encoded1).not.toBe(encoded2);
  });
});

describe("decodeSeed", () => {
  it("decodes an encoded seed", () => {
    const original = createSeed(12345);
    const encoded = encodeSeed(original);
    const decoded = decodeSeed(encoded);

    expect(decoded.primary).toBe(original.primary);
  });

  it("produces equivalent seeds after roundtrip", () => {
    const original = createSeed(12345);
    const encoded = encodeSeed(original);
    const decoded = decodeSeed(encoded);

    expect(seedsAreEquivalent(original, decoded)).toBe(true);
  });

  it("throws on invalid input", () => {
    expect(() => decodeSeed("")).toThrow();
    expect(() => decodeSeed("X")).toThrow();
    expect(() => decodeSeed("0InvalidChar!")).toThrow();
  });

  it("throws on invalid version", () => {
    expect(() => decodeSeed("0AAAAAA")).toThrow(/version/i);
  });
});

describe("roundtrip encoding", () => {
  const testSeeds = [0, 1, 12345, 999999, 0xffffffff];

  for (const seedValue of testSeeds) {
    it(`roundtrips seed ${seedValue}`, () => {
      const original = createSeed(seedValue);
      const encoded = encodeSeed(original);
      const decoded = decodeSeed(encoded);

      expect(decoded.primary).toBe(original.primary);
      expect(decoded.layout).toBe(original.layout);
      expect(decoded.rooms).toBe(original.rooms);
      expect(decoded.connections).toBe(original.connections);
      expect(decoded.details).toBe(original.details);
    });
  }

  it("roundtrips 100 random seeds", () => {
    const rng = new SeededRandom(0x12345678);
    for (let i = 0; i < 100; i++) {
      const seedValue = Math.floor(rng.next() * 0x100000000) >>> 0;
      const original = createSeed(seedValue);
      const encoded = encodeSeed(original);
      const decoded = decodeSeed(encoded);

      expect(seedsAreEquivalent(original, decoded)).toBe(true);
    }
  });
});

describe("isValidEncodedSeed", () => {
  it("returns true for valid encoded seeds", () => {
    const seed = createSeed(12345);
    const encoded = encodeSeed(seed);

    expect(isValidEncodedSeed(encoded)).toBe(true);
  });

  it("returns false for invalid inputs", () => {
    expect(isValidEncodedSeed("")).toBe(false);
    expect(isValidEncodedSeed("X")).toBe(false);
    expect(isValidEncodedSeed("0AAAAAA")).toBe(false); // Invalid version
    expect(isValidEncodedSeed("1!!!!!!")).toBe(false); // Invalid characters
    expect(isValidEncodedSeed("1AAAAAAAAAA")).toBe(false); // Too long
  });

  it("returns false for non-strings", () => {
    expect(isValidEncodedSeed(null)).toBe(false);
    expect(isValidEncodedSeed(undefined)).toBe(false);
    expect(isValidEncodedSeed(12345)).toBe(false);
  });
});

describe("encodeSeedPretty / decodeSeedPretty", () => {
  it("encodes with default prefix", () => {
    const seed = createSeed(12345);
    const pretty = encodeSeedPretty(seed);

    expect(pretty.startsWith("DNG-")).toBe(true);
  });

  it("encodes with custom prefix", () => {
    const seed = createSeed(12345);
    const pretty = encodeSeedPretty(seed, "LEVEL");

    expect(pretty.startsWith("LEVEL-")).toBe(true);
  });

  it("roundtrips through pretty encoding", () => {
    const original = createSeed(12345);
    const pretty = encodeSeedPretty(original);
    const decoded = decodeSeedPretty(pretty);

    expect(seedsAreEquivalent(original, decoded)).toBe(true);
  });

  it("throws on invalid format", () => {
    expect(() => decodeSeedPretty("INVALID")).toThrow();
    expect(() => decodeSeedPretty("TOO-MANY-PARTS")).toThrow();
  });
});

describe("seedToPath / pathToSeed", () => {
  it("creates valid URL path", () => {
    const seed = createSeed(12345);
    const path = seedToPath(seed);

    expect(path).not.toContain("/");
    expect(path).not.toContain("?");
    expect(path).not.toContain("&");
  });

  it("roundtrips through path encoding", () => {
    const original = createSeed(12345);
    const path = seedToPath(original);
    const decoded = pathToSeed(path);

    expect(seedsAreEquivalent(original, decoded)).toBe(true);
  });
});

describe("randomEncodedSeed", () => {
  it("generates valid encoded seeds", () => {
    for (let i = 0; i < 10; i++) {
      const encoded = randomEncodedSeed();
      expect(isValidEncodedSeed(encoded)).toBe(true);
    }
  });

  it("generates different seeds", () => {
    const seeds = new Set<string>();
    for (let i = 0; i < 100; i++) {
      seeds.add(randomEncodedSeed());
    }
    // All should be unique (extremely high probability)
    expect(seeds.size).toBe(100);
  });
});

describe("integration with generation", () => {
  it("encoded seed produces same dungeon", () => {
    const original = createSeed(12345);
    const encoded = encodeSeed(original);
    const decoded = decodeSeed(encoded);

    const config1: GenerationConfig = {
      width: 80,
      height: 60,
      seed: original,
      algorithm: "bsp",
    };

    const config2: GenerationConfig = {
      width: 80,
      height: 60,
      seed: decoded,
      algorithm: "bsp",
    };

    const result1 = generate(config1);
    const result2 = generate(config2);

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);

    if (result1.success && result2.success) {
      // Checksums must match
      expect(result1.artifact.checksum).toBe(result2.artifact.checksum);

      // Room counts must match
      expect(result1.artifact.rooms.length).toBe(result2.artifact.rooms.length);
    }
  });

  it("pretty encoded seed produces same dungeon", () => {
    const original = createSeed(54321);
    const pretty = encodeSeedPretty(original);
    const decoded = decodeSeedPretty(pretty);

    const config1: GenerationConfig = {
      width: 80,
      height: 60,
      seed: original,
      algorithm: "bsp",
    };

    const config2: GenerationConfig = {
      width: 80,
      height: 60,
      seed: decoded,
      algorithm: "bsp",
    };

    const result1 = generate(config1);
    const result2 = generate(config2);

    expect(result1.success).toBe(true);
    expect(result2.success).toBe(true);

    if (result1.success && result2.success) {
      expect(result1.artifact.checksum).toBe(result2.artifact.checksum);
    }
  });
});
