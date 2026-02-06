# Sérialisation et Désérialisation

La sérialisation permet de sauvegarder l'état complet du monde ECS (entités, composants, relations, ressources) dans un format JSON, et de le restaurer ultérieurement.

---

## Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────────┐
│                         World                                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐   │
│  │ Entities │ │Components│ │Relations │ │    Resources     │   │
│  └──────────┘ └──────────┘ └──────────┘ └──────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ serialize()
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                       WorldSnapshot                              │
│  {                                                               │
│    version: "1.1.0",                                            │
│    tick: 42,                                                     │
│    entities: [...],                                              │
│    relations: [...],                                             │
│    resources: {...}                                              │
│  }                                                               │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ JSON.stringify()
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Fichier JSON                              │
│  Sauvegardé sur disque, envoyé au client, stocké en base...    │
└─────────────────────────────────────────────────────────────────┘
```

---

## Structure du Snapshot

Un `WorldSnapshot` contient :

| Champ | Type | Description |
|-------|------|-------------|
| `version` | `string` | Version du schéma (ex: "1.1.0") |
| `tick` | `number` | Tick actuel du monde |
| `entities` | `SerializedEntity[]` | Liste des entités sérialisées |
| `relations` | `SerializedRelation[]` | Relations entre entités (optionnel) |
| `resources` | `Record<string, unknown>` | Ressources globales |

### SerializedEntity

```typescript
interface SerializedEntity {
  id: number;                                    // ID de l'entité
  components: Record<string, Record<string, number>>; // Composants et leurs données
}

// Exemple
{
  id: 1,
  components: {
    "Position": { x: 10, y: 20 },
    "Health": { current: 100, max: 100 },
    "Player": {}  // Tag (pas de données)
  }
}
```

### SerializedRelation

```typescript
interface SerializedRelation {
  type: string;      // Nom du type de relation
  source: number;    // ID entité source
  target: number;    // ID entité cible
  data?: unknown;    // Données optionnelles
}

// Exemple
{
  type: "ChildOf",
  source: 5,
  target: 1
}
```

---

## Utilisation Basique

### Sérialisation rapide

```typescript
import { serializeWorld, deserializeWorld } from "./serialization";

// Créer un monde avec des entités
const world = new World();
const player = world.spawn(Position, Health, Player);
world.set(player, Position, { x: 10, y: 20 });
world.set(player, Health, { current: 100, max: 100 });

// Sérialiser
const snapshot = serializeWorld(world);
const json = JSON.stringify(snapshot);

// Sauvegarder (exemple)
fs.writeFileSync("save.json", json);
```

### Désérialisation rapide

```typescript
// Charger
const json = fs.readFileSync("save.json", "utf-8");
const snapshot = JSON.parse(json);

// Restaurer le monde
const world = deserializeWorld(snapshot);

// Le monde est prêt à l'emploi !
for (const [entity, pos] of world.query(Position)) {
  console.log(`Entity ${entity} at (${pos.x}, ${pos.y})`);
}
```

---

## WorldSerializer - Configuration Avancée

Pour plus de contrôle, utilisez la classe `WorldSerializer` :

```typescript
import { WorldSerializer } from "./serialization";

const serializer = new WorldSerializer({
  // Registre de migrations personnalisé
  migrations: myMigrationRegistry,

  // Ignorer les composants inconnus (utile pour la rétrocompatibilité)
  skipUnknownComponents: true,

  // Ignorer les champs inconnus
  skipUnknownFields: true,

  // Ignorer les relations inconnues
  skipUnknownRelations: true,

  // Types de relations à sérialiser
  relationTypes: [ChildOf, Contains, TargetedBy]
});
```

### Options du Serializer

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `migrations` | `MigrationRegistry` | `globalMigrations` | Registre pour les migrations de version |
| `skipUnknownComponents` | `boolean` | `false` | Ignorer les composants non reconnus |
| `skipUnknownFields` | `boolean` | `false` | Ignorer les champs non reconnus |
| `skipUnknownRelations` | `boolean` | `false` | Ignorer les relations non reconnues |
| `relationTypes` | `RelationType[]` | `[]` | Relations à inclure dans le snapshot |

---

## Sérialisation des Relations

Par défaut, les relations ne sont **pas** sérialisées. Vous devez spécifier explicitement lesquelles inclure :

```typescript
import { ChildOf, Contains } from "./relation";

const serializer = new WorldSerializer({
  relationTypes: [ChildOf, Contains]
});

// Les relations seront incluses dans le snapshot
const snapshot = serializer.serialize(world);
```

### Remappage des IDs

Lors de la désérialisation, les entités reçoivent de **nouveaux IDs**. Le serializer maintient un mapping interne pour recréer correctement les relations :

```
Snapshot                    Nouveau World
─────────                   ─────────────
Entity 1 ─ChildOf─► Entity 2    Entity 7 ─ChildOf─► Entity 8
   │                               │
   ▼                               ▼
(ID 1 → 7, ID 2 → 8)          Relations préservées !
```

---

## Flux de Sérialisation

```
┌────────────────────────────────────────────────────────────────┐
│                     serialize(world)                            │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Parcourir tous les archétypes                              │
│     ┌─────────────────────────────────────────────────────┐    │
│     │ for (archetype of world.archetypes)                 │    │
│     │   for (row = 0; row < archetype.count; row++)       │    │
│     │     entity = archetype.getEntity(row)               │    │
│     │     components = extraire les données               │    │
│     └─────────────────────────────────────────────────────┘    │
│                                                                 │
│  2. Pour chaque composant                                       │
│     ┌─────────────────────────────────────────────────────┐    │
│     │ if (isTag) → stocker nom seul                       │    │
│     │ else → stocker nom + toutes les valeurs des champs  │    │
│     └─────────────────────────────────────────────────────┘    │
│                                                                 │
│  3. Sérialiser les relations (si configuré)                    │
│     ┌─────────────────────────────────────────────────────┐    │
│     │ for (relationType of options.relationTypes)         │    │
│     │   world.relations.forEach(relationType, callback)   │    │
│     └─────────────────────────────────────────────────────┘    │
│                                                                 │
│  4. Sérialiser les ressources                                  │
│     ┌─────────────────────────────────────────────────────┐    │
│     │ resources = world.resources.toJSON()                │    │
│     └─────────────────────────────────────────────────────┘    │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

---

## Flux de Désérialisation

```
┌────────────────────────────────────────────────────────────────┐
│                   deserialize(snapshot)                         │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Vérifier la version et migrer si nécessaire                │
│     ┌─────────────────────────────────────────────────────┐    │
│     │ if (version !== SNAPSHOT_VERSION)                   │    │
│     │   snapshot = migrations.migrate(snapshot, target)   │    │
│     └─────────────────────────────────────────────────────┘    │
│                                                                 │
│  2. Créer un nouveau monde                                     │
│     ┌─────────────────────────────────────────────────────┐    │
│     │ world = new World(maxEntities)                      │    │
│     │ entityIdMap = new Map<oldId, newId>()               │    │
│     └─────────────────────────────────────────────────────┘    │
│                                                                 │
│  3. Recréer les entités                                        │
│     ┌─────────────────────────────────────────────────────┐    │
│     │ for (serialized of snapshot.entities)               │    │
│     │   newEntity = world.spawn(...componentTypes)        │    │
│     │   entityIdMap.set(serialized.id, newEntity)         │    │
│     │   world.set(newEntity, Component, data)             │    │
│     └─────────────────────────────────────────────────────┘    │
│                                                                 │
│  4. Restaurer les ressources                                   │
│     ┌─────────────────────────────────────────────────────┐    │
│     │ world.resources.fromJSON(snapshot.resources)        │    │
│     └─────────────────────────────────────────────────────┘    │
│                                                                 │
│  5. Recréer les relations (avec remappage des IDs)            │
│     ┌─────────────────────────────────────────────────────┐    │
│     │ for (rel of snapshot.relations)                     │    │
│     │   newSource = entityIdMap.get(rel.source)           │    │
│     │   newTarget = entityIdMap.get(rel.target)           │    │
│     │   world.relate(newSource, relationType, newTarget)  │    │
│     └─────────────────────────────────────────────────────┘    │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

---

## Vérification de Compatibilité

Avant de désérialiser, vous pouvez vérifier si c'est possible :

```typescript
const serializer = new WorldSerializer();

// Vérifier si le snapshot est compatible
if (serializer.canDeserialize(snapshot)) {
  const world = serializer.deserialize(snapshot);
} else {
  console.error("Snapshot incompatible !");
}

// Voir le chemin de migration qui sera appliqué
const path = serializer.getMigrationPath(snapshot);
console.log("Migrations à appliquer:", path);
// ["1.0.0 -> 1.0.1", "1.0.1 -> 1.1.0"]
```

---

## Gestion des Erreurs

### Composants Inconnus

Si un snapshot contient un composant qui n'existe plus :

```typescript
// Sans option → Erreur
const world = deserializeWorld(oldSnapshot);
// Error: Unknown component: OldComponent

// Avec option → Ignoré silencieusement
const serializer = new WorldSerializer({
  skipUnknownComponents: true
});
const world = serializer.deserialize(oldSnapshot); // OK
```

### Relations avec Entités Manquantes

Si une relation référence une entité qui n'a pas été restaurée (par exemple, filtrée car composant inconnu), la relation est silencieusement ignorée.

---

## Exemple Complet : Système de Sauvegarde

```typescript
import { WorldSerializer } from "./serialization";
import { ChildOf, Contains } from "./relation";
import { myMigrations } from "./my-migrations";

// Configuration du serializer
const saveSerializer = new WorldSerializer({
  migrations: myMigrations,
  relationTypes: [ChildOf, Contains],
  skipUnknownComponents: true,  // Tolérant pour les vieilles saves
  skipUnknownFields: true
});

// Sauvegarder
function saveGame(world: World, slotName: string): void {
  const snapshot = saveSerializer.serialize(world);
  const json = JSON.stringify(snapshot, null, 2);

  localStorage.setItem(`save-${slotName}`, json);
  console.log(`Jeu sauvegardé (${snapshot.entities.length} entités)`);
}

// Charger
function loadGame(slotName: string): World | null {
  const json = localStorage.getItem(`save-${slotName}`);
  if (!json) return null;

  const snapshot = JSON.parse(json);

  // Vérifier la compatibilité
  if (!saveSerializer.canDeserialize(snapshot)) {
    console.error("Sauvegarde incompatible");
    return null;
  }

  // Afficher les migrations nécessaires
  const migrations = saveSerializer.getMigrationPath(snapshot);
  if (migrations.length > 0) {
    console.log("Application des migrations:", migrations);
  }

  return saveSerializer.deserialize(snapshot);
}

// Utilisation
saveGame(gameWorld, "slot1");
// ...
const restoredWorld = loadGame("slot1");
```

---

## Bonnes Pratiques

### 1. Toujours versionner vos snapshots

```typescript
// Le serializer le fait automatiquement via SNAPSHOT_VERSION
export const SNAPSHOT_VERSION = "1.1.0";
```

### 2. Utiliser les migrations pour les évolutions de schéma

Voir le document [13-migrations.md](./13-migrations.md) pour les détails.

### 3. Être explicite sur les relations à sauvegarder

```typescript
// Mauvais : oubli des relations
const snapshot = serializeWorld(world);

// Bon : relations explicites
const serializer = new WorldSerializer({
  relationTypes: [ChildOf, Contains, TargetedBy]
});
const snapshot = serializer.serialize(world);
```

### 4. Gérer les cas d'erreur

```typescript
try {
  const world = serializer.deserialize(snapshot);
} catch (error) {
  if (error.message.includes("Unknown component")) {
    // Composant supprimé → utiliser skipUnknownComponents
  } else if (error.message.includes("No migration path")) {
    // Version trop ancienne → sauvegarde incompatible
  }
}
```

---

## Points Clés à Retenir

| Concept | Description |
|---------|-------------|
| **WorldSnapshot** | Structure JSON contenant l'état complet du monde |
| **Version** | Chaque snapshot a une version pour gérer les évolutions |
| **Relations** | Doivent être explicitement incluses via `relationTypes` |
| **Remappage IDs** | Les IDs d'entités sont remappés lors de la désérialisation |
| **Migrations** | Appliquées automatiquement si version différente |
| **Tolérance** | Options `skipUnknown*` pour ignorer données obsolètes |

---

## Voir Aussi

- [13-migrations.md](./13-migrations.md) - Migrations de schéma
- [06-relations.md](./06-relations.md) - Système de relations
- [01-concepts-fondamentaux.md](./01-concepts-fondamentaux.md) - Concepts de base
