# Rogue III — Full Codebase Audit

> **Date**: 2026-02-06
> **Branch**: `origin/temp-ecs`
> **Audited by**: Claude Opus 4 (4 parallel deep-read agents)
> **Scope**: All packages and apps — architecture, performance, correctness, security, tests

---

## Table of Contents

- [Executive Summary](#executive-summary)
- [1. @rogue/ecs — Entity Component System](#1-rogueecs--entity-component-system)
- [2. @rogue/procgen — Procedural Generation](#2-rogueprocgen--procedural-generation)
- [3. @rogue/contracts — Shared Types & PRNG](#3-roguecontracts--shared-types--prng)
- [4. apps/server — Backend Infrastructure](#4-appsserver--backend-infrastructure)
- [5. Test Suites](#5-test-suites)
- [6. State-of-the-Art Comparison](#6-state-of-the-art-comparison)
- [7. Consolidated Issue List](#7-consolidated-issue-list)
- [8. Recommended Fix Priority](#8-recommended-fix-priority)

---

## Executive Summary

| Subsystem | Grade | Verdict |
|---|---|---|
| **@rogue/ecs** | **B+** | Solid archetype-based ECS, pragmatic for TypeScript. Not bitecs in raw perf, not Flecs in features, but good trade-off. |
| **@rogue/procgen** | **B+** | Well-architected pipeline, verified determinism. Algorithms correct but not yet at Brogue/DCSS sophistication. |
| **@rogue/contracts** | **A-** | Excellent PRNG (xoshiro128++), branded types, monadic Result<T,E>. Clean. |
| **apps/server** | **B** | Functional network infra with security and performance concerns. Zero tests on networking. |
| **Tests** | **B-** | ECS/procgen excellent. Server dangerously undertested. |

**Overall: B+ — Professional foundations with identifiable, correctable defects. No rewrites needed.**

---

## 1. @rogue/ecs — Entity Component System

### 1.1 Architecture

**Pattern**: Archetype-based ECS with hybrid SoA/AoS storage, inspired by Bevy and Flecs.

**Rating: SOLID**

Entities with the same component set share storage in archetypes. Component data is stored per-field in TypedArrays (SoA for numeric fields) or Maps (AoS for complex data). This is a reasonable compromise for TypeScript where pure SoA (like bitecs) sacrifices ergonomics.

**Strengths**:
- Clean archetype construction with component mask tracking (`archetype.ts:39-88`)
- ArchetypeGraph with edge caching for O(1) transition lookups (`archetype.ts:337-452`)
- Generational entity IDs: 20-bit index (1M entities) + 12-bit generation (4K reuse cycles)
- Branded `Entity` type prevents accidental ID misuse
- Fluent query builder with `.not()`, `.added()`, `.modified()`, `.changed()`, `.where()`
- Relations system with cascade delete, symmetric relations, wildcard queries
- Event system with deferred emission and observer hooks
- Run conditions inspired by Bevy (`runOnce()`, `inState()`, `anyWith()`, `everyNTicks()`)
- System sets with ordering constraints and condition propagation
- Serialization with version-based migration support

**Issues**:

#### PERF-ECS-1: BigInt change flags (HIGH)
**File**: `packages/ecs/src/core/archetype.ts:48`
```typescript
private componentChangeFlags: BigUint64Array;
// ...
this.componentChangeFlags[row]! |= 1n << BigInt(componentIndex);
```
BigInt operations are 10-50x slower than regular number operations in JavaScript. This is used in every `set()` call on every component. For a roguelike processing thousands of entities per tick, this is measurable.

**Recommendation**: Limit to 32 components per archetype and use `Uint32Array`, or use multiple `Uint32` words.

#### PERF-ECS-2: String key lookups in hot path (HIGH)
**File**: `packages/ecs/src/core/archetype.ts:203-214`
```typescript
getFieldValue(row: number, componentIndex: number, fieldName: string): number | undefined {
  const cc = this.componentData[componentIndex];
  if (!cc) return undefined;
  const colIdx = cc.fieldIndex.get(fieldName);  // Map.get(string) per access
  if (colIdx === undefined) return undefined;
  return cc.columns[colIdx]!.data[row];
}
```
Every field access does a `Map.get()` with a string key. Processing 10,000 entities with 3 fields = 30,000 string hash lookups per tick.

**Comparison**: Bevy uses compile-time component IDs; bitecs uses direct array access via symbol properties.

**Recommendation**: Pre-resolve field indices at query construction time, store as numeric offsets.

#### CORRECT-ECS-1: Generation overflow is a warning, not an error (MEDIUM)
**File**: `packages/ecs/src/core/world.ts:1340-1347`
```typescript
if (newGen === 0 && oldGen === 0xfff) {
  console.warn(
    `[ECS] Entity index ${index} generation overflow. ` +
    `Stale references may become valid again.`
  );
}
```
After 4096 spawn/despawn cycles on the same index, stale references silently become valid again. A roguelike with frequent mob spawning could hit this.

**Recommendation**: Either throw an error, track "poisoned" indices, or use larger generation bits (32-bit).

#### ARCH-ECS-1: Game-specific code in the ECS package (MEDIUM)
**Files**: `packages/ecs/src/markers.ts`, `packages/ecs/src/event/events.ts`

`markers.ts` contains `Player`, `Enemy`, `Pickable`, `Dead`, etc. — game-domain components.
`events.ts` defines `combat.damage`, `item.pickup`, etc. — game-domain events.

This couples the generic ECS library to the roguelike domain. Should be in `@rogue/game`.

#### PERF-ECS-3: Non-deterministic default iteration order (MEDIUM)
**File**: `packages/ecs/src/core/world.ts:1688-1700`
```typescript
*iter(): Generator<Entity> {
  const archetypes = this.cache.resolve(this.descriptor);
  for (const archetype of archetypes) {  // archetype order = creation order
    for (let i = 0; i < archetype.count; i++) { ... }
  }
}
```
Archetype iteration order depends on creation order, which could differ between runs (e.g., different component registration order). `iterDeterministic()` exists but isn't the default.

**Recommendation**: Document clearly, or make deterministic iteration the default for replay safety.

#### PERF-ECS-4: Relation queries allocate arrays (LOW)
**File**: `packages/ecs/src/relationship/relation-store.ts:443-451`
```typescript
getTargets<T>(source: Entity, relation: RelationType<T>): Entity[] {
  return [...targetSet].sort((a, b) => entityIndex(a) - entityIndex(b));
}
```
Every `getTargets()` call allocates and sorts. No iterator version available.

#### PERF-ECS-5: set() allocates for observers even when none registered (LOW)
**File**: `packages/ecs/src/core/world.ts:677-681`
```typescript
const previousData = this.getComponentDataRaw(record.archetype, record.row, meta);
```
Every `set()` call captures previous data for potential observers, even when no observers exist for that component.

#### ARCH-ECS-2: Global component registry prevents test isolation (LOW)
**File**: `packages/ecs/src/core/component.ts:10-11`
```typescript
let nextComponentIndex = 0;
const COMPONENT_META = new Map<ComponentClass, ComponentMeta>();
```
Components are registered globally. Impossible to have fully isolated ECS instances in tests.

#### MISC-ECS-1: Silent failures in some methods (LOW)
**File**: `packages/ecs/src/core/world.ts:646-657`
```typescript
setField<T>(...): void {
  if (!this.isAlive(entity)) return;  // Silent failure, returns void
}
```
Caller can't know if the operation succeeded. Contrast with `add()` which returns `boolean`.

### 1.2 Feature Completeness

| Feature | Status | Notes |
|---------|--------|-------|
| Archetype storage | Complete | Hybrid SoA/AoS |
| Generational entity IDs | Complete | 20+12 bits |
| Query system | Complete | Caching, filters, predicates |
| Change detection | Complete | Per-component, per-entity |
| Relations | Complete | Typed, cascade, symmetric, wildcards |
| Events | Complete | Deferred, observer hooks |
| Serialization | Complete | Version migration |
| System scheduling | Complete | Phases, conditions, sets |
| Command buffer | Complete | Manual usage |
| Spatial grid | Complete | For spatial queries |
| Prefabs | Complete | Template spawning |
| String pool | Complete | Interned, ref-counted |
| Worker/thread safety | Missing | No support |
| Archetype fragmentation mitigation | Missing | No compaction |
| System parallelization | Missing | Sequential only |

---

## 2. @rogue/procgen — Procedural Generation

### 2.1 Algorithm Quality

#### BSP Generator — Grade: B

**File**: `packages/procgen/src/generators/bsp/passes.ts`

**Strengths**:
- Clean recursive partitioning with configurable split ratios
- Aspect ratio consideration for split direction
- `maxDepth` parameter controls recursion depth

**Issues**:

##### ALGO-BSP-1: Suboptimal split threshold (MEDIUM)
**File**: `packages/procgen/src/generators/bsp/passes.ts:71-79`
```typescript
splitHorizontally = node.height > node.width * 1.25
  ? true
  : node.width > node.height * 1.25
    ? false
    : rng.next() > 0.5;
```
The 1.25 threshold is arbitrary. Industry-standard BSP (DCSS, Brogue) uses golden ratio (~1.618) or variance-based thresholds. Current value produces more uniform, "blocky" layouts.

##### ALGO-BSP-2: No degenerate leaf pruning (LOW)
**File**: `packages/procgen/src/generators/bsp/passes.ts:85-95`

If `minRoomSize` constraints cannot be met, the leaf is skipped. Industry standard would re-partition the parent node.

##### ALGO-BSP-3: Room placement lacks variety (LOW)
Rooms placed with simple random offset within leaf bounds. No adjacency scoring (cf. Brogue).

#### Cellular Automata — Grade: B+

**File**: `packages/procgen/src/generators/cellular/passes.ts`

**Strengths**:
- Correct B5/S4 rule implementation
- Double-buffering (efficient, no allocation)
- Edge clamping prevents border artifacts
- Region-based cleanup with flood-fill

**Issues**:

##### ALGO-CA-1: No stability detection (MEDIUM)
**File**: `packages/procgen/src/generators/cellular/constants.ts:20`

Fixed 4 iterations. Classic CA dungeon gen uses 4-7 iterations with early termination when stable. No stability detection implemented.

##### ALGO-CA-2: Single inflexible ruleset (MEDIUM)
Only B5/S4 supported. Brogue uses multiple rule sets (B5678/S45678 for open caverns, B3/S234 for corridors).

#### Hybrid Generator — Grade: A-

**File**: `packages/procgen/src/generators/hybrid/`

**Strengths**:
- Novel zone-splitting approach
- Clean separation of BSP/Cellular zones
- Inter-zone transitions well-handled

**Issues**:

##### ALGO-HYB-1: Zone boundary artifacts (LOW)
**File**: `packages/procgen/src/generators/hybrid/passes.ts:585-590`

Direct cell copying creates visible seams at zone boundaries. No blending or transition smoothing.

##### ALGO-HYB-2: Random zone algorithm assignment (LOW)
Algorithm assignment (bsp vs cellular) is random. Could use semantic assignment (entrance=BSP, caves=cellular).

#### Corridor Carving — Grade: B+

**File**: `packages/procgen/src/passes/carving/corridor-carvers.ts`

**Strengths**:
- Multiple algorithms: L-shaped, Bresenham, Branching
- Fast path (`carveLShapedCorridorFast`) for hot paths — zero allocation
- Width support for all algorithms

**Issues**:

##### ALGO-COR-1: No A* corridor carving (MEDIUM)
All corridors are L-shaped or Bresenham straight lines. Industry-standard dungeon gen (DCSS, Cogmind) uses A* to find wall-hugging, obstacle-avoiding paths.

##### ALGO-COR-2: No dead-end handling (LOW)
No post-processing to add or remove dead-end corridors for desired exploration feel.

#### Connectivity — Grade: A

**Files**: `packages/procgen/src/core/geometry/delaunay.ts`, `packages/procgen/src/core/algorithms/union-find.ts`

- Correct Bowyer-Watson Delaunay triangulation
- Efficient edge encoding with numeric keys
- Proper Kruskal's MST with Union-Find (path compression + union by rank)

### 2.2 Pipeline Architecture — Grade: A-

**File**: `packages/procgen/src/pipeline/builder.ts`

**Strengths**:
- Type-safe pass composition with generics
- Conditional passes via `when()` method
- Scoped RNG streams restrict access to declared streams (determinism)
- Async support with AbortSignal
- Trace/decision logging per pass

**Issues**:

##### ARCH-PIPE-1: Grid mutability violates immutability contract (HIGH)
**File**: `packages/procgen/src/core/grid/grid.ts`

All artifact interfaces use `readonly` modifiers, but Grid is mutable:
```typescript
grid.set(x, y, CellType.FLOOR); // Mutates in place
```
Multiple passes mutate `input.grid` directly. This violates the stated "immutable artifact" pattern.

**Recommendation**: Either clone grids before mutation, use copy-on-write, or explicitly document Grid as an exception.

##### ARCH-PIPE-2: No pass dependency/ordering validation (LOW)
Passes can be added in any order. No check that spawn-placement runs after room creation.

### 2.3 Determinism — Grade: B+

**Strengths**:
- xoshiro128++ with SplitMix32 seeding — industry standard
- 5-stream separation (layout, rooms, connections, details, content)
- Sorted tag hashing prevents non-determinism from array ordering
- 500-seed property tests verify checksum stability

**Issues**:

##### DET-1: Fragile Map/Set iteration patterns (MEDIUM)
**Files**: `packages/procgen/src/generators/hybrid/passes.ts:429-431`, `packages/procgen/src/passes/connectivity/graph-algorithms.ts:60-66`

`Set` and `Map` iteration order in JavaScript is insertion order, which is deterministic *for the current code*. But the pattern is fragile — any future refactor using `new Set(someMap.keys())` could break determinism silently.

**Recommendation**: Add linting rule or code comments marking all Set/Map iterations as "determinism-critical".

### 2.4 Performance — Grade: A-

**Strengths**:
- `BitGrid`: 32x memory reduction vs boolean arrays, Brian Kernighan bit counting
- `BitGrid` pool: Object pooling reduces GC pressure
- `TypedMinHeap` for Dijkstra: Cache-friendly typed arrays
- Index-based queue dequeue: O(1) without `shift()`
- `CoordSet` with bit packing: Efficient coordinate tracking

**Issues**:

##### PERF-PG-1: O(n^2) room overlap check (HIGH)
**File**: `packages/procgen/src/passes/validation/invariant-checks.ts:270-297`
```typescript
for (let i = 0; i < rooms.length; i++) {
  for (let j = i + 1; j < rooms.length; j++) {
    // AABB check
  }
}
```
Quadratic on room count. With 100+ rooms, this becomes slow.

**Recommendation**: Spatial hashing or R-tree.

##### PERF-PG-2: O(n^2) complete graph for MST (HIGH)
**File**: `packages/procgen/src/passes/connectivity/graph-algorithms.ts:22-38`
```typescript
for (let i = 0; i < rooms.length; i++) {
  for (let j = i + 1; j < rooms.length; j++) {
```
Delaunay triangulation (already implemented!) produces O(n) edges. The complete graph is unnecessary.

##### PERF-PG-3: String coordinate keys in hot paths (MEDIUM)
**Files**: `packages/procgen/src/pipeline/spawn-validator.ts:98-99`, `packages/procgen/src/quality/index.ts:228`
```typescript
const key = `${neighbor.x},${neighbor.y}`;
// and
const reachableSet = new Set(reachable.map((p) => `${p.x},${p.y}`));
```
String concatenation creates GC pressure. Use numeric keys: `y * width + x`.

### 2.5 Quality of Generated Dungeons — Grade: B

**Issues**:

##### QUAL-1: No path-length validation (MEDIUM)
Doesn't check that entrance-to-exit path isn't trivially short or impossibly long.

##### QUAL-2: Only two room types (MEDIUM)
```typescript
export type RoomType = "normal" | "cavern";
```
No semantic types (boss, treasure, library). Templates exist (L-shapes, T-shapes, crosses) but are underutilized — random selection, no type-based matching, no rotation fitting.

##### QUAL-3: No room distribution check (LOW)
Rooms can cluster in one area. No spatial distribution metric.

##### QUAL-4: Naive spawn placement (LOW)
No consideration of room strategic value (dead-ends for exits), path bottlenecks, or room size for important spawns.

### 2.6 Dead Code

| Symbol | File | Notes |
|--------|------|-------|
| `createGridArtifact` | `packages/procgen/src/pipeline/types/artifacts.ts` | Factory function appears unused |
| `DEFAULT_TEMPLATE_SELECTION.minLeafSize` | `packages/procgen/src/prefabs/types.ts:84-87` | Self-documented as unused |
| `coordFromKey` | `packages/procgen/src/core/data-structures/fast-queue.ts:152-160` | Inverse of `coordKey`, never called |

---

## 3. @rogue/contracts — Shared Types & PRNG

### 3.1 PRNG (SeededRandom) — Grade: A-

**File**: `packages/contracts/src/random/seeded-random.ts`

**Algorithm**: xoshiro128++ with SplitMix32 seeding

| PRNG | Period | Speed | Quality | JS Friendliness |
|------|--------|-------|---------|-----------------|
| **xoshiro128++ (chosen)** | 2^128-1 | Very Fast | Excellent | Excellent (32-bit) |
| PCG-32 | 2^64 | Fast | Excellent | Good |
| Mersenne Twister | 2^19937-1 | Medium | Good | Poor (large state) |
| SplitMix64 | 2^64 | Very Fast | Good | Poor (needs BigInt) |
| xorshift128+ | 2^128-1 | Very Fast | Poor (fails BigCrush) | Excellent |

**Why it's a good choice**:
1. Period 2^128-1 is more than sufficient
2. Passes BigCrush and PractRand battery tests
3. Pure 32-bit operations — 10-50x faster than BigInt in JS
4. Uses `++` output function (scrambled), not the weak `+` variant

**Implementation** (lines 67-82):
```typescript
const result = (rotl((s[0] + s[3]) >>> 0, 7) + s[0]) >>> 0;
```
Correct scrambler implementation.

**Issues**:

##### PRNG-1: BigInt seed truncation (LOW)
**File**: `packages/contracts/src/random/seeded-random.ts:47`
```typescript
const seedNum = typeof seed === "bigint" ? Number(seed & 0xffffffffn) : seed;
```
64-bit seeds lose their upper 32 bits.

##### PRNG-2: Warm-up could be longer (LOW)
8 iterations for warm-up. Literature recommends 12-20 for full state dispersion.

##### PRNG-3: Insufficient statistical testing (LOW)
**File**: `apps/server/tests/core/seeded-random.test.ts`

Tests only check mean/variance with 20,000 samples. No serial correlation test, no chi-squared uniformity, sample size too small for robust statistical validation.

### 3.2 Schema Design (Zod) — Grade: B+

**Files**: `packages/contracts/src/schemas/seed.ts`, `packages/contracts/src/schemas/dungeon.ts`

**Strengths**:
- Proper refinements with `ensureDimensionsSafe`
- `z.discriminatedUnion("algorithm", ...)` for efficient validation
- Transform chaining (clamp after validate)

**Issues**:

##### SCHEMA-1: No `.strict()` on schemas (MEDIUM)
Extra properties pass through without error. Security concern for user-controlled input.

##### SCHEMA-2: Manual WS validator must stay in sync (LOW)
`validateClientMessage` in `protocol.ts` is manually written (correct for performance) but creates maintenance burden if Zod schemas change.

### 3.3 Type System — Grade: A

**Strengths**:
- Branded types: `DungeonSeed` uses `unique symbol` — only `createValidatedSeed()` can produce one
- `Result<T,E>` with `fromThrowable`, `flatMap`/`andThen`, `tap`/`tapErr`, `toJSON()`
- Zero `any` types in the codebase
- Compact wire protocol property names (`t`, `d`, `e`)

**Minor issues**:
- `WireEntity` brand uses `__brand` string (weaker than `unique symbol`)
- `as E` cast in catch blocks (safe but could be explicit)

### 3.4 Seed Encoding — Grade: B

**File**: `packages/contracts/src/utils/encoding.ts`

- Base64URL with chunked processing (avoids stack overflow) — good
- CRC32 for share code checksums — acceptable for typo detection, not for tamper protection
- RLE encoding uses fixed 5 bytes per run (1 byte value + 4 bytes Uint32 length) — suboptimal for short runs. Variable-length encoding would be more compact.

---

## 4. apps/server — Backend Infrastructure

### 4.1 Elysia Setup — Grade: B+

**Strengths**:
- Security headers plugin: `nosniff`, `X-Frame-Options: DENY`, `HSTS`, `Permissions-Policy`
- CORS: credentials enabled, proper method allowlist, `maxAge: 86400`

**Issues**:

##### SEC-SRV-1: No global HTTP rate limiting (MEDIUM)
Auth has rate limiting, but no global rate limiter on Elysia middleware. Endpoints like `/health` can be spammed.

##### SEC-SRV-2: Missing CSP header (LOW)
No Content-Security-Policy. Vulnerability if server ever serves HTML.

##### SEC-SRV-3: No request body size limit (LOW)
Large POST bodies could cause memory issues.

### 4.2 WebSocket Architecture — Grade: B

**File**: `apps/server/src/server/ws/index.ts`

**Config**: `perMessageDeflate: true`, `maxPayloadLength: 1MB`, `idleTimeout: 300s`, `sendPings: true`

**Issues**:

##### SEC-WS-1: No backpressure handling (HIGH)
**File**: `apps/server/src/server/ws/index.ts:82-88`
```typescript
const wsAdapter = {
  send: (data: string) => {
    try { ws.send(data); } catch (err) { console.error("[WS] Send failed:", err); }
  },
};
```
No check for `ws.bufferedAmount`. If client is slow, server buffers grow unbounded.

##### NET-WS-1: No reconnection support (MEDIUM)
No session persistence, no resumption token, no state recovery after brief disconnects.

##### NET-WS-2: Auth race condition (LOW)
**File**: `apps/server/src/server/ws/index.ts:33-53`

`.derive()` runs before WebSocket handshake. Slow `verifyOneTimeToken` could cause upgrade timeout.

##### NET-WS-3: Memory leak risk on disconnect (LOW)
**File**: `apps/server/src/game/network/game-server.ts:315-316`

If `handleDisconnect` throws before cleanup, session remains in memory. Needs try/finally.

### 4.3 Auth (Better-Auth) — Grade: A-

**File**: `apps/server/src/server/auth/index.ts`

**Strengths**:
- 7-day session expiry, 1-day sliding update
- Rate limiting: sign-in 5/min, sign-up 3/min, forgot-password 3/5min (Redis-backed)
- HttpOnly cookies, SameSite Lax, secure in production
- One-time WebSocket token with 60s expiry

**Issues**:

##### SEC-AUTH-1: Secure cookie depends on SERVER_URL scheme (LOW)
```typescript
useSecureCookies: !isDev() && SERVER_URL.startsWith("https"),
```
If load balancer terminates HTTPS and `SERVER_URL` is `http://`, secure cookies disabled in production.

##### SEC-AUTH-2: bcrypt instead of Argon2id (LOW)
Better-Auth defaults to bcrypt. Argon2id is now preferred but bcrypt is still acceptable.

### 4.4 Database (Drizzle + PostgreSQL) — Grade: B+

**File**: `apps/server/src/server/db/`

**Strengths**:
- Pool: max 20, 2s connection timeout, 30s idle timeout
- Indices on `userId`, `token`, `expiresAt` in sessions
- Foreign keys with `ON DELETE CASCADE`
- Compound index on `(providerId, accountId)` in accounts

**Issues**:

##### SEC-DB-1: OAuth tokens stored in plain text (HIGH)
**File**: `apps/server/src/server/db/schema/auth/account.ts:13-15`
```typescript
accessToken: text("access_token"),
refreshToken: text("refresh_token"),
```
If database is compromised, attacker gets all OAuth tokens. Should be encrypted at rest.

##### SEC-DB-2: Pool errors silently swallowed in production (MEDIUM)
**File**: `apps/server/src/server/db/index.ts:13-17`
```typescript
pool.on("error", (err) => {
  if (process.env.NODE_ENV !== "production") {
    console.warn("[Database]", err.message);
  }
});
```
In production, database errors are invisible.

##### ARCH-DB-1: No game data schema (INFO)
Only auth tables exist. Game state (characters, inventory, dungeon progress) appears to be in-memory only. This is fine for current scope but needs planning for persistence.

### 4.5 Game Network Layer — Grade: B+

**Files**: `apps/server/src/game/network/`

**Strengths**:
- Delta compression: tracks `lastSentEntities`, computes add/update/remove sets
- Hash-based change detection for quick comparison
- FOV-based event filtering prevents information leakage
- Turn state sync only on actual changes
- Session statistics (messages, bytes, RTT)

**Issues**:

##### PERF-NET-1: O(n) terrain exploration check per session per tick (MEDIUM)
**File**: `apps/server/src/game/network/sync-manager.ts:801-809`
```typescript
for (let y = 0; y < gameMap.height; y++) {
  for (let x = 0; x < gameMap.width; x++) {
    if (gameMap.isExplored(x, y)) { currentExploredCount++; }
  }
}
```
100x100 map * 10 sessions = 100K iterations per tick. Should cache explored count.

##### PERF-NET-2: Full inventory sent on any change (LOW)
**File**: `apps/server/src/game/network/sync-manager.ts:733-740`
```typescript
if (prev.inventoryHash !== invHash) {
  delta.inv = inventory; // Full array
}
```

##### PERF-NET-3: Terrain delta not implemented (LOW)
**File**: `apps/server/src/game/network/sync-manager.ts:810-815`

Comment admits: "For now, we skip this optimization". New explored tiles aren't sent incrementally.

##### ARCH-NET-1: world.tick() called on non-turn actions (LOW)
**File**: `apps/server/src/game/network/message-handler.ts:521, 544`

`world.tick()` is called for equip/drop (non-turn-consuming). Could cause race conditions if another action is processing.

---

## 5. Test Suites

### 5.1 Coverage by Subsystem

| Subsystem | Grade | Test Files | Coverage |
|-----------|-------|------------|----------|
| **@rogue/ecs** | **A** | 25 files | Comprehensive — entity lifecycle, queries, relations, serialization, change detection, benchmarks |
| **@rogue/procgen** | **A-** | 32 files | Strong property testing (500 seeds determinism, 1000 seeds invariants), all core algorithms |
| **apps/server** | **D** | ~10 original (25 are ECS copies) | **ZERO tests** on game-server, game-session, message-handler, sync-manager, ws, auth |

### 5.2 Test Quality Highlights

**ECS**: Excellent isolation (fresh `World` per test), meaningful assertions, proper edge-case coverage.

**Procgen Property Tests**:
- `determinism.property.test.ts`: 500 seeds verify checksum stability
- `invariants.property.test.ts`: 1000 seeds verify entrance/exit existence, spawn validity, connectivity
- `performance.property.test.ts`: P95 time budgets across 100 seeds

### 5.3 Critical Test Gaps

| Missing Tests | Risk Level |
|---------------|------------|
| WebSocket message serialization/deserialization | HIGH |
| GameSession lifecycle (connect/disconnect/reconnect) | HIGH |
| Authentication flow (session creation, token validation) | HIGH |
| SyncManager delta correctness | HIGH |
| MessageHandler action routing | MEDIUM |
| GameServer connection management | MEDIUM |
| Procgen hybrid generator specifically | LOW |
| Procgen corridor carving edge cases | LOW |
| ECS iterator invalidation during iteration | LOW |

### 5.4 Test Infrastructure

- Runner: `bun:test` (Bun's built-in)
- No test coverage reporting
- No performance trend tracking
- No CI configuration detected
- Helper utilities: `createSeed()`, `unwrap()`, `createMinimalDungeon()`
- Mocking: Minimal (appropriate for deterministic systems)

### 5.5 Note on Duplicate Tests

`apps/server/tests/ecs/` contains 25 files that appear to be copies of `packages/ecs/tests/`. This inflates the apparent test count and should be cleaned up.

---

## 6. State-of-the-Art Comparison

### 6.1 ECS vs Industry References

```
Feature              @rogue/ecs    bitecs    Bevy ECS    Flecs
─────────────────────────────────────────────────────────────────
Raw iteration speed    ██░░░░       █████░    ████░░     █████░
Type safety            ████░░       ██░░░░    █████░     ███░░░
Relations              ████░░       ░░░░░░    ███░░░     █████░
Change detection       ███░░░       ░░░░░░    █████░     ████░░
Query caching          ████░░       ░░░░░░    █████░     █████░
System scheduling      ███░░░       ░░░░░░    █████░     ████░░
Memory efficiency      ███░░░       █████░    ████░░     █████░
Feature richness       ████░░       ██░░░░    █████░     █████░
```

**Verdict**: The ECS is at an appropriate level for TypeScript. The hot-path string lookups and BigInt flags are the real performance bottlenecks. Relations and query system are strong differentiators vs bitecs.

### 6.2 Procgen vs Notable Roguelikes

```
Feature              @rogue/procgen  Brogue    DCSS      Cogmind
─────────────────────────────────────────────────────────────────
BSP quality            ███░░░        ████░░    ████░░    █████░
Cave generation        ████░░        █████░    ████░░    ███░░░
Connectivity           █████░        ████░░    █████░    ████░░
Corridor quality       ███░░░        █████░    ████░░    █████░
Room variety           ██░░░░        █████░    █████░    █████░
Determinism            █████░        █████░    ████░░    █████░
Pipeline architecture  █████░        ███░░░    ███░░░    ████░░
Validation/Quality     ████░░        ███░░░    ████░░    ████░░
```

**Verdict**: The pipeline architecture is superior to most roguelikes. Algorithm sophistication (room variety, A* corridors, multi-ruleset CA) needs work. Determinism verification is excellent.

---

## 7. Consolidated Issue List

### All Issues by ID

| ID | Subsystem | Severity | Summary |
|----|-----------|----------|---------|
| PERF-ECS-1 | ecs | HIGH | BigInt change flags — 10-50x slower than Uint32 |
| PERF-ECS-2 | ecs | HIGH | String key Map.get() in every field access |
| CORRECT-ECS-1 | ecs | MEDIUM | Generation overflow = warning, not error |
| ARCH-ECS-1 | ecs | MEDIUM | Game-specific code in ECS package |
| PERF-ECS-3 | ecs | MEDIUM | Non-deterministic default iteration |
| PERF-ECS-4 | ecs | LOW | Relation queries allocate arrays |
| PERF-ECS-5 | ecs | LOW | set() allocates for observers unconditionally |
| ARCH-ECS-2 | ecs | LOW | Global component registry |
| MISC-ECS-1 | ecs | LOW | Silent failures in setField |
| PERF-PG-1 | procgen | HIGH | O(n^2) room overlap check |
| PERF-PG-2 | procgen | HIGH | O(n^2) complete graph (Delaunay exists) |
| ARCH-PIPE-1 | procgen | HIGH | Grid mutability violates immutability contract |
| PERF-PG-3 | procgen | MEDIUM | String coord keys in hot paths |
| DET-1 | procgen | MEDIUM | Fragile Map/Set iteration patterns |
| ALGO-BSP-1 | procgen | MEDIUM | Suboptimal BSP split threshold |
| ALGO-CA-1 | procgen | MEDIUM | No CA stability detection |
| ALGO-CA-2 | procgen | MEDIUM | Single inflexible CA ruleset |
| ALGO-COR-1 | procgen | MEDIUM | No A* corridor carving |
| QUAL-1 | procgen | MEDIUM | No path-length validation |
| QUAL-2 | procgen | MEDIUM | Only two room types |
| ALGO-HYB-1 | procgen | LOW | Zone boundary artifacts |
| ALGO-HYB-2 | procgen | LOW | Random zone algorithm assignment |
| ALGO-BSP-2 | procgen | LOW | No degenerate leaf pruning |
| ALGO-COR-2 | procgen | LOW | No dead-end handling |
| QUAL-3 | procgen | LOW | No room distribution metric |
| QUAL-4 | procgen | LOW | Naive spawn placement |
| ARCH-PIPE-2 | procgen | LOW | No pass ordering validation |
| SCHEMA-1 | contracts | MEDIUM | No `.strict()` on Zod schemas |
| PRNG-1 | contracts | LOW | BigInt seed truncation |
| PRNG-2 | contracts | LOW | Short warm-up (8 vs 12-20) |
| PRNG-3 | contracts | LOW | Insufficient statistical testing |
| SCHEMA-2 | contracts | LOW | Manual WS validator sync burden |
| SEC-DB-1 | server | HIGH | OAuth tokens in plain text |
| SEC-WS-1 | server | HIGH | No WebSocket backpressure |
| SEC-DB-2 | server | MEDIUM | Pool errors swallowed in production |
| SEC-SRV-1 | server | MEDIUM | No global HTTP rate limiting |
| PERF-NET-1 | server | MEDIUM | O(n) terrain check per session per tick |
| NET-WS-1 | server | MEDIUM | No reconnection support |
| PERF-NET-3 | server | LOW | Terrain delta not implemented |
| PERF-NET-2 | server | LOW | Full inventory on any change |
| SEC-AUTH-1 | server | LOW | Secure cookie depends on URL scheme |
| SEC-SRV-2 | server | LOW | Missing CSP header |
| SEC-SRV-3 | server | LOW | No request body size limit |
| NET-WS-2 | server | LOW | Auth race condition on upgrade |
| NET-WS-3 | server | LOW | Memory leak on disconnect |
| ARCH-NET-1 | server | LOW | world.tick() on non-turn actions |
| TEST-1 | tests | HIGH | Zero tests on entire network layer |
| TEST-2 | tests | HIGH | Zero tests on auth flow |
| TEST-3 | tests | MEDIUM | Duplicate ECS tests in server |

---

## 8. Recommended Fix Priority

### Tier 0 — Security (fix before any deployment)

1. **SEC-DB-1**: Encrypt OAuth tokens at rest
2. **SEC-WS-1**: Add `bufferedAmount` check before `ws.send()`
3. **SEC-DB-2**: Log pool errors in production (monitoring system)

### Tier 1 — Performance hot paths (fix before gameplay implementation)

4. **PERF-ECS-1**: Replace `BigUint64Array` change flags with `Uint32Array`
5. **PERF-ECS-2**: Pre-resolve field indices at query time, store as numeric offsets
6. **PERF-PG-2**: Use Delaunay for MST instead of O(n^2) complete graph
7. **PERF-PG-3**: Replace `${x},${y}` string keys with `y * width + x` numeric keys
8. **PERF-NET-1**: Cache explored tile count, only recount on exploration events

### Tier 2 — Correctness & Architecture (fix before game logic)

9. **CORRECT-ECS-1**: Make generation overflow an error, not a warning
10. **ARCH-ECS-1**: Move game-specific markers/events to `@rogue/game`
11. **ARCH-PIPE-1**: Document Grid mutability exception or enforce cloning
12. **PERF-PG-1**: Replace O(n^2) overlap check with spatial hashing
13. **TEST-1 + TEST-2**: Add basic tests for GameServer, MessageHandler, SyncManager, auth

### Tier 3 — Algorithm sophistication (fix during content creation)

14. **ALGO-CA-1**: Add CA stability detection
15. **ALGO-CA-2**: Support multiple CA rulesets
16. **ALGO-COR-1**: Add A* corridor carving option
17. **ALGO-BSP-1**: Use golden ratio for BSP splits
18. **QUAL-1**: Add path-length validation
19. **QUAL-2**: Expand room type system

### Tier 4 — Polish (fix as needed)

20. Remaining LOW-severity issues from the consolidated list

---

*End of audit document.*
