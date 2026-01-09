# Dungeon Generation Examples

Quick reference for common dungeon generation patterns.

## Basic Usage

### Simple Dungeon (Default Content)

```typescript
import { DungeonManager } from "./dungeon-manager";

const dungeon = DungeonManager.generateFromSeedSync(12345, {
  width: 80,
  height: 50,
  roomCount: 10,
  algorithm: "bsp",
  roomSizeRange: [5, 12],
});

// Content uses defaults:
// - difficulty: 5
// - enemyDensity: 0.7
// - itemDensity: 0.5
// - treasure rooms enabled
```

### Custom Difficulty

```typescript
const hardDungeon = DungeonManager.generateFromSeedSync("hard_seed", {
  width: 100,
  height: 60,
  roomCount: 12,
  algorithm: "cellular",
  roomSizeRange: [6, 14],
  content: {
    difficulty: 8,  // High-tier enemies (orcs, trolls)
  },
});
```

## Level Design Patterns

### Tutorial Level (Easy, Safe)

```typescript
const tutorial = DungeonManager.generateFromSeedSync("tutorial_01", {
  width: 60,
  height: 40,
  roomCount: 6,
  algorithm: "bsp",
  roomSizeRange: [8, 12],
  content: {
    difficulty: 1,
    enemyDensity: 0.2,      // Very few enemies
    itemDensity: 1.0,       // Lots of items
    trapChance: 0.0,        // No traps
    enableTreasureRooms: false,
    enableTraps: false,
  },
});
```

### Mid-Game Dungeon (Balanced)

```typescript
const balanced = DungeonManager.generateFromSeedSync("level_05", {
  width: 80,
  height: 50,
  roomCount: 10,
  algorithm: "bsp",
  roomSizeRange: [5, 12],
  content: {
    difficulty: 5,
    enemyDensity: 0.7,
    itemDensity: 0.5,
    trapChance: 0.2,
    enableTreasureRooms: true,
    enableTraps: true,
  },
});
```

### Boss Dungeon (Hard, Challenging)

```typescript
const bossDungeon = DungeonManager.generateFromSeedSync("boss_final", {
  width: 120,
  height: 80,
  roomCount: 15,
  algorithm: "cellular",  // Organic cave feel
  roomSizeRange: [8, 16],
  content: {
    difficulty: 10,         // Max difficulty
    enemyDensity: 1.0,      // Maximum enemies
    itemDensity: 0.2,       // Rare items (harder)
    trapChance: 0.5,        // Many traps
    decorationChance: 0.1,  // Sparse decorations
    enableTreasureRooms: true,
    enableTraps: true,
  },
});
```

### Arena (Combat-Focused)

```typescript
const arena = DungeonManager.generateFromSeedSync("arena_pvp", {
  width: 60,
  height: 60,
  roomCount: 4,  // Few large rooms
  algorithm: "bsp",
  roomSizeRange: [15, 20],  // Large rooms
  content: {
    difficulty: 7,
    enemyDensity: 1.0,      // Lots of enemies
    itemDensity: 0.8,       // Plenty of items for combat
    trapChance: 0.3,
    decorationChance: 0.0,  // No clutter
    enableTreasureRooms: false,
    enableTraps: true,
  },
});
```

### Treasure Hunt (Exploration-Focused)

```typescript
const treasureMap = DungeonManager.generateFromSeedSync("treasure_map", {
  width: 100,
  height: 80,
  roomCount: 20,  // Many rooms to explore
  algorithm: "cellular",
  roomSizeRange: [4, 10],
  content: {
    difficulty: 6,
    enemyDensity: 0.4,      // Fewer enemies
    itemDensity: 0.8,       // Lots of loot
    trapChance: 0.4,        // But many traps!
    decorationChance: 0.5,  // Atmospheric
    enableTreasureRooms: true,  // Multiple treasure rooms
    enableTraps: true,
  },
});
```

## Progressive Difficulty

### Generate Dungeon Based on Player Level

```typescript
function generateForPlayerLevel(playerLevel: number, seed: string) {
  // Scale difficulty 1-10 based on player level 1-100
  const difficulty = Math.min(Math.ceil(playerLevel / 10), 10);

  // Increase dungeon size with level
  const baseSize = 60;
  const sizeIncrease = Math.floor(playerLevel / 5) * 10;
  const size = Math.min(baseSize + sizeIncrease, 150);

  return DungeonManager.generateFromSeedSync(seed, {
    width: size,
    height: size,
    roomCount: 8 + Math.floor(playerLevel / 10),
    algorithm: playerLevel > 50 ? "cellular" : "bsp",
    roomSizeRange: [5, 12],
    content: {
      difficulty,
      enemyDensity: 0.5 + (playerLevel / 200),  // 0.5 → 1.0
      itemDensity: 0.7 - (playerLevel / 300),   // 0.7 → 0.4
      trapChance: 0.1 + (playerLevel / 500),    // 0.1 → 0.3
    },
  });
}

// Usage:
const level1Dungeon = generateForPlayerLevel(1, "player_123");
const level50Dungeon = generateForPlayerLevel(50, "player_123");
const level100Dungeon = generateForPlayerLevel(100, "player_123");
```

## Themed Dungeons

### Undead Crypt (High Skeleton Spawn)

```typescript
const crypt = DungeonManager.generateFromSeedSync("crypt_01", {
  width: 70,
  height: 70,
  roomCount: 12,
  algorithm: "bsp",
  roomSizeRange: [6, 10],
  content: {
    difficulty: 6,
    enemyDensity: 0.9,      // Lots of undead
    itemDensity: 0.3,       // Sparse loot
    trapChance: 0.1,        // Few mechanical traps
    decorationChance: 0.6,  // Coffins, statues, etc.
    enableTreasureRooms: true,
    enableTraps: false,
  },
});
// Note: Enemy types filtered by templates in ECS
// This just controls spawn density
```

### Natural Cave (Organic Layout)

```typescript
const cave = DungeonManager.generateFromSeedSync("cave_system", {
  width: 90,
  height: 90,
  roomCount: 8,
  algorithm: "cellular",  // Natural-looking caves
  roomSizeRange: [8, 16],
  content: {
    difficulty: 4,
    enemyDensity: 0.5,      // Sparse (isolated creatures)
    itemDensity: 0.4,
    trapChance: 0.05,       // Natural hazards only
    decorationChance: 0.7,  // Stalagmites, pools, etc.
    enableTreasureRooms: false,
    enableTraps: false,
  },
});
```

## Testing & Development

### Minimal Test Dungeon

```typescript
const testDungeon = DungeonManager.generateFromSeedSync(0, {
  width: 30,
  height: 30,
  roomCount: 3,
  algorithm: "bsp",
  roomSizeRange: [5, 8],
  content: {
    difficulty: 1,
    enemyDensity: 0.1,
    itemDensity: 0.1,
    trapChance: 0.0,
    decorationChance: 0.0,
    enableTreasureRooms: false,
    enableTraps: false,
  },
});
```

### Max Content Test

```typescript
const maxContent = DungeonManager.generateFromSeedSync(999, {
  width: 100,
  height: 100,
  roomCount: 20,
  algorithm: "cellular",
  roomSizeRange: [8, 14],
  content: {
    difficulty: 10,
    enemyDensity: 1.0,
    itemDensity: 1.0,
    trapChance: 1.0,
    decorationChance: 1.0,
    enableTreasureRooms: true,
    enableTraps: true,
  },
});
// Useful for stress-testing ECS entity limits
```

## Share Code Preservation

```typescript
// Generate once
const original = DungeonManager.generateFromSeedSync(12345, {
  width: 80,
  height: 50,
  roomCount: 10,
  algorithm: "bsp",
  content: { difficulty: 7 },
});

const shareCode = original.checksum;

// Regenerate from share code (not yet implemented in DungeonManager)
// const restored = DungeonManager.generateFromShareCode(shareCode);
// assert(restored.checksum === original.checksum);

// For now, store seed + config together:
const savedDungeon = {
  seed: 12345,
  config: { /* ... */ },
  checksum: original.checksum,
};
```

## Common Mistakes

### ❌ Wrong: Mixing Layout and Content Concerns

```typescript
// Don't try to control enemies via roomCount
const bad = DungeonManager.generateFromSeedSync(123, {
  roomCount: 50,  // Thinking more rooms = more enemies
  // This affects LAYOUT, not enemy count!
});
```

### ✅ Right: Use Content Config for Enemies

```typescript
const good = DungeonManager.generateFromSeedSync(123, {
  roomCount: 10,  // Layout decision
  content: {
    enemyDensity: 1.0,  // Content decision
  },
});
```

### ❌ Wrong: Assuming Defaults

```typescript
// Might not spawn what you expect
const dungeon = generate({ width: 80, height: 50, ... });
// Uses difficulty: 5 (medium enemies)
```

### ✅ Right: Explicit Content Config

```typescript
const dungeon = generate({
  width: 80,
  height: 50,
  content: {
    difficulty: 1,  // Explicitly easy
  },
});
```

## Performance Considerations

### Small Dungeons (Fast)

```typescript
// Generates in ~3-5ms
const small = generate({
  width: 40,
  height: 40,
  roomCount: 5,
  algorithm: "bsp",  // Faster than cellular
});
```

### Large Dungeons (Slower)

```typescript
// Generates in ~15-20ms
const large = generate({
  width: 150,
  height: 150,
  roomCount: 25,
  algorithm: "cellular",  // More compute-intensive
  content: {
    enemyDensity: 1.0,  // More spawn calculations
  },
});
```

## References

- Full API: `dungeon-manager.ts`
- Content Configuration: `CONTENT_GENERATION.md`
- ECS Integration: `DUNGEON_ECS_INTEGRATION.md`
