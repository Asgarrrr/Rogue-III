# 04 - String Fields

> Gestion efficace des chaînes de caractères

## Le Problème

Les strings en JavaScript sont des objets sur le heap. Si on les stockait directement dans nos composants, on casserait le pattern SoA et les performances.

```typescript
// ❌ CE QU'ON NE PEUT PAS FAIRE
@component
class Item {
  name: string = "Unknown";  // Objet JS, pas un nombre !
}

// Impossible de stocker dans un TypedArray
Float32Array([10, 20, "Épée", 40])  // ❌ Erreur !
```

## La Solution : String Interning

On utilise un **StringPool** qui stocke les strings une seule fois, et on référence par **index**.

```
┌──────────────────────────────────────────────────────────────────┐
│                         StringPool                                │
│                                                                  │
│   Index │ String                                                 │
│   ──────┼────────────────────                                    │
│     0   │ ""              (toujours réservé pour chaîne vide)   │
│     1   │ "Unknown"                                              │
│     2   │ "Épée de feu"                                          │
│     3   │ "Potion de vie"                                        │
│     4   │ "Goblin"                                               │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘

Dans les composants, on stocke l'INDEX (u32) :

┌─────────────────────────────────────┐
│ Archetype [Item]                    │
│                                     │
│  Item.name (u32) : [1, 2, 3, 4, 4] │  ← Indices dans le pool
│                     │  │  │  │  │   │
│                     │  │  │  │  └──── "Goblin"
│                     │  │  │  └─────── "Goblin" (même index!)
│                     │  │  └────────── "Potion de vie"
│                     │  └───────────── "Épée de feu"
│                     └──────────────── "Unknown"
└─────────────────────────────────────┘
```

---

## Définir un champ String

```typescript
import { component, str, u32 } from "./ecs-v2";

@component
class Item {
  name = str("Unknown");        // String avec défaut "Unknown"
  description = str("");        // String vide par défaut
  value = u32(0);               // Prix
}

@component
class Character {
  name = str("Unnamed");
  title = str("");              // "Le Grand", "de la Forêt", etc.
}
```

---

## Lire et Écrire des Strings

### ⚠️ Important : N'utilise PAS `world.get()` pour les strings !

```typescript
const item = world.get(entity, Item);
console.log(item.name);  // ❌ Affiche un NOMBRE (l'index), pas la string !
```

### ✅ Utilise `getString()` et `setString()`

```typescript
// Lire une string
const name = world.getString(entity, Item, "name");
console.log(name);  // "Épée de feu"

// Écrire une string
world.setString(entity, Item, "name", "Nouvelle épée");
world.setString(entity, Item, "description", "Une épée brillante");
```

### Signature complète

```typescript
// Lecture
getString<T>(
  entity: Entity,
  componentType: ComponentClass<T>,
  fieldName: keyof T & string
): string | null

// Écriture
setString<T>(
  entity: Entity,
  componentType: ComponentClass<T>,
  fieldName: keyof T & string,
  value: string
): boolean
```

### Valeurs de retour

```typescript
// getString retourne null si :
// - L'entité n'existe pas
// - L'entité n'a pas le composant
// - Le champ n'est pas de type string

const name = world.getString(entity, Item, "name");
if (name === null) {
  console.log("Impossible de lire le nom");
}

// setString retourne false si :
// - L'entité n'existe pas
// - L'entité n'a pas le composant
// - Le champ n'est pas de type string

const success = world.setString(entity, Item, "name", "Test");
if (!success) {
  console.log("Impossible de définir le nom");
}
```

---

## Le StringPool en détail

### Accéder au pool

```typescript
// Pool global (partagé par défaut)
import { globalStringPool, getStringPool } from "./ecs-v2";

const pool = getStringPool();  // Même que globalStringPool

// Pool du World
const pool = world.strings;
```

### Opérations sur le pool

```typescript
const pool = world.strings;

// Interner une string (ajouter ou récupérer l'index existant)
const index = pool.intern("Nouvelle string");

// Récupérer une string par index
const str = pool.get(index);  // "Nouvelle string"

// Vérifier si une string est internée
if (pool.has("Test")) {
  console.log("'Test' est dans le pool");
}

// Nombre de strings dans le pool
console.log(pool.size);  // Inclut la chaîne vide à l'index 0
```

### Export / Import (pour la sérialisation)

```typescript
// Exporter toutes les strings (sans l'index 0)
const strings = pool.export();  // ["Unknown", "Épée", "Potion", ...]

// Importer dans un nouveau pool
const newPool = new StringPool();
const mapping = newPool.import(strings);
// mapping: Map<oldIndex, newIndex>
```

### Statistiques

```typescript
const stats = pool.getStats();
console.log(stats);
// {
//   stringCount: 42,       // Nombre de strings uniques
//   totalCharacters: 350   // Total des caractères
// }
```

---

## Avantages de l'Interning

### 1. Économie de mémoire

```
Scénario : 1000 gobelins avec name = "Goblin"

SANS interning :
  1000 × "Goblin" (objet JS) ≈ 1000 × 100 octets = 100 KB

AVEC interning :
  1 × "Goblin" dans le pool = ~50 octets
  1000 × u32 (index) = 4000 octets
  Total ≈ 4 KB

Économie : ~96% !
```

### 2. Comparaison O(1)

```typescript
// SANS interning - O(n) où n = longueur de la string
if (name1 === name2) { /* strcmp caractère par caractère */ }

// AVEC interning - O(1)
if (index1 === index2) { /* Comparaison d'entiers */ }
```

### 3. Compatible SoA

```typescript
// Les indices sont des u32, stockables dans TypedArray
Uint32Array([1, 2, 3, 4, 4, 1, 2, ...])  // ✅ Cache-friendly
```

---

## Patterns d'utilisation

### Nommer des entités

```typescript
@component
class Named {
  name = str("Unnamed");
}

// Créer une entité nommée
const hero = world.spawn(Named, Position, Health);
world.setString(hero, Named, "name", "Arthas");

// Trouver une entité par nom
function findByName(world: World, targetName: string): Entity | null {
  for (const entity of world.query(Named).iter()) {
    const name = world.getString(entity, Named, "name");
    if (name === targetName) {
      return entity;
    }
  }
  return null;
}

const arthas = findByName(world, "Arthas");
```

### Items avec descriptions

```typescript
@component
class Item {
  name = str("");
  description = str("");
  rarity = str("common");  // "common", "rare", "epic", "legendary"
}

// Créer un item
const sword = world.spawn(Item);
world.setString(sword, Item, "name", "Épée du Dragon");
world.setString(sword, Item, "description", "Une épée forgée dans le feu d'un dragon");
world.setString(sword, Item, "rarity", "legendary");

// Afficher l'item
function displayItem(world: World, item: Entity) {
  const name = world.getString(item, Item, "name");
  const desc = world.getString(item, Item, "description");
  const rarity = world.getString(item, Item, "rarity");

  console.log(`[${rarity?.toUpperCase()}] ${name}`);
  console.log(desc);
}
```

### Dialogues et textes

```typescript
@component
class DialogueLine {
  speaker = str("");
  text = str("");
}

// Créer des lignes de dialogue
function addDialogue(world: World, speaker: string, text: string) {
  const line = world.spawn(DialogueLine);
  world.setString(line, DialogueLine, "speaker", speaker);
  world.setString(line, DialogueLine, "text", text);
  return line;
}

addDialogue(world, "Garde", "Halte ! Qui va là ?");
addDialogue(world, "Héros", "Je suis un voyageur.");
```

---

## Combinaison avec d'autres champs

```typescript
@component
class Character {
  // Champs numériques
  x = f32(0);
  y = f32(0);
  health = u32(100);
  level = u8(1);

  // Champs string
  name = str("Unknown");
  className = str("Warrior");
}

// Utilisation mixte
const hero = world.spawn(Character);

// Numériques via set()
world.set(hero, Character, { x: 100, y: 200, health: 150, level: 5 });

// Strings via setString()
world.setString(hero, Character, "name", "Gandalf");
world.setString(hero, Character, "className", "Mage");

// Lecture mixte
const data = world.get(hero, Character);  // { x: 100, y: 200, health: 150, level: 5, name: INDEX, className: INDEX }
const name = world.getString(hero, Character, "name");  // "Gandalf"
```

---

## Cas spéciaux

### Chaîne vide

```typescript
// L'index 0 est toujours la chaîne vide
const emptyIndex = pool.intern("");  // Retourne 0
const empty = pool.get(0);  // ""

// Définir une chaîne vide
world.setString(entity, Item, "description", "");
```

### Caractères Unicode

```typescript
// Les caractères Unicode fonctionnent normalement
world.setString(entity, Character, "name", "Héros légendaire");
world.setString(entity, Character, "name", "日本語");
world.setString(entity, Character, "name", "🗡️ Épée");

const name = world.getString(entity, Character, "name");
// Fonctionne correctement
```

### Strings très longues

```typescript
// Pas de limite technique, mais attention à la mémoire
const longText = "A".repeat(10000);
world.setString(entity, Item, "description", longText);

// Le pool stocke la string une seule fois
// Même si 100 entités ont la même description
```

---

## Résumé

```
┌────────────────────────────────────────────────────────────────┐
│                    STRING FIELDS                                │
│                                                                │
│  Définition          Lecture              Écriture             │
│  ──────────          ───────              ────────             │
│  str("défaut")       getString()          setString()          │
│                                                                │
│                                                                │
│  ┌─────────────┐     ┌─────────────┐     ┌─────────────┐      │
│  │  Component  │     │  StringPool │     │  Stockage   │      │
│  │  name = str │────►│  "Hello"→1  │◄────│  [1,1,2,3]  │      │
│  │             │     │  "World"→2  │     │  (indices)  │      │
│  └─────────────┘     └─────────────┘     └─────────────┘      │
│                                                                │
│  Avantages :                                                   │
│  • Économie mémoire (strings partagées)                        │
│  • Comparaison O(1)                                            │
│  • Compatible avec SoA (TypedArrays)                           │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

**Suivant :** [05 - Entity References](./05-entity-references.md)
