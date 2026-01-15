# Marker Components Usage Guide

Marker components (also called tags) are zero-storage components used to categorize and query entities efficiently.

## Basic Usage

```typescript
import { World, Renderable, Player, Enemy } from "../index";

const world = new World();

// Spawn entities with markers
const player = world.spawn(Renderable, Player);
const enemy = world.spawn(Renderable, Enemy);
const hiddenEntity = world.spawn(Hidden);
```

## Querying by Markers

```typescript
// Query all renderable entities
world.query(Renderable).run(view => {
  for (let i = 0; i < view.count; i++) {
    const entity = view.entity(i);
    // Process renderable entities
  }
});

// Count entities with markers
const renderableCount = world.query(Renderable).count();
```

## Combining Multiple Markers

```typescript
// Query entities that have ALL specified markers
const playerEnemies = world.query(Player, Enemy, Serializable);

// Check count
console.log(`Found ${playerEnemies.count()} entities`);
```

## Exclusion Queries

```typescript
// Query alive players (Player but NOT Dead)
world.query(Player).not(Dead).run(view => {
  // Process only living players
});

// Query visible entities (Renderable but NOT Hidden or Culled)
world.query(Renderable).not(Hidden, Culled).run(view => {
  // Process only visible entities
});
```

## Adding/Removing Markers at Runtime

```typescript
const entity = world.spawn(Renderable);

// Add a marker
world.add(entity, Hidden);

// Check if entity has marker
if (world.has(entity, Hidden)) {
  console.log("Entity is hidden");
}

// Remove a marker
world.remove(entity, Hidden);
```

## Available Marker Categories

### Rendering Markers
- `Renderable` - Entity can be rendered
- `Hidden` - Entity is hidden from rendering
- `Culled` - Entity is outside camera view

### Physics Markers
- `Collidable` - Participates in collision detection
- `Blocking` - Blocks movement
- `Trigger` - Detects overlap without physics response

### Game Logic Markers
- `Player` - Controlled by player
- `Enemy` - Controlled by AI
- `NPC` - Neutral/friendly NPC
- `Pickable` - Can be picked up
- `Interactable` - Can be interacted with

### Lifecycle Markers
- `Dead` - Entity is dead and should be cleaned up
- `JustSpawned` - Entity was just spawned (for initialization systems)
- `PendingDespawn` - Entity should be despawned at end of tick

### Serialization Markers
- `Serializable` - Entity should be saved/loaded
- `NetworkSynced` - Entity should be synced over network
- `MapEntity` - Entity is part of the map (static)

## Best Practices

1. **Use markers for categorization**: Markers are perfect for grouping entities by behavior or role
2. **Combine with data components**: Use markers alongside regular components for efficient queries
3. **Lifecycle management**: Use lifecycle markers like `Dead` or `PendingDespawn` for cleanup systems
4. **Avoid overusing markers**: Don't create a marker for every possible state - consider using component data instead

## Performance Notes

- Markers have zero storage overhead (no data stored per entity)
- Queries by marker are as fast as queries by regular components
- Combining multiple markers in a single query is efficient due to archetype-based storage
