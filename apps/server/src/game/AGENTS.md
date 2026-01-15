# Game Simulation Knowledge Base

**Scope:** Game engine core - ECS, dungeon generation, networking

## Structure
```
game/
├── ecs/              # Entity-Component-System (archetype-based)
│   ├── core/         # World, entities, components, archetypes, queries
│   ├── event/        # EventQueue, Observers (reactive hooks)
│   ├── relationship/ # Relations (ChildOf, Contains, entity refs)
│   ├── schedule/     # System scheduler, sets, run conditions
│   ├── query/        # Query cache, filters, union queries
│   ├── spatial/      # Spatial grid for efficient lookups
│   ├── prefab/       # Prefab templates
│   ├── serialization/# Save/load with migrations
│   ├── storage/      # String pool, resources
│   └── docs/         # Complete ECS documentation
├── dungeon/          # Procedural generation
│   ├── generators/   # BSP + Cellular algorithms
│   ├── core/         # Grid, flood-fill, union-find, spatial-hash
│   └── entities/     # Room, Connection, Dungeon
├── network/          # Multiplayer
│   ├── game-server.ts    # Session management
│   ├── game-session.ts   # Player state
│   ├── sync-manager.ts   # State synchronization
│   └── message-handler.ts# Protocol handling
└── game-init.ts      # Singleton game instance
```

## Where to Look
| Task | Location |
|------|----------|
| Add component | Define with `@component` decorator |
| Add system | `defineSystem("Name").inPhase(Phase.Update).execute(...)` |
| Add entity prefab | `definePrefab("Name", ...)` |
| New dungeon algorithm | `dungeon/generators/algorithms/` extending `DungeonGenerator` |
| Network messages | `network/message-handler.ts` + contracts protocol |
| ECS docs | `ecs/docs/` - comprehensive guides and cheat sheet |

## Key Patterns

### ECS Component Definition
```typescript
import { component, i32, f32, str, entityRef } from "./ecs";

@component
class Position {
  x = i32(0);
  y = i32(0);
}

@component
class Item {
  name = str("Unknown");
  damage = i32(0);
  holder = entityRef();  // Reference to holding entity
}
```

### System Registration
```typescript
import { defineSystem, Phase } from "./ecs";

const MovementSystem = defineSystem("Movement")
  .inPhase(Phase.Update)
  .before("Collision")
  .execute((world) => {
    world.query(Position, Velocity).run(view => {
      const x = view.column(Position, "x");
      const vx = view.column(Velocity, "vx");
      for (let i = 0; i < view.count; i++) {
        x[i] += vx[i];
      }
    });
  });

world.addSystem(MovementSystem);
```

### Turn System
- Energy threshold: 100 to act
- Speed modifier: `(energyPerTurn * speed) / 100`
- Fast-forward: calculates min ticks for any entity to reach threshold

### Dungeon Generation
- BSP: Partitioning → room placement → corridor carving
- Cellular: Noise init → CA evolution → cavern analysis → pathfinding
- Both output `Uint8Array` terrain for zero-copy ECS loading

## Anti-Patterns
| Don't | Do |
|-------|-----|
| `Math.random()` | Use `SeededRandom` from PRNG streams |
| Direct component mutation during iteration | Use `world.commands.*` |
| Spawning without template | Use `templates.instantiate()` |

## Game Instance
```typescript
const { world, gameServer } = getGameInstance();
const instance = createGameInstance();
```
