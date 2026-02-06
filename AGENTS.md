# Rogue III Knowledge Base

**Generated:** 2026-01-08 | **Commit:** 389c398 | **Branch:** main

## Overview
Turn-based roguelike with deterministic procedural dungeon generation, high-performance ECS architecture, and real-time multiplayer. Turborepo monorepo: Vite+React 19 client, Bun+Elysia server, shared Zod contracts.

## Structure
```
rogue-iii/
├── apps/
│   ├── client/              # Vite + React 19 + Pixi (port 5173)
│   │   └── src/App.tsx      # Entry point, minimal UI scaffold
│   └── server/              # Bun + Elysia (port 3000)
│       ├── src/game/        # Game simulation (ECS, dungeon, network)
│       ├── src/server/      # Server infrastructure
│       │   ├── api/         # HTTP routes + Elysia app
│       │   ├── ws/          # WebSocket handlers
│       │   ├── auth/        # Better-Auth
│       │   ├── db/          # Drizzle + PostgreSQL
│       │   └── jobs/        # Cron tasks
│       └── tests/           # Unit, property, perf tests
├── packages/
│   ├── contracts/           # Zod schemas, shared types, network protocol
│   └── typescript-config/   # tsconfig presets
└── turbo.json               # Task orchestration
```

## Where to Look
| Task | Location | Notes |
|------|----------|-------|
| ECS components | `apps/server/src/game/ecs/game/components/` | SoA for numeric, AoS for complex |
| ECS systems | `apps/server/src/game/ecs/game/systems/` | Turn-based energy model |
| Dungeon generation | `apps/server/src/game/dungeon/generators/` | BSP + Cellular algorithms |
| Entity templates | `apps/server/src/game/ecs/game/templates/` | Inheritance via `extends()` |
| Network protocol | `packages/contracts/src/network/protocol.ts` | Client/server message types |
| Auth flow | `apps/server/src/server/auth/` | Better-Auth + Redis sessions |
| DB schemas | `apps/server/src/server/db/schema/` | Drizzle ORM, PostgreSQL |
| WebSocket | `apps/server/src/server/ws/index.ts` | Cookie or one-time token auth |
| Test fixtures | `apps/server/tests/seed-manager/test-helpers.ts` | Deterministic seed constants |

## Commands
```bash
# Install (requires Bun 1.3.3, Node >=22)
bun install --frozen-lockfile

# Development
bun run dev                    # Both apps (turbo)
bunx turbo run dev --filter @rogue/server  # Server only
cd apps/client && bun run dev  # Client only

# Quality
bun run check-types            # tsc --noEmit
bunx turbo run format-and-lint # Biome
bun test                       # All tests (unit, property, perf)

# Database
cd apps/server
bunx --bun drizzle-kit generate --config src/server/db/drizzle.config.ts
bunx --bun drizzle-kit push --config src/server/db/drizzle.config.ts
```

## Conventions

### TypeScript
- Strict mode with `noUncheckedIndexedAccess`
- ES2022 target, bundler module resolution
- Path alias: `@/*` → `./src/*` (client only)

### Naming
- Files: kebab-case (`seed-manager.ts`, `dungeon-loader.ts`)
- Components: PascalCase
- Schemas: `*Schema` suffix (`PositionSchema`, `HealthSchema`)

### ECS Patterns
- Component definition: `ComponentSchema.define("Name").field(...).build()`
- System definition: `defineSystem("Name").inPhase(Phase).execute(...)`
- Queries: `world.query({ with: [...], without: [...] })`
- Deferred mutations: `world.commands.spawn()`, `.flush()` after tick

### Testing
- Bun test runner, no external frameworks
- Property tests: `*.property.test.ts` with manual loops
- Perf tests: `tests/perf/` with baseline assertions
- Always use fixed seeds for determinism (`TEST_SEED = 123456789`)

## Anti-Patterns (Forbidden)
| Pattern | Reason |
|---------|--------|
| `as any`, `@ts-ignore` | Type safety is critical for ECS |
| Empty `catch {}` blocks | Hide bugs, break determinism |
| `Math.random()` in game logic | Use `SeededRandom` for reproducibility |
| Direct frontend visual edits | Delegate to `frontend-ui-ux-engineer` |
| Commit `.env*` files | Contains DB/Redis credentials |

## Environment Variables
```bash
DATABASE_URL=postgresql://...    # PostgreSQL connection
REDIS_URL=redis://...            # Optional, for sessions/rate-limit
SERVER_URL=http://localhost:3000 # Server base URL
SERVER_HOST=0.0.0.0
SERVER_PORT=3000
CLIENT_URL=http://localhost:5173
NODE_ENV=development|production
PERF_PROFILE=true                # Optional, enables perf logging
```

## Performance Baselines
| Operation | Budget |
|-----------|--------|
| BSP dungeon 80x50 | <5ms |
| Cellular dungeon 80x50 | <17ms |
| ECS tick (1000 entities) | <16ms |
| FOV recalculation | <2ms |
