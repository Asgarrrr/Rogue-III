# Rogue III

Modern turn-based roguelike with deterministic procedural generation and high-performance ECS architecture.

## Core Features

### Deterministic Procedural Generation
- **Share codes**: Base64URL-encoded seeds with CRC32 checksums for perfect reproducibility
- **5-stream PRNG**: Xorshift128+ with independent streams (layout, rooms, connections, details, content)
- **Dual algorithms**: BSP for structured dungeons, Cellular Automata for organic caves
- **Content generation**: Weighted spawn pools for enemies, items, traps with difficulty scaling

### High-Performance ECS
- **Hybrid storage**: TypedArrays (SoA) for hot-path components, Objects (AoS) for complex data
- **Zero-copy loading**: Uint8Array terrain transferred directly to GameMap via `setRawTiles()`
- **Query caching**: Archetype-based system with selective invalidation
- **Turn-based system**: Energy accumulation model with fast-forward optimization

### Real-Time Multiplayer
- **WebSocket protocol**: Authenticated session-based communication via Elysia
- **State synchronization**: ECS world state shared across clients
- **Event system**: CommandBuffer for deferred mutations and deterministic replay

### Full-Stack Type Safety
- **Shared contracts**: Zod schemas and TypeScript types in `packages/contracts`
- **Error handling**: Typed error codes with Result<T, E> pattern
- **Eden RPC**: Type-safe client-server communication

## Technical Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      CLIENT (Next.js)                           │
│  ┌──────────────┐  ┌───────────────┐  ┌──────────────────┐    │
│  │  Game UI     │  │  WebSocket    │  │  Renderer        │    │
│  │  (React 19)  │←→│  Client       │←→│  (PixiJS 8)      │    │
│  └──────────────┘  └───────────────┘  └──────────────────┘    │
└───────────────────────────┬─────────────────────────────────────┘
                            │ WS /ws/game
                            │ Auth: Better-Auth session
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    SERVER (Elysia + Bun)                        │
│  ┌───────────────────────────────────────────────────────────┐ │
│  │                  WebSocket Handler                        │ │
│  │  • Session validation                                     │ │
│  │  • Player input routing                                   │ │
│  │  • State broadcast                                        │ │
│  └─────────────────────────┬─────────────────────────────────┘ │
│                            │                                   │
│  ┌─────────────────────────▼─────────────────────────────────┐ │
│  │                      ECS WORLD                            │ │
│  │  ┌────────────────┐  ┌────────────────┐  ┌────────────┐ │ │
│  │  │ EntityManager  │  │ ComponentReg.  │  │ Systems    │ │ │
│  │  │ • ID recycle   │  │ • Hybrid store │  │ • TurnMgmt │ │ │
│  │  │ • Alive track  │  │ • Query cache  │  │ • Movement │ │ │
│  │  │                │  │                │  │ • Combat   │ │ │
│  │  └────────────────┘  └────────────────┘  │ • AI       │ │ │
│  │                                           │ • FOV      │ │ │
│  │  ┌────────────────┐  ┌────────────────┐  └────────────┘ │ │
│  │  │ Resources      │  │ CommandBuffer  │                 │ │
│  │  │ • GameMap      │  │ • Deferred mut │                 │ │
│  │  │ • TurnState    │  │ • Flush/tick   │                 │ │
│  │  │ • EventQueue   │  └────────────────┘                 │ │
│  │  └────────────────┘                                      │ │
│  └───────────────────────────────────────────────────────────┘ │
│                            │                                   │
│  ┌─────────────────────────▼─────────────────────────────────┐ │
│  │           DUNGEON GENERATION PIPELINE                     │ │
│  │  ┌─────────────────────────────────────────────────────┐ │ │
│  │  │  1. Seed Normalization (seed-manager.ts)           │ │ │
│  │  │     • String → djb2 hash OR number sanitization    │ │ │
│  │  │     • 5-stream fan-out (xorshift128+)              │ │ │
│  │  │     • CRC32 checksum generation                    │ │ │
│  │  └─────────────────────────────────────────────────────┘ │ │
│  │  ┌─────────────────────────────────────────────────────┐ │ │
│  │  │  2. Algorithm Selection (dungeon-manager.ts)       │ │ │
│  │  │     • BSP: binary partition → rooms → corridors    │ │ │
│  │  │     • Cellular: automaton → union-find → A*        │ │ │
│  │  │     • Uint8Array terrain output (width × height)   │ │ │
│  │  └─────────────────────────────────────────────────────┘ │ │
│  │  ┌─────────────────────────────────────────────────────┐ │ │
│  │  │  3. Content Generation (content-generator.ts)      │ │ │
│  │  │     • Weighted pools (enemies, items, traps)       │ │ │
│  │  │     • Difficulty filtering & spawn density         │ │ │
│  │  │     • EntitySpawnDescriptor[] with template IDs    │ │ │
│  │  └─────────────────────────────────────────────────────┘ │ │
│  │  ┌─────────────────────────────────────────────────────┐ │ │
│  │  │  4. Validation (invariants.ts)                     │ │ │
│  │  │     • Connectivity via union-find                  │ │ │
│  │  │     • Floor/room density checks                    │ │ │
│  │  │     • Dimension guards (MAX_DUNGEON_CELLS)         │ │ │
│  │  └─────────────────────────────────────────────────────┘ │ │
│  │  ┌─────────────────────────────────────────────────────┐ │ │
│  │  │  5. ECS Loading (dungeon-loader.ts)                │ │ │
│  │  │     • GameMap.setRawTiles(terrain.tiles) ZERO-COPY │ │ │
│  │  │     • Template instantiation from descriptors      │ │ │
│  │  │     • Spatial index registration                   │ │ │
│  │  └─────────────────────────────────────────────────────┘ │ │
│  └───────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Technology Stack

| Layer | Technologies |
|-------|--------------|
| Runtime | Bun 1.3.3 |
| Backend | Elysia 1.4, Better-Auth 1.4 |
| Frontend | Next.js 16 (App Router), React 19 |
| Database | PostgreSQL, Drizzle ORM |
| Real-time | WebSocket (Elysia native) |
| Rendering | PixiJS 8, TailwindCSS 4 |
| Validation | Zod 4 |
| Monorepo | Turborepo 2.6, Bun Workspaces |
| Linting | Biome 2.3 |

---

## Dungeon Generation System

### BSP Algorithm (Binary Space Partitioning)

Generates structured, architectural dungeons through recursive space division.

**Implementation** (`apps/server/src/engine/dungeon/generators/algorithms/bsp/`):

```
1. Partitioning (bsp-partitioner.ts)
   ├─ Recursive binary splits (horizontal/vertical)
   ├─ Balance constraints: min room area, aspect ratio
   └─ Output: Tree of leaf nodes (future rooms)

2. Room Placement (room-placer.ts)
   ├─ Each leaf → rectangular room (padding from edges)
   ├─ Deterministic sizing via rooms PRNG stream
   └─ Output: Room[] with { id, x, y, width, height, centerX, centerY }

3. Corridor Carving (corridor-carver.ts)
   ├─ Connect sibling leaves through parent partition
   ├─ L-shaped corridors (horizontal + vertical segments)
   └─ Anti-loop heuristics for clean topology
```

**Characteristics**:
- Guaranteed connectivity by construction
- Predictable layout (good for puzzle design)
- Performance: O(w × h × log(rooms))
- Typical generation time: 3-5ms for 80×50 maps

### Cellular Automata Algorithm

Generates organic cave-like dungeons through iterative simulation.

**Implementation** (`apps/server/src/engine/dungeon/generators/algorithms/cellular/`):

```
1. Initialization
   ├─ Random noise fill (layout PRNG stream)
   └─ 45% wall density

2. Cellular Automaton (automaton-rules.ts)
   ├─ Birth/survival rules (Moore neighborhood)
   ├─ 4-5 iterations for smooth caves
   └─ Output: Organic floor regions

3. Region Analysis (cavern-analyzer.ts)
   ├─ Flood-fill to identify disconnected caves
   ├─ Union-Find for connectivity tracking
   └─ Keep largest N regions (discard small pockets)

4. Room Embedding (room-placer.ts)
   ├─ Place rectangular rooms in large caverns
   └─ Expand floor space for gameplay variety

5. Pathfinding Connection (path-finder.ts)
   ├─ A* corridors between disconnected regions
   └─ Guarantee full connectivity
```

**Characteristics**:
- Natural, asymmetric layouts
- Higher computational cost (flood-fill + pathfinding)
- Performance: O(w × h × iterations)
- Typical generation time: 8-17ms for 80×50 maps

### Content Generation System

**Implementation** (`apps/server/src/engine/dungeon/generators/content-generator.ts`):

Procedural entity placement using weighted spawn pools:

```typescript
const ENEMY_POOL: WeightedEntity[] = [
  { templateId: "goblin", weight: 100, minDifficulty: 1, maxDifficulty: 10 },
  { templateId: "orc", weight: 60, minDifficulty: 3, maxDifficulty: 10 },
  { templateId: "troll", weight: 20, minDifficulty: 7, maxDifficulty: 10 },
];
```

**Features**:
- Difficulty-based filtering
- Density scaling per room size
- Special room types (treasure rooms with guardians)
- Trap placement in corridors
- Decorations for atmosphere

## ECS System Details

### Component Storage Strategy

**SoA (Structure of Arrays)** - For hot-path components:
```typescript
// Position stored in Float32Array for cache efficiency
Position: { x: Float32Array[id*2], y: Float32Array[id*2+1] }
TurnEnergy: { energy: Float32Array[id] }
```

**AoS (Array of Structures)** - For complex data:
```typescript
Stats: Map<Entity, { hp: number, maxHp: number, atk: number, def: number }>
AI: Map<Entity, { state: string, target: Entity, path: Vec2[] }>
```

### Turn System Implementation

**Energy Accumulation Model** (`apps/server/src/engine/ecs/game/systems/turn.ts`):

```
Phase 1: WAITING
  ├─ Query all entities with TurnEnergy component
  ├─ Find entity with energy >= ENERGY_THRESHOLD (100)
  ├─ If none: fast-forward energy accumulation
  │   └─ Calculate min ticks needed for any entity to reach threshold
  │   └─ Grant (energyPerTurn * speed / 100) × minTicks to all
  └─ Select entity (highest energy, entity ID as tiebreaker)

Phase 2: ACTING
  ├─ Mark entity with ActiveTurn tag
  ├─ Emit turn.started event
  └─ Wait for action submission (player input or AI decision)

Phase 3: RESOLVING
  ├─ Process action via appropriate system (movement, combat, etc.)
  ├─ Consume ENERGY_THRESHOLD from active entity
  ├─ Grant energy to inactive entities (energyPerTurn * speed / 100)
  ├─ Remove ActiveTurn tag
  ├─ Emit turn.ended event
  └─ Transition to WAITING
```

**Speed Mechanics**:
- Base speed: 100 (normal)
- Slowed: 50 (half energy gain)
- Hasted: 150 (50% bonus energy gain)

### Query Caching System

**Archetype-Based Caching** (`apps/server/src/engine/ecs/core/query-cache.ts`):

```typescript
// Query: { with: ["Position", "Stats"], without: ["Dead"] }
// Cache key: "with:Position,Stats;without:Dead"

// Invalidation strategy:
- addComponent("Position") → invalidate queries with "Position"
- removeComponent("Stats") → invalidate queries with "Stats"
- despawn(entity) → invalidate all queries
```

## WebSocket Protocol

**Connection Flow** (`apps/server/src/web/ws.ts`):

```
1. Client → WS /ws/game
   ├─ Better-Auth session cookie validation
   ├─ Extract userId from session
   └─ Attach to WebSocket context

2. Session Events
   ├─ open: Register player in world
   ├─ message: Route input actions
   │   ├─ movement: submitAction(entity, { type: "move", ... })
   │   ├─ attack: submitAction(entity, { type: "attack", ... })
   │   └─ wait: submitAction(entity, { type: "wait" })
   └─ close: Cleanup player entity

3. State Broadcast (tick loop)
   ├─ Serialize ECS world state (visible entities only via FOV)
   ├─ Delta compression for bandwidth efficiency
   └─ ws.send(JSON.stringify(stateUpdate))
```

## Performance Benchmarks

**Dungeon Generation** (average of 10 runs, Bun 1.3.3):

| Configuration    | Size   | Algorithm | Generation | ECS Load | Total  | Rooms | Entities |
|------------------|--------|-----------|------------|----------|--------|-------|----------|
| small_bsp        | 60×40  | BSP       | 3.2ms      | <1ms     | 4ms    | 6     | ~30      |
| medium_bsp       | 80×50  | BSP       | 3.7ms      | <1ms     | 5ms    | 10    | ~50      |
| large_bsp        | 120×80 | BSP       | 4.7ms      | <2ms     | 7ms    | 15    | ~80      |
| small_cellular   | 60×40  | Cellular  | 8.5ms      | <1ms     | 10ms   | 6     | ~25      |
| medium_cellular  | 80×50  | Cellular  | 8.0ms      | <1ms     | 9ms    | 10    | ~45      |
| large_cellular   | 120×80 | Cellular  | 16.9ms     | <2ms     | 19ms   | 15    | ~70      |

**ECS Simulation** (1000 entities):
- Tick rate: 60 ticks/s
- Turn system: <0.5ms per turn
- Movement system: <0.3ms per tick
- FOV system: ~2ms per recalculation (shadowcasting)
- Total frame budget: ~16ms (sustained)

## Key Implementation Details

### Determinism Verification

```typescript
// Test from apps/server/test-dungeon-demo.ts
const seed = 12345;
const config = CONFIGS.medium_bsp;

for (let i = 0; i < 5; i++) {
  const result = DungeonManager.generateFromSeedSync(seed, config);
  console.log(`Run ${i + 1}: checksum = ${result.value.checksum}`);
}

// Output:
// Run 1: checksum = 1rn0bjm
// Run 2: checksum = 1rn0bjm
// Run 3: checksum = 1rn0bjm
// Run 4: checksum = 1rn0bjm
// Run 5: checksum = 1rn0bjm
// ✅ PASS - All checksums match!
```

### Zero-Copy Terrain Loading

```typescript
// Generation (dungeon/entities/dungeon.ts)
const terrain = {
  width: 80,
  height: 50,
  tiles: new Uint8Array(80 * 50) // Direct array allocation
};

// Loading (ecs/integration/dungeon-loader.ts)
const gameMap = world.resources.get<GameMap>("gameMap");
gameMap.setRawTiles(dungeon.terrain.tiles); // No copy, no parsing
```

### Share Code Format

```
Base64URL(seed_components | checksum)

where:
  seed_components = primary|layout|rooms|connections|details|timestamp
  checksum = CRC32(seed_components)

Example:
  "MTIzNDU2Nzg5fDk4NzY1NDMyMXw1NTU1NTU1fDc3Nzc3Nzd8ODg4ODg4OHwxNzA5NzQxMjM0fDEyMzQ1Njc4"
```

## License

MIT
