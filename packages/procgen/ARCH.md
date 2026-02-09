# Procgen Architectural Thesis

> **Version:** 2.0.0
> **Last updated:** 2026-01-16

---

## Library Thesis

**Procgen is a typed pipeline machine for deterministic dungeon synthesis.** Generation is modeled as a sequence of artifact-transforming passes, composed via a fluent builder DSL, with reproducibility guaranteed through isolated RNG streams. The library optimizes for *determinism first* (same seed → same output, always), *composability second* (passes are reusable units that can be mixed across algorithms), and *transparency third* (tracing, metrics, and snapshots for debugging). It explicitly does **not** optimize for runtime flexibility—configuration is validated upfront, and pipelines are statically composed at instantiation time.

---

## Core Abstractions

| Abstraction | Definition | Invariants |
|-------------|------------|------------|
| **Artifact** | Immutable data product with a `type` discriminant and `id`. All pipeline data flows through artifacts. | Artifacts are structurally readonly (TypeScript `readonly`), but `Grid` is internally mutable for performance. |
| **Pass** | `Pass<TIn, TOut, TStreams>` — a function that transforms one artifact into another. Declares which RNG streams it needs. | Passes must be deterministic given the same input + RNG state. Side-effect free (except tracing). |
| **Pipeline** | Ordered sequence of passes, created via `PipelineBuilder.pipe()`. Executes sync or async. | Once built, a pipeline is immutable. Same seed always produces identical checksum. |
| **Generator** | Factory that composes a specific algorithm's pipeline. Validates config, provides defaults. | Generators don't hold state; they produce pipelines. |
| **RNG Streams** | Four isolated random streams: `layout`, `rooms`, `connections`, `details`. | Passes declare which streams they consume. Cross-stream contamination breaks determinism. |
| **DungeonStateArtifact** | The "working state" artifact that most passes operate on. Contains `Grid`, `rooms[]`, `connections[]`, etc. | Mutable internally during pass execution. Immutable boundaries between passes (by convention). |

---

## Responsibility Boundaries

### What Goes Where

| Module | Contains | Does NOT Contain |
|--------|----------|------------------|
| `core/` | Data structures (`Grid`, `BitGrid`, `FastQueue`, `UnionFind`), geometry primitives, hash functions, pathfinding algorithms | Domain knowledge, generation logic, artifact types |
| `pipeline/` | `Pass` and `Pipeline` interfaces, `PipelineBuilder` DSL, execution engine, RNG stream creation, tracing | Algorithm-specific logic, room placement, corridor carving |
| `pipeline/types/` | All domain types: `Room`, `Connection`, `SpawnPoint`, artifact definitions, config schemas | Implementation code |
| `generators/` | Algorithm implementations (BSP, Cellular, Hybrid) that compose passes into pipelines | Reusable pass logic (belongs in `passes/`) |
| `passes/` | Reusable pass implementations: corridor carvers, connectivity algorithms, validation checks | Algorithm-specific passes (those live in `generators/{algo}/passes.ts`) |
| `prefabs/` | Room templates, template selection utilities | Generation logic (templates are data, not behavior) |
| `metrics/` | Post-generation statistics collection | Quality thresholds (those are in `pipeline/types/`) |

### Layering Rules

```
┌─────────────────────────────────────────────┐
│  api.ts / index.ts (public surface)         │  ← Users import here
├─────────────────────────────────────────────┤
│  generators/ (algorithm composition)        │  ← Composes passes
├─────────────────────────────────────────────┤
│  passes/ (reusable transformations)         │  ← Shared across algorithms
├─────────────────────────────────────────────┤
│  pipeline/ (execution model + types)        │  ← Framework layer
├─────────────────────────────────────────────┤
│  core/ (primitives)                         │  ← Zero domain knowledge
├─────────────────────────────────────────────┤
│  @rogue/contracts (shared types)            │  ← External dependency
└─────────────────────────────────────────────┘
```

**Import direction:** Down only. `core/` never imports from `pipeline/`. `pipeline/` never imports from `generators/`.

---

## Known Tensions & Ambiguities

- **DungeonStateArtifact is a mutable god object.** Passes spread `...artifact` and mutate `grid` in place. The `readonly` modifier prevents reassignment but not mutation. True immutability would require cloning the grid (~100KB) between passes.

- **Pass type signatures collapse in practice.** `Pass<TIn, TOut>` is generic, but all BSP/Cellular passes are `Pass<DungeonStateArtifact, DungeonStateArtifact>`. The type system cannot prevent pass mis-ordering (e.g., calling `carveRooms()` before `placeRooms()`).

- **RNG stream scoping is advisory.** Passes declare `requiredStreams`, and the builder filters the context. But the runtime cast (`as unknown as RNGStreams`) means a pass could technically access undeclared streams via type assertion. This is a pragmatic tradeoff for backwards compatibility.

- **`passes/` vs `generators/{algo}/passes.ts` boundary is fuzzy.** Some passes are algorithm-specific (BSP partitioning) and live in generators. Others are reusable (corridor carving) and live in `passes/`. The rule: if >1 algorithm uses it, move to `passes/`.

- **`./fragments` export is stale.** package.json declares it, but the directory was deleted. This should be cleaned up.

---

## Do / Don't Principles

### DO

- **Declare `requiredStreams` on every new pass.** This enables compile-time stream discipline and documents intent.

- **Keep passes pure.** A pass should only read from its input artifact and RNG, then produce a new artifact. No global state, no side effects (except tracing).

- **Prefer spreading artifacts over mutation.** When possible, create a new artifact with updated fields: `{ ...artifact, rooms: newRooms }`.

- **Use `PipelineBuilder.when()` for conditional passes.** Don't branch inside passes; keep passes simple and compose complexity at the pipeline level.

- **Add new primitives to `core/`.** Data structures, algorithms, and geometry utilities belong there—not in passes.

- **Test determinism explicitly.** Use `assertDeterministic(config, 10)` in tests. If a change breaks determinism, the test fails.

### DON'T

- **Don't import from `generators/` in `passes/`.** Passes must not depend on algorithm-specific code. This breaks composability.

- **Don't add game logic to procgen.** Room types are structural (`normal`, `cavern`). Game-specific semantics (boss room, treasure vault) belong in the game layer, not here.

- **Don't rely on pass execution order for correctness.** If pass B depends on pass A having run, consider merging them or adding a runtime check.

- **Don't use `ctx.rng` directly in passes.** Always use `ctx.streams.{layout|rooms|connections|details}` to maintain stream isolation.

- **Don't add external runtime dependencies.** Procgen is pure TypeScript with zero npm dependencies (only `@rogue/contracts` workspace package).

- **Don't capture mutable state in closures.** Pass factories return fresh pass objects each time. Closures over mutable state break determinism.

---

## Quick Reference: Adding a New Pass

```typescript
// 1. Define the pass factory (in passes/ or generators/{algo}/)
export function myNewPass(): Pass<DungeonStateArtifact, DungeonStateArtifact, "rooms"> {
  return {
    id: "my-new-pass",
    inputType: "dungeon-state",
    outputType: "dungeon-state",
    requiredStreams: ["rooms"],  // Declare streams!
    run(input, ctx) {
      const rng = ctx.streams.rooms;
      // ... transform input ...
      return { ...input, /* updated fields */ };
    },
  };
}

// 2. Add to pipeline (in generator)
.pipe(myNewPass())

// 3. Test determinism
test("myNewPass is deterministic", () => {
  assertDeterministic(configWithNewPass, 5);
});
```

---

*This document describes intent and constraints, not implementation details. For code structure, see `PROCGEN_MAP.md`.*
