# ECS v2 - Documentation Complète

> **Entity Component System** haute performance pour Rogue III

## Table des Matières

| # | Document | Description |
|---|----------|-------------|
| 01 | [Concepts Fondamentaux](./01-concepts-fondamentaux.md) | Entity, Component, World, Archetype |
| 02 | [Types de Champs](./02-types-de-champs.md) | f32, u32, str, entityRef, bool... |
| 03 | [Queries](./03-queries.md) | Rechercher et filtrer les entités |
| 04 | [String Fields](./04-string-fields.md) | Gestion des chaînes de caractères |
| 05 | [Entity References](./05-entity-references.md) | Références entre entités |
| 06 | [Relations](./06-relations.md) | Parent/Child, ChildOf, Contains |
| 07 | [Spatial Index](./07-spatial-index.md) | Requêtes spatiales efficaces |
| 08 | [Prefabs & Templates](./08-prefabs.md) | Modèles d'entités réutilisables |
| 09 | [Systems & Scheduler](./09-systems.md) | Logique de jeu et ordonnancement |
| 10 | [Events](./10-events.md) | Communication par événements |
| 11 | [Hooks](./11-hooks.md) | Callbacks sur les composants |
| 12 | [Sérialisation](./12-serialisation.md) | Sauvegarde et chargement |
| 13 | [Migrations](./13-migrations.md) | Évolution du schéma |

---

## Vue d'Ensemble de l'Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                           WORLD                                  │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │  Archetype  │  │  Archetype  │  │  Archetype  │   ...        │
│  │ [Pos, Vel]  │  │ [Pos, HP]   │  │ [Pos,Vel,HP]│              │
│  │             │  │             │  │             │              │
│  │ Entity 1    │  │ Entity 4    │  │ Entity 7    │              │
│  │ Entity 2    │  │ Entity 5    │  │ Entity 8    │              │
│  │ Entity 3    │  │ Entity 6    │  │             │              │
│  └─────────────┘  └─────────────┘  └─────────────┘              │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    Services                               │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │   │
│  │  │StringPool│ │EntityRefs│ │Relations │ │ Events   │    │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘    │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐    │   │
│  │  │Resources │ │Scheduler │ │  Hooks   │ │QueryCache│    │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └──────────┘    │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## Pourquoi un ECS ?

### Problème avec l'OOP traditionnelle

```typescript
// ❌ Approche OOP classique - hiérarchie rigide
class GameObject { }
class Character extends GameObject { }
class Player extends Character { }
class Enemy extends Character { }
class FlyingEnemy extends Enemy { }  // Et si on veut un joueur volant ?
```

### Solution ECS - Composition

```typescript
// ✅ Approche ECS - composition flexible
@component class Position { x = f32(0); y = f32(0); }
@component class Flying { altitude = f32(0); }
@component class Health { current = u32(100); }

// Joueur volant ? Facile !
const flyingPlayer = world.spawn(Position, Flying, Health, Player);
```

## Performance

Notre ECS utilise le pattern **Structure of Arrays (SoA)** pour une performance maximale :

```
Approche traditionnelle (AoS - Array of Structures):
┌─────────────────────────────────────────┐
│ Entity1: { x: 1, y: 2, vx: 3, vy: 4 }   │  Cache miss à chaque entité
│ Entity2: { x: 5, y: 6, vx: 7, vy: 8 }   │
│ Entity3: { x: 9, y: 10, vx: 11, vy: 12 }│
└─────────────────────────────────────────┘

Notre approche (SoA - Structure of Arrays):
┌─────────────────────────────────────────┐
│ x:  [1, 5, 9]      ← Données contiguës  │  Cache-friendly !
│ y:  [2, 6, 10]     ← TypedArrays        │  3-4x plus rapide
│ vx: [3, 7, 11]                          │
│ vy: [4, 8, 12]                          │
└─────────────────────────────────────────┘
```

### Benchmarks

| Opération | Performance |
|-----------|-------------|
| Spawn 100k entités | ~115ms |
| Despawn 50k entités | ~24ms |
| Query 100k × 100 | ~10ms |
| 10k entités × 100 ticks | ~5ms |

## Quick Start

```typescript
import {
  World,
  component,
  f32,
  u32,
} from "./ecs-v2";

// 1. Définir des composants
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

// 2. Créer le monde
const world = new World();

// 3. Spawner des entités
const player = world.spawn(Position, Velocity);
world.set(player, Position, { x: 100, y: 200 });
world.set(player, Velocity, { vx: 5, vy: 0 });

// 4. Query et mise à jour
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
```

## Fichiers du Projet

```
ecs-v2/
├── index.ts              # Exports publics
├── types.ts              # Types et constantes
├── component.ts          # Décorateur @component
├── field.ts              # Définitions de champs (f32, u32, str...)
├── archetype.ts          # Stockage SoA des entités
├── world.ts              # Monde ECS principal + QueryBuilder
├── string-pool.ts        # Interning des strings
├── entity-ref-store.ts   # Tracking des références
├── relation.ts           # Définition des relations
├── relation-store.ts     # Stockage des relations
├── spatial-grid.ts       # Index spatial
├── prefab.ts             # Templates d'entités
├── system.ts             # Définition des systèmes
├── scheduler.ts          # Ordonnancement des systèmes
├── events.ts             # File d'événements
├── hooks.ts              # Callbacks composants
├── serialization.ts      # Sauvegarde/chargement
├── migration.ts          # Évolution du schéma
├── query-cache.ts        # Cache des queries
├── command-buffer.ts     # Commandes différées
├── resource.ts           # Ressources globales
└── inspector.ts          # Debug et inspection
```

---

**Prochaine étape :** [01 - Concepts Fondamentaux](./01-concepts-fondamentaux.md)
