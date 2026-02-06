# Union Queries (queryAny)

Union queries allow you to query entities that have **ANY** of multiple components, using OR logic instead of the default AND logic.

## Basic Usage

```typescript
import { World, component, u32 } from "../core";

@component
class Sprite {
  texture = u32(0);
}

@component
class Mesh {
  model = u32(0);
}

@component
class Particle {
  lifetime = f32(1.0);
}

const world = new World();

// Create entities with different renderable components
const e1 = world.spawn(Sprite);
const e2 = world.spawn(Mesh);
const e3 = world.spawn(Particle);
const e4 = world.spawn(Position); // No renderable component

// Query entities with ANY renderable component
const renderables = world.queryAny(Sprite, Mesh, Particle).collect();
// Returns [e1, e2, e3]
```

## Methods

### `.run(callback)`

Execute a callback for each archetype that matches the union query:

```typescript
world.queryAny(Sprite, Mesh).run(view => {
  for (const row of view.iterRows()) {
    const entity = view.entity(row);
    // Process entity that has at least one of the components

    // Access component data if available in this archetype
    if (view.column(Sprite, "texture")) {
      const texture = view.column(Sprite, "texture")[row];
    }
  }
});
```

### `.iter()`

Iterate over all matching entities:

```typescript
for (const entity of world.queryAny(Sprite, Mesh, Particle).iter()) {
  console.log(`Entity ${entity} has a renderable component`);
}
```

### `.collect()`

Collect all matching entities into an array:

```typescript
const entities = world.queryAny(Sprite, Mesh).collect();
```

### `.count()`

Count the total number of matching entities:

```typescript
const renderableCount = world.queryAny(Sprite, Mesh, Particle).count();
```

### `.first()`

Get the first matching entity, or null if none:

```typescript
const firstRenderable = world.queryAny(Sprite, Mesh).first();
if (firstRenderable !== null) {
  // Process first renderable entity
}
```

## Exclusion Filters

Use `.not()` to exclude entities with specific components:

```typescript
@component
class Hidden {}

// Query visible renderables (has Sprite OR Mesh, but NOT Hidden)
const visibleRenderables = world
  .queryAny(Sprite, Mesh)
  .not(Hidden)
  .collect();
```

Multiple `.not()` calls can be chained:

```typescript
@component
class Disabled {}

// Query active, visible renderables
const activeRenderables = world
  .queryAny(Sprite, Mesh, Particle)
  .not(Hidden)
  .not(Disabled)
  .collect();
```

## Use Cases

### 1. Rendering System

Render entities with any type of visual component:

```typescript
world.queryAny(Sprite, Mesh, Particle).run(view => {
  for (const row of view.iterRows()) {
    const entity = view.entity(row);

    // Check which component type this entity has
    if (world.has(entity, Sprite)) {
      renderSprite(entity);
    } else if (world.has(entity, Mesh)) {
      renderMesh(entity);
    } else if (world.has(entity, Particle)) {
      renderParticle(entity);
    }
  }
});
```

### 2. Damage System

Apply damage to entities with any type of health:

```typescript
@component
class Health {
  current = u32(100);
  max = u32(100);
}

@component
class Shield {
  strength = u32(50);
}

@component
class Armor {
  defense = u32(20);
}

// Get all damageable entities
const damageableEntities = world
  .queryAny(Health, Shield, Armor)
  .collect();

for (const entity of damageableEntities) {
  applyDamage(entity, damage);
}
```

### 3. Cleanup System

Despawn entities with any type of removal marker:

```typescript
@component
class Dead {}

@component
class Expired {}

@component
class ToBeRemoved {}

// Remove all entities marked for deletion
const toRemove = world.queryAny(Dead, Expired, ToBeRemoved).collect();
for (const entity of toRemove) {
  world.despawn(entity);
}
```

## Performance Notes

1. **Deduplication**: Entities are automatically deduplicated. If an entity has multiple matching components, it appears only once in the results.

2. **Archetype Iteration**: The implementation iterates over archetypes for each component type, using a Set to deduplicate.

3. **View Optimization**: When using `.run()`, the view only includes component metas that the specific archetype actually has, optimizing memory usage.

4. **Comparison with Regular Queries**:
   - `world.query(A, B)` = entities with **A AND B**
   - `world.queryAny(A, B)` = entities with **A OR B**

## Limitations

1. **No Change Detection**: Union queries don't currently support `.added()`, `.modified()`, or `.changed()` filters.

2. **No Where Filters**: Union queries don't support `.where()` predicates. If you need filtering, use `.collect()` and filter the result array.

3. **Component Access in Views**: When using `.run()`, you can only access components that exist in the specific archetype. Check availability before accessing.

## Examples

### Example 1: Type-Based Processing

```typescript
// Process different AI types
world.queryAny(AggressiveAI, PassiveAI, PatrollingAI).run(view => {
  for (const row of view.iterRows()) {
    const entity = view.entity(row);

    if (world.has(entity, AggressiveAI)) {
      updateAggressiveAI(entity);
    } else if (world.has(entity, PassiveAI)) {
      updatePassiveAI(entity);
    } else {
      updatePatrollingAI(entity);
    }
  }
});
```

### Example 2: Status Effects

```typescript
// Process all entities with any debuff
const debuffedEntities = world
  .queryAny(Poisoned, Stunned, Slowed, Burning)
  .collect();

for (const entity of debuffedEntities) {
  applyDebuffEffects(entity);
}
```

### Example 3: Resource Collection

```typescript
// Collect all resource nodes
const resources = world
  .queryAny(TreeNode, RockNode, OreVein, PlantNode)
  .not(Depleted)
  .collect();

// Player can interact with any of these
for (const resource of resources) {
  if (isInRange(player, resource)) {
    showInteractPrompt(resource);
  }
}
```
