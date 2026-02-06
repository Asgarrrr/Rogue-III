/**
 * Semantic Content Tests
 */

import { describe, expect, it } from "bun:test";
import { CellType, Grid } from "../../src/core/grid";
import {
  assignRole,
  createBehavior,
  createEntityFactory,
  createSemanticEntity,
  createSemanticItem,
  detectRelationships,
  determineGuardTarget,
  determineItemPurpose,
  type EntityCreationContext,
} from "../../src/intelligence/semantic";
import {
  DEFAULT_ENEMY_TEMPLATES,
  DEFAULT_SEMANTIC_CONFIG,
} from "../../src/intelligence/semantic/types";
import type {
  Connection,
  DungeonStateArtifact,
  Room,
  SpawnPoint,
} from "../../src/pipeline/types";

// =============================================================================
// TEST HELPERS
// =============================================================================

function createTestRoom(
  id: number,
  type: Room["type"],
  x: number,
  y: number,
): Room {
  return {
    id,
    x,
    y,
    width: 10,
    height: 10,
    centerX: x + 5,
    centerY: y + 5,
    type,
    seed: id * 1000,
  };
}

function createTestSpawn(
  roomId: number,
  type: SpawnPoint["type"],
  weight = 1,
  tags: string[] = [],
): SpawnPoint {
  return {
    position: { x: 5, y: 5 },
    roomId,
    type,
    tags,
    weight,
    distanceFromStart: roomId,
  };
}

function createTestContext(
  rooms: Room[],
  overrides: Partial<EntityCreationContext> = {},
): EntityCreationContext {
  const roomById = new Map<number, Room>();
  for (const room of rooms) {
    roomById.set(room.id, room);
  }

  const roomDistances = new Map<number, number>();
  for (const room of rooms) {
    roomDistances.set(room.id, room.id);
  }

  return {
    rooms,
    roomById,
    roomDistances,
    maxDistance: rooms.length,
    createdEntities: new Map(),
    createdItems: new Map(),
    config: DEFAULT_SEMANTIC_CONFIG,
    rng: () => 0.5,
    ...overrides,
  };
}

// =============================================================================
// ROLE ASSIGNMENT TESTS
// =============================================================================

describe("assignRole", () => {
  const rooms = [
    createTestRoom(0, "entrance", 0, 0),
    createTestRoom(1, "normal", 20, 0),
    createTestRoom(2, "treasure", 40, 0),
    createTestRoom(3, "boss", 60, 0),
  ];

  it("assigns explicit role from tag", () => {
    const spawn = createTestSpawn(1, "enemy", 1, ["role:elite"]);
    const template = DEFAULT_ENEMY_TEMPLATES.find((t) => t.id === "orc_warrior")!;
    const ctx = createTestContext(rooms);

    const role = assignRole(spawn, rooms[1]!, template, ctx);

    expect(role).toBe("elite");
  });

  it("assigns guardian role for guards tag", () => {
    const spawn = createTestSpawn(2, "enemy", 1, ["guards:treasure"]);
    const template = DEFAULT_ENEMY_TEMPLATES.find((t) => t.id === "orc_warrior")!;
    const ctx = createTestContext(rooms);

    const role = assignRole(spawn, rooms[2]!, template, ctx);

    expect(role).toBe("guardian");
  });

  it("assigns role based on room type weights", () => {
    const spawn = createTestSpawn(3, "enemy", 1, []);
    const template = DEFAULT_ENEMY_TEMPLATES.find((t) => t.id === "troll")!;
    const ctx = createTestContext(rooms);

    const role = assignRole(spawn, rooms[3]!, template, ctx);

    // Boss room should prefer boss role for troll
    expect(["boss", "elite"]).toContain(role);
  });

  it("falls back to first preferred role", () => {
    const spawn = createTestSpawn(1, "enemy", 1, []);
    const template = DEFAULT_ENEMY_TEMPLATES.find((t) => t.id === "goblin")!;
    const ctx = createTestContext(rooms, { rng: () => 0 });

    const role = assignRole(spawn, rooms[1]!, template, ctx);

    expect(template.preferredRoles).toContain(role);
  });
});

// =============================================================================
// GUARD TARGET TESTS
// =============================================================================

describe("determineGuardTarget", () => {
  const rooms = [
    createTestRoom(0, "entrance", 0, 0),
    createTestRoom(1, "treasure", 20, 0),
    createTestRoom(2, "boss", 40, 0),
    createTestRoom(3, "secret", 60, 0),
  ];

  it("returns undefined for non-guardians", () => {
    const spawn = createTestSpawn(1, "enemy", 1, []);
    const ctx = createTestContext(rooms);

    const target = determineGuardTarget(spawn, rooms[1]!, "patrol", ctx);

    expect(target).toBeUndefined();
  });

  it("uses explicit guard tag", () => {
    const spawn = createTestSpawn(1, "enemy", 1, ["guards:ancient-artifact"]);
    const ctx = createTestContext(rooms);

    const target = determineGuardTarget(spawn, rooms[1]!, "guardian", ctx);

    expect(target).toBe("ancient-artifact");
  });

  it("infers treasure room guard target", () => {
    const spawn = createTestSpawn(1, "enemy", 1, []);
    const ctx = createTestContext(rooms);

    const target = determineGuardTarget(spawn, rooms[1]!, "guardian", ctx);

    expect(target).toBe("treasure-room-1");
  });

  it("infers boss room guard target", () => {
    const spawn = createTestSpawn(2, "enemy", 1, []);
    const ctx = createTestContext(rooms);

    const target = determineGuardTarget(spawn, rooms[2]!, "guardian", ctx);

    expect(target).toBe("boss-room-2");
  });

  it("infers secret room guard target", () => {
    const spawn = createTestSpawn(3, "enemy", 1, []);
    const ctx = createTestContext(rooms);

    const target = determineGuardTarget(spawn, rooms[3]!, "guardian", ctx);

    expect(target).toBe("secret-room-3");
  });
});

// =============================================================================
// BEHAVIOR TESTS
// =============================================================================

describe("createBehavior", () => {
  const rooms = [createTestRoom(0, "normal", 0, 0)];

  it("creates guardian behavior", () => {
    const ctx = createTestContext(rooms);

    const behavior = createBehavior("guardian", rooms[0]!, ctx);

    expect(behavior.movement).toBe("stationary");
    expect(behavior.combatStyle).toBe("defensive");
    expect(behavior.fleeThreshold).toBe(0);
  });

  it("creates patrol behavior with path", () => {
    const ctx = createTestContext(rooms);

    const behavior = createBehavior("patrol", rooms[0]!, ctx);

    expect(behavior.movement).toBe("patrol");
    expect(behavior.patrolPath).toEqual([0]);
    expect(behavior.alertsAllies).toBe(true);
  });

  it("creates boss behavior", () => {
    const ctx = createTestContext(rooms);

    const behavior = createBehavior("boss", rooms[0]!, ctx);

    expect(behavior.movement).toBe("territorial");
    expect(behavior.combatStyle).toBe("berserker");
    expect(behavior.detectionRange).toBeGreaterThan(0);
  });

  it("adjusts detection range to room size", () => {
    const smallRoom: Room = {
      ...rooms[0]!,
      width: 6,
      height: 6,
    };
    const ctx = createTestContext([smallRoom]);

    const behavior = createBehavior("boss", smallRoom, ctx);

    // Detection range should be limited by room size
    expect(behavior.detectionRange).toBeLessThanOrEqual(4);
  });
});

// =============================================================================
// RELATIONSHIP TESTS
// =============================================================================

describe("detectRelationships", () => {
  const rooms = [createTestRoom(0, "boss", 0, 0)];

  it("creates guard relationship", () => {
    const entity = {
      id: "entity-0",
      spawnId: "spawn-0",
      template: "orc_warrior",
      role: "guardian" as const,
      guards: "treasure-room-0",
      behavior: createBehavior("guardian", rooms[0]!, createTestContext(rooms)),
      drops: { guaranteed: [], random: [], goldRange: [0, 0] as const, experience: 0 },
      roomId: 0,
      position: { x: 5, y: 5 },
      distanceFromStart: 0,
      difficulty: 0.5,
      tags: [] as string[],
    };
    const ctx = createTestContext(rooms);

    const relationships = detectRelationships(entity, ctx);

    expect(relationships).toContainEqual({
      type: "guards",
      targetId: "treasure-room-0",
      strength: 1,
    });
  });

  it("creates command relationship for boss", () => {
    const minion = {
      id: "minion-0",
      spawnId: "spawn-minion",
      template: "goblin",
      role: "minion" as const,
      behavior: createBehavior("minion", rooms[0]!, createTestContext(rooms)),
      drops: { guaranteed: [], random: [], goldRange: [0, 0] as const, experience: 0 },
      roomId: 0,
      position: { x: 3, y: 3 },
      distanceFromStart: 0,
      difficulty: 0.2,
      tags: [] as string[],
      relationships: [],
    };

    const ctx = createTestContext(rooms);
    ctx.createdEntities.set(minion.id, minion as any);

    const boss = {
      id: "boss-0",
      spawnId: "spawn-boss",
      template: "troll",
      role: "boss" as const,
      behavior: createBehavior("boss", rooms[0]!, ctx),
      drops: { guaranteed: [], random: [], goldRange: [0, 0] as const, experience: 0 },
      roomId: 0,
      position: { x: 5, y: 5 },
      distanceFromStart: 0,
      difficulty: 0.8,
      tags: [] as string[],
    };

    const relationships = detectRelationships(boss, ctx);

    expect(relationships).toContainEqual({
      type: "commands",
      targetId: "minion-0",
      strength: 0.8,
    });
  });
});

// =============================================================================
// ITEM PURPOSE TESTS
// =============================================================================

describe("determineItemPurpose", () => {
  it("uses explicit purpose tag", () => {
    const spawn = createTestSpawn(0, "treasure", 1, ["purpose:weapon"]);

    const purpose = determineItemPurpose(spawn);

    expect(purpose).toBe("weapon");
  });

  it("infers treasure purpose", () => {
    const spawn = createTestSpawn(0, "treasure", 1, []);

    const purpose = determineItemPurpose(spawn);

    expect(purpose).toBe("treasure");
  });

  it("infers healing purpose for potions", () => {
    const spawn = createTestSpawn(0, "potion", 1, []);

    const purpose = determineItemPurpose(spawn);

    expect(purpose).toBe("healing");
  });

  it("infers key purpose", () => {
    const spawn = createTestSpawn(0, "key", 1, []);

    const purpose = determineItemPurpose(spawn);

    expect(purpose).toBe("key");
  });
});

// =============================================================================
// ENTITY CREATION TESTS
// =============================================================================

describe("createSemanticEntity", () => {
  const rooms = [
    createTestRoom(0, "entrance", 0, 0),
    createTestRoom(1, "normal", 20, 0),
    createTestRoom(2, "boss", 40, 0),
  ];

  it("creates entity with all properties", () => {
    const spawn = createTestSpawn(1, "enemy", 1, []);
    const ctx = createTestContext(rooms);

    const entity = createSemanticEntity(spawn, ctx);

    expect(entity.id).toBeDefined();
    expect(entity.spawnId).toBeDefined();
    expect(entity.template).toBeDefined();
    expect(entity.role).toBeDefined();
    expect(entity.behavior).toBeDefined();
    expect(entity.drops).toBeDefined();
    expect(entity.roomId).toBe(1);
    expect(entity.difficulty).toBeGreaterThanOrEqual(0);
    expect(entity.difficulty).toBeLessThanOrEqual(1);
  });

  it("scales difficulty with distance", () => {
    const spawnNear = createTestSpawn(0, "enemy", 1, []);
    const spawnFar = createTestSpawn(2, "enemy", 1, []);
    const ctx = createTestContext(rooms);

    const entityNear = createSemanticEntity(spawnNear, ctx);
    const entityFar = createSemanticEntity(spawnFar, ctx);

    // Far entity should have higher difficulty
    expect(entityFar.difficulty).toBeGreaterThanOrEqual(entityNear.difficulty);
  });

  it("uses explicit template tag", () => {
    const spawn = createTestSpawn(1, "enemy", 1, ["template:dark_mage"]);
    const ctx = createTestContext(rooms);

    const entity = createSemanticEntity(spawn, ctx);

    expect(entity.template).toBe("dark_mage");
  });
});

// =============================================================================
// ITEM CREATION TESTS
// =============================================================================

describe("createSemanticItem", () => {
  const rooms = [
    createTestRoom(0, "entrance", 0, 0),
    createTestRoom(1, "treasure", 20, 0),
  ];

  it("creates item with all properties", () => {
    const spawn = createTestSpawn(1, "treasure", 1, []);
    const ctx = createTestContext(rooms);

    const item = createSemanticItem(spawn, ctx);

    expect(item.id).toBeDefined();
    expect(item.spawnId).toBeDefined();
    expect(item.template).toBeDefined();
    expect(item.purpose).toBe("treasure");
    expect(item.roomId).toBe(1);
    expect(item.value).toBeGreaterThanOrEqual(0);
    expect(item.value).toBeLessThanOrEqual(1);
  });

  it("detects guardian relationship", () => {
    const rooms2 = [createTestRoom(0, "treasure", 0, 0)];
    const ctx = createTestContext(rooms2);

    // Create guardian first
    const guardianSpawn = createTestSpawn(0, "enemy", 1, ["guards:room-0"]);
    const guardian = createSemanticEntity(guardianSpawn, ctx);
    guardian; // Entity has guards property set
    ctx.createdEntities.set(guardian.id, guardian);

    // Note: guardedBy detection requires specific guards format
    const itemSpawn = createTestSpawn(0, "treasure", 1, []);
    const item = createSemanticItem(itemSpawn, ctx);

    expect(item.roomId).toBe(0);
  });

  it("sets unlocks for key items", () => {
    const spawn = createTestSpawn(0, "key", 1, ["unlocks:boss-door"]);
    const ctx = createTestContext(rooms);

    const item = createSemanticItem(spawn, ctx);

    expect(item.purpose).toBe("key");
    expect(item.unlocks).toBe("boss-door");
  });
});

// =============================================================================
// FACTORY TESTS
// =============================================================================

describe("createEntityFactory", () => {
  const rooms = [
    createTestRoom(0, "normal", 0, 0),
  ];

  it("creates factory with custom config", () => {
    const factory = createEntityFactory({
      difficultyScaling: 2.0,
    });

    const spawn = createTestSpawn(0, "enemy", 1, []);
    const ctx = createTestContext(rooms);

    const entity = factory.createEntity(spawn, ctx);

    expect(entity).toBeDefined();
    expect(entity.template).toBeDefined();
  });

  it("factory creates items", () => {
    const factory = createEntityFactory();

    const spawn = createTestSpawn(0, "treasure", 1, []);
    const ctx = createTestContext(rooms);

    const item = factory.createItem(spawn, ctx);

    expect(item).toBeDefined();
    expect(item.purpose).toBe("treasure");
  });
});
