# 03 - Queries

> Rechercher et filtrer les entités

## Concept de base

Une **Query** permet de trouver toutes les entités qui possèdent certains composants.

```typescript
// Trouver toutes les entités avec Position ET Velocity
world.query(Position, Velocity).run(view => {
  // `view` contient toutes les entités correspondantes
});
```

---

## Anatomie d'une Query

```
world.query(Position, Velocity)   ← Composants requis
     .not(Dead)                   ← Composants exclus (optionnel)
     .where(Health, h => h > 0)   ← Filtres de données (optionnel)
     .changed()                   ← Filtre de changement (optionnel)
     .run(view => { ... })        ← Exécution
```

---

## Méthodes d'exécution

### `.run(callback)` - Itération par archetype

La méthode la plus performante pour traiter beaucoup d'entités.

```typescript
world.query(Position, Velocity).run(view => {
  // Accéder aux colonnes de données (TypedArrays)
  const x = view.column(Position, "x");
  const y = view.column(Position, "y");
  const vx = view.column(Velocity, "vx");
  const vy = view.column(Velocity, "vy");

  // Itérer sur toutes les entités
  for (let i = 0; i < view.count; i++) {
    x[i] += vx[i];  // Mise à jour directe du tableau
    y[i] += vy[i];
  }
});
```

```
Performance de .run() :

┌────────────────────────────────────────┐
│ Archetype [Position, Velocity]         │
│                                        │
│  x:  [10, 20, 30, 40, 50, ...]        │ ← Accès séquentiel
│  y:  [15, 25, 35, 45, 55, ...]        │ ← Cache-friendly
│  vx: [1,  2,  3,  4,  5,  ...]        │ ← Très rapide !
│  vy: [0,  0,  0,  0,  0,  ...]        │
└────────────────────────────────────────┘
```

### `.iter()` - Générateur d'entités

Retourne les entités une par une (plus lent mais plus flexible).

```typescript
for (const entity of world.query(Position, Velocity).iter()) {
  const pos = world.get(entity, Position);
  const vel = world.get(entity, Velocity);

  world.set(entity, Position, {
    x: pos.x + vel.vx,
    y: pos.y + vel.vy,
  });
}
```

### `.collect()` - Tableau d'entités

Retourne un tableau de toutes les entités correspondantes.

```typescript
const enemies = world.query(Enemy, Position).collect();
console.log(`${enemies.length} ennemis trouvés`);

for (const enemy of enemies) {
  // Traiter chaque ennemi
}
```

### `.count()` - Nombre d'entités

```typescript
const enemyCount = world.query(Enemy).count();
console.log(`${enemyCount} ennemis dans le monde`);
```

### `.first()` - Première entité

```typescript
const player = world.query(Player, Position).first();
if (player) {
  const pos = world.get(player, Position);
  console.log(`Joueur en (${pos.x}, ${pos.y})`);
}
```

---

## Filtres de Composants

### `.not()` - Exclure des composants

```typescript
// Entités vivantes (ont Health, n'ont pas Dead)
world.query(Health).not(Dead).run(view => {
  // ...
});

// Ennemis qui ne sont pas des boss
world.query(Enemy).not(Boss).run(view => {
  // ...
});

// Plusieurs exclusions
world.query(Position).not(Dead, Invisible, Intangible).run(view => {
  // ...
});
```

### Logique des filtres

```
query(A, B)        →  Entités avec A ET B
query(A, B).not(C) →  Entités avec A ET B, SANS C

┌───────────────────────────────────────────────────┐
│                    Toutes les entités             │
│  ┌─────────────────────────────────────────────┐  │
│  │              Ont A                          │  │
│  │  ┌───────────────────────────────────────┐  │  │
│  │  │            Ont A et B                 │  │  │
│  │  │  ┌─────────────────────────────────┐  │  │  │
│  │  │  │    Ont A et B, sans C          │  │  │  │
│  │  │  │         ← RÉSULTAT             │  │  │  │
│  │  │  └─────────────────────────────────┘  │  │  │
│  │  └───────────────────────────────────────┘  │  │
│  └─────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────┘
```

---

## Filtres de Données (`.where()`)

Filtre les entités selon leurs **valeurs**.

```typescript
// Entités avec santé > 50
world.query(Health)
  .where(Health, h => h.current > 50)
  .run(view => { ... });

// Entités dans une zone
world.query(Position)
  .where(Position, p => p.x > 0 && p.x < 100 && p.y > 0 && p.y < 100)
  .run(view => { ... });

// Filtres multiples
world.query(Position, Health)
  .where(Position, p => p.x > 0)
  .where(Health, h => h.current > 0)
  .run(view => { ... });
```

### Comment `.where()` fonctionne

```
SANS .where() :
  Query → Trouve archetypes → Retourne TOUTES les entités

AVEC .where() :
  Query → Trouve archetypes → Teste chaque entité → Retourne si predicate = true

┌─────────────────────────────────────────┐
│ Archetype [Position, Health]            │
│                                         │
│  Entity │ Position.x │ Health.current  │
│  ───────┼────────────┼─────────────────│
│  E1     │ 100        │ 80         ✓   │  where(h => h.current > 50)
│  E2     │ 50         │ 30         ✗   │
│  E3     │ 200        │ 100        ✓   │
│  E4     │ 75         │ 10         ✗   │
│                                         │
│  Résultat : [E1, E3]                   │
└─────────────────────────────────────────┘
```

### Avec `.iter()` et `.collect()`

```typescript
// Itérer sur les entités filtrées
for (const entity of world.query(Position).where(Position, p => p.x > 0).iter()) {
  console.log(entity);
}

// Collecter les entités filtrées
const lowHealth = world.query(Health)
  .where(Health, h => h.current < h.max * 0.25)
  .collect();
```

---

## Détection de Changements

### `.changed()` - Entités modifiées

Trouve les entités dont **n'importe quel composant** a changé.

```typescript
// Entités dont Position OU Velocity a changé
world.query(Position, Velocity).changed().run(view => {
  // Recalculer quelque chose...
});
```

### `.changedComponent()` - Composant spécifique modifié

Plus précis : filtre sur un composant **spécifique**.

```typescript
// Seulement si Position a changé (ignore les changements de Velocity)
world.query(Position, Velocity)
  .changedComponent(Position)
  .run(view => {
    // Mise à jour du spatial index...
  });
```

### `.added()` - Nouvelles entités

```typescript
// Entités qui viennent d'avoir Position ajouté
world.query(Position).added().run(view => {
  // Initialisation...
});
```

### `.modified()` - Entités modifiées (pas nouvelles)

```typescript
// Position modifiée (mais pas les nouvelles entités)
world.query(Position).modified().run(view => {
  // ...
});
```

### Cycle de vie des changements

```
spawn(Position)     → added()
set(e, Position)    → modified() (ou added() si nouveau)
runTick()           → Efface tous les flags de changement !

IMPORTANT : Les flags sont réinitialisés à chaque runTick() !

┌─────────────┐
│   spawn()   │──► added = true
└─────────────┘
       │
       ▼
┌─────────────┐
│   set()     │──► modified = true
└─────────────┘
       │
       ▼
┌─────────────┐
│  runTick()  │──► Tous les flags = false
└─────────────┘
```

---

## ArchetypeView en détail

Quand tu utilises `.run(view => ...)`, le `view` est un `ArchetypeView`.

### Propriétés et méthodes

```typescript
world.query(Position, Velocity).run(view => {
  // Nombre d'entités dans cette vue
  console.log(view.count);

  // Accéder à une colonne de données
  const x = view.column(Position, "x");  // Float32Array

  // Obtenir l'entité à un index
  const entity = view.entity(0);

  // Obtenir tous les indices d'entités
  const entityIndices = view.entities();  // Uint32Array

  // Itérer sur les entités (avec filtres .where())
  for (const entity of view.iter()) {
    console.log(entity);
  }

  // Itérer sur les indices de lignes (avec filtres .where())
  for (const row of view.iterRows()) {
    console.log(x[row], y[row]);
  }
});
```

### Pattern d'itération optimal

```typescript
// ✅ OPTIMAL - Accès direct aux TypedArrays
world.query(Position, Velocity).run(view => {
  const x = view.column(Position, "x");
  const y = view.column(Position, "y");
  const vx = view.column(Velocity, "vx");
  const vy = view.column(Velocity, "vy");

  for (let i = 0; i < view.count; i++) {
    x[i] += vx[i];
    y[i] += vy[i];
  }
});

// ⚠️ CORRECT mais plus lent - world.get() à chaque itération
world.query(Position, Velocity).run(view => {
  for (let i = 0; i < view.count; i++) {
    const entity = view.entity(i);
    const pos = world.get(entity, Position);  // Lookup
    const vel = world.get(entity, Velocity);  // Lookup
    world.set(entity, Position, { x: pos.x + vel.vx, y: pos.y + vel.vy });
  }
});
```

---

## Exemples pratiques

### Système de mouvement

```typescript
function movementSystem(world: World) {
  world.query(Position, Velocity).not(Frozen).run(view => {
    const x = view.column(Position, "x");
    const y = view.column(Position, "y");
    const vx = view.column(Velocity, "vx");
    const vy = view.column(Velocity, "vy");

    for (let i = 0; i < view.count; i++) {
      x[i] += vx[i];
      y[i] += vy[i];
    }
  });
}
```

### Système de dégâts de poison

```typescript
function poisonSystem(world: World) {
  world.query(Health, Poisoned).run(view => {
    const current = view.column(Health, "current");

    for (let i = 0; i < view.count; i++) {
      current[i] = Math.max(0, current[i] - 5);  // -5 HP par tick
    }
  });
}
```

### Trouver l'ennemi le plus proche

```typescript
function findNearestEnemy(world: World, playerPos: {x: number, y: number}) {
  let nearest: Entity | null = null;
  let nearestDist = Infinity;

  world.query(Enemy, Position).run(view => {
    const x = view.column(Position, "x");
    const y = view.column(Position, "y");

    for (let i = 0; i < view.count; i++) {
      const dx = x[i] - playerPos.x;
      const dy = y[i] - playerPos.y;
      const dist = dx * dx + dy * dy;

      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = view.entity(i);
      }
    }
  });

  return nearest;
}
```

### Soigner les alliés blessés

```typescript
function healAllies(world: World, healAmount: number) {
  world.query(Health, Ally)
    .where(Health, h => h.current < h.max)  // Seulement les blessés
    .run(view => {
      const current = view.column(Health, "current");
      const max = view.column(Health, "max");

      for (const row of view.iterRows()) {
        current[row] = Math.min(current[row] + healAmount, max[row]);
      }
    });
}
```

---

## Performance

### Comparaison des méthodes

| Méthode | Vitesse | Cas d'usage |
|---------|---------|-------------|
| `.run()` avec colonnes | ★★★★★ | Traitement massif |
| `.iter()` | ★★★☆☆ | Logique complexe par entité |
| `.collect()` | ★★☆☆☆ | Besoin d'un tableau |
| `.first()` | ★★★★★ | Trouver une entité unique |
| `.count()` | ★★★★★ | Statistiques |

### Conseils

```typescript
// ✅ Faire
world.query(A, B).run(view => {
  const col = view.column(A, "x");
  for (let i = 0; i < view.count; i++) {
    col[i] += 1;
  }
});

// ❌ Éviter dans les hot paths
for (const e of world.query(A, B).iter()) {
  world.set(e, A, { x: world.get(e, A).x + 1 });
}
```

---

## Résumé

```
┌────────────────────────────────────────────────────────────┐
│                       QUERY PIPELINE                        │
│                                                            │
│  world.query(A, B)                                         │
│       │                                                    │
│       ▼                                                    │
│  ┌─────────────┐                                          │
│  │ Filtre      │  .not(C, D)                              │
│  │ Composants  │                                          │
│  └──────┬──────┘                                          │
│         │                                                  │
│         ▼                                                  │
│  ┌─────────────┐                                          │
│  │ Filtre      │  .where(A, a => a.x > 0)                 │
│  │ Données     │                                          │
│  └──────┬──────┘                                          │
│         │                                                  │
│         ▼                                                  │
│  ┌─────────────┐                                          │
│  │ Filtre      │  .changed() / .added() / .modified()     │
│  │ Changement  │  .changedComponent(A)                    │
│  └──────┬──────┘                                          │
│         │                                                  │
│         ▼                                                  │
│  ┌─────────────┐                                          │
│  │ Exécution   │  .run() / .iter() / .collect()           │
│  │             │  .count() / .first()                     │
│  └─────────────┘                                          │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

---

**Suivant :** [04 - String Fields](./04-string-fields.md)
