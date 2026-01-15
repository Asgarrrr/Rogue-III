# Migrations de Schéma

Les migrations permettent de faire évoluer la structure de vos données ECS tout en préservant la compatibilité avec les anciennes sauvegardes.

---

## Pourquoi des Migrations ?

Au fil du développement, votre schéma ECS évolue :

```
Version 1.0.0                    Version 1.1.0
─────────────                    ─────────────
Position                         Position
  - x: f32                         - x: f32
  - y: f32                         - y: f32
                                   - z: f32  ← Nouveau champ !

Health                           Vitality  ← Renommé !
  - hp: f32                        - current: f32  ← Renommé !
  - max: f32                       - maximum: f32  ← Renommé !
```

Sans migrations, les anciennes sauvegardes deviennent **incompatibles**.

---

## Architecture du Système

```
┌─────────────────────────────────────────────────────────────────┐
│                    MigrationRegistry                             │
│                                                                  │
│   ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐     │
│   │ 1.0.0   │───►│ 1.0.1   │───►│ 1.0.2   │───►│ 1.1.0   │     │
│   │  to     │    │  to     │    │  to     │    │ CURRENT │     │
│   │ 1.0.1   │    │ 1.0.2   │    │ 1.1.0   │    │         │     │
│   └─────────┘    └─────────┘    └─────────┘    └─────────┘     │
│                                                                  │
│   Les migrations forment une chaîne de transformations          │
└─────────────────────────────────────────────────────────────────┘

Snapshot v1.0.0 ──► Migration ──► Migration ──► Migration ──► World v1.1.0
```

---

## Interface Migration

Chaque migration implémente cette interface :

```typescript
interface Migration {
  readonly fromVersion: string;    // Version source (ex: "1.0.0")
  readonly toVersion: string;      // Version cible (ex: "1.0.1")
  readonly description?: string;   // Description lisible

  migrate(snapshot: WorldSnapshot): WorldSnapshot;
}
```

---

## Créer des Migrations

### Migration Manuelle

```typescript
import type { Migration, WorldSnapshot } from "./migration";

const migration_1_0_0_to_1_0_1: Migration = {
  fromVersion: "1.0.0",
  toVersion: "1.0.1",
  description: "Add z coordinate to Position",

  migrate(snapshot: WorldSnapshot): WorldSnapshot {
    return {
      ...snapshot,
      version: "1.0.1",
      entities: snapshot.entities.map(entity => {
        const position = entity.components["Position"];
        if (position) {
          return {
            ...entity,
            components: {
              ...entity.components,
              Position: {
                ...position,
                z: 0  // Valeur par défaut
              }
            }
          };
        }
        return entity;
      })
    };
  }
};
```

### Fonctions Helper

Le système fournit des helpers pour les cas courants :

#### Ajouter un champ

```typescript
import { addFieldMigration } from "./migration";

const addZToPosition = addFieldMigration(
  "1.0.0",           // fromVersion
  "1.0.1",           // toVersion
  "Position",        // componentName
  "z",               // fieldName
  0,                 // defaultValue
  "Add z coordinate" // description (optionnel)
);
```

#### Supprimer un champ

```typescript
import { removeFieldMigration } from "./migration";

const removeDebugFlag = removeFieldMigration(
  "1.0.1",
  "1.0.2",
  "Config",
  "debugMode",
  "Remove debug mode flag"
);
```

#### Renommer un champ

```typescript
import { renameFieldMigration } from "./migration";

const renameHpToCurrent = renameFieldMigration(
  "1.0.2",
  "1.0.3",
  "Health",
  "hp",        // ancien nom
  "current",   // nouveau nom
  "Rename hp to current"
);
```

#### Renommer un composant

```typescript
import { renameComponentMigration } from "./migration";

const renameHealthToVitality = renameComponentMigration(
  "1.0.3",
  "1.1.0",
  "Health",    // ancien nom
  "Vitality",  // nouveau nom
  "Rename Health component to Vitality"
);
```

#### Supprimer un composant

```typescript
import { removeComponentMigration } from "./migration";

const removeObsoleteComponent = removeComponentMigration(
  "1.1.0",
  "1.2.0",
  "DeprecatedFeature",
  "Remove deprecated feature component"
);
```

#### Transformer une valeur

```typescript
import { transformFieldMigration } from "./migration";

// Convertir les points de vie de pourcentage (0-100) à valeur absolue (0-1000)
const scaleHealth = transformFieldMigration(
  "1.2.0",
  "1.2.1",
  "Health",
  "current",
  (value) => value * 10,  // Fonction de transformation
  "Scale health values by 10x"
);
```

---

## Helpers Avancés

### createEntityMigration

Pour créer des migrations personnalisées sur les entités :

```typescript
import { createEntityMigration, type EntityTransformer } from "./migration";

const transformer: EntityTransformer = (entity) => {
  // Logique personnalisée
  if (entity.components["Position"] && entity.components["Velocity"]) {
    // Combiner Position et Velocity en un nouveau composant
    const pos = entity.components["Position"];
    const vel = entity.components["Velocity"];

    const { Position, Velocity, ...restComponents } = entity.components;

    return {
      ...entity,
      components: {
        ...restComponents,
        PhysicsBody: {
          x: pos.x,
          y: pos.y,
          vx: vel.x,
          vy: vel.y
        }
      }
    };
  }
  return entity;
};

const mergeComponents = createEntityMigration(
  "2.0.0",
  "2.1.0",
  transformer,
  "Merge Position and Velocity into PhysicsBody"
);
```

### composeMigrations

Pour combiner plusieurs transformations en une seule migration :

```typescript
import { composeMigrations } from "./migration";

// Plusieurs changements dans une même version
const bigUpdate = composeMigrations(
  "2.0.0",
  "3.0.0",
  [
    // Transformation 1 : Ajouter un champ
    (snapshot) => ({
      ...snapshot,
      entities: snapshot.entities.map(e => ({
        ...e,
        components: e.components["Position"]
          ? { ...e.components, Position: { ...e.components["Position"], z: 0 } }
          : e.components
      }))
    }),

    // Transformation 2 : Renommer un composant
    (snapshot) => ({
      ...snapshot,
      entities: snapshot.entities.map(e => {
        if ("Health" in e.components) {
          const { Health, ...rest } = e.components;
          return { ...e, components: { ...rest, Vitality: Health } };
        }
        return e;
      })
    }),

    // Transformation 3 : Supprimer un composant obsolète
    (snapshot) => ({
      ...snapshot,
      entities: snapshot.entities.map(e => {
        const { OldComponent, ...rest } = e.components;
        return { ...e, components: rest };
      })
    })
  ],
  "Major version upgrade with multiple changes"
);
```

---

## MigrationRegistry

Le registre gère l'ensemble des migrations :

```typescript
import { MigrationRegistry } from "./migration";

// Créer un registre
const migrations = new MigrationRegistry();

// Enregistrer des migrations (dans l'ordre chronologique)
migrations.register(migration_1_0_0_to_1_0_1);
migrations.register(migration_1_0_1_to_1_0_2);
migrations.register(migration_1_0_2_to_1_1_0);

// Ou enregistrer en masse
migrations.registerAll([
  migration_1_0_0_to_1_0_1,
  migration_1_0_1_to_1_0_2,
  migration_1_0_2_to_1_1_0
]);
```

### Méthodes du Registre

| Méthode | Description |
|---------|-------------|
| `register(migration)` | Enregistrer une migration |
| `registerAll(migrations)` | Enregistrer plusieurs migrations |
| `canMigrate(from, to)` | Vérifier si un chemin de migration existe |
| `getMigrationPath(from, to)` | Obtenir la liste des migrations à appliquer |
| `migrate(snapshot, targetVersion)` | Appliquer les migrations |
| `getAvailableVersions()` | Lister toutes les versions source |
| `count` | Nombre de migrations enregistrées |
| `clear()` | Supprimer toutes les migrations |

---

## Registre Global

Un registre global est fourni par défaut :

```typescript
import { globalMigrations } from "./migration";

// Enregistrer vos migrations au démarrage de l'application
globalMigrations.register(addZToPosition);
globalMigrations.register(renameHpToCurrent);

// Le WorldSerializer utilise globalMigrations par défaut
const world = deserializeWorld(oldSnapshot);
```

---

## Flux de Migration

```
┌────────────────────────────────────────────────────────────────┐
│           Snapshot v1.0.0 arrive pour désérialisation          │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│  Version actuelle = 1.1.0                                       │
│  Version snapshot = 1.0.0                                       │
│                                                                 │
│  ► Version différente → Migration nécessaire                   │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│  getMigrationPath("1.0.0", "1.1.0")                            │
│                                                                 │
│  Résultat : [                                                   │
│    Migration 1.0.0 → 1.0.1,                                    │
│    Migration 1.0.1 → 1.0.2,                                    │
│    Migration 1.0.2 → 1.1.0                                     │
│  ]                                                              │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│  Appliquer les migrations en séquence                          │
│                                                                 │
│  snapshot = migration_1.migrate(snapshot)  // → v1.0.1         │
│  snapshot = migration_2.migrate(snapshot)  // → v1.0.2         │
│  snapshot = migration_3.migrate(snapshot)  // → v1.1.0         │
└────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌────────────────────────────────────────────────────────────────┐
│  Snapshot v1.1.0 prêt pour désérialisation normale             │
└────────────────────────────────────────────────────────────────┘
```

---

## Exemple Complet

### Définir les Migrations

```typescript
// migrations/index.ts
import {
  MigrationRegistry,
  addFieldMigration,
  renameFieldMigration,
  renameComponentMigration,
  removeComponentMigration
} from "../ecs/migration";

export const gameMigrations = new MigrationRegistry();

// v1.0.0 → v1.1.0 : Ajouter la coordonnée Z
gameMigrations.register(
  addFieldMigration("1.0.0", "1.1.0", "Position", "z", 0)
);

// v1.1.0 → v1.2.0 : Renommer hp en current
gameMigrations.register(
  renameFieldMigration("1.1.0", "1.2.0", "Health", "hp", "current")
);

// v1.2.0 → v1.3.0 : Renommer max en maximum
gameMigrations.register(
  renameFieldMigration("1.2.0", "1.3.0", "Health", "max", "maximum")
);

// v1.3.0 → v2.0.0 : Renommer Health en Vitality
gameMigrations.register(
  renameComponentMigration("1.3.0", "2.0.0", "Health", "Vitality")
);

// v2.0.0 → v2.1.0 : Supprimer composant obsolète
gameMigrations.register(
  removeComponentMigration("2.0.0", "2.1.0", "LegacyStats")
);
```

### Utiliser avec le Serializer

```typescript
// game/save-system.ts
import { WorldSerializer } from "../ecs/serialization";
import { gameMigrations } from "./migrations";

const serializer = new WorldSerializer({
  migrations: gameMigrations,
  relationTypes: [ChildOf, Contains],
  skipUnknownComponents: true
});

export function loadSave(saveData: string): World {
  const snapshot = JSON.parse(saveData);

  // Vérifier la compatibilité
  if (!serializer.canDeserialize(snapshot)) {
    throw new Error("Sauvegarde trop ancienne, impossible de migrer");
  }

  // Afficher le chemin de migration (optionnel, pour debug)
  const path = serializer.getMigrationPath(snapshot);
  if (path.length > 0) {
    console.log(`Migration de v${snapshot.version} vers v2.1.0:`);
    path.forEach(m => console.log(`  - ${m}`));
  }

  return serializer.deserialize(snapshot);
}
```

---

## Gestion des Erreurs

### Chemin de Migration Manquant

```typescript
const registry = new MigrationRegistry();
registry.register(addFieldMigration("1.0.0", "1.1.0", "Position", "z", 0));
// Pas de migration 1.1.0 → 1.2.0

registry.getMigrationPath("1.0.0", "1.2.0");
// Error: No migration path from "1.0.0" to "1.2.0".
//        Stuck at version "1.1.0".
//        Available migrations: 1.0.0
```

### Migration Dupliquée

```typescript
registry.register(addFieldMigration("1.0.0", "1.1.0", "A", "x", 0));
registry.register(addFieldMigration("1.0.0", "1.1.0", "B", "y", 0));
// Error: Migration from version "1.0.0" already registered
```

### Protection contre les Boucles

```typescript
// Le système détecte les boucles infinies
// Maximum 100 itérations avant erreur
registry.getMigrationPath("1.0.0", "2.0.0");
// Error: Migration path too long or circular dependency detected
```

---

## Bonnes Pratiques

### 1. Versionner de manière sémantique

```
MAJOR.MINOR.PATCH

MAJOR : Changements incompatibles (suppression de composants critiques)
MINOR : Nouvelles fonctionnalités (nouveaux champs, nouveaux composants)
PATCH : Corrections (ajustements de valeurs)
```

### 2. Une migration par changement atomique

```typescript
// ✅ Bon : Une migration = un changement
gameMigrations.register(addFieldMigration("1.0.0", "1.0.1", "Pos", "z", 0));
gameMigrations.register(renameFieldMigration("1.0.1", "1.0.2", "HP", "hp", "current"));

// ❌ Éviter : Trop de changements dans une migration
// (sauf pour les versions majeures avec composeMigrations)
```

### 3. Toujours tester les migrations

```typescript
describe("Migrations", () => {
  it("should migrate from v1.0.0 to current", () => {
    const oldSnapshot = {
      version: "1.0.0",
      tick: 10,
      entities: [
        { id: 1, components: { Position: { x: 5, y: 10 } } }
      ],
      resources: {}
    };

    const newWorld = serializer.deserialize(oldSnapshot);

    for (const [_, pos] of newWorld.query(Position)) {
      expect(pos.z).toBe(0);  // Champ ajouté par migration
    }
  });
});
```

### 4. Documenter les migrations

```typescript
const migration = addFieldMigration(
  "1.5.0",
  "1.6.0",
  "Combat",
  "criticalChance",
  0.05,
  // Description claire de pourquoi cette migration existe
  "Add critical hit chance (default 5%) for new combat system"
);
```

### 5. Garder les anciennes migrations

```typescript
// Même si personne n'a de save v1.0.0, gardez la migration
// car certains utilisateurs peuvent avoir de très vieilles sauvegardes
migrations.registerAll([
  migration_1_0_0_to_1_0_1,  // Vieille, mais gardée
  migration_1_0_1_to_1_1_0,
  migration_1_1_0_to_2_0_0,
  migration_2_0_0_to_2_1_0   // Actuelle
]);
```

---

## Tableau Récapitulatif des Helpers

| Helper | Usage | Exemple |
|--------|-------|---------|
| `addFieldMigration` | Ajouter un champ | Position.z = 0 |
| `removeFieldMigration` | Supprimer un champ | Config.debugMode |
| `renameFieldMigration` | Renommer un champ | hp → current |
| `renameComponentMigration` | Renommer un composant | Health → Vitality |
| `removeComponentMigration` | Supprimer un composant | LegacyStats |
| `transformFieldMigration` | Transformer une valeur | hp * 10 |
| `createEntityMigration` | Migration personnalisée | Logique complexe |
| `composeMigrations` | Combiner des migrations | Changements multiples |

---

## Voir Aussi

- [12-serialisation.md](./12-serialisation.md) - Sérialisation et désérialisation
- [02-types-de-champs.md](./02-types-de-champs.md) - Types de champs disponibles
- [01-concepts-fondamentaux.md](./01-concepts-fondamentaux.md) - Concepts de base
