/**
 * POI System Tests
 *
 * Comprehensive tests for Points of Interest (POI) system including:
 * - POI definitions and metadata
 * - POI filtering functions
 * - POI rules and conditions
 * - POI spawner pass with pattern support
 */

import { describe, expect, it } from "bun:test";
import { Grid } from "../src/core/grid/grid";
import { CellType } from "../src/core/grid/types";
import {
  createAllPOIRules,
  createAltarRules,
  createBookshelfRules,
  createPillarRules,
  getPOIRulesByCategory,
} from "../src/passes/content/poi-rules";
import { createPOISpawnerPass } from "../src/passes/content/poi-spawner";
import {
  getPOIsByCategory,
  getPOIsByTag,
  getPOIsForRoomType,
  POI_DEFINITIONS,
  type POICategory,
} from "../src/passes/content/poi-types";
import type {
  Connection,
  DungeonStateArtifact,
  PassContext,
  Room,
  RoomType,
} from "../src/pipeline/types";

// =============================================================================
// MOCK HELPERS
// =============================================================================

/**
 * Create a mock pass context for testing
 */
function createMockContext(seed = 42): PassContext {
  // Simple seeded LCG RNG
  let s = seed;
  const rng = {
    next(): number {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    },
  };

  return {
    rng,
    streams: {
      layout: rng,
      rooms: rng,
      connections: rng,
      details: rng,
    },
    config: {
      width: 80,
      height: 60,
      seed: { numericValue: seed, stringValue: String(seed), timestamp: 0 },
      depth: 1,
      difficulty: 0.5,
    },
    trace: {
      enabled: false,
      start: () => {},
      end: () => {},
      decision: () => {},
      warning: () => {},
      artifact: () => {},
      getEvents: () => [],
      clear: () => {},
    },
    seed: { numericValue: seed, stringValue: String(seed), timestamp: 0 },
  } as unknown as PassContext;
}

/**
 * Create a mock dungeon state for testing
 */
function createMockDungeon(options: {
  rooms?: Room[];
  connections?: Connection[];
  width?: number;
  height?: number;
}): DungeonStateArtifact {
  const width = options.width ?? 80;
  const height = options.height ?? 60;
  const grid = new Grid(width, height, CellType.WALL);

  // Default rooms if not provided
  const rooms = options.rooms ?? [
    {
      id: 0,
      x: 5,
      y: 5,
      width: 10,
      height: 10,
      centerX: 10,
      centerY: 10,
      type: "entrance" as RoomType,
      seed: 0,
    },
    {
      id: 1,
      x: 20,
      y: 5,
      width: 10,
      height: 10,
      centerX: 25,
      centerY: 10,
      type: "normal" as RoomType,
      seed: 1,
    },
  ];

  // Default connections if not provided
  const connections = options.connections ?? [
    { fromRoomId: 0, toRoomId: 1, path: [] },
  ];

  // Carve rooms into grid
  for (const room of rooms) {
    for (let y = room.y; y < room.y + room.height; y++) {
      for (let x = room.x; x < room.x + room.width; x++) {
        if (grid.isInBounds(x, y)) {
          grid.set(x, y, CellType.FLOOR);
        }
      }
    }
  }

  return {
    type: "dungeon-state",
    id: "test",
    width,
    height,
    grid,
    rooms,
    edges: connections.map(
      (c) => [c.fromRoomId, c.toRoomId] as [number, number],
    ),
    connections,
    spawns: [],
  };
}

// =============================================================================
// POI DEFINITIONS TESTS
// =============================================================================

describe("POI_DEFINITIONS", () => {
  it("has valid structure for all POIs", () => {
    const pois = Object.values(POI_DEFINITIONS);
    expect(pois.length).toBeGreaterThan(0);

    for (const poi of pois) {
      // Required fields
      expect(poi.id).toBeDefined();
      expect(typeof poi.id).toBe("string");
      expect(poi.id.length).toBeGreaterThan(0);

      expect(poi.name).toBeDefined();
      expect(typeof poi.name).toBe("string");

      expect(poi.category).toBeDefined();
      expect(typeof poi.category).toBe("string");

      expect(typeof poi.blocking).toBe("boolean");

      expect(typeof poi.minRoomArea).toBe("number");
      expect(poi.minRoomArea).toBeGreaterThan(0);

      expect(Array.isArray(poi.compatibleRoomTypes)).toBe(true);
      expect(poi.compatibleRoomTypes.length).toBeGreaterThan(0);

      expect(Array.isArray(poi.tags)).toBe(true);

      expect(poi.size).toBeDefined();
      expect(typeof poi.size.width).toBe("number");
      expect(typeof poi.size.height).toBe("number");
      expect(poi.size.width).toBeGreaterThan(0);
      expect(poi.size.height).toBeGreaterThan(0);

      expect(typeof poi.edgePadding).toBe("number");
      expect(poi.edgePadding).toBeGreaterThanOrEqual(0);

      expect(typeof poi.minSpacing).toBe("number");
      expect(poi.minSpacing).toBeGreaterThan(0);

      expect(poi.placement).toBeDefined();
      expect(typeof poi.placement).toBe("string");
    }
  });

  it("has unique IDs", () => {
    const ids = Object.values(POI_DEFINITIONS).map((poi) => poi.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it("has valid category values", () => {
    const validCategories: POICategory[] = [
      "structural",
      "religious",
      "utility",
      "storage",
      "decorative",
      "natural",
    ];

    for (const poi of Object.values(POI_DEFINITIONS)) {
      expect(validCategories).toContain(poi.category);
    }
  });

  it("has valid placement values", () => {
    const validPlacements = [
      "center",
      "edges",
      "corners",
      "scattered",
      "symmetric",
    ];

    for (const poi of Object.values(POI_DEFINITIONS)) {
      expect(validPlacements).toContain(poi.placement);
    }
  });

  it("pillar has correct definition", () => {
    const pillar = POI_DEFINITIONS.pillar;
    expect(pillar).toBeDefined();
    expect(pillar?.id).toBe("pillar");
    expect(pillar?.name).toBe("Stone Pillar");
    expect(pillar?.category).toBe("structural");
    expect(pillar?.blocking).toBe(true);
    expect(pillar?.minRoomArea).toBe(64);
    expect(pillar?.tags).toContain("structural");
    expect(pillar?.tags).toContain("stone");
    expect(pillar?.placement).toBe("symmetric");
    expect(pillar?.pattern).toBeDefined();
    expect(pillar?.pattern?.type).toBe("grid");
  });

  it("altar has correct definition", () => {
    const altar = POI_DEFINITIONS.altar;
    expect(altar).toBeDefined();
    expect(altar?.id).toBe("altar");
    expect(altar?.name).toBe("Stone Altar");
    expect(altar?.category).toBe("religious");
    expect(altar?.blocking).toBe(false);
    expect(altar?.minRoomArea).toBe(49);
    expect(altar?.tags).toContain("religious");
    expect(altar?.tags).toContain("altar");
    expect(altar?.tags).toContain("interactive");
    expect(altar?.placement).toBe("center");
    expect(altar?.compatibleRoomTypes).toContain("treasure");
    expect(altar?.compatibleRoomTypes).toContain("boss");
  });

  it("bookshelf has minRoomWidth constraint", () => {
    const bookshelf = POI_DEFINITIONS.bookshelf;
    expect(bookshelf).toBeDefined();
    expect(bookshelf?.minRoomWidth).toBeDefined();
    expect(bookshelf?.minRoomWidth).toBe(5);
    expect(bookshelf?.category).toBe("storage");
    expect(bookshelf?.compatibleRoomTypes).toContain("library");
  });
});

// =============================================================================
// POI FILTERING TESTS
// =============================================================================

describe("getPOIsForRoomType", () => {
  it("returns POIs for normal rooms", () => {
    const pois = getPOIsForRoomType("normal");
    expect(pois.length).toBeGreaterThan(0);

    for (const poi of pois) {
      expect(poi.compatibleRoomTypes).toContain("normal");
    }
  });

  it("returns POIs for boss rooms", () => {
    const pois = getPOIsForRoomType("boss");
    expect(pois.length).toBeGreaterThan(0);

    for (const poi of pois) {
      expect(poi.compatibleRoomTypes).toContain("boss");
    }

    // Boss rooms should have altars available
    const altarAvailable = pois.some((poi) => poi.id === "altar");
    expect(altarAvailable).toBe(true);
  });

  it("returns POIs for treasure rooms", () => {
    const pois = getPOIsForRoomType("treasure");
    expect(pois.length).toBeGreaterThan(0);

    for (const poi of pois) {
      expect(poi.compatibleRoomTypes).toContain("treasure");
    }
  });

  it("returns POIs for cavern rooms", () => {
    const pois = getPOIsForRoomType("cavern");
    expect(pois.length).toBeGreaterThan(0);

    for (const poi of pois) {
      expect(poi.compatibleRoomTypes).toContain("cavern");
    }

    // Caverns should have mushrooms and stalagmites
    const hasMushrooms = pois.some((poi) => poi.id === "mushroom_cluster");
    const hasStalagmites = pois.some((poi) => poi.id === "stalagmite");
    expect(hasMushrooms).toBe(true);
    expect(hasStalagmites).toBe(true);
  });

  it("returns POIs for library rooms", () => {
    const pois = getPOIsForRoomType("library");
    expect(pois.length).toBeGreaterThan(0);

    // Libraries should have bookshelves
    const hasBookshelves = pois.some((poi) => poi.id === "bookshelf");
    expect(hasBookshelves).toBe(true);
  });

  it("returns empty array for invalid room type", () => {
    // @ts-expect-error - Testing invalid room type
    const pois = getPOIsForRoomType("invalid");
    expect(pois).toEqual([]);
  });
});

describe("getPOIsByCategory", () => {
  it("returns structural POIs", () => {
    const pois = getPOIsByCategory("structural");
    expect(pois.length).toBeGreaterThan(0);

    for (const poi of pois) {
      expect(poi.category).toBe("structural");
    }

    // Should include pillars and columns
    const ids = pois.map((p) => p.id);
    expect(ids).toContain("pillar");
    expect(ids).toContain("column");
  });

  it("returns religious POIs", () => {
    const pois = getPOIsByCategory("religious");
    expect(pois.length).toBeGreaterThan(0);

    for (const poi of pois) {
      expect(poi.category).toBe("religious");
    }

    // Should include altars and shrines
    const ids = pois.map((p) => p.id);
    expect(ids).toContain("altar");
    expect(ids).toContain("shrine");
  });

  it("returns utility POIs", () => {
    const pois = getPOIsByCategory("utility");
    expect(pois.length).toBeGreaterThan(0);

    for (const poi of pois) {
      expect(poi.category).toBe("utility");
    }

    // Should include fountains and wells
    const ids = pois.map((p) => p.id);
    expect(ids).toContain("fountain");
    expect(ids).toContain("well");
  });

  it("returns storage POIs", () => {
    const pois = getPOIsByCategory("storage");
    expect(pois.length).toBeGreaterThan(0);

    for (const poi of pois) {
      expect(poi.category).toBe("storage");
    }

    // Should include bookshelves and weapon racks
    const ids = pois.map((p) => p.id);
    expect(ids).toContain("bookshelf");
    expect(ids).toContain("weapon_rack");
  });

  it("returns decorative POIs", () => {
    const pois = getPOIsByCategory("decorative");
    expect(pois.length).toBeGreaterThan(0);

    for (const poi of pois) {
      expect(poi.category).toBe("decorative");
    }
  });

  it("returns empty array for non-existent category", () => {
    // @ts-expect-error - Testing invalid category
    const pois = getPOIsByCategory("invalid");
    expect(pois).toEqual([]);
  });
});

describe("getPOIsByTag", () => {
  it("returns POIs with 'interactive' tag", () => {
    const pois = getPOIsByTag("interactive");
    expect(pois.length).toBeGreaterThan(0);

    for (const poi of pois) {
      expect(poi.tags).toContain("interactive");
    }

    // Interactive should include altars, fountains, etc.
    const ids = pois.map((p) => p.id);
    expect(ids).toContain("altar");
    expect(ids).toContain("fountain");
  });

  it("returns POIs with 'stone' tag", () => {
    const pois = getPOIsByTag("stone");
    expect(pois.length).toBeGreaterThan(0);

    for (const poi of pois) {
      expect(poi.tags).toContain("stone");
    }
  });

  it("returns POIs with 'water' tag", () => {
    const pois = getPOIsByTag("water");
    expect(pois.length).toBeGreaterThan(0);

    for (const poi of pois) {
      expect(poi.tags).toContain("water");
    }

    // Water should include fountains and wells
    const ids = pois.map((p) => p.id);
    expect(ids).toContain("fountain");
    expect(ids).toContain("well");
  });

  it("returns POIs with 'light' tag", () => {
    const pois = getPOIsByTag("light");
    expect(pois.length).toBeGreaterThan(0);

    for (const poi of pois) {
      expect(poi.tags).toContain("light");
    }

    // Light should include braziers and mushrooms
    const ids = pois.map((p) => p.id);
    expect(ids).toContain("brazier");
    expect(ids).toContain("mushroom_cluster");
  });

  it("returns empty array for non-existent tag", () => {
    const pois = getPOIsByTag("nonexistent-tag");
    expect(pois).toEqual([]);
  });
});

// =============================================================================
// POI RULES TESTS
// =============================================================================

describe("createPillarRules", () => {
  it("returns valid ContentRule array", () => {
    const rules = createPillarRules();
    expect(Array.isArray(rules)).toBe(true);
    expect(rules.length).toBeGreaterThan(0);

    for (const rule of rules) {
      expect(rule.id).toBeDefined();
      expect(typeof rule.id).toBe("string");
      expect(typeof rule.priority).toBe("number");
      expect(rule.condition).toBeDefined();
      expect(rule.condition.type).toBeDefined();
      expect(rule.action).toBeDefined();
      expect(rule.action.type).toBe("spawn");
    }
  });

  it("has correct rule structure", () => {
    const rules = createPillarRules();
    const rule = rules[0];

    expect(rule).toBeDefined();
    expect(rule?.id).toBe("poi-pillars-large-rooms");
    expect(rule?.priority).toBe(50);
    expect(rule?.description).toBeDefined();
    expect(rule?.tags).toContain("structural");
    expect(rule?.action.type).toBe("spawn");
    expect(rule?.action.template).toBe("pillar");
  });

  it("uses proper Expression types in conditions", () => {
    const rules = createPillarRules();
    const rule = rules[0];

    expect(rule).toBeDefined();
    expect(rule?.condition).toBeDefined();
    expect(rule?.condition.type).toBe("op");

    // Should have && operator combining multiple conditions
    if (rule?.condition.type === "op") {
      expect(rule.condition.op).toBe("&&");
    }
  });
});

describe("createAltarRules", () => {
  it("returns valid ContentRule array", () => {
    const rules = createAltarRules();
    expect(Array.isArray(rules)).toBe(true);
    expect(rules.length).toBeGreaterThan(0);
  });

  it("has exclusive flag set", () => {
    const rules = createAltarRules();
    const rule = rules[0];

    expect(rule).toBeDefined();
    expect(rule?.exclusive).toBe(true);
  });

  it("targets treasure and boss rooms", () => {
    const rules = createAltarRules();
    const rule = rules[0];

    expect(rule).toBeDefined();
    expect(rule?.id).toBe("poi-altar-treasure");
    expect(rule?.action.template).toBe("altar");
    expect(rule?.tags).toContain("religious");
  });
});

describe("createAllPOIRules", () => {
  it("returns combined set of all rules", () => {
    const rules = createAllPOIRules();
    expect(Array.isArray(rules)).toBe(true);
    expect(rules.length).toBeGreaterThan(0);

    // Should include rules from all creators
    const ids = rules.map((r) => r.id);
    expect(ids).toContain("poi-pillars-large-rooms");
    expect(ids).toContain("poi-altar-treasure");
  });

  it("has unique rule IDs", () => {
    const rules = createAllPOIRules();
    const ids = rules.map((r) => r.id);
    const uniqueIds = new Set(ids);

    expect(uniqueIds.size).toBe(ids.length);
  });

  it("all rules have valid structure", () => {
    const rules = createAllPOIRules();

    for (const rule of rules) {
      expect(rule.id).toBeDefined();
      expect(typeof rule.id).toBe("string");
      expect(rule.id.length).toBeGreaterThan(0);

      expect(typeof rule.priority).toBe("number");

      expect(rule.condition).toBeDefined();
      expect(rule.condition.type).toBeDefined();

      expect(rule.action).toBeDefined();
      expect(rule.action.type).toBe("spawn");
      expect(rule.action.template).toBeDefined();
      expect(typeof rule.action.template).toBe("string");

      if (rule.tags) {
        expect(Array.isArray(rule.tags)).toBe(true);
      }
    }
  });

  it("all rules reference valid POI IDs", () => {
    const rules = createAllPOIRules();
    const validPOIIds = Object.keys(POI_DEFINITIONS);

    for (const rule of rules) {
      expect(validPOIIds).toContain(rule.action.template);
    }
  });
});

describe("getPOIRulesByCategory", () => {
  it("filters rules by category tag", () => {
    const structuralRules = getPOIRulesByCategory("structural");
    expect(structuralRules.length).toBeGreaterThan(0);

    for (const rule of structuralRules) {
      expect(rule.tags).toBeDefined();
      expect(rule.tags).toContain("structural");
    }
  });

  it("returns religious rules", () => {
    const religiousRules = getPOIRulesByCategory("religious");
    expect(religiousRules.length).toBeGreaterThan(0);

    for (const rule of religiousRules) {
      expect(rule.tags).toContain("religious");
    }
  });
});

// =============================================================================
// POI SPAWNER PASS TESTS
// =============================================================================

describe("createPOISpawnerPass", () => {
  it("creates a valid pass", () => {
    const pass = createPOISpawnerPass({ rules: [] });

    expect(pass).toBeDefined();
    expect(pass.id).toBe("content.poi-spawner");
    expect(pass.inputType).toBe("dungeon-state");
    expect(pass.outputType).toBe("dungeon-state");
    expect(typeof pass.run).toBe("function");
  });

  it("runs without errors on mock dungeon", () => {
    const pass = createPOISpawnerPass({ rules: [] });
    const dungeon = createMockDungeon({});
    const ctx = createMockContext();

    const result = pass.run(dungeon, ctx) as DungeonStateArtifact;

    expect(result).toBeDefined();
    expect(result.type).toBe("dungeon-state");
    expect(result.grid).toBe(dungeon.grid);
    expect(result.rooms).toBe(dungeon.rooms);
  });

  it("preserves dungeon state structure", () => {
    const pass = createPOISpawnerPass({ rules: [] });
    const dungeon = createMockDungeon({});
    const ctx = createMockContext();

    const result = pass.run(dungeon, ctx) as DungeonStateArtifact;

    expect(result.width).toBe(dungeon.width);
    expect(result.height).toBe(dungeon.height);
    expect(result.rooms).toBe(dungeon.rooms);
    expect(result.connections).toBe(dungeon.connections);
  });

  it("places POIs based on rules", () => {
    const rules = createPillarRules();
    const pass = createPOISpawnerPass({ rules });

    // Create large room to trigger pillar rule
    const rooms: Room[] = [
      {
        id: 0,
        x: 10,
        y: 10,
        width: 20,
        height: 20,
        centerX: 20,
        centerY: 20,
        type: "normal",
        seed: 0,
      },
    ];

    const dungeon = createMockDungeon({ rooms, connections: [] });
    const ctx = createMockContext();

    const result = pass.run(dungeon, ctx) as DungeonStateArtifact;

    expect(result.spawns.length).toBeGreaterThan(0);

    // Check that spawns are POIs
    for (const spawn of result.spawns) {
      expect(spawn.tags).toContain("poi");
    }
  });

  it("respects minRoomWidth constraint", () => {
    const rules = createBookshelfRules();
    const pass = createPOISpawnerPass({ rules });

    // Create library room that's too narrow
    const narrowRoom: Room = {
      id: 0,
      x: 10,
      y: 10,
      width: 4, // Too narrow (bookshelf requires minRoomWidth: 5)
      height: 10,
      centerX: 12,
      centerY: 15,
      type: "library",
      seed: 0,
    };

    // Create library room that's wide enough
    const wideRoom: Room = {
      id: 1,
      x: 30,
      y: 10,
      width: 10, // Wide enough
      height: 10,
      centerX: 35,
      centerY: 15,
      type: "library",
      seed: 1,
    };

    const dungeon = createMockDungeon({
      rooms: [narrowRoom, wideRoom],
      connections: [],
    });
    const ctx = createMockContext();

    const result = pass.run(dungeon, ctx) as DungeonStateArtifact;

    // Should only spawn in wide room
    const spawnRoomIds = result.spawns.map((s) => s.roomId);
    expect(spawnRoomIds).not.toContain(0); // Narrow room
    expect(spawnRoomIds).toContain(1); // Wide room
  });

  it("respects minRoomHeight constraint", () => {
    const rules = createPillarRules();
    const pass = createPOISpawnerPass({ rules });

    // Create rooms with different heights
    const shortRoom: Room = {
      id: 0,
      x: 10,
      y: 10,
      width: 20,
      height: 4, // Short room
      centerX: 20,
      centerY: 12,
      type: "normal",
      seed: 0,
    };

    const tallRoom: Room = {
      id: 1,
      x: 10,
      y: 30,
      width: 20,
      height: 15, // Tall enough
      centerX: 20,
      centerY: 37,
      type: "normal",
      seed: 1,
    };

    const dungeon = createMockDungeon({
      rooms: [shortRoom, tallRoom],
      connections: [],
    });
    const ctx = createMockContext();

    const result = pass.run(dungeon, ctx) as DungeonStateArtifact;

    // Tall room should have more or equal spawns than short room
    const shortRoomSpawns = result.spawns.filter((s) => s.roomId === 0);
    const tallRoomSpawns = result.spawns.filter((s) => s.roomId === 1);
    expect(tallRoomSpawns.length).toBeGreaterThanOrEqual(
      shortRoomSpawns.length,
    );
  });

  it("prevents duplicates with exclusive rules", () => {
    const rules = createAltarRules();
    const pass = createPOISpawnerPass({ rules });

    // Create large treasure room that would normally trigger multiple altars
    const room: Room = {
      id: 0,
      x: 10,
      y: 10,
      width: 20,
      height: 20,
      centerX: 20,
      centerY: 20,
      type: "treasure",
      seed: 0,
    };

    const dungeon = createMockDungeon({ rooms: [room], connections: [] });
    const ctx = createMockContext();

    const result = pass.run(dungeon, ctx) as DungeonStateArtifact;

    // Should only place one altar due to exclusive flag
    const altarSpawns = result.spawns.filter((s) => s.tags.includes("altar"));
    expect(altarSpawns.length).toBeLessThanOrEqual(1);
  });

  it("places spawns on valid floor tiles", () => {
    const rules = createPillarRules();
    const pass = createPOISpawnerPass({ rules });

    const rooms: Room[] = [
      {
        id: 0,
        x: 10,
        y: 10,
        width: 15,
        height: 15,
        centerX: 17,
        centerY: 17,
        type: "normal",
        seed: 0,
      },
    ];

    const dungeon = createMockDungeon({ rooms, connections: [] });
    const ctx = createMockContext();

    const result = pass.run(dungeon, ctx) as DungeonStateArtifact;

    // All spawns should be on floor tiles
    for (const spawn of result.spawns) {
      const cell = dungeon.grid.get(spawn.position.x, spawn.position.y);
      expect(cell).toBe(CellType.FLOOR);
    }
  });

  it("respects edge padding from POI definition", () => {
    const rules = createPillarRules(); // Pillars have edgePadding: 2
    const pass = createPOISpawnerPass({ rules });

    const room: Room = {
      id: 0,
      x: 10,
      y: 10,
      width: 15,
      height: 15,
      centerX: 17,
      centerY: 17,
      type: "normal",
      seed: 0,
    };

    const dungeon = createMockDungeon({ rooms: [room], connections: [] });
    const ctx = createMockContext();

    const result = pass.run(dungeon, ctx) as DungeonStateArtifact;

    // Pillars should respect 2-tile edge padding
    for (const spawn of result.spawns) {
      if (spawn.tags.includes("pillar")) {
        expect(spawn.position.x).toBeGreaterThanOrEqual(room.x + 2);
        expect(spawn.position.x).toBeLessThanOrEqual(room.x + room.width - 3);
        expect(spawn.position.y).toBeGreaterThanOrEqual(room.y + 2);
        expect(spawn.position.y).toBeLessThanOrEqual(room.y + room.height - 3);
      }
    }
  });

  it("uses pattern placement when enabled", () => {
    const rules = createPillarRules(); // Pillars have grid pattern
    const pass = createPOISpawnerPass({ rules, usePatterns: true });

    const room: Room = {
      id: 0,
      x: 10,
      y: 10,
      width: 20,
      height: 20,
      centerX: 20,
      centerY: 20,
      type: "normal",
      seed: 0,
    };

    const dungeon = createMockDungeon({ rooms: [room], connections: [] });
    const ctx = createMockContext();

    const result = pass.run(dungeon, ctx) as DungeonStateArtifact;

    // Should have multiple pillars in a pattern
    const pillarSpawns = result.spawns.filter((s) => s.tags.includes("pillar"));
    expect(pillarSpawns.length).toBeGreaterThan(1);
  });

  it("can disable pattern placement", () => {
    const rules = createPillarRules();
    const pass = createPOISpawnerPass({ rules, usePatterns: false });

    const room: Room = {
      id: 0,
      x: 10,
      y: 10,
      width: 20,
      height: 20,
      centerX: 20,
      centerY: 20,
      type: "normal",
      seed: 0,
    };

    const dungeon = createMockDungeon({ rooms: [room], connections: [] });
    const ctx = createMockContext();

    const result = pass.run(dungeon, ctx) as DungeonStateArtifact;

    // Result should be valid (just different placement)
    expect(result).toBeDefined();
    expect(result.spawns).toBeDefined();
  });

  it("preserves existing spawns", () => {
    const rules = createPillarRules();
    const pass = createPOISpawnerPass({ rules });

    const room: Room = {
      id: 0,
      x: 10,
      y: 10,
      width: 15,
      height: 15,
      centerX: 17,
      centerY: 17,
      type: "normal",
      seed: 0,
    };

    const dungeon = createMockDungeon({ rooms: [room], connections: [] });

    // Add existing spawn
    const existingSpawn = {
      position: { x: 17, y: 17 },
      roomId: 0,
      type: "entrance" as const,
      tags: ["entrance"],
      weight: 1,
      distanceFromStart: 0,
    };

    const dungeonWithSpawns = {
      ...dungeon,
      spawns: [existingSpawn],
    };

    const ctx = createMockContext();
    const result = pass.run(dungeonWithSpawns, ctx) as DungeonStateArtifact;

    // Should preserve existing spawn
    expect(result.spawns).toContain(existingSpawn);
    expect(result.spawns.length).toBeGreaterThan(1);
  });
});

// =============================================================================
// INTEGRATION TESTS
// =============================================================================

describe("POI system integration", () => {
  it("generates complete POI set for varied dungeon", () => {
    const rules = createAllPOIRules();
    const pass = createPOISpawnerPass({ rules });

    const rooms: Room[] = [
      {
        id: 0,
        x: 5,
        y: 5,
        width: 12,
        height: 12,
        centerX: 11,
        centerY: 11,
        type: "entrance",
        seed: 0,
      },
      {
        id: 1,
        x: 25,
        y: 5,
        width: 15,
        height: 15,
        centerX: 32,
        centerY: 12,
        type: "normal",
        seed: 1,
      },
      {
        id: 2,
        x: 45,
        y: 5,
        width: 12,
        height: 12,
        centerX: 51,
        centerY: 11,
        type: "treasure",
        seed: 2,
      },
      {
        id: 3,
        x: 25,
        y: 25,
        width: 10,
        height: 10,
        centerX: 30,
        centerY: 30,
        type: "library",
        seed: 3,
      },
      {
        id: 4,
        x: 45,
        y: 25,
        width: 18,
        height: 18,
        centerX: 54,
        centerY: 34,
        type: "boss",
        seed: 4,
      },
    ];

    const connections: Connection[] = [
      { fromRoomId: 0, toRoomId: 1, path: [] },
      { fromRoomId: 1, toRoomId: 2, path: [] },
      { fromRoomId: 1, toRoomId: 3, path: [] },
      { fromRoomId: 2, toRoomId: 4, path: [] },
    ];

    const dungeon = createMockDungeon({
      rooms,
      connections,
      width: 100,
      height: 80,
    });
    const ctx = createMockContext();

    const result = pass.run(dungeon, ctx) as DungeonStateArtifact;

    // Should have placed various POIs
    expect(result.spawns.length).toBeGreaterThan(0);

    // Check that different POI types were placed
    const poiTypes = new Set(
      result.spawns
        .filter((s) => s.tags.includes("poi"))
        .map((s) => s.tags.find((t) => t !== "poi")),
    );
    expect(poiTypes.size).toBeGreaterThan(1);
  });

  it("deterministic placement with same seed", () => {
    const rules = createAllPOIRules();
    const pass = createPOISpawnerPass({ rules });

    const rooms: Room[] = [
      {
        id: 0,
        x: 10,
        y: 10,
        width: 20,
        height: 20,
        centerX: 20,
        centerY: 20,
        type: "normal",
        seed: 0,
      },
    ];

    const dungeon1 = createMockDungeon({ rooms, connections: [] });
    const dungeon2 = createMockDungeon({ rooms, connections: [] });

    const ctx1 = createMockContext(12345);
    const ctx2 = createMockContext(12345);

    const result1 = pass.run(dungeon1, ctx1) as DungeonStateArtifact;
    const result2 = pass.run(dungeon2, ctx2) as DungeonStateArtifact;

    // Same seed should produce same results
    expect(result1.spawns.length).toBe(result2.spawns.length);

    for (let i = 0; i < result1.spawns.length; i++) {
      const spawn1 = result1.spawns[i];
      const spawn2 = result2.spawns[i];
      expect(spawn1?.position.x).toBe(spawn2?.position.x);
      expect(spawn1?.position.y).toBe(spawn2?.position.y);
      expect(spawn1?.tags).toEqual(spawn2?.tags);
    }
  });
});
