# Union Queries Quick Reference

## What are Union Queries?

Union queries allow you to find entities with **ANY** of multiple components (OR logic).

```typescript
// Regular query: entities with A AND B
world.query(A, B).collect()

// Union query: entities with A OR B
world.queryAny(A, B).collect()
```

## API Methods

### `.collect()` - Get all matching entities
```typescript
const entities = world.queryAny(Sprite, Mesh, Particle).collect();
```

### `.count()` - Count matching entities
```typescript
const count = world.queryAny(Sprite, Mesh).count();
```

### `.first()` - Get first match or null
```typescript
const entity = world.queryAny(Sprite, Mesh).first();
```

### `.iter()` - Iterate over entities
```typescript
for (const entity of world.queryAny(Sprite, Mesh).iter()) {
  // Process entity
}
```

### `.run()` - Process by archetype
```typescript
world.queryAny(Sprite, Mesh).run(view => {
  for (const row of view.iterRows()) {
    const entity = view.entity(row);
    // Process entity
  }
});
```

### `.not()` - Exclude components
```typescript
// Get Sprite OR Mesh entities that DON'T have Hidden
const visible = world
  .queryAny(Sprite, Mesh)
  .not(Hidden)
  .collect();
```

## Common Patterns

### Rendering System
```typescript
// Render all visual entities
world.queryAny(Sprite, Mesh, Particle)
  .not(Hidden)
  .run(view => {
    for (const row of view.iterRows()) {
      const entity = view.entity(row);

      if (world.has(entity, Sprite)) {
        renderSprite(entity);
      } else if (world.has(entity, Mesh)) {
        renderMesh(entity);
      } else {
        renderParticle(entity);
      }
    }
  });
```

### Damage System
```typescript
// Apply damage to any damageable entity
const damageableEntities = world
  .queryAny(Health, Shield, Armor)
  .collect();

for (const entity of damageableEntities) {
  applyDamage(entity, 10);
}
```

### Cleanup System
```typescript
// Remove entities marked for deletion
const toRemove = world
  .queryAny(Dead, Expired, ToBeRemoved)
  .collect();

for (const entity of toRemove) {
  world.despawn(entity);
}
```

### State Machine
```typescript
// Process entities in any active state
const activeEntities = world
  .queryAny(Running, Jumping, Attacking)
  .not(Stunned)
  .collect();
```

## Key Features

✓ Automatic deduplication (entities appear once even with multiple matching components)
✓ Works with `.not()` exclusion filters
✓ Multiple `.not()` calls can be chained
✓ Compatible with all query result methods
✓ Efficient archetype-based iteration

## Limitations

✗ No change detection (`.added()`, `.modified()`, `.changed()`)
✗ No predicate filters (`.where()`)
✗ Component access in views requires availability check

## Performance Tips

- Use `.count()` when you only need the count
- Use `.first()` when you only need one entity
- Use `.run()` for archetype-aware processing
- Chain multiple `.not()` calls for complex exclusions
- Results are deduplicated automatically (no performance penalty)

## Examples

### Example 1: Type Polymorphism
```typescript
// Query all "interactable" entities
const interactables = world
  .queryAny(Door, Chest, NPC, Item)
  .collect();
```

### Example 2: Multiple Exclusions
```typescript
// Active, visible enemies
const enemies = world
  .queryAny(EnemyAI, BossAI)
  .not(Dead)
  .not(Hidden)
  .not(Disabled)
  .collect();
```

### Example 3: Component Type Checking
```typescript
world.queryAny(SpriteAnimation, SkeletalAnimation).run(view => {
  for (const row of view.iterRows()) {
    const entity = view.entity(row);

    if (world.has(entity, SpriteAnimation)) {
      updateSpriteAnimation(entity);
    } else {
      updateSkeletalAnimation(entity);
    }
  }
});
```

## See Also

- Full documentation: `apps/server/src/game/ecs/docs/union-queries.md`
- Example code: `apps/server/src/game/ecs/docs/examples/union-query-example.ts`
- Tests: `apps/server/tests/ecs/union-queries.test.ts`
