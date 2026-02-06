# System Sets

System Sets allow you to group related systems together and apply shared configuration to all systems in the set. This is inspired by Bevy's system sets and provides a powerful way to organize and control system execution.

## Table of Contents

- [Basic Concepts](#basic-concepts)
- [Creating System Sets](#creating-system-sets)
- [Configuring Sets](#configuring-sets)
- [Set Ordering](#set-ordering)
- [Set Conditions](#set-conditions)
- [Inheritance](#inheritance)
- [Best Practices](#best-practices)
- [Advanced Patterns](#advanced-patterns)

## Basic Concepts

A **System Set** is a label (symbol or string) that groups related systems. Systems can belong to multiple sets, and sets can have:

- **Run Conditions**: Control when all systems in the set execute
- **Ordering Constraints**: Define execution order relative to other sets
- **Hierarchical Structure**: Sets can depend on other sets

## Creating System Sets

Define a system set as a symbol or string:

```typescript
// Using symbols (recommended for type safety)
const PhysicsSet = Symbol("PhysicsSet");
const MovementSet = Symbol("MovementSet");
const CollisionSet = Symbol("CollisionSet");

// Using strings (simpler, but less type-safe)
const RenderSet = "RenderSet";
const InputSet = "InputSet";
```

Add systems to sets using `.inSet()` or `.inSets()`:

```typescript
// Single set
defineSystem("UpdateVelocity")
  .inPhase(Phase.Update)
  .inSet(PhysicsSet)
  .execute((world) => {
    // Update velocities...
  });

// Multiple sets
defineSystem("ApplyMovement")
  .inPhase(Phase.Update)
  .inSets(PhysicsSet, MovementSet)
  .execute((world) => {
    // Apply movement...
  });
```

## Configuring Sets

Use the scheduler's `configureSet()` method to configure a set:

```typescript
const scheduler = new SystemScheduler();

// Configure a set with a run condition
scheduler.configureSet(PhysicsSet)
  .runIf(inState(GameState, "playing"));

// Configure ordering
scheduler.configureSet(RenderSet)
  .after(PhysicsSet)
  .before(PostProcessSet);
```

## Set Ordering

### Chain Multiple Sets

Use `configureSets().chain()` to create a sequence:

```typescript
scheduler.configureSets(
  InputSet,
  PhysicsSet,
  RenderSet
).chain();

// Equivalent to:
// InputSet.before(PhysicsSet)
// PhysicsSet.before(RenderSet)
```

### Manual Ordering

Use `.before()` and `.after()` for explicit ordering:

```typescript
// Physics runs before rendering
scheduler.configureSet(PhysicsSet)
  .before(RenderSet);

// Movement runs after input
scheduler.configureSet(MovementSet)
  .after(InputSet);
```

### How Set Ordering Works

When a set A is ordered before set B:
- All systems in set A run before all systems in set B
- Within each set, systems follow their own ordering constraints
- Systems can still have explicit `.before()` and `.after()` relationships

Example:

```typescript
const UpdateSet = Symbol("UpdateSet");
const RenderSet = Symbol("RenderSet");

scheduler.configureSet(UpdateSet).before(RenderSet);

// System A in UpdateSet
defineSystem("UpdateA")
  .inPhase(Phase.Update)
  .inSet(UpdateSet)
  .execute(() => console.log("A"));

// System B in RenderSet
defineSystem("RenderB")
  .inPhase(Phase.Update)
  .inSet(RenderSet)
  .execute(() => console.log("B"));

// System C in UpdateSet
defineSystem("UpdateC")
  .inPhase(Phase.Update)
  .inSet(UpdateSet)
  .execute(() => console.log("C"));

// Possible execution orders:
// - A, C, B (UpdateSet systems run before RenderSet)
// - C, A, B (UpdateSet systems run before RenderSet)
```

## Set Conditions

Add run conditions to sets - all systems in the set inherit these conditions:

```typescript
class GameState extends State<"menu" | "playing" | "paused"> {}

// Only run gameplay systems when playing
scheduler.configureSet(GameplaySet)
  .runIf(inState(GameState, "playing"));

// All systems in GameplaySet will check this condition
defineSystem("SpawnEnemies")
  .inSet(GameplaySet)
  .execute(() => {
    // Only runs when GameState is "playing"
  });

defineSystem("UpdateAI")
  .inSet(GameplaySet)
  .execute(() => {
    // Only runs when GameState is "playing"
  });
```

### Combining Conditions

Systems can have their own conditions in addition to set conditions:

```typescript
class DebugMode { enabled = false; }

scheduler.configureSet(DebugSet)
  .runIf(inState(GameState, "playing"));

defineSystem("ShowDebugInfo")
  .inSet(DebugSet)
  .runIf((world) => {
    const debug = world.getResource(DebugMode);
    return debug !== null && debug.enabled;
  })
  .execute(() => {
    // Only runs when BOTH:
    // 1. GameState is "playing" (from set)
    // 2. DebugMode is enabled (from system)
  });
```

## Inheritance

Systems inherit properties from their sets:

1. **Run Conditions**: All set conditions are added to the system
2. **Ordering Constraints**: Set ordering creates system ordering
3. **Multiple Sets**: Properties from all sets are combined

```typescript
const SetA = Symbol("SetA");
const SetB = Symbol("SetB");

scheduler.configureSet(SetA).runIf(condition1);
scheduler.configureSet(SetB).runIf(condition2);

defineSystem("MySystem")
  .inSets(SetA, SetB)
  .runIf(condition3)
  .execute(() => {
    // Only runs when ALL conditions are true:
    // - condition1 (from SetA)
    // - condition2 (from SetB)
    // - condition3 (from system itself)
  });
```

## Best Practices

### 1. Use Symbols for Set Names

```typescript
// Good: Type-safe, won't collide
const PhysicsSet = Symbol("PhysicsSet");

// Less ideal: String can collide or be misspelled
const PhysicsSet = "PhysicsSet";
```

### 2. Create Logical Groupings

Group systems by:
- **Functionality**: Physics, AI, Rendering
- **Execution Stage**: Input, Simulation, Output
- **Game State**: Menu, Gameplay, Pause

```typescript
// Functional grouping
const PhysicsSet = Symbol("PhysicsSet");
const AISet = Symbol("AISet");
const RenderSet = Symbol("RenderSet");

// Stage grouping
const InputStage = Symbol("InputStage");
const SimulationStage = Symbol("SimulationStage");
const OutputStage = Symbol("OutputStage");

// State grouping
const MenuSystems = Symbol("MenuSystems");
const GameplaySystems = Symbol("GameplaySystems");
```

### 3. Use Set Conditions for State Management

```typescript
class GameState extends State<"menu" | "playing" | "paused"> {}

// Configure sets based on game state
scheduler.configureSet(MenuSystems)
  .runIf(inState(GameState, "menu"));

scheduler.configureSet(GameplaySystems)
  .runIf(inState(GameState, "playing"));

scheduler.configureSet(PauseSystems)
  .runIf(inState(GameState, "paused"));
```

### 4. Chain Related Sets

```typescript
// Clear execution pipeline
scheduler.configureSets(
  InputSet,
  PrePhysicsSet,
  PhysicsSet,
  PostPhysicsSet,
  RenderSet
).chain();
```

### 5. Minimize Set Proliferation

Too many sets can be confusing. Aim for 5-15 top-level sets per phase.

```typescript
// Good: Clear, manageable
const InputSet = Symbol("InputSet");
const PhysicsSet = Symbol("PhysicsSet");
const AISet = Symbol("AISet");
const RenderSet = Symbol("RenderSet");

// Too much: Hard to track relationships
const InputMouseSet = Symbol("InputMouseSet");
const InputKeyboardSet = Symbol("InputKeyboardSet");
const InputGamepadSet = Symbol("InputGamepadSet");
// ... 20 more sets
```

## Advanced Patterns

### Hierarchical Set Structure

Create set hierarchies for complex ordering:

```typescript
const UpdateSet = Symbol("UpdateSet");
const PhysicsSet = Symbol("PhysicsSet");
const MovementSet = Symbol("MovementSet");
const CollisionSet = Symbol("CollisionSet");

// Create hierarchy
scheduler.configureSet(PhysicsSet).after(UpdateSet);
scheduler.configureSet(MovementSet).after(PhysicsSet);
scheduler.configureSet(CollisionSet).after(PhysicsSet);

// UpdateSet → PhysicsSet → MovementSet
//                        → CollisionSet
```

### Conditional Pipelines

Different execution pipelines based on conditions:

```typescript
class NetworkMode extends State<"offline" | "client" | "server"> {}

const LocalSimulationSet = Symbol("LocalSimulation");
const NetworkSimulationSet = Symbol("NetworkSimulation");

scheduler.configureSet(LocalSimulationSet)
  .runIf(inState(NetworkMode, "offline"));

scheduler.configureSet(NetworkSimulationSet)
  .runIf(inState(NetworkMode, "client").or(inState(NetworkMode, "server")));
```

### Debug and Profiling Sets

Use sets for debug features:

```typescript
class DebugMode { enabled = false; }

const DebugSet = Symbol("DebugSet");
const ProfileSet = Symbol("ProfileSet");

scheduler.configureSet(DebugSet)
  .runIf((world) => world.getResource(DebugMode)?.enabled ?? false);

scheduler.configureSet(ProfileSet)
  .runIf((world) => world.getResource(DebugMode)?.enabled ?? false)
  .after(DebugSet);
```

### Feature Flags with Sets

Enable/disable game features:

```typescript
class Features {
  constructor(
    public weather = true,
    public dynamicLighting = true,
    public particles = true,
  ) {}
}

const WeatherSet = Symbol("WeatherSet");
const LightingSet = Symbol("LightingSet");
const ParticleSet = Symbol("ParticleSet");

scheduler.configureSet(WeatherSet)
  .runIf((world) => world.getResource(Features)?.weather ?? false);

scheduler.configureSet(LightingSet)
  .runIf((world) => world.getResource(Features)?.dynamicLighting ?? false);

scheduler.configureSet(ParticleSet)
  .runIf((world) => world.getResource(Features)?.particles ?? false);
```

## Complete Example

Here's a complete example showing a game loop using system sets:

```typescript
import { World, SystemScheduler, Phase, defineSystem, inState, State } from "@/ecs";

// Define game states
class GameState extends State<"loading" | "menu" | "playing" | "paused"> {}

// Define system sets
const LoadingSet = Symbol("LoadingSet");
const MenuSet = Symbol("MenuSet");
const InputSet = Symbol("InputSet");
const PhysicsSet = Symbol("PhysicsSet");
const AISet = Symbol("AISet");
const RenderSet = Symbol("RenderSet");

// Create world and scheduler
const world = new World();
const scheduler = new SystemScheduler();

// Configure set run conditions
scheduler.configureSet(LoadingSet)
  .runIf(inState(GameState, "loading"));

scheduler.configureSet(MenuSet)
  .runIf(inState(GameState, "menu"));

scheduler.configureSets(InputSet, PhysicsSet, AISet, RenderSet)
  .chain();

// Configure gameplay sets to only run when playing
const gameplaySets = [InputSet, PhysicsSet, AISet];
for (const set of gameplaySets) {
  scheduler.configureSet(set)
    .runIf(inState(GameState, "playing"));
}

// Loading systems
defineSystem("LoadAssets")
  .inPhase(Phase.PreUpdate)
  .inSet(LoadingSet)
  .execute((world) => {
    // Load game assets...
    console.log("Loading assets...");
  });

// Menu systems
defineSystem("MenuInput")
  .inPhase(Phase.Update)
  .inSet(MenuSet)
  .execute((world) => {
    console.log("Processing menu input...");
  });

// Gameplay systems
defineSystem("ProcessInput")
  .inPhase(Phase.Update)
  .inSet(InputSet)
  .execute((world) => {
    console.log("Processing game input...");
  });

defineSystem("UpdatePhysics")
  .inPhase(Phase.Update)
  .inSet(PhysicsSet)
  .execute((world) => {
    console.log("Updating physics...");
  });

defineSystem("UpdateAI")
  .inPhase(Phase.Update)
  .inSet(AISet)
  .execute((world) => {
    console.log("Updating AI...");
  });

// Rendering always runs
defineSystem("Render")
  .inPhase(Phase.PostUpdate)
  .inSet(RenderSet)
  .execute((world) => {
    console.log("Rendering...");
  });

// Initialize game
world.setResource(GameState, new GameState("loading"));

// Game loop
for (let i = 0; i < 3; i++) {
  console.log(`\n--- Tick ${i + 1} ---`);

  const state = world.getResource(GameState)!;
  console.log(`State: ${state.current}`);

  scheduler.runAll(world);

  // Transition states
  if (i === 0) state.current = "menu";
  if (i === 1) state.current = "playing";
}

// Output:
// --- Tick 1 ---
// State: loading
// Loading assets...
// Rendering...
//
// --- Tick 2 ---
// State: menu
// Processing menu input...
// Rendering...
//
// --- Tick 3 ---
// State: playing
// Processing game input...
// Updating physics...
// Updating AI...
// Rendering...
```

## Summary

System Sets provide powerful tools for organizing your ECS:

- **Group** related systems with `.inSet()` and `.inSets()`
- **Control execution** with set run conditions
- **Order execution** with set ordering constraints
- **Inherit properties** from sets to systems
- **Create pipelines** with `.configureSets().chain()`

Use system sets to create clean, maintainable, and flexible system architectures.
