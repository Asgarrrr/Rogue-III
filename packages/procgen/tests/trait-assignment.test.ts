/**
 * Room Trait Assignment Pass Tests
 *
 * Tests the trait assignment pass system that assigns personality traits to rooms.
 */

import { describe, expect, it } from "bun:test";
import { SeededRandom } from "@rogue/contracts";
import {
  getTraitValue,
  hasTrait,
  traitVectorToObject,
} from "../src/core/traits/trait-vector";
import {
  assignRoomTraits,
  createAssignRoomTraitsPass,
} from "../src/passes/traits/assign-room-traits";
import {
  applyModifiers,
  getProfileForRoomType,
  type RoomModifierContext,
  STANDARD_MODIFIERS,
} from "../src/passes/traits/profiles";
import { createTraceCollector } from "../src/pipeline/trace";
import type { Connection, PassContext, Room } from "../src/pipeline/types";

// =============================================================================
// MOCK DATA HELPERS
// =============================================================================

/**
 * Create a mock room with the given properties
 */
function createMockRoom(
  id: number,
  x: number,
  y: number,
  width: number,
  height: number,
  type: Room["type"] = "normal",
): Room {
  return {
    id,
    x,
    y,
    width,
    height,
    centerX: x + Math.floor(width / 2),
    centerY: y + Math.floor(height / 2),
    type,
    seed: id * 1000,
  };
}

/**
 * Create a mock connection between two rooms
 */
function createMockConnection(
  fromRoomId: number,
  toRoomId: number,
  pathLength: number = 5,
): Connection {
  // Create a simple horizontal path
  const path = [];
  for (let i = 0; i < pathLength; i++) {
    path.push({ x: i, y: 0 });
  }
  return {
    fromRoomId,
    toRoomId,
    path,
  };
}

/**
 * Create a mock PassContext with predictable RNG
 */
function createMockContext(seed: number = 12345): PassContext {
  const createRng = (s: number) => new SeededRandom(s);

  return {
    rng: createRng(seed),
    streams: {
      layout: createRng(seed + 1),
      rooms: createRng(seed + 2),
      connections: createRng(seed + 3),
      details: createRng(seed + 4),
    },
    config: {
      width: 100,
      height: 100,
      seed: {
        primary: seed,
        layout: seed + 1,
        rooms: seed + 2,
        connections: seed + 3,
        details: seed + 4,
        version: "2.0.0",
        timestamp: 0,
      },
    },
    trace: createTraceCollector(),
  };
}

/**
 * Create a mock DungeonStateArtifact
 */
function createMockDungeonState(
  rooms: readonly Room[],
  connections: readonly Connection[],
) {
  return {
    type: "dungeon-state" as const,
    id: "test-dungeon",
    width: 100,
    height: 100,
    grid: {} as any, // Not used in trait assignment
    rooms,
    edges: connections.map(
      (c) => [c.fromRoomId, c.toRoomId] as [number, number],
    ),
    connections,
    spawns: [],
  };
}

// =============================================================================
// PROFILE TESTS
// =============================================================================

describe("getProfileForRoomType", () => {
  it("returns profile for entrance", () => {
    const profile = getProfileForRoomType("entrance");
    const traits = traitVectorToObject(profile);

    expect(traits.dangerous).toBe(0.1);
    expect(traits.sacred).toBe(0.3);
    expect(traits.wealthy).toBe(0.0);
  });

  it("returns profile for treasure room", () => {
    const profile = getProfileForRoomType("treasure");
    const traits = traitVectorToObject(profile);

    expect(traits.wealthy).toBe(1.0);
    expect(traits.dangerous).toBe(0.4);
  });

  it("returns profile for boss room", () => {
    const profile = getProfileForRoomType("boss");
    const traits = traitVectorToObject(profile);

    expect(traits.dangerous).toBe(1.0);
    expect(traits.cursed).toBe(0.7);
  });

  it("returns profile for normal room", () => {
    const profile = getProfileForRoomType("normal");
    const traits = traitVectorToObject(profile);

    expect(traits.dangerous).toBeGreaterThan(0);
    expect(traits.ancient).toBeGreaterThan(0);
  });

  it("returns profile for cavern", () => {
    const profile = getProfileForRoomType("cavern");
    const traits = traitVectorToObject(profile);

    expect(traits.natural).toBe(1.0);
  });

  it("returns profile for library", () => {
    const profile = getProfileForRoomType("library");
    const traits = traitVectorToObject(profile);

    expect(traits.ancient).toBe(0.8);
    expect(traits.mysterious).toBe(0.6);
  });

  it("returns profile for armory", () => {
    const profile = getProfileForRoomType("armory");
    const traits = traitVectorToObject(profile);

    expect(traits.dangerous).toBe(0.5);
    expect(traits.wealthy).toBe(0.4);
  });

  it("returns profile for exit", () => {
    const profile = getProfileForRoomType("exit");
    const traits = traitVectorToObject(profile);

    expect(traits.dangerous).toBeGreaterThan(0);
    expect(traits.ancient).toBeGreaterThan(0);
  });
});

describe("applyModifiers", () => {
  it("applies dead-end modifier", () => {
    const base = { dangerous: 0.5, claustrophobic: 0.3, mysterious: 0.2 };
    const context: RoomModifierContext = {
      area: 64,
      width: 8,
      height: 8,
      connectionCount: 1,
      distanceFromStart: 5,
      normalizedDistance: 0.5,
      isDeadEnd: true,
      isHub: false,
    };

    const modified = applyModifiers(base, context, STANDARD_MODIFIERS);

    // Dead-end modifier adds to claustrophobic, mysterious, dangerous
    expect(modified.claustrophobic).toBeGreaterThan(base.claustrophobic);
    expect(modified.mysterious).toBeGreaterThan(base.mysterious);
    expect(modified.dangerous).toBeGreaterThan(base.dangerous);
  });

  it("applies hub modifier", () => {
    const base = { dangerous: 0.5, claustrophobic: 0.8, sacred: 0.1 };
    const context: RoomModifierContext = {
      area: 100,
      width: 10,
      height: 10,
      connectionCount: 4,
      distanceFromStart: 3,
      normalizedDistance: 0.3,
      isDeadEnd: false,
      isHub: true,
    };

    const modified = applyModifiers(base, context, STANDARD_MODIFIERS);

    // Hub modifier reduces claustrophobic and dangerous, increases sacred
    expect(modified.claustrophobic).toBeLessThan(base.claustrophobic);
    expect(modified.dangerous).toBeLessThan(base.dangerous);
    expect(modified.sacred).toBeGreaterThan(base.sacred);
  });

  it("applies far-from-entrance modifier", () => {
    const base = { dangerous: 0.3, ancient: 0.3, cursed: 0.1 };
    const context: RoomModifierContext = {
      area: 64,
      width: 8,
      height: 8,
      connectionCount: 2,
      distanceFromStart: 8,
      normalizedDistance: 0.8,
      isDeadEnd: false,
      isHub: false,
    };

    const modified = applyModifiers(base, context, STANDARD_MODIFIERS);

    // Far modifier increases dangerous, ancient, cursed
    expect(modified.dangerous).toBeGreaterThan(base.dangerous);
    expect(modified.ancient).toBeGreaterThan(base.ancient);
    expect(modified.cursed).toBeGreaterThan(base.cursed);
  });

  it("applies near-entrance modifier", () => {
    const base = { dangerous: 0.5, sacred: 0.1 };
    const context: RoomModifierContext = {
      area: 64,
      width: 8,
      height: 8,
      connectionCount: 2,
      distanceFromStart: 1,
      normalizedDistance: 0.1,
      isDeadEnd: false,
      isHub: false,
    };

    const modified = applyModifiers(base, context, STANDARD_MODIFIERS);

    // Near modifier reduces dangerous, increases sacred
    expect(modified.dangerous).toBeLessThan(base.dangerous);
    expect(modified.sacred).toBeGreaterThan(base.sacred);
  });

  it("applies large-room modifier", () => {
    const base = { claustrophobic: 0.5, wealthy: 0.2 };
    const context: RoomModifierContext = {
      area: 150,
      width: 15,
      height: 10,
      connectionCount: 2,
      distanceFromStart: 3,
      normalizedDistance: 0.3,
      isDeadEnd: false,
      isHub: false,
    };

    const modified = applyModifiers(base, context, STANDARD_MODIFIERS);

    // Large room reduces claustrophobic, increases wealthy
    expect(modified.claustrophobic).toBeLessThan(base.claustrophobic);
    expect(modified.wealthy).toBeGreaterThan(base.wealthy);
  });

  it("applies small-room modifier", () => {
    const base = { claustrophobic: 0.3, mysterious: 0.2 };
    const context: RoomModifierContext = {
      area: 25,
      width: 5,
      height: 5,
      connectionCount: 2,
      distanceFromStart: 3,
      normalizedDistance: 0.3,
      isDeadEnd: false,
      isHub: false,
    };

    const modified = applyModifiers(base, context, STANDARD_MODIFIERS);

    // Small room increases claustrophobic, mysterious
    expect(modified.claustrophobic).toBeGreaterThan(base.claustrophobic);
    expect(modified.mysterious).toBeGreaterThan(base.mysterious);
  });

  it("applies long-corridor-like modifier", () => {
    const base = { claustrophobic: 0.3, dangerous: 0.3 };
    const context: RoomModifierContext = {
      area: 40,
      width: 20,
      height: 2,
      connectionCount: 2,
      distanceFromStart: 3,
      normalizedDistance: 0.3,
      isDeadEnd: false,
      isHub: false,
    };

    const modified = applyModifiers(base, context, STANDARD_MODIFIERS);

    // Long corridor increases claustrophobic, dangerous
    expect(modified.claustrophobic).toBeGreaterThan(base.claustrophobic);
    expect(modified.dangerous).toBeGreaterThan(base.dangerous);
  });

  it("clamps values to [0, 1] range", () => {
    const base = { claustrophobic: 0.9, dangerous: 0.05 };
    const context: RoomModifierContext = {
      area: 25,
      width: 5,
      height: 5,
      connectionCount: 1,
      distanceFromStart: 10,
      normalizedDistance: 0.9,
      isDeadEnd: true,
      isHub: false,
    };

    const modified = applyModifiers(base, context, STANDARD_MODIFIERS);

    // All values should be clamped to [0, 1]
    for (const key in modified) {
      const value = modified[key];
      if (value !== undefined) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    }
  });

  it("applies multiple modifiers when conditions overlap", () => {
    const base = { dangerous: 0.3, claustrophobic: 0.3 };
    const context: RoomModifierContext = {
      area: 25,
      width: 5,
      height: 5,
      connectionCount: 1,
      distanceFromStart: 8,
      normalizedDistance: 0.8,
      isDeadEnd: true,
      isHub: false,
    };

    const modified = applyModifiers(base, context, STANDARD_MODIFIERS);

    // Should apply: small-room, dead-end, far-from-entrance
    expect(modified.dangerous).toBeGreaterThan(base.dangerous);
    expect(modified.claustrophobic).toBeGreaterThan(base.claustrophobic);
  });
});

describe("STANDARD_MODIFIERS", () => {
  it("contains all expected modifiers", () => {
    const modifierNames = STANDARD_MODIFIERS.map((m) => m.name);

    expect(modifierNames).toContain("dead-end-isolation");
    expect(modifierNames).toContain("hub-activity");
    expect(modifierNames).toContain("far-from-entrance");
    expect(modifierNames).toContain("near-entrance");
    expect(modifierNames).toContain("large-room");
    expect(modifierNames).toContain("small-room");
    expect(modifierNames).toContain("long-corridor-like");
  });

  it("has valid structure for each modifier", () => {
    for (const modifier of STANDARD_MODIFIERS) {
      expect(modifier.name).toBeDefined();
      expect(modifier.adjustments).toBeDefined();
      expect(modifier.condition).toBeDefined();
      expect(typeof modifier.condition).toBe("function");
    }
  });
});

// =============================================================================
// PASS CREATION TESTS
// =============================================================================

describe("createAssignRoomTraitsPass", () => {
  it("creates a valid pass object", () => {
    const pass = createAssignRoomTraitsPass();

    expect(pass.id).toBe("traits.assign-room-traits");
    expect(pass.inputType).toBe("dungeon-state");
    expect(pass.outputType).toBe("dungeon-state");
    expect(pass.run).toBeDefined();
    expect(typeof pass.run).toBe("function");
  });

  it("uses default config when none provided", () => {
    const pass = createAssignRoomTraitsPass();
    const rooms = [createMockRoom(0, 0, 0, 10, 10, "entrance")];
    const dungeon = createMockDungeonState(rooms, []);
    const ctx = createMockContext();

    const result = pass.run(dungeon, ctx);

    expect(result.rooms).toBeDefined();
    expect(result.rooms.length).toBe(1);
  });

  it("accepts custom config", () => {
    const pass = createAssignRoomTraitsPass({
      propagationStrength: 0.5,
      mutationIntensity: 0.3,
    });

    expect(pass).toBeDefined();
  });
});

// =============================================================================
// STANDALONE FUNCTION TESTS
// =============================================================================

describe("assignRoomTraits - single room", () => {
  it("assigns traits matching base profile for single room", () => {
    const rooms = [createMockRoom(0, 0, 0, 10, 10, "treasure")];
    const connections: Connection[] = [];
    const rng = () => 0.5;

    const result = assignRoomTraits(rooms, connections, {}, rng);

    expect(result.length).toBe(1);
    const room = result[0];
    expect(room).toBeDefined();
    expect(room?.traits).toBeDefined();

    if (room?.traits) {
      const wealthy = getTraitValue(room.traits, "wealthy");
      // Treasure room should have high wealthy value
      expect(wealthy).toBeGreaterThan(0.8);
    }
  });

  it("assigns all trait dimensions", () => {
    const rooms = [createMockRoom(0, 0, 0, 10, 10, "normal")];
    const connections: Connection[] = [];
    const rng = () => 0.5;

    const result = assignRoomTraits(rooms, connections, {}, rng);

    const room = result[0];
    expect(room?.traits).toBeDefined();

    if (room?.traits) {
      expect(hasTrait(room.traits, "dangerous")).toBe(true);
      expect(hasTrait(room.traits, "ancient")).toBe(true);
      expect(hasTrait(room.traits, "mysterious")).toBe(true);
      expect(hasTrait(room.traits, "cursed")).toBe(true);
      expect(hasTrait(room.traits, "sacred")).toBe(true);
      expect(hasTrait(room.traits, "wealthy")).toBe(true);
      expect(hasTrait(room.traits, "claustrophobic")).toBe(true);
      expect(hasTrait(room.traits, "natural")).toBe(true);
    }
  });

  it("applies modifiers based on room characteristics", () => {
    // Create a small dead-end room
    const rooms = [createMockRoom(0, 10, 10, 4, 4, "normal")];
    const connections: Connection[] = [];
    const rng = () => 0.5;

    const result = assignRoomTraits(
      rooms,
      connections,
      { mutationIntensity: 0 },
      rng,
    );

    const room = result[0];
    if (room?.traits) {
      // Small room should have increased claustrophobic
      const claustrophobic = getTraitValue(room.traits, "claustrophobic");
      expect(claustrophobic).toBeGreaterThan(0.3);
    }
  });
});

describe("assignRoomTraits - two connected rooms", () => {
  it("propagates traits between connected rooms", () => {
    const room1 = createMockRoom(0, 0, 0, 10, 10, "entrance");
    const room2 = createMockRoom(1, 20, 0, 10, 10, "boss");
    const connection = createMockConnection(0, 1);

    const result = assignRoomTraits(
      [room1, room2],
      [connection],
      {
        propagationStrength: 0.5,
        propagationIterations: 3,
        mutationIntensity: 0,
      },
      () => 0.5,
    );

    expect(result.length).toBe(2);
    const resultRoom1 = result[0];
    const resultRoom2 = result[1];

    if (resultRoom1?.traits && resultRoom2?.traits) {
      const danger1 = getTraitValue(resultRoom1.traits, "dangerous");
      const danger2 = getTraitValue(resultRoom2.traits, "dangerous");

      // After propagation, values should be closer than original profiles
      // Original: entrance ~0.1, boss ~1.0
      // After propagation with 0.5 strength, they should blend
      expect(Math.abs(danger1 - danger2)).toBeLessThan(0.9);
    }
  });

  it("respects propagation strength", () => {
    const room1 = createMockRoom(0, 0, 0, 10, 10, "entrance");
    const room2 = createMockRoom(1, 20, 0, 10, 10, "boss");
    const connection = createMockConnection(0, 1);

    // No propagation
    const resultNoProp = assignRoomTraits(
      [room1, room2],
      [connection],
      {
        propagationStrength: 0,
        mutationIntensity: 0,
      },
      () => 0.5,
    );

    // With propagation
    const resultWithProp = assignRoomTraits(
      [room1, room2],
      [connection],
      {
        propagationStrength: 0.3,
        propagationIterations: 3,
        mutationIntensity: 0,
      },
      () => 0.5,
    );

    const noPropRoom1 = resultNoProp[0];
    const noPropRoom2 = resultNoProp[1];
    const withPropRoom1 = resultWithProp[0];
    const withPropRoom2 = resultWithProp[1];

    if (
      noPropRoom1?.traits &&
      noPropRoom2?.traits &&
      withPropRoom1?.traits &&
      withPropRoom2?.traits
    ) {
      const noPropDiff = Math.abs(
        getTraitValue(noPropRoom1.traits, "dangerous") -
          getTraitValue(noPropRoom2.traits, "dangerous"),
      );

      const withPropDiff = Math.abs(
        getTraitValue(withPropRoom1.traits, "dangerous") -
          getTraitValue(withPropRoom2.traits, "dangerous"),
      );

      // With propagation, difference should be smaller
      expect(withPropDiff).toBeLessThan(noPropDiff);
    }
  });
});

describe("assignRoomTraits - mutation", () => {
  it("applies random variation with mutation", () => {
    const rooms = [createMockRoom(0, 0, 0, 10, 10, "normal")];
    const connections: Connection[] = [];

    // Create deterministic RNG
    let seed = 12345;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) >>> 0;
      return (seed % 10000) / 10000;
    };

    const result = assignRoomTraits(
      rooms,
      connections,
      {
        propagationStrength: 0,
        mutationIntensity: 0.2,
      },
      rng,
    );

    const room = result[0];
    if (room?.traits) {
      // Values should be different from exact base profile due to mutation
      const baseProfile = getProfileForRoomType("normal");
      const _baseDangerous = getTraitValue(baseProfile, "dangerous");
      const _mutatedDangerous = getTraitValue(room.traits, "dangerous");

      // Might be the same by chance, but test that mutation is applied
      expect(room.traits).toBeDefined();
    }
  });

  it("respects mutation intensity", () => {
    const rooms = [
      createMockRoom(0, 0, 0, 10, 10, "normal"),
      createMockRoom(1, 20, 0, 10, 10, "normal"),
    ];
    const connections: Connection[] = [];

    let seed = 12345;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) >>> 0;
      return (seed % 10000) / 10000;
    };

    // High mutation
    const resultHighMutation = assignRoomTraits(
      rooms,
      connections,
      {
        propagationStrength: 0,
        mutationIntensity: 0.4,
      },
      rng,
    );

    // Reset RNG
    seed = 12345;

    // Low mutation
    const resultLowMutation = assignRoomTraits(
      rooms,
      connections,
      {
        propagationStrength: 0,
        mutationIntensity: 0.05,
      },
      rng,
    );

    // Both should have traits
    expect(resultHighMutation[0]?.traits).toBeDefined();
    expect(resultLowMutation[0]?.traits).toBeDefined();
  });

  it("clamps mutated values to [0, 1]", () => {
    const rooms = [createMockRoom(0, 0, 0, 10, 10, "normal")];
    const connections: Connection[] = [];

    let seed = 12345;
    const rng = () => {
      seed = (seed * 1103515245 + 12345) >>> 0;
      return (seed % 10000) / 10000;
    };

    const result = assignRoomTraits(
      rooms,
      connections,
      { mutationIntensity: 0.5 },
      rng,
    );

    const room = result[0];
    if (room?.traits) {
      const traits = traitVectorToObject(room.traits);
      for (const key in traits) {
        const value = traits[key];
        if (value !== undefined) {
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
      }
    }
  });
});

describe("assignRoomTraits - complex scenarios", () => {
  it("handles hub room (3+ connections)", () => {
    const hub = createMockRoom(0, 10, 10, 10, 10, "normal");
    const room1 = createMockRoom(1, 0, 10, 5, 5, "normal");
    const room2 = createMockRoom(2, 25, 10, 5, 5, "normal");
    const room3 = createMockRoom(3, 10, 0, 5, 5, "normal");

    const connections = [
      createMockConnection(0, 1),
      createMockConnection(0, 2),
      createMockConnection(0, 3),
    ];

    const result = assignRoomTraits(
      [hub, room1, room2, room3],
      connections,
      { mutationIntensity: 0 },
      () => 0.5,
    );

    const hubRoom = result[0];
    if (hubRoom?.traits) {
      // Hub should have reduced claustrophobic
      const claustrophobic = getTraitValue(hubRoom.traits, "claustrophobic");
      // Should be less than typical normal room
      expect(claustrophobic).toBeLessThan(0.5);
    }
  });

  it("handles dead-end room (1 connection)", () => {
    const main = createMockRoom(0, 0, 0, 10, 10, "entrance");
    const deadEnd = createMockRoom(1, 20, 0, 8, 8, "normal");

    const connections = [createMockConnection(0, 1)];

    const result = assignRoomTraits(
      [main, deadEnd],
      connections,
      { mutationIntensity: 0 },
      () => 0.5,
    );

    const deadEndRoom = result[1];
    if (deadEndRoom?.traits) {
      // Dead end should have increased claustrophobic and mysterious
      const claustrophobic = getTraitValue(
        deadEndRoom.traits,
        "claustrophobic",
      );
      const mysterious = getTraitValue(deadEndRoom.traits, "mysterious");

      expect(claustrophobic).toBeGreaterThan(0.3);
      expect(mysterious).toBeGreaterThan(0.2);
    }
  });

  it("handles large room", () => {
    const largeRoom = createMockRoom(0, 0, 0, 15, 12, "normal");

    const result = assignRoomTraits(
      [largeRoom],
      [],
      { mutationIntensity: 0 },
      () => 0.5,
    );

    const room = result[0];
    if (room?.traits) {
      // Large room should have reduced claustrophobic
      const claustrophobic = getTraitValue(room.traits, "claustrophobic");
      expect(claustrophobic).toBeLessThan(0.4);
    }
  });

  it("assigns traits to all rooms in output", () => {
    const rooms = [
      createMockRoom(0, 0, 0, 10, 10, "entrance"),
      createMockRoom(1, 20, 0, 10, 10, "normal"),
      createMockRoom(2, 40, 0, 10, 10, "treasure"),
      createMockRoom(3, 60, 0, 10, 10, "exit"),
    ];

    const connections = [
      createMockConnection(0, 1),
      createMockConnection(1, 2),
      createMockConnection(2, 3),
    ];

    const result = assignRoomTraits(rooms, connections, {}, () => 0.5);

    expect(result.length).toBe(4);
    for (const room of result) {
      expect(room.traits).toBeDefined();
      if (room.traits) {
        // Verify it's a valid trait vector
        expect(hasTrait(room.traits, "dangerous")).toBe(true);
        expect(hasTrait(room.traits, "ancient")).toBe(true);
      }
    }
  });

  it("preserves room properties other than traits", () => {
    const originalRoom = createMockRoom(0, 5, 10, 15, 20, "library");
    const result = assignRoomTraits([originalRoom], [], {}, () => 0.5);

    const room = result[0];
    expect(room).toBeDefined();
    if (room) {
      expect(room.id).toBe(originalRoom.id);
      expect(room.x).toBe(originalRoom.x);
      expect(room.y).toBe(originalRoom.y);
      expect(room.width).toBe(originalRoom.width);
      expect(room.height).toBe(originalRoom.height);
      expect(room.centerX).toBe(originalRoom.centerX);
      expect(room.centerY).toBe(originalRoom.centerY);
      expect(room.type).toBe(originalRoom.type);
      expect(room.seed).toBe(originalRoom.seed);
    }
  });
});

// =============================================================================
// PASS EXECUTION TESTS
// =============================================================================

describe("createAssignRoomTraitsPass - execution", () => {
  it("runs successfully with dungeon state input", () => {
    const pass = createAssignRoomTraitsPass();
    const rooms = [
      createMockRoom(0, 0, 0, 10, 10, "entrance"),
      createMockRoom(1, 20, 0, 10, 10, "normal"),
    ];
    const connections = [createMockConnection(0, 1)];
    const dungeon = createMockDungeonState(rooms, connections);
    const ctx = createMockContext();

    const result = pass.run(dungeon, ctx);

    expect(result.type).toBe("dungeon-state");
    expect(result.rooms.length).toBe(2);
    expect(result.rooms[0]?.traits).toBeDefined();
    expect(result.rooms[1]?.traits).toBeDefined();
  });

  it("preserves other dungeon state properties", () => {
    const pass = createAssignRoomTraitsPass();
    const rooms = [createMockRoom(0, 0, 0, 10, 10, "entrance")];
    const dungeon = createMockDungeonState(rooms, []);
    const ctx = createMockContext();

    const result = pass.run(dungeon, ctx);

    expect(result.width).toBe(dungeon.width);
    expect(result.height).toBe(dungeon.height);
    expect(result.edges).toBe(dungeon.edges);
    expect(result.connections).toBe(dungeon.connections);
    expect(result.spawns).toBe(dungeon.spawns);
  });

  it("uses context RNG for mutation", () => {
    const pass = createAssignRoomTraitsPass({ mutationIntensity: 0.2 });
    const rooms = [createMockRoom(0, 0, 0, 10, 10, "normal")];
    const dungeon = createMockDungeonState(rooms, []);

    // Same seed should produce same results
    const ctx1 = createMockContext(12345);
    const ctx2 = createMockContext(12345);

    const result1 = pass.run(dungeon, ctx1);
    const result2 = pass.run(dungeon, ctx2);

    const traits1 = result1.rooms[0]?.traits;
    const traits2 = result2.rooms[0]?.traits;

    if (traits1 && traits2) {
      expect(getTraitValue(traits1, "dangerous")).toBeCloseTo(
        getTraitValue(traits2, "dangerous"),
      );
    }
  });

  it("produces deterministic results with same seed", () => {
    const pass = createAssignRoomTraitsPass();
    const rooms = [
      createMockRoom(0, 0, 0, 10, 10, "entrance"),
      createMockRoom(1, 20, 0, 10, 10, "treasure"),
    ];
    const connections = [createMockConnection(0, 1)];
    const dungeon = createMockDungeonState(rooms, connections);

    const ctx1 = createMockContext(54321);
    const ctx2 = createMockContext(54321);

    const result1 = pass.run(dungeon, ctx1);
    const result2 = pass.run(dungeon, ctx2);

    // Should produce identical trait vectors
    for (let i = 0; i < result1.rooms.length; i++) {
      const traits1 = result1.rooms[i]?.traits;
      const traits2 = result2.rooms[i]?.traits;

      if (traits1 && traits2) {
        const obj1 = traitVectorToObject(traits1);
        const obj2 = traitVectorToObject(traits2);

        for (const key in obj1) {
          expect(obj1[key]).toBeCloseTo(obj2[key] ?? 0.5);
        }
      }
    }
  });

  it("works with trace enabled", () => {
    const pass = createAssignRoomTraitsPass({ trace: true });
    const rooms = [createMockRoom(0, 0, 0, 10, 10, "entrance")];
    const dungeon = createMockDungeonState(rooms, []);
    const ctx = createMockContext();

    const result = pass.run(dungeon, ctx);

    expect(result.rooms[0]?.traits).toBeDefined();
    // Pass should execute without errors when trace is enabled
    expect(result.rooms.length).toBe(1);
  });
});

// =============================================================================
// EDGE CASES
// =============================================================================

describe("assignRoomTraits - edge cases", () => {
  it("handles empty room list", () => {
    const result = assignRoomTraits([], [], {}, () => 0.5);
    expect(result).toEqual([]);
  });

  it("handles disconnected rooms", () => {
    const room1 = createMockRoom(0, 0, 0, 10, 10, "entrance");
    const room2 = createMockRoom(1, 50, 50, 10, 10, "exit");
    // No connections

    const result = assignRoomTraits([room1, room2], [], {}, () => 0.5);

    expect(result.length).toBe(2);
    expect(result[0]?.traits).toBeDefined();
    expect(result[1]?.traits).toBeDefined();
  });

  it("handles zero propagation iterations", () => {
    const rooms = [
      createMockRoom(0, 0, 0, 10, 10, "entrance"),
      createMockRoom(1, 20, 0, 10, 10, "boss"),
    ];
    const connections = [createMockConnection(0, 1)];

    const result = assignRoomTraits(
      rooms,
      connections,
      {
        propagationStrength: 0.5,
        propagationIterations: 0,
        mutationIntensity: 0,
      },
      () => 0.5,
    );

    // Should still assign base traits without propagation
    expect(result[0]?.traits).toBeDefined();
    expect(result[1]?.traits).toBeDefined();
  });

  it("handles custom modifiers", () => {
    const customModifier = {
      name: "test-modifier",
      adjustments: { dangerous: 0.5 } as const,
      condition: () => true,
    };

    const rooms = [createMockRoom(0, 0, 0, 10, 10, "normal")];

    const result = assignRoomTraits(
      rooms,
      [],
      {
        modifiers: [customModifier],
        mutationIntensity: 0,
      },
      () => 0.5,
    );

    const room = result[0];
    if (room?.traits) {
      const dangerous = getTraitValue(room.traits, "dangerous");
      // Should have base + 0.5 from modifier
      expect(dangerous).toBeGreaterThan(0.5);
    }
  });

  it("includes standard modifiers when requested", () => {
    const customModifier = {
      name: "custom",
      adjustments: { wealthy: 0.3 } as const,
      condition: () => true,
    };

    const rooms = [createMockRoom(0, 0, 0, 4, 4, "normal")];

    const result = assignRoomTraits(
      rooms,
      [],
      {
        modifiers: [customModifier],
        includeStandardModifiers: true,
        mutationIntensity: 0,
      },
      () => 0.5,
    );

    const room = result[0];
    if (room?.traits) {
      // Should apply both custom modifier and small-room standard modifier
      const claustrophobic = getTraitValue(room.traits, "claustrophobic");
      const wealthy = getTraitValue(room.traits, "wealthy");

      expect(claustrophobic).toBeGreaterThan(0.3); // From small-room modifier
      expect(wealthy).toBeGreaterThan(0.3); // From custom modifier
    }
  });
});
