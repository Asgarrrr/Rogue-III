# 15 - Entity References vs Relations

> Quand utiliser quelle approche pour lier des entités ?

---

## Vue d'ensemble

Deux systèmes permettent de créer des liens entre entités, chacun avec ses forces et faiblesses.

```
┌──────────────────────────────────────────────────────────────────┐
│                                                                  │
│   Entity References            Relations                         │
│   ───────────────────          ─────────                         │
│   • Simple "pointe vers"       • Liens sémantiques               │
│   • Stockage dans composant    • Table séparée                   │
│   • Cas simple                 • Cas complexes/multiples         │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

---

## Entity References (Références Simple)

### Concept

Une **EntityRef** est un champ dans un composant qui pointe vers une autre entité.

```typescript
@component
class Targeting {
  target = entityRef(0);  // Pointe vers une entité
}

@component
class Projectile {
  owner = entityRef(0);     // Qui a lancé ce projectile ?
  lastAttacker = entityRef(0);  // Qui m'a frappé en dernier ?
}
```

### Stockage

La valeur est stockée **directement dans le composant** comme un u32 (index d'entité).

```
Arrow (Entity 5)
├── Position { x: 10, y: 20 }
├── Velocity { vx: 3, vy: 0 }
└── Targeting { target: 42 }  ◄── Valeur stockée ici
                       │
                       └──► Enemy (Entity 42)
```

### Validation Automatique

L'**EntityRefStore** valide que la cible est toujours vivante :

```typescript
const target = world.getEntityRef(arrow, Targeting, "target");

if (target !== null) {
  // La cible existe toujours
  const pos = world.get(target, Position);
} else {
  // La cible est morte ou jamais définie
}
```

### Cas d'usage

Utilise une EntityRef quand :

- Tu as une **simple relation 1-à-1**
- Tu veux une **validation automatique**
- La cible peut **disparaître sans conséquence** pour la source
- Tu **stockes la valeur dans un composant** existant

**Exemples:**
- Projectile → Owner
- Arrow → Target
- Spell → Caster
- Enemy → LastAttacker

---

## Relations (Liens Structurés)

### Concept

Une **Relation** est un lien typé entre deux entités, stocké dans une table séparée.

```typescript
const ChildOf = defineRelation("ChildOf", { cascadeDelete: true });
const Contains = defineRelation("Contains", { cascadeDelete: true });
const Targets = defineRelation("Targets");
```

### Stockage

Les relations sont **indexées bidirectionnellement** pour des requêtes efficaces.

```
RelationStore
├── ChildOf
│   ├── parent (Entity 1) → [child1, child2, child3]
│   └── child1 (Entity 2) → [parent]
│
├── Contains
│   ├── chest (Entity 10) → [sword, potion]
│   └── sword (Entity 20) → [chest]
│
└── Targets
    └── turret (Entity 5) → [enemy1, enemy2]
```

### Cascade Delete

Quand une relation est créée avec `cascadeDelete: true`, supprimer la source supprime aussi les cibles :

```typescript
const parent = world.spawn(Position);
const child = world.spawn(Position);

world.relations.add(child, ChildOf, parent);

// Supprimer le parent
world.despawn(parent);
// → L'enfant est AUSSI supprimé automatiquement !
```

### Cas d'usage

Utilise une Relation quand :

- Tu as **plusieurs liens du même type**
- Tu veux **une structure hiérarchique**
- Tu as besoin d'une **requête inverse efficace** (qui contient X?)
- Tu veux un **cascade delete automatique**
- Tu dois **interroger rapidement les relations**

**Exemples:**
- Parent → Children (ChildOf)
- Inventory → Items (Contains)
- Team → Members (MemberOf)
- Scene Graph (ChildOf)

---

## Tableau Comparatif

| Aspect | Entity References | Relations |
|--------|-------------------|-----------|
| **Stockage** | Dans le composant | Table séparée |
| **Multiplicité** | 1 par champ | N par type |
| **Query directe** | Oui (du composant) | Non, via RelationStore |
| **Query inverse** | Non | Oui, O(1) |
| **Cascade delete** | Non (manuel) | Oui (configurable) |
| **Validation** | Automatique | Manuel (has()) |
| **Serialization** | Simple | Nécessite RelationStore |
| **Mémoire** | Économe | Plus lourd (2 indices) |
| **Use case** | Ciblage, références | Hiérarchies, inventaires |

---

## Diagrammes Visuels

### Entity References

```
┌──────────────────────────────────────────────┐
│         Source Entity                        │
├──────────────────────────────────────────────┤
│ Component: Targeting                         │
│   target = 42  ◄─── Stocké dans composant   │
├──────────────────────────────────────────────┤
│                                              │
│  EntityRefStore (au despawn)                 │
│  ├── Nullification optionnelle                │
│  └── Cleanup des références                  │
│                                              │
└──────────────────────────────────────────────┘
         │
         └────────► Target Entity (Entity 42)


getEntityRef() Workflow:
─────────────────────
1. Lire la valeur du composant (target = 42)
2. Vérifier: isAlive(42) ?
3. Oui → return 42, Non → return null
```

### Relations

```
┌──────────────────────────────────────────────┐
│         RelationStore                        │
├──────────────────────────────────────────────┤
│                                              │
│  Outgoing Index (source → target)            │
│  ├── ChildOf                                 │
│  │   └── Parent 1 → {Child 1, 2, 3}         │
│  ├── Contains                                │
│  │   └── Chest 5 → {Sword 10, Potion 15}    │
│                                              │
│  Incoming Index (target → source)            │
│  ├── ChildOf                                 │
│  │   └── Child 1 → {Parent 1}                │
│  ├── Contains                                │
│  │   └── Sword 10 → {Chest 5}                │
│                                              │
│  Data (pour typed relations)                 │
│  └── "ChildOf:1:2" → {...}                   │
│                                              │
└──────────────────────────────────────────────┘

Query Workflow:
──────────────
• getTargets(parent, ChildOf) → O(1) lookup + O(k) iteration
• getSources(child, ChildOf) → O(1) lookup + O(k) iteration
• cascadeDelete: despawn(parent) → despawn(children)
```

---

## Exemples Pratiques

### Exemple 1: Ciblage (EntityRef)

```typescript
@component
class Targeting {
  target = entityRef(0);
}

// Utilisation
const arrow = world.spawn(Position, Velocity, Targeting);
const enemy = world.spawn(Position, Health);

// Définir la cible
world.setEntityRef(arrow, Targeting, "target", enemy);

// Dans un système, suivre la cible
world.query(Targeting, Position, Velocity).run(view => {
  for (let i = 0; i < view.count; i++) {
    const entity = view.entity(i);
    const target = world.getEntityRef(entity, Targeting, "target");

    if (target !== null) {
      // Suivre la cible
      const targetPos = world.get(target, Position);
      // ... calculs de direction ...
    }
  }
});
```

**Pourquoi EntityRef ?**
- Une seule cible par projectile
- Validation simple
- La cible peut mourir sans conséquence

### Exemple 2: Hiérarchie (Relation)

```typescript
const ChildOf = defineRelation("ChildOf", { cascadeDelete: true });

// Créer une hiérarchie
const root = world.spawn(Transform);
const body = world.spawn(Transform);
const arm = world.spawn(Transform);
const hand = world.spawn(Transform);

world.relations.add(body, ChildOf, root);
world.relations.add(arm, ChildOf, body);
world.relations.add(hand, ChildOf, arm);

// Récupérer les enfants
function getChildren(entity: Entity): Entity[] {
  return world.relations.getSources(entity, ChildOf);
}

// Supprimer le root → tout disparaît par cascade
world.despawn(root);
// body, arm, hand sont automatiquement supprimés !
```

**Pourquoi Relation ?**
- Structure hiérarchique (N enfants par parent)
- Cascade delete nécessaire
- Requête inverse (qui est parent de X?)

### Exemple 3: Inventaire (Relation)

```typescript
const Contains = defineRelation("Contains", { cascadeDelete: true });

@component
class Inventory {
  capacity = f32(100);
}

@component
class Item {
  weight = f32(1);
}

// Ajouter un item
const chest = world.spawn(Inventory);
const sword = world.spawn(Item);
world.relations.add(chest, Contains, sword);

// Lister les items
const items = world.relations.getTargets(chest, Contains);
for (const item of items) {
  const data = world.get(item, Item);
  console.log(`- ${data.name} (weight: ${data.weight})`);
}

// Qui contient cet item ?
const containers = world.relations.getSources(sword, Contains);
// → [chest]
```

**Pourquoi Relation ?**
- Plusieurs items par conteneur
- Requête inverse (qui me contient?)
- Cascade delete (supprimer le conteneur = supprimer le contenu)

### Exemple 4: Ciblage Multiple (Relation)

```typescript
const Targets = defineRelation("Targets");

// Une tourelle peut cibler plusieurs ennemis
const turret = world.spawn(Position, Turret);
const enemy1 = world.spawn(Position, Enemy);
const enemy2 = world.spawn(Position, Enemy);

world.relations.add(turret, Targets, enemy1);
world.relations.add(turret, Targets, enemy2);

// Obtenir tous les ennemis ciblés
const enemies = world.relations.getTargets(turret, Targets);
// → [enemy1, enemy2]

// Qui cible cet ennemi ?
const attackers = world.relations.getSources(enemy1, Targets);
// → [turret, ...]
```

**Pourquoi Relation au lieu d'Array dans composant ?**
- Plus efficace pour requêtes inverses
- Intégration ECS native
- Pas besoin de maintenir un Array manuellement

---

## Guide de Décision

```
As-tu UNE seule valeur ?
│
├─ OUI → EntityRef
│  (target = entity, owner = entity)
│
└─ NON → Relation
   (N children, N items, N team members)


La cible peut-elle mourir sans affecter la source ?
│
├─ OUI → EntityRef
│  (arrow loses target = arrow continues)
│
└─ NON → Relation avec cascadeDelete
   (parent dies = children die)


Dois-tu interroger l'inverse rapidement ?
│
├─ OUI → Relation
│  (get parent of child, get container of item)
│
└─ NON → EntityRef
   (on ne demande pas "qui me cible?")
```

---

## Syntaxe Rapide

### Entity References

```typescript
// Définir
@component
class MyComponent {
  target = entityRef(0);  // NULL_ENTITY par défaut
}

// Écrire
world.setEntityRef(source, Component, "fieldName", target);

// Lire
const target = world.getEntityRef(source, Component, "fieldName");
if (target !== null) { ... }

// Lire raw (sans validation)
const raw = world.getEntityRefRaw(source, Component, "fieldName");
```

### Relations

```typescript
// Définir
const MyRelation = defineRelation("MyRelation", { cascadeDelete: false });

// Ajouter
world.relations.add(source, MyRelation, target);

// Supprimer
world.relations.remove(source, MyRelation, target);

// Vérifier
if (world.relations.has(source, MyRelation, target)) { ... }

// Requête directe
const targets = world.relations.getTargets(source, MyRelation);

// Requête inverse
const sources = world.relations.getSources(target, MyRelation);

// Compter
const count = world.relations.countTargets(source, MyRelation);
```

---

## Performance

### Complexité asymptotique

| Opération | EntityRef | Relation |
|-----------|-----------|----------|
| Set | O(1) | O(1) |
| Get | O(1) | O(1) |
| Query inverse | N/A | O(1) |
| Despawn (N refs) | O(N) | O(N) |
| Cascade delete | N/A | O(N) |

### Mémoire par entité

| Type | Memory | Notes |
|------|--------|-------|
| EntityRef | 4 bytes | u32 dans le composant |
| Relation | 2 indices | Outgoing + Incoming |

**Recommandation:** Pour < 100k références, la performance ne change rien. Utilise ce qui a du sens sémantiquement.

---

## Résumé

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│  ENTITY REFERENCES              RELATIONS                       │
│  ──────────────────              ─────────                       │
│                                                                 │
│  • Simple pointe vers            • Lien structuré              │
│  • Stocké dans composant         • Table séparée               │
│  • 1 valeur par champ            • N valeurs par type          │
│  • Validation auto               • Requête inverse            │
│  • Pas de cascade delete         • Cascade delete optionnel    │
│                                                                 │
│  QUAND UTILISER:                 QUAND UTILISER:               │
│  ───────────────                 ───────────────               │
│  • Ciblage simple                • Hiérarchies                │
│  • Owner/Caster                  • Inventaires                │
│  • Last Attacker                 • Scènes graphiques          │
│  • Reference simple              • Équipes/Groupes            │
│  • Validation de cible           • Requête bidirectionnelle   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

**Voir aussi:**
- [05 - Entity References](./05-entity-references.md)
- [06 - Relations](./06-relations.md)
