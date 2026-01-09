# Dungeon/ECS Integration Refactor - Implementation Plan

**Created:** 2025-01-XX  
**Status:** 🚀 Ready to Implement  
**Breaking Changes:** ✅ Yes (dev phase, acceptable)

---

## 🎯 Executive Summary

**Problem:** Current architecture has duplication (boolean[][] grid + GameMap Uint8Array), no procedural entity generation, and requires manual conversion code.

**Solution:** Refactor `Dungeon` to be ECS-first with:
- **Zero-copy terrain** (Uint8Array directly compatible with GameMap)
- **Declarative entity spawning** (EntitySpawnDescriptors)
- **No duplication** (single source of truth)
- **Full determinism** (seeds control everything)

**Impact:**
- 🚀 Performance: ZERO memory copying for terrain
- 🧹 Code quality: No converter needed, clean architecture
- 🎲 Features: Procedural content generation built-in
- 📦 Extensibility: Easy to add new entity types

---

## 📋 Table of Contents

1. [Architecture Changes](#1-architecture-changes)
2. [Breaking Changes](#2-breaking-changes)
3. [Implementation Steps](#3-implementation-steps)
4. [Migration Guide](#4-migration-guide)
5. [Testing Strategy](#5-testing-strategy)
6. [Performance Validation](#6-performance-validation)

---

## 1. Architecture Changes

### 1.1 New Dungeon Interface

**File:** `apps/server/src/engine/dungeon/entities/dungeon.ts`

```typescript
export interface Dungeon {
  rooms: Room[];
  connections: Connection[];
  config: DungeonConfig;
  seeds: DungeonSeed;
  checksum: string;
  
  // NEW: Zero-copy terrain
  terrain: DungeonTerrain;
  
  // NEW: Entity spawn descriptors
  spawnData: DungeonSpawnData;
  
  getChecksum(): string;
}

export interface DungeonTerrain {
  width: number;
  height: number;
  tiles: Uint8Array; // Direct GameMap compatibility
}

export interface EntitySpawnDescriptor {
  templateId: string;
  position: { x: number; y: number };
  components?: Record<string, unknown>;
  metadata?: {
    source?: string;
    roomId?: number;
    tier?: number;
  };
}

export interface DungeonSpawnData {
  playerSpawn: { x: number; y: number };
  entities: EntitySpawnDescriptor[];
}
```

**Changes:**
- ❌ REMOVED: `grid?: boolean[][]`
- ✅ ADDED: `terrain: DungeonTerrain`
- ✅ ADDED: `spawnData: DungeonSpawnData`
- ✅ ADDED: Helper methods `toLegacyGrid()`, `getTile()`, `isWalkable()`

### 1.2 Content Generator

**File:** `apps/server/src/engine/dungeon/generators/content-generator.ts` (NEW)

```typescript
export interface ContentGenerationConfig {
  difficulty: number;        // 1-10
  enemyDensity: number;      // 0-1
  itemDensity: number;       // 0-1
  trapChance: number;        // 0-1
  decorationChance: number;  // 0-1
  enableTreasureRooms: boolean;
  enableTraps: boolean;
}

export class DungeonContentGenerator {
  constructor(
    private seeds: DungeonSeed,
    private config: ContentGenerationConfig
  ) {}

  generateContent(
    rooms: Room[],
    connections: Connection[]
  ): EntitySpawnDescriptor[] {
    // Uses seeds.details for deterministic RNG
    // Returns array of spawn descriptors
  }

  private generateRoomContent(room: Room): EntitySpawnDescriptor[] {
    // Enemies, items, decorations based on room size/type
  }

  private generateCorridorContent(connection: Connection): EntitySpawnDescriptor[] {
    // Traps, occasional items/enemies
  }
}
```

**Responsibilities:**
- Deterministic entity placement using `seeds.details`
- Room-based content (enemies, items, decorations)
- Corridor content (traps, doors)
- Treasure room special content
- Difficulty scaling

### 1.3 ECS Integration

**File:** `apps/server/src/engine/ecs/integration/dungeon-loader.ts` (NEW)

```typescript
export function loadDungeonIntoWorld(
  world: World,
  dungeon: Dungeon,
  templates: EntityTemplateRegistry
): Entity {
  // 1. Load terrain (ZERO COPY)
  const gameMap = world.resources.get<GameMap>("gameMap");
  gameMap.setRawTiles(dungeon.terrain.tiles);

  // 2. Spawn player
  const player = templates.instantiate(world, "player", {
    Position: dungeon.spawnData.playerSpawn
  });

  // 3. Spawn all entities
  for (const desc of dungeon.spawnData.entities) {
    templates.instantiate(world, desc.templateId, {
      Position: desc.position,
      ...desc.components
    });
  }

  return player;
}
```

**Key Point:** This is a ~30 line function, NOT a class. No "converter" needed!

---

## 2. Breaking Changes

### 2.1 Dungeon Interface

**REMOVED:**
```typescript
grid?: boolean[][];
```

**ADDED:**
```typescript
terrain: DungeonTerrain;
spawnData: DungeonSpawnData;
```

**Impact:**
- ✅ All generators must be updated
- ✅ Tests using `dungeon.grid` must be updated
- ✅ ASCII display utility must use `dungeon.terrain` or `toLegacyGrid()`

### 2.2 Generator Implementations

**Required Changes:**
- `BSPGenerator.generate()` - Must create terrain + spawnData
- `CellularGenerator.generate()` - Must create terrain + spawnData

**Pattern:**
```typescript
generate(): Dungeon {
  // 1. Generate geometry (existing code)
  const rooms = ...;
  const connections = ...;
  const grid = ...;

  // 2. Convert Grid → Uint8Array
  const terrain = this.gridToTerrain(grid);

  // 3. Generate content
  const contentGen = new DungeonContentGenerator(this.seeds, contentConfig);
  const entities = contentGen.generateContent(rooms, connections);
  const playerSpawn = this.getPlayerSpawn(rooms);

  // 4. Return dungeon
  return new DungeonImpl({
    rooms,
    connections,
    config: this.config,
    seeds: this.seeds,
    checksum: this.computeChecksum(...),
    terrain,
    spawnData: { playerSpawn, entities }
  });
}

private gridToTerrain(grid: Grid): DungeonTerrain {
  const tiles = new Uint8Array(grid.width * grid.height);
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const cell = grid.getCell(x, y);
      tiles[y * grid.width + x] = cell === CellType.WALL ? 0 : 1;
    }
  }
  return { width: grid.width, height: grid.height, tiles };
}
```

### 2.3 Validation & Utilities

**Files to Update:**
- `validation/invariants.ts` - Replace `grid` checks with `terrain` checks
- `core/utils/ascii-display.ts` - Use `dungeon.toLegacyGrid()` or read from `terrain`
- `serialization/seed-manager.ts` - Update checksum to include spawnData

---

## 3. Implementation Steps

### Phase 1: Core Types (1-2 hours)
- [x] ✅ Update `dungeon/entities/dungeon.ts` with new interface
- [ ] Update `dungeon/entities/index.ts` exports
- [ ] Create `TerrainTileType` enum
- [ ] Run `npm run build` to see what breaks

### Phase 2: Content Generator (2-3 hours)
- [ ] Create `generators/content-generator.ts`
- [ ] Implement `DungeonContentGenerator` class
- [ ] Define content pools (enemies, items, traps, decorations)
- [ ] Implement weighted random selection
- [ ] Implement room content generation
- [ ] Implement corridor content generation
- [ ] Write unit tests for determinism

### Phase 3: Update BSP Generator (2-3 hours)
- [ ] Add `gridToTerrain()` helper method
- [ ] Add `getPlayerSpawn()` helper method
- [ ] Update `generate()` to create terrain
- [ ] Integrate ContentGenerator
- [ ] Update `generateAsync()` if needed
- [ ] Update checksum computation
- [ ] Test generation still works

### Phase 4: Update Cellular Generator (2-3 hours)
- [ ] Apply same changes as BSP
- [ ] Ensure cellular-specific content works
- [ ] Test generation

### Phase 5: Update Utilities (1-2 hours)
- [ ] Update `ascii-display.ts` to use `terrain` or `toLegacyGrid()`
- [ ] Update `validation/invariants.ts` terrain checks
- [ ] Update checksum logic to include `spawnData`
- [ ] Ensure serialization works

### Phase 6: ECS Integration (2-3 hours)
- [ ] Create `ecs/integration/` directory
- [ ] Create `dungeon-loader.ts`
- [ ] Implement `loadDungeonIntoWorld()`
- [ ] Update `GameMap` if needed (already has `setRawTiles`)
- [ ] Update game initialization to use new loader
- [ ] Test full pipeline: generate → load → play

### Phase 7: Testing (3-4 hours)
- [ ] Fix all broken unit tests
- [ ] Add tests for ContentGenerator
- [ ] Add tests for terrain conversion
- [ ] Add integration test: generate → load → verify
- [ ] Add determinism test: same seed → same entities
- [ ] Performance test: measure zero-copy vs old approach

### Phase 8: Documentation (1-2 hours)
- [ ] Update ECS_ARCHITECTURE.md
- [ ] Update ECS_IMPLEMENTATION_REMAINING.md
- [ ] Add JSDoc to new functions
- [ ] Update README if needed

**Total Estimated Time: 15-20 hours (2-3 days)**

---

## 4. Migration Guide

### For Dungeon Generation Code

**BEFORE:**
```typescript
const dungeon = DungeonManager.generateFromSeedSync(seed, config);
const grid = dungeon.grid;
// Manually convert grid to GameMap
// Manually spawn entities
```

**AFTER:**
```typescript
const result = DungeonManager.generateFromSeedSync(seed, config);
if (result.isErr()) return result;

const dungeon = result.value;
const player = loadDungeonIntoWorld(world, dungeon, templates);
// Done! Terrain and entities loaded.
```

### For Tests Using `dungeon.grid`

**BEFORE:**
```typescript
const grid = dungeon.grid;
expect(grid[y][x]).toBe(true); // wall
```

**AFTER:**
```typescript
expect(dungeon.getTile(x, y)).toBe(TerrainTileType.Wall);
// OR for legacy compatibility:
const grid = dungeon.toLegacyGrid();
expect(grid[y][x]).toBe(true);
```

### For ASCII Display

**BEFORE:**
```typescript
const grid = dungeon.grid;
// manually render grid
```

**AFTER:**
```typescript
const grid = dungeon.toLegacyGrid();
// same rendering code
```

---

## 5. Testing Strategy

### 5.1 Unit Tests

**Content Generator:**
```typescript
describe('DungeonContentGenerator', () => {
  it('should generate deterministic content with same seed', () => {
    const gen1 = new DungeonContentGenerator(seeds, config);
    const gen2 = new DungeonContentGenerator(seeds, config);
    
    const content1 = gen1.generateContent(rooms, connections);
    const content2 = gen2.generateContent(rooms, connections);
    
    expect(content1).toEqual(content2);
  });

  it('should respect difficulty scaling', () => {
    const configEasy = { ...config, difficulty: 1 };
    const configHard = { ...config, difficulty: 10 };
    
    const contentEasy = new DungeonContentGenerator(seeds, configEasy).generateContent(rooms, connections);
    const contentHard = new DungeonContentGenerator(seeds, configHard).generateContent(rooms, connections);
    
    expect(countEnemies(contentHard)).toBeGreaterThan(countEnemies(contentEasy));
  });
});
```

**Terrain Conversion:**
```typescript
describe('BSPGenerator terrain conversion', () => {
  it('should convert Grid to Uint8Array correctly', () => {
    const generator = new BSPGenerator(config, seeds);
    const dungeon = generator.generate();
    
    expect(dungeon.terrain.tiles).toBeInstanceOf(Uint8Array);
    expect(dungeon.terrain.width).toBe(config.width);
    expect(dungeon.terrain.height).toBe(config.height);
    expect(dungeon.terrain.tiles.length).toBe(config.width * config.height);
  });
});
```

### 5.2 Integration Tests

```typescript
describe('Dungeon to ECS integration', () => {
  it('should load dungeon into world with zero copy', () => {
    const world = new World();
    registerGameComponents(world);
    registerGameResources(world, config.width, config.height);
    const templates = new EntityTemplateRegistry();
    registerAllTemplates(templates);

    const dungeonResult = DungeonManager.generateFromSeedSync(seed, config);
    expect(dungeonResult.isOk()).toBe(true);

    const dungeon = dungeonResult.value;
    const terrainRef = dungeon.terrain.tiles; // Keep reference

    const player = loadDungeonIntoWorld(world, dungeon, templates);

    // Verify terrain loaded
    const gameMap = world.resources.get<GameMap>("gameMap");
    expect(gameMap.getTile(0, 0)).toBeDefined();

    // Verify player spawned
    expect(world.hasComponent(player, "Position")).toBe(true);
    const pos = world.getComponent(player, "Position");
    expect(pos).toEqual(dungeon.spawnData.playerSpawn);

    // Verify entities spawned
    const enemyQuery = world.query({ with: ["AI"], without: ["Player"] });
    expect(enemyQuery.execute().length).toBeGreaterThan(0);
  });
});
```

### 5.3 Performance Tests

```typescript
describe('Performance benchmarks', () => {
  it('should have zero-copy terrain transfer', () => {
    const dungeon = generateLargeDungeon(); // 200x200
    const terrainBuffer = dungeon.terrain.tiles.buffer;

    const world = new World();
    registerGameResources(world, 200, 200);

    const start = performance.now();
    loadDungeonIntoWorld(world, dungeon, templates);
    const elapsed = performance.now() - start;

    // Should be < 10ms for 200x200 dungeon (zero copy)
    expect(elapsed).toBeLessThan(10);

    // Verify it's actually the same buffer (zero copy)
    const gameMap = world.resources.get<GameMap>("gameMap");
    // Note: setRawTiles might copy for safety, but it's O(1) copy, not O(n) conversion
  });
});
```

---

## 6. Performance Validation

### Before Refactor (Estimated)

```
Dungeon Generation (100x100):
- BSP tree generation: ~5ms
- Grid creation: ~2ms
- Grid → boolean[][]: ~3ms (allocation)
- Checksum: ~1ms
TOTAL: ~11ms

ECS Loading:
- boolean[][] → Uint8Array: ~3ms (conversion)
- Manual entity spawning: ~5ms (scattered code)
TOTAL: ~8ms

COMBINED: ~19ms
Memory: ~40KB (grid) + ~10KB (GameMap) = 50KB
```

### After Refactor (Target)

```
Dungeon Generation (100x100):
- BSP tree generation: ~5ms
- Grid creation: ~2ms
- Grid → Uint8Array: ~2ms (direct)
- Content generation: ~2ms
- Checksum: ~1ms
TOTAL: ~12ms (+1ms for content)

ECS Loading:
- Uint8Array → GameMap: ~0.1ms (setRawTiles, near zero-copy)
- Template instantiation: ~3ms (clean loop)
TOTAL: ~3ms

COMBINED: ~15ms (-4ms improvement, 21% faster)
Memory: ~10KB (terrain only) (-40KB, 80% reduction)
```

**Validation Criteria:**
- ✅ Total time ≤ 20ms for 100x100 dungeon
- ✅ Memory usage ≤ 15KB for terrain
- ✅ Zero O(n²) conversions
- ✅ Entity spawning deterministic

---

## 7. Rollback Plan

If critical issues arise:

1. **Git revert** to before refactor
2. OR create `DungeonLegacyAdapter`:
   ```typescript
   class DungeonLegacyAdapter {
     static toNewFormat(oldDungeon: OldDungeon): Dungeon {
       // Convert grid → terrain
       // Generate empty spawnData
     }
   }
   ```
3. OR add `grid?: boolean[][]` back as optional computed property

**Risk:** Low - changes are localized to dungeon module and ECS integration point.

---

## 8. Acceptance Criteria

### Must Have (P0)
- ✅ All generators produce `terrain` and `spawnData`
- ✅ `loadDungeonIntoWorld()` works correctly
- ✅ All existing tests pass (with updates)
- ✅ Determinism preserved (same seed → same output)
- ✅ No performance regression

### Should Have (P1)
- ✅ Content generator produces varied content
- ✅ Difficulty scaling works
- ✅ Integration tests cover full pipeline
- ✅ Documentation updated

### Nice to Have (P2)
- ✅ Treasure rooms have special content
- ✅ Entity metadata (tier, source) populated
- ✅ Performance improvement measured
- ✅ Memory reduction validated

---

## 9. Next Steps

1. **Review this plan** with team
2. **Create feature branch**: `refactor/dungeon-ecs-integration`
3. **Start with Phase 1** (core types)
4. **Iterate through phases** with commits per phase
5. **Run tests after each phase**
6. **Merge when all acceptance criteria met**

---

## 10. Questions & Decisions

### Q1: Should content generation be configurable per-dungeon?
**Decision:** Yes, add `ContentGenerationConfig` to `DungeonConfig` or as separate parameter.

### Q2: Should we cache generated content?
**Decision:** No, regenerate from seeds. Keeps memory low and ensures determinism.

### Q3: Should terrain support more tile types?
**Decision:** Yes, start with Wall/Floor/Door, add Water/Lava later. TerrainTileType enum is extensible.

### Q4: Should we support "empty" dungeons (no entities)?
**Decision:** Yes, `spawnData.entities` can be empty array. Useful for testing.

### Q5: Should player spawn be mandatory?
**Decision:** Yes, always have playerSpawn. Default to center of first room.

---

**Status:** ✅ Plan complete, ready for implementation  
**Next:** Start Phase 1 - Core Types
