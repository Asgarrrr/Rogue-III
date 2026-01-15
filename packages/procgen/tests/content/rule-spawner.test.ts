/**
 * Rule-Based Spawner Tests
 */

import { describe, expect, it } from "bun:test";
import { Grid } from "../../src/core/grid/grid";
import { CellType } from "../../src/core/grid/types";
import {
  createRuleSpawner,
  createSpawnRule,
  createStandardRules,
  serializeRules,
} from "../../src/passes/content/rule-based-spawner";
import type {
  Connection,
  DungeonStateArtifact,
  PassContext,
  Room,
} from "../../src/pipeline/types";

// Create a mock pass context
function createMockContext(seed: number = 42): PassContext {
  // Simple seeded RNG
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

// Create a mock dungeon state
function createMockDungeon(options: {
  rooms?: Room[];
  connections?: Connection[];
}): DungeonStateArtifact {
  const grid = new Grid(80, 60, CellType.WALL);

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
      type: "entrance",
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
      type: "normal",
      seed: 1,
    },
    {
      id: 2,
      x: 35,
      y: 5,
      width: 10,
      height: 10,
      centerX: 40,
      centerY: 10,
      type: "normal",
      seed: 2,
    },
    {
      id: 3,
      x: 50,
      y: 5,
      width: 10,
      height: 10,
      centerX: 55,
      centerY: 10,
      type: "exit",
      seed: 3,
    },
  ];

  // Default connections if not provided
  const connections = options.connections ?? [
    { fromRoomId: 0, toRoomId: 1, path: [] },
    { fromRoomId: 1, toRoomId: 2, path: [] },
    { fromRoomId: 2, toRoomId: 3, path: [] },
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
    width: 80,
    height: 60,
    grid,
    rooms,
    edges: connections.map(
      (c) => [c.fromRoomId, c.toRoomId] as [number, number],
    ),
    connections,
    spawns: [],
  };
}

describe("createRuleSpawner", () => {
  it("creates spawner pass with correct id", () => {
    const spawner = createRuleSpawner({ rules: "[]" });
    expect(spawner.id).toBe("content.rule-spawner");
    expect(spawner.inputType).toBe("dungeon-state");
    expect(spawner.outputType).toBe("dungeon-state");
  });

  it("processes empty rules without adding spawns", () => {
    const spawner = createRuleSpawner({ rules: "[]" });
    const dungeon = createMockDungeon({});
    const ctx = createMockContext();

    const result = spawner.run(dungeon, ctx) as DungeonStateArtifact;

    expect(result.spawns).toHaveLength(0);
  });

  it("spawns entities based on simple rule", () => {
    const rules = JSON.stringify([
      {
        id: "always-spawn",
        priority: 100,
        condition: { type: "literal", value: true },
        action: {
          type: "spawn",
          template: "test_entity",
          count: 1,
          tags: ["test"],
        },
      },
    ]);

    const spawner = createRuleSpawner({ rules });
    const dungeon = createMockDungeon({});
    const ctx = createMockContext();

    const result = spawner.run(dungeon, ctx) as DungeonStateArtifact;

    // Should spawn 1 entity per room (4 rooms)
    expect(result.spawns).toHaveLength(4);
  });

  it("respects room type filters", () => {
    const rules = JSON.stringify([
      {
        id: "normal-only",
        priority: 100,
        condition: { type: "literal", value: true },
        action: {
          type: "spawn",
          template: "normal_entity",
          count: 1,
          tags: ["test"],
          roomTypes: ["normal"],
        },
      },
    ]);

    const spawner = createRuleSpawner({ rules });
    const dungeon = createMockDungeon({});
    const ctx = createMockContext();

    const result = spawner.run(dungeon, ctx) as DungeonStateArtifact;

    // Only 2 normal rooms
    expect(result.spawns).toHaveLength(2);
    for (const spawn of result.spawns) {
      const room = dungeon.rooms.find((r) => r.id === spawn.roomId);
      expect(room?.type).toBe("normal");
    }
  });

  it("excludes specified room types", () => {
    const rules = JSON.stringify([
      {
        id: "not-entrance-exit",
        priority: 100,
        condition: { type: "literal", value: true },
        action: {
          type: "spawn",
          template: "test_entity",
          count: 1,
          tags: ["test"],
          excludeRoomTypes: ["entrance", "exit"],
        },
      },
    ]);

    const spawner = createRuleSpawner({ rules });
    const dungeon = createMockDungeon({});
    const ctx = createMockContext();

    const result = spawner.run(dungeon, ctx) as DungeonStateArtifact;

    // Only 2 normal rooms (entrance and exit excluded)
    expect(result.spawns).toHaveLength(2);
  });

  it("evaluates field-based conditions", () => {
    const rules = JSON.stringify([
      {
        id: "dead-end-only",
        priority: 100,
        condition: { type: "field", path: "room.isDeadEnd" },
        action: {
          type: "spawn",
          template: "treasure",
          count: 1,
          tags: ["loot"],
        },
      },
    ]);

    const spawner = createRuleSpawner({ rules });

    // Create dungeon with a dead-end room
    const rooms: Room[] = [
      {
        id: 0,
        x: 5,
        y: 5,
        width: 10,
        height: 10,
        centerX: 10,
        centerY: 10,
        type: "entrance",
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
        type: "normal",
        seed: 1,
      },
      {
        id: 2,
        x: 35,
        y: 5,
        width: 10,
        height: 10,
        centerX: 40,
        centerY: 10,
        type: "treasure",
        seed: 2,
      },
    ];

    // Room 0 and 2 are dead ends (1 connection each), room 1 is a hub
    const connections: Connection[] = [
      { fromRoomId: 0, toRoomId: 1, path: [] },
      { fromRoomId: 1, toRoomId: 2, path: [] },
    ];

    const dungeon = createMockDungeon({ rooms, connections });
    const ctx = createMockContext();

    const result = spawner.run(dungeon, ctx) as DungeonStateArtifact;

    // Rooms 0 and 2 are dead ends
    expect(result.spawns).toHaveLength(2);
    const spawnRoomIds = result.spawns.map((s) => s.roomId);
    expect(spawnRoomIds).toContain(0);
    expect(spawnRoomIds).toContain(2);
  });

  it("evaluates distance-based conditions", () => {
    const rules = JSON.stringify([
      {
        id: "far-rooms-only",
        priority: 100,
        condition: {
          type: "op",
          op: ">",
          left: { type: "field", path: "room.normalizedDistance" },
          right: { type: "literal", value: 0.5 },
        },
        action: {
          type: "spawn",
          template: "far_entity",
          count: 1,
          tags: ["test"],
        },
      },
    ]);

    const spawner = createRuleSpawner({ rules });
    const dungeon = createMockDungeon({});
    const ctx = createMockContext();

    const result = spawner.run(dungeon, ctx) as DungeonStateArtifact;

    // Rooms 2 and 3 are far (distance > 0.5 normalized)
    // Distance from entrance: 0=0, 1=1, 2=2, 3=3
    // Normalized: 0=0, 1=0.33, 2=0.67, 3=1.0
    expect(result.spawns).toHaveLength(2);
  });

  it("spawns multiple entities per room", () => {
    const rules = JSON.stringify([
      {
        id: "multiple-spawns",
        priority: 100,
        condition: { type: "literal", value: true },
        action: {
          type: "spawn",
          template: "test_entity",
          count: 3,
          tags: ["test"],
        },
      },
    ]);

    const spawner = createRuleSpawner({ rules });
    const dungeon = createMockDungeon({});
    const ctx = createMockContext();

    const result = spawner.run(dungeon, ctx) as DungeonStateArtifact;

    // 3 entities * 4 rooms = 12 spawns
    expect(result.spawns).toHaveLength(12);
  });

  it("preserves existing spawns", () => {
    const rules = JSON.stringify([
      {
        id: "add-spawns",
        priority: 100,
        condition: { type: "literal", value: true },
        action: {
          type: "spawn",
          template: "new_entity",
          count: 1,
          tags: ["new"],
        },
      },
    ]);

    const spawner = createRuleSpawner({ rules });
    const dungeon = createMockDungeon({});

    // Add existing spawns
    const dungeonWithSpawns = {
      ...dungeon,
      spawns: [
        {
          position: { x: 10, y: 10 },
          roomId: 0,
          type: "entrance" as const,
          tags: ["entrance"],
          weight: 1,
          distanceFromStart: 0,
        },
        {
          position: { x: 55, y: 10 },
          roomId: 3,
          type: "exit" as const,
          tags: ["exit"],
          weight: 1,
          distanceFromStart: 3,
        },
      ],
    };

    const ctx = createMockContext();
    const result = spawner.run(dungeonWithSpawns, ctx) as DungeonStateArtifact;

    // 2 existing + 4 new = 6 spawns
    expect(result.spawns).toHaveLength(6);
    expect(result.spawns[0]?.type).toBe("entrance");
    expect(result.spawns[1]?.type).toBe("exit");
  });

  it("respects distance filters in action", () => {
    const rules = JSON.stringify([
      {
        id: "mid-distance",
        priority: 100,
        condition: { type: "literal", value: true },
        action: {
          type: "spawn",
          template: "mid_entity",
          count: 1,
          tags: ["test"],
          minDistanceFromStart: 1,
          maxDistanceFromStart: 2,
        },
      },
    ]);

    const spawner = createRuleSpawner({ rules });
    const dungeon = createMockDungeon({});
    const ctx = createMockContext();

    const result = spawner.run(dungeon, ctx) as DungeonStateArtifact;

    // Only rooms 1 and 2 (distance 1 and 2)
    expect(result.spawns).toHaveLength(2);
    const spawnRoomIds = result.spawns.map((s) => s.roomId);
    expect(spawnRoomIds).toContain(1);
    expect(spawnRoomIds).toContain(2);
  });
});

describe("createSpawnRule", () => {
  it("creates rule with required fields", () => {
    const rule = createSpawnRule(
      "test-rule",
      100,
      { type: "literal", value: true },
      { type: "spawn", template: "entity", count: 1, tags: ["test"] },
    );

    expect(rule.id).toBe("test-rule");
    expect(rule.priority).toBe(100);
    expect(rule.condition.type).toBe("literal");
    expect(rule.action.type).toBe("spawn");
  });

  it("includes optional fields", () => {
    const rule = createSpawnRule(
      "test-rule",
      100,
      { type: "literal", value: true },
      { type: "spawn", template: "entity", count: 1, tags: ["test"] },
      { description: "Test rule", tags: ["combat"], exclusive: true },
    );

    expect(rule.description).toBe("Test rule");
    expect(rule.tags).toContain("combat");
    expect(rule.exclusive).toBe(true);
  });
});

describe("createStandardRules", () => {
  it("creates standard rule set", () => {
    const rules = createStandardRules();

    expect(rules.length).toBeGreaterThan(0);

    // Check for expected rules
    const ruleIds = rules.map((r) => r.id);
    expect(ruleIds).toContain("enemies-scale-distance");
    expect(ruleIds).toContain("treasure-dead-ends");
    expect(ruleIds).toContain("healing-hubs");
    expect(ruleIds).toContain("boss-spawn");
  });

  it("standard rules are valid JSON", () => {
    const rules = createStandardRules();
    const json = serializeRules(rules);

    // Should parse without error
    const parsed = JSON.parse(json);
    expect(parsed).toHaveLength(rules.length);
  });

  it("standard rules work with spawner", () => {
    const rules = createStandardRules();
    const spawner = createRuleSpawner({ rules: serializeRules(rules) });

    // Create dungeon with various room types
    const rooms: Room[] = [
      {
        id: 0,
        x: 5,
        y: 5,
        width: 10,
        height: 10,
        centerX: 10,
        centerY: 10,
        type: "entrance",
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
        type: "normal",
        seed: 1,
      },
      {
        id: 2,
        x: 35,
        y: 5,
        width: 10,
        height: 10,
        centerX: 40,
        centerY: 10,
        type: "normal",
        seed: 2,
      },
      {
        id: 3,
        x: 50,
        y: 5,
        width: 10,
        height: 10,
        centerX: 55,
        centerY: 10,
        type: "boss",
        seed: 3,
      },
      {
        id: 4,
        x: 50,
        y: 20,
        width: 10,
        height: 10,
        centerX: 55,
        centerY: 25,
        type: "exit",
        seed: 4,
      },
    ];

    const connections: Connection[] = [
      { fromRoomId: 0, toRoomId: 1, path: [] },
      { fromRoomId: 1, toRoomId: 2, path: [] },
      { fromRoomId: 2, toRoomId: 3, path: [] },
      { fromRoomId: 3, toRoomId: 4, path: [] },
    ];

    const dungeon = createMockDungeon({ rooms, connections });
    const ctx = createMockContext();

    const result = spawner.run(dungeon, ctx) as DungeonStateArtifact;

    // Should have spawned something
    expect(result.spawns.length).toBeGreaterThan(0);

    // Check boss was spawned in boss room
    const bossSpawns = result.spawns.filter(
      (s) => s.tags.includes("boss") && s.roomId === 3,
    );
    expect(bossSpawns).toHaveLength(1);
  });
});

describe("serializeRules", () => {
  it("produces valid JSON", () => {
    const rules = createStandardRules();
    const json = serializeRules(rules);

    // Should parse without error
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("preserves rule structure", () => {
    const rules = [
      createSpawnRule(
        "test-rule",
        50,
        { type: "literal", value: true },
        { type: "spawn", template: "entity", count: 2, tags: ["a", "b"] },
        { description: "Test" },
      ),
    ];

    const json = serializeRules(rules);
    const parsed = JSON.parse(json);

    expect(parsed[0].id).toBe("test-rule");
    expect(parsed[0].priority).toBe(50);
    expect(parsed[0].action.count).toBe(2);
    expect(parsed[0].action.tags).toContain("a");
  });
});

describe("spawn placement", () => {
  it("places spawns on floor tiles", () => {
    const rules = JSON.stringify([
      {
        id: "spawn-test",
        priority: 100,
        condition: { type: "literal", value: true },
        action: {
          type: "spawn",
          template: "test_entity",
          count: 5,
          tags: ["test"],
        },
      },
    ]);

    const spawner = createRuleSpawner({
      rules,
      placement: { requireFloor: true },
    });
    const dungeon = createMockDungeon({});
    const ctx = createMockContext();

    const result = spawner.run(dungeon, ctx) as DungeonStateArtifact;

    // All spawns should be on floor
    for (const spawn of result.spawns) {
      const cell = dungeon.grid.get(spawn.position.x, spawn.position.y);
      expect(cell).toBe(CellType.FLOOR);
    }
  });

  it("respects edge padding", () => {
    const rules = JSON.stringify([
      {
        id: "spawn-test",
        priority: 100,
        condition: { type: "literal", value: true },
        action: {
          type: "spawn",
          template: "test_entity",
          count: 10,
          tags: ["test"],
        },
      },
    ]);

    const spawner = createRuleSpawner({
      rules,
      placement: { avoidEdges: true, edgePadding: 2 },
    });

    const rooms: Room[] = [
      {
        id: 0,
        x: 5,
        y: 5,
        width: 10,
        height: 10,
        centerX: 10,
        centerY: 10,
        type: "normal",
        seed: 0,
      },
    ];

    const dungeon = createMockDungeon({ rooms, connections: [] });
    const ctx = createMockContext();

    const result = spawner.run(dungeon, ctx) as DungeonStateArtifact;

    // All spawns should be at least 2 tiles from room edges
    const room = rooms[0]!;
    for (const spawn of result.spawns) {
      expect(spawn.position.x).toBeGreaterThanOrEqual(room.x + 2);
      expect(spawn.position.x).toBeLessThanOrEqual(room.x + room.width - 3);
      expect(spawn.position.y).toBeGreaterThanOrEqual(room.y + 2);
      expect(spawn.position.y).toBeLessThanOrEqual(room.y + room.height - 3);
    }
  });
});

describe("expression evaluation in count", () => {
  it("evaluates expression for spawn count", () => {
    const rules = JSON.stringify([
      {
        id: "dynamic-count",
        priority: 100,
        condition: { type: "literal", value: true },
        action: {
          type: "spawn",
          template: "test_entity",
          count: {
            type: "fn",
            name: "floor",
            args: [
              {
                type: "op",
                op: "+",
                left: { type: "literal", value: 1 },
                right: {
                  type: "op",
                  op: "*",
                  left: { type: "field", path: "room.normalizedDistance" },
                  right: { type: "literal", value: 2 },
                },
              },
            ],
          },
          tags: ["test"],
        },
      },
    ]);

    const spawner = createRuleSpawner({ rules });
    const dungeon = createMockDungeon({});
    const ctx = createMockContext();

    const result = spawner.run(dungeon, ctx) as DungeonStateArtifact;

    // Room 0: floor(1 + 0*2) = 1
    // Room 1: floor(1 + 0.33*2) = 1
    // Room 2: floor(1 + 0.67*2) = 2
    // Room 3: floor(1 + 1.0*2) = 3
    // Total: 1 + 1 + 2 + 3 = 7
    expect(result.spawns).toHaveLength(7);
  });
});
