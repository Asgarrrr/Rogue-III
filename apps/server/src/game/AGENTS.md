# Game Simulation Knowledge Base

**Scope:** Game engine core - ECS, dungeon generation, networking

## Structure
```
game/
├── ecs/              # Entity-Component-System (v1 current, v2 WIP)
│   ├── core/         # World, entities, components, systems, queries
│   ├── game/         # Game-specific components, systems, templates
│   ├── features/     # Templates, serialization, hierarchy
│   └── integration/  # Dungeon loader
├── ecs-v2/           # Next-gen ECS (field-based storage)
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
| Add component | `ecs/game/components/` + register in index.ts |
| Add system | `ecs/game/systems/` + configure phase/dependencies |
| Add entity template | `ecs/game/templates/` using `defineTemplate()` |
| New dungeon algorithm | `dungeon/generators/algorithms/` extending `DungeonGenerator` |
| Network messages | `network/message-handler.ts` + contracts protocol |

## Key Patterns

### ECS Component Definition
```typescript
const PositionSchema = ComponentSchema.define("Position")
  .field("x", ComponentType.I32, 0)
  .field("y", ComponentType.I32, 0)
  .build();
```

### System Registration
```typescript
const MovementSystem = defineSystem("Movement")
  .inPhase(SystemPhase.Update)
  .runBefore("Collision")
  .withQuery({ with: ["Position", "Velocity"] })
  .execute((world) => { /* ... */ });
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
