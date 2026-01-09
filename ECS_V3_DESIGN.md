# ECS v3 Architecture Design Document
## Rogue III — North Star Implementation Guide

**Version:** 1.0 FINAL  
**Date:** 2026-01-09  
**Base:** Enhance `apps/server/src/game/ecs-v2/` (do NOT start fresh)  
**Target Runtime:** Bun 1.3.6+, TypeScript 5.9.3, Windows (multi-platform compatible)

---

## 1. Executive Summary

1. **Build on ECS v2** — v2 has solid archetype storage with TypedArray columns; enhance, don't rewrite
2. **Archetype-based storage with SoA columns** — validated by Bevy, flecs, bitECS research
3. **Entity IDs: 20-bit index + 12-bit generation** — already implemented correctly in v2
4. **Add Query Caching** — v2 scans all archetypes every query; add cache with selective invalidation
5. **Add Resource System** — for GameMap, TurnState, EventQueue, RNG singletons
6. **Add Event System** — typed discriminated unions with deterministic processing order
7. **Add System Scheduler** — phase-based with topological dependency sort (port from v1)
8. **Upgrade Change Detection** — add version counters per archetype for network delta sync
9. **Add Serialization** — JSON-first with template-based delta compression
10. **Determinism First** — all iteration orders stable, seeded RNG mandatory, replay-safe

---

## 2. Glossary

| Term | Definition |
|------|------------|
| **Entity** | 32-bit ID: `[generation:12][index:20]`. Max 1,048,576 entities, 4096 generations. |
| **Component** | Typed data container. Numeric fields only (TypedArrays). Complex data → Resources. |
| **Archetype** | Unique component combination. Entities with same components share one archetype. |
| **Column** | TypedArray storing one field of one component for all entities in an archetype. |
| **Query** | Filter specification (`with`/`without`/`changed`) resolving to matching archetypes. |
| **System** | Function that queries entities and transforms data. Runs in a Phase. |
| **Phase** | Execution stage: PreUpdate → Update → PostUpdate. Systems grouped by phase. |
| **Resource** | Singleton data (not per-entity). GameMap, TurnState, RNG. |
| **Command** | Deferred mutation (spawn/despawn/add/remove). Buffered during tick, flushed at end. |
| **Event** | Transient notification. Emitted by systems, processed deterministically. |
| **Tick** | One simulation step: run all systems → flush commands → clear change flags. |

---

## 3. Scope and Non-Goals

### In Scope (v3)
- Query caching with selective invalidation
- Resource registry for singletons
- Event queue with typed events
- System scheduler with phases and dependencies
- Version counters for network delta detection
- JSON serialization with delta compression
- Migration path from v1 game systems

### Non-Goals (Explicitly Excluded)
- Parallel system execution (Bun is single-threaded)
- Binary serialization (JSON-first, binary later if needed)
- Rollback/undo (not planned)
- Client-side prediction (server authoritative)
- WASM integration (pure TypeScript)
- Modding API (design for extensibility, defer formal API)

---

## 4. Requirements and Invariants

### 4.1 Determinism (CRITICAL)

```
INVARIANT: Given identical (seed, initial_state, action_sequence),
           world state after N ticks MUST be bit-identical.
```

**Enforced by:**
- Archetype iteration order: by `archetype.id` (creation order)
- Entity iteration within archetype: by row index (insertion order)
- Event processing: per-type queues, FIFO within type
- System execution: topological sort by dependencies
- RNG: `SeededRandom` only, never `Math.random()`

### 4.2 Performance Baselines (from v2 benchmarks)

| Operation | Budget | Source |
|-----------|--------|--------|
| Spawn 100k entities | <500ms | `tests/ecs-v2/benchmark.test.ts` |
| Despawn 50k entities | <200ms | `tests/ecs-v2/benchmark.test.ts` |
| Iterate 10k entities × 100 ticks | <50ms | `tests/ecs-v2/benchmark.test.ts` |
| Add component to 10k entities | <100ms | `tests/ecs-v2/benchmark.test.ts` |
| Serialize 5k entities (JSON) | <100ms | NEW target |

### 4.3 Constraints

- Max entities: 10,000 (roguelike scale)
- Max component types: 64 (fits in single bigint mask)
- Max archetypes: ~100 (warn if exceeded)
- Tick budget: <16ms for responsive turn-based play

---

## 5. Current v2 State (What Exists)

**Location:** `apps/server/src/game/ecs-v2/`

| File | Status | Notes |
|------|--------|-------|
| `types.ts` | COMPLETE | Entity encoding, FieldType enum, Phase enum |
| `field.ts` | COMPLETE | Field descriptors (f32, i32, u8, bool, entityRef) |
| `component.ts` | COMPLETE | `@component` decorator, metadata registry |
| `archetype.ts` | COMPLETE | Archetype + ArchetypeGraph with edge caching |
| `world.ts` | PARTIAL | Has spawn/despawn/query, missing resources/events |
| `command-buffer.ts` | PARTIAL | Basic structure, needs integration |
| `index.ts` | COMPLETE | Public exports |

### v2 Strengths (Keep)
- Entity ID encoding (20/12 split)
- TypedArray columns per field
- Change flags (Added/Modified) per entity
- Archetype graph with add/remove edge caching
- Bitmask-based query matching
- Swap-remove for O(1) despawn

### v2 Gaps (Must Add for v3)

| Gap | Priority | Effort |
|-----|----------|--------|
| Query caching | HIGH | 1-2 days |
| Resource registry | HIGH | 0.5 day |
| Event queue | HIGH | 1 day |
| System scheduler | HIGH | 1-2 days |
| Version counters for networking | MEDIUM | 1 day |
| Serialization | MEDIUM | 2 days |
| Template system | MEDIUM | 1-2 days |
| Integration with v1 game systems | HIGH | 3-5 days |

---

## 6. Architecture Design

### 6.1 World Class Structure

```typescript
// Target structure for v3 World
class World {
  // FROM v2 (keep as-is)
  private readonly graph: ArchetypeGraph;
  private readonly entityRecords: EntityRecord[];
  private readonly generations: Uint16Array;
  private readonly alive: Uint32Array;
  private readonly freeList: Uint32Array;
  
  // ADD for v3
  private readonly resources: ResourceRegistry;      // NEW
  private readonly events: EventQueue;               // NEW
  private readonly scheduler: SystemScheduler;       // NEW
  private readonly queryCache: QueryCache;           // NEW
  private readonly commands: CommandBuffer;          // EXISTS, enhance
  
  // Version tracking for networking
  private tick: number = 0;
  private globalVersion: number = 0;                 // NEW
}
```

### 6.2 Query Caching Strategy

**Problem:** v2's `getMatchingArchetypes()` scans ALL archetypes every query call.

**Solution:** Cache query results, invalidate selectively.

```typescript
class QueryCache {
  private cache: Map<string, CachedQuery> = new Map();
  private archetypeToQueries: Map<number, Set<string>> = new Map(); // Inverse index
  
  resolve(descriptor: QueryDescriptor): Archetype[] {
    const key = this.descriptorKey(descriptor);
    let cached = this.cache.get(key);
    
    if (!cached || cached.dirty) {
      const archetypes = this.graph.getMatchingArchetypes(
        descriptor.withMask,
        descriptor.withoutMask
      );
      cached = { archetypes, dirty: false };
      this.cache.set(key, cached);
      
      // Register for invalidation
      for (const arch of archetypes) {
        this.registerArchetype(arch.id, key);
      }
    }
    
    return cached.archetypes;
  }
  
  // Called when new archetype created
  onArchetypeCreated(archetype: Archetype): void {
    // Mark ALL queries as dirty (new archetype might match)
    for (const cached of this.cache.values()) {
      cached.dirty = true;
    }
  }
}
```

### 6.3 Resource Registry

```typescript
class ResourceRegistry {
  private resources: Map<string, unknown> = new Map();
  
  set<T>(key: string, value: T): void {
    this.resources.set(key, value);
  }
  
  get<T>(key: string): T | undefined {
    return this.resources.get(key) as T | undefined;
  }
  
  require<T>(key: string): T {
    const value = this.get<T>(key);
    if (value === undefined) {
      throw new Error(`Resource not found: ${key}`);
    }
    return value;
  }
}

// Usage
world.resources.set("gameMap", gameMap);
world.resources.set("turnState", turnState);
world.resources.set("rng", seededRandom);
```

### 6.4 Event Queue

```typescript
type GameEvent =
  | { type: "entity.spawned"; entity: Entity; templateId?: string }
  | { type: "entity.despawned"; entity: Entity }
  | { type: "combat.damage"; attacker: Entity; target: Entity; damage: number }
  | { type: "turn.started"; entity: Entity; tick: number }
  | { type: "turn.ended"; entity: Entity; tick: number }
  // ... more event types

class EventQueue {
  private queues: Map<string, GameEvent[]> = new Map();
  private subscribers: Map<string, ((event: GameEvent) => void)[]> = new Map();
  
  emit(event: GameEvent): void {
    const queue = this.queues.get(event.type) ?? [];
    queue.push(event);
    this.queues.set(event.type, queue);
  }
  
  subscribe(type: string, handler: (event: GameEvent) => void): void {
    const handlers = this.subscribers.get(type) ?? [];
    handlers.push(handler);
    this.subscribers.set(type, handlers);
  }
  
  // Called at end of tick, processes events deterministically
  flush(): void {
    // Process in type order (sorted) for determinism
    const sortedTypes = [...this.queues.keys()].sort();
    for (const type of sortedTypes) {
      const queue = this.queues.get(type) ?? [];
      const handlers = this.subscribers.get(type) ?? [];
      for (const event of queue) {
        for (const handler of handlers) {
          handler(event);
        }
      }
      queue.length = 0; // Clear processed events
    }
  }
}
```

### 6.5 System Scheduler

**Port from v1** (`apps/server/src/game/ecs/core/scheduler.ts`) with adaptations:

```typescript
enum Phase {
  PreUpdate = 0,  // Turn management, input processing
  Update = 1,     // Main game logic (movement, combat, AI)
  PostUpdate = 2, // Cleanup, FOV recalculation
}

interface SystemDef {
  name: string;
  phase: Phase;
  before?: string[];
  after?: string[];
  execute: (world: World) => void;
}

class SystemScheduler {
  private systems: Map<string, SystemDef> = new Map();
  private executionOrder: SystemDef[][] = [[], [], []]; // Per phase
  private compiled: boolean = false;
  
  register(def: SystemDef): void {
    this.systems.set(def.name, def);
    this.compiled = false;
  }
  
  compile(): void {
    for (const phase of [Phase.PreUpdate, Phase.Update, Phase.PostUpdate]) {
      const phaseSystems = [...this.systems.values()].filter(s => s.phase === phase);
      this.executionOrder[phase] = topologicalSort(phaseSystems);
    }
    this.compiled = true;
  }
  
  runAll(world: World): void {
    if (!this.compiled) this.compile();
    
    for (const phase of [Phase.PreUpdate, Phase.Update, Phase.PostUpdate]) {
      for (const system of this.executionOrder[phase]) {
        system.execute(world);
      }
    }
  }
}

// System definition helper
function defineSystem(name: string) {
  return {
    inPhase: (phase: Phase) => ({
      before: (...names: string[]) => ({ /* chain */ }),
      after: (...names: string[]) => ({ /* chain */ }),
      execute: (fn: (world: World) => void): SystemDef => ({
        name,
        phase,
        execute: fn,
      }),
    }),
  };
}
```

### 6.6 Version Counters for Networking

**Enhance change detection** beyond Added/Modified flags:

```typescript
class Archetype {
  // EXISTING
  private changeFlags: Uint8Array;  // Per-entity Added/Modified
  
  // ADD for v3
  private version: number = 0;      // Incremented on ANY write
  private columnVersions: Map<number, number> = new Map(); // Per-component
  
  setComponentData(row: number, componentIndex: number, data: Record<string, number>): void {
    // ... existing code ...
    
    // ADD: Increment versions
    this.version++;
    this.columnVersions.set(componentIndex, this.version);
  }
}

// Network sync can check: "has this archetype changed since tick N?"
function getChangedEntities(world: World, sinceTick: number): Entity[] {
  const changed: Entity[] = [];
  for (const archetype of world.archetypes) {
    if (archetype.version > sinceTick) {
      // Scan entities in this archetype
      for (let row = 0; row < archetype.count; row++) {
        if (archetype.getChangeFlag(row) !== ChangeFlag.None) {
          changed.push(archetype.getEntity(row));
        }
      }
    }
  }
  return changed;
}
```

### 6.7 Serialization (JSON-First)

```typescript
interface WorldSnapshot {
  version: string;           // "1.0.0" for schema versioning
  tick: number;
  seed: number;              // For deterministic replay
  entities: SerializedEntity[];
  resources: Record<string, unknown>;
}

interface SerializedEntity {
  id: number;
  templateId?: string;       // For delta compression
  components: Record<string, Record<string, number>>;
}

class WorldSerializer {
  serialize(world: World): WorldSnapshot {
    const entities: SerializedEntity[] = [];
    
    for (const archetype of world.archetypes) {
      for (let row = 0; row < archetype.count; row++) {
        const entity = archetype.getEntity(row);
        const components: Record<string, Record<string, number>> = {};
        
        for (const compType of archetype.componentTypes) {
          const meta = getComponentMeta(compType);
          if (!meta.isTag) {
            const data: Record<string, number> = {};
            for (const field of meta.fields) {
              data[field.name] = archetype.getFieldValue(row, meta.id.index, field.name)!;
            }
            components[meta.id.name] = data;
          } else {
            components[meta.id.name] = {}; // Tag present
          }
        }
        
        entities.push({ id: entity, components });
      }
    }
    
    return {
      version: "1.0.0",
      tick: world.tick,
      seed: world.resources.get<number>("seed") ?? 0,
      entities,
      resources: this.serializeResources(world),
    };
  }
  
  deserialize(snapshot: WorldSnapshot): World {
    // Apply migrations if version differs
    const migrated = this.migrate(snapshot);
    
    const world = new World();
    // ... restore entities and components
    return world;
  }
}
```

---

## 7. Migration Path from v1

### 7.1 Component Migration

| v1 Pattern | v3 Pattern |
|------------|------------|
| `ComponentSchema.define("Name").field(...).build()` | `@component class Name { field = f32(0) }` |
| String-based names (`"Position"`) | Class references (`Position`) |
| AoS for complex data | Move to Resources |
| `world.getComponent(e, "Position")` | `world.get(e, Position)` |

**Example Migration:**

```typescript
// v1
const PositionSchema = ComponentSchema.define<PositionData>("Position")
  .field("x", ComponentType.I32, 0)
  .field("y", ComponentType.I32, 0)
  .build();

// v3
@component
class Position {
  x = i32(0);
  y = i32(0);
}
```

### 7.2 System Migration

| v1 Pattern | v3 Pattern |
|------------|------------|
| `defineSystem("Name").inPhase(Phase.Update).execute(...)` | Same, but queries use class refs |
| `world.query({ with: ["Position"], without: ["Dead"] })` | `world.query(Position).not(Dead)` |
| `world.getComponent<T>(entity, "Name")` | `world.get(entity, Name)` |

### 7.3 Files to Migrate

| v1 File | Action |
|---------|--------|
| `ecs/game/components/*.ts` | Convert to decorator-based |
| `ecs/game/systems/*.ts` | Update query syntax |
| `ecs/game/templates/*.ts` | Adapt to v3 template system |
| `ecs/game/resources/*.ts` | Keep, integrate with new ResourceRegistry |
| `ecs/features/serialization.ts` | Replace with v3 serializer |
| `ecs/features/templates.ts` | Port to v3 |

---

## 8. Implementation Roadmap

### Phase 1: Core Enhancements (Week 1)
**Goal:** Make v2 feature-complete for basic usage

| Task | File | Acceptance Criteria |
|------|------|---------------------|
| Add QueryCache | `ecs-v2/query-cache.ts` (NEW) | Queries resolve in O(cached archetypes), not O(all archetypes) |
| Add ResourceRegistry | `ecs-v2/resource.ts` (NEW) | `world.resources.get/set/require` works |
| Add EventQueue | `ecs-v2/events.ts` (NEW) | Events emit, flush deterministically |
| Integrate into World | `ecs-v2/world.ts` | World exposes resources, events, queryCache |

**Tests:**
- Query caching benchmark: 1000 queries < 10ms
- Resource get/set roundtrip
- Event ordering determinism

### Phase 2: System Scheduler (Week 1-2)
**Goal:** Systems execute in correct order

| Task | File | Acceptance Criteria |
|------|------|---------------------|
| Port SystemScheduler | `ecs-v2/scheduler.ts` (NEW) | Topological sort works |
| Add defineSystem helper | `ecs-v2/system.ts` (NEW) | Builder API works |
| Wire to World.tick() | `ecs-v2/world.ts` | `world.tick()` runs all systems |

**Tests:**
- System dependency ordering
- Phase execution order (PreUpdate -> Update -> PostUpdate)

### Phase 3: Change Detection for Networking (Week 2)
**Goal:** Version counters for delta sync

| Task | File | Acceptance Criteria |
|------|------|---------------------|
| Add version counters | `ecs-v2/archetype.ts` | Per-archetype and per-column versions |
| Add getChangedSince() | `ecs-v2/world.ts` | Returns entities changed since tick N |

**Tests:**
- Version increments on write
- getChangedSince returns correct entities

### Phase 4: Serialization (Week 2-3)
**Goal:** Save/load world state

| Task | File | Acceptance Criteria |
|------|------|---------------------|
| WorldSerializer | `ecs-v2/serialization.ts` (NEW) | Serialize/deserialize roundtrip |
| Schema versioning | `ecs-v2/serialization.ts` | Version field, migration stubs |
| Delta compression | `ecs-v2/serialization.ts` | Template-based deltas (optional) |

**Tests:**
- Serialize 5k entities < 100ms
- Deserialize 5k entities < 150ms
- Roundtrip preserves all data

### Phase 5: Game System Migration (Week 3-4)
**Goal:** All v1 game systems work on v3

| Task | Priority |
|------|----------|
| Migrate Position, Health, TurnEnergy components | HIGH |
| Migrate TurnManagementSystem | HIGH |
| Migrate MovementSystem, CombatSystem | HIGH |
| Migrate AISystem | MEDIUM |
| Migrate FOVSystem | MEDIUM |
| Migrate template system | MEDIUM |
| Update network sync (game-server.ts, sync-manager.ts) | HIGH |

**Acceptance Criteria:**
- All existing tests pass
- Performance baselines maintained
- No gameplay regressions

### Phase 6: Cleanup and Documentation (Week 4+)
**Goal:** Production ready

| Task |
|------|
| Remove v1 ECS code (after migration complete) |
| Update AGENTS.md with v3 patterns |
| Add inspector API for debugging |
| Performance profiling and optimization |

---

## 9. File Structure (Target)

```
apps/server/src/game/ecs-v2/
├── index.ts              # Public exports
├── types.ts              # Entity, FieldType, Phase, ChangeFlag
├── field.ts              # Field descriptors (f32, i32, etc.)
├── component.ts          # @component decorator
├── archetype.ts          # Archetype + ArchetypeGraph
├── world.ts              # World class (enhanced)
├── query-cache.ts        # NEW: Query caching
├── resource.ts           # NEW: ResourceRegistry
├── events.ts             # NEW: EventQueue + event types
├── scheduler.ts          # NEW: SystemScheduler
├── system.ts             # NEW: defineSystem helper
├── command-buffer.ts     # EXISTS: enhance integration
├── serialization.ts      # NEW: WorldSerializer
└── __tests__/
    ├── archetype.test.ts
    ├── world.test.ts
    ├── query-cache.test.ts
    ├── events.test.ts
    ├── scheduler.test.ts
    └── serialization.test.ts
```

---

## 10. API Reference (Target)

### Entity Operations
```typescript
const entity = world.spawn(Position, Health);
world.despawn(entity);
world.isAlive(entity);
```

### Component Operations
```typescript
world.add(entity, Velocity, { x: 1, y: 0 });
world.remove(entity, Velocity);
world.has(entity, Position);
world.get(entity, Position);  // Returns { x, y } or null
world.set(entity, Position, { x: 10, y: 5 });
```

### Query Operations
```typescript
// Basic query
world.query(Position, Velocity).run(view => {
  const px = view.column(Position, "x");
  const py = view.column(Position, "y");
  for (let i = 0; i < view.count; i++) {
    px[i] += 1;
  }
});

// With filters
world.query(Position).not(Dead).changed(Position).run(view => { ... });

// Get first match
const entity = world.query(Player, Position).first();

// Count matches
const count = world.query(Enemy).count();
```

### System Definition
```typescript
const MovementSystem = defineSystem("Movement")
  .inPhase(Phase.Update)
  .after("TurnManagement")
  .execute((world) => {
    world.query(Position, Velocity).not(Dead).run(view => {
      // ... movement logic
    });
  });

world.scheduler.register(MovementSystem);
```

### Resources
```typescript
world.resources.set("gameMap", gameMap);
const map = world.resources.require<GameMap>("gameMap");
```

### Events
```typescript
world.events.emit({ type: "combat.damage", attacker, target, damage: 10 });

world.events.subscribe("combat.damage", (event) => {
  console.log(`${event.attacker} dealt ${event.damage} to ${event.target}`);
});
```

### Serialization
```typescript
const snapshot = world.serialize();
const json = JSON.stringify(snapshot);

const restored = World.deserialize(JSON.parse(json));
```

---

## 11. Decision Log

| Decision | Chosen | Alternatives Rejected | Reason |
|----------|--------|----------------------|--------|
| Build on v2 | Enhance v2 | Fresh rewrite | v2 is 90% complete, solid architecture |
| Storage model | Archetype + SoA | Sparse-set, Hybrid | Best cache performance, validated by Bevy/flecs |
| Entity ID split | 20/12 | 16/16 | More entity headroom (1M vs 65K) |
| Component refs | Class-based | String-based | Type safety, IDE support |
| Change detection | Version counters | Dirty flags only | Network delta sync needs tick-based versions |
| Query caching | Selective invalidation | No cache, full invalidation | Balance freshness vs performance |
| Event ordering | Per-type sorted queues | Single queue | Determinism + filtering |
| Serialization | JSON-first | Binary-first | Debugging priority, bandwidth not critical |
| System deps | Explicit before/after | Implicit, none | Debuggable, predictable |
| Complex data | Resources | AoS components | Cache coherence for hot paths |

---

## 12. Risk Log

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Archetype explosion | Low | Medium | Monitor count, warn >100 |
| Query cache stale | Medium | Low | Conservative invalidation |
| Migration breaks tests | High | Medium | Migrate incrementally, keep v1 until done |
| Performance regression | Low | High | Continuous benchmarking |
| Determinism bugs | Medium | Critical | Property tests, golden runs |

---

## 13. Testing Requirements

### Unit Tests (per new file)
- `query-cache.test.ts`: Cache hit/miss, invalidation
- `events.test.ts`: Emit, subscribe, flush ordering
- `scheduler.test.ts`: Phase order, dependency sort
- `serialization.test.ts`: Roundtrip, versioning

### Integration Tests
- Full tick cycle with multiple systems
- Network sync delta generation
- Save/load with template deltas

### Performance Tests
- Query caching: 1000 queries < 10ms
- Serialization: 5k entities < 100ms
- Existing v2 baselines maintained

### Determinism Tests
- Same seed -> same state (property test)
- Event ordering stability
- System execution order stability

---

## 14. For Implementing Agents

### DO:
- Read this document completely before starting
- Follow the phase order (1 -> 2 -> 3 -> 4 -> 5 -> 6)
- Write tests BEFORE implementing features
- Check existing v2 code before writing new code
- Maintain backwards compatibility during migration
- Run `bun test` after each change

### DON'T:
- Modify v1 ECS code (`apps/server/src/game/ecs/`) during v3 development
- Use `Math.random()` anywhere in game logic
- Use `as any` or `@ts-ignore`
- Skip performance tests
- Change entity ID encoding (20/12 split is final)
- Add features not in this document without discussion

### Key Files to Read First:
1. `apps/server/src/game/ecs-v2/types.ts` — Entity encoding, enums
2. `apps/server/src/game/ecs-v2/archetype.ts` — Core storage
3. `apps/server/src/game/ecs-v2/world.ts` — Current World implementation
4. `apps/server/tests/ecs-v2/benchmark.test.ts` — Performance baselines

### Commands:
```bash
cd apps/server
bun test                    # Run all tests
bun test tests/ecs-v2      # Run v2 tests only
bun run check-types         # TypeScript validation
```

---

## 15. Research Sources

This design was informed by analysis of:

- **Bevy ECS (Rust)**: Hybrid archetype+sparse-set, tick-based change detection
- **flecs (C/C++)**: Pure archetype, observers, pipeline scheduling
- **bitECS (TypeScript)**: SoA with TypedArrays, maximum JS performance
- **ECSY (JavaScript)**: Developer ergonomics focus

Key patterns adopted:
- Archetype storage from Bevy/flecs
- TypedArray columns from bitECS
- Observer pattern from flecs
- Phase-based scheduling from Bevy

---

**END OF DOCUMENT**
