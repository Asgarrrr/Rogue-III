# Procgen Invariants

> **Purpose:** Formalize non-negotiable correctness guarantees
> **Last updated:** 2026-01-16

This document specifies what MUST be true for procgen to be considered correct. Violations indicate bugs.

---

## 1. Determinism Contract

### The Fundamental Guarantee

```
∀ config, seed: generate(config, seed) ≡ generate(config, seed)
```

**Same seed + same config = identical output, always.** This is verified by checksum comparison.

### What Must Be Stable Across Runs

| Data | Stability Requirement |
|------|----------------------|
| `terrain` (Uint8Array) | Byte-for-byte identical |
| `rooms[]` | Same count, same positions (x, y, width, height), same order |
| `connections[]` | Same edges (fromRoomId, toRoomId), same order |
| `spawns[]` | Same positions, same types, same tags |
| `checksum` | Identical string |

### What Is Allowed to Vary

| Data | Variance Reason |
|------|-----------------|
| `durationMs` | Performance timing is non-deterministic |
| `trace` events | Timing metadata varies; structure stable |
| `snapshots` timestamps | Uses `performance.now()` |

### What Breaks Determinism (Anti-Patterns)

1. **Using `Math.random()` in generation logic**
   - `Math.random()` is only safe in `randomSeed()` and `randomEncodedSeed()`
   - All generation must use `SeededRandom` via `ctx.streams.*`

2. **Using Date/Time in decisions**
   - `Date.now()` and `performance.now()` are for metrics only
   - Never branch on time values

3. **Non-deterministic iteration order**
   - Iterating `Object.keys()` on objects with numeric-looking keys
   - Iterating `Set` or `Map` built from non-deterministic sources
   - Arrays must maintain insertion order

4. **External I/O**
   - No file reads, network calls, or async operations that depend on external state
   - Passes must be pure functions of (input, RNG)

5. **Cross-stream RNG contamination**
   - Using `ctx.streams.rooms` in a pass that declared `requiredStreams: ["layout"]`
   - The number of RNG calls per stream must be consistent across runs

---

## 2. RNG Rules

### Seeding Hierarchy

```
DungeonSeed
├── primary: bigint     → ctx.rng (legacy, use sparingly)
├── layout: bigint      → ctx.streams.layout
├── rooms: bigint       → ctx.streams.rooms
├── connections: bigint → ctx.streams.connections
└── details: bigint     → ctx.streams.details
```

All sub-seeds derive from the primary seed via deterministic mixing.

### Stream Isolation Contract

| Stream | Used For | Passes |
|--------|----------|--------|
| `layout` | BSP partitioning, cellular init, zone splitting | `partitionBSP`, `initializeRandom`, `hybrid-zone-split` |
| `rooms` | Room sizing, template selection, placement | `placeRooms`, `selectTemplateForLeaf` |
| `connections` | MST decisions, corridor routing, extra edges | `buildConnectivity`, `carveCorridors`, `connectRegions` |
| `details` | Spawn placement, decorations | `placeEntranceExit` |

**Rule:** A pass MUST declare `requiredStreams` and MUST NOT access other streams.

### RNG Call Ordering

Within a pass, RNG calls must happen in the same order every time:

```typescript
// CORRECT: Fixed order
const roomWidth = rng.range(5, 10);
const roomHeight = rng.range(5, 10);

// WRONG: Order depends on runtime condition
if (someCondition) {
  rng.next(); // May or may not consume
}
const value = rng.next(); // Position varies!
```

**Rule:** The number of `rng.next()` calls must be deterministic for a given input.

### Prohibited RNG Usage

```typescript
// NEVER
Math.random()                    // Non-seeded
crypto.getRandomValues()         // Non-seeded
new Date().getTime() % something // Time-based
```

---

## 3. Pipeline Invariants

### Pass Execution Model

```
EmptyArtifact → Pass₁ → Artifact₁ → Pass₂ → ... → DungeonArtifact
```

| Invariant | Description |
|-----------|-------------|
| **Sequential execution** | Passes run in declared order, no parallelism |
| **Artifact flow** | Pass N receives output of Pass N-1 |
| **Context immutability** | `ctx` object is frozen for the pipeline duration |
| **RNG advancement** | Each pass advances its declared streams; other streams untouched |

### Pass Purity Requirements

A pass `P: (Artifact, Context) → Artifact'` must satisfy:

1. **Deterministic:** `P(a, ctx) ≡ P(a, ctx)` for same RNG state
2. **No side effects:** No mutations outside the returned artifact (except tracing)
3. **No external dependencies:** No I/O, no globals, no singletons

### Artifact Mutation Rules

| Location | Mutation Allowed? | Notes |
|----------|-------------------|-------|
| Inside pass execution | YES (Grid.set()) | Performance tradeoff |
| Between passes | NO (by convention) | Spread `{...artifact, field: newValue}` |
| After pipeline completion | NO | DungeonArtifact is sealed |

**Grid mutation caveat:** `Grid` is internally mutable (`Uint8Array`). Passes may call `grid.set()` during execution. This is acceptable because:
- Single-threaded execution
- No pass observes another pass's mutations mid-execution
- Checksum captures final state

### Factory Function Contract

Pass factories MUST return a fresh pass object each call:

```typescript
// CORRECT
export function myPass(): Pass<...> {
  return { id: "my-pass", run(...) { ... } };
}

// WRONG: Singleton (shared state risk)
const singleton = { id: "my-pass", run(...) { ... } };
export function myPass() { return singleton; }
```

---

## 4. Data Structure Invariants

### Grid Invariants

| Invariant | Description |
|-----------|-------------|
| **Bounds** | `0 ≤ x < width`, `0 ≤ y < height` |
| **Cell values** | Must be valid `CellType` (0=WALL, 1=FLOOR, etc.) |
| **Initialization** | All cells start as WALL |
| **Border** | Edge cells remain WALL (no floor tiles on grid boundary) |

### Room Invariants

| Invariant | Description |
|-----------|-------------|
| **Positive dimensions** | `width > 0`, `height > 0` |
| **Within bounds** | `x ≥ 0`, `y ≥ 0`, `x + width ≤ gridWidth`, `y + height ≤ gridHeight` |
| **Unique IDs** | No two rooms share the same `id` |
| **Center calculation** | `centerX = x + width/2`, `centerY = y + height/2` |
| **No overlap (BSP)** | BSP rooms must not overlap (cellular/hybrid may overlap) |

### Connection Invariants

| Invariant | Description |
|-----------|-------------|
| **Valid room IDs** | `fromRoomId` and `toRoomId` reference existing rooms |
| **No self-loops** | `fromRoomId ≠ toRoomId` |
| **Undirected representation** | (A→B) exists but (B→A) does not; graph treated as undirected |

### Spawn Invariants

| Invariant | Description |
|-----------|-------------|
| **On floor** | `grid.get(spawn.position.x, spawn.position.y) === CellType.FLOOR` |
| **Valid room** | `spawn.roomId` references an existing room |
| **Entrance exists** | Exactly one spawn with `type === "entrance"` |
| **Exit exists** | Exactly one spawn with `type === "exit"` |
| **Reachability** | Exit reachable from entrance via floor tiles |

### Connectivity Invariants

| Invariant | Description |
|-----------|-------------|
| **Connected graph** | All rooms reachable from any other room via connections |
| **Floor connectivity** | All floor tiles reachable from entrance via flood fill |
| **MST guarantee** | Connection graph contains a spanning tree (N-1 edges for N rooms minimum) |

---

## 5. Enforcement Points

### Compile-Time (TypeScript)

| Check | Mechanism | Location |
|-------|-----------|----------|
| Artifact type flow | `Pass<TIn, TOut>` generics | `pipeline/types/index.ts` |
| Stream declaration | `Pass<..., TStreams>` generic | `pipeline/types/index.ts` |
| Readonly artifacts | `readonly` modifiers | `pipeline/types/artifacts.ts` |
| Config shape | Interface definitions | `pipeline/types/config.ts` |

**Limitation:** TypeScript cannot prevent:
- Pass mis-ordering (all are `Pass<DungeonStateArtifact, DungeonStateArtifact>`)
- Grid mutation (internal `Uint8Array` is mutable)
- Stream access via type assertion

### Runtime (Validation)

| Check | Function | When |
|-------|----------|------|
| Entrance exists | `checkEntranceExists()` | Post-generation |
| Exit exists | `checkExitExists()` | Post-generation |
| Spawns on floor | `checkAllSpawnsOnFloor()` | Post-generation |
| Room connectivity | `checkRoomConnectivity()` | Post-generation |
| Connection graph | `checkConnectionGraph()` | Post-generation |
| Rooms in bounds | `checkRoomsInBounds()` | Post-generation |
| No room overlap | `checkNoRoomOverlap()` | Post-generation (BSP only) |
| Determinism | `assertDeterministic()` | CI tests |

### Recommended Assertions

```typescript
// In tests
assertDeterministic(config, 5);  // 5 runs, same checksum

// Post-generation
const result = generate(config);
if (result.success) {
  const checks = runAllChecks(result.artifact);
  if (!checks.success) {
    throw new Error(`Invariant violations: ${checks.violations.map(v => v.message).join(', ')}`);
  }
}
```

---

## 6. Anti-Patterns Specific to This Codebase

### ❌ Using `ctx.rng` instead of streams

```typescript
// WRONG
run(input, ctx) {
  const value = ctx.rng.next();  // Shared RNG, breaks isolation
}

// CORRECT
run(input, ctx) {
  const value = ctx.streams.rooms.next();  // Scoped stream
}
```

### ❌ Object.keys() on numeric-keyed objects

```typescript
// POTENTIALLY WRONG (iteration order may vary)
const obj = { 2: 'b', 1: 'a', 3: 'c' };
Object.keys(obj).forEach(...);  // Order: ["1", "2", "3"] (numeric sort)

// CORRECT: Use array or Map
const items = [[1, 'a'], [2, 'b'], [3, 'c']];  // Explicit order
```

### ❌ Building Set/Map from async or external sources

```typescript
// WRONG
const set = new Set(await fetchSomething());  // Non-deterministic source

// CORRECT
const set = new Set(rooms.map(r => r.id));  // Deterministic source
```

### ❌ Conditional RNG consumption

```typescript
// WRONG: RNG call count varies
if (room.width > 10) {
  extraFeature = rng.next();  // Only called sometimes
}

// CORRECT: Always consume, use result conditionally
const featureRoll = rng.next();
if (room.width > 10) {
  extraFeature = featureRoll;
}
```

### ❌ Sorting without explicit comparator

```typescript
// WRONG: Default sort is lexicographic
numbers.sort();  // [1, 10, 2] not [1, 2, 10]

// CORRECT
numbers.sort((a, b) => a - b);
```

### ❌ Capturing external state in pass closures

```typescript
// WRONG
let sharedCounter = 0;
export function myPass() {
  return {
    run(input, ctx) {
      sharedCounter++;  // Shared across pipeline instances!
    }
  };
}

// CORRECT
export function myPass() {
  let localCounter = 0;  // Fresh per pipeline
  return {
    run(input, ctx) {
      localCounter++;
    }
  };
}
```

### ❌ Using array index as room ID

```typescript
// FRAGILE
rooms.forEach((room, i) => { room.id = i; });  // Breaks if order changes

// ROBUST
let nextId = 0;
rooms.forEach(room => { room.id = nextId++; });  // Explicit counter
```

---

## Checksum Algorithm Reference

The checksum is the ultimate determinism oracle. It hashes:

```
Version (int32)
→ Terrain bytes (full grid)
→ For each room: x, y, width, height (int32 each)
→ For each connection: fromRoomId, toRoomId (int32 each)
→ For each spawn: x, y, roomId (int32), type (string), sorted tags (strings)
```

Format: `v{version}:{hex}` (e.g., `v2:a1b2c3d4e5f6...`)

**If checksums differ, determinism is broken.** Debug by comparing:
1. Terrain bytes (cell-by-cell diff)
2. Room list (count, then field-by-field)
3. Connection list
4. Spawn list

---

*This document is normative. Code that violates these invariants is buggy.*
