# ECS Deep Audit Plan

## Executive Summary

This plan outlines a comprehensive audit of the ECS implementation across 12 dimensions: architecture, type safety, determinism, entity lifecycle, storage, queries, change detection, scheduling, events, relations, serialization, and tooling.

## ECS Architecture Map

| Module | Path | Purpose |
|--------|------|---------|
| **Core** | `apps/server/src/game/ecs/core/` | |
| types.ts | Entity encoding (20-bit index + 12-bit gen), FieldType, ChangeFlag, Phase | Type foundations |
| component.ts | `@component` decorator, global COMPONENT_META registry | Component registration |
| field.ts | Field descriptors (f32, i32, str, entityRef, etc.) | Field DSL |
| archetype.ts | Archetype (SoA columnar storage), ArchetypeGraph (transitions) | Storage layer |
| world.ts | World (orchestrator), QueryBuilder, ArchetypeView | Main API |
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

## Audit Phases

### Phase 1: Critical Path Analysis
**Goal:** Identify the hot paths and verify their correctness

**Tasks:**
1. Audit `World.spawn()` flow (entity allocation, archetype creation, hook triggers)
2. Audit `World.despawn()` flow (cascade delete, relation cleanup, entity ref nullification)
3. Audit query iteration (`QueryBuilder.run/iter/collect`) for allocation and correctness
4. Audit archetype migration (`World.add/remove`) for data integrity
5. Verify change detection semantics (when flags set, when cleared)

### Phase 2: Type Safety Audit
**Goal:** Identify type lies, unsafe casts, and misuse opportunities

**Tasks:**
1. Audit `ComponentData<T>` mapping (all fields become `number`)
2. Review `getComponentMeta()` and global registry type safety
3. Check query filter predicate typing (`QueryFilter<T>`)
4. Review relation data typing (`RelationType<T>`)
5. Identify all `as` casts and `any` usage
6. Assess generic complexity and maintainability

### Phase 3: Determinism Audit
**Goal:** Verify reproducible execution for replay/networking

**Tasks:**
1. Verify entity iteration order (archetype creation order, row order)
2. Verify relation iteration order (`getTargets/getSources` sorted?)
3. Check command buffer ordering (`setSortKey` + sequence)
4. Verify event processing order (priority, type order)
5. Audit randomness sources (must be seeded)
6. Test: deterministic snapshots after N operations

### Phase 4: Entity Lifecycle Correctness
**Goal:** Ensure no stale references survive

**Tasks:**
1. Verify generation overflow handling (12-bit wraps at 4096)
2. Verify `isAlive()` catches stale references
3. Verify `getEntityRef()` validates target liveness
4. Verify cascade delete cycle detection (`beingDespawned` set)
5. Verify entity ref nullification on target despawn
6. Test: rapid spawn/despawn cycles with stale ref access

### Phase 5: Storage Performance Audit
**Goal:** Identify allocation hotspots and JS engine pitfalls

**Tasks:**
1. Measure archetype growth allocations (TypedArray resizing)
2. Measure query iteration allocations (generators, closures)
3. Identify hidden class changes (Map key types, property additions)
4. Identify megamorphic call sites (generic iteration patterns)
5. Profile: 100K entity iteration, 10K spawn/despawn churn

### Phase 6: Query Engine Quality
**Goal:** Verify query correctness and performance

**Tasks:**
1. Verify QueryCache invalidation (archetype count check sufficient?)
2. Verify filter evaluation order (short-circuit?)
3. Verify change filter semantics (Added, Modified, changedComponent)
4. Check for O(n^2) patterns in multi-component queries
5. Verify ArchetypeView filtered indices lazy computation
6. Test: query stability under structural changes mid-iteration

### Phase 7: Scheduler & Systems
**Goal:** Verify system ordering and conflict safety

**Tasks:**
1. Verify topological sort correctness (Kahn's algorithm)
2. Verify circular dependency detection
3. Assess parallel safety (no explicit read/write sets)
4. Verify run condition evaluation (per-tick, caching)
5. Verify system enable/disable semantics
6. Test: complex dependency graphs with cycles

### Phase 8: Events & Hooks
**Goal:** Verify event ordering and backpressure

**Tasks:**
1. Verify event handler priority sorting stability
2. Verify flush semantics (per-tick, recursive prevention)
3. Verify hook execution order (onAdd before/after data set?)
4. Assess queue growth risks (unbounded?)
5. Verify event type discrimination correctness
6. Test: high-frequency event emission

### Phase 9: Relations
**Goal:** Verify relation correctness and performance

**Tasks:**
1. Verify exclusive relation enforcement
2. Verify symmetric relation bidirectionality
3. Verify cascade delete chain
4. Assess relation store memory (Maps vs TypedArrays)
5. Verify deterministic iteration order (sorted by entity index)
6. Test: complex hierarchies with cascade delete

### Phase 10: Serialization
**Goal:** Verify persistence correctness

**Tasks:**
1. Verify snapshot format stability (version handling)
2. Verify entity ID mapping on load
3. Verify migration system
4. Test: save/load cycle determinism

---

## Top 10 Risks (Preliminary)

| # | Severity | Risk | Location | Failure Mode |
|---|----------|------|----------|--------------|
| 1 | MEDIUM | Global component registry | `component.ts:COMPONENT_META` | Multi-world isolation fails |
| 2 | MEDIUM | Global string pool | `string-pool.ts:globalStringPool` | Cross-world string pollution |
| 3 | MEDIUM | QueryCache invalidation | `query/index.ts` | Only checks archetype count |
| 4 | LOW | Generation overflow | `world.ts:901` | 12-bit wraps silently |
| 5 | MEDIUM | No system read/write sets | `scheduler.ts` | No conflict detection |
| 6 | LOW | Relation store uses Maps | `relation-store.ts` | Memory overhead vs TypedArrays |
| 7 | MEDIUM | Event queue unbounded | `events.ts` | No backpressure |
| 8 | LOW | Run condition creates queries | `run-condition.ts` | WeakMap caching helps but still allocates |
| 9 | MEDIUM | Type lies in ComponentData | `types.ts:107-109` | All fields become `number` |
| 10 | LOW | Iterator allocation | `world.ts:1094` | Generator per iteration |

---

## Verification Approach

### Unit Tests to Add
1. Generation overflow (spawn 4097 times at same index)
2. Query cache correctness under archetype churn
3. Change detection semantics (Added vs Modified)
4. Cascade delete cycles
5. Entity ref nullification

### Benchmarks to Run
1. Iterate 1M entities (measure ops/sec, allocations)
2. Spawn/despawn 10K entities (structural churn)
3. Query compilation (cache hit vs miss)
4. Archetype migration (add/remove component)
5. Relation queries (getTargets, getSources)

### Determinism Tests
1. Seeded simulation -> checksum
2. Event replay exact match
3. Snapshot round-trip equality

---

## Critical Files to Modify

| File | Changes |
|------|---------|
| `core/world.ts` | Entity lifecycle fixes, query improvements |
| `core/archetype.ts` | Storage optimizations |
| `query/index.ts` | Cache invalidation robustness |
| `schedule/scheduler.ts` | Conflict detection (optional) |
| `relationship/relation-store.ts` | Performance optimizations |

---

## Output Deliverables

1. **ECS Map** - Architecture diagram with file paths (above)
2. **Executive Verdict** - 1-paragraph assessment
3. **Top 10 Risks** - Ranked with severity, location, failure mode, fix options
4. **Performance Audit** - Hot paths, allocations, microbench proposals
5. **Typing Audit** - 5 wins, 5 weaknesses, improvements
6. **Determinism Audit** - Invariant checklist with violations
7. **Targeted Refactor Plan** - Minimal high-impact changes
8. **Best-of-the-Best Gap Analysis** - Comparison to top ECS patterns
9. **Final Scorecard** - 1-10 ratings with justifications

---

## Execution Order

1. Read all core files in detail
2. Launch parallel audit agents for each dimension
3. Aggregate findings into structured report
4. Identify top risks and propose fixes
5. Run benchmarks to validate performance concerns
6. Produce final scorecard and recommendations
