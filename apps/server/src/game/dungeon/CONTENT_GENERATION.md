# Content Generation Architecture

## Separation of Concerns

The dungeon system separates **layout generation** from **content population**:

```
┌─────────────────────────────────────────────────────────────┐
│                    LAYOUT GENERATION                        │
│  Input: width, height, roomCount, algorithm                │
│  Output: terrain (Uint8Array), rooms, connections          │
│  Concern: Spatial structure, geometry, connectivity        │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                  CONTENT POPULATION                         │
│  Input: difficulty, enemyDensity, itemDensity, etc.        │
│  Output: EntitySpawnDescriptor[] (enemies, items, traps)   │
│  Concern: Gameplay balance, enemy tier, loot distribution  │
└─────────────────────────────────────────────────────────────┘
```

## Why This Separation?

### Problem Without Separation

```typescript
// ❌ Before: Everything mixed together
const dungeon = generate({ width: 80, height: 50, roomCount: 10 });
// → Always spawns difficulty 5 enemies (hardcoded)
// → Can't adjust difficulty without regenerating layout
// → Layout and content tightly coupled
```

### Solution With Separation

```typescript
// ✅ After: Clear separation via config.content
const dungeon = generate({
  // Layout parameters
  width: 80,
  height: 50,
  roomCount: 10,
  algorithm: "bsp",

  // Content parameters (optional)
  content: {
    difficulty: 8,        // High-level dungeon
    enemyDensity: 0.9,    // Lots of enemies
    itemDensity: 0.3,     // Fewer items (harder)
    enableTreasureRooms: true,
  },
});
```

## Configuration Structure

### DungeonConfig

```typescript
interface DungeonConfig {
  // Layout parameters (required)
  width: number;
  height: number;
  roomCount: number;
  algorithm: "bsp" | "cellular";
  roomSizeRange: [number, number];

  // Content parameters (optional)
  content?: ContentGenerationParams;
}
```

### ContentGenerationParams

```typescript
interface ContentGenerationParams {
  difficulty?: number;              // 1-10, default: 5
  enemyDensity?: number;            // 0-1, default: 0.7
  itemDensity?: number;             // 0-1, default: 0.5
  trapChance?: number;              // 0-1, default: 0.2
  decorationChance?: number;        // 0-1, default: 0.3
  enableTreasureRooms?: boolean;    // default: true
  enableTraps?: boolean;            // default: true
}
```

## Usage Examples

### Example 1: Easy Dungeon (Tutorial Level)

```typescript
const tutorialDungeon = DungeonManager.generateFromSeedSync("tutorial_01", {
  width: 60,
  height: 40,
  roomCount: 8,
  algorithm: "bsp",
  content: {
    difficulty: 1,        // Easy enemies (rats, goblins)
    enemyDensity: 0.3,    // Sparse enemies
    itemDensity: 0.8,     // Lots of items (helpful)
    trapChance: 0.0,      // No traps
    enableTreasureRooms: false,
  },
});
```

### Example 2: Hard Dungeon (End-Game Content)

```typescript
const endgameDungeon = DungeonManager.generateFromSeedSync("endgame_boss", {
  width: 120,
  height: 80,
  roomCount: 15,
  algorithm: "cellular",
  content: {
    difficulty: 10,       // Max difficulty (trolls, dragons)
    enemyDensity: 1.0,    // Maximum enemies
    itemDensity: 0.2,     // Rare items
    trapChance: 0.5,      // Lots of traps
    enableTreasureRooms: true,  // Guarded treasure
    enableTraps: true,
  },
});
```

### Example 3: Default Content (No Config Provided)

```typescript
// Uses DEFAULT_CONTENT_CONFIG from content-generator.ts
const standardDungeon = DungeonManager.generateFromSeedSync(12345, {
  width: 80,
  height: 50,
  roomCount: 10,
  algorithm: "bsp",
  // content: undefined → uses defaults
});

// Equivalent to:
// content: {
//   difficulty: 5,
//   enemyDensity: 0.7,
//   itemDensity: 0.5,
//   trapChance: 0.2,
//   decorationChance: 0.3,
//   enableTreasureRooms: true,
//   enableTraps: true,
// }
```

## Content Generation Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│  1. Layout Generation (BSP or Cellular)                    │
│     → terrain: Uint8Array                                   │
│     → rooms: Room[]                                         │
│     → connections: Connection[]                             │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  2. Content Population (DungeonContentGenerator)           │
│     Input: seeds.details, config.content                   │
│     Process:                                                │
│       - Filter ENEMY_POOL by difficulty range              │
│       - Calculate spawn counts (roomArea × density)        │
│       - Weighted random selection from pools               │
│       - Special rooms (15% chance for treasure)            │
│       - Corridor traps (trapChance probability)            │
│     Output: EntitySpawnDescriptor[]                        │
└───────────────────────────┬─────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│  3. Checksum Calculation                                    │
│     Includes: terrain + rooms + connections + spawnData    │
│     → Ensures reproducibility via share codes              │
└─────────────────────────────────────────────────────────────┘
```

## Weighted Entity Pools

### Enemy Pool (content-generator.ts)

```typescript
const ENEMY_POOL: WeightedEntity[] = [
  // Easy (difficulty 1-5)
  { templateId: "goblin", weight: 100, minDifficulty: 1, maxDifficulty: 10 },
  { templateId: "rat", weight: 80, minDifficulty: 1, maxDifficulty: 5 },

  // Medium (difficulty 3-10)
  { templateId: "orc", weight: 60, minDifficulty: 3, maxDifficulty: 10 },
  { templateId: "skeleton", weight: 50, minDifficulty: 3, maxDifficulty: 10 },

  // Hard (difficulty 5-10)
  { templateId: "orc_warrior", weight: 30, minDifficulty: 5, maxDifficulty: 10 },
  { templateId: "troll", weight: 20, minDifficulty: 7, maxDifficulty: 10 },
];
```

**Filtering Example**:
- `difficulty: 1` → Only goblins, rats (minDifficulty ≤ 1)
- `difficulty: 5` → All except troll (minDifficulty ≤ 5)
- `difficulty: 10` → All enemies available

### Spawn Count Calculation

```typescript
// For a 10×8 room (area = 80)
const baseCount = Math.floor(80 / 30);  // ~2 enemies
const enemyCount = Math.floor(baseCount * enemyDensity * random(0.5-1.0));

// With enemyDensity = 0.7:
//   → 2 * 0.7 * 0.8 (random) ≈ 1 enemy
// With enemyDensity = 1.0:
//   → 2 * 1.0 * 1.0 (random) = 2 enemies
```

## Determinism & Share Codes

**Important**: Content parameters are part of the checksum!

```typescript
// Same seed + same content config = same dungeon
const d1 = generate({ ..., content: { difficulty: 5 } });
const d2 = generate({ ..., content: { difficulty: 5 } });
assert(d1.checksum === d2.checksum);

// Different content config = different checksum
const d3 = generate({ ..., content: { difficulty: 8 } });
assert(d1.checksum !== d3.checksum);
```

This ensures:
- Share codes include enemy/item placement
- Players get identical dungeons when loading share codes
- No desync between clients in multiplayer

## Future Enhancements

### Dynamic Difficulty Scaling

```typescript
// Not implemented yet, but possible:
const dungeon = generate({
  content: {
    difficulty: (room) => {
      // Scale difficulty by distance from entrance
      const dist = distance(room, entranceRoom);
      return Math.min(1 + dist / 3, 10);
    }
  }
});
```

### Separate Content Re-Population

```typescript
// Not implemented yet, but could be:
const layout = generateLayout({ width, height, roomCount, algorithm });
const content1 = populateContent(layout, { difficulty: 1 });  // Easy mode
const content2 = populateContent(layout, { difficulty: 10 }); // Hard mode
// → Same layout, different enemies
```

## References

- Implementation: `apps/server/src/engine/dungeon/generators/content-generator.ts`
- Types: `packages/contracts/src/types/dungeon.ts`
- Schema: `packages/contracts/src/schemas/dungeon.ts`
- BSP Integration: `apps/server/src/engine/dungeon/generators/algorithms/bsp/bsp-generator.ts:402-419`
- Cellular Integration: `apps/server/src/engine/dungeon/generators/algorithms/cellular/cellular-generator.ts:636-653`
