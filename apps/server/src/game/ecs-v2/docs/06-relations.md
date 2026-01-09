# 06 - Relations

> Liens entre entités : parent/enfant, inventaire, équipe...

## Concept

Les **Relations** permettent de créer des liens typés entre entités, avec des fonctionnalités avancées comme le cascade delete.

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   Entity A ──── ChildOf ────► Entity B (Parent)                │
│                                                                 │
│   Entity C ──── Contains ───► Entity D (Item)                  │
│                                                                 │
│   Entity E ──── Targets ────► Entity F (Enemy)                 │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Relations vs Entity References

| Aspect | Relations | Entity References |
|--------|-----------|-------------------|
| **Multiplicité** | N relations par type | 1 par champ |
| **Cascade delete** | Oui (configurable) | Non |
| **Query** | `relatedTo()`, `childrenOf()` | Via composant |
| **Stockage** | Table séparée | Dans le composant |
| **Use case** | Hiérarchies, inventaires | Ciblage simple |

```typescript
// Entity Reference - "Qui est ma cible ?"
@component class Targeting { target = entityRef(0); }

// Relation - "Quels sont mes enfants ?" "Que contient cet inventaire ?"
const ChildOf = defineRelation("ChildOf", { cascadeDelete: true });
```

---

## Définir une Relation

```typescript
import { defineRelation } from "./ecs-v2";

// Relation simple
const ChildOf = defineRelation("ChildOf");

// Relation avec cascade delete
const Contains = defineRelation("Contains", {
  cascadeDelete: true,  // Quand le conteneur meurt, le contenu aussi
});

// Relation pour le ciblage
const Targets = defineRelation("Targets");
```

### Options disponibles

```typescript
interface RelationOptions {
  cascadeDelete?: boolean;  // Supprimer les cibles quand la source meurt
}
```

---

## Relations pré-définies

L'ECS fournit 3 relations courantes :

```typescript
import { ChildOf, Contains, Targets } from "./ecs-v2";

// ChildOf - Hiérarchie parent/enfant (cascade delete)
// Si le parent meurt, les enfants meurent

// Contains - Inventaire/conteneur (cascade delete)
// Si le conteneur meurt, le contenu meurt

// Targets - Ciblage (pas de cascade)
// Si la source meurt, la cible reste
```

---

## Créer des Relations

### Ajouter une relation

```typescript
// Syntaxe : world.relations.add(source, relation, target)

// Parent/enfant
const parent = world.spawn(Position);
const child = world.spawn(Position);
world.relations.add(child, ChildOf, parent);

// Inventaire
const chest = world.spawn(Container);
const sword = world.spawn(Item);
const potion = world.spawn(Item);
world.relations.add(chest, Contains, sword);
world.relations.add(chest, Contains, potion);

// Ciblage
const turret = world.spawn(Position, Turret);
const enemy = world.spawn(Position, Enemy);
world.relations.add(turret, Targets, enemy);
```

### Structure visuelle

```
Après les ajouts ci-dessus :

                    ChildOf
            child ─────────► parent

                    Contains
            chest ─────────► sword
                  ─────────► potion

                    Targets
            turret ────────► enemy
```

---

## Requêtes sur les Relations

### Obtenir les cibles

```typescript
// Tous les enfants d'un parent
const children = world.relations.getTargets(parent, ChildOf);
// → [child1, child2, child3]

// Contenu d'un conteneur
const items = world.relations.getTargets(chest, Contains);
// → [sword, potion]

// Cibles d'une tourelle
const targets = world.relations.getTargets(turret, Targets);
// → [enemy1, enemy2]
```

### Obtenir les sources (relation inverse)

```typescript
// Qui sont les parents de cet enfant ?
const parents = world.relations.getSources(child, ChildOf);
// → [parent]

// Qui contient cet item ?
const containers = world.relations.getSources(sword, Contains);
// → [chest]

// Qui cible cet ennemi ?
const attackers = world.relations.getSources(enemy, Targets);
// → [turret1, turret2]
```

### Vérifier si une relation existe

```typescript
// Est-ce que child est enfant de parent ?
const isChild = world.relations.has(child, ChildOf, parent);
// → true/false

// Est-ce que chest contient sword ?
const hasSword = world.relations.has(chest, Contains, sword);
```

---

## Supprimer des Relations

### Supprimer une relation spécifique

```typescript
// Retirer un item d'un conteneur
world.relations.remove(chest, Contains, sword);
```

### Supprimer toutes les relations d'un type

```typescript
// Retirer tous les items d'un conteneur
world.relations.removeAll(chest, Contains);
```

---

## Cascade Delete

Quand une entité avec des relations `cascadeDelete: true` est supprimée, ses cibles le sont aussi.

```typescript
const ChildOf = defineRelation("ChildOf", { cascadeDelete: true });

// Créer une hiérarchie
const grandparent = world.spawn(Position);
const parent = world.spawn(Position);
const child1 = world.spawn(Position);
const child2 = world.spawn(Position);

world.relations.add(parent, ChildOf, grandparent);
world.relations.add(child1, ChildOf, parent);
world.relations.add(child2, ChildOf, parent);

// Structure :
//
//   grandparent
//        │
//        ▼ ChildOf
//      parent
//       │ │
//       ▼ ▼ ChildOf
//   child1 child2

// Supprimer grandparent
world.despawn(grandparent);

// Résultat : parent, child1, child2 sont AUSSI supprimés !
// (cascade delete récursif)
```

### Diagramme du cascade delete

```
despawn(grandparent)
        │
        ▼
┌───────────────────┐
│ Trouver relations │
│ avec grandparent  │
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│ parent ─ChildOf─► │
│    grandparent    │
│ (cascadeDelete)   │
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│ despawn(parent)   │ ◄── Récursif
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│ child1 ─ChildOf─► │
│      parent       │
│ despawn(child1)   │
│ despawn(child2)   │
└───────────────────┘
```

---

## Patterns d'utilisation

### Hiérarchie de scène

```typescript
@component class Transform {
  x = f32(0);
  y = f32(0);
  rotation = f32(0);
}

// Créer une hiérarchie
const root = world.spawn(Transform);
const body = world.spawn(Transform);
const arm = world.spawn(Transform);
const weapon = world.spawn(Transform);

world.relations.add(body, ChildOf, root);
world.relations.add(arm, ChildOf, body);
world.relations.add(weapon, ChildOf, arm);

// Calculer les transforms globaux
function updateGlobalTransforms(world: World, entity: Entity, parentX = 0, parentY = 0) {
  const transform = world.get(entity, Transform);
  if (!transform) return;

  const globalX = parentX + transform.x;
  const globalY = parentY + transform.y;

  // Stocker le transform global quelque part...

  // Récursivement pour les enfants
  const children = world.relations.getSources(entity, ChildOf);
  for (const child of children) {
    updateGlobalTransforms(world, child, globalX, globalY);
  }
}
```

### Système d'inventaire

```typescript
@component class Item {
  name = str("");
  weight = f32(1);
}

@component class Inventory {
  maxWeight = f32(100);
}

// Ajouter un item à l'inventaire
function addToInventory(world: World, inventory: Entity, item: Entity): boolean {
  const inv = world.get(inventory, Inventory);
  if (!inv) return false;

  // Calculer le poids actuel
  const items = world.relations.getTargets(inventory, Contains);
  let currentWeight = 0;
  for (const existingItem of items) {
    const itemData = world.get(existingItem, Item);
    if (itemData) currentWeight += itemData.weight;
  }

  // Vérifier si on peut ajouter
  const newItem = world.get(item, Item);
  if (!newItem) return false;
  if (currentWeight + newItem.weight > inv.maxWeight) return false;

  // Ajouter la relation
  world.relations.add(inventory, Contains, item);
  return true;
}

// Lister l'inventaire
function listInventory(world: World, inventory: Entity) {
  const items = world.relations.getTargets(inventory, Contains);
  for (const item of items) {
    const name = world.getString(item, Item, "name");
    console.log(`- ${name}`);
  }
}
```

### Système d'équipe

```typescript
const MemberOf = defineRelation("MemberOf");  // Pas de cascade

@component class Team {
  name = str("");
}

// Ajouter un membre à une équipe
function joinTeam(world: World, member: Entity, team: Entity) {
  // Quitter l'équipe actuelle si existe
  const currentTeams = world.relations.getTargets(member, MemberOf);
  for (const t of currentTeams) {
    world.relations.remove(member, MemberOf, t);
  }

  // Rejoindre la nouvelle équipe
  world.relations.add(member, MemberOf, team);
}

// Obtenir les membres d'une équipe
function getTeamMembers(world: World, team: Entity): Entity[] {
  return world.relations.getSources(team, MemberOf);
}
```

---

## API Complète du RelationStore

```typescript
const store = world.relations;

// Ajouter
store.add(source, relation, target);

// Supprimer
store.remove(source, relation, target);
store.removeAll(source, relation);

// Vérifier
store.has(source, relation, target): boolean;

// Requêtes
store.getTargets(source, relation): Entity[];
store.getSources(target, relation): Entity[];

// Statistiques
store.count: number;  // Nombre total de relations
```

---

## Gestion des registres de relations

```typescript
import {
  defineRelation,
  getRelationByName,
  getRelationByIndex,
  getAllRelations,
  getRelationCount,
  hasRelation,
} from "./ecs-v2";

// Obtenir une relation par son nom
const childOf = getRelationByName("ChildOf");

// Obtenir une relation par son index
const relation = getRelationByIndex(0);

// Lister toutes les relations
const allRelations = getAllRelations();
// → [ChildOf, Contains, Targets, ...]

// Nombre de relations définies
const count = getRelationCount();

// Vérifier si une relation existe
const exists = hasRelation("CustomRelation");
```

---

## Performance

### Complexité des opérations

| Opération | Complexité |
|-----------|------------|
| `add()` | O(1) |
| `remove()` | O(1) |
| `has()` | O(1) |
| `getTargets()` | O(k) où k = nombre de cibles |
| `getSources()` | O(k) où k = nombre de sources |
| Cascade delete | O(n) où n = entités liées |

### Benchmarks

```
Add 10k relations: ~3ms
Query 10k targets: ~0.6ms
Reverse lookup 10k children: ~0.5ms
```

---

## Résumé

```
┌────────────────────────────────────────────────────────────────┐
│                       RELATIONS                                 │
│                                                                │
│  Définition          Création           Requête                │
│  ──────────          ────────           ───────                │
│  defineRelation()    relations.add()    relations.getTargets() │
│                      relations.remove() relations.getSources() │
│                                                                │
│                                                                │
│  ┌─────────┐   Relation    ┌─────────┐                        │
│  │ Source  │ ────────────► │ Target  │                        │
│  └─────────┘               └─────────┘                        │
│                                                                │
│  Options :                                                     │
│  • cascadeDelete: true  → despawn source = despawn targets     │
│                                                                │
│  Relations pré-définies :                                      │
│  • ChildOf  (cascade) - Hiérarchie parent/enfant               │
│  • Contains (cascade) - Inventaire/conteneur                   │
│  • Targets  (no cascade) - Ciblage                             │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

**Suivant :** [07 - Spatial Index](./07-spatial-index.md)
