# Hierarchy Helpers

Fonctions utilitaires pour naviguer et manipuler les hiérarchies parent-enfant basées sur la relation `ChildOf`.

## Import

```typescript
import { hierarchy, ChildOf } from "./ecs";
```

## Navigation

### Parent et Enfants

```typescript
// Obtenir le parent d'une entité
const parent = hierarchy.parent(world, entity);  // Entity | null

// Obtenir les enfants directs
const children = hierarchy.children(world, entity);  // Entity[]

// Vérifications
hierarchy.hasParent(world, entity);    // boolean
hierarchy.hasChildren(world, entity);  // boolean
hierarchy.isChildOf(world, child, parent);  // boolean
```

### Ancêtres et Descendants

```typescript
// Tous les ancêtres (parent → racine)
const ancestors = hierarchy.ancestors(world, entity);
// [parent, grandparent, greatGrandparent, ...]

// Racine de l'arbre
const root = hierarchy.root(world, entity);

// Tous les descendants (enfants, petits-enfants, etc.)
const descendants = hierarchy.descendants(world, entity);

// Profondeur dans l'arbre (0 = racine)
const depth = hierarchy.depth(world, entity);
```

### Relations

```typescript
// Est descendant de ?
hierarchy.isDescendantOf(world, entity, ancestor);

// Est ancêtre de ?
hierarchy.isAncestorOf(world, parent, descendant);

// Frères et sœurs (autres enfants du même parent)
const siblings = hierarchy.siblings(world, entity);
```

## Manipulation

### Reparenter

```typescript
// Changer de parent
hierarchy.reparent(world, entity, newParent);

// Devenir racine (supprimer le parent)
hierarchy.reparent(world, entity, null);
// ou
hierarchy.orphan(world, entity);
```

### Ajouter/Supprimer des enfants

```typescript
// Ajouter un enfant à un parent
hierarchy.addChild(world, parent, child);

// Supprimer un enfant spécifique
hierarchy.removeChild(world, parent, child);
```

## Itération

### Enfants directs

```typescript
hierarchy.forEachChild(world, parent, (child) => {
  console.log("Enfant:", child);
});
```

### Tous les descendants (depth-first)

```typescript
hierarchy.forEachDescendant(world, root, (descendant, depth) => {
  const indent = "  ".repeat(depth);
  console.log(indent + "Descendant:", descendant);
});
```

## Exemple Complet : Inventaire

```typescript
@component class Item { itemId = i32(0); }
@component class Equipped { slot = i32(0); }

// Créer un joueur avec un inventaire
const player = world.spawn(Player, Position);

// Ajouter des items à l'inventaire (comme enfants)
const sword = world.spawn(Item, Equipped);
const shield = world.spawn(Item, Equipped);
const potion = world.spawn(Item);

hierarchy.addChild(world, player, sword);
hierarchy.addChild(world, player, shield);
hierarchy.addChild(world, player, potion);

// Lister l'inventaire
const inventory = hierarchy.children(world, player);
console.log(`${inventory.length} items dans l'inventaire`);

// Trouver les items équipés
for (const item of inventory) {
  if (world.has(item, Equipped)) {
    console.log("Équipé:", item);
  }
}

// Déposer un item (orphelin = plus dans l'inventaire)
hierarchy.orphan(world, potion);

// Transférer un item à un autre joueur
hierarchy.reparent(world, sword, otherPlayer);
```

## Exemple : Arbre de scène

```typescript
// Structure de niveau : Room → Tiles, Entities
const room = world.spawn(Room);

// Ajouter des tiles comme enfants
for (let x = 0; x < 10; x++) {
  for (let y = 0; y < 10; y++) {
    const tile = world.spawn(Tile, Position);
    world.set(tile, Position, { x, y });
    hierarchy.addChild(world, room, tile);
  }
}

// Ajouter des entités dans la room
const enemy = world.spawn(Enemy, Position);
hierarchy.addChild(world, room, enemy);

// Despawn de la room = despawn de tout (cascade delete)
world.despawn(room);  // Tous les enfants sont aussi despawn
```

## Cascade Delete

La relation `ChildOf` a `cascadeDelete: true` par défaut. Quand un parent est despawn, tous ses enfants le sont aussi.

```typescript
const parent = world.spawn(Position);
const child = world.spawn(Position);
hierarchy.addChild(world, parent, child);

world.despawn(parent);
// child est aussi despawn automatiquement

world.isAlive(child);  // false
```

## Performance

| Opération | Complexité |
|-----------|------------|
| `parent()` | O(1) |
| `children()` | O(n enfants) |
| `hasParent()` | O(1) |
| `hasChildren()` | O(1) |
| `ancestors()` | O(profondeur) |
| `descendants()` | O(n descendants) |
| `depth()` | O(profondeur) |
| `reparent()` | O(1) |

Pour les hiérarchies très profondes, éviter d'appeler `ancestors()` ou `depth()` fréquemment.
