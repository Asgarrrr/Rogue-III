# ECS Deep Audit Report

## Executive Verdict

The ECS implementation is **architecturally sound but not production-optimized**. It follows a well-established archetype-based model (similar to Bevy/Flecs) with correct entity generation handling, deterministic iteration ordering, and proper cascade delete with cycle detection. The type system leverages TypeScript's branded types and discriminated unions effectively. However, there are **critical performance issues** in the query hot paths (excessive object allocation, generator overhead, BigInt operations), a **correctness bug** in the query cache invalidation logic, and **type safety gaps** where `ComponentData<T>` erases string/entity field semantics. The implementation is good for prototyping but requires targeted fixes before handling 10K+ entities at 60Hz.

---

## 1. ECS Architecture Map

| Module | Path | Purpose |
|--------|------|---------|
| **Core** | `apps/server/src/game/ecs/core/` | |
| types.ts | Entity encoding (20-bit index + 12-bit gen), FieldType, ChangeFlag, Phase | Type foundations |
| component.ts | `@component` decorator, global COMPONENT_META registry | Component registration |
| field.ts | Field descriptors (f32, i32, str, entityRef, etc.) | Field DSL |
| archetype.ts | Archetype (SoA columnar storage), ArchetypeGraph (transitions) | Storage layer |
| world.ts | World (orchestrator), QueryBuilder, ArchetypeView (~900 lines) | Main API |
| bundle.ts | Bundle pattern for entity creation | Convenience API |
| **Query** | `apps/server/src/game/ecs/query/` | |
| index.ts | QueryCache with mask-based resolution | Query optimization |
| **Schedule** | `apps/server/src/game/ecs/schedule/` | |
| scheduler.ts | SystemScheduler with topological sort | System ordering |
| system.ts | System interface, SystemBuilder | System definition |
| run-condition.ts | Condition composition (and/or/not), built-in conditions | Conditional execution |
| **Events** | `apps/server/src/game/ecs/event/` | |
| events.ts | EventQueue with priority handlers, GameEvent union | Event system |
| hooks.ts | HookRegistry (onAdd/onRemove/onSet) | Lifecycle callbacks |
| **Relations** | `apps/server/src/game/ecs/relationship/` | |
| relation.ts | RelationType definition, ChildOf/Contains/Targets | Relation types |
| relation-store.ts | RelationStore (bidirectional indexing) | Relation storage |
| entity-ref-store.ts | EntityRefStore for reference tracking | Reference validation |
| **Storage** | `apps/server/src/game/ecs/storage/` | |
| string-pool.ts | StringPool (global singleton) | String interning |
| resource.ts | ResourceRegistry | Global resources |
| command-buffer.ts | CommandBuffer for deferred ops | Deferred execution |
| **Features** | | |
| prefab/index.ts | PrefabRegistry with inheritance | Entity templates |
| spatial/index.ts | SpatialGrid (hash grid) | Spatial queries |
| serialization/ | WorldSerializer, migrations | Persistence |
| debug/index.ts | WorldInspector | Debugging |

---

## 2. Top 10 Risks (Ranked)

| # | Severity | Risk | Location | Failure Mode | Fix |
|---|----------|------|----------|--------------|-----|
| 1 | **HIGH** | Query cache invalidation incorrect | `query/index.ts:30` | Cache returns stale archetypes when count unchanged but archetypes differ | Use monotonic epoch instead of count |
| 2 | **HIGH** | O(entities * filters) object allocation per query | `world.ts:1025` | GC pauses, memory pressure at scale | Reuse filter data object |
| 3 | **MEDIUM** | Generator allocation in iter() | `world.ts:1094` | Performance overhead, prevents inlining | Add callback-based forEach() |
| 4 | **MEDIUM** | Global component registry | `component.ts:11` | Multi-world isolation fails | Per-world registry option |
| 5 | **MEDIUM** | Global string pool at decoration time | `field.ts:20-21` | Cross-world string pollution | Defer interning to spawn() |
| 6 | **MEDIUM** | BigInt operations in hot paths | `archetype.ts:106,282` | 10-100x slower than u32 bitwise | Use dual Uint32 for masks |
| 7 | **MEDIUM** | ComponentData<T> type erases semantics | `types.ts:107-109` | String fields appear as numbers | Create branded StringIndex type |
| 8 | **MEDIUM** | Entity refs not nullified on despawn | `world.ts:151-152` | Dangling refs in raw access | Call nullifyRefsTo() |
| 9 | **LOW** | Generation overflow after 4096 cycles | `world.ts:901` | False positive on stale reference | Add overflow detection |
| 10 | **LOW** | ArchetypeView created per query per archetype | `world.ts:1071` | Object allocation overhead | Pool views |

---

## 3. Performance Audit

### Hot Paths

| Path | Location | Cost | Frequency |
|------|----------|------|-----------|
| `QueryBuilder.iter()` | world.ts:1094 | 1 generator object | Per query |
| `passesFilters()` | world.ts:1025 | 1 object per entity per filter | Per filtered entity |
| `World.get()` | world.ts:357 | 1 object per call | Per component read |
| `ArchetypeView` construction | world.ts:1071 | 1 object per archetype | Per query |
| `archetype.hasComponent()` | archetype.ts:106 | BigInt shift + compare | Per mask check |
| `RelationStore.getTargets()` | relation-store.ts:351 | Array spread + O(n log n) sort | Per relation query |

### Allocation Sources (Per Tick)

1. **Generator objects**: 1 per `iter()` call
2. **Filter data objects**: O(entities * filters) in `passesFilters()`
3. **ArchetypeView arrays**: `_filteredIndices[]` per view
4. **Event queue slice**: 1 array per event type in `flush()`
5. **Relation data keys**: String template per `getData()`/`setData()`

### JS Engine Pitfalls

1. **BigInt constructor in loops**: `1n << BigInt(componentIndex)` creates objects
2. **Megamorphic filter calls**: Different predicate functions through same call site
3. **Dynamic property assignment**: `result[field.name] = value` prevents shape optimization
4. **Generator state machines**: Cannot be inlined by V8

### Benchmark Proposals

```typescript
// 1. Spawn/Despawn: 100K+ entities/sec target
// 2. Query iteration: Compare run() vs iter() vs forEach()
// 3. Filter overhead: 0, 1, 3 filters per query
// 4. Change detection: .changed() overhead measurement
// 5. Archetype migration: add()/remove() component cost
// 6. Relation scale: getTargets() with 10/100/1000 relations
```

---

## 4. Type Safety Audit

### 5 Strongest Type Wins

1. **Branded Entity type** (`types.ts:1-3`): `type Entity = number & { readonly [ENTITY_BRAND]: true }`
2. **Discriminated GameEvent union** (`events.ts:3-133`): Exhaustive pattern matching
3. **Assertion helpers with narrowing** (`types.ts:124-147`): `asserts value is T`
4. **Field marker symbol** (`field.ts:4`): Prevents plain objects from matching
5. **Readonly component metadata** (`types.ts:96-101`): Immutability enforced

### 5 Type Weaknesses

1. **ComponentData<T> erases all types** (`types.ts:107-109`)
   ```typescript
   type ComponentData<T> = { [K in keyof T]: number };
   // String fields become numbers, breaking semantics
   ```

2. **ResourceRegistry.get<T>() unchecked cast** (`resource.ts:17`)
   ```typescript
   return this.stringResources.get(key) as T | undefined;
   ```

3. **RelationStore.getData() unsafe cast** (`relation-store.ts:428`)
   ```typescript
   return this.data.get(key) as T | undefined;
   ```

4. **Event handler type erasure** (`events.ts:193`)
   ```typescript
   handler: handler as EventHandler, // Loses type specialization
   ```

5. **QueryFilter receives raw Record** (`world.ts:1025`)
   - Signature says `ComponentData<T>`, receives `Record<string, number>`

### Improvement Recommendations

1. Create branded `StringIndex` type for string field values
2. Use Symbol-keyed WeakMap for type-safe resources
3. Extract QueryBuilder (400+ lines) from World to reduce god-object
4. Defer string interning to component use, not decoration time

---

## 5. Determinism Audit

### Invariant Checklist

| Invariant | Status | Notes |
|-----------|--------|-------|
| Archetype creation order deterministic | PASS | Array append order |
| Entity iteration order stable | PARTIAL | Swap-remove on despawn changes order |
| Relation iteration sorted | PASS | Sorted by entityIndex() |
| Event type processing order | PASS | Alphabetically sorted |
| Event handler order | PASS | Priority sorted (stable in ES2019+) |
| Command buffer order | PASS | sortKey + sequenceNumber |
| System execution order | PASS | Topological sort with insertion order |
| No unseeded randomness | PASS | No Math.random() in ECS |

### Violations Found

1. **Entity row order changes on despawn**: Swap-remove pattern means iteration order depends on despawn history, not spawn history.
2. **Hooks see partial state during cascade delete**: onRemove hooks may access entities in `beingDespawned` set.

---

## 6. Targeted Refactor Plan

### Priority 1: Correctness Fixes

1. **Fix query cache invalidation** (`query/index.ts`)
   ```typescript
   // Add epoch to ArchetypeGraph
   private _epoch = 0;

   // Check epoch instead of count
   if (cached && cached.lastEpoch === currentEpoch) {
     return cached.archetypes;
   }
   ```

2. **Call nullifyRefsTo() on despawn** (`world.ts:151`)
   ```typescript
   // Before: only removes tracking
   this.entityRefs.removeRefsToTarget(entity);

   // After: also nullifies fields
   this.nullifyRefsTo(entity);
   ```

### Priority 2: Performance Fixes

3. **Add forEach() to QueryBuilder** (`world.ts`)
   ```typescript
   forEach(callback: (entity: Entity) => void): void {
     for (const archetype of archetypes) {
       for (let i = 0; i < archetype.count; i++) {
         if (this.passesChangeFilter(archetype, i) &&
             this.passesFilters(archetype, i)) {
           callback(archetype.getEntity(i));
         }
       }
     }
   }
   ```

4. **Reuse filter data object** (`world.ts:1020`)
   ```typescript
   private filterDataBuffer: Record<string, number> = {};
   ```

5. **Replace BigInt with dual Uint32** (`archetype.ts`)
   ```typescript
   private maskLow: number = 0;
   private maskHigh: number = 0;
   ```

### Priority 3: Type Safety Improvements

6. **Create StringIndex branded type** (`types.ts`)
   ```typescript
   type StringIndex = number & { readonly __stringIndex: true };
   ```

7. **Extract QueryBuilder to query/builder.ts**
   - Reduces World from 900 to 500 lines
   - Cleaner responsibility separation

---

## 7. Best-of-the-Best Gap Analysis

| Pattern | Top-Tier ECS | Our Implementation | Gap |
|---------|--------------|-------------------|-----|
| **Archetype storage** | SoA with TypedArrays | SoA with TypedArrays | None - solid |
| **Entity generation** | 20/12 bit split | 20/12 bit split | None |
| **Query compilation** | Pre-compiled, cached | Runtime cached | Minor - cache is good |
| **Change detection** | Per-component flags | Per-component bigint mask | BigInt overhead |
| **System scheduling** | DAG with read/write sets | DAG without conflict detection | No parallel safety |
| **Command buffer** | Sorted, deferred | Sorted, deferred | None |
| **Relations** | First-class (Flecs) | Separate RelationStore | Good abstraction |
| **Pooling** | Ubiquitous | Missing in hot paths | Major gap |
| **SIMD iteration** | Column-based APIs | Generator-based | Major gap |

### Summary
The architecture matches industry patterns. The main gaps are:
1. Object allocation in hot paths (pooling needed)
2. Generator-based iteration instead of callback/column APIs
3. No system read/write sets for future parallelization

---

## 8. Final Scorecard

| Dimension | Score | Justification |
|-----------|-------|---------------|
| **Architecture** | 7/10 | Clean archetype model, but World is a 900-line god object |
| **Types** | 6/10 | Good branded types, but ComponentData erases field semantics |
| **Correctness** | 7/10 | Solid lifecycle handling, but query cache has invalidation bug |
| **Determinism** | 8/10 | Explicit sorting for relations, command buffer ordering works |
| **Performance** | 5/10 | SoA foundation good, but excessive allocation in hot paths |
| **DX** | 8/10 | Clean fluent APIs, good error messages, decorator pattern |
| **Maintainability** | 7/10 | Well-organized modules, but World needs splitting |

**Overall: 6.9/10** - Solid foundation with targeted fixes needed for production scale.

---

## 9. Recommended Actions

### Immediate (Before Production)
1. Fix query cache invalidation (correctness bug)
2. Add forEach() to QueryBuilder (performance)
3. Reuse filter data objects (memory)

### Short-Term
4. Replace BigInt masks with dual Uint32
5. Pool ArchetypeView objects
6. Call nullifyRefsTo() on despawn

### Long-Term
7. Extract QueryBuilder from World
8. Add system read/write sets for parallel safety
9. Consider WASM for hot paths if JS proves insufficient
