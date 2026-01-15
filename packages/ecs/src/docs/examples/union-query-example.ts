/**
 * Union Query Example
 *
 * This example demonstrates how to use queryAny() to query entities
 * with ANY of multiple components (OR logic).
 */

import { World, component, f32, u32 } from "../../core";

// Define different types of renderable components
@component
class Sprite {
  texture = u32(0);
  width = f32(32);
  height = f32(32);
}

@component
class Mesh {
  model = u32(0);
  scale = f32(1);
}

@component
class Particle {
  lifetime = f32(1.0);
  color = u32(0xffffff);
}

@component
class Position {
  x = f32(0);
  y = f32(0);
}

@component
class Hidden {}

@component
class Dead {}

// Create a world and spawn entities
const world = new World();

// Spawn entities with different renderable components
const player = world.spawn(Sprite, Position);
world.set(player, Sprite, { texture: 1, width: 64, height: 64 });
world.set(player, Position, { x: 100, y: 100 });

const enemy = world.spawn(Mesh, Position);
world.set(enemy, Mesh, { model: 2, scale: 1.5 });
world.set(enemy, Position, { x: 200, y: 150 });

const explosion = world.spawn(Particle, Position);
world.set(explosion, Particle, { lifetime: 0.5, color: 0xff0000 });
world.set(explosion, Position, { x: 150, y: 125 });

const hiddenTreasure = world.spawn(Sprite, Position, Hidden);
world.set(hiddenTreasure, Sprite, { texture: 3, width: 32, height: 32 });
world.set(hiddenTreasure, Position, { x: 300, y: 300 });

const corpse = world.spawn(Sprite, Position, Dead);
world.set(corpse, Sprite, { texture: 4, width: 48, height: 48 });
world.set(corpse, Position, { x: 50, y: 50 });

// Example 1: Query all renderable entities
console.log("=== Example 1: All Renderables ===");
const allRenderables = world.queryAny(Sprite, Mesh, Particle).collect();
console.log(`Total renderable entities: ${allRenderables.length}`); // 5

// Example 2: Query visible renderables (not hidden)
console.log("\n=== Example 2: Visible Renderables ===");
const visibleRenderables = world
  .queryAny(Sprite, Mesh, Particle)
  .not(Hidden)
  .collect();
console.log(`Visible renderable entities: ${visibleRenderables.length}`); // 4

// Example 3: Query alive, visible renderables
console.log("\n=== Example 3: Alive, Visible Renderables ===");
const aliveVisibleRenderables = world
  .queryAny(Sprite, Mesh, Particle)
  .not(Hidden)
  .not(Dead)
  .collect();
console.log(`Alive, visible renderables: ${aliveVisibleRenderables.length}`); // 3

// Example 4: Use .run() to process entities by archetype
console.log("\n=== Example 4: Processing by Archetype ===");
world.queryAny(Sprite, Mesh, Particle).run((view) => {
  console.log(`Processing archetype with ${view.count} entities`);

  for (const row of view.iterRows()) {
    const entity = view.entity(row);

    // Check which component type this entity has
    if (world.has(entity, Sprite)) {
      const sprite = world.get(entity, Sprite);
      console.log(`  - Sprite entity: texture=${sprite?.texture}`);
    } else if (world.has(entity, Mesh)) {
      const mesh = world.get(entity, Mesh);
      console.log(`  - Mesh entity: model=${mesh?.model}, scale=${mesh?.scale}`);
    } else if (world.has(entity, Particle)) {
      const particle = world.get(entity, Particle);
      console.log(`  - Particle entity: lifetime=${particle?.lifetime}s`);
    }
  }
});

// Example 5: Count entities
console.log("\n=== Example 5: Counting ===");
console.log(`Total renderables: ${world.queryAny(Sprite, Mesh, Particle).count()}`);
console.log(`Sprites only: ${world.queryAny(Sprite).count()}`);
console.log(`Hidden renderables: ${world.queryAny(Sprite, Mesh, Particle).not(Hidden).count()}`);

// Example 6: Get first matching entity
console.log("\n=== Example 6: First Match ===");
const firstRenderable = world.queryAny(Sprite, Mesh, Particle).first();
if (firstRenderable !== null) {
  console.log(`First renderable entity: ${firstRenderable}`);
}

// Example 7: Iterate with for...of
console.log("\n=== Example 7: Iteration ===");
let count = 0;
for (const entity of world.queryAny(Sprite, Mesh).iter()) {
  count++;
  if (count <= 3) {
    console.log(`Entity ${entity} has Sprite or Mesh`);
  }
}

// Example 8: Practical rendering system
console.log("\n=== Example 8: Rendering System ===");
function renderSystem(world: World) {
  // Get all visible renderables
  world
    .queryAny(Sprite, Mesh, Particle)
    .not(Hidden)
    .run((view) => {
      for (const row of view.iterRows()) {
        const entity = view.entity(row);
        const pos = world.get(entity, Position);

        if (!pos) continue;

        if (world.has(entity, Sprite)) {
          const sprite = world.get(entity, Sprite)!;
          console.log(
            `Render sprite at (${pos.x}, ${pos.y}): texture=${sprite.texture}`
          );
        } else if (world.has(entity, Mesh)) {
          const mesh = world.get(entity, Mesh)!;
          console.log(
            `Render mesh at (${pos.x}, ${pos.y}): model=${mesh.model}, scale=${mesh.scale}`
          );
        } else if (world.has(entity, Particle)) {
          const particle = world.get(entity, Particle)!;
          console.log(
            `Render particle at (${pos.x}, ${pos.y}): color=0x${particle.color.toString(16)}`
          );
        }
      }
    });
}

renderSystem(world);

// Example 9: Dynamic component changes
console.log("\n=== Example 9: Dynamic Changes ===");
const newEntity = world.spawn(Position);
world.set(newEntity, Position, { x: 500, y: 500 });

console.log(`Before adding Sprite: ${world.queryAny(Sprite, Mesh).count()} renderables`);

world.add(newEntity, Sprite);
world.set(newEntity, Sprite, { texture: 5, width: 32, height: 32 });

console.log(`After adding Sprite: ${world.queryAny(Sprite, Mesh).count()} renderables`);

// Example 10: Cleanup system
console.log("\n=== Example 10: Cleanup System ===");
@component
class Expired {}

@component
class ToBeRemoved {}

const expiredEntity = world.spawn(Sprite, Expired);
const toRemoveEntity = world.spawn(Mesh, ToBeRemoved);

const toCleanup = world.queryAny(Dead, Expired, ToBeRemoved).collect();
console.log(`Entities to cleanup: ${toCleanup.length}`);

for (const entity of toCleanup) {
  console.log(`Despawning entity ${entity}`);
  world.despawn(entity);
}

console.log(`Remaining renderables: ${world.queryAny(Sprite, Mesh, Particle).count()}`);

console.log("\n=== Example Complete ===");
