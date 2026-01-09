# Dungeon to ECS Integration

This document describes the architecture and implementation of the dungeon generation to ECS integration system.

## Overview

The dungeon generation system creates procedurally generated dungeons that are loaded into the Entity Component System (ECS) for gameplay. The integration follows an "ECS-first" design principle, eliminating intermediate conversion steps and enabling zero-copy terrain transfer.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     Dungeon Generation                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ BSP         │  │ Cellular    │  │ Content Generator       │  │
│  │ Generator   │  │ Generator   │  │ (enemies, items, etc.)  │  │
│  └──────┬──────┘  └──────┬──────┘  └───────────┬─────────────┘  │
│         │                │                     │                │
│         └────────────────┼─────────────────────┘                │
│                          ▼                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Dungeon                                │   │
│  │  • terrain: Uint8Array (zero-copy compatible)            │   │
│  │  • rooms: Room[]                                         │   │
│  │  • connections: Connection[]                             │   │
│  │  • spawnData: { playerSpawn, entities[] }                │   │
│  │  • checksum: string (determinism verification)           │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     dungeon-loader.ts                           │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  loadDungeonIntoWorld(world, dungeon, templates)         │   │
│  │  • Zero-copy terrain → GameMap                           │   │
│  │  • Player spawn at designated position                   │   │
│  │  • Entity instantiation from templates                   │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        ECS World                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────────┐  │
│  │ GameMap     │  │ Entities    │  │ Systems                 │  │
│  │ (terrain)   │  │ (player,    │  │ (movement, combat, AI)  │  │
│  │             │  │  enemies,   │  │                         │  │
│  │             │  │  items)     │  │                         │  │
│  └─────────────┘  └─────────────┘  └─────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Key Components

### 1. Dungeon Interface (`entities/dungeon.ts`)

The `Dungeon` interface defines the contract between generation and ECS:

```typescript
interface Dungeon {
  rooms: Room[];
  connections: Connection[];
  config: DungeonConfig;
  seeds: DungeonSeed;
  checksum: string;
  
  // ECS-optimized terrain (Uint8Array for zero-copy)
  terrain: DungeonTerrain;
  
  // Procedural entity spawns
  spawnData: DungeonSpawnData;
  
  // Helper methods
  getTile(x: number, y: number): TerrainTileType;
  isWalkable(x: number, y: number): boolean;
}
```

### 2. Content Generator (`generators/content-generator.ts`)

Generates procedural content (enemies, items, decorations, traps) based on:
- Room geometry and type
- Difficulty settings
- Weighted random pools
- Deterministic seeded RNG

```typescript
const contentGen = new DungeonContentGenerator(seeds, {
  difficulty: 5,
  enemyDensity: 0.7,
  itemDensity: 0.5,
  trapChance: 0.2,
});

const entities = contentGen.generateContent(rooms, connections);
```

### 3. Dungeon Loader (`ecs/integration/dungeon-loader.ts`)

Loads a generated dungeon into the ECS world:

```typescript
// Load dungeon and get player entity
const player = loadDungeonIntoWorld(world, dungeon, templates);

// Validate before loading
const errors = validateDungeonCompatibility(world, dungeon, templates);

// Clear for level transitions
clearDungeonEntities(world);

// Get statistics
const stats = getDungeonStats(world);
```

## Zero-Copy Terrain Transfer

The terrain system uses `Uint8Array` for efficient memory transfer:

```typescript
// In Dungeon
terrain: {
  width: number,
  height: number,
  tiles: Uint8Array  // Flat array: tiles[y * width + x]
}

// In GameMap
setRawTiles(tiles: Uint8Array): void {
  // Direct assignment - no copying!
  this.tiles = tiles;
}
```

This provides:
- **O(1) terrain loading** instead of O(n²) cell-by-cell copy
- **Memory efficiency** - single allocation shared between systems
- **Cache-friendly** - contiguous memory layout

## Entity Spawn Descriptors

Entities are described declaratively, not instantiated during generation:

```typescript
interface EntitySpawnDescriptor {
  templateId: string;           // e.g., "orc", "health_potion"
  position: { x: number, y: number };
  components?: Record<string, unknown>;  // Optional overrides
  metadata?: {
    source?: string;      // "room" | "corridor" | "treasure"
    roomId?: number;
    tier?: number;
  };
}
```

This decouples dungeon generation from ECS entity creation.

## Generators

### BSP Generator
- Binary Space Partitioning for structured room layouts
- Guaranteed room connectivity
- Optimal for classic roguelike dungeons

### Cellular Generator
- Cellular automaton for organic cave systems
- Dynamic `maxCavernSize` based on dungeon dimensions
- Room placement in suitable caverns

Key configuration for large dungeons:
```typescript
// Dynamic maxCavernSize prevents filtering of large caverns
const dynamicMaxCavernSize = Math.max(
  DEFAULT_CAVERN_CONFIG.maxCavernSize,  // 10000
  Math.floor(dungeonArea * 0.8)          // 80% of dungeon area
);
```

## Usage Example

```typescript
import { DungeonManager } from "@engine/dungeon";
import { loadDungeonIntoWorld } from "@engine/ecs/integration";

// 1. Generate dungeon
const result = DungeonManager.generateFromSeedSync("my-seed", {
  width: 80,
  height: 50,
  roomCount: 8,
  roomSizeRange: [6, 12],
  algorithm: "bsp",
});

if (result.isErr()) {
  console.error("Generation failed:", result.error);
  return;
}

const dungeon = result.value;

// 2. Setup ECS world
const world = new World();
registerGameComponents(world);
registerGameResources(world, dungeon.terrain.width, dungeon.terrain.height);

// 3. Load dungeon into world
const templates = createGameTemplateRegistry();
const player = loadDungeonIntoWorld(world, dungeon, templates);

// 4. Start game loop
gameLoop(world, player);
```

## Determinism

All generation is fully deterministic:

```typescript
// Same seed + config = identical dungeon
const dungeon1 = DungeonManager.generateFromSeedSync(42, config);
const dungeon2 = DungeonManager.generateFromSeedSync(42, config);

assert(dungeon1.checksum === dungeon2.checksum);
assert(dungeon1.rooms.length === dungeon2.rooms.length);
assert(dungeon1.spawnData.playerSpawn === dungeon2.spawnData.playerSpawn);
```

Checksums include:
- Room positions and dimensions
- Connection paths
- Terrain tile samples
- Spawn data counts

## Error Handling

The loader handles missing templates gracefully:

```typescript
// Missing templates are logged but don't crash
// Other entities continue to spawn
Dungeon loaded with warnings: 30 entities spawned successfully, 16 failed.
Failed templates: ["steel_sword", "leather_armor", ...]
```

## Testing

Integration tests verify the complete flow:

```typescript
describe("Dungeon to ECS Integration", () => {
  test("should complete dungeon lifecycle: generate → load → clear → reload");
  test("should maintain determinism across multiple loads");
  test("should populate GameMap terrain with zero-copy");
  test("should spawn player at correct position");
});
```

## Files Modified in Refactor

### Core Changes
- `entities/dungeon.ts` - Added `getTile()`, `isWalkable()` to interface
- `generators/content-generator.ts` - Fixed RNG method calls
- `generators/algorithms/cellular/cellular-generator.ts` - Dynamic `maxCavernSize`
- `generators/algorithms/cellular/room-placer.ts` - Fixed room ID assignment
- `generators/algorithms/bsp/bsp-generator.ts` - Handle zero-room case

### New Files
- `ecs/integration/dungeon-loader.ts` - Main integration module
- `tests/ecs/dungeon-integration.test.ts` - Integration tests

## Known Limitations

1. **Template Matching**: Content generator uses IDs like `sword` that may not match
   template registry IDs like `basic_sword`. Consider adding template aliases.

2. **Large Dungeons**: Cellular generator may not place all requested rooms in very
   large dungeons due to cavern topology. This is by design (organic caves).

3. **API Not Implemented**: HTTP API endpoints for dungeon generation are stubbed.
   See `tests/api/dungeon-api.test.ts` for planned interface.

## Performance

| Operation | Complexity | Notes |
|-----------|------------|-------|
| Terrain load | O(1) | Zero-copy transfer |
| Entity spawn | O(n) | n = entity count |
| Validation | O(r + c) | r = rooms, c = connections |
| Clear | O(e) | e = entities in world |

Typical generation times:
- Small (80×60): ~50ms
- Medium (120×90): ~100ms
- Large (200×150): ~200ms

## Future Improvements

1. **Template Aliases** - Map content generator IDs to actual template IDs
2. **Streaming Load** - Load entities in chunks for very large dungeons
3. **Prefab Rooms** - Support hand-designed room templates
4. **Biome System** - Different content pools per dungeon biome
5. **Save/Load** - Serialize dungeon state for game saves
