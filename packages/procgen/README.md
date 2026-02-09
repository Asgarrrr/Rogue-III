# @rogue/procgen

A typed pipeline engine for deterministic dungeon generation.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Algorithms](#algorithms)
- [Configuration](#configuration)
- [Output Structure](#output-structure)
- [Advanced Usage](#advanced-usage)
- [Determinism](#determinism)
- [Debugging & Tracing](#debugging--tracing)
- [Extending with Custom Passes](#extending-with-custom-passes)
- [Game Engine Integration](#game-engine-integration)
- [Performance](#performance)
- [Architecture](#architecture)
- [API Reference](#api-reference)

---

## Features

- **Deterministic** — Same seed always produces identical output, verified by checksum
- **Fast** — Sub-millisecond generation (~0.9ms for 80×60 dungeons, ~1000 dungeons/sec)
- **Composable** — Pipeline architecture with reusable passes across algorithms
- **Type-safe** — Full TypeScript support with strict artifact typing
- **Observable** — Built-in tracing, metrics collection, and snapshot capture

---

## Installation

```bash
bun add @rogue/procgen
```

---

## Quick Start

```typescript
import { generate } from "@rogue/procgen";

const result = generate({
  algorithm: "bsp",       // or "cellular", "hybrid"
  width: 80,
  height: 60,
  seed: 12345,
});

if (result.success) {
  const { dungeon } = result.artifact;
  console.log(`Generated ${dungeon.rooms.length} rooms`);
  console.log(`Checksum: ${dungeon.checksum}`);
} else {
  console.error(`Generation failed: ${result.error}`);
}
```

**BSP Output** — Structured rooms with corridors:

```
██████████████████████████████████████████████████
████████████████········███████████████···████████
████████████████········███████████████···████████
████········████··························████████
████▲········███··························████████
████·········███·························█████████
█████·████···███········█████████···██████████████
██████████···██████···███████████···██████████████
██████████···██████···███████████···██████████████
██████████···███······███████████···██████████████
██████████···██·······███████████···██···········█
██████████···········██████·········██···········█
██████████········█████████·········██···········█
███████████······██████████······················█
███████████████████████████················▼·····█
███████████████████████████······················█
███████████████████████████········███···········█
███████████████████████████········███···········█
███████████████████████████········███████████████
██████████████████████████████████████████████████
```

**Cellular Output** — Organic cave systems:

```
██████████████████████████████████████████████████
██████████████████████████████████████████████████
██████████████████████████████████████████████████
██████████████████████·███████████████████████████
████████████▼···█······███████████████████████████
██████████████····████████████████████████████████
█████████████··········███████████████████████████
██████████████·····███████████████████████████████
███████████████········███████████████████████████
███████████████····█·█·███████████████████████████
██████████████████·█·█·█·█████████████████████████
██████████████████████···█████████████████████████
███████████████████████······█████████████████████
█████████████████████·█▲████·█████████████████████
█████████████████████···█····█████████████████████
████████████████████····████······████████████████
█████████████████████···████···███████████████████
█████████████████████·█████·····██████████████████
████████████████████████████·█·███████████████████
██████████████████████████████████████████████████
```

---

## Algorithms

| Algorithm | Description | Best For |
|-----------|-------------|----------|
| `bsp` | Binary Space Partitioning | Structured rooms with corridors |
| `cellular` | Cellular Automata | Organic cave systems |
| `hybrid` | BSP + Cellular zones | Mixed dungeon layouts |

### BSP

Recursively partitions space into rooms connected by corridors. Produces traditional roguelike dungeons with rectangular rooms.

```typescript
generate({ algorithm: "bsp", width: 80, height: 60 });
```

### Cellular

Simulates cave formation using cellular automata rules. Produces organic, irregular cavern systems.

```typescript
generate({ algorithm: "cellular", width: 100, height: 80 });
```

### Hybrid

Splits the dungeon into zones, applying BSP to structured areas and Cellular to organic areas. Produces varied, interesting layouts.

```typescript
generate({
  algorithm: "hybrid",
  width: 120,
  height: 90,
});
```

---

## Configuration

### Common Options

```typescript
generate({
  algorithm: "bsp",
  width: 80,
  height: 60,
  seed: 12345,                    // Reproducible generation
  trace: false,                   // Enable execution tracing
  snapshots: false,               // Capture intermediate snapshots
});
```

### BSP Options

```typescript
generate({
  algorithm: "bsp",
  width: 80,
  height: 60,
  bsp: {
    minRoomSize: 6,           // Minimum room dimensions (default: 6)
    maxRoomSize: 15,          // Maximum room dimensions (default: 15)
    splitRatioMin: 0.4,       // Min split position ratio (default: 0.4)
    splitRatioMax: 0.6,       // Max split position ratio (default: 0.6)
    roomPadding: 1,           // Space between room and leaf edge (default: 1)
    corridorWidth: 2,         // Width of corridors (default: 2)
    maxDepth: 8,              // Maximum BSP tree depth (default: 8)
    roomPlacementChance: 1.0, // Probability of placing a room (default: 1.0)
  },
});
```

### Cellular Options

```typescript
generate({
  algorithm: "cellular",
  width: 100,
  height: 80,
  cellular: {
    initialFillRatio: 0.45,   // Initial floor probability (default: 0.45)
    iterations: 4,            // Smoothing iterations (default: 4)
    birthLimit: 5,            // Floor becomes wall with >= N neighbors (default: 5)
    deathLimit: 4,            // Wall becomes floor with < N neighbors (default: 4)
    minRegionSize: 50,        // Remove regions smaller than this (default: 50)
    connectAllRegions: false, // Connect isolated caves (default: false)
  },
});
```

### Hybrid Options

Hybrid generation uses zone splitting to combine BSP and Cellular algorithms. Configuration is done via the `HybridGenerator` class:

```typescript
import { HybridGenerator } from "@rogue/procgen";

const generator = new HybridGenerator({
  zoneSplit: {
    minZones: 2,              // Minimum zones to create (default: 2)
    maxZones: 4,              // Maximum zones to create (default: 4)
    naturalRatio: 0.3,        // Ratio of cellular zones (default: 0.3)
    transitionWidth: 3,       // Corridor width between zones (default: 3)
    minZoneSize: 20,          // Minimum zone dimension (default: 20)
    splitDirection: "auto",   // "horizontal" | "vertical" | "auto"
  },
  useSignaturePrefabs: true,  // Use special room prefabs (default: true)
  prefabChance: 0.7,          // Prefab usage probability (default: 0.7)
  enableZoneTheming: true,    // Different themes per zone (default: true)
});

// BSP and Cellular configs apply to their respective zones
generate({
  algorithm: "hybrid",
  width: 120,
  height: 90,
  bsp: { minRoomSize: 6 },
  cellular: { iterations: 4 },
});
```

---

## Output Structure

### DungeonArtifact

```typescript
interface DungeonArtifact {
  type: "dungeon";
  dungeon: {
    width: number;
    height: number;
    grid: Grid;                 // 2D cell data (CellType.FLOOR | CellType.WALL)
    rooms: Room[];              // Room definitions
    connections: Connection[];  // Room-to-room connections
    spawnPoints: SpawnPoint[];  // Entrance, exit, items, enemies
    checksum: string;           // Determinism verification hash
    seed: DungeonSeed;          // Generation seed for reproduction
  };
}
```

### Room

```typescript
interface Room {
  id: number;
  x: number;                    // Top-left X coordinate
  y: number;                    // Top-left Y coordinate
  width: number;
  height: number;
  centerX: number;              // Center X coordinate
  centerY: number;              // Center Y coordinate
  type: "normal" | "cavern";
  connectionCount: number;      // Number of connected corridors
  isDeadEnd: boolean;           // Only one connection
  distanceFromEntrance: number; // Graph distance from entrance room
}
```

### SpawnPoint

```typescript
interface SpawnPoint {
  position: { x: number; y: number };
  roomId: number;
  type: "entrance" | "exit";    // Structural spawns only
  tags: string[];               // Custom metadata (e.g., ["spawn", "entrance"])
  distanceFromStart: number;    // Path distance from entrance
}
```

Note: The procgen only generates structural spawn points (entrance, exit). Game-specific content (enemies, treasures, items) should be handled by your game layer using the room and grid data.

### Example JSON Output

```json
{
  "type": "dungeon",
  "width": 50,
  "height": 20,
  "rooms": [
    {
      "id": 0,
      "x": 3,
      "y": 4,
      "width": 3,
      "height": 3,
      "centerX": 4,
      "centerY": 4,
      "type": "normal",
      "connectionCount": 1,
      "isDeadEnd": true,
      "distanceFromEntrance": 0
    },
    {
      "id": 1,
      "x": 10,
      "y": 11,
      "width": 3,
      "height": 3,
      "centerX": 11,
      "centerY": 12,
      "type": "normal",
      "connectionCount": 2,
      "isDeadEnd": false,
      "distanceFromEntrance": 1
    }
  ],
  "connections": [
    { "fromRoomId": 1, "toRoomId": 3, "pathLength": 27 }
  ],
  "spawns": [
    {
      "position": { "x": 4, "y": 4 },
      "roomId": 0,
      "type": "entrance",
      "tags": ["spawn", "entrance"],
      "distanceFromStart": 0
    },
    {
      "position": { "x": 43, "y": 14 },
      "roomId": 7,
      "type": "exit",
      "tags": ["exit"],
      "distanceFromStart": 49
    }
  ],
  "checksum": "v2:3dbcd562a878c493"
}
```

---

## Advanced Usage

### Generator Chaining

Chain generation with post-processing transformations:

```typescript
import { chain } from "@rogue/procgen";

const result = chain({ algorithm: "bsp", width: 80, height: 60 })
  .useGenerator()
  .transform((artifact) => {
    // Post-process: mark specific rooms
    artifact.rooms.forEach(room => {
      if (room.width * room.height > 50) {
        room.tags = [...(room.tags || []), "large"];
      }
    });
    return artifact;
  })
  .execute();
```

### Custom Pipelines

Build pipelines with fine-grained control:

```typescript
import {
  PipelineBuilder,
  createBSPGenerator,
  passes,
} from "@rogue/procgen";

const generator = createBSPGenerator();
const config = { algorithm: "bsp", width: 80, height: 60, seed: 12345 };

// Get the default pipeline
const pipeline = generator.createPipeline(config);

// Or build a custom pipeline
const customPipeline = PipelineBuilder.create(config)
  .pipe(passes.validation.checkInvariants())
  .build();
```

### Async Generation with Abort

For large dungeons or responsive UIs:

```typescript
import { generateAsync } from "@rogue/procgen";

const controller = new AbortController();

// Start generation
const promise = generateAsync(
  { algorithm: "bsp", width: 200, height: 150 },
  { signal: controller.signal }
);

// Cancel if needed (e.g., user navigates away)
setTimeout(() => controller.abort(), 100);

try {
  const result = await promise;
} catch (e) {
  if (e.name === "AbortError") {
    console.log("Generation cancelled");
  }
}
```

---

## Determinism

The library guarantees that identical seeds produce identical dungeons:

```typescript
import { assertDeterministic, testDeterminism } from "@rogue/procgen";

// Throws DeterminismViolationError if non-deterministic
assertDeterministic({ algorithm: "bsp", seed: 12345 }, 10);

// Returns detailed comparison for debugging
const result = testDeterminism({ algorithm: "bsp", seed: 12345 }, 10);
console.log(result.identical);      // true
console.log(result.checksums);      // ["v2:abc...", "v2:abc...", ...]
```

### Seed Management

```typescript
import {
  createSeed,
  createSeedFromString,
  randomSeed,
  encodeSeed,
  decodeSeed,
  seedsAreEquivalent,
} from "@rogue/procgen";

// From number
const seed1 = createSeed(12345);

// From string (hashed deterministically)
const seed2 = createSeedFromString("my-dungeon-level-1");

// Random seed
const seed3 = randomSeed();

// Encode for URLs/storage
const encoded = encodeSeed(seed1);  // "v2:abc123def456"
const decoded = decodeSeed(encoded);

// Compare seeds
seedsAreEquivalent(seed1, decoded); // true
```

---

## Debugging & Tracing

### Enable Tracing

```typescript
const result = generate({
  ...config,
  trace: true,      // Enable execution tracing
  snapshots: true,  // Capture grid state after each pass
});

if (result.success) {
  // Access execution trace
  const trace = result.trace;

  // View pass execution times
  trace.passes.forEach(pass => {
    console.log(`${pass.id}: ${pass.durationMs}ms`);
  });

  // View decisions made during generation
  trace.decisions.forEach(decision => {
    console.log(`${decision.pass}: ${decision.description}`);
  });
}
```

### Snapshots

Snapshots capture the dungeon state after each pass, useful for debugging:

```typescript
const result = generate({ ...config, snapshots: true });

if (result.success && result.snapshots) {
  result.snapshots.forEach((snapshot, i) => {
    console.log(`After pass ${i}: ${snapshot.passId}`);
    // snapshot.grid contains the grid state at this point
  });
}
```

### Validation

```typescript
import { validateDungeon, computeStats } from "@rogue/procgen";

// Validate dungeon integrity
const validation = validateDungeon(dungeon);
if (!validation.valid) {
  validation.violations.forEach(v => {
    console.error(`${v.type}: ${v.message}`);
  });
}

// Compute statistics
const stats = computeStats(dungeon);
console.log(`Floor ratio: ${(stats.floorRatio * 100).toFixed(1)}%`);
console.log(`Room count: ${stats.roomCount}`);
console.log(`Avg room size: ${stats.avgRoomSize.toFixed(1)}`);
console.log(`Connectivity: ${stats.fullyConnected ? "OK" : "BROKEN"}`);
```

---

## Extending with Custom Passes

Passes are pure functions that transform artifacts:

```typescript
import type { Pass, DungeonStateArtifact } from "@rogue/procgen";

// Define a custom pass that tags rooms based on their properties
const tagRoomsBySize: Pass<DungeonStateArtifact, DungeonStateArtifact, "details"> = {
  id: "custom.tag-rooms-by-size",
  inputType: "dungeon-state",
  outputType: "dungeon-state",
  requiredStreams: ["details"] as const,  // Declare RNG streams used

  run(input, ctx) {
    const rng = ctx.streams.details;

    // Tag rooms based on size and random selection
    const taggedRooms = input.rooms.map(room => {
      const area = room.width * room.height;
      const tags = [...(room.tags || [])];

      if (area > 50) tags.push("large");
      if (area < 20) tags.push("small");
      if (rng.next() < 0.2) tags.push("special");

      return { ...room, tags };
    });

    return {
      ...input,
      rooms: taggedRooms,
    };
  },
};
```

### RNG Stream Discipline

Passes declare which RNG streams they use via `requiredStreams`. This ensures determinism by isolating random number consumption:

| Stream | Purpose |
|--------|---------|
| `layout` | Grid initialization, space partitioning |
| `rooms` | Room placement, sizing, types |
| `connections` | Corridor routing, connection selection |
| `details` | Spawn points (entrance/exit), room tagging |

---

## Game Engine Integration

### With Phaser

```typescript
import { generate, CellType } from "@rogue/procgen";

function createTilemap(scene: Phaser.Scene) {
  const result = generate({ algorithm: "bsp", width: 80, height: 60 });
  if (!result.success) return null;

  const { grid, rooms, spawnPoints } = result.artifact.dungeon;

  // Create tilemap
  const map = scene.make.tilemap({
    width: grid.width,
    height: grid.height,
    tileWidth: 16,
    tileHeight: 16,
  });

  const tileset = map.addTilesetImage("dungeon-tiles");
  const layer = map.createBlankLayer("ground", tileset);

  // Fill tiles
  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const cell = grid.get(x, y);
      const tileIndex = cell === CellType.WALL ? 0 : 1;
      layer.putTileAt(tileIndex, x, y);
    }
  }

  // Place player at entrance
  const entrance = spawnPoints.find(s => s.type === "entrance");
  if (entrance) {
    player.setPosition(entrance.x * 16, entrance.y * 16);
  }

  return map;
}
```

### With Raw Canvas

```typescript
import { generate, CellType } from "@rogue/procgen";

function renderToCanvas(ctx: CanvasRenderingContext2D) {
  const result = generate({ algorithm: "cellular", width: 100, height: 80 });
  if (!result.success) return;

  const { grid } = result.artifact.dungeon;
  const tileSize = 8;

  for (let y = 0; y < grid.height; y++) {
    for (let x = 0; x < grid.width; x++) {
      const cell = grid.get(x, y);
      ctx.fillStyle = cell === CellType.WALL ? "#333" : "#ddd";
      ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);
    }
  }
}
```

### Serialization

```typescript
// Serialize for save files
const saveData = {
  seed: result.artifact.dungeon.seed,
  checksum: result.artifact.dungeon.checksum,
};

// Regenerate later (deterministic)
const regenerated = generate({
  algorithm: "bsp",
  width: 80,
  height: 60,
  seed: saveData.seed,
});

// Verify integrity
if (regenerated.artifact.dungeon.checksum !== saveData.checksum) {
  console.error("Dungeon corruption detected!");
}
```

---

## Performance

Benchmarks on standard hardware (M1 MacBook Pro):

| Size | Algorithm | Avg Time | Throughput | Memory |
|------|-----------|----------|------------|--------|
| 40×30 | BSP | 0.18ms | 5,400/sec | ~50KB |
| 80×60 | BSP | 0.95ms | 1,050/sec | ~150KB |
| 120×90 | BSP | 2.07ms | 480/sec | ~300KB |
| 200×150 | BSP | 4.69ms | 210/sec | ~800KB |
| 80×60 | Cellular | 1.22ms | 820/sec | ~150KB |
| 100×80 | Cellular | 1.68ms | 595/sec | ~250KB |

### Optimization Tips

```typescript
// Disable tracing and snapshots for production (default)
generate({ ...config, trace: false, snapshots: false });

// Pre-generate dungeons during loading screens
const dungeonCache = new Map();
for (let i = 0; i < 10; i++) {
  dungeonCache.set(i, generate({ ...config, seed: createSeed(i) }));
}
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  generate() / chain()                    Public API         │
├─────────────────────────────────────────────────────────────┤
│  Generators (BSP, Cellular, Hybrid)      Algorithm Factories│
├─────────────────────────────────────────────────────────────┤
│  Passes                                  Transformations    │
│  ├── carving/     (corridor carvers)                        │
│  ├── connectivity/ (graph algorithms)                       │
│  └── validation/  (invariant checks)                        │
├─────────────────────────────────────────────────────────────┤
│  Pipeline                                Execution Engine   │
│  ├── PipelineBuilder  (fluent DSL)                          │
│  ├── TraceCollector   (observability)                       │
│  └── RNG Streams      (determinism)                         │
├─────────────────────────────────────────────────────────────┤
│  Core                                    Primitives         │
│  ├── Grid, BitGrid    (2D data)                             │
│  ├── Geometry         (Delaunay, MST)                       │
│  └── Algorithms       (flood fill, pathfinding)             │
└─────────────────────────────────────────────────────────────┘
```

### Key Concepts

| Concept | Description |
|---------|-------------|
| **Artifact** | Immutable data product with type discriminant. All data flows through artifacts. |
| **Pass** | Pure function `(Artifact, Context) → Artifact`. Declares required RNG streams. |
| **Pipeline** | Ordered sequence of passes. Immutable once built. |
| **Generator** | Factory that composes algorithm-specific pipelines. Validates config. |
| **RNG Streams** | Four isolated random streams ensuring determinism across passes. |

### Invariants

The library enforces these guarantees:

- **Determinism**: Same seed → same checksum, always
- **Connectivity**: All rooms reachable from entrance (validated)
- **Spawn validity**: Entrance/exit placed on floor tiles
- **Checksum integrity**: Stored checksum matches computed hash

---

## API Reference

### Generation

| Function | Description |
|----------|-------------|
| `generate(config, options?)` | Synchronous generation |
| `generateAsync(config, options?)` | Async with abort support |
| `chain(config)` | Fluent builder for chained operations |
| `validateConfig(config)` | Validate configuration before generation |

### Seeds

| Function | Description |
|----------|-------------|
| `createSeed(number)` | Create seed from number |
| `createSeedFromString(string)` | Create seed from string (hashed) |
| `randomSeed()` | Generate random seed |
| `encodeSeed(seed)` | Encode seed for storage/URLs |
| `decodeSeed(string)` | Decode seed from string |
| `seedsAreEquivalent(a, b)` | Compare two seeds |

### Validation

| Function | Description |
|----------|-------------|
| `validateDungeon(dungeon)` | Check dungeon integrity |
| `computeStats(dungeon)` | Calculate generation statistics |
| `assertDeterministic(config, runs?)` | Assert deterministic generation |
| `testDeterminism(config, runs?)` | Test with detailed results |

### Generators

| Function | Description |
|----------|-------------|
| `createBSPGenerator()` | Create BSP algorithm generator |
| `createCellularGenerator()` | Create Cellular algorithm generator |
| `createHybridGenerator()` | Create Hybrid algorithm generator |

---

## License

MIT
