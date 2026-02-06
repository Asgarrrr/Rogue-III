# 02 - Types de Champs

> Définir les données de tes composants

## Vue d'ensemble

Chaque champ d'un composant doit avoir un **type explicite**. L'ECS utilise des `TypedArrays` pour stocker les données de manière optimisée.

```typescript
import { component, f32, u32, i32, bool, str, entityRef } from "./ecs";

@component
class Exemple {
  position = f32(0);      // Float 32 bits
  health = u32(100);      // Unsigned int 32 bits
  damage = i32(-5);       // Signed int 32 bits
  active = bool(true);    // Booléen
  name = str("Unknown");  // String (interné)
  target = entityRef(0);  // Référence à une entité
}
```

---

## Types Numériques

### Tableau récapitulatif

| Fonction | Type | Taille | Plage | TypedArray |
|----------|------|--------|-------|------------|
| `f32()` | Float 32 | 4 octets | ±3.4×10³⁸ | `Float32Array` |
| `f64()` | Float 64 | 8 octets | ±1.8×10³⁰⁸ | `Float64Array` |
| `i8()` | Int signé 8 | 1 octet | -128 à 127 | `Int8Array` |
| `i16()` | Int signé 16 | 2 octets | -32768 à 32767 | `Int16Array` |
| `i32()` | Int signé 32 | 4 octets | -2.1×10⁹ à 2.1×10⁹ | `Int32Array` |
| `u8()` | Int non-signé 8 | 1 octet | 0 à 255 | `Uint8Array` |
| `u16()` | Int non-signé 16 | 2 octets | 0 à 65535 | `Uint16Array` |
| `u32()` | Int non-signé 32 | 4 octets | 0 à 4.3×10⁹ | `Uint32Array` |

### Quand utiliser quoi ?

```typescript
@component
class Character {
  // Position - utilise f32 pour les coordonnées fractionnelles
  x = f32(0);
  y = f32(0);

  // Santé - utilise u32 (jamais négatif, potentiellement grand)
  health = u32(100);
  maxHealth = u32(100);

  // Niveau - utilise u8 si max 255, u16 si plus
  level = u8(1);

  // Dégâts - peut être négatif (soins = dégâts négatifs)
  damage = i32(0);

  // ID d'un tileset - 0-255 suffit généralement
  tileId = u8(0);

  // Précision élevée (rare) - physique réaliste
  preciseAngle = f64(0);
}
```

### Visualisation mémoire

```
u8(0)   →  [████████]                     1 octet
u16(0)  →  [████████████████]             2 octets
u32(0)  →  [████████████████████████████████]  4 octets
f32(0)  →  [████████████████████████████████]  4 octets
f64(0)  →  [████████████████████████████████████████████████████████████████]  8 octets
```

---

## Type Booléen

```typescript
import { bool } from "./ecs";

@component
class Flags {
  isAlive = bool(true);
  isVisible = bool(true);
  canMove = bool(true);
  isInvincible = bool(false);
}
```

### Stockage interne

Les booléens sont stockés comme `u8` (1 octet) :
- `false` = 0
- `true` = 1

```typescript
// Utilisation
world.set(entity, Flags, { isAlive: false });  // Stocke 0
world.set(entity, Flags, { isAlive: true });   // Stocke 1

const flags = world.get(entity, Flags);
if (flags.isAlive) { /* ... */ }  // Fonctionne normalement
```

---

## Type String

Les strings sont **internées** dans un `StringPool` pour économiser la mémoire.

```typescript
import { str } from "./ecs";

@component
class Item {
  name = str("Unknown");        // Défaut = "Unknown"
  description = str("");        // Défaut = chaîne vide
}
```

### Comment ça marche ?

```
┌──────────────────────────────────────────────────────────────┐
│                      StringPool                               │
│                                                              │
│  Index │ String                                              │
│  ──────┼─────────────────                                    │
│    0   │ ""  (toujours vide)                                │
│    1   │ "Unknown"                                           │
│    2   │ "Épée de feu"                                       │
│    3   │ "Potion de vie"                                     │
│                                                              │
└──────────────────────────────────────────────────────────────┘

Dans le composant, on stocke l'INDEX (u32), pas la string :

Entity 1 : Item.name = 2  →  "Épée de feu"
Entity 2 : Item.name = 3  →  "Potion de vie"
Entity 3 : Item.name = 2  →  "Épée de feu" (même index = même string)
```

### Utilisation

```typescript
// ❌ NE PAS utiliser world.get() pour les strings !
const item = world.get(entity, Item);
console.log(item.name);  // Affiche un NOMBRE (l'index), pas la string !

// ✅ Utiliser getString() et setString()
const name = world.getString(entity, Item, "name");
console.log(name);  // "Épée de feu"

world.setString(entity, Item, "name", "Nouvelle épée");
```

### Avantages de l'interning

```
Sans interning (1000 gobelins nommés "Goblin") :
  Mémoire = 1000 × "Goblin" = 6000+ octets

Avec interning :
  StringPool : "Goblin" = 1 fois = 6 octets
  Composants : 1000 × u32 = 4000 octets
  Total = ~4006 octets (économie de 33%)

Et pour les comparaisons :
  Sans interning : strcmp("Goblin", "Goblin") = O(n)
  Avec interning : index1 === index2 = O(1)
```

> 📖 Voir [04 - String Fields](./04-string-fields.md) pour plus de détails.

---

## Type Entity Reference

Permet de référencer une autre entité.

```typescript
import { entityRef } from "./ecs";

@component
class Targeting {
  target = entityRef(0);  // 0 = NULL_ENTITY par défaut
}

@component
class Parent {
  parent = entityRef(0);
}
```

### Utilisation

```typescript
const player = world.spawn(Position);
const enemy = world.spawn(Position, Targeting);

// ❌ NE PAS utiliser world.set() directement !
world.set(enemy, Targeting, { target: player });  // Pas de validation

// ✅ Utiliser setEntityRef() pour le tracking
world.setEntityRef(enemy, Targeting, "target", player);

// ✅ Utiliser getEntityRef() pour la validation automatique
const target = world.getEntityRef(enemy, Targeting, "target");
if (target !== null) {
  // La cible est vivante
} else {
  // La cible est morte ou n'existe pas
}
```

### Validation automatique

```typescript
const target = world.spawn(Position);
world.setEntityRef(enemy, Targeting, "target", target);

// Plus tard...
world.despawn(target);  // La cible meurt

// getEntityRef() détecte automatiquement que la cible est morte
const ref = world.getEntityRef(enemy, Targeting, "target");
console.log(ref);  // null (pas l'entité morte !)
```

> 📖 Voir [05 - Entity References](./05-entity-references.md) pour plus de détails.

---

## Tag Components

Un composant **sans champs** est un "tag" - il sert juste à marquer une entité.

```typescript
@component
class Player {}      // Tag : "cette entité est le joueur"

@component
class Enemy {}       // Tag : "cette entité est un ennemi"

@component
class Poisoned {}    // Tag : "cette entité est empoisonnée"

@component
class Dead {}        // Tag : "cette entité est morte"
```

### Utilisation

```typescript
// Ajouter un tag
world.add(entity, Poisoned);

// Vérifier un tag
if (world.has(entity, Poisoned)) {
  // Appliquer les dégâts de poison
}

// Retirer un tag
world.remove(entity, Poisoned);

// Query avec tags
world.query(Health, Poisoned).run(view => {
  // Toutes les entités empoisonnées avec de la santé
});

// Query excluant un tag
world.query(Health).not(Dead).run(view => {
  // Toutes les entités vivantes avec de la santé
});
```

### Avantage mémoire

```
Composant normal :
  @component class Status { isPoisoned = bool(false); }
  → 1 octet par entité, même si false

Tag component :
  @component class Poisoned {}
  → 0 octet par entité sans le tag
  → L'entité est juste dans un archetype différent
```

---

## Valeurs par Défaut

Chaque type accepte une valeur par défaut :

```typescript
@component
class Character {
  x = f32(0);           // Défaut : 0.0
  y = f32(0);           // Défaut : 0.0
  health = u32(100);    // Défaut : 100
  name = str("Héros");  // Défaut : "Héros"
  isAlive = bool(true); // Défaut : true
}

// Spawn avec les valeurs par défaut
const hero = world.spawn(Character);
// x=0, y=0, health=100, name="Héros", isAlive=true

// Override partiel
world.set(hero, Character, { health: 50 });
// x=0, y=0, health=50, name="Héros", isAlive=true
```

---

## Enum et Constantes

Pour les énumérations, utilise des entiers :

```typescript
// Définir l'enum
enum AIState {
  Idle = 0,
  Patrol = 1,
  Chase = 2,
  Attack = 3,
  Flee = 4,
}

@component
class AI {
  state = u8(AIState.Idle);  // u8 suffit pour < 256 valeurs
}

// Utilisation
world.set(entity, AI, { state: AIState.Chase });

const ai = world.get(entity, AI);
if (ai.state === AIState.Attack) {
  // Attaquer
}
```

---

## Résumé visuel

```
┌─────────────────────────────────────────────────────────────┐
│                    Types de Champs                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  NUMÉRIQUES           SPÉCIAUX           TAGS              │
│  ───────────          ────────           ────              │
│  f32() f64()          str()              (pas de champs)   │
│  i8() i16() i32()     entityRef()                          │
│  u8() u16() u32()     bool()                               │
│                                                             │
│  ┌─────────┐          ┌─────────┐        ┌─────────┐       │
│  │ Stocké  │          │ Stocké  │        │ Aucun   │       │
│  │ direct  │          │ comme   │        │ stockage│       │
│  │ TypedArr│          │ index   │        │         │       │
│  └─────────┘          └─────────┘        └─────────┘       │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

**Suivant :** [03 - Queries](./03-queries.md)
