# Architecture du Système ECS

Ce document explique l'architecture interne du système Entity Component System (ECS) de Rogue III. Il couvre les principes fondamentaux, les structures de données clés et les flux d'exécution.

## 1. Architecture Globale

Le système ECS est architecturé autour de la **World** (Monde), qui orchestr tous les systèmes, entités et composants. Voici une vue d'ensemble :

```
┌─────────────────────────────────────────────────────────────────┐
│                         WORLD                                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │  CORE            │  │  SCHEDULE        │                    │
│  ├──────────────────┤  ├──────────────────┤                    │
│  │ - Archetype      │  │ - Scheduler      │                    │
│  │ - Component      │  │ - System         │                    │
│  │ - Entity Mgmt    │  │ - Run Condition  │                    │
│  │ - Type System    │  │ - SystemSet      │                    │
│  └──────────────────┘  └──────────────────┘                    │
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │  QUERY           │  │  STORAGE         │                    │
│  ├──────────────────┤  ├──────────────────┤                    │
│  │ - QueryCache     │  │ - CommandBuffer  │                    │
│  │ - QueryBuilder   │  │ - ResourceReg    │                    │
│  │ - Archetype      │  │ - StringPool     │                    │
│  │   Matching       │  │                  │                    │
│  └──────────────────┘  └──────────────────┘                    │
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │  RELATIONSHIP    │  │  EVENT           │                    │
│  ├──────────────────┤  ├──────────────────┤                    │
│  │ - RelationStore  │  │ - EventQueue     │                    │
│  │ - EntityRefStore │  │ - Observer       │                    │
│  │ - Hierarchy      │  │ - GameEvent      │                    │
│  └──────────────────┘  └──────────────────┘                    │
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │  PREFAB          │  │  SERIALIZATION   │                    │
│  ├──────────────────┤  ├──────────────────┤                    │
│  │ - PrefabRegistry │  │ - Serializer     │                    │
│  │ - Templates      │  │ - Migration      │                    │
│  │ - EntityBuilder  │  │ - Snapshot       │                    │
│  └──────────────────┘  └──────────────────┘                    │
│                                                                 │
│  ┌──────────────────┐  ┌──────────────────┐                    │
│  │  SPATIAL         │  │  DEBUG           │                    │
│  ├──────────────────┤  ├──────────────────┤                    │
│  │ - SpatialGrid    │  │ - Inspector      │                    │
│  │ - GridCell       │  │ - Profiler       │                    │
│  │ - Queries        │  │ - Statistics     │                    │
│  └──────────────────┘  └──────────────────┘                    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Flux d'Exécution Principal

```
1. SETUP PHASE (une fois)
   └─> Créer World
   └─> Définir Composants (@component)
   └─> Enregistrer Systèmes
   └─> Configurer Relations

2. GAME LOOP (chaque frame)
   ├─> PreUpdate Phase
   │   └─> Systèmes PreUpdate exécutés
   ├─> Update Phase
   │   └─> Systèmes Update exécutés
   │   └─> CommandBuffer appliqués
   ├─> PostUpdate Phase
   │   └─> Systèmes PostUpdate exécutés
   └─> Événements traités
   └─> Observers déclenché
```

---

## 2. Archetype Storage (Stockage par Archetype)

### Concept Fondamental

Un **archetype** est un ensemble unique de composants. Par exemple :
- Archetype 1: `[Position, Velocity]`
- Archetype 2: `[Position, Health, AI]`
- Archetype 3: `[Item, Rarity]`

Chaque entité appartient à exactement un archetype.

### Structure de Données (Structure of Arrays - SoA)

Au lieu de stocker les entités comme des tableaux d'objets (Array of Structures), le ECS utilise Structure of Arrays :

```
INEFFICACE (Array of Structures):
Entity 0: { x: 10, y: 20, vx: 1, vy: 2 }
Entity 1: { x: 30, y: 40, vx: 3, vy: 4 }
Entity 2: { x: 50, y: 60, vx: 5, vy: 6 }

EFFICACE (Structure of Arrays) - Une "colonne" par champ:
x:  [10, 30, 50]     <- Stockage contigu en mémoire
y:  [20, 40, 60]     <- Cache-friendly
vx: [1,  3,  5]      <- Vectorization CPU possible
vy: [2,  4,  6]
```

### Avantages Majeurs

**1. Cache Locality (Localité de Cache)**
- Accéder à tous les `Position.x` consécutifs remplit bien le cache CPU
- Moins de cache misses → bien plus rapide

**2. Vectorization (Vectorisation SIMD)**
- Les opérations sur des tableaux continus profitent de SIMD
- `vx[i] += 0.016 * vx[i]` peut être vectorisé automatiquement

**3. Memory Efficiency (Efficacité Mémoire)**
- Aucune donnée inutile en mémoire
- Les tags (composants sans données) occupent 0 mémoire

### Implémentation

Chaque Archetype contient :

```typescript
interface Archetype {
  id: number;                      // Identifiant unique
  mask: ComponentMask;             // Bitmap des composants
  componentTypes: ComponentClass[]; // Types de composants

  // Structure of Arrays - une colonne par composant/champ
  componentData: Map<componentId, {
    meta: ComponentMeta;
    columns: Column[];    // [Float32Array, Float32Array, ...]
    fieldIndex: Map<fieldName, columnIndex>;
  }>;

  entityIndices: Uint32Array;  // Liste des entity IDs dans cet archetype
  entityGens: Uint16Array;     // Générations pour validation
  changeFlags: Uint8Array;     // Flags de changement par entité
  componentChangeFlags: BigUint64Array; // Flags par composant

  _count: number;     // Nombre d'entités actuelles
  _capacity: number;  // Capacité allocée
}
```

### Allocation Dynamique

Les archeytpes croissent dynamiquement :

```
INITIAL_CAPACITY = 64
└─> 64 entités
└─> 128 entités (GROWTH_FACTOR = 2)
└─> 256 entités
└─> 512 entités
```

---

## 3. Entity Lifecycle (Cycle de Vie des Entités)

### Entity ID Structure (32 bits)

```
┌────────────────────────────────────────┐
│ Entity = 32-bit unsigned integer        │
├──────────────────┬─────────────────────┤
│ Generation (12)  │ Index (20)          │
├──────────────────┼─────────────────────┤
│ 0xFFF00000       │ 0x000FFFFF          │
└──────────────────┴─────────────────────┘

- Index: 0 à 1,048,575 (2^20 - 1)
- Generation: 0 à 4,095 (2^12 - 1)
```

### Pourquoi cette structure ?

**Index** : Accès rapide au record de l'entité
**Generation** : Détection des références obsolètes

### Exemple Complet

```
Étape 1: Créer entité
  index=0, gen=0 → Entity = 0x00000000

Étape 2: Entité vivante
  entityRecords[0] = { archetype: Archetype1, row: 0 }
  generations[0] = 0

Étape 3: Détruire entité
  Ajouter 0 à freeList
  Incrémenter generations[0] → 1
  entityRecords[0] = { archetype: null, row: -1 }

Étape 4: Réutiliser l'index
  Retirer 0 de freeList
  index=0, gen=1 → Entity = 0x00100000
  (L'ancienne Entity = 0x00000000 est désormais invalide!)
```

### Free List (Liste des Indices Libres)

```typescript
private freeList: Uint32Array;   // Pile des indices réutilisables
private freeCount: number;        // Nombre d'indices libres
private nextIndex: number;        // Prochain index si pas de réutilisation
```

La free list est une simple pile LIFO :
- Déspawn → push à la free list
- Spawn → pop de la free list (si disponible), sinon nextIndex++

---

## 4. Query System (Système de Requêtes)

### Concept

Une **query** trouve toutes les entités ayant un ensemble spécifique de composants.

```typescript
// Query: "Tous les entités avec Position ET Health, MAIS PAS AI"
query(with: [Position, Health], without: [AI])
```

### QueryDescriptor (Descripteur)

```typescript
interface QueryDescriptor {
  withMask: ComponentMask;     // Composants requis
  withoutMask: ComponentMask;  // Composants interdits
}

// ComponentMask est un bitmap optimisé:
// Bit 0 = Position?
// Bit 1 = Health?
// Bit 2 = AI?
// ...
```

### Archetype Matching (Appariement d'Archetype)

```
Query: with=[Position, Health], without=[AI]
withMask = 0b011 (Position + Health)
withoutMask = 0b100 (AI)

Tester Archetype1 [Position, Velocity]:
  (Archetype1.mask & withMask) == withMask? NO → Skip

Tester Archetype2 [Position, Health, AI]:
  (Archetype2.mask & withMask) == withMask? YES
  (Archetype2.mask & withoutMask) == 0? NO → Skip (contient AI)

Tester Archetype3 [Position, Health]:
  (Archetype3.mask & withMask) == withMask? YES
  (Archetype3.mask & withoutMask) == 0? YES → MATCH!
```

### QueryCache (Cache de Requêtes)

Les queries sont coûteuses. Elles sont donc cachées :

```typescript
class QueryCache {
  private cache: Map<key, CachedEntry> = new Map();

  resolve(descriptor: QueryDescriptor): Archetype[] {
    const key = makeKey(descriptor);  // "Position,Health|AI"
    const cached = this.cache.get(key);

    if (cached && cached.epoch === graph.epoch) {
      return cached.archetypes;  // Aucun calcul!
    }

    // Recalculer et mettre en cache
    const archetypes = graph.getMatchingArchetypes(...);
    this.cache.set(key, { archetypes, epoch: graph.epoch });
    return archetypes;
  }
}
```

Le **epoch** change chaque fois qu'une archetype est créée, invalidant le cache.

### Itération Efficace

```typescript
// Récupérer les données
const archetypes = queryCache.resolve(descriptor);

for (const archetype of archetypes) {
  const positions = archetype.getColumn(Position, 'x');
  const healths = archetype.getColumn(Health, 'current');

  // Itération tight loop - très rapide!
  for (let i = 0; i < archetype.count; i++) {
    const x = positions[i];
    const hp = healths[i];
    // Traiter l'entité...
  }
}
```

---

## 5. Change Detection (Détection des Changements)

### Pourquoi Tracker les Changements?

Les systèmes doivent souvent réagir seulement si une donnée a changé :
- "Redraw l'écran seulement si Position a changé"
- "Recalculer FOV seulement si Health/Vision a changé"

### ChangeFlag (Drapeau de Changement)

```typescript
enum ChangeFlag {
  None = 0,
  Added = 1,      // Composant/Entité ajouté ce tick
  Modified = 2,   // Composant modifié ce tick
  Removed = 4,    // Composant/Entité supprimé ce tick
}
```

### Tracking par Entité

Chaque archetype maintient :

```typescript
// Par entité
changeFlags: Uint8Array;  // [ChangeFlag, ChangeFlag, ...]

// Par composant (64 composants max)
componentChangeFlags: BigUint64Array;  // Bitmap de 64 bits par entité
```

### Exemple

```
Tick 0:
  Entity 5 créée → changeFlags[5] = Added

Tick 1:
  Entity 5: Position modifiée
    → changeFlags[5] = Modified
    → componentChangeFlags[5] |= (1n << Position.id)

Tick 2 (avant update):
  Query: "Positions modifiées?"
    → Checker componentChangeFlags[5] & (1n << Position.id)
    → Oui! → Retraiter

Tick 2 (après update):
  Clearing flags
    → changeFlags[5] = None
    → componentChangeFlags[5] = 0n
```

### Phases de Détection

```
DURING System Execution:
  ├─> System A modifie Position
  ├─> Event: "Position modified" émis
  └─> Observers notifiés immédiatement

AFTER PostUpdate:
  ├─> Flags lus par les systèmes
  └─> Flags réinitialisés pour le prochain tick
```

---

## 6. Module Map (Carte des Modules)

Voici la structure des répertoires et leur responsabilité :

### `core/` - Cœur du Système

| Fichier | Responsabilité |
|---------|----------------|
| `world.ts` | Orchestre l'ensemble du système, gère les entités, l'allocation |
| `archetype.ts` | Structure de données SoA, gestion des colonnes et rows |
| `component.ts` | Décorateur `@component`, métadonnées, registre |
| `types.ts` | Types fondamentaux (Entity, FieldType, ChangeFlag) |
| `field.ts` | Descripteurs de champs, métatypes pour composants |
| `entity-builder.ts` | Construit des entités étape par étape |
| `bundle.ts` | Groupes pré-définis de composants |

**Flux:** Entity ID allocé → Archetype créé/récupéré → Row allocé → Données initialisées

---

### `schedule/` - Exécution des Systèmes

| Fichier | Responsabilité |
|---------|----------------|
| `scheduler.ts` | Trie topologiquement les systèmes, exécute chaque phase |
| `system.ts` | Interface pour les fonctions système (avec queries, commands) |
| `system-set.ts` | Groupe de systèmes avec dépendances |
| `run-condition.ts` | Conditions pour exécuter un système (ex: `every_n_frames`) |

**Flux:** Systèmes → Dépendances → Tri topologique → Exécution ordonnée

---

### `event/` - Événements et Observations

| Fichier | Responsabilité |
|---------|----------------|
| `events.ts` | Définition des types d'événements (enum de variants discriminés) |
| `observer.ts` | Enregistrement et appel des callbacks sur événements |

**Types:** `entity.spawned`, `component.added`, `combat.damage`, etc.

---

### `query/` - Requêtes et Caching

| Fichier | Responsabilité |
|---------|----------------|
| `index.ts` | `QueryCache` - cache les résultats des requêtes |

**Optim:** Bitmap matching → archetype filtering → cache des résultats

---

### `relationship/` - Relations entre Entités

| Fichier | Responsabilité |
|---------|----------------|
| `relation.ts` | Type de relation (exclusive, symmetric, cascadeDelete) |
| `relation-store.ts` | Stockage et interrogation des relations |
| `entity-ref-store.ts` | Références à d'autres entités, validation génération |
| `hierarchy.ts` | Relations parent/enfant, marche tree |

**Exemple:** Parent → Children, Owner → Items

---

### `storage/` - Stockage et Ressources

| Fichier | Responsabilité |
|---------|----------------|
| `command-buffer.ts` | File de commandes déterministes (spawn, despawn, add, remove) |
| `resource.ts` | Ressources globales (singletons) - GameMap, TurnState |
| `string-pool.ts` | Pool de chaînes pour économiser mémoire |

**Pattern:** Commands buffered → Applied after systems run

---

### `spatial/` - Grille Spatiale

| Fichier | Responsabilité |
|---------|----------------|
| `index.ts` | `SpatialGrid` - partitionnement spatiale pour requêtes rapides |

**Optim:** Queries spatiales en O(cellules) plutôt que O(entités)

---

### `prefab/` - Modèles d'Entités

| Fichier | Responsabilité |
|---------|----------------|
| `index.ts` | `PrefabRegistry` - créer entités à partir de templates |

**Pattern:** Define → Spawn → Optional inheritance

---

### `serialization/` - Save/Load

| Fichier | Responsabilité |
|---------|----------------|
| `serialization.ts` | Snapshots du monde, serialization binaire |
| `migration.ts` | Migrations de schéma entre versions ECS |

**Cas d'usage:** Sauvegardes, réplication réseau, hot-reload

---

### `debug/` - Débogage et Inspection

| Fichier | Responsabilité |
|---------|----------------|
| `index.ts` | `Inspector` - afficher état des entités, archetypes, stats |

**Fonctionnalités:** Profiling, introspection, state dump

---

## 7. Patterns Courants

### Pattern: EntityBuilder (Constructeur Fluent)

```typescript
const entity = new EntityBuilder(world)
  .with(Position, { x: 10, y: 20 })
  .with(Health, { current: 100, max: 100 })
  .with(Inventory)  // Tag
  .build();
```

### Pattern: QueryBuilder (Construction de Requête)

```typescript
const query = world
  .query(Position, Health)
  .without(Frozen)
  .iter(archetype => {
    // ...iterate
  });
```

### Pattern: System avec Commands

```typescript
function movementSystem(world: World) {
  const query = world.query(Position, Velocity);

  for (const archetype of query) {
    const positions = archetype.getColumn(Position, 'x');
    const velocities = archetype.getColumn(Velocity, 'dx');

    for (let i = 0; i < archetype.count; i++) {
      positions[i] += velocities[i] * deltaTime;
    }
  }

  // Commands bufferisés, appliqués plus tard
  world.commands.spawn(Projectile);
}
```

### Pattern: Relation avec Données

```typescript
const isDependentOn = world.relations.define<null>("DependentOn");
const hasValue = world.relations.define<number>("HasValue", {
  symmetric: true,
});

world.relations.relate(entityA, isDependentOn, entityB);
world.relations.relate(itemA, hasValue, itemB, 50);  // Poids
```

---

## 8. Performance Characteristics (Caractéristiques de Performance)

| Opération | Complexité | Notes |
|-----------|-----------|-------|
| Spawn entity | O(1) | Allocate row in archetype |
| Despawn entity | O(1) | Mark as dead, add to freelist |
| Add component | O(n) | Move entire row if archetype changes |
| Query (cached) | O(1) | Bitmap match cached |
| Query (miss) | O(a) | Check all archetypes (a = count) |
| Iterate query | O(m) | m = entities matching, SoA = fast |
| Relation lookup | O(1) | Hash table |
| Spatial query | O(c) | c = cells, not all entities |

---

## 9. Synchronisation et Déterminisme

### CommandBuffer Ordering (Ordre Déterministe)

Chaque commande a un sort key et sequence number :

```typescript
setSortKey(systemIndex * 1000 + subOrder);
spawn(...);  // SortKey=0, Seq=0
spawn(...);  // SortKey=0, Seq=1
// Après add:
add(...);    // SortKey=0, Seq=2
// Trier par (SortKey, Seq) → ordre déterministe!
```

### Event Queue (File d'Attente d'Événements)

```
Events générés → Queue → Observers appelés (ordre insertion)
```

Les observers sont appelés immédiatement, garantissant l'ordre.

---

## 10. Mémoire et Allocation

### StringPool (Pool de Chaînes)

Les chaînes sont coûteuses en mémoire. Le StringPool déduplique :

```
String "Goblin" → Index 0
String "Goblin" → Index 0 (même!)
String "Orc" → Index 1

Components stockent Index (u32), pas String
```

### Bit-packing

- `ChangeFlag` = 3 states → 2 bits (packed)
- `Generation` = 4096 values → 12 bits
- `Index` = 1M max → 20 bits
- Entity = 32 bits total

---

## Conclusion

Le système ECS de Rogue III optimise pour :

1. **Cache Efficiency** - SoA layout, contiguous memory
2. **Query Speed** - Archetype matching + bitmap cache
3. **Memory Usage** - String deduplication, bit-packing
4. **Determinism** - Command ordering, sequence numbers
5. **Flexibility** - Relations, components, systems découplés

Le système est prêt pour supporter des milliers d'entités avec un bon cache behavior et prévisibilité déterministe requise pour les jeux en réseau.
