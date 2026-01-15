# 07 - Spatial Index

> Requêtes spatiales efficaces : "Qui est près de moi ?"

## Le Problème

Trouver les entités proches d'une position est une opération courante mais coûteuse.

```typescript
// ❌ Approche naïve - O(n) pour CHAQUE requête
function findNearby(world: World, x: number, y: number, radius: number) {
  const results = [];

  // Doit vérifier TOUTES les entités !
  for (const entity of world.query(Position).iter()) {
    const pos = world.get(entity, Position);
    const dx = pos.x - x;
    const dy = pos.y - y;
    if (dx * dx + dy * dy <= radius * radius) {
      results.push(entity);
    }
  }

  return results;  // 10000 entités = 10000 vérifications !
}
```

## La Solution : Grille Spatiale

Une **grille spatiale** divise le monde en cellules. On ne vérifie que les cellules concernées.

```
┌─────────────────────────────────────────────────────────────────┐
│                          Monde (1000x1000)                       │
│  ┌─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┬─────┐  │
│  │     │     │     │     │     │     │     │     │     │     │  │
│  │     │     │     │     │     │     │     │     │     │     │  │
│  ├─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┤  │
│  │     │     │  ●  │     │     │     │     │     │     │     │  │
│  │     │     │  ●  │ ●   │     │     │     │     │     │     │  │
│  ├─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┤  │
│  │     │     │     │     │     │     │  ●  │     │     │     │  │
│  │     │     │     │     │     │  ●  │     │     │     │     │  │
│  ├─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┼─────┤  │
│  │     │     │     │     │     │     │     │     │     │     │  │
│  │     │     │     │     │     │     │     │     │     │     │  │
│  └─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┴─────┘  │
│                                                                  │
│  Query radius autour de (250, 350) :                             │
│  → Ne vérifie que 4-9 cellules au lieu de tout le monde !       │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Créer une Grille Spatiale

```typescript
import { SpatialGrid } from "./ecs";

const grid = new SpatialGrid({
  worldWidth: 1000,   // Largeur du monde
  worldHeight: 1000,  // Hauteur du monde
  cellSize: 100,      // Taille d'une cellule
});

// Résultat : grille de 10x10 cellules
```

### Choisir la taille des cellules

```
cellSize petit (ex: 32)
  ✅ Requêtes plus précises
  ❌ Plus de cellules à parcourir
  → Bon pour : densité faible, petits rayons de recherche

cellSize grand (ex: 200)
  ✅ Moins de cellules
  ❌ Plus d'entités par cellule à filtrer
  → Bon pour : densité élevée, grands rayons

Règle générale : cellSize ≈ rayon de recherche typique
```

---

## Opérations de Base

### Insérer une entité

```typescript
const entity = world.spawn(Position);
world.set(entity, Position, { x: 150, y: 250 });

// Ajouter à la grille
grid.insert(entity, 150, 250);
```

### Mettre à jour une position

```typescript
// L'entité a bougé
world.set(entity, Position, { x: 300, y: 400 });

// Mettre à jour la grille (optimisé si même cellule)
grid.update(entity, 300, 400);
```

### Retirer une entité

```typescript
grid.remove(entity);
```

### Vérifier si une entité est dans la grille

```typescript
if (grid.has(entity)) {
  const pos = grid.getPosition(entity);
  console.log(`Position: (${pos.x}, ${pos.y})`);
}
```

---

## Types de Requêtes

### Requête rectangulaire

Trouve toutes les entités dans une zone rectangulaire.

```typescript
// queryRect(x, y, width, height)
const entities = grid.queryRect(100, 100, 200, 200);
// Toutes les entités entre (100,100) et (300,300)
```

```
┌─────────────────────────────┐
│                             │
│    (100,100)                │
│       ┌───────────┐         │
│       │  ●     ●  │         │
│       │     ●     │         │
│       │        ●  │         │
│       └───────────┘         │
│              (300,300)      │
│                             │
└─────────────────────────────┘
```

### Requête circulaire

Trouve toutes les entités dans un rayon.

```typescript
// queryRadius(centerX, centerY, radius)
const nearby = grid.queryRadius(250, 250, 100);
// Toutes les entités à moins de 100 unités du point (250, 250)
```

```
┌─────────────────────────────┐
│                             │
│                             │
│         ╭─────────╮         │
│        ╱ ●     ●  ╲        │
│       │     ●      │        │
│       │   (250,250)│        │
│        ╲    ●     ╱         │
│         ╰─────────╯         │
│            r=100            │
│                             │
└─────────────────────────────┘
```

### Requête des N plus proches

Trouve les N entités les plus proches d'un point.

```typescript
// queryNearest(x, y, count, maxRadius?)
const closest = grid.queryNearest(250, 250, 5);
// Les 5 entités les plus proches de (250, 250)

// Avec rayon maximum
const closestInRange = grid.queryNearest(250, 250, 5, 200);
// Les 5 plus proches, mais pas au-delà de 200 unités
```

---

## SpatialIndex : Intégration avec l'ECS

`SpatialIndex` est une version qui s'intègre mieux avec le World.

```typescript
import { SpatialIndex } from "./ecs";

// Créer l'index spatial
const spatial = new SpatialIndex({
  worldWidth: 1000,
  worldHeight: 1000,
  cellSize: 100,
});

// Indiquer quel composant représente la position
spatial.trackComponent(Position);

// Synchroniser une entité
const entity = world.spawn(Position);
world.set(entity, Position, { x: 100, y: 200 });
spatial.syncEntity(world, entity, Position);

// Les requêtes fonctionnent pareil
const nearby = spatial.queryRadius(100, 200, 50);
```

### Utilisation comme Resource

```typescript
// Au setup
world.setResource(SpatialIndex, new SpatialIndex({
  worldWidth: 1000,
  worldHeight: 1000,
  cellSize: 64,
}));

// Dans un système
function movementSystem(world: World) {
  const spatial = world.getResource(SpatialIndex)!;

  world.query(Position, Velocity).run(view => {
    const x = view.column(Position, "x");
    const y = view.column(Position, "y");
    const vx = view.column(Velocity, "vx");
    const vy = view.column(Velocity, "vy");

    for (let i = 0; i < view.count; i++) {
      // Bouger
      x[i] += vx[i];
      y[i] += vy[i];

      // Mettre à jour le spatial index
      const entity = view.entity(i);
      spatial.grid.update(entity, x[i], y[i]);
    }
  });
}
```

---

## Patterns d'utilisation

### Système de collision basique

```typescript
@component class Collider {
  radius = f32(16);
}

function collisionSystem(world: World, spatial: SpatialGrid) {
  world.query(Position, Collider).run(view => {
    const x = view.column(Position, "x");
    const y = view.column(Position, "y");
    const radius = view.column(Collider, "radius");

    for (let i = 0; i < view.count; i++) {
      const entity = view.entity(i);
      const r = radius[i];

      // Trouver les entités proches
      const nearby = spatial.queryRadius(x[i], y[i], r * 2);

      for (const other of nearby) {
        if (other === entity) continue;

        const otherPos = world.get(other, Position);
        const otherCollider = world.get(other, Collider);
        if (!otherPos || !otherCollider) continue;

        // Vérifier collision précise
        const dx = otherPos.x - x[i];
        const dy = otherPos.y - y[i];
        const dist = Math.sqrt(dx * dx + dy * dy);
        const minDist = r + otherCollider.radius;

        if (dist < minDist) {
          // Collision détectée !
          handleCollision(entity, other);
        }
      }
    }
  });
}
```

### Système d'agro (détection d'ennemis)

```typescript
@component class AggroRange {
  range = f32(100);
}

function aggroSystem(world: World, spatial: SpatialGrid) {
  // Pour chaque ennemi avec une range d'agro
  world.query(Enemy, Position, AggroRange).run(view => {
    const x = view.column(Position, "x");
    const y = view.column(Position, "y");
    const range = view.column(AggroRange, "range");

    for (let i = 0; i < view.count; i++) {
      const enemy = view.entity(i);

      // Chercher les joueurs dans la range
      const nearbyEntities = spatial.queryRadius(x[i], y[i], range[i]);

      for (const nearby of nearbyEntities) {
        if (world.has(nearby, Player)) {
          // Joueur détecté ! Activer l'agro
          world.add(enemy, Aggroed);
          world.setEntityRef(enemy, Targeting, "target", nearby);
          break;
        }
      }
    }
  });
}
```

### Trouver l'ennemi le plus proche du joueur

```typescript
function findNearestEnemy(world: World, spatial: SpatialGrid): Entity | null {
  const player = world.query(Player, Position).first();
  if (!player) return null;

  const playerPos = world.get(player, Position)!;

  // Chercher les 10 plus proches
  const candidates = spatial.queryNearest(playerPos.x, playerPos.y, 10, 500);

  // Filtrer pour garder uniquement les ennemis
  for (const candidate of candidates) {
    if (world.has(candidate, Enemy)) {
      return candidate;
    }
  }

  return null;
}
```

### Système de vision (line of sight simplifié)

```typescript
@component class Vision {
  range = f32(200);
  fov = f32(90);  // Degrés
}

function visionSystem(world: World, spatial: SpatialGrid) {
  world.query(Position, Vision, Facing).run(view => {
    const x = view.column(Position, "x");
    const y = view.column(Position, "y");
    const range = view.column(Vision, "range");
    const facing = view.column(Facing, "angle");

    for (let i = 0; i < view.count; i++) {
      const entity = view.entity(i);

      // Entités dans la range
      const inRange = spatial.queryRadius(x[i], y[i], range[i]);

      const visible: Entity[] = [];
      for (const other of inRange) {
        if (other === entity) continue;

        const otherPos = world.get(other, Position);
        if (!otherPos) continue;

        // Calculer l'angle vers l'autre entité
        const dx = otherPos.x - x[i];
        const dy = otherPos.y - y[i];
        const angleToOther = Math.atan2(dy, dx);

        // Vérifier si dans le FOV
        const angleDiff = Math.abs(angleToOther - facing[i]);
        const fovRad = (view.column(Vision, "fov")[i] / 2) * (Math.PI / 180);

        if (angleDiff <= fovRad) {
          visible.push(other);
        }
      }

      // `visible` contient les entités que `entity` peut voir
    }
  });
}
```

---

## Statistiques et Debug

```typescript
const stats = grid.getStats();
console.log(stats);
// {
//   totalEntities: 1000,        // Nombre total d'entités
//   occupiedCells: 150,         // Cellules non-vides
//   avgEntitiesPerCell: 6.67,   // Moyenne par cellule occupée
//   maxEntitiesInCell: 42       // Cellule la plus dense
// }
```

### Visualisation (pour debug)

```typescript
function debugDrawGrid(grid: SpatialGrid, ctx: CanvasRenderingContext2D) {
  // Dessiner les cellules
  ctx.strokeStyle = "#333";
  for (let y = 0; y < grid.gridHeight; y++) {
    for (let x = 0; x < grid.gridWidth; x++) {
      ctx.strokeRect(
        x * grid.cellSize,
        y * grid.cellSize,
        grid.cellSize,
        grid.cellSize
      );

      // Afficher le nombre d'entités dans la cellule
      const cell = grid.getCell(x, y);
      if (cell && cell.size > 0) {
        ctx.fillText(`${cell.size}`, x * grid.cellSize + 5, y * grid.cellSize + 15);
      }
    }
  }
}
```

---

## Performance

### Complexité des opérations

| Opération | Complexité | Notes |
|-----------|------------|-------|
| `insert()` | O(1) | Amorti |
| `update()` | O(1) | Même cellule = très rapide |
| `remove()` | O(1) | |
| `queryRect()` | O(c + k) | c = cellules, k = entités |
| `queryRadius()` | O(c + k) | c = cellules, k = entités |
| `queryNearest()` | O(c + k log k) | Tri des résultats |

### Benchmarks typiques (10 000 entités)

```
Insert 10k entities: ~3-15ms
1000 radius queries: ~5ms
Update 10k positions: ~3ms
100 dense queries: ~2ms
```

### Conseils d'optimisation

```typescript
// ✅ Mettre à jour APRÈS le mouvement
for (let i = 0; i < view.count; i++) {
  x[i] += vx[i];
  y[i] += vy[i];
  grid.update(view.entity(i), x[i], y[i]);  // Une seule mise à jour
}

// ❌ Éviter de recréer la grille chaque frame
// const grid = new SpatialGrid(...);  // NON !

// ✅ Réutiliser la même grille
grid.clear();  // Si besoin de reset
```

---

## Résumé

```
┌────────────────────────────────────────────────────────────────┐
│                      SPATIAL INDEX                              │
│                                                                │
│  Configuration         Opérations           Requêtes           │
│  ─────────────         ──────────           ────────           │
│  worldWidth            insert()             queryRect()        │
│  worldHeight           update()             queryRadius()      │
│  cellSize              remove()             queryNearest()     │
│                                                                │
│                                                                │
│  ┌─────┬─────┬─────┐                                          │
│  │  ●  │     │  ●  │  Grille spatiale                         │
│  ├─────┼─────┼─────┤                                          │
│  │     │ ●●● │     │  Cellules = recherche O(1)               │
│  ├─────┼─────┼─────┤                                          │
│  │  ●  │     │     │  Query = seulement cellules concernées   │
│  └─────┴─────┴─────┘                                          │
│                                                                │
│  Use cases :                                                   │
│  • Collision detection                                         │
│  • Aggro / vision systems                                      │
│  • Find nearest enemy                                          │
│  • Area of effect spells                                       │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

**Suivant :** [08 - Prefabs & Templates](./08-prefabs.md)
