# ECS - Documentation Complète

> **Entity Component System** haute performance pour Rogue III

---

## Commencer Ici

| Document | Description |
|----------|-------------|
| **[Quick Start](./00-quick-start.md)** | Premiers pas en 5 minutes |
| **[Architecture](./01-architecture.md)** | Comment l'ECS fonctionne |
| **[Cheat Sheet](./99-cheat-sheet.md)** | Référence rapide (toutes les APIs) |
| **[Documentation Audit](./DOCUMENTATION_AUDIT.md)** | Cohérence code ↔ docs |

---

## Table des Matières

### Fondamentaux

| # | Document | Description |
|---|----------|-------------|
| 01 | [Concepts Fondamentaux](./01-concepts-fondamentaux.md) | Entity, Component, World, Archetype |
| 02 | [Types de Champs](./02-types-de-champs.md) | f32, u32, str, entityRef, bool... |
| 03 | [Queries](./03-queries.md) | Rechercher et filtrer les entités |

### Données Avancées

| # | Document | Description |
|---|----------|-------------|
| 04 | [String Fields](./04-string-fields.md) | Gestion des chaînes de caractères |
| 05 | [Entity References](./05-entity-references.md) | Références entre entités |
| 06 | [Relations](./06-relations.md) | Parent/Child, ChildOf, Contains |
| 23 | [EntityRefs vs Relations](./23-entity-refs-vs-relations.md) | Quand utiliser quoi |

### Organisation

| # | Document | Description |
|---|----------|-------------|
| 07 | [Spatial Index](./07-spatial-index.md) | Requêtes spatiales efficaces |
| 08 | [Prefabs & Templates](./08-prefabs.md) | Modèles d'entités réutilisables |
| 17 | [Bundles](./17-bundles.md) | Groupes de composants réutilisables |

### Systèmes & Exécution

| # | Document | Description |
|---|----------|-------------|
| 09 | [Systems](./09-systems.md) | Logique de jeu |
| 12 | [System Sets](./12-system-sets.md) | Groupement de systèmes |
| 15 | [Run Conditions](./15-run-conditions.md) | Conditions d'exécution |
| 16 | [Hierarchy Helpers](./16-hierarchy-helpers.md) | Navigation parent-enfant |

### Événements & Réactivité

| # | Document | Description |
|---|----------|-------------|
| 10 | [Events](./10-events.md) | Communication par événements |
| 11 | [Observers](./11-hooks.md) | Callbacks réactifs (onAdd/onRemove/onSet) |

### Persistance

| # | Document | Description |
|---|----------|-------------|
| 12 | [Sérialisation](./12-serialisation.md) | Sauvegarde et chargement |
| 13 | [Migrations](./13-migrations.md) | Évolution du schéma |

### Améliorations V3

| # | Document | Description |
|---|----------|-------------|
| 21 | [Batched Operations](./21-batched-operations.md) | batch().add().add().commit() |
| 22 | [Changelog V3](./22-changelog-v3.md) | Toutes les améliorations |

---

## Vue d'Ensemble Rapide

```
┌─────────────────────────────────────────────────────────────────────┐
│                            WORLD                                     │
│                                                                      │
│  ┌────────────────────────────────────────────────────────────────┐ │
│  │                      ARCHETYPES (SoA)                          │ │
│  │  [Position,Velocity]  [Position,Health]  [Position,Vel,HP]     │ │
│  │       Entity 1            Entity 4           Entity 7          │ │
│  │       Entity 2            Entity 5           Entity 8          │ │
│  │       Entity 3            Entity 6                             │ │
│  └────────────────────────────────────────────────────────────────┘ │
│                                                                      │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐       │
│  │  Scheduler │ │  Observers │ │  Relations │ │ QueryCache │       │
│  │  (Systems) │ │ (Reactive) │ │ (ChildOf)  │ │  (Fast)    │       │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘       │
│                                                                      │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐       │
│  │ Resources  │ │ StringPool │ │  Events    │ │  Spatial   │       │
│  │ (Globals)  │ │ (Strings)  │ │  (Queue)   │ │  (Grid)    │       │
│  └────────────┘ └────────────┘ └────────────┘ └────────────┘       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Exemple Minimal

```typescript
import { World, component, f32, defineSystem, Phase } from "./ecs";

// 1. Composants
@component class Position { x = f32(0); y = f32(0); }
@component class Velocity { vx = f32(0); vy = f32(0); }

// 2. Monde
const world = new World();

// 3. Entité
const player = world.spawn(Position, Velocity);
world.set(player, Velocity, { vx: 5, vy: 0 });

// 4. Système
world.addSystem(
  defineSystem("Movement")
    .inPhase(Phase.Update)
    .execute(world => {
      world.query(Position, Velocity).run(view => {
        const x = view.column(Position, "x");
        const vx = view.column(Velocity, "vx");
        for (let i = 0; i < view.count; i++) {
          x[i] += vx[i];
        }
      });
    })
);

// 5. Game Loop
world.runTick();
```

---

## APIs les Plus Utilisées

| Besoin | API |
|--------|-----|
| Créer une entité | `world.spawn(Comp1, Comp2)` |
| Modifier composant | `world.set(entity, Comp, { ... })` |
| Lire composant | `world.get(entity, Comp)` |
| Chercher entités | `world.query(Comp1, Comp2).run(...)` |
| Union query (OU) | `world.queryAny(A, B, C).run(...)` |
| Exclure composants | `.not(Dead, Hidden)` |
| Filtrer | `.where(Health, h => h.current > 0)` |
| Relation parent | `world.relate(child, ChildOf, parent)` |
| Observer ajout | `world.observers.onAdd(Comp, callback)` |
| Définir système | `defineSystem("Name").execute(...)` |
| Grouper systèmes | `scheduler.configureSet(MySet).runIf(...)` |

---

## Performances (393 tests)

| Opération | Performance |
|-----------|-------------|
| Spawn 100k entités | ~80ms |
| 10k entités × 100 ticks | ~5ms |
| Query 10k avec filtre | ~2ms |
| ComponentMask vs BigInt | 4-22x plus rapide |

---

**Commence par :** [Quick Start](./00-quick-start.md) ou [Cheat Sheet](./99-cheat-sheet.md)
