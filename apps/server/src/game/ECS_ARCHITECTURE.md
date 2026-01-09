# ECS Architecture - Rogue III

> **Document de référence pour l'Entity Component System moderne et state-of-the-art**
>
> Version 1.0 - Décembre 2025

---

## Table des Matières

1. [Vision & Objectifs](#1-vision--objectifs)
2. [Architecture Globale](#2-architecture-globale)
3. [Core Modules](#3-core-modules)
4. [Advanced Features](#4-advanced-features)
5. [Roguelike-Specific Implementation](#5-roguelike-specific-implementation)
6. [Integration avec l'Existant](#6-integration-avec-lexistant)
7. [Performance Optimizations](#7-performance-optimizations)
8. [Developer Experience](#8-developer-experience)
9. [Testing Strategy](#9-testing-strategy)
10. [Implementation Roadmap](#10-implementation-roadmap)

---

## 1. Vision & Objectifs

### 1.1 Principes Directeurs

Notre ECS suit trois principes fondamentaux issus des meilleures pratiques 2025 :

#### **Data-Oriented Design (DOD)**

- Les données sont organisées pour maximiser l'efficacité du CPU cache
- Structure of Arrays (SoA) plutôt que Array of Structures (AoS) pour les primitives
- Minimisation de la fragmentation mémoire et du garbage collection

#### **Separation of Concerns**

- **Components** : Pure data, aucune logique
- **Systems** : Pure logic, stateless
- **Entities** : Simple IDs, containers de components

#### **Developer Experience First**

- Type safety complète avec TypeScript
- API déclarative et intuitive
- Hot reload pour itération rapide
- Debug tools intégrés

### 1.2 Besoins Spécifiques du Roguelike

Notre roguelike nécessite :

- **Turn-based gameplay** : système d'initiative et d'énergie
- **Grid-based movement** : collision detection sur grille 2D
- **Field of View** : calcul de visibilité (shadowcasting)
- **Inventory & Equipment** : hiérarchie parent/child pour items
- **Procedural dungeons** : génération intégrée à l'ECS
- **Save/Load** : sérialisation complète du game state
- **AI** : behavior trees pour NPCs/ennemis
- **Multiplayer** : synchronisation WebSocket

### 1.3 Contraintes Techniques

- **Scale** : < 1000 entités simultanées (joueur + ennemis + items + tiles)
- **Platform** : Bun runtime avec Elysia server
- **Threading** : Single-threaded (pas de Web Workers nécessaires)
- **Memory** : Optimisé pour faible empreinte mémoire (TypedArrays)
- **Performance target** : 60 tick/s pour gameplay fluide

### 1.4 Décisions Architecturales

| Aspect            | Décision              | Raison                            |
| ----------------- | --------------------- | --------------------------------- |
| **Storage**       | Hybrid (SoA + AoS)    | Flexibilité + performance         |
| **Entity IDs**    | Recycled integers     | O(1) access, minimal memory       |
| **Components**    | TypedArrays + Objects | Cache-friendly pour primitives    |
| **Queries**       | Cached archetypes     | Fast iteration sur <1000 entities |
| **Serialization** | Delta compression     | Compact save files                |
| **Hierarchy**     | Parent component      | Simple, efficient pour inventory  |

---

## 2. Architecture Globale

### 2.1 Vue d'Ensemble

```
┌─────────────────────────────────────────────────────────────────┐
│                          WORLD                                  │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    EntityManager                        │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐              │   │
│  │  │ Entity 0 │ │ Entity 1 │ │ Entity N │   ...        │   │
│  │  └──────────┘ └──────────┘ └──────────┘              │   │
│  │  [ID Pool] [Generation Counters] [Alive Flags]        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                 ComponentRegistry                       │   │
│  │  ┌───────────────────────────────────────────────────┐ │   │
│  │  │ Position (SoA)                                    │ │   │
│  │  │   x: Float32Array(MAX_ENTITIES)                   │ │   │
│  │  │   y: Float32Array(MAX_ENTITIES)                   │ │   │
│  │  │   sparse: Uint32Array (entity → index)            │ │   │
│  │  │   dense: Uint32Array (index → entity)             │ │   │
│  │  └───────────────────────────────────────────────────┘ │   │
│  │  ┌───────────────────────────────────────────────────┐ │   │
│  │  │ Stats (AoS)                                       │ │   │
│  │  │   data: Array<{ hp, maxHp, attack, defense }>    │ │   │
│  │  │   sparse/dense: Uint32Array                       │ │   │
│  │  └───────────────────────────────────────────────────┘ │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    QueryCache                           │   │
│  │  [Position + Velocity] → [e1, e5, e12, ...]           │   │
│  │  [Position + Renderable] → [e0, e1, e2, ...]          │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    Resources                            │   │
│  │  Grid, SpatialIndex, RNG, TurnCounter, EventQueue      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  SystemScheduler                        │   │
│  │  Init → PreUpdate → Update → PostUpdate → LateUpdate   │   │
│  │  [Systems topologically sorted by dependencies]        │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                  CommandBuffer                          │   │
│  │  Queue: [spawn(template), addComponent(e, c), ...]     │   │
│  │  Flushed between system phases                          │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 Hybrid Storage Strategy

Notre approche hybride combine le meilleur des deux mondes :

#### **Structure of Arrays (SoA)** - Pour primitives

```typescript
// ✅ Excellent pour cache efficiency
interface PositionSoA {
  x: Float32Array; // [x0, x1, x2, ...] - contiguous in memory
  y: Float32Array; // [y0, y1, y2, ...] - contiguous in memory
}

// Iteration ultra-rapide
for (let i = 0; i < count; i++) {
  position.x[i] += velocity.x[i]; // Cache-friendly sequential access
  position.y[i] += velocity.y[i];
}
```

#### **Array of Structures (AoS)** - Pour objets complexes

```typescript
// ✅ Meilleur pour données cohésives
interface StatsAoS {
  data: Array<{
    hp: number;
    maxHp: number;
    attack: number;
    defense: number;
    statusEffects: string[];
  }>;
}

// Accès logique groupé
const stats = getComponent(entity, Stats);
if (stats.hp <= 0) {
  // Toutes les propriétés liées sont ensemble
}
```

#### **Sparse Set Storage**

Chaque component store utilise un sparse set pour mapping entity → component :

```
Entity ID → Component Index (sparse array)
Component Index → Entity ID (dense array)

Sparse: [_, 0, _, 2, 1, _, _]  (entity id → component index)
         ^     ^     ^
         |     |     |
       e0=?  e1=0  e2=? e3=2 e4=1

Dense:  [1, 4, 3]  (component index → entity id)
Data:   [Position{10,20}, Position{5,15}, Position{30,40}]
         ^                ^                ^
         e1               e4               e3
```

**Avantages** :

- Add/Remove component : O(1)
- Has component : O(1)
- Get component : O(1)
- Iteration dense (pas de trous)

### 2.3 Entity ID Management

```typescript
// Entity = 32-bit integer avec allocation équilibrée pour roguelike
// ┌───────────────────────┬───────────────────┐
// │    Index (16 bits)    │   Gen (16 bits)   │
// └───────────────────────┴───────────────────┘
//   65,536 entities max    65,536 generations
//
// Pourquoi 16/16 plutôt que 22/10 ?
// - Un roguelike typique a < 1000 entités simultanées
// - 65K entities est largement suffisant avec marge
// - 65K generations évite le wraparound en pratique
//   (1000 spawns/despawns par seconde = 65s avant wraparound d'un slot)
// - Équilibre optimal pour notre use case

type Entity = number & { readonly __brand: unique symbol };

// Configuration centralisée
const ENTITY_CONFIG = {
  INDEX_BITS: 16,
  GENERATION_BITS: 16,
  MAX_ENTITIES: 1 << 16, // 65,536
  GENERATION_MASK: (1 << 16) - 1, // 0xFFFF
  INVALID_ENTITY: 0xffffffff, // Sentinel value
} as const;

const {
  INDEX_BITS,
  GENERATION_BITS,
  MAX_ENTITIES,
  GENERATION_MASK,
  INVALID_ENTITY,
} = ENTITY_CONFIG;

// Entity factory avec validation
function createEntity(index: number, generation: number): Entity {
  if (__DEV__) {
    if (index < 0 || index >= MAX_ENTITIES) {
      throw new RangeError(
        `Entity index ${index} out of bounds [0, ${MAX_ENTITIES})`,
      );
    }
    if (generation < 0 || generation > GENERATION_MASK) {
      throw new RangeError(
        `Generation ${generation} out of bounds [0, ${GENERATION_MASK}]`,
      );
    }
  }
  return ((index << GENERATION_BITS) | generation) as Entity;
}

// Extraction optimisée (inline-able par le JIT)
function getIndex(entity: Entity): number {
  return entity >>> GENERATION_BITS;
}

function getGeneration(entity: Entity): number {
  return entity & GENERATION_MASK;
}

// Helpers utiles
function isValidEntity(entity: Entity): boolean {
  return entity !== INVALID_ENTITY && entity >= 0;
}

function entityToString(entity: Entity): string {
  return `Entity(idx=${getIndex(entity)}, gen=${getGeneration(entity)})`;
}

// Null entity pour représenter "pas d'entité"
const NULL_ENTITY = INVALID_ENTITY as Entity;
```

**Generation counter** évite les "stale references" :

- Quand entity N est détruit, generation++
- Références anciennes deviennent invalides automatiquement
- Avec 16 bits de génération, un slot peut être recyclé 65,536 fois avant wraparound
- Détection d'erreurs : `assert(world.generation[index] === getGeneration(entity))`

**Comparaison des allocations de bits** :

| Allocation | Max Entities | Max Generations | Use Case                             |
| ---------- | ------------ | --------------- | ------------------------------------ |
| 22/10      | 4,194,304    | 1,024           | MMO, simulation massive              |
| 20/12      | 1,048,576    | 4,096           | Grand RPG open-world                 |
| **16/16**  | **65,536**   | **65,536**      | **Roguelike (notre choix)**          |
| 12/20      | 4,096        | 1,048,576       | Petit jeu avec beaucoup de recycling |

---

## 3. Core Modules

### 3.1 Entity Manager

Responsable du cycle de vie des entités.

#### **Interface**

```typescript
interface EntityManager {
  // Création
  spawn(): Entity;
  spawnBatch(count: number): Entity[];

  // Destruction
  despawn(entity: Entity): void;
  despawnBatch(entities: Entity[]): void;

  // Queries
  isAlive(entity: Entity): boolean;
  getAliveCount(): number;
  getAllAlive(): Entity[];

  // Internals
  recycle(entity: Entity): void;
  compact(): void; // Defragmentation
}
```

#### **Implémentation**

```typescript
class EntityManagerImpl implements EntityManager {
  private alive: Uint8Array; // 1 = alive, 0 = dead
  private generation: Uint16Array; // Generation counter
  private freeList: number[]; // Recycled IDs
  private nextId: number;

  constructor(maxEntities: number = MAX_ENTITIES) {
    this.alive = new Uint8Array(maxEntities);
    this.generation = new Uint16Array(maxEntities);
    this.freeList = [];
    this.nextId = 0;
  }

  spawn(): Entity {
    let index: number;

    // Recycler un ID si possible
    if (this.freeList.length > 0) {
      index = this.freeList.pop()!;
    } else {
      index = this.nextId++;
      if (index >= MAX_ENTITIES) {
        throw new Error("Max entities reached");
      }
    }

    this.alive[index] = 1;
    const gen = this.generation[index];

    return createEntity(index, gen);
  }

  despawn(entity: Entity): void {
    const index = getIndex(entity);
    const gen = getGeneration(entity);

    // Validation generation
    if (this.generation[index] !== gen) {
      throw new Error("Stale entity reference");
    }

    if (!this.alive[index]) {
      throw new Error("Entity already dead");
    }

    this.alive[index] = 0;
    this.generation[index] = (gen + 1) & GENERATION_MASK;
    this.freeList.push(index);
  }

  isAlive(entity: Entity): boolean {
    const index = getIndex(entity);
    const gen = getGeneration(entity);

    return this.alive[index] === 1 && this.generation[index] === gen;
  }
}
```

### 3.2 Component Registry

Gère tous les component stores avec type safety.

#### **Component Schema Definition**

```typescript
// Déclaration déclarative avec builder pattern
enum ComponentType {
  // Types numériques (compatibles SoA avec TypedArrays)
  F32 = "f32",   // Float32Array
  F64 = "f64",   // Float64Array
  I32 = "i32",   // Int32Array
  U32 = "u32",   // Uint32Array
  I16 = "i16",   // Int16Array
  U16 = "u16",   // Uint16Array
  I8 = "i8",     // Int8Array
  U8 = "u8",     // Uint8Array
  // Types non-numériques (forcent AoS)
  String = "string",   // Array<string>
  Object = "object",   // Array<T>
}

// Helper pour determiner si un type est compatible SoA
function isSoACompatible( type: ComponentType ): boolean {
  return type !== ComponentType.String && type !== ComponentType.Object;
}

interface ComponentField {
  name: string;
  type: ComponentType;
  default?: any;
}

class ComponentSchema<T = any> {
  constructor(
    public name: string,
    public fields: ComponentField[],
    public storage: "soa" | "aos" = "soa",
  ) {}

  static define<T>( name: string ) {
    return new ComponentSchemaBuilder<T>( name );
  }
}

class ComponentSchemaBuilder<T> {
  private fields: ComponentField[] = [];
  private storage: "soa" | "aos" = "soa";
  private hasNonNumericField = false;

  constructor( private name: string ) {}

  field( name: string, type: ComponentType, defaultValue?: any ) {
    this.fields.push( { name, type, default: defaultValue } );
    // Auto-detect: si un champ n'est pas compatible SoA, forcer AoS
    if ( !isSoACompatible( type ) ) {
      this.hasNonNumericField = true;
    }
    return this;
  }

  useAoS() {
    this.storage = "aos";
    return this;
  }

  build(): ComponentSchema<T> {
    // Forcer AoS si des champs non-numériques sont présents
    const finalStorage = this.hasNonNumericField ? "aos" : this.storage;
    
    if ( __DEV__ && this.hasNonNumericField && this.storage === "soa" ) {
      console.warn(
        `[ECS] Component "${this.name}" has non-numeric fields, ` +
        `automatically using AoS storage instead of SoA.`
      );
    }
    
    return new ComponentSchema( this.name, this.fields, finalStorage );
  }
}

// Exemple d'utilisation
const PositionSchema = ComponentSchema.define<{ x: number; y: number }>(
  "Position",
)
  .field("x", ComponentType.F32, 0)
  .field("y", ComponentType.F32, 0)
  .build();

const StatsSchema = ComponentSchema.define("Stats")
  .field("hp", ComponentType.I32, 100)
  .field("maxHp", ComponentType.I32, 100)
  .field("attack", ComponentType.I32, 10)
  .field("defense", ComponentType.I32, 5)
  .useAoS() // Complex object, use AoS
  .build();
```

#### **Component Store**

```typescript
// Types pour les TypedArrays
type TypedArray =
  | Float32Array
  | Float64Array
  | Int32Array
  | Uint32Array
  | Int16Array
  | Uint16Array
  | Int8Array
  | Uint8Array;

// Sentinel pour sparse array (entité non présente)
const INVALID_INDEX = 0xffffffff;

interface ComponentStore<T> {
  // CRUD de base
  add(entity: Entity, data: T): void;
  remove(entity: Entity): boolean;
  has(entity: Entity): boolean;

  // Lecture - différentes stratégies selon le use case
  get(entity: Entity): T | undefined;
  getUnsafe(entity: Entity): T;

  // Accès direct aux champs (zero-allocation pour SoA)
  getField<K extends keyof T>(entity: Entity, field: K): T[K] | undefined;
  setField<K extends keyof T>(entity: Entity, field: K, value: T[K]): void;

  // Itération
  forEach(fn: (entity: Entity, component: T) => void): void;
  forEachEntity(fn: (entity: Entity) => void): void;

  // Bulk operations
  getCount(): number;
  getEntities(): readonly Entity[];
  clear(): void;

  // Pour le Query system
  getDenseArray(): readonly Entity[];
}

// ============================================================================
// SoA Implementation - Optimisé pour primitives numériques
// ============================================================================
class SoAComponentStore<T extends Record<string, number>>
  implements ComponentStore<T>
{
  private readonly sparse: Uint32Array;
  private readonly dense: Uint32Array;
  // Stocke les generations pour reconstruire les Entity IDs complets
  private readonly generations: Uint16Array;
  private readonly fields: Map<string, TypedArray>;
  private readonly fieldNames: readonly string[];
  private count = 0;

  constructor(
    private readonly schema: ComponentSchema<T>,
    private readonly maxEntities: number,
  ) {
    this.sparse = new Uint32Array( maxEntities ).fill( INVALID_INDEX );
    this.dense = new Uint32Array( maxEntities );
    this.generations = new Uint16Array( maxEntities );
    this.fields = new Map();
    this.fieldNames = schema.fields.map( ( f ) => f.name );

    // Allouer les TypedArrays
    for ( const field of schema.fields ) {
      this.fields.set(
        field.name,
        this.createTypedArray( field.type, maxEntities ),
      );
    }
  }

  add( entity: Entity, data: T ): void {
    const index = getIndex( entity );
    const generation = getGeneration( entity );
    let denseIdx = this.sparse[index];

    if ( denseIdx === INVALID_INDEX ) {
      // Nouvelle entité
      denseIdx = this.count++;
      this.sparse[index] = denseIdx;
      this.dense[denseIdx] = index;
      this.generations[denseIdx] = generation;
    } else {
      // Mise à jour - vérifier la generation
      this.generations[denseIdx] = generation;
    }

    // Écrire les données
    for ( const fieldName of this.fieldNames ) {
      this.fields.get( fieldName )![denseIdx] = ( data as any )[fieldName];
    }
  }

  remove( entity: Entity ): boolean {
    const index = getIndex( entity );
    const denseIdx = this.sparse[index];

    if ( denseIdx === INVALID_INDEX ) return false;

    const lastIdx = --this.count;

    if ( denseIdx !== lastIdx ) {
      // Swap-remove : déplacer le dernier élément à la place du supprimé
      const lastEntityIndex = this.dense[lastIdx];
      this.dense[denseIdx] = lastEntityIndex;
      this.generations[denseIdx] = this.generations[lastIdx];
      this.sparse[lastEntityIndex] = denseIdx;

      // Copier les données du dernier vers la position libérée
      for ( const fieldName of this.fieldNames ) {
        const arr = this.fields.get( fieldName )!;
        arr[denseIdx] = arr[lastIdx];
      }
    }

    this.sparse[index] = INVALID_INDEX;
    return true;
  }

  has( entity: Entity ): boolean {
    const index = getIndex( entity );
    const denseIdx = this.sparse[index];
    if ( denseIdx === INVALID_INDEX ) return false;
    // Vérifier la generation pour détecter les stale references
    return this.generations[denseIdx] === getGeneration( entity );
  }

  // Retourne un objet copié (allocation, mais safe)
  get( entity: Entity ): T | undefined {
    const index = getIndex( entity );
    const denseIdx = this.sparse[index];
    if ( denseIdx === INVALID_INDEX ) return undefined;
    // Vérifier la generation
    if ( this.generations[denseIdx] !== getGeneration( entity ) ) return undefined;

    const result = {} as T;
    for ( const fieldName of this.fieldNames ) {
      ( result as any )[fieldName] = this.fields.get( fieldName )![denseIdx];
    }
    return result;
  }

  /**
   * Accès direct SANS allocation - DANGER: usage single-shot uniquement!
   * 
   * ⚠️ ATTENTION: Cette méthode utilise un proxy partagé. Le résultat n'est
   * valide QUE jusqu'au prochain appel de getUnsafe(). NE PAS stocker le résultat!
   * 
   * ✅ BON:  const x = store.getUnsafe(entity).x;
   * ✅ BON:  store.getUnsafe(entity).x += 1;
   * ❌ MAUVAIS: const pos = store.getUnsafe(e1); const pos2 = store.getUnsafe(e2); // pos est maintenant invalide!
   * 
   * Pour des accès multiples, utiliser getField/setField ou get() à la place.
   */
  getUnsafe( entity: Entity ): T {
    const index = getIndex( entity );
    const denseIdx = this.sparse[index];
    
    // Retourner un proxy inline (pas de cache partagé pour éviter les bugs)
    const store = this;
    return new Proxy( {} as T, {
      get( _, prop: string ) {
        return store.fields.get( prop )?.[denseIdx];
      },
      set( _, prop: string, value: number ) {
        const arr = store.fields.get( prop );
        if ( arr ) arr[denseIdx] = value;
        return true;
      },
    } );
  }

  // Accès direct à un champ (ZERO allocation, RECOMMANDÉ)
  getField<K extends keyof T>( entity: Entity, field: K ): T[K] | undefined {
    const index = getIndex( entity );
    const denseIdx = this.sparse[index];
    if ( denseIdx === INVALID_INDEX ) return undefined;
    if ( this.generations[denseIdx] !== getGeneration( entity ) ) return undefined;
    return this.fields.get( field as string )![denseIdx] as T[K];
  }

  // Modification directe d'un champ (ZERO allocation, RECOMMANDÉ)
  setField<K extends keyof T>( entity: Entity, field: K, value: T[K] ): void {
    const index = getIndex( entity );
    const denseIdx = this.sparse[index];
    if ( denseIdx === INVALID_INDEX ) return;
    if ( this.generations[denseIdx] !== getGeneration( entity ) ) return;
    this.fields.get( field as string )![denseIdx] = value as number;
  }

  // Itération optimisée - utilise les generations stockées
  forEach( fn: ( entity: Entity, component: T ) => void ): void {
    for ( let i = 0; i < this.count; i++ ) {
      const entityIndex = this.dense[i];
      const generation = this.generations[i];
      const entity = createEntity( entityIndex, generation );
      
      // Créer un objet temporaire pour cette itération
      const component = {} as T;
      for ( const fieldName of this.fieldNames ) {
        ( component as any )[fieldName] = this.fields.get( fieldName )![i];
      }
      fn( entity, component );
    }
  }

  // Itération sur les entités uniquement (plus léger)
  forEachEntity( fn: ( entity: Entity ) => void ): void {
    for ( let i = 0; i < this.count; i++ ) {
      const entity = createEntity( this.dense[i], this.generations[i] );
      fn( entity );
    }
  }

  getCount(): number {
    return this.count;
  }

  getEntities(): readonly Entity[] {
    const result: Entity[] = new Array( this.count );
    for ( let i = 0; i < this.count; i++ ) {
      result[i] = createEntity( this.dense[i], this.generations[i] );
    }
    return result;
  }

  getDenseArray(): readonly Entity[] {
    return this.getEntities();
  }

  clear(): void {
    this.sparse.fill( INVALID_INDEX );
    this.count = 0;
  }

  // Accès direct aux arrays pour itération bulk (advanced)
  getRawField( fieldName: string ): TypedArray | undefined {
    return this.fields.get( fieldName );
  }

  getRawDense(): Uint32Array {
    return this.dense;
  }

  getRawGenerations(): Uint16Array {
    return this.generations;
  }

  private createTypedArray(type: ComponentType, size: number): TypedArray {
    switch (type) {
      case ComponentType.F32:
        return new Float32Array(size);
      case ComponentType.F64:
        return new Float64Array(size);
      case ComponentType.I32:
        return new Int32Array(size);
      case ComponentType.U32:
        return new Uint32Array(size);
      case ComponentType.I16:
        return new Int16Array(size);
      case ComponentType.U16:
        return new Uint16Array(size);
      case ComponentType.I8:
        return new Int8Array(size);
      case ComponentType.U8:
        return new Uint8Array(size);
      default:
        throw new Error(`Unsupported SoA type: ${type}`);
    }
  }
}

// ============================================================================
// AoS Implementation - Pour objets complexes (strings, arrays, nested objects)
// ============================================================================
class AoSComponentStore<T> implements ComponentStore<T> {
  private readonly sparse: Uint32Array;
  private readonly dense: Uint32Array;
  // Stocke les generations pour reconstruire les Entity IDs complets
  private readonly generations: Uint16Array;
  private readonly data: T[];
  private count = 0;

  constructor(
    private readonly schema: ComponentSchema<T>,
    private readonly maxEntities: number,
  ) {
    this.sparse = new Uint32Array( maxEntities ).fill( INVALID_INDEX );
    this.dense = new Uint32Array( maxEntities );
    this.generations = new Uint16Array( maxEntities );
    this.data = new Array( maxEntities );
  }

  add( entity: Entity, data: T ): void {
    const index = getIndex( entity );
    const generation = getGeneration( entity );
    let denseIdx = this.sparse[index];

    if ( denseIdx === INVALID_INDEX ) {
      denseIdx = this.count++;
      this.sparse[index] = denseIdx;
      this.dense[denseIdx] = index;
    }
    
    this.generations[denseIdx] = generation;

    // Deep clone pour éviter les mutations externes
    this.data[denseIdx] = this.clone( data );
  }

  remove( entity: Entity ): boolean {
    const index = getIndex( entity );
    const denseIdx = this.sparse[index];

    if ( denseIdx === INVALID_INDEX ) return false;

    const lastIdx = --this.count;

    if ( denseIdx !== lastIdx ) {
      const lastEntityIndex = this.dense[lastIdx];
      this.dense[denseIdx] = lastEntityIndex;
      this.generations[denseIdx] = this.generations[lastIdx];
      this.sparse[lastEntityIndex] = denseIdx;
      this.data[denseIdx] = this.data[lastIdx];
    }

    this.sparse[index] = INVALID_INDEX;
    this.data[lastIdx] = undefined as any; // GC hint
    return true;
  }

  has( entity: Entity ): boolean {
    const index = getIndex( entity );
    const denseIdx = this.sparse[index];
    if ( denseIdx === INVALID_INDEX ) return false;
    return this.generations[denseIdx] === getGeneration( entity );
  }

  get( entity: Entity ): T | undefined {
    const index = getIndex( entity );
    const denseIdx = this.sparse[index];
    if ( denseIdx === INVALID_INDEX ) return undefined;
    if ( this.generations[denseIdx] !== getGeneration( entity ) ) return undefined;
    return this.data[denseIdx];
  }

  // Pour AoS, getUnsafe retourne la référence directe (mutable)
  // ⚠️ Ne vérifie PAS la generation pour des raisons de performance
  getUnsafe( entity: Entity ): T {
    const denseIdx = this.sparse[getIndex( entity )];
    return this.data[denseIdx];
  }

  getField<K extends keyof T>( entity: Entity, field: K ): T[K] | undefined {
    const component = this.get( entity );
    return component?.[field];
  }

  setField<K extends keyof T>( entity: Entity, field: K, value: T[K] ): void {
    const index = getIndex( entity );
    const denseIdx = this.sparse[index];
    if ( denseIdx === INVALID_INDEX ) return;
    if ( this.generations[denseIdx] !== getGeneration( entity ) ) return;
    this.data[denseIdx][field] = value;
  }

  forEach( fn: ( entity: Entity, component: T ) => void ): void {
    for ( let i = 0; i < this.count; i++ ) {
      const entity = createEntity( this.dense[i], this.generations[i] );
      fn( entity, this.data[i] );
    }
  }

  forEachEntity( fn: ( entity: Entity ) => void ): void {
    for ( let i = 0; i < this.count; i++ ) {
      const entity = createEntity( this.dense[i], this.generations[i] );
      fn( entity );
    }
  }

  getCount(): number {
    return this.count;
  }

  getEntities(): readonly Entity[] {
    const result: Entity[] = new Array( this.count );
    for ( let i = 0; i < this.count; i++ ) {
      result[i] = createEntity( this.dense[i], this.generations[i] );
    }
    return result;
  }

  getDenseArray(): readonly Entity[] {
    return this.getEntities();
  }

  clear(): void {
    this.sparse.fill( INVALID_INDEX );
    this.data.length = 0;
    this.count = 0;
  }

  /**
   * Deep clone pour garantir l'immutabilité des données stockées.
   * Utilise structuredClone (disponible dans Bun) pour un clone profond.
   */
  private clone( data: T ): T {
    // structuredClone gère les objets imbriqués, arrays, Maps, Sets, etc.
    // C'est plus lent qu'un shallow clone mais garantit l'isolation
    try {
      return structuredClone( data );
    } catch {
      // Fallback pour les objets non-clonables (fonctions, etc.)
      if ( Array.isArray( data ) ) {
        return [ ...data ] as T;
      }
      return { ...data };
    }
  }
}
```

#### **Optimized Iteration Patterns**

```typescript
// Pattern 1: Itération zero-allocation sur un seul composant
function iteratePositions(store: SoAComponentStore<Position>): void {
  const xArr = store.getRawField("x") as Float32Array;
  const yArr = store.getRawField("y") as Float32Array;
  const dense = store.getRawDense();
  const count = store.getCount();

  for (let i = 0; i < count; i++) {
    // Accès direct aux arrays - ultra rapide, cache-friendly
    const x = xArr[i];
    const y = yArr[i];
    // ... process
  }
}

// Pattern 2: Itération avec modification via getField/setField (RECOMMANDÉ)
function moveEntities( world: World ): void {
  const posStore = world.components.getStore<Position>( "Position" );
  const velStore = world.components.getStore<Velocity>( "Velocity" );

  posStore.forEachEntity( ( entity ) => {
    if ( !velStore.has( entity ) ) return;

    // Utiliser getField/setField pour les modifications (zero allocation, safe)
    const posX = posStore.getField( entity, "x" ) ?? 0;
    const posY = posStore.getField( entity, "y" ) ?? 0;
    const velX = velStore.getField( entity, "x" ) ?? 0;
    const velY = velStore.getField( entity, "y" ) ?? 0;

    posStore.setField( entity, "x", posX + velX );
    posStore.setField( entity, "y", posY + velY );
  } );
}

// Pattern 3: Accès direct aux champs sans proxy
function updateHealth(world: World, entity: Entity, damage: number): void {
  const store = world.components.getStore<Stats>("Stats");

  const currentHp = store.getField(entity, "hp") ?? 0;
  store.setField(entity, "hp", Math.max(0, currentHp - damage));
}
```

#### **Component Registry**

```typescript
class ComponentRegistry {
  private stores = new Map<string, ComponentStore<any>>();
  private schemas = new Map<string, ComponentSchema<any>>();

  register<T>(schema: ComponentSchema<T>): void {
    if (this.schemas.has(schema.name)) {
      throw new Error(`Component ${schema.name} already registered`);
    }

    this.schemas.set(schema.name, schema);

    const store =
      schema.storage === "soa"
        ? new SoAComponentStore(schema, MAX_ENTITIES)
        : new AoSComponentStore(schema, MAX_ENTITIES);

    this.stores.set(schema.name, store);
  }

  getStore<T>(name: string): ComponentStore<T> {
    const store = this.stores.get(name);
    if (!store) throw new Error(`Component ${name} not registered`);
    return store;
  }

  getSchema(name: string): ComponentSchema<any> | undefined {
    return this.schemas.get(name);
  }

  getAllSchemas(): ComponentSchema<any>[] {
    return Array.from(this.schemas.values());
  }
}
```

### 3.3 Query System

Permet d'itérer efficacement sur les entités avec certains composants.

#### **Query DSL**

```typescript
// Query descriptor avec Sets pour lookup O(1)
interface QueryDescriptor {
  readonly with: readonly string[];
  readonly without: readonly string[];
}

// Version immutable pour le cache
interface CompiledQuery {
  readonly withSet: ReadonlySet<string>;
  readonly withoutSet: ReadonlySet<string>;
  readonly withArray: readonly string[];
  readonly withoutArray: readonly string[];
}

function compileDescriptor(descriptor: QueryDescriptor): CompiledQuery {
  return {
    withSet: new Set(descriptor.with),
    withoutSet: new Set(descriptor.without),
    withArray: descriptor.with,
    withoutArray: descriptor.without,
  };
}

// Helper functions type-safe
function query<W extends string[], Wo extends string[] = []>(
  withComponents: W,
  withoutComponents?: Wo,
): QueryDescriptor {
  return {
    with: withComponents,
    without: withoutComponents ?? [],
  };
}
```

#### **Query Implementation**

```typescript
class Query {
  private cached: Entity[] | null = null;
  private dirty = true;
  private readonly compiled: CompiledQuery;

  // Stores pré-résolus pour éviter les lookups répétés
  private withStores: ComponentStore<unknown>[] | null = null;
  private withoutStores: ComponentStore<unknown>[] | null = null;
  private smallestStoreIndex = 0;

  constructor(
    descriptor: QueryDescriptor,
    private readonly registry: ComponentRegistry,
    private readonly entityManager: EntityManager,
  ) {
    this.compiled = compileDescriptor(descriptor);
  }

  // Lazy initialization des stores
  private ensureStoresResolved(): void {
    if (this.withStores !== null) return;

    this.withStores = this.compiled.withArray.map((name) =>
      this.registry.getStore(name),
    );

    this.withoutStores = this.compiled.withoutArray.map((name) =>
      this.registry.getStore(name),
    );

    // Trouver le plus petit store une seule fois
    let minCount = Infinity;
    for (let i = 0; i < this.withStores.length; i++) {
      const count = this.withStores[i].getCount();
      if (count < minCount) {
        minCount = count;
        this.smallestStoreIndex = i;
      }
    }
  }

  execute(): readonly Entity[] {
    if (!this.dirty && this.cached) {
      return this.cached;
    }

    this.ensureStoresResolved();

    const results: Entity[] = [];
    const withStores = this.withStores!;
    const withoutStores = this.withoutStores!;
    const smallestStore = withStores[this.smallestStoreIndex];

    // Itérer sur le plus petit store
    smallestStore.forEachEntity((entity) => {
      if (!this.entityManager.isAlive(entity)) return;

      // Vérifier les WITH components (skip le smallest)
      for (let i = 0; i < withStores.length; i++) {
        if (i === this.smallestStoreIndex) continue;
        if (!withStores[i].has(entity)) return;
      }

      // Vérifier les WITHOUT components
      for (let i = 0; i < withoutStores.length; i++) {
        if (withoutStores[i].has(entity)) return;
      }

      results.push(entity);
    });

    this.cached = results;
    this.dirty = false;

    return results;
  }

  invalidate(): void {
    this.dirty = true;
    this.cached = null;
  }

  // Méthode optimisée sans allocation intermédiaire
  forEach(fn: (entity: Entity) => void): void {
    const entities = this.execute();
    for (let i = 0; i < entities.length; i++) {
      fn(entities[i]);
    }
  }

  // Itération avec accès direct aux composants (zero-allocation)
  forEachWith<T>(
    componentName: string,
    fn: (entity: Entity, component: T) => void,
  ): void {
    const store = this.registry.getStore<T>(componentName);
    const entities = this.execute();

    for (let i = 0; i < entities.length; i++) {
      const entity = entities[i];
      fn(entity, store.getUnsafe(entity));
    }
  }

  getMatchingComponents(): ReadonlySet<string> {
    return this.compiled.withSet;
  }

  getExcludedComponents(): ReadonlySet<string> {
    return this.compiled.withoutSet;
  }
}
```

#### **Query Cache avec invalidation précise**

````typescript
class QueryCache {
  private readonly cache = new Map<string, Query>();
  // Index inversé : componentName → Set<Query> pour invalidation O(1)
  private readonly componentToQueries = new Map<string, Set<Query>>();

  constructor(
    private readonly registry: ComponentRegistry,
    private readonly entityManager: EntityManager
  ) {}

  get(descriptor: QueryDescriptor): Query {
    const key = this.getKey(descriptor);

    let query = this.cache.get(key);
    if (!query) {
      query = new Query(descriptor, this.registry, this.entityManager);
      this.cache.set(key, query);

      // Indexer cette query par ses composants
      this.indexQuery(query, descriptor);
    }

    return query;
  }

  private indexQuery(query: Query, descriptor: QueryDescriptor): void {
    // Index pour WITH components
    for (const componentName of descriptor.with) {
      this.addToIndex(componentName, query);
    }
    // Index pour WITHOUT components (ils affectent aussi la query)
    for (const componentName of descriptor.without) {
      this.addToIndex(componentName, query);
    }
  }

  private addToIndex(componentName: string, query: Query): void {
    let queries = this.componentToQueries.get(componentName);
    if (!queries) {
      queries = new Set();
      this.componentToQueries.set(componentName, queries);
    }
    queries.add(query);
  }

  invalidateAll(): void {
    for (const query of this.cache.values()) {
      query.invalidate();
    }
  }

  // Invalidation précise O(k) où k = nombre de queries affectées
  invalidateByComponent(componentName: string): void {
    const queries = this.componentToQueries.get(componentName);
    if (queries) {
      for (const query of queries) {
        query.invalidate();
      }
    }
  }

  // Invalidation batch pour plusieurs composants
  invalidateByComponents(componentNames: Iterable<string>): void {
    const invalidated = new Set<Query>();

    for (const componentName of componentNames) {
      const queries = this.componentToQueries.get(componentName);
      if (queries) {
        for (const query of queries) {
          if (!invalidated.has(query)) {
            query.invalidate();
            invalidated.add(query);
          }
        }
      }
    }
  }

  private getKey(descriptor: QueryDescriptor): string {
    // Tri pour garantir la même clé peu importe l'ordre
    const withStr = [...descriptor.with].sort().join(',');
    const withoutStr = [...descriptor.without].sort().join(',');
    return `${withStr}|${withoutStr}`;
  }

  clear(): void {
    this.cache.clear();
    this.componentToQueries.clear();
  }

  getStats(): { queryCount: number; indexedComponents: number } {
    return {
      queryCount: this.cache.size,
      indexedComponents: this.componentToQueries.size,
    };
  }
}

### 3.4 System Scheduler

Exécute les systèmes dans l'ordre correct avec gestion des dépendances.

#### **System Definition**

```typescript
enum SystemPhase {
  Init = 'init',              // One-time initialization
  PreUpdate = 'preUpdate',    // Before main update
  Update = 'update',          // Main gameplay logic
  PostUpdate = 'postUpdate',  // After main update
  LateUpdate = 'lateUpdate',  // Rendering, cleanup
}

interface System {
  name: string;
  phase: SystemPhase;
  query?: QueryDescriptor;
  before?: string[];  // Run before these systems
  after?: string[];   // Run after these systems
  enabled: boolean;

  run(world: World): void;
}

// Builder pattern for system definition
class SystemBuilder {
  private system: Partial<System> = {
    enabled: true,
    before: [],
    after: []
  };

  constructor(name: string) {
    this.system.name = name;
  }

  inPhase(phase: SystemPhase) {
    this.system.phase = phase;
    return this;
  }

  withQuery(descriptor: QueryDescriptor) {
    this.system.query = descriptor;
    return this;
  }

  runBefore(...systems: string[]) {
    this.system.before!.push(...systems);
    return this;
  }

  runAfter(...systems: string[]) {
    this.system.after!.push(...systems);
    return this;
  }

  execute(fn: (world: World) => void) {
    this.system.run = fn;
    return this.build();
  }

  build(): System {
    if (!this.system.phase) throw new Error('Phase required');
    if (!this.system.run) throw new Error('Execute function required');
    return this.system as System;
  }
}

function defineSystem(name: string): SystemBuilder {
  return new SystemBuilder(name);
}
````

#### **Topological Sort for Dependencies**

```typescript
class TopologicalSorter {
  static sort(systems: System[]): System[] {
    const graph = new Map<string, Set<string>>();
    const inDegree = new Map<string, number>();

    // Build graph
    for (const system of systems) {
      graph.set(system.name, new Set());
      inDegree.set(system.name, 0);
    }

    for (const system of systems) {
      // "A before B" means A → B edge
      for (const before of system.before || []) {
        if (graph.has(before)) {
          graph.get(system.name)!.add(before);
          inDegree.set(before, inDegree.get(before)! + 1);
        }
      }

      // "A after B" means B → A edge
      for (const after of system.after || []) {
        if (graph.has(after)) {
          graph.get(after)!.add(system.name);
          inDegree.set(system.name, inDegree.get(system.name)! + 1);
        }
      }
    }

    // Kahn's algorithm
    const queue: string[] = [];
    for (const [name, degree] of inDegree.entries()) {
      if (degree === 0) queue.push(name);
    }

    const sorted: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift()!;
      sorted.push(current);

      for (const neighbor of graph.get(current)!) {
        inDegree.set(neighbor, inDegree.get(neighbor)! - 1);
        if (inDegree.get(neighbor) === 0) {
          queue.push(neighbor);
        }
      }
    }

    if (sorted.length !== systems.length) {
      throw new Error("Circular dependency detected in systems");
    }

    // Map back to systems
    const systemMap = new Map(systems.map((s) => [s.name, s]));
    return sorted.map((name) => systemMap.get(name)!);
  }
}
```

#### **System Scheduler**

```typescript
class SystemScheduler {
  private systemsByPhase = new Map<SystemPhase, System[]>();
  private allSystems: System[] = [];

  register(system: System): void {
    this.allSystems.push(system);

    if (!this.systemsByPhase.has(system.phase)) {
      this.systemsByPhase.set(system.phase, []);
    }

    this.systemsByPhase.get(system.phase)!.push(system);
  }

  registerBatch(systems: System[]): void {
    for (const system of systems) {
      this.register(system);
    }
  }

  compile(): void {
    // Sort systems in each phase by dependencies
    for (const [phase, systems] of this.systemsByPhase.entries()) {
      const sorted = TopologicalSorter.sort(systems);
      this.systemsByPhase.set(phase, sorted);
    }
  }

  runPhase(phase: SystemPhase, world: World): void {
    const systems = this.systemsByPhase.get(phase);
    if (!systems) return;

    for (const system of systems) {
      if (!system.enabled) continue;

      try {
        system.run(world);
      } catch (error) {
        console.error(`Error in system ${system.name}:`, error);
        throw error;
      }
    }
  }

  runAll(world: World): void {
    const phases = [
      SystemPhase.PreUpdate,
      SystemPhase.Update,
      SystemPhase.PostUpdate,
      SystemPhase.LateUpdate,
    ];

    for (const phase of phases) {
      this.runPhase(phase, world);
    }
  }

  getSystem(name: string): System | undefined {
    return this.allSystems.find((s) => s.name === name);
  }

  enableSystem(name: string): void {
    const system = this.getSystem(name);
    if (system) system.enabled = true;
  }

  disableSystem(name: string): void {
    const system = this.getSystem(name);
    if (system) system.enabled = false;
  }
}
```

### 3.5 Resources

Shared state accessible to all systems.

```typescript
class ResourceRegistry {
  private resources = new Map<string, any>();

  register<T>(name: string, resource: T): void {
    if (this.resources.has(name)) {
      throw new Error(`Resource ${name} already registered`);
    }
    this.resources.set(name, resource);
  }

  get<T>(name: string): T {
    const resource = this.resources.get(name);
    if (!resource) {
      throw new Error(`Resource ${name} not found`);
    }
    return resource as T;
  }

  has(name: string): boolean {
    return this.resources.has(name);
  }

  remove(name: string): void {
    this.resources.delete(name);
  }

  clear(): void {
    this.resources.clear();
  }
}

// Type-safe resource access
type Resources = {
  grid: Grid;
  spatialIndex: SpatialIndex;
  rng: SeededRandom;
  turnCounter: TurnCounter;
  eventQueue: EventQueue;
  deltaTime: number;
  currentTick: number;
};

class TypedResourceRegistry {
  private registry = new ResourceRegistry();

  register<K extends keyof Resources>(name: K, resource: Resources[K]): void {
    this.registry.register(name, resource);
  }

  get<K extends keyof Resources>(name: K): Resources[K] {
    return this.registry.get(name);
  }
}
```

### 3.6 Command Buffer

Deferred operations pour éviter mutation pendant iteration.

```typescript
enum CommandType {
  SpawnEntity,
  DespawnEntity,
  AddComponent,
  RemoveComponent,
  SetComponent,
}

// Identifiant unique pour les entités en attente de création
// Utilise un Symbol pour garantir l'unicité et éviter les collisions
type PendingEntityId = symbol;

interface Command {
  type: CommandType;
  entity?: Entity;
  pendingId?: PendingEntityId; // Pour les spawn en attente
  componentName?: string;
  componentData?: any;
}

class CommandBuffer {
  private commands: Command[] = [];
  // Map des pending IDs vers les futures vraies entités
  private pendingEntities = new Map<PendingEntityId, Entity | null>();

  /**
   * Crée une entité différée. Retourne un Symbol unique qui sera
   * résolu en vraie Entity lors du flush().
   * 
   * Pour référencer cette entité dans d'autres commandes avant le flush,
   * utilisez addComponentToPending() au lieu de addComponent().
   */
  spawn(): PendingEntityId {
    const pendingId = Symbol( "pending-entity" );
    this.pendingEntities.set( pendingId, null );
    this.commands.push( {
      type: CommandType.SpawnEntity,
      pendingId,
    } );
    return pendingId;
  }

  /**
   * Version type-safe de spawn qui retourne une Entity.
   * ATTENTION: L'Entity retournée n'est valide qu'APRÈS le flush().
   * Ne pas l'utiliser avant le flush!
   */
  spawnDeferred(): Entity {
    const pendingId = this.spawn();
    // Retourne NULL_ENTITY comme placeholder temporaire
    // L'appelant DOIT utiliser les versions pending des méthodes
    return NULL_ENTITY;
  }

  despawn( entity: Entity ): void {
    this.commands.push( {
      type: CommandType.DespawnEntity,
      entity,
    } );
  }

  addComponent<T>( entity: Entity, componentName: string, data: T ): void {
    this.commands.push( {
      type: CommandType.AddComponent,
      entity,
      componentName,
      componentData: data,
    } );
  }

  /**
   * Ajoute un composant à une entité en attente de création.
   */
  addComponentToPending<T>(
    pendingId: PendingEntityId,
    componentName: string,
    data: T
  ): void {
    this.commands.push( {
      type: CommandType.AddComponent,
      pendingId,
      componentName,
      componentData: data,
    } );
  }

  removeComponent( entity: Entity, componentName: string ): void {
    this.commands.push( {
      type: CommandType.RemoveComponent,
      entity,
      componentName,
    } );
  }

  setComponent<T>( entity: Entity, componentName: string, data: T ): void {
    this.commands.push( {
      type: CommandType.SetComponent,
      entity,
      componentName,
      componentData: data,
    } );
  }

  flush( world: World ): Map<PendingEntityId, Entity> {
    // Map pour résoudre les pending IDs vers les vraies entités
    const resolvedEntities = new Map<PendingEntityId, Entity>();

    for ( const command of this.commands ) {
      switch ( command.type ) {
        case CommandType.SpawnEntity: {
          const realEntity = world.entities.spawn();
          resolvedEntities.set( command.pendingId!, realEntity );
          this.pendingEntities.set( command.pendingId!, realEntity );
          break;
        }

        case CommandType.DespawnEntity: {
          world.entities.despawn( command.entity! );
          break;
        }

        case CommandType.AddComponent: {
          // Résoudre l'entité (soit directe, soit pending)
          const entity = command.entity ?? 
            resolvedEntities.get( command.pendingId! );
          
          if ( !entity ) {
            console.error( "[CommandBuffer] Cannot resolve entity for AddComponent" );
            continue;
          }

          const store = world.components.getStore( command.componentName! );
          store.add( entity, command.componentData );
          world.queryCache.invalidateByComponent( command.componentName! );
          break;
        }

        case CommandType.RemoveComponent: {
          const store = world.components.getStore( command.componentName! );
          store.remove( command.entity! );
          world.queryCache.invalidateByComponent( command.componentName! );
          break;
        }

        case CommandType.SetComponent: {
          const store = world.components.getStore( command.componentName! );
          store.add( command.entity!, command.componentData );
          break;
        }
      }
    }

    this.commands.length = 0;
    this.pendingEntities.clear();

    return resolvedEntities;
  }

  clear(): void {
    this.commands.length = 0;
    this.pendingEntities.clear();
  }

  getCommandCount(): number {
    return this.commands.length;
  }
}
```

### 3.7 World

Conteneur principal qui regroupe tous les modules.

```typescript
class World {
  public entities: EntityManager;
  public components: ComponentRegistry;
  public systems: SystemScheduler;
  public resources: TypedResourceRegistry;
  public queryCache: QueryCache;
  public commands: CommandBuffer;

  constructor() {
    this.entities = new EntityManagerImpl();
    this.components = new ComponentRegistry();
    this.queryCache = new QueryCache(this.components, this.entities);
    this.systems = new SystemScheduler();
    this.resources = new TypedResourceRegistry();
    this.commands = new CommandBuffer();
  }

  // Convenience methods
  spawn(): Entity {
    return this.entities.spawn();
  }

  despawn(entity: Entity): void {
    // Remove all components
    for (const schema of this.components.getAllSchemas()) {
      const store = this.components.getStore(schema.name);
      if (store.has(entity)) {
        store.remove(entity);
      }
    }

    this.entities.despawn(entity);
    this.queryCache.invalidateAll();
  }

  addComponent<T>(entity: Entity, componentName: string, data: T): void {
    const store = this.components.getStore<T>(componentName);
    store.add(entity, data);
    this.queryCache.invalidateComponentChanges(componentName);
  }

  removeComponent(entity: Entity, componentName: string): void {
    const store = this.components.getStore(componentName);
    store.remove(entity);
    this.queryCache.invalidateComponentChanges(componentName);
  }

  getComponent<T>(entity: Entity, componentName: string): T | undefined {
    return this.components.getStore<T>(componentName).get(entity);
  }

  hasComponent(entity: Entity, componentName: string): boolean {
    return this.components.getStore(componentName).has(entity);
  }

  query(descriptor: QueryDescriptor): Query {
    return this.queryCache.get(descriptor);
  }

  tick(): void {
    // 1. Run all systems
    this.systems.runAll(this);

    // 2. Flush command buffer
    this.commands.flush(this);
  }

  reset(): void {
    this.entities = new EntityManagerImpl();
    this.queryCache.invalidateAll();
    this.commands.clear();
  }
}
```

---

## 4. Advanced Features

### 4.1 Serialization System

Permet de save/load l'état complet du monde.

#### **Strategy: Delta Compression**

```typescript
// Entity Template = "blueprint" d'une entité
interface EntityTemplate {
  id: string; // "orc", "player", "potion_health"
  components: Record<string, any>; // Default values
}

// Runtime Entity = template + delta
interface SerializedEntity {
  entity: Entity;
  template: string;
  delta: Record<string, any>; // Only changed values
}

// World Snapshot
interface WorldSnapshot {
  version: string;
  timestamp: number;
  entities: SerializedEntity[];
  resources: Record<string, any>;
}
```

#### **Template Registry**

```typescript
class EntityTemplateRegistry {
  private templates = new Map<string, EntityTemplate>();

  register(template: EntityTemplate): void {
    this.templates.set(template.id, template);
  }

  get(id: string): EntityTemplate | undefined {
    return this.templates.get(id);
  }

  instantiate(
    world: World,
    templateId: string,
    overrides?: Record<string, any>,
  ): Entity {
    const template = this.get(templateId);
    if (!template) throw new Error(`Template ${templateId} not found`);

    const entity = world.spawn();

    // Add all template components
    for (const [componentName, defaultData] of Object.entries(
      template.components,
    )) {
      const data = overrides?.[componentName]
        ? { ...defaultData, ...overrides[componentName] }
        : defaultData;

      world.addComponent(entity, componentName, data);
    }

    return entity;
  }
}
```

#### **Serializer**

```typescript
class WorldSerializer {
  constructor(private templateRegistry: EntityTemplateRegistry) {}

  serialize(world: World): WorldSnapshot {
    const entities: SerializedEntity[] = [];

    for (const entity of world.entities.getAllAlive()) {
      const serialized = this.serializeEntity(world, entity);
      if (serialized) entities.push(serialized);
    }

    const resources: Record<string, any> = {};
    // Serialize specific resources (not all)
    resources.turnCounter = world.resources.get("turnCounter");
    resources.currentTick = world.resources.get("currentTick");

    return {
      version: "1.0",
      timestamp: Date.now(),
      entities,
      resources,
    };
  }

  private serializeEntity(
    world: World,
    entity: Entity,
  ): SerializedEntity | null {
    // Find which template this entity matches
    const template = this.findMatchingTemplate(world, entity);

    if (!template) {
      // No template, serialize all components
      return {
        entity,
        template: "__custom__",
        delta: this.serializeAllComponents(world, entity),
      };
    }

    // Serialize only deltas from template
    const delta: Record<string, any> = {};

    for (const [componentName, templateData] of Object.entries(
      template.components,
    )) {
      const currentData = world.getComponent(entity, componentName);

      if (!currentData) continue;

      const diff = this.computeDelta(templateData, currentData);
      if (Object.keys(diff).length > 0) {
        delta[componentName] = diff;
      }
    }

    // Check for extra components not in template
    for (const schema of world.components.getAllSchemas()) {
      if (
        !template.components[schema.name] &&
        world.hasComponent(entity, schema.name)
      ) {
        delta[schema.name] = world.getComponent(entity, schema.name);
      }
    }

    return {
      entity,
      template: template.id,
      delta,
    };
  }

  private computeDelta(template: any, current: any): any {
    const delta: any = {};

    for (const key in current) {
      if (template[key] !== current[key]) {
        delta[key] = current[key];
      }
    }

    return delta;
  }

  private serializeAllComponents(
    world: World,
    entity: Entity,
  ): Record<string, any> {
    const components: Record<string, any> = {};

    for (const schema of world.components.getAllSchemas()) {
      const data = world.getComponent(entity, schema.name);
      if (data) {
        components[schema.name] = data;
      }
    }

    return components;
  }

  private findMatchingTemplate(
    world: World,
    entity: Entity,
  ): EntityTemplate | undefined {
    // Heuristic: check if entity has a "TemplateId" component
    const templateId = world.getComponent<{ id: string }>(entity, "TemplateId");
    if (templateId) {
      return this.templateRegistry.get(templateId.id);
    }

    // Otherwise, try to match by components
    // (expensive, only use if needed)
    return undefined;
  }

  deserialize(world: World, snapshot: WorldSnapshot): void {
    // Clear world
    world.reset();

    // Restore entities
    for (const serialized of snapshot.entities) {
      if (serialized.template === "__custom__") {
        // Custom entity, restore all components
        const entity = world.spawn();
        for (const [componentName, data] of Object.entries(serialized.delta)) {
          world.addComponent(entity, componentName, data);
        }
      } else {
        // Template-based entity
        const entity = this.templateRegistry.instantiate(
          world,
          serialized.template,
          serialized.delta,
        );
      }
    }

    // Restore resources
    for (const [name, data] of Object.entries(snapshot.resources)) {
      world.resources.register(name as any, data);
    }
  }

  // Save to file
  async save(world: World, filepath: string): Promise<void> {
    const snapshot = this.serialize(world);
    const json = JSON.stringify(snapshot, null, 2);
    await Bun.write(filepath, json);
  }

  // Load from file
  async load(world: World, filepath: string): Promise<void> {
    const file = Bun.file(filepath);
    const json = await file.text();
    const snapshot = JSON.parse(json) as WorldSnapshot;
    this.deserialize(world, snapshot);
  }
}
```

### 4.2 Hierarchical Entities

Système parent/child pour inventory, equipment, etc.

#### **Parent Component**

```typescript
// Component definition
// Parent component - référence vers le parent
const ParentSchema = ComponentSchema.define<{ parent: Entity }>("Parent")
  .field("parent", ComponentType.U32, 0)
  .build();

// Children component - Set pour O(1) add/remove/has
// Note: On utilise un Set<number> car Entity est un branded number
const ChildrenSchema = ComponentSchema.define<{ children: Set<Entity> }>(
  "Children",
)
  .field("children", ComponentType.Object, () => new Set<Entity>())
  .useAoS()
  .build();

// Depth component - pour l'ordre de traversée (optionnel mais utile)
const HierarchyDepthSchema = ComponentSchema.define<{ depth: number }>(
  "HierarchyDepth",
)
  .field("depth", ComponentType.U16, 0)
  .build();
```

#### **Hierarchy Manager**

```typescript
// Résultat d'opération pour meilleure gestion d'erreurs
type HierarchyResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: HierarchyError };

type HierarchyError =
  | "ENTITY_NOT_ALIVE"
  | "CYCLE_DETECTED"
  | "SELF_PARENT"
  | "MAX_DEPTH_EXCEEDED";

const MAX_HIERARCHY_DEPTH = 32;

/**
 * Gestionnaire de hiérarchie parent/enfant.
 * 
 * IMPORTANT: Cette classe doit être instanciée UNE SEULE FOIS et enregistrée
 * comme ressource dans le World pour bénéficier du cache.
 * 
 * @example
 * // Initialisation (une seule fois)
 * const hierarchy = new HierarchyManager( world );
 * world.resources.register( "hierarchy", hierarchy );
 * 
 * // Utilisation dans les systèmes
 * const hierarchy = world.resources.get<HierarchyManager>( "hierarchy" );
 */
class HierarchyManager {
  // Cache pour éviter les allocations répétées
  private readonly emptyChildren: ReadonlySet<Entity> = new Set();
  private readonly ancestorCache = new Map<Entity, Entity[]>();
  private cacheVersion = 0;

  constructor( private readonly world: World ) {}

  /**
   * Définit le parent d'une entité.
   * Retourne un Result pour gérer les cas d'erreur (cycles, entités mortes, etc.)
   */
  setParent(child: Entity, parent: Entity | null): HierarchyResult<void> {
    // Validation des entités
    if (!this.world.entities.isAlive(child)) {
      return { ok: false, error: "ENTITY_NOT_ALIVE" };
    }

    if (parent !== null) {
      if (!this.world.entities.isAlive(parent)) {
        return { ok: false, error: "ENTITY_NOT_ALIVE" };
      }

      if (child === parent) {
        return { ok: false, error: "SELF_PARENT" };
      }

      // Vérification de cycle : parent ne doit pas être un descendant de child
      if (this.isDescendantOf(parent, child)) {
        return { ok: false, error: "CYCLE_DETECTED" };
      }

      // Vérification de profondeur max
      const parentDepth = this.getDepth(parent);
      if (parentDepth >= MAX_HIERARCHY_DEPTH - 1) {
        return { ok: false, error: "MAX_DEPTH_EXCEEDED" };
      }
    }

    // Retirer de l'ancien parent
    const oldParent = this.getParent(child);
    if (oldParent !== null) {
      this.removeChildInternal(oldParent, child);
    }

    // Invalider le cache
    this.invalidateCache();

    if (parent === null) {
      this.world.removeComponent(child, "Parent");
      this.world.removeComponent(child, "HierarchyDepth");
    } else {
      this.world.addComponent(child, "Parent", { parent });
      this.addChildInternal(parent, child);

      // Mettre à jour la profondeur
      const newDepth = this.getDepth(parent) + 1;
      this.world.addComponent(child, "HierarchyDepth", { depth: newDepth });

      // Propager la profondeur aux descendants
      this.updateDescendantDepths(child, newDepth);
    }

    return { ok: true, value: undefined };
  }

  private addChildInternal(parent: Entity, child: Entity): void {
    let childrenComp = this.world.getComponent<{ children: Set<Entity> }>(
      parent,
      "Children",
    );

    if (!childrenComp) {
      const newSet = new Set<Entity>();
      this.world.addComponent(parent, "Children", { children: newSet });
      childrenComp = this.world.getComponent<{ children: Set<Entity> }>(
        parent,
        "Children",
      )!;
    }

    childrenComp.children.add(child);
  }

  private removeChildInternal(parent: Entity, child: Entity): void {
    const childrenComp = this.world.getComponent<{ children: Set<Entity> }>(
      parent,
      "Children",
    );

    if (childrenComp) {
      childrenComp.children.delete(child);

      // Optionnel : nettoyer le composant si vide
      if (childrenComp.children.size === 0) {
        this.world.removeComponent(parent, "Children");
      }
    }
  }

  private updateDescendantDepths(entity: Entity, parentDepth: number): void {
    const children = this.getChildrenInternal(entity);
    const newDepth = parentDepth + 1;

    for (const child of children) {
      this.world.addComponent(child, "HierarchyDepth", { depth: newDepth });
      this.updateDescendantDepths(child, newDepth);
    }
  }

  getParent(entity: Entity): Entity | null {
    const parent = this.world.getComponent<{ parent: Entity }>(
      entity,
      "Parent",
    );
    if (!parent) return null;

    // Vérifier que le parent est toujours vivant
    if (!this.world.entities.isAlive(parent.parent)) {
      // Auto-cleanup : le parent est mort, nettoyer la relation
      this.world.removeComponent(entity, "Parent");
      return null;
    }

    return parent.parent;
  }

  /**
   * Retourne les enfants en lecture seule.
   * Le Set retourné ne doit PAS être modifié.
   */
  getChildren(entity: Entity): ReadonlySet<Entity> {
    return this.getChildrenInternal(entity);
  }

  private getChildrenInternal(entity: Entity): Set<Entity> {
    const childrenComp = this.world.getComponent<{ children: Set<Entity> }>(
      entity,
      "Children",
    );
    return childrenComp?.children ?? (this.emptyChildren as Set<Entity>);
  }

  /**
   * Retourne une copie du Set pour modification safe
   */
  getChildrenMutable(entity: Entity): Set<Entity> {
    return new Set(this.getChildrenInternal(entity));
  }

  getChildCount(entity: Entity): number {
    return this.getChildrenInternal(entity).size;
  }

  hasChildren(entity: Entity): boolean {
    return this.getChildCount(entity) > 0;
  }

  isDescendantOf(entity: Entity, potentialAncestor: Entity): boolean {
    let current = this.getParent(entity);

    while (current !== null) {
      if (current === potentialAncestor) return true;
      current = this.getParent(current);
    }

    return false;
  }

  getDepth(entity: Entity): number {
    const depth = this.world.getComponent<{ depth: number }>(
      entity,
      "HierarchyDepth",
    );
    return depth?.depth ?? 0;
  }

  getRoot(entity: Entity): Entity {
    let current = entity;
    let parent = this.getParent(current);

    while (parent !== null) {
      current = parent;
      parent = this.getParent(current);
    }

    return current;
  }

  /**
   * Retourne les ancêtres du plus proche au plus éloigné.
   * Utilise un cache pour les requêtes répétées.
   */
  getAncestors(entity: Entity): readonly Entity[] {
    // Check cache
    const cached = this.ancestorCache.get(entity);
    if (cached) return cached;

    const ancestors: Entity[] = [];
    let current = this.getParent(entity);

    while (current !== null) {
      ancestors.push(current);
      current = this.getParent(current);
    }

    // Cache result
    this.ancestorCache.set(entity, ancestors);
    return ancestors;
  }

  /**
   * Retourne tous les descendants (BFS order).
   */
  getDescendants(entity: Entity): Entity[] {
    const descendants: Entity[] = [];
    const queue: Entity[] = [entity];

    while (queue.length > 0) {
      const current = queue.shift()!;

      for (const child of this.getChildrenInternal(current)) {
        descendants.push(child);
        queue.push(child);
      }
    }

    return descendants;
  }

  /**
   * Itère sur les descendants sans allocation (callback pattern).
   */
  forEachDescendant(
    entity: Entity,
    fn: (descendant: Entity, depth: number) => void,
  ): void {
    const visit = (e: Entity, depth: number): void => {
      for (const child of this.getChildrenInternal(e)) {
        fn(child, depth);
        visit(child, depth + 1);
      }
    };

    visit(entity, 1);
  }

  /**
   * Supprime une entité et tous ses descendants.
   */
  despawnRecursive(entity: Entity): void {
    // Collecter tous les descendants d'abord (pour éviter mutation pendant itération)
    const toDelete = this.getDescendants(entity);
    toDelete.push(entity);

    // Supprimer du parent si applicable
    const parent = this.getParent(entity);
    if (parent !== null) {
      this.removeChildInternal(parent, entity);
    }

    // Supprimer en ordre inverse (enfants d'abord)
    for (let i = toDelete.length - 1; i >= 0; i--) {
      this.world.despawn(toDelete[i]);
    }

    this.invalidateCache();
  }

  private invalidateCache(): void {
    this.cacheVersion++;
    this.ancestorCache.clear();
  }

  /**
   * Reparent tous les enfants d'une entité vers un nouveau parent.
   */
  reparentChildren(from: Entity, to: Entity | null): void {
    const children = this.getChildrenMutable(from);

    for (const child of children) {
      this.setParent(child, to);
    }
  }
}
```

#### **Use Case: Inventory System**

```typescript
// Components
const InventorySchema = ComponentSchema.define("Inventory")
  .field("capacity", ComponentType.U32, 10)
  .useAoS()
  .build();

const ItemSchema = ComponentSchema.define("Item")
  .field("stackable", ComponentType.U8, 0)
  .field("count", ComponentType.U32, 1)
  .useAoS()
  .build();

// System
const InventorySystem = defineSystem( "InventorySystem" )
  .inPhase( SystemPhase.Update )
  .execute( ( world: World ) => {
    // Utiliser l'instance partagée depuis les resources
    const hierarchy = world.resources.get<HierarchyManager>( "hierarchy" );

    // Process pickup requests
    const pickupQuery = world.query({
      with: ["PickupRequest", "Position"],
      without: [],
    });

    for (const entity of pickupQuery.execute()) {
      const request = world.getComponent<{ target: Entity }>(
        entity,
        "PickupRequest",
      );
      const item = request!.target;

      // Get player's inventory
      const children = hierarchy.getChildren(entity);
      const inventorySize = children.length;
      const inventory = world.getComponent<{ capacity: number }>(
        entity,
        "Inventory",
      );

      if (inventorySize < inventory!.capacity) {
        // Add item to inventory (set parent)
        hierarchy.setParent(item, entity);

        // Remove from world position
        world.removeComponent(item, "Position");

        console.log(`Picked up item ${item}`);
      } else {
        console.log("Inventory full!");
      }

      // Remove request
      world.removeComponent(entity, "PickupRequest");
    }
  });
```

### 4.3 Hot Reload

Permet de recharger les systèmes sans perdre l'état.

> **Note**: Cette implémentation est compatible avec Bun ESM. Elle utilise
> le cache-busting via query string pour forcer le rechargement des modules.

#### **System Hot Reload**

```typescript
import { watch, type WatchEventType } from "fs";
import { resolve } from "path";

class HotReloadManager {
  private systemModules = new Map<string, string>(); // name → filepath
  private watchers = new Map<string, ReturnType<typeof watch>>();
  private reloadTimers = new Map<string, Timer>(); // Debounce

  constructor( private world: World ) {}

  async registerSystem( name: string, filepath: string ): Promise<void> {
    const absolutePath = resolve( filepath );
    this.systemModules.set( name, absolutePath );

    // Load initial system
    await this.loadSystem( name, absolutePath );

    // Watch for changes (dev mode only)
    if ( process.env.NODE_ENV === "development" ) {
      this.setupWatcher( name, absolutePath );
    }
  }

  private setupWatcher( name: string, filepath: string ): void {
    // Utiliser fs.watch (compatible Bun)
    const watcher = watch( filepath, ( eventType: WatchEventType ) => {
      if ( eventType === "change" ) {
        // Debounce pour éviter les reloads multiples
        const existingTimer = this.reloadTimers.get( name );
        if ( existingTimer ) clearTimeout( existingTimer );

        const timer = setTimeout( async () => {
          console.log( `[HotReload] Reloading system: ${name}` );
          await this.reloadSystem( name, filepath );
          this.reloadTimers.delete( name );
        }, 100 );

        this.reloadTimers.set( name, timer );
      }
    } );

    this.watchers.set( name, watcher );
  }

  private async loadSystem( name: string, filepath: string ): Promise<void> {
    // Import system module avec cache-busting
    const module = await import( `${filepath}?t=${Date.now()}` );
    const system = module.default as System;

    if ( !system || typeof system.run !== "function" ) {
      throw new Error( `Module ${filepath} does not export a valid System` );
    }

    // Register in scheduler
    this.world.systems.register( system );
  }

  private async reloadSystem( name: string, filepath: string ): Promise<void> {
    try {
      // 1. Désactiver l'ancien système
      const oldSystem = this.world.systems.getSystem( name );
      if ( oldSystem ) {
        oldSystem.enabled = false;
      }

      // 2. Re-import avec cache-busting (pas de require.cache en ESM/Bun)
      // Le query string force Bun/Node à recharger le module
      const module = await import( `${filepath}?t=${Date.now()}` );
      const newSystem = module.default as System;

      if ( !newSystem || typeof newSystem.run !== "function" ) {
        throw new Error( `Reloaded module does not export a valid System` );
      }

      // 3. Remplacer le système
      this.world.systems.register( newSystem );
      this.world.systems.compile();

      console.log( `[HotReload] System ${name} reloaded successfully` );
    } catch ( error ) {
      console.error( `[HotReload] Failed to reload system ${name}:`, error );
      // Réactiver l'ancien système en cas d'erreur
      const oldSystem = this.world.systems.getSystem( name );
      if ( oldSystem ) {
        oldSystem.enabled = true;
      }
    }
  }

  dispose(): void {
    for ( const watcher of this.watchers.values() ) {
      watcher.close();
    }
    this.watchers.clear();

    for ( const timer of this.reloadTimers.values() ) {
      clearTimeout( timer );
    }
    this.reloadTimers.clear();
  }
}
```

### 4.4 Event System

Permet la communication entre systèmes via events avec typage fort.

```typescript
// ============================================================================
// Event Types - Discriminated Union pour type-safety complète
// ============================================================================

// Base event avec timestamp
interface BaseEvent {
  timestamp: number;
}

// Définition de tous les types d'événements du jeu
type GameEvent =
  | { type: "entity.spawned"; entity: Entity; templateId?: string }
  | { type: "entity.despawned"; entity: Entity }
  | { type: "component.added"; entity: Entity; componentName: string }
  | { type: "component.removed"; entity: Entity; componentName: string }
  | { type: "player.moved"; entity: Entity; fromX: number; fromY: number; toX: number; toY: number }
  | { type: "enemy.died"; entity: Entity; killer?: Entity }
  | { type: "combat.damage"; attacker: Entity; target: Entity; damage: number; isCritical?: boolean }
  | { type: "item.picked_up"; picker: Entity; item: Entity; itemType: string }
  | { type: "item.dropped"; dropper: Entity; item: Entity; x: number; y: number }
  | { type: "item.used"; user: Entity; item: Entity; effect: string }
  | { type: "door.opened"; entity: Entity; door: Entity }
  | { type: "door.closed"; entity: Entity; door: Entity }
  | { type: "level.changed"; level: number; previousLevel: number }
  | { type: "turn.started"; entity: Entity; tick: number }
  | { type: "turn.ended"; entity: Entity; tick: number }
  | { type: "turn.action"; entity: Entity; action: unknown; tick: number }
  | { type: "terrain.changed"; x: number; y: number; oldType: number; newType: number }
  | { type: "fov.updated"; entity: Entity; visibleCount: number };

// Event avec timestamp
type TimestampedEvent = GameEvent & BaseEvent;

// Extract event data type from event type string
type EventData<T extends GameEvent["type"]> = Extract<GameEvent, { type: T }>;

// ============================================================================
// Type-Safe Event Queue
// ============================================================================

class EventQueue {
  private queue: TimestampedEvent[] = [];
  private handlers = new Map<string, Set<( event: TimestampedEvent ) => void>>();

  /**
   * Émet un événement typé.
   * 
   * @example
   * events.emit( "combat.damage", { attacker, target, damage: 10 } );
   */
  emit<T extends GameEvent["type"]>(
    type: T,
    data: Omit<EventData<T>, "type">
  ): void {
    const event = {
      type,
      ...data,
      timestamp: Date.now(),
    } as TimestampedEvent;

    this.queue.push( event );
  }

  /**
   * S'abonne à un type d'événement spécifique avec typage complet.
   * 
   * @example
   * events.on( "combat.damage", ( e ) => {
   *   console.log( `${e.attacker} dealt ${e.damage} to ${e.target}` );
   * } );
   */
  on<T extends GameEvent["type"]>(
    type: T,
    handler: ( event: EventData<T> & BaseEvent ) => void
  ): void {
    if ( !this.handlers.has( type ) ) {
      this.handlers.set( type, new Set() );
    }
    this.handlers.get( type )!.add( handler as any );
  }

  /**
   * Se désabonne d'un type d'événement.
   */
  off<T extends GameEvent["type"]>(
    type: T,
    handler: ( event: EventData<T> & BaseEvent ) => void
  ): void {
    const handlers = this.handlers.get( type );
    if ( handlers ) {
      handlers.delete( handler as any );
    }
  }

  /**
   * S'abonne à tous les événements (pour logging, debug, etc.).
   */
  onAny( handler: ( event: TimestampedEvent ) => void ): void {
    // Utiliser un type spécial pour les handlers globaux
    if ( !this.handlers.has( "*" ) ) {
      this.handlers.set( "*", new Set() );
    }
    this.handlers.get( "*" )!.add( handler );
  }

  /**
   * Traite tous les événements en attente.
   */
  process(): void {
    const events = [ ...this.queue ];
    this.queue.length = 0;

    for ( const event of events ) {
      // Handlers spécifiques au type
      const typeHandlers = this.handlers.get( event.type );
      if ( typeHandlers ) {
        for ( const handler of typeHandlers ) {
          try {
            handler( event );
          } catch ( error ) {
            console.error( `[EventQueue] Error in handler for "${event.type}":`, error );
          }
        }
      }

      // Handlers globaux (*)
      const globalHandlers = this.handlers.get( "*" );
      if ( globalHandlers ) {
        for ( const handler of globalHandlers ) {
          try {
            handler( event );
          } catch ( error ) {
            console.error( `[EventQueue] Error in global handler:`, error );
          }
        }
      }
    }
  }

  /**
   * Retourne le nombre d'événements en attente.
   */
  getPendingCount(): number {
    return this.queue.length;
  }

  /**
   * Vide la queue sans traiter les événements.
   */
  clear(): void {
    this.queue.length = 0;
  }

  /**
   * Retire tous les handlers.
   */
  removeAllHandlers(): void {
    this.handlers.clear();
  }
}

// ============================================================================
// Usage Examples
// ============================================================================

// Exemple de typage automatique
function setupEventHandlers( events: EventQueue ): void {
  // TypeScript infère automatiquement le type de l'événement
  events.on( "combat.damage", ( e ) => {
    // e.attacker, e.target, e.damage sont typés correctement
    console.log( `Entity ${e.target} took ${e.damage} damage from ${e.attacker}` );
    
    // e.isCritical est optionnel et typé
    if ( e.isCritical ) {
      console.log( "Critical hit!" );
    }
  } );

  events.on( "player.moved", ( e ) => {
    // Tous les champs sont typés: e.entity, e.fromX, e.fromY, e.toX, e.toY
    console.log( `Player moved from (${e.fromX}, ${e.fromY}) to (${e.toX}, ${e.toY})` );
  } );

  // Handler global pour debug
  events.onAny( ( e ) => {
    console.debug( `[Event] ${e.type}`, e );
  } );
}
```

---

## 5. Roguelike-Specific Implementation

### 5.1 Core Components

```typescript
// Position
const PositionSchema = ComponentSchema.define<{
  x: number;
  y: number;
  layer: number;
}>("Position")
  .field("x", ComponentType.F32, 0)
  .field("y", ComponentType.F32, 0)
  .field("layer", ComponentType.U8, 0) // 0=floor, 1=items, 2=creatures
  .build();

// Velocity
const VelocitySchema = ComponentSchema.define<{ x: number; y: number }>(
  "Velocity",
)
  .field("x", ComponentType.F32, 0)
  .field("y", ComponentType.F32, 0)
  .build();

// Renderable
const RenderableSchema = ComponentSchema.define("Renderable")
  .field("sprite", ComponentType.String, "@")
  .field("color", ComponentType.String, "#ffffff")
  .field("zIndex", ComponentType.I32, 0)
  .useAoS()
  .build();

// Stats
const StatsSchema = ComponentSchema.define("Stats")
  .field("hp", ComponentType.I32, 100)
  .field("maxHp", ComponentType.I32, 100)
  .field("attack", ComponentType.I32, 10)
  .field("defense", ComponentType.I32, 5)
  .field("speed", ComponentType.I32, 100)
  .useAoS()
  .build();

// Inventory
const InventorySchema = ComponentSchema.define("Inventory")
  .field("capacity", ComponentType.U32, 10)
  .useAoS()
  .build();

// Equipment
const EquipmentSchema = ComponentSchema.define("Equipment")
  .field("weapon", ComponentType.U32, 0) // Entity ID
  .field("armor", ComponentType.U32, 0)
  .field("accessory", ComponentType.U32, 0)
  .useAoS()
  .build();

// AI
const AISchema = ComponentSchema.define("AI")
  .field("state", ComponentType.String, "idle") // idle, patrol, chase, attack
  .field("target", ComponentType.U32, 0) // Entity ID
  .field("aggression", ComponentType.F32, 0.5)
  .useAoS()
  .build();

// Player tag
const PlayerSchema = ComponentSchema.define("Player").build();

// Item
const ItemSchema = ComponentSchema.define("Item")
  .field("stackable", ComponentType.U8, 0) // boolean
  .field("count", ComponentType.U32, 1)
  .field("itemType", ComponentType.String, "generic")
  .useAoS()
  .build();

// Door
const DoorSchema = ComponentSchema.define("Door")
  .field("open", ComponentType.U8, 0)
  .field("locked", ComponentType.U8, 0)
  .field("keyId", ComponentType.String, "")
  .useAoS()
  .build();

// Interactable
const InteractableSchema = ComponentSchema.define("Interactable")
  .field("interactionType", ComponentType.String, "generic")
  .useAoS()
  .build();

// Turn Energy (for turn-based)
const TurnEnergySchema = ComponentSchema.define("TurnEnergy")
  .field("energy", ComponentType.I32, 0)
  .field("energyPerTurn", ComponentType.I32, 100)
  .build();

// FOV (Field of View)
const FOVSchema = ComponentSchema.define("FOV")
  .field("radius", ComponentType.U32, 10)
  .field("dirty", ComponentType.U8, 1) // needs recalculation
  .useAoS()
  .build();

// Visible Cells (結果のキャッシュ)
const VisibleCellsSchema = ComponentSchema.define("VisibleCells")
  .field("cells", ComponentType.Object, [])
  .useAoS()
  .build();
```

### 5.2 Core Systems

#### **Turn Management System**

Le système de tours utilise un modèle d'énergie pour gérer l'ordre des actions.
Cette implémentation est immutable-friendly et utilise le CommandBuffer pour les mutations.

```typescript
// ============================================================================
// Turn Components
// ============================================================================

const TurnEnergySchema = ComponentSchema.define<{
  energy: number;
  energyPerTurn: number;
  speed: number; // Modificateur de vitesse (100 = normal)
}>("TurnEnergy")
  .field("energy", ComponentType.I32, 0)
  .field("energyPerTurn", ComponentType.I32, 100)
  .field("speed", ComponentType.I32, 100)
  .build();

// Tag pour marquer l'entité active
const ActiveTurnSchema = ComponentSchema.define<{}>("ActiveTurn").build();

// Historique des tours pour replay/debug
const TurnHistorySchema = ComponentSchema.define<{
  actions: TurnAction[];
}>("TurnHistory")
  .useAoS()
  .build();

interface TurnAction {
  tick: number;
  entity: Entity;
  actionType: string;
  data: unknown;
}

// ============================================================================
// Turn State Resource (immutable pattern)
// ============================================================================

interface TurnState {
  readonly currentTick: number;
  readonly activeEntity: Entity | null;
  readonly turnPhase: "waiting" | "acting" | "resolving";
  readonly actionQueue: readonly PendingAction[];
}

interface PendingAction {
  readonly entity: Entity;
  readonly type: string;
  readonly data: unknown;
  readonly priority: number;
}

class TurnStateManager {
  private state: TurnState = {
    currentTick: 0,
    activeEntity: null,
    turnPhase: "waiting",
    actionQueue: [],
  };

  getState(): Readonly<TurnState> {
    return this.state;
  }

  // Immutable updates via new state
  private setState(updates: Partial<TurnState>): void {
    this.state = { ...this.state, ...updates };
  }

  setActiveEntity(entity: Entity | null): void {
    this.setState({
      activeEntity: entity,
      turnPhase: entity ? "acting" : "waiting",
    });
  }

  incrementTick(): void {
    this.setState({ currentTick: this.state.currentTick + 1 });
  }

  setPhase(phase: TurnState["turnPhase"]): void {
    this.setState({ turnPhase: phase });
  }

  queueAction(action: PendingAction): void {
    this.setState({
      actionQueue: [...this.state.actionQueue, action].sort(
        (a, b) => b.priority - a.priority,
      ),
    });
  }

  clearActionQueue(): readonly PendingAction[] {
    const queue = this.state.actionQueue;
    this.setState({ actionQueue: [] });
    return queue;
  }
}

// ============================================================================
// Turn Management System - Immutable avec CommandBuffer
// ============================================================================

const TurnManagementSystem = defineSystem("TurnManagement")
  .inPhase(SystemPhase.PreUpdate)
  .execute((world: World) => {
    const turnState = world.resources.get<TurnStateManager>("turnState");
    const eventQueue = world.resources.get<EventQueue>("eventQueue");
    const state = turnState.getState();

    // Phase 1: Si pas d'entité active, en sélectionner une
    if (state.activeEntity === null || state.turnPhase === "waiting") {
      const nextEntity = selectNextActiveEntity(world);

      if (nextEntity !== null) {
        turnState.setActiveEntity(nextEntity);

        // Marquer l'entité comme active via CommandBuffer
        world.commands.addComponent(nextEntity, "ActiveTurn", {});

        // Émettre l'événement
        eventQueue.emit("turn.started", {
          entity: nextEntity,
          tick: state.currentTick,
        });
      }
      return;
    }

    // Phase 2: Attendre l'action de l'entité active
    if (state.turnPhase === "acting") {
      // L'entité active doit soumettre une action
      // Cela sera géré par l'input system ou l'AI system
      return;
    }

    // Phase 3: Résoudre les actions et passer au tour suivant
    if (state.turnPhase === "resolving") {
      const activeEntity = state.activeEntity!;

      // Consommer l'énergie via CommandBuffer (immutable)
      const energyStore =
        world.components.getStore<TurnEnergyData>("TurnEnergy");
      const currentEnergy = energyStore.getField(activeEntity, "energy") ?? 0;
      const energyPerTurn =
        energyStore.getField(activeEntity, "energyPerTurn") ?? 100;

      world.commands.setComponent(activeEntity, "TurnEnergy", {
        energy: currentEnergy - energyPerTurn,
        energyPerTurn,
        speed: energyStore.getField(activeEntity, "speed") ?? 100,
      });

      // Retirer le tag ActiveTurn
      world.commands.removeComponent(activeEntity, "ActiveTurn");

      // Incrémenter l'énergie de toutes les autres entités
      const query = world.query({
        with: ["TurnEnergy"],
        without: ["ActiveTurn"],
      });

      for (const entity of query.execute()) {
        if (entity === activeEntity) continue;

        const e = energyStore.getField(entity, "energy") ?? 0;
        const ept = energyStore.getField(entity, "energyPerTurn") ?? 100;
        const speed = energyStore.getField(entity, "speed") ?? 100;

        // Bonus/malus de vitesse
        const energyGain = Math.floor((ept * speed) / 100);

        world.commands.setComponent(entity, "TurnEnergy", {
          energy: e + energyGain,
          energyPerTurn: ept,
          speed,
        });
      }

      // Émettre l'événement de fin de tour
      eventQueue.emit("turn.ended", {
        entity: activeEntity,
        tick: state.currentTick,
      });

      // Passer au tick suivant
      turnState.incrementTick();
      turnState.setActiveEntity(null);
    }
  });

/**
 * Sélectionne l'entité avec le plus d'énergie.
 * En cas d'égalité, utilise un ordre déterministe (ID d'entité).
 * 
 * Utilise une approche itérative avec safeguard pour éviter les boucles infinies.
 */
function selectNextActiveEntity( world: World ): Entity | null {
  const query = world.query( { with: ["TurnEnergy"], without: [] } );
  const energyStore = world.components.getStore<TurnEnergyData>( "TurnEnergy" );

  // Safeguard: limite le nombre de fast-forwards pour éviter les boucles infinies
  const MAX_FAST_FORWARD_ITERATIONS = 1000;
  let iterations = 0;

  while ( iterations < MAX_FAST_FORWARD_ITERATIONS ) {
    iterations++;

    let maxEnergy = 0;
    let selectedEntity: Entity | null = null;

    for ( const entity of query.execute() ) {
      const energy = energyStore.getField( entity, "energy" ) ?? 0;

      // >= pour prendre l'entité avec le plus petit ID en cas d'égalité
      if (
        energy > maxEnergy ||
        ( energy === maxEnergy &&
          ( selectedEntity === null || entity < selectedEntity ) )
      ) {
        maxEnergy = energy;
        selectedEntity = entity;
      }
    }

    // Besoin d'au moins 100 énergie pour agir
    if ( maxEnergy >= 100 ) {
      return selectedEntity;
    }

    // Tenter le fast-forward
    const success = fastForwardEnergy( world );
    
    if ( !success ) {
      // Aucune entité ne peut accumuler d'énergie (toutes ont effectiveEpt <= 0)
      // Retourner null pour éviter une boucle infinie
      console.warn( 
        "[TurnSystem] No entity can accumulate energy. " +
        "Check TurnEnergy components (speed/energyPerTurn must be > 0)."
      );
      return null;
    }
  }

  // Safeguard atteint
  console.error(
    `[TurnSystem] Max fast-forward iterations (${MAX_FAST_FORWARD_ITERATIONS}) reached. ` +
    "This may indicate a bug in energy calculations."
  );
  return null;
}

/**
 * Fast-forward l'énergie de toutes les entités jusqu'à ce qu'une puisse agir.
 * 
 * @returns true si le fast-forward a été effectué, false si impossible
 */
function fastForwardEnergy( world: World ): boolean {
  const query = world.query( { with: ["TurnEnergy"], without: [] } );
  const energyStore = world.components.getStore<TurnEnergyData>( "TurnEnergy" );

  // Trouver le minimum d'énergie à ajouter pour qu'une entité atteigne 100
  let minTicksNeeded = Infinity;

  for ( const entity of query.execute() ) {
    const energy = energyStore.getField( entity, "energy" ) ?? 0;
    const ept = energyStore.getField( entity, "energyPerTurn" ) ?? 100;
    const speed = energyStore.getField( entity, "speed" ) ?? 100;
    const effectiveEpt = Math.floor( ( ept * speed ) / 100 );

    if ( effectiveEpt <= 0 ) continue;

    const ticksNeeded = Math.ceil( ( 100 - energy ) / effectiveEpt );
    if ( ticksNeeded > 0 && ticksNeeded < minTicksNeeded ) {
      minTicksNeeded = ticksNeeded;
    }
  }

  // Impossible de fast-forward si aucune entité n'a un effectiveEpt positif
  if ( minTicksNeeded === Infinity || minTicksNeeded <= 0 ) {
    return false;
  }

  // Appliquer le fast-forward
  for ( const entity of query.execute() ) {
    const energy = energyStore.getField( entity, "energy" ) ?? 0;
    const ept = energyStore.getField( entity, "energyPerTurn" ) ?? 100;
    const speed = energyStore.getField( entity, "speed" ) ?? 100;
    const effectiveEpt = Math.floor( ( ept * speed ) / 100 );

    world.commands.setComponent( entity, "TurnEnergy", {
      energy: energy + effectiveEpt * minTicksNeeded,
      energyPerTurn: ept,
      speed,
    } );
  }

  return true;
}

// ============================================================================
// Action Submission System - Pour soumettre une action
// ============================================================================

interface ActionRequest {
  type: "move" | "attack" | "wait" | "use_item" | "interact";
  data?: unknown;
}

function submitAction(
  world: World,
  entity: Entity,
  action: ActionRequest,
): boolean {
  const turnState = world.resources.get<TurnStateManager>("turnState");
  const state = turnState.getState();

  // Vérifier que c'est bien le tour de cette entité
  if (state.activeEntity !== entity || state.turnPhase !== "acting") {
    return false;
  }

  // Émettre l'événement d'action
  const eventQueue = world.resources.get<EventQueue>("eventQueue");
  eventQueue.emit("turn.action", {
    entity,
    action,
    tick: state.currentTick,
  });

  // Passer à la phase de résolution
  turnState.setPhase("resolving");

  return true;
}
```

#### **Movement System**

```typescript
const MovementSystem = defineSystem("Movement")
  .inPhase(SystemPhase.Update)
  .withQuery({ with: ["Position", "Velocity"], without: [] })
  .execute((world: World) => {
    const query = world.query({ with: ["Position", "Velocity"], without: [] });

    for (const entity of query.execute()) {
      const pos = world.getComponent<{ x: number; y: number }>(
        entity,
        "Position",
      );
      const vel = world.getComponent<{ x: number; y: number }>(
        entity,
        "Velocity",
      );

      if (!pos || !vel) continue;

      // Calculate new position
      const newX = pos.x + vel.x;
      const newY = pos.y + vel.y;

      // Update position
      pos.x = newX;
      pos.y = newY;

      // Reset velocity (for turn-based movement)
      vel.x = 0;
      vel.y = 0;

      // Emit event
      const eventQueue = world.resources.get("eventQueue");
      eventQueue.emit(GameEvents.PlayerMoved, { entity, x: newX, y: newY });
    }
  });
```

#### **Collision System**

```typescript
const CollisionSystem = defineSystem("Collision")
  .inPhase(SystemPhase.Update)
  .runBefore("Movement")
  .execute((world: World) => {
    const grid = world.resources.get("grid");
    const query = world.query({ with: ["Position", "Velocity"], without: [] });

    for (const entity of query.execute()) {
      const pos = world.getComponent<{ x: number; y: number }>(
        entity,
        "Position",
      );
      const vel = world.getComponent<{ x: number; y: number }>(
        entity,
        "Velocity",
      );

      if (!pos || !vel) continue;
      if (vel.x === 0 && vel.y === 0) continue;

      const newX = Math.floor(pos.x + vel.x);
      const newY = Math.floor(pos.y + vel.y);

      // Check grid walkability
      if (
        !grid.isInBounds(newX, newY) ||
        grid.getCell(newX, newY) === CellType.WALL
      ) {
        // Blocked, cancel movement
        vel.x = 0;
        vel.y = 0;
        continue;
      }

      // Check entity collision
      const spatialIndex = world.resources.get("spatialIndex");
      const entitiesAtPos = spatialIndex.getEntitiesAt(newX, newY);

      for (const other of entitiesAtPos) {
        if (other === entity) continue;

        // Check if blocking
        const blocking = world.getComponent<{ blocks: boolean }>(
          other,
          "Blocking",
        );
        if (blocking?.blocks) {
          vel.x = 0;
          vel.y = 0;
          break;
        }
      }
    }
  });
```

#### **FOV System (Field of View)**

Le système FOV utilise un cache intelligent pour éviter les recalculs inutiles.

```typescript
// ============================================================================
// FOV Components
// ============================================================================

const FOVSchema = ComponentSchema.define<{
  radius: number;
  algorithm: "shadowcast" | "raycasting" | "diamond";
}>("FOV")
  .field("radius", ComponentType.U8, 10)
  .field("algorithm", ComponentType.String, "shadowcast")
  .useAoS()
  .build();

// Cache des cellules visibles avec métadonnées
const VisibleCellsSchema = ComponentSchema.define<{
  cells: Uint32Array; // Packed avec packCoords() - supporte coordonnées signées 16-bit
  count: number;      // Nombre de cellules valides
  centerX: number;    // Position lors du calcul
  centerY: number;
  radius: number;     // Radius lors du calcul
  version: number;    // Version du cache
}>( "VisibleCells" )
  .useAoS()
  .build();

// ============================================================================
// FOV Calculator - Optimisé avec cache et pooling
// ============================================================================

// Constantes pour le packing des coordonnées
// Utilise 32 bits: 16 bits pour X (signé), 16 bits pour Y (signé)
// Supporte des coordonnées de -32768 à 32767
const COORD_BITS = 16;
const COORD_MASK = ( 1 << COORD_BITS ) - 1; // 0xFFFF
const COORD_OFFSET = 32768; // Pour supporter les coordonnées négatives

function packCoords( x: number, y: number ): number {
  // Ajouter l'offset pour gérer les coordonnées négatives
  const px = ( x + COORD_OFFSET ) & COORD_MASK;
  const py = ( y + COORD_OFFSET ) & COORD_MASK;
  return ( px << COORD_BITS ) | py;
}

function unpackX( packed: number ): number {
  return ( ( packed >>> COORD_BITS ) & COORD_MASK ) - COORD_OFFSET;
}

function unpackY( packed: number ): number {
  return ( packed & COORD_MASK ) - COORD_OFFSET;
}

class FOVCalculator {
  // Pool de résultats pré-alloués pour éviter les allocations
  // Utilise Uint32Array pour supporter de plus grandes coordonnées
  private readonly resultPool: Uint32Array[];
  private poolIndex = 0;

  // Cache par position pour multi-entités au même endroit
  // Clé: BigInt pour supporter x,y,radius sans collision
  private readonly positionCache = new Map<
    bigint,
    { cells: Uint32Array; count: number; version: number }
  >();
  private cacheVersion = 0;

  // Constantes pour shadowcasting
  private static readonly OCTANT_TRANSFORMS = [
    [1, 0, 0, 1], // Octant 0
    [0, 1, 1, 0], // Octant 1
    [0, -1, 1, 0], // Octant 2
    [-1, 0, 0, 1], // Octant 3
    [-1, 0, 0, -1], // Octant 4
    [0, -1, -1, 0], // Octant 5
    [0, 1, -1, 0], // Octant 6
    [1, 0, 0, -1], // Octant 7
  ];

  constructor(
    private readonly maxRadius: number = 20,
    poolSize: number = 10,
  ) {
    // Pré-allouer le pool (taille max = (2*radius+1)² ≈ 1681 pour radius=20)
    const maxCells = ( 2 * maxRadius + 1 ) ** 2;
    this.resultPool = Array.from(
      { length: poolSize },
      () => new Uint32Array( maxCells ),
    );
  }

  /**
   * Calcule le FOV avec cache intelligent.
   * Si la position n'a pas changé, retourne le cache.
   */
  compute(
    grid: Grid,
    x: number,
    y: number,
    radius: number,
    previousResult?: {
      centerX: number;
      centerY: number;
      radius: number;
      version: number;
    },
  ): { cells: Uint32Array; count: number; version: number } {
    // Fast path: position identique → retourner le cache
    if (
      previousResult &&
      previousResult.centerX === x &&
      previousResult.centerY === y &&
      previousResult.radius === radius &&
      previousResult.version === this.cacheVersion
    ) {
      return {
        cells: previousResult.cells as unknown as Uint32Array,
        count: previousResult.count,
        version: this.cacheVersion,
      };
    }

    // Check cache de position (pour multi-entités au même endroit)
    const posKey = this.makeCacheKey( x, y, radius );
    const cached = this.positionCache.get( posKey );
    if ( cached && cached.version === this.cacheVersion ) {
      return cached;
    }

    // Calcul réel du FOV
    const result = this.acquireFromPool();
    const count = this.shadowcast( grid, x, y, radius, result );

    const fovResult = { cells: result, count, version: this.cacheVersion };

    // Mettre en cache
    this.positionCache.set( posKey, fovResult );

    return fovResult;
  }

  /**
   * Invalide le cache (appeler quand le terrain change).
   */
  invalidateCache(): void {
    this.cacheVersion++;
    // Pas besoin de clear le cache, le version check suffit
    // Mais on peut limiter la taille si nécessaire
    if ( this.positionCache.size > 1000 ) {
      this.positionCache.clear();
    }
  }

  private acquireFromPool(): Uint32Array {
    const result = this.resultPool[this.poolIndex];
    this.poolIndex = ( this.poolIndex + 1 ) % this.resultPool.length;
    return result;
  }

  // Utilise BigInt pour éviter les collisions de clé
  private makeCacheKey( x: number, y: number, radius: number ): bigint {
    return BigInt( x + COORD_OFFSET ) << 32n | 
           BigInt( y + COORD_OFFSET ) << 16n | 
           BigInt( radius );
  }

  /**
   * Recursive Shadowcasting algorithm.
   * Basé sur: http://www.roguebasin.com/index.php?title=FOV_using_recursive_shadowcasting
   */
  private shadowcast(
    grid: Grid,
    originX: number,
    originY: number,
    radius: number,
    result: Uint32Array,
  ): number {
    let count = 0;
    const radiusSq = radius * radius;

    // L'origine est toujours visible
    result[count++] = packCoords( originX, originY );

    // Calculer chaque octant
    for ( let octant = 0; octant < 8; octant++ ) {
      count = this.castOctant(
        grid,
        originX,
        originY,
        radius,
        radiusSq,
        1,
        1.0,
        0.0,
        FOVCalculator.OCTANT_TRANSFORMS[octant],
        result,
        count,
      );
    }

    return count;
  }

  private castOctant(
    grid: Grid,
    originX: number,
    originY: number,
    radius: number,
    radiusSq: number,
    row: number,
    startSlope: number,
    endSlope: number,
    transform: number[],
    result: Uint32Array,
    count: number,
  ): number {
    if ( startSlope < endSlope ) return count;

    let nextStartSlope = startSlope;

    for ( let distance = row; distance <= radius; distance++ ) {
      let blocked = false;

      for ( let col = Math.round( -distance * startSlope ); col <= 0; col++ ) {
        // Transformer les coordonnées selon l'octant
        const dx = col * transform[0] + distance * transform[1];
        const dy = col * transform[2] + distance * transform[3];
        const mapX = originX + dx;
        const mapY = originY + dy;

        // Vérifier les limites
        if ( !grid.isInBounds( mapX, mapY ) ) continue;

        // Vérifier la distance (cercle)
        const distSq = dx * dx + dy * dy;
        if ( distSq > radiusSq ) continue;

        const leftSlope = ( col - 0.5 ) / ( distance + 0.5 );
        const rightSlope = ( col + 0.5 ) / ( distance - 0.5 );

        if ( rightSlope > startSlope ) continue;
        if ( leftSlope < endSlope ) break;

        // Ajouter la cellule visible
        result[count++] = packCoords( mapX, mapY );

        // Gérer les murs
        const isWall = grid.getCell( mapX, mapY ) === CellType.WALL;

        if ( blocked ) {
          if ( isWall ) {
            nextStartSlope = rightSlope;
          } else {
            blocked = false;
            startSlope = nextStartSlope;
          }
        } else if ( isWall && distance < radius ) {
          blocked = true;
          count = this.castOctant(
            grid,
            originX,
            originY,
            radius,
            radiusSq,
            distance + 1,
            startSlope,
            leftSlope,
            transform,
            result,
            count,
          );
          nextStartSlope = rightSlope;
        }
      }

      if ( blocked ) break;
    }

    return count;
  }

  // Utilise les fonctions globales packCoords/unpackX/unpackY
  // Exposées comme méthodes statiques pour compatibilité
  static unpackX = unpackX;
  static unpackY = unpackY;
}

// ============================================================================
// FOV System - Utilise le cache intelligent
// ============================================================================

const FOVSystem = defineSystem("FOV")
  .inPhase(SystemPhase.PostUpdate)
  .execute((world: World) => {
    const grid = world.resources.get<Grid>("grid");
    const fovCalculator = world.resources.get<FOVCalculator>("fovCalculator");
    const query = world.query({ with: ["Position", "FOV"], without: [] });

    for (const entity of query.execute()) {
      const posStore = world.components.getStore<Position>("Position");
      const fovStore = world.components.getStore<FOVData>("FOV");

      const x = posStore.getField(entity, "x")!;
      const y = posStore.getField(entity, "y")!;
      const radius = fovStore.getField(entity, "radius")!;

      // Récupérer le cache précédent s'il existe
      const previousVisible = world.getComponent<VisibleCellsData>(
        entity,
        "VisibleCells",
      );

      // Calculer (utilise le cache si position identique)
      const fovResult = fovCalculator.compute(
        grid,
        Math.floor(x),
        Math.floor(y),
        radius,
        previousVisible,
      );

      // Mettre à jour seulement si changé
      if (!previousVisible || previousVisible.version !== fovResult.version) {
        world.addComponent(entity, "VisibleCells", {
          cells: fovResult.cells,
          count: fovResult.count,
          centerX: Math.floor(x),
          centerY: Math.floor(y),
          radius,
          version: fovResult.version,
        });
      }
    }
  });

// ============================================================================
// Helper: Vérifier si une cellule est visible
// ============================================================================

function isCellVisible(
  visibleCells: { cells: Uint32Array; count: number },
  x: number,
  y: number,
): boolean {
  const packed = packCoords( x, y );
  const cells = visibleCells.cells;
  const count = visibleCells.count;

  // Recherche linéaire (pour petits sets) ou binaire (pour grands sets)
  if ( count < 50 ) {
    for ( let i = 0; i < count; i++ ) {
      if ( cells[i] === packed ) return true;
    }
    return false;
  }

  // Pour de plus grands ensembles, on pourrait trier et faire une recherche binaire
  // ou utiliser un Set<number> en parallèle
  for ( let i = 0; i < count; i++ ) {
    if ( cells[i] === packed ) return true;
  }
  return false;
}

// ============================================================================
// Initialisation des ressources FOV
// ============================================================================

function initializeFOVResources(world: World): void {
  const fovCalculator = new FOVCalculator(20, 10); // radius max 20, pool de 10
  world.resources.register("fovCalculator", fovCalculator);

  // Invalider le cache quand le terrain change
  world.resources.get<EventQueue>("eventQueue").on("terrain.changed", () => {
    fovCalculator.invalidateCache();
  });
}
```

#### **AI System**

```typescript
const AISystem = defineSystem("AI")
  .inPhase(SystemPhase.Update)
  .execute((world: World) => {
    const query = world.query({
      with: ["Position", "AI"],
      without: ["Player"],
    });
    const playerQuery = world.query({
      with: ["Player", "Position"],
      without: [],
    });

    const playerEntities = playerQuery.execute();
    if (playerEntities.length === 0) return;

    const player = playerEntities[0];
    const playerPos = world.getComponent<{ x: number; y: number }>(
      player,
      "Position",
    )!;

    for (const entity of query.execute()) {
      const pos = world.getComponent<{ x: number; y: number }>(
        entity,
        "Position",
      );
      const ai = world.getComponent<{
        state: string;
        target: Entity;
        aggression: number;
      }>(entity, "AI");

      if (!pos || !ai) continue;

      // Calculate distance to player
      const dx = playerPos.x - pos.x;
      const dy = playerPos.y - pos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // State machine
      switch (ai.state) {
        case "idle":
          if (distance < 10) {
            ai.state = "chase";
            ai.target = player;
          }
          break;

        case "chase":
          if (distance > 15) {
            ai.state = "idle";
            ai.target = 0 as Entity;
          } else if (distance < 1.5) {
            ai.state = "attack";
          } else {
            // Move towards player (simple pathfinding)
            const vel = world.getComponent<{ x: number; y: number }>(
              entity,
              "Velocity",
            );
            if (vel) {
              vel.x = Math.sign(dx);
              vel.y = Math.sign(dy);
            } else {
              world.addComponent(entity, "Velocity", {
                x: Math.sign(dx),
                y: Math.sign(dy),
              });
            }
          }
          break;

        case "attack":
          if (distance > 1.5) {
            ai.state = "chase";
          } else {
            // Perform attack
            const stats = world.getComponent<{ attack: number }>(
              entity,
              "Stats",
            );
            const playerStats = world.getComponent<{
              hp: number;
              defense: number;
            }>(player, "Stats");

            if (stats && playerStats) {
              const damage = Math.max(1, stats.attack - playerStats.defense);
              playerStats.hp -= damage;

              console.log(`Enemy attacked player for ${damage} damage!`);
            }
          }
          break;
      }
    }
  });
```

#### **Combat System**

```typescript
const CombatSystem = defineSystem("Combat")
  .inPhase(SystemPhase.Update)
  .execute((world: World) => {
    const query = world.query({ with: ["AttackRequest"], without: [] });

    for (const attacker of query.execute()) {
      const request = world.getComponent<{ target: Entity }>(
        attacker,
        "AttackRequest",
      );
      if (!request) continue;

      const target = request.target;

      // Get stats
      const attackerStats = world.getComponent<{ attack: number }>(
        attacker,
        "Stats",
      );
      const targetStats = world.getComponent<{ hp: number; defense: number }>(
        target,
        "Stats",
      );

      if (!attackerStats || !targetStats) continue;

      // Calculate damage
      const baseDamage = attackerStats.attack - targetStats.defense;
      const damage = Math.max(1, baseDamage);

      // Apply damage
      targetStats.hp -= damage;

      // Emit event
      const eventQueue = world.resources.get("eventQueue");
      eventQueue.emit("combat.damage", {
        attacker,
        target,
        damage,
      });

      // Check death
      if (targetStats.hp <= 0) {
        world.commands.despawn(target);
        eventQueue.emit(GameEvents.EnemyDied, { entity: target });
      }

      // Remove request
      world.removeComponent(attacker, "AttackRequest");
    }
  });
```

### 5.3 Entity Templates

```typescript
// Player template
const PlayerTemplate: EntityTemplate = {
  id: "player",
  components: {
    Position: { x: 0, y: 0, layer: 2 },
    Renderable: { sprite: "@", color: "#ffffff", zIndex: 10 },
    Stats: { hp: 100, maxHp: 100, attack: 10, defense: 5, speed: 100 },
    Inventory: { capacity: 20 },
    Equipment: { weapon: 0, armor: 0, accessory: 0 },
    TurnEnergy: { energy: 0, energyPerTurn: 100 },
    FOV: { radius: 10, dirty: 1 },
    Player: {},
  },
};

// Orc template
const OrcTemplate: EntityTemplate = {
  id: "orc",
  components: {
    Position: { x: 0, y: 0, layer: 2 },
    Renderable: { sprite: "o", color: "#00ff00", zIndex: 5 },
    Stats: { hp: 30, maxHp: 30, attack: 8, defense: 2, speed: 80 },
    AI: { state: "idle", target: 0, aggression: 0.7 },
    TurnEnergy: { energy: 0, energyPerTurn: 80 },
    Blocking: { blocks: true },
  },
};

// Health Potion template
const HealthPotionTemplate: EntityTemplate = {
  id: "potion_health",
  components: {
    Position: { x: 0, y: 0, layer: 1 },
    Renderable: { sprite: "!", color: "#ff0000", zIndex: 1 },
    Item: { stackable: 1, count: 1, itemType: "consumable" },
    Usable: { effect: "heal", amount: 25 },
  },
};

// Door template
const DoorTemplate: EntityTemplate = {
  id: "door",
  components: {
    Position: { x: 0, y: 0, layer: 1 },
    Renderable: { sprite: "+", color: "#8b4513", zIndex: 2 },
    Door: { open: 0, locked: 0, keyId: "" },
    Interactable: { interactionType: "door" },
    Blocking: { blocks: true },
  },
};
```

---

## 6. Integration avec l'Existant

### 6.1 Dungeon Generation Integration

Conversion du dungeon généré en entités ECS.

```typescript
class DungeonToECSConverter {
  constructor(
    private world: World,
    private templateRegistry: EntityTemplateRegistry,
  ) {}

  convert(dungeon: Dungeon): void {
    const grid = this.world.resources.get("grid");

    // 1. Convert grid to wall/floor entities (optional, or just use Grid resource)
    // For performance, we keep Grid as resource, not entities

    // 2. Convert rooms to metadata (for AI, spawning, etc.)
    for (const room of dungeon.rooms) {
      this.spawnRoomContents(room);
    }

    // 3. Convert connections to corridors
    for (const connection of dungeon.connections) {
      this.spawnCorridorContents(connection);
    }

    // 4. Spawn player in first room
    const startRoom = dungeon.rooms[0];
    const playerEntity = this.templateRegistry.instantiate(
      this.world,
      "player",
      {
        Position: {
          x: startRoom.centerX,
          y: startRoom.centerY,
          layer: 2,
        },
      },
    );

    this.world.resources.register("player", playerEntity);
  }

  private spawnRoomContents(room: Room): void {
    const rng = this.world.resources.get("rng");

    // Spawn enemies (based on room size)
    const enemyCount = Math.floor((room.width * room.height) / 50);

    for (let i = 0; i < enemyCount; i++) {
      const x = room.x + rng.nextInt(1, room.width - 1);
      const y = room.y + rng.nextInt(1, room.height - 1);

      this.templateRegistry.instantiate(this.world, "orc", {
        Position: { x, y, layer: 2 },
      });
    }

    // Spawn items
    const itemCount = rng.nextInt(1, 3);

    for (let i = 0; i < itemCount; i++) {
      const x = room.x + rng.nextInt(1, room.width - 1);
      const y = room.y + rng.nextInt(1, room.height - 1);

      this.templateRegistry.instantiate(this.world, "potion_health", {
        Position: { x, y, layer: 1 },
      });
    }

    // Spawn doors at room entrances (heuristic: find cells adjacent to corridor)
    // (Simplified for brevity)
  }

  private spawnCorridorContents(connection: Connection): void {
    // Optionally spawn traps, items in corridors
  }
}
```

### 6.2 Spatial Index Integration

Le Spatial Index utilise du dirty tracking pour éviter les rebuilds complets.

```typescript
// ============================================================================
// Spatial Index optimisé avec dirty tracking
// ============================================================================

// Component pour tracker la position précédente (dirty tracking)
const PreviousPositionSchema = ComponentSchema.define<{
  x: number;
  y: number;
  cellKey: number;
}>("PreviousPosition")
  .field("x", ComponentType.F32, 0)
  .field("y", ComponentType.F32, 0)
  .field("cellKey", ComponentType.I32, -1)
  .build();

class SpatialIndex {
  // Utiliser Set pour O(1) add/remove/has
  private readonly grid = new Map<number, Set<Entity>>();
  // Index inversé pour retrouver la cellule d'une entité
  private readonly entityToCell = new Map<Entity, number>();
  // Pool de Sets vides pour réutilisation
  private readonly emptySet: ReadonlySet<Entity> = new Set();

  constructor(private readonly cellSize: number = 1) {}

  /**
   * Insère ou met à jour une entité dans l'index.
   * Retourne true si la cellule a changé.
   */
  upsert(entity: Entity, x: number, y: number): boolean {
    const newKey = this.getKey(x, y);
    const oldKey = this.entityToCell.get(entity);

    // Pas de changement de cellule
    if (oldKey === newKey) {
      return false;
    }

    // Retirer de l'ancienne cellule
    if (oldKey !== undefined) {
      const oldCell = this.grid.get(oldKey);
      if (oldCell) {
        oldCell.delete(entity);
        if (oldCell.size === 0) {
          this.grid.delete(oldKey); // Nettoyer les cellules vides
        }
      }
    }

    // Ajouter à la nouvelle cellule
    let newCell = this.grid.get(newKey);
    if (!newCell) {
      newCell = new Set();
      this.grid.set(newKey, newCell);
    }
    newCell.add(entity);
    this.entityToCell.set(entity, newKey);

    return true;
  }

  /**
   * Retire une entité de l'index.
   */
  remove(entity: Entity): boolean {
    const key = this.entityToCell.get(entity);
    if (key === undefined) return false;

    const cell = this.grid.get(key);
    if (cell) {
      cell.delete(entity);
      if (cell.size === 0) {
        this.grid.delete(key);
      }
    }

    this.entityToCell.delete(entity);
    return true;
  }

  /**
   * Retourne les entités à une position (lecture seule).
   */
  getEntitiesAt(x: number, y: number): ReadonlySet<Entity> {
    const key = this.getKey(x, y);
    return this.grid.get(key) ?? this.emptySet;
  }

  /**
   * Retourne les entités dans un rayon (pour FOV, AI, etc.).
   */
  getEntitiesInRadius(
    centerX: number,
    centerY: number,
    radius: number,
  ): Entity[] {
    const results: Entity[] = [];

    const minCellX = Math.floor( ( centerX - radius ) / this.cellSize );
    const maxCellX = Math.floor( ( centerX + radius ) / this.cellSize );
    const minCellY = Math.floor( ( centerY - radius ) / this.cellSize );
    const maxCellY = Math.floor( ( centerY + radius ) / this.cellSize );

    for ( let cx = minCellX; cx <= maxCellX; cx++ ) {
      for ( let cy = minCellY; cy <= maxCellY; cy++ ) {
        const key = this.makeCellKey( cx, cy );
        const cell = this.grid.get( key );

        if ( cell ) {
          for ( const entity of cell ) {
            results.push( entity );
          }
        }
      }
    }

    return results;
  }

  /**
   * Retourne les entités dans un rectangle.
   */
  getEntitiesInRect( x1: number, y1: number, x2: number, y2: number ): Entity[] {
    const results: Entity[] = [];

    const minCellX = Math.floor( Math.min( x1, x2 ) / this.cellSize );
    const maxCellX = Math.floor( Math.max( x1, x2 ) / this.cellSize );
    const minCellY = Math.floor( Math.min( y1, y2 ) / this.cellSize );
    const maxCellY = Math.floor( Math.max( y1, y2 ) / this.cellSize );

    for ( let cx = minCellX; cx <= maxCellX; cx++ ) {
      for ( let cy = minCellY; cy <= maxCellY; cy++ ) {
        const key = this.makeCellKey( cx, cy );
        const cell = this.grid.get( key );

        if ( cell ) {
          for ( const entity of cell ) {
            results.push( entity );
          }
        }
      }
    }

    return results;
  }

  /**
   * Vérifie si une entité est dans l'index.
   */
  has(entity: Entity): boolean {
    return this.entityToCell.has(entity);
  }

  /**
   * Retourne la clé de cellule d'une entité.
   */
  getCellKey(entity: Entity): number | undefined {
    return this.entityToCell.get(entity);
  }

  clear(): void {
    this.grid.clear();
    this.entityToCell.clear();
  }

  getStats(): { cellCount: number; entityCount: number } {
    return {
      cellCount: this.grid.size,
      entityCount: this.entityToCell.size,
    };
  }

  private getKey( x: number, y: number ): number {
    const cx = Math.floor( x / this.cellSize );
    const cy = Math.floor( y / this.cellSize );
    return this.makeCellKey( cx, cy );
  }

  /**
   * Crée une clé de cellule supportant les coordonnées négatives.
   * Utilise un offset pour garantir des valeurs positives.
   */
  private makeCellKey( cx: number, cy: number ): number {
    // Ajouter COORD_OFFSET pour supporter les coordonnées négatives
    const px = ( cx + COORD_OFFSET ) & COORD_MASK;
    const py = ( cy + COORD_OFFSET ) & COORD_MASK;
    return ( px << COORD_BITS ) | py;
  }
}

// ============================================================================
// Spatial Index System avec dirty tracking
// ============================================================================

const SpatialIndexSystem = defineSystem("SpatialIndex")
  .inPhase(SystemPhase.PostUpdate)
  .runAfter("Movement")
  .execute((world: World) => {
    const spatialIndex = world.resources.get<SpatialIndex>("spatialIndex");
    const posStore = world.components.getStore<Position>("Position");
    const prevPosStore =
      world.components.getStore<PreviousPosition>("PreviousPosition");

    // 1. Traiter les entités nouvellement créées (ont Position mais pas PreviousPosition)
    const newEntitiesQuery = world.query({
      with: ["Position"],
      without: ["PreviousPosition"],
    });

    for (const entity of newEntitiesQuery.execute()) {
      const x = posStore.getField(entity, "x")!;
      const y = posStore.getField(entity, "y")!;

      // Insérer dans l'index
      spatialIndex.upsert(entity, x, y);

      // Ajouter le composant PreviousPosition
      const cellKey = spatialIndex.getCellKey(entity)!;
      world.commands.addComponent(entity, "PreviousPosition", {
        x,
        y,
        cellKey,
      });
    }

    // 2. Traiter les entités qui ont bougé
    const movedQuery = world.query({
      with: ["Position", "PreviousPosition"],
      without: [],
    });

    for (const entity of movedQuery.execute()) {
      const x = posStore.getField(entity, "x")!;
      const y = posStore.getField(entity, "y")!;
      const prevX = prevPosStore.getField(entity, "x")!;
      const prevY = prevPosStore.getField(entity, "y")!;

      // Skip si pas de mouvement
      if (x === prevX && y === prevY) continue;

      // Mettre à jour l'index spatial
      const cellChanged = spatialIndex.upsert(entity, x, y);

      // Mettre à jour PreviousPosition
      prevPosStore.setField(entity, "x", x);
      prevPosStore.setField(entity, "y", y);

      if (cellChanged) {
        prevPosStore.setField(
          entity,
          "cellKey",
          spatialIndex.getCellKey(entity)!,
        );
      }
    }

    // 3. Nettoyer les entités mortes (géré par le système de despawn)
    // Le World.despawn() devrait appeler spatialIndex.remove(entity)
  });

// ============================================================================
// Hook pour nettoyer l'index lors du despawn
// ============================================================================

function initializeSpatialIndex(world: World): void {
  const spatialIndex = new SpatialIndex(1); // Cellules de 1x1 pour précision
  world.resources.register("spatialIndex", spatialIndex);

  // S'abonner aux événements de despawn
  const eventQueue = world.resources.get<EventQueue>("eventQueue");
  eventQueue.on("entity.despawned", (event) => {
    spatialIndex.remove(event.data.entity);
  });
}
```

### 6.3 WebSocket Synchronization

Le système de synchronisation réseau utilise un vrai delta pour minimiser la bande passante.

```typescript
// ============================================================================
// Types pour la synchronisation
// ============================================================================

interface ClientState {
  readonly sessionId: string;
  readonly playerId: Entity;
  // Snapshot précédent pour calculer le delta
  lastSentEntities: Map<Entity, EntitySnapshot>;
  lastSentTick: number;
  lastPlayerState: PlayerSnapshot | null;
}

interface EntitySnapshot {
  readonly version: number; // Hash/checksum des données
  readonly x: number;
  readonly y: number;
  readonly sprite: string;
  readonly color: string;
}

interface PlayerSnapshot {
  readonly x: number;
  readonly y: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly inventoryHash: number;
}

// Delta envoyé au client
interface StateDelta {
  readonly tick: number;
  readonly deltaTick: number; // Nombre de ticks depuis le dernier envoi

  // Entités modifiées
  readonly added: EntityData[];
  readonly updated: EntityUpdate[];
  readonly removed: Entity[];

  // État du joueur (seulement si changé)
  readonly player?: PlayerData;

  // Messages/événements
  readonly events: GameEvent[];
}

interface EntityData {
  readonly id: Entity;
  readonly x: number;
  readonly y: number;
  readonly sprite: string;
  readonly color: string;
}

interface EntityUpdate {
  readonly id: Entity;
  // Seulement les champs qui ont changé
  readonly x?: number;
  readonly y?: number;
  readonly sprite?: string;
  readonly color?: string;
}

interface PlayerData {
  readonly x: number;
  readonly y: number;
  readonly hp: number;
  readonly maxHp: number;
  readonly inventory: InventoryItem[];
}

interface InventoryItem {
  readonly id: Entity;
  readonly sprite: string;
  readonly name: string;
  readonly count: number;
}

interface GameEvent {
  readonly type: string;
  readonly data: unknown;
}

// ============================================================================
// Network Sync Manager avec Delta Compression
// ============================================================================

class NetworkSyncManager {
  private readonly clients = new Map<string, ClientState>();
  private readonly pendingEvents = new Map<string, GameEvent[]>();

  constructor(private readonly world: World) {
    // S'abonner aux événements du jeu pour les envoyer aux clients
    this.subscribeToGameEvents();
  }

  private subscribeToGameEvents(): void {
    const eventQueue = this.world.resources.get<EventQueue>("eventQueue");

    // Événements à diffuser aux clients
    const broadcastEvents = [
      "combat.damage",
      "entity.died",
      "item.picked_up",
      "door.opened",
      "level.changed",
    ];

    for (const eventType of broadcastEvents) {
      eventQueue.on(eventType, (event) => {
        this.broadcastEvent({ type: eventType, data: event.data });
      });
    }
  }

  private broadcastEvent(event: GameEvent): void {
    for (const sessionId of this.clients.keys()) {
      const events = this.pendingEvents.get(sessionId) ?? [];
      events.push(event);
      this.pendingEvents.set(sessionId, events);
    }
  }

  registerClient(sessionId: string, playerId: Entity): void {
    this.clients.set(sessionId, {
      sessionId,
      playerId,
      lastSentEntities: new Map(),
      lastSentTick: 0,
      lastPlayerState: null,
    });
    this.pendingEvents.set(sessionId, []);
  }

  unregisterClient(sessionId: string): void {
    this.clients.delete(sessionId);
    this.pendingEvents.delete(sessionId);
  }

  /**
   * Génère un delta minimal depuis le dernier snapshot.
   */
  getStateDelta(sessionId: string): StateDelta | null {
    const client = this.clients.get(sessionId);
    if (!client) return null;

    const currentTick = this.world.resources.get<number>("currentTick");
    const playerId = client.playerId;

    // Récupérer les entités visibles
    const visibleEntities = this.getVisibleEntities(playerId);

    // Calculer le delta
    const added: EntityData[] = [];
    const updated: EntityUpdate[] = [];
    const removed: Entity[] = [];
    const currentEntities = new Map<Entity, EntitySnapshot>();

    // Parcourir les entités visibles
    for (const entity of visibleEntities) {
      const snapshot = this.createEntitySnapshot(entity);
      currentEntities.set(entity, snapshot);

      const previousSnapshot = client.lastSentEntities.get(entity);

      if (!previousSnapshot) {
        // Nouvelle entité
        added.push(this.snapshotToData(entity, snapshot));
      } else if (snapshot.version !== previousSnapshot.version) {
        // Entité modifiée - envoyer seulement les champs changés
        const update = this.computeEntityUpdate(
          entity,
          previousSnapshot,
          snapshot,
        );
        if (update) {
          updated.push(update);
        }
      }
      // Si version identique, on n'envoie rien
    }

    // Trouver les entités qui ne sont plus visibles
    for (const [entity] of client.lastSentEntities) {
      if (!currentEntities.has(entity)) {
        removed.push(entity);
      }
    }

    // Mettre à jour l'état du client
    client.lastSentEntities = currentEntities;

    // Calculer le delta du joueur
    const playerData = this.computePlayerDelta(client, playerId);

    // Récupérer les événements en attente
    const events = this.pendingEvents.get(sessionId) ?? [];
    this.pendingEvents.set(sessionId, []);

    // Si rien n'a changé et pas d'événements, retourner null
    if (
      added.length === 0 &&
      updated.length === 0 &&
      removed.length === 0 &&
      !playerData &&
      events.length === 0
    ) {
      return null;
    }

    const delta: StateDelta = {
      tick: currentTick,
      deltaTick: currentTick - client.lastSentTick,
      added,
      updated,
      removed,
      player: playerData,
      events,
    };

    client.lastSentTick = currentTick;
    return delta;
  }

  private getVisibleEntities( playerId: Entity ): Set<Entity> {
    const visibleCells = this.world.getComponent<{
      cells: Uint32Array;
      count: number;
    }>( playerId, "VisibleCells" );

    if (!visibleCells) return new Set();

    const spatialIndex = this.world.resources.get<SpatialIndex>("spatialIndex");
    const entities = new Set<Entity>();

    // Utiliser les cellules visibles pour trouver les entités
    for (let i = 0; i < visibleCells.count; i++) {
      const packed = visibleCells.cells[i];
      const x = FOVCalculator.unpackX(packed);
      const y = FOVCalculator.unpackY(packed);

      for (const entity of spatialIndex.getEntitiesAt(x, y)) {
        if (entity !== playerId) {
          // Ne pas inclure le joueur lui-même
          entities.add(entity);
        }
      }
    }

    return entities;
  }

  private createEntitySnapshot(entity: Entity): EntitySnapshot {
    const posStore = this.world.components.getStore<Position>("Position");
    const renderStore =
      this.world.components.getStore<Renderable>("Renderable");

    const x = posStore.getField(entity, "x") ?? 0;
    const y = posStore.getField(entity, "y") ?? 0;
    const sprite = renderStore.getField(entity, "sprite") ?? "?";
    const color = renderStore.getField(entity, "color") ?? "#fff";

    // Calculer un hash simple pour détecter les changements
    const version = this.hashSnapshot(x, y, sprite, color);

    return { version, x, y, sprite, color };
  }

  private hashSnapshot(
    x: number,
    y: number,
    sprite: string,
    color: string,
  ): number {
    // Simple hash pour détecter les changements
    let hash = 0;
    hash = (hash * 31 + Math.floor(x * 100)) | 0;
    hash = (hash * 31 + Math.floor(y * 100)) | 0;
    hash = (hash * 31 + this.stringHash(sprite)) | 0;
    hash = (hash * 31 + this.stringHash(color)) | 0;
    return hash;
  }

  private stringHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return hash;
  }

  private snapshotToData(entity: Entity, snapshot: EntitySnapshot): EntityData {
    return {
      id: entity,
      x: snapshot.x,
      y: snapshot.y,
      sprite: snapshot.sprite,
      color: snapshot.color,
    };
  }

  private computeEntityUpdate(
    entity: Entity,
    prev: EntitySnapshot,
    curr: EntitySnapshot,
  ): EntityUpdate | null {
    const update: EntityUpdate = { id: entity };
    let hasChanges = false;

    if (prev.x !== curr.x) {
      (update as any).x = curr.x;
      hasChanges = true;
    }
    if (prev.y !== curr.y) {
      (update as any).y = curr.y;
      hasChanges = true;
    }
    if (prev.sprite !== curr.sprite) {
      (update as any).sprite = curr.sprite;
      hasChanges = true;
    }
    if (prev.color !== curr.color) {
      (update as any).color = curr.color;
      hasChanges = true;
    }

    return hasChanges ? update : null;
  }

  private computePlayerDelta(
    client: ClientState,
    playerId: Entity,
  ): PlayerData | null {
    const posStore = this.world.components.getStore<Position>("Position");
    const statsStore = this.world.components.getStore<Stats>("Stats");

    const x = posStore.getField(playerId, "x") ?? 0;
    const y = posStore.getField(playerId, "y") ?? 0;
    const hp = statsStore.getField(playerId, "hp") ?? 0;
    const maxHp = statsStore.getField(playerId, "maxHp") ?? 100;

    const inventory = this.getInventoryState(playerId);
    const inventoryHash = this.hashInventory(inventory);

    const currentState: PlayerSnapshot = { x, y, hp, maxHp, inventoryHash };
    const prevState = client.lastPlayerState;

    // Vérifier si quelque chose a changé
    if (
      prevState &&
      prevState.x === currentState.x &&
      prevState.y === currentState.y &&
      prevState.hp === currentState.hp &&
      prevState.maxHp === currentState.maxHp &&
      prevState.inventoryHash === currentState.inventoryHash
    ) {
      return null; // Pas de changement
    }

    client.lastPlayerState = currentState;

    return {
      x,
      y,
      hp,
      maxHp,
      inventory,
    };
  }

  private getInventoryState( playerId: Entity ): InventoryItem[] {
    const hierarchy = this.world.resources.get<HierarchyManager>( "hierarchy" );
    const children = hierarchy.getChildren(playerId);
    const items: InventoryItem[] = [];

    for (const child of children) {
      const item = this.world.getComponent<ItemData>(child, "Item");
      const render = this.world.getComponent<Renderable>(child, "Renderable");

      if (item && render) {
        items.push({
          id: child,
          sprite: render.sprite,
          name: item.name ?? "Unknown",
          count: item.count ?? 1,
        });
      }
    }

    return items;
  }

  private hashInventory(items: InventoryItem[]): number {
    let hash = 0;
    for (const item of items) {
      hash = (hash * 31 + item.id) | 0;
      hash = (hash * 31 + item.count) | 0;
    }
    return hash;
  }

  /**
   * Traite l'input du client.
   */
  processInput(sessionId: string, input: ClientInput): boolean {
    const client = this.clients.get(sessionId);
    if (!client) return false;

    const playerId = client.playerId;
    const turnState = this.world.resources.get<TurnStateManager>("turnState");
    const state = turnState.getState();

    // Vérifier que c'est le tour du joueur
    if (state.activeEntity !== playerId || state.turnPhase !== "acting") {
      return false;
    }

    // Mapper l'input à une action
    switch (input.action) {
      case "move":
        return submitAction(this.world, playerId, {
          type: "move",
          data: { dx: input.dx, dy: input.dy },
        });

      case "attack":
        return submitAction(this.world, playerId, {
          type: "attack",
          data: { target: input.target },
        });

      case "pickup":
        return submitAction(this.world, playerId, {
          type: "interact",
          data: { target: input.target, interactionType: "pickup" },
        });

      case "use_item":
        return submitAction(this.world, playerId, {
          type: "use_item",
          data: { item: input.item },
        });

      case "wait":
        return submitAction(this.world, playerId, { type: "wait" });

      default:
        return false;
    }
  }
}

interface ClientInput {
  action: "move" | "attack" | "pickup" | "use_item" | "wait";
  dx?: number;
  dy?: number;
  target?: Entity;
  item?: Entity;
}
```

---

## 7. Performance Optimizations

### 7.1 Object Pooling

```typescript
class EntityPool {
  private pool: Entity[] = [];

  constructor(
    private world: World,
    private templateId: string,
    private templateRegistry: EntityTemplateRegistry,
    initialSize: number = 100,
  ) {
    this.preallocate(initialSize);
  }

  private preallocate(size: number): void {
    for (let i = 0; i < size; i++) {
      const entity = this.templateRegistry.instantiate(
        this.world,
        this.templateId,
      );
      this.world.addComponent(entity, "Pooled", { active: false });
      this.pool.push(entity);
    }
  }

  acquire(overrides?: Record<string, any>): Entity {
    let entity: Entity;

    if (this.pool.length > 0) {
      entity = this.pool.pop()!;

      // Apply overrides
      if (overrides) {
        for (const [componentName, data] of Object.entries(overrides)) {
          this.world.addComponent(entity, componentName, data);
        }
      }

      // Mark as active
      this.world.addComponent(entity, "Pooled", { active: true });
    } else {
      // Pool exhausted, create new
      entity = this.templateRegistry.instantiate(
        this.world,
        this.templateId,
        overrides,
      );
      this.world.addComponent(entity, "Pooled", { active: true });
    }

    return entity;
  }

  release(entity: Entity): void {
    // Reset to default state
    const pooled = this.world.getComponent<{ active: boolean }>(
      entity,
      "Pooled",
    );
    if (pooled) {
      pooled.active = false;
    }

    // Remove position (hide)
    this.world.removeComponent(entity, "Position");

    this.pool.push(entity);
  }
}
```

### 7.2 Dirty Flags

```typescript
// Component with dirty flag
const TransformSchema = ComponentSchema.define("Transform")
  .field("x", ComponentType.F32, 0)
  .field("y", ComponentType.F32, 0)
  .field("rotation", ComponentType.F32, 0)
  .field("dirty", ComponentType.U8, 1)
  .build();

// System that uses dirty flag
const TransformPropagationSystem = defineSystem( "TransformPropagation" )
  .inPhase( SystemPhase.PostUpdate )
  .execute( ( world: World ) => {
    const hierarchy = world.resources.get<HierarchyManager>( "hierarchy" );
    const query = world.query({ with: ["Transform", "Parent"], without: [] });

    for (const entity of query.execute()) {
      const transform = world.getComponent<{
        x: number;
        y: number;
        dirty: number;
      }>(entity, "Transform");

      if (!transform || !transform.dirty) continue;

      // Propagate to children
      const parent = hierarchy.getParent(entity);
      if (parent) {
        const parentTransform = world.getComponent<{ x: number; y: number }>(
          parent,
          "Transform",
        );

        if (parentTransform) {
          // Apply parent transform
          transform.x += parentTransform.x;
          transform.y += parentTransform.y;
        }
      }

      // Mark as clean
      transform.dirty = 0;
    }
  });
```

### 7.3 Query Caching with Archetypes

```typescript
// Archetype = unique combination of components
type Archetype = Set<string>;

class ArchetypeManager {
  private archetypes = new Map<
    string,
    {
      components: Set<string>;
      entities: Set<Entity>;
    }
  >();

  private entityArchetype = new Map<Entity, string>();

  addEntity(entity: Entity, components: string[]): void {
    const archetypeKey = this.getArchetypeKey(components);

    if (!this.archetypes.has(archetypeKey)) {
      this.archetypes.set(archetypeKey, {
        components: new Set(components),
        entities: new Set(),
      });
    }

    this.archetypes.get(archetypeKey)!.entities.add(entity);
    this.entityArchetype.set(entity, archetypeKey);
  }

  removeEntity(entity: Entity): void {
    const archetypeKey = this.entityArchetype.get(entity);
    if (!archetypeKey) return;

    this.archetypes.get(archetypeKey)?.entities.delete(entity);
    this.entityArchetype.delete(entity);
  }

  updateEntity(entity: Entity, newComponents: string[]): void {
    this.removeEntity(entity);
    this.addEntity(entity, newComponents);
  }

  queryArchetypes(
    withComponents: string[],
    withoutComponents: string[],
  ): Entity[] {
    const results: Entity[] = [];

    for (const [key, archetype] of this.archetypes.entries()) {
      // Check if archetype matches query
      const hasAll = withComponents.every((c) => archetype.components.has(c));
      const hasNone = withoutComponents.every(
        (c) => !archetype.components.has(c),
      );

      if (hasAll && hasNone) {
        results.push(...archetype.entities);
      }
    }

    return results;
  }

  private getArchetypeKey(components: string[]): string {
    return [...components].sort().join("|");
  }
}
```

### 7.4 Batch Operations

```typescript
// Batch spawn
function spawnBatch(
  world: World,
  templateRegistry: EntityTemplateRegistry,
  templateId: string,
  count: number,
  overridesFn?: (index: number) => Record<string, any>,
): Entity[] {
  const entities = world.entities.spawnBatch(count);

  for (let i = 0; i < count; i++) {
    const entity = entities[i];
    const overrides = overridesFn ? overridesFn(i) : undefined;

    // Apply template
    const template = templateRegistry.get(templateId);
    if (!template) throw new Error(`Template ${templateId} not found`);

    for (const [componentName, defaultData] of Object.entries(
      template.components,
    )) {
      const data = overrides?.[componentName]
        ? { ...defaultData, ...overrides[componentName] }
        : defaultData;

      world.addComponent(entity, componentName, data);
    }
  }

  world.queryCache.invalidateAll();

  return entities;
}
```

---

## 8. Developer Experience

### 8.1 Type-Safe Queries

```typescript
// Type-safe query builder
type ComponentTypes = {
  Position: { x: number; y: number; layer: number };
  Velocity: { x: number; y: number };
  Stats: { hp: number; maxHp: number; attack: number; defense: number };
  // ... etc
};

class TypedQuery<
  With extends (keyof ComponentTypes)[],
  Without extends (keyof ComponentTypes)[],
> {
  constructor(
    private world: World,
    private withComponents: With,
    private withoutComponents: Without,
  ) {}

  execute(): TypedQueryResult<With>[] {
    const query = this.world.query({
      with: this.withComponents as string[],
      without: this.withoutComponents as string[],
    });

    const results: TypedQueryResult<With>[] = [];

    for (const entity of query.execute()) {
      const components = {} as any;

      for (const componentName of this.withComponents) {
        components[componentName] = this.world.getComponent(
          entity,
          componentName as string,
        );
      }

      results.push({
        entity,
        components: components as Pick<ComponentTypes, With[number]>,
      });
    }

    return results;
  }

  forEach(
    fn: (
      entity: Entity,
      components: Pick<ComponentTypes, With[number]>,
    ) => void,
  ): void {
    for (const result of this.execute()) {
      fn(result.entity, result.components);
    }
  }
}

type TypedQueryResult<T extends (keyof ComponentTypes)[]> = {
  entity: Entity;
  components: Pick<ComponentTypes, T[number]>;
};

// Helper function
function typedQuery<
  With extends (keyof ComponentTypes)[],
  Without extends (keyof ComponentTypes)[] = [],
>(
  world: World,
  withComponents: With,
  withoutComponents: Without = [] as any,
): TypedQuery<With, Without> {
  return new TypedQuery(world, withComponents, withoutComponents);
}

// Usage
const query = typedQuery(world, ["Position", "Velocity"], ["Dead"]);
query.forEach((entity, { Position, Velocity }) => {
  // Position et Velocity sont typés automatiquement
  console.log(`Entity ${entity} at (${Position.x}, ${Position.y})`);
});
```

### 8.2 Debug Tools

```typescript
class ECSDebugger {
  constructor(private world: World) {}

  dumpWorld(): void {
    console.log("=== ECS World Dump ===");
    console.log(`Total entities: ${this.world.entities.getAliveCount()}`);

    const componentCounts = new Map<string, number>();

    for (const schema of this.world.components.getAllSchemas()) {
      const store = this.world.components.getStore(schema.name);
      componentCounts.set(schema.name, store.getCount());
    }

    console.log("\nComponent counts:");
    for (const [name, count] of componentCounts.entries()) {
      console.log(`  ${name}: ${count}`);
    }
  }

  dumpEntity(entity: Entity): void {
    console.log(`\n=== Entity ${entity} ===`);

    if (!this.world.entities.isAlive(entity)) {
      console.log("  DEAD");
      return;
    }

    for (const schema of this.world.components.getAllSchemas()) {
      const component = this.world.getComponent(entity, schema.name);
      if (component) {
        console.log(`  ${schema.name}:`, component);
      }
    }
  }

  profileSystems(iterations: number = 100): void {
    const timings = new Map<string, number[]>();

    for (const system of this.world.systems["allSystems"]) {
      timings.set(system.name, []);
    }

    for (let i = 0; i < iterations; i++) {
      for (const system of this.world.systems["allSystems"]) {
        const start = performance.now();
        system.run(this.world);
        const end = performance.now();

        timings.get(system.name)!.push(end - start);
      }
    }

    console.log("\n=== System Performance ===");
    for (const [name, times] of timings.entries()) {
      const avg = times.reduce((a, b) => a + b, 0) / times.length;
      const min = Math.min(...times);
      const max = Math.max(...times);

      console.log(`${name}:`);
      console.log(`  avg: ${avg.toFixed(3)}ms`);
      console.log(`  min: ${min.toFixed(3)}ms`);
      console.log(`  max: ${max.toFixed(3)}ms`);
    }
  }

  visualizeQueries(): void {
    console.log("\n=== Active Queries ===");

    // Access internal cache
    const cache = (this.world.queryCache as any).cache;

    for (const [key, query] of cache.entries()) {
      const results = query.execute();
      console.log(`${key}: ${results.length} entities`);
    }
  }
}
```

### 8.3 Testing Utilities

```typescript
// Test helper
class ECSTestWorld {
  world: World;
  templateRegistry: EntityTemplateRegistry;

  constructor() {
    this.world = new World();
    this.templateRegistry = new EntityTemplateRegistry();
    this.setupComponents();
    this.setupTemplates();
  }

  private setupComponents(): void {
    this.world.components.register(PositionSchema);
    this.world.components.register(VelocitySchema);
    this.world.components.register(StatsSchema);
    // ... etc
  }

  private setupTemplates(): void {
    this.templateRegistry.register(PlayerTemplate);
    this.templateRegistry.register(OrcTemplate);
    // ... etc
  }

  spawnPlayer(x: number = 0, y: number = 0): Entity {
    return this.templateRegistry.instantiate(this.world, "player", {
      Position: { x, y, layer: 2 },
    });
  }

  spawnEnemy(x: number, y: number): Entity {
    return this.templateRegistry.instantiate(this.world, "orc", {
      Position: { x, y, layer: 2 },
    });
  }

  tick(): void {
    this.world.tick();
  }

  assertEntityAt(x: number, y: number): Entity | null {
    const query = this.world.query({ with: ["Position"], without: [] });

    for (const entity of query.execute()) {
      const pos = this.world.getComponent<{ x: number; y: number }>(
        entity,
        "Position",
      );
      if (pos && Math.floor(pos.x) === x && Math.floor(pos.y) === y) {
        return entity;
      }
    }

    return null;
  }
}

// Example test
describe("Movement System", () => {
  let testWorld: ECSTestWorld;

  beforeEach(() => {
    testWorld = new ECSTestWorld();
    testWorld.world.systems.register(MovementSystem);
    testWorld.world.systems.compile();
  });

  it("should move entity with velocity", () => {
    const player = testWorld.spawnPlayer(5, 5);

    testWorld.world.addComponent(player, "Velocity", { x: 1, y: 0 });
    testWorld.tick();

    const pos = testWorld.world.getComponent<{ x: number; y: number }>(
      player,
      "Position",
    );
    expect(pos?.x).toBe(6);
    expect(pos?.y).toBe(5);
  });

  it("should reset velocity after movement", () => {
    const player = testWorld.spawnPlayer(5, 5);

    testWorld.world.addComponent(player, "Velocity", { x: 1, y: 1 });
    testWorld.tick();

    const vel = testWorld.world.getComponent<{ x: number; y: number }>(
      player,
      "Velocity",
    );
    expect(vel?.x).toBe(0);
    expect(vel?.y).toBe(0);
  });
});
```

---

## 9. Testing Strategy

### 9.1 Unit Tests

- **EntityManager** : spawn, despawn, recycling, generation counter
- **ComponentStore** : add, remove, has, get, sparse set correctness
- **Query** : filtering, caching, invalidation
- **SystemScheduler** : topological sort, dependency resolution
- **CommandBuffer** : deferred operations, flush order

### 9.2 Integration Tests

- **System interactions** : Movement → Collision → SpatialIndex
- **Hierarchy** : Parent/child relationships, recursive despawn
- **Serialization** : Save → Load → compare state
- **Events** : Emit → handlers called → state updated

### 9.3 Performance Tests

- **Benchmark queries** : 100, 1000, 10000 entities
- **Benchmark systems** : iteration speed, cache efficiency
- **Memory profiling** : TypedArrays allocation, GC pressure
- **Regression tests** : ensure optimizations don't regress

### 9.4 Determinism Tests

```typescript
describe("Determinism", () => {
  it("should produce same results with same seed", () => {
    const seed = 12345;

    // Run 1
    const world1 = createTestWorld(seed);
    for (let i = 0; i < 100; i++) {
      world1.tick();
    }
    const snapshot1 = serialize(world1);

    // Run 2
    const world2 = createTestWorld(seed);
    for (let i = 0; i < 100; i++) {
      world2.tick();
    }
    const snapshot2 = serialize(world2);

    expect(snapshot1).toEqual(snapshot2);
  });
});
```

---

## 10. Implementation Roadmap

### Phase 1: Core ECS (2-3 weeks)

**Milestone 1.1 : Entity & Component Management**

- [ ] Entity Manager avec recycling et generation counter
- [ ] Component Schema builder
- [ ] SoA Component Store
- [ ] AoS Component Store
- [ ] Component Registry
- [ ] Tests unitaires

**Milestone 1.2 : Query & Systems**

- [ ] Query System avec sparse set iteration
- [ ] Query Cache avec invalidation
- [ ] System Scheduler avec phases
- [ ] Topological sort pour dépendances
- [ ] Command Buffer pour deferred operations
- [ ] Tests unitaires

**Milestone 1.3 : World Integration**

- [ ] World class intégrant tous les modules
- [ ] Resource Registry
- [ ] Basic tick loop
- [ ] Tests d'intégration

### Phase 2: Advanced Features (2-3 weeks)

**Milestone 2.1 : Serialization**

- [ ] Entity Template Registry
- [ ] WorldSerializer avec delta compression
- [ ] Save/Load to file
- [ ] Versioning system
- [ ] Tests de round-trip

**Milestone 2.2 : Hierarchical Entities**

- [ ] Parent/Children components
- [ ] HierarchyManager
- [ ] Transform propagation
- [ ] Recursive despawn
- [ ] Tests

**Milestone 2.3 : Events & Hot Reload**

- [ ] Event Queue
- [ ] Event handlers
- [ ] Hot Reload Manager
- [ ] System reloading
- [ ] Tests

### Phase 3: Roguelike Integration (3-4 weeks)

**Milestone 3.1 : Core Components & Systems**

- [ ] Tous les component schemas (Position, Stats, etc.)
- [ ] Movement System
- [ ] Collision System
- [ ] Turn Management System
- [ ] FOV System
- [ ] Tests

**Milestone 3.2 : Gameplay Systems**

- [ ] AI System
- [ ] Combat System
- [ ] Inventory System
- [ ] Interaction System (doors, items)
- [ ] Tests

**Milestone 3.3 : Dungeon Integration**

- [ ] DungeonToECSConverter
- [ ] Spatial Index integration
- [ ] Entity Templates (player, orc, items, etc.)
- [ ] Room/corridor spawning logic
- [ ] Tests

**Milestone 3.4 : Network Sync**

- [ ] NetworkSyncSystem
- [ ] Client state tracking
- [ ] State diff computation
- [ ] FOV-based filtering
- [ ] Input processing
- [ ] WebSocket integration
- [ ] Tests

### Phase 4: Polish & Optimization (2 weeks)

**Milestone 4.1 : Performance**

- [ ] Object pooling pour entities fréquentes
- [ ] Dirty flags pour transform propagation
- [ ] Query archetype caching
- [ ] Batch operations
- [ ] Benchmarks et profiling

**Milestone 4.2 : Developer Tools**

- [ ] ECS Debugger
- [ ] World/Entity dump utilities
- [ ] System profiler
- [ ] Query visualizer
- [ ] Testing utilities

**Milestone 4.3 : Documentation**

- [ ] API documentation (JSDoc)
- [ ] Architecture guide (ce document)
- [ ] Tutorial pour créer components/systems
- [ ] Best practices guide
- [ ] Performance tips

**Milestone 4.4 : Final Testing**

- [ ] Full integration tests
- [ ] Performance regression tests
- [ ] Determinism validation
- [ ] Load testing (< 1000 entities)
- [ ] Bug fixes

---

## Conclusion

Cette architecture ECS moderne pour Rogue III combine :

✅ **Performance** : TypedArrays, SoA storage, query caching, spatial indexing
✅ **Flexibility** : Hybrid storage, component composition, entity templates
✅ **Scalability** : Optimisé pour < 1000 entities, extensible si besoin
✅ **Developer Experience** : Type safety, declarative API, hot reload, debug tools
✅ **Features** : Serialization, hierarchical entities, events, turn-based gameplay
✅ **Integration** : Dungeon generation, Grid, WebSocket, existing codebase

Le système est conçu pour être :

- **State-of-the-art** : Inspiré des meilleurs ECS (bitECS, Flecs, Bevy)
- **Production-ready** : Tests complets, performance optimisée
- **Maintainable** : Code clair, bien documenté, extensible
- **Roguelike-specific** : Turn-based, FOV, inventory, procedural generation

### Prochaines Étapes

1. **Valider l'architecture** avec l'équipe
2. **Commencer Phase 1** : Core ECS implementation
3. **Itérer** avec feedback régulier
4. **Intégrer progressivement** avec le reste du codebase

---

**Document créé le :** 2025-12-15
**Auteur :** Claude Code
**Version :** 1.0
**Status :** Ready for Implementation
