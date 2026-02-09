# Procgen Module Map

Quick reference for Claude Code navigation.

## Entry Points

| File | Purpose |
|------|---------|
| `src/index.ts` | Public API exports |
| `src/api.ts` | High-level generation functions: `generate()`, `generateAsync()`, `chain()` |
| `src/seed.ts` | Seed creation: `createSeed()`, `randomSeed()`, `normalizeSeed()` |
| `src/validation.ts` | `validateDungeon()`, `computeStats()` |
| `src/testing.ts` | `testDeterminism()`, `assertDeterministic()` |

## Directory Structure

```
src/
├── api.ts              # generate(), generateAsync(), chain(), registerGenerator()
├── seed.ts             # Seed creation utilities
├── validation.ts       # Dungeon validation & stats
├── testing.ts          # Determinism testing
│
├── core/               # Low-level primitives
│   ├── algorithms/     # UnionFind
│   ├── compression/    # path-rle.ts (corridor compression)
│   ├── context/        # Context providers for passes
│   ├── data-structures/# FastQueue, CoordSet, coordKey()
│   ├── geometry/       # Delaunay, MST, Point, Rect
│   ├── graph/          # BFS distance, adjacency
│   ├── grid/           # Grid, BitGrid, CellType, flood-fill
│   ├── hash/           # FNV64, checksum
│   ├── pathfinding/    # Dijkstra map
│   └── seed/           # Seed encoding/decoding
│
├── generators/         # Generation algorithms
│   ├── bsp/            # Binary Space Partitioning
│   ├── cellular/       # Cellular Automata
│   └── hybrid/         # BSP + Cellular zones
│
├── passes/             # Reusable pipeline passes
│   ├── carving/        # Corridor carvers (L-shaped, straight)
│   ├── common/         # Shared pass utilities
│   ├── connectivity/   # Graph algorithms, MST, crossing detection
│   └── validation/     # Invariant checks
│
├── pipeline/           # Pipeline infrastructure
│   ├── builder.ts      # PipelineBuilder, createPipeline()
│   ├── chaining.ts     # chain().useGenerator().transform()
│   ├── spawn-validator.ts
│   ├── trace.ts        # Execution tracing
│   └── types/          # Type definitions
│       ├── artifacts.ts # DungeonArtifact, Room, SpawnPoint, Connection
│       ├── config.ts    # GenerationConfig, BSPConfig, CellularConfig
│       └── trace.ts     # Trace types
│
├── prefabs/            # Pre-built room templates
│   ├── shapes.ts       # Basic shapes
│   ├── signature-rooms.ts # Special rooms
│   └── template-utils.ts
│
├── quality/            # Quality assessment
│   └── index.ts        # assessQuality()
│
├── metrics/            # Metrics collection
│   └── collector.ts
│
└── utils/
    └── ascii-renderer.ts # Debug visualization
```

## Key Types

### Generation Config
```typescript
interface GenerationConfig {
  width: number;
  height: number;
  seed: Seed;
  algorithm?: "bsp" | "cellular" | "hybrid";
  bsp?: BSPConfig;
  cellular?: CellularConfig;
  trace?: boolean;
  snapshots?: boolean;
}
```

### Artifacts (Pipeline Data)
| Type | Content |
|------|---------|
| `DungeonArtifact` | Final output: terrain, rooms, connections, spawns |
| `GridArtifact` | Grid of cells |
| `RoomsArtifact` | Room list |
| `GraphArtifact` | Room graph with edges |
| `ValidationArtifact` | Validation results |

### Core Entities
```typescript
interface Room {
  id, x, y, width, height, centerX, centerY,
  type: RoomType, isDeadEnd, connectionCount, distanceFromEntrance
}

interface Connection {
  fromRoomId, toRoomId, path: Point[], pathLength
}

interface SpawnPoint {
  type: SpawnPointType, position, roomId, weight, distanceFromStart
}
```

## Generators

| Generator | Algorithm | Entry |
|-----------|-----------|-------|
| `createBSPGenerator()` | Binary Space Partitioning | `generators/bsp/` |
| `createCellularGenerator()` | Cellular Automata | `generators/cellular/` |
| `createHybridGenerator()` | BSP + Cellular zones | `generators/hybrid/` |

## API Usage

```typescript
// Simple generation
import { generate, createSeed } from "@rogue/procgen";
const result = generate({ width: 100, height: 80, seed: createSeed(12345) });

// With options
const result = generate(config, { trace: true, snapshots: true });

// Chain API
import { chain } from "@rogue/procgen";
chain(config).useGenerator("bsp").transform(myPass).run();

// Async with abort
const result = await generateAsync(config, { signal: abortController.signal });
```

## Common Operations

| Task | Location |
|------|----------|
| Create/validate seed | `src/seed.ts` |
| Run generation | `src/api.ts` → `generate()` |
| Validate dungeon | `src/validation.ts` → `validateDungeon()` |
| Custom pipeline | `pipeline/builder.ts` → `createPipeline()` |
| Room connectivity | `passes/connectivity/graph-algorithms.ts` |
| Corridor carving | `passes/carving/corridor-carvers.ts` |
| Flood fill | `core/grid/flood-fill.ts` |
| Grid operations | `core/grid/grid.ts` |

## Tests Location

```
tests/
├── generation.test.ts      # Main generation tests
├── pipeline.test.ts        # Pipeline builder tests
├── prefabs.test.ts         # Prefab tests
├── property.test.ts        # Property-based tests
├── quality.test.ts         # Quality assessment
├── crossing-detector.test.ts
├── flood-fill.test.ts
├── delaunay.test.ts
├── graph-algorithms.test.ts
└── ...
```
