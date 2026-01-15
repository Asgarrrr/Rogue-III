# 01 - Concepts Fondamentaux

> Les bases de l'Entity Component System

## Les 4 Piliers de l'ECS

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│   ENTITY          COMPONENT         ARCHETYPE      WORLD    │
│   ──────          ─────────         ─────────      ─────    │
│   Identifiant     Données           Stockage       Conteneur│
│   unique          pures             optimisé       global   │
│                                                             │
│   "Qui?"          "Quoi?"           "Comment?"     "Où?"    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 1. Entity (Entité)

Une **Entity** est simplement un identifiant unique. Elle n'a pas de données ni de comportement propre.

### Structure interne

```
Entity = 32 bits
┌────────────────────┬──────────────┐
│   Index (20 bits)  │ Gen (12 bits)│
└────────────────────┴──────────────┘
     │                    │
     │                    └─── Génération : détecte les entités recyclées
     └─────────────────────── Index : position dans les tableaux
```

### Pourquoi une génération ?

```typescript
// Scénario problématique sans génération :
const enemy = world.spawn(Position);  // Entity = 5
world.despawn(enemy);                  // Entity 5 libérée

const newEnemy = world.spawn(Position); // Entity = 5 (recyclée!)

// Sans génération : impossible de savoir si c'est le même ennemi
// Avec génération : enemy = 5|gen0, newEnemy = 5|gen1 → différents !
```

### Constantes importantes

```typescript
const ENTITY_INDEX_BITS = 20;   // Jusqu'à 1 048 576 entités
const ENTITY_GEN_BITS = 12;     // 4096 recyclages avant wrap
const MAX_ENTITIES = 1 << 20;   // 1 048 576
const NULL_ENTITY = 0xFFFFFFFF; // Entité invalide
```

### Fonctions utilitaires

```typescript
import { makeEntity, entityIndex, entityGeneration, NULL_ENTITY } from "./ecs";

// Créer une entité manuellement (rare)
const entity = makeEntity(index, generation);

// Extraire l'index
const idx = entityIndex(entity);  // 0 à 1048575

// Extraire la génération
const gen = entityGeneration(entity);  // 0 à 4095

// Vérifier si null
if (entity === NULL_ENTITY) { /* invalide */ }
```

---

## 2. Component (Composant)

Un **Component** est un conteneur de données. Il n'a **aucune logique** - uniquement des données.

### Définir un composant

```typescript
import { component, f32, u32, bool } from "./ecs";

@component
class Position {
  x = f32(0);    // Float 32 bits, défaut = 0
  y = f32(0);
}

@component
class Health {
  current = u32(100);  // Unsigned int 32 bits
  max = u32(100);
}

@component
class Poisoned {
  // Pas de champs = "Tag component"
  // Sert juste à marquer l'entité
}
```

### Le décorateur @component

```
@component transforme ta classe en ceci :

┌─────────────────────────────────────────┐
│  class Position                         │
│  ├─ __ecs: ComponentMeta               │
│  │   ├─ id: { index: 0, name: "Pos" }  │
│  │   ├─ fields: [                      │
│  │   │   { name: "x", type: F32, ... } │
│  │   │   { name: "y", type: F32, ... } │
│  │   │ ]                               │
│  │   ├─ stride: 8  (bytes par entité)  │
│  │   └─ isTag: false                   │
│  └─ ...                                │
└─────────────────────────────────────────┘
```

### Règles importantes

```typescript
// ✅ BON - Données uniquement
@component
class Velocity {
  vx = f32(0);
  vy = f32(0);
}

// ❌ MAUVAIS - Pas de méthodes dans les composants !
@component
class BadComponent {
  x = f32(0);
  move() { this.x += 1; }  // NON ! La logique va dans les Systems
}

// ❌ MAUVAIS - Pas de types complexes !
@component
class BadComponent2 {
  items = [];        // NON ! Utilise des relations ou des références
  name = "hello";    // NON ! Utilise str() pour les strings
}
```

---

## 3. Archetype

Un **Archetype** est un conteneur qui stocke toutes les entités ayant la **même combinaison de composants**.

### Concept visuel

```
Entités dans le World :
- Entity 1 : Position, Velocity
- Entity 2 : Position, Velocity
- Entity 3 : Position, Health
- Entity 4 : Position, Velocity
- Entity 5 : Position, Health

Sont stockées ainsi :

┌─────────────────────────────────────┐
│ Archetype [Position, Velocity]      │
│                                     │
│  Position.x  │ 10  │ 20  │ 40  │   │  ← Entity 1, 2, 4
│  Position.y  │ 15  │ 25  │ 45  │   │
│  Velocity.vx │ 1   │ 2   │ 4   │   │
│  Velocity.vy │ 0   │ 0   │ 0   │   │
│  entities    │ E1  │ E2  │ E4  │   │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ Archetype [Position, Health]        │
│                                     │
│  Position.x    │ 30  │ 50  │       │  ← Entity 3, 5
│  Position.y    │ 35  │ 55  │       │
│  Health.current│ 100 │ 80  │       │
│  Health.max    │ 100 │ 100 │       │
│  entities      │ E3  │ E5  │       │
└─────────────────────────────────────┘
```

### Pourquoi c'est rapide ?

```
Itérer sur toutes les entités avec Position + Velocity :

❌ Sans Archetype (approche naïve) :
   Pour chaque entité :
     - Vérifier si elle a Position    ← Cache miss
     - Vérifier si elle a Velocity    ← Cache miss
     - Récupérer Position.x           ← Cache miss
     - Récupérer Velocity.vx          ← Cache miss

✅ Avec Archetype :
   Trouver l'archetype [Position, Velocity]
   Itérer sur le tableau Position.x[]  ← Données contiguës = cache-friendly
   Itérer sur le tableau Velocity.vx[] ← Données contiguës = cache-friendly
```

### Structure of Arrays (SoA)

```typescript
// Ce que tu écris :
@component
class Position {
  x = f32(0);
  y = f32(0);
}

// Comment c'est stocké en mémoire :
archetype.columns = {
  "Position.x": Float32Array([10, 20, 30, 40, ...]),  // Toutes les x
  "Position.y": Float32Array([15, 25, 35, 45, ...]),  // Toutes les y
}

// Pas comme ça (AoS - Array of Structures) :
// [ {x:10, y:15}, {x:20, y:25}, ... ]  ← Plus lent !
```

---

## 4. World (Monde)

Le **World** est le conteneur principal qui gère tout : entités, archetypes, services.

### Créer un World

```typescript
import { World } from "./ecs";

// World par défaut (max 1M entités)
const world = new World();

// World avec limite personnalisée
const smallWorld = new World(10_000);  // Max 10k entités
```

### Opérations de base

```typescript
// ═══════════════════════════════════════
// SPAWN - Créer une entité
// ═══════════════════════════════════════
const entity = world.spawn(Position, Velocity, Health);

// ═══════════════════════════════════════
// SET - Définir les données d'un composant
// ═══════════════════════════════════════
world.set(entity, Position, { x: 100, y: 200 });
world.set(entity, Health, { current: 50 });  // max garde sa valeur par défaut

// ═══════════════════════════════════════
// GET - Lire les données d'un composant
// ═══════════════════════════════════════
const pos = world.get(entity, Position);
console.log(pos.x, pos.y);  // 100, 200

// ═══════════════════════════════════════
// HAS - Vérifier si un composant existe
// ═══════════════════════════════════════
if (world.has(entity, Poisoned)) {
  // L'entité est empoisonnée
}

// ═══════════════════════════════════════
// ADD - Ajouter un composant
// ═══════════════════════════════════════
world.add(entity, Poisoned);  // Tag
world.add(entity, Shield, { armor: 50 });  // Avec données

// ═══════════════════════════════════════
// REMOVE - Retirer un composant
// ═══════════════════════════════════════
world.remove(entity, Poisoned);

// ═══════════════════════════════════════
// DESPAWN - Supprimer une entité
// ═══════════════════════════════════════
world.despawn(entity);

// ═══════════════════════════════════════
// IS_ALIVE - Vérifier si une entité existe
// ═══════════════════════════════════════
if (world.isAlive(entity)) {
  // L'entité existe toujours
}
```

### Cycle de vie d'une entité

```
┌─────────┐     spawn()      ┌─────────┐
│  LIBRE  │ ───────────────► │ VIVANTE │
└─────────┘                  └────┬────┘
     ▲                            │
     │                            │ add() / remove()
     │         despawn()          │ set() / get()
     └────────────────────────────┘
```

### Migration d'Archetype

Quand tu ajoutes ou retires un composant, l'entité **change d'archetype** :

```
world.add(entity, Velocity);

AVANT                              APRÈS
┌──────────────────────┐          ┌──────────────────────┐
│ Archetype [Position] │          │ Archetype [Position] │
│ Entity 1  ←──────────│──┐       │                      │
│ Entity 2             │  │       │ Entity 2             │
└──────────────────────┘  │       └──────────────────────┘
                          │
                          │       ┌──────────────────────────────┐
                          └─────► │ Archetype [Position,Velocity]│
                                  │ Entity 1  (données copiées)  │
                                  └──────────────────────────────┘
```

> ⚠️ **Performance** : Ajouter/retirer des composants est plus lent que modifier des données.
> Évite de le faire à chaque frame !

---

## Diagramme complet

```
                    ┌─────────────────────────────────────────┐
                    │                 WORLD                    │
                    │                                         │
  spawn(Pos,Vel)    │   ┌─────────────────────────────────┐   │
─────────────────────►  │        ArchetypeGraph           │   │
                    │   │                                 │   │
                    │   │  [Pos] ──► [Pos,Vel]           │   │
                    │   │    │          │                │   │
                    │   │    ▼          ▼                │   │
                    │   │ Archetype  Archetype           │   │
                    │   │   │           │                │   │
                    │   │   ▼           ▼                │   │
                    │   │ ┌───┐      ┌───┬───┐          │   │
                    │   │ │E1 │      │E2 │E3 │          │   │
                    │   │ └───┘      └───┴───┘          │   │
                    │   └─────────────────────────────────┘   │
                    │                                         │
  query(Pos,Vel)    │   ┌─────────────────────────────────┐   │
─────────────────────►  │          QueryCache             │   │
                    │   │  Trouve les archetypes qui      │   │
                    │   │  contiennent Pos ET Vel         │   │
                    │   └─────────────────────────────────┘   │
                    │                                         │
                    │   ┌─────────────────────────────────┐   │
                    │   │         EntityRecords           │   │
                    │   │  entity → { archetype, row }    │   │
                    │   └─────────────────────────────────┘   │
                    │                                         │
                    └─────────────────────────────────────────┘
```

---

## Résumé

| Concept | Rôle | Analogie |
|---------|------|----------|
| **Entity** | Identifiant unique | Numéro de sécurité sociale |
| **Component** | Données pures | Fiche d'information |
| **Archetype** | Stockage groupé | Classeur par catégorie |
| **World** | Conteneur global | Le bureau entier |

---

**Suivant :** [02 - Types de Champs](./02-types-de-champs.md)
