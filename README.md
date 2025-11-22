# Rogue III

Seeded roguelike dungeon engine in Bun/React. Two fully deterministic generators (cellular caves and BSP layouts), per-system PRNG streams, and shareable seeds so players can trade runs and replay exact maps.

---

## What you get

- Deterministic runs: one primary seed fan-outs into layout/rooms/paths/detail RNG streams for perfect replays and share codes.
- Two generation flavors: cellular automata with cavern analysis and A\*/JPS corridors, plus BSP for classic blocky dungeons.
- Instrumented pipeline: pluggable steps emit snapshots and progress events for debuggers, visualizers, and future replay tools.
- Fast grid math: flat Uint8Array grids, scanline flood fill, union-find cavern extraction, spatial hashing for room collisions.
- Surfaces (client/server loop): Elysia HTTP API (Bun) as the authoritative game server channel, React client for tweaking seeds/configs, and server-side generation outputs (ASCII for now).

---

## Highlights (from the code)

- **Multi-stream PRNG** (`SeededRandom`, `DungeonGenerator`): xorshift128+ with SplitMix64 seeding and saved/restorable state. Seeds are decorrelated with MurmurHash-style constants and encoded to Base64URL share codes (`SeedManager`).
- **Cellular generator** (`cellular-generator.ts`):
  - Automaton evolution with variants and post-processing (`AutomatonRules`).
  - Cavern analysis via union-find or scanline flood fill, plus shape/density classification (`CavernAnalyzer`).
  - Room placement with spatial hash collision checks and optional annealing refinements (`RoomPlacer`).
  - Path graph via A\* with tunneling cost, Jump Point Search fast-path, smoothing, corridor width control (`PathFinder`).
  - Pipeline runner stitches grid -> caverns -> rooms -> paths -> compose -> validate reachability.
- **BSP generator** (`generators/algorithms/bsp`):
  - Partition tree with depth/ratio constraints, sibling pairing, and room placement per leaf.
  - Corridor carving honors width and connects sibling leaves; checksum covers config, rooms, connections, seeds.
  - Async mode yields with progress callbacks; pipeline steps are exposed for debugging.
- **Grid systems** (`core/grid`):
  - Flat storage, bounds-checked mutators, and object pooling to keep GC pressure low.
  - Scanline flood fill and region finders; union-find for O(a(n)) connected components.
  - Spatial hash with numeric keys for O(1) average inserts/queries; supports rect and radius queries.
- **Runtime surfaces**:
  - **API**: `apps/server/src/index.ts` (Elysia). POST `/api/dungeon` accepts seed or shareCode + config, returns checksum, rooms, connections, ascii grid, and a fresh share code. It’s the authoritative channel between client and server.
  - **Web**: `apps/client` React UI lets you tweak algorithm/size/rooms, paste share codes, and copy the generated share code/checksum.

---

## Quickstart

```bash
bun install
bun run dev      # turborepo: starts API and client
bun test         # run server + contracts test suite
```

API defaults to `http://localhost:3001`, client to `http://localhost:5173`.

---

## Project layout

```
apps/
  server/            # Bun + Elysia API and generation engine
    src/engine/dungeon/
      core/          # grid, flood fill, spatial hash, rng, union-find
      generators/    # cellular + BSP algorithms and pipeline
      serialization/ # seed manager, share codes
  client/            # React UI for seeds/config/ASCII preview

packages/contracts/  # zod schemas, typed results, pipeline contracts
```

---

## Engine mechanics

- **Determinism first**: each subsystem gets its own PRNG stream (layout, rooms, connections, details). `validateDeterminism()` replays twice and compares checksums.
- **Pipelines as first-class**: steps declare reads/writes and dependencies; `setGlobalPipelineHandlers` can capture snapshots and progress across runs for tooling.
- **Connectivity guarantees**: cellular pipeline validates room reachability; pathfinding will tunnel with cost penalties rather than fail.
- **Metrics & checksum**: both generators hash rooms + connections + config + seeds with djb2; use checksums as lightweight content IDs.
- **Share codes**: Base64URL encodes all five seeds + timestamp; decoding rehydrates the exact RNG state for a run.

---

## Algorithm cheat sheet

- **Cellular**: noise -> automaton evolution -> union-find caverns -> spatially hashed room placement -> MST + redundant links with A\*/JPS -> corridor smoothing -> validation.
- **BSP**: recursive partition -> sibling pairing -> room placement per leaf -> corridor carving with width -> checksum.

---

## Testing and guardrails

- Property and determinism tests for seeds, encoding, and generator parity (`apps/server/tests`).
- Performance and invariant checks (flood fill, grid, pathfinding) live in the engine tests; failures break the CI run.

---

## Moving toward the roguelike

- Current focus: reproducible world gen, shareable runs, and telemetry-friendly pipelines.
- Upcoming gameplay layers: entity sim, combat loop, itemization, fog-of-war, persistence hooked to share codes, and a render path beyond ASCII.

---

## Commands you’ll use

```bash
bun run build              # build all packages/apps
bun run dev                # dev all workspaces
bun run check-types        # TypeScript
bun run format-and-lint    # Biome
```

MIT
