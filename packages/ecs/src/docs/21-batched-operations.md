# Batched Operations

## Overview

The batched operations API allows you to combine multiple structural changes (add/remove components) into a single archetype transition. This significantly improves performance when making multiple changes to an entity.

## Why Use Batched Operations?

In an archetype-based ECS, each component add/remove operation triggers an archetype transition:
- Allocate a row in the new archetype
- Copy existing component data from the old archetype
- Update entity record
- Free the old row

When adding multiple components one by one, each operation causes a separate archetype transition. With batched operations, all changes are applied in **a single archetype transition**.

### Performance Comparison

```typescript
// Individual operations - 3 archetype transitions
const entity = world.spawn();
world.add(entity, Position, { x: 0, y: 0 });      // Transition 1: [] -> [Position]
world.add(entity, Velocity, { vx: 1, vy: 1 });    // Transition 2: [Position] -> [Position, Velocity]
world.add(entity, Health, { current: 100 });      // Transition 3: [Position, Velocity] -> [Position, Velocity, Health]

// Batched operations - 1 archetype transition
const entity = world.spawn();
world.batch(entity)
  .add(Position, { x: 0, y: 0 })
  .add(Velocity, { vx: 1, vy: 1 })
  .add(Health, { current: 100 })
  .commit();  // Single transition: [] -> [Position, Velocity, Health]
```

## API

### Starting a Batch

```typescript
const builder = world.batch(entity);
```

Returns an `EntityBuilder` instance with a fluent API for chaining operations.

### Adding Components

```typescript
world.batch(entity)
  .add(Position, { x: 10, y: 20 })
  .add(Velocity)  // Uses default values
  .commit();
```

### Removing Components

```typescript
world.batch(entity)
  .remove(Position)
  .remove(Velocity)
  .commit();
```

### Mixed Operations

```typescript
world.batch(entity)
  .remove(Temporary)
  .add(Permanent)
  .add(Health, { current: 50, max: 100 })
  .commit();
```

## Behavior Details

### Conflict Resolution

If a component appears in both add and remove operations, **remove wins**:

```typescript
world.batch(entity)
  .add(Position, { x: 10, y: 20 })
  .remove(Position)  // Remove wins - Position will NOT be on the entity
  .commit();
```

### Duplicate Adds

If you add the same component multiple times, **the last one wins**:

```typescript
world.batch(entity)
  .add(Position, { x: 10, y: 20 })
  .add(Position, { x: 100, y: 200 })  // This data is used
  .commit();
```

### Empty Batch

An empty batch (no operations) is a no-op:

```typescript
world.batch(entity).commit();  // Does nothing
```

### Dead Entity

Batching on a dead entity is a no-op:

```typescript
const entity = world.spawn();
world.despawn(entity);
world.batch(entity).add(Position).commit();  // No effect
```

### Despawn on Empty

If a batch removes all components from an entity, the entity is despawned:

```typescript
const entity = world.spawn(Position, Velocity);
world.batch(entity)
  .remove(Position)
  .remove(Velocity)
  .commit();

// Entity is now despawned
expect(world.isAlive(entity)).toBe(false);
```

## Optimization Cases

### Same Archetype Optimization

If the batch doesn't actually change the archetype (e.g., adding a component that already exists), the implementation optimizes by only updating the component data:

```typescript
const entity = world.spawn(Position, Velocity);

// This won't trigger an archetype transition
world.batch(entity)
  .add(Position, { x: 999, y: 888 })  // Just updates existing Position data
  .commit();
```

### Preserving Existing Data

When moving to a new archetype, existing component data is preserved:

```typescript
const entity = world.spawn(Position);
world.set(entity, Position, { x: 100, y: 200 });

// Add new components
world.batch(entity)
  .add(Velocity, { vx: 5, vy: 10 })
  .add(Health, { current: 50, max: 100 })
  .commit();

// Position data is preserved
const pos = world.get(entity, Position);
expect(pos.x).toBe(100);
expect(pos.y).toBe(200);
```

## Use Cases

### Entity Initialization

```typescript
// Instead of:
const player = world.spawn();
world.add(player, Position, { x: 0, y: 0 });
world.add(player, Velocity, { vx: 0, vy: 0 });
world.add(player, Health, { current: 100, max: 100 });
world.add(player, Player);
world.add(player, Renderable, { sprite: "player" });

// Use:
const player = world.spawn();
world.batch(player)
  .add(Position, { x: 0, y: 0 })
  .add(Velocity, { vx: 0, vy: 0 })
  .add(Health, { current: 100, max: 100 })
  .add(Player)
  .add(Renderable, { sprite: "player" })
  .commit();
```

### State Transitions

```typescript
// Transform enemy to ally
world.batch(enemy)
  .remove(Enemy)
  .remove(Hostile)
  .add(Ally)
  .add(Friendly)
  .commit();
```

### Item Equipping

```typescript
// Equip item
world.batch(item)
  .remove(InInventory)
  .add(Equipped, { slot: "mainHand" })
  .add(ActiveEffects)
  .commit();
```

### Buff/Debuff Application

```typescript
// Apply temporary buff
world.batch(entity)
  .add(Buffed)
  .add(SpeedBoost, { multiplier: 2 })
  .add(DamageBoost, { multiplier: 1.5 })
  .commit();
```

## Best Practices

### When to Use Batching

Use batched operations when you need to:
- Add/remove multiple components at once
- Initialize entities with many components
- Transform entity state (e.g., enemy → ally)
- Apply/remove multiple buffs/debuffs

### When NOT to Use Batching

Don't use batched operations when:
- Only changing a single component (use `world.add()` or `world.remove()`)
- Only updating component data (use `world.set()`)
- The operation is not performance-critical

### Combining with Bundles

Batched operations work well with bundles for initialization:

```typescript
// Use bundle for initial components
const entity = world.spawnBundle(PlayerBundle);

// Then batch additional components
world.batch(entity)
  .add(QuestMarker, { questId: 42 })
  .add(DialogTarget)
  .commit();
```

## Implementation Notes

The batch API is implemented via the `EntityBuilder` class, which:
1. Queues add/remove operations
2. On `commit()`, reconciles operations (handling conflicts)
3. Computes the final component set
4. Performs a single archetype transition
5. Applies all component data in one go

This approach ensures:
- Minimal memory moves
- Single archetype lookup
- Optimal cache locality
- Correct conflict resolution

## Related APIs

- **Bundles**: For reusable component sets (see `17-bundles.md`)
- **Spawn**: For creating entities with initial components
- **Add/Remove**: For individual structural changes
- **Set**: For updating component data without structural changes
