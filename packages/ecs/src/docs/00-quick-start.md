# Démarrage Rapide - ECS

Bienvenue dans le système ECS de Rogue III. Ce guide vous permettra de créer votre première entité et votre premier système en 5 minutes.

## Vue d'Ensemble (En 5 Points)

1. **Entity** : Un simple identifiant unique (juste un nombre)
2. **Component** : Un conteneur de données (décorateur `@component`)
3. **System** : Une fonction qui traite les entités matching une requête
4. **Query** : Recherche les entités avec certains composants
5. **World** : Le conteneur central pour tout (entités, composants, systèmes)

## Installation Rapide

```typescript
import { World, component, f32, u32 } from "./ecs";
import { defineSystem, Phase } from "./ecs";
```

## Premier Exemple Complet

### 1. Définir des Composants

```typescript
@component
class Position {
  x = f32(0);
  y = f32(0);
}

@component
class Velocity {
  vx = f32(0);
  vy = f32(0);
}

@component
class Health {
  current = u32(100);
  max = u32(100);
}
```

### 2. Créer le Monde

```typescript
const world = new World();
```

### 3. Spawner une Entité

```typescript
// Créer une entité avec les composants Position et Velocity
const player = world.spawn(Position, Velocity);

// Initialiser les données
world.set(player, Position, { x: 100, y: 200 });
world.set(player, Velocity, { vx: 5, vy: 0 });
```

### 4. Requêter et Traiter

```typescript
// Trouver toutes les entités avec Position ET Velocity
world.query(Position, Velocity).run((view) => {
  const x = view.column(Position, "x");
  const y = view.column(Position, "y");
  const vx = view.column(Velocity, "vx");
  const vy = view.column(Velocity, "vy");

  for (let i = 0; i < view.count; i++) {
    x[i] += vx[i];
    y[i] += vy[i];
  }
});
```

### 5. Ajouter un Système

```typescript
const movementSystem = defineSystem("Movement")
  .inPhase(Phase.Update)
  .execute((world) => {
    world.query(Position, Velocity).run((view) => {
      const x = view.column(Position, "x");
      const y = view.column(Position, "y");
      const vx = view.column(Velocity, "vx");
      const vy = view.column(Velocity, "vy");

      for (let i = 0; i < view.count; i++) {
        x[i] += vx[i];
        y[i] += vy[i];
      }
    });
  });

// Enregistrer et exécuter
world.addSystem(movementSystem);
world.runTick(); // Exécute tous les systèmes
```

## Concepts Clés

### Entity

Une **entité** est juste un identifiant unique. Vous ne pouvez rien faire avec un ID seul - vous devez ajouter des composants.

```typescript
const entity = world.spawn();  // Entité vide
world.add(entity, Position);   // Ajouter un composant
```

### Component

Un **composant** est un conteneur de données. Utilisez le décorateur `@component` et les field helpers (`f32`, `u32`, etc.).

```typescript
@component
class Item {
  name = str("sword");      // String poolé
  damage = u32(10);          // Entier non signé
  value = f32(99.5);         // Float 32-bit
}
```

### Query

Une **query** trouve toutes les entités ayant certains composants.

```typescript
// ET logique (implicite)
world.query(Position, Velocity).run(...);

// OU logique
world.queryAny(Position, Mesh).run(...);

// Avec filtrage
world.query(Health).where(Health, h => h.current > 0).run(...);

// Uniquement les nouvelles/modifiées
world.query(Position).changed().run(...);
```

### World

Le **World** est le conteneur central.

```typescript
const world = new World();

// Opérations d'entités
world.spawn(...components);
world.despawn(entity);
world.add(entity, Component);
world.remove(entity, Component);

// Ressources globales
world.setResource(GameState, "playing");
const state = world.getResource(GameState);

// Systèmes
world.addSystem(system);
world.runTick();
```

## Workflow Typique

### 1. Initialisation du Jeu

```typescript
// Créer le monde et les ressources
const world = new World();
world.setResource(GameState, "loading");

// Créer entités
const player = world.spawn(Position, Health, Inventory);
world.set(player, Position, { x: 50, y: 50 });
world.set(player, Health, { current: 100, max: 100 });
```

### 2. Définir les Systèmes

```typescript
const updateSystem = defineSystem("GameUpdate")
  .inPhase(Phase.Update)
  .execute((world) => {
    // Traiter toutes les entités mobiles
    world.query(Position, Velocity).run((view) => { ... });

    // Traiter les combats
    world.query(Health, Damage).run((view) => { ... });
  });

world.addSystem(updateSystem);
```

### 3. Boucle Principale

```typescript
// En continuant chaque frame
function gameLoop() {
  world.runTick();  // Exécute tous les systèmes
  requestAnimationFrame(gameLoop);
}
```

### 4. Modifier l'État

```typescript
// Changer un composant
world.set(player, Position, { x: 60, y: 60 });

// Ajouter un composant dynamiquement
world.add(player, Flying);

// Retirer un composant
world.remove(player, Flying);

// Supprimer une entité
world.despawn(player);
```

## Patterns Courants

### Requête Simple

```typescript
for (const entity of world.query(Position, Velocity).iter()) {
  const pos = world.get(entity, Position);
  console.log(pos.x, pos.y);
}
```

### Requête avec Filtre

```typescript
world.query(Health)
  .where(Health, h => h.current > 0)
  .run((view) => {
    // Uniquement les entités vivantes
  });
```

### Requête avec OU

```typescript
// Entités avec Sprite OU Mesh
world.queryAny(Sprite, Mesh).run((view) => {
  // Traiter tous les objets visibles
});
```

### Changer de Composant

```typescript
const damage = 10;
const health = world.get(player, Health);
if (health) {
  world.set(player, Health, {
    current: Math.max(0, health.current - damage),
  });
}
```

## Où Aller Ensuite

- [01 - Concepts Fondamentaux](./01-concepts-fondamentaux.md) - Détails sur Entity, Component, World
- [03 - Queries](./03-queries.md) - Requêtes avancées et filtrage
- [09 - Systems](./09-systems.md) - Scheduler et run conditions
- [06 - Relations](./06-relations.md) - Hiérarchies parent-enfant
- [10 - Events](./10-events.md) - Communication entre systèmes

## Tips et Pièges

✅ **DO:**
- Utiliser `.run()` avec `view.column()` pour les performances critiques
- Requêter avec les composants dont vous avez besoin
- Utiliser des types fort (`@component`) pour la sécurité
- Grouper les opérations batch

❌ **DON'T:**
- Ne pas appeler `world.get()` dans une boucle hot (utiliser `.run()` à la place)
- Ne pas modifier la structure (spawn/despawn) pendant une query
- Ne pas oublier de typer vos composants avec `@component`

## Aide Rapide

| Besoin | Code |
|--------|------|
| Créer entité | `world.spawn(Position, Velocity)` |
| Ajouter composant | `world.add(entity, Component)` |
| Lire données | `world.get(entity, Component)` |
| Écrire données | `world.set(entity, Component, {...})` |
| Chercher entités | `world.query(C1, C2).run(...)` |
| Ou logique | `world.queryAny(C1, C2)` |
| Filtrer | `.where(Component, predicate)` |
| Changements | `.changed().run(...)` |
| Systèmes | `defineSystem("Name").inPhase(...).execute(...)` |
| Ressources | `world.setResource(Type, value)` |
