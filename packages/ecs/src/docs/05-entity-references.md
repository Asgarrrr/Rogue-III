# 05 - Entity References

> Références sécurisées entre entités

## Le Problème des Références Dangles

Quand une entité référence une autre, que se passe-t-il si la cible est supprimée ?

```typescript
// Scénario dangereux
const enemy = world.spawn(Position);
const arrow = world.spawn(Position, Targeting);

// L'arrow cible l'enemy
world.set(arrow, Targeting, { target: enemy });

// L'enemy meurt
world.despawn(enemy);

// ❌ PROBLÈME : arrow.target pointe vers une entité morte !
const data = world.get(arrow, Targeting);
console.log(data.target);  // Entité invalide ou recyclée !
```

---

## La Solution : Entity References Validées

Le système de références valide automatiquement que la cible est vivante.

```
┌──────────────────────────────────────────────────────────────┐
│                    EntityRefStore                             │
│                                                              │
│  Tracking bidirectionnel :                                   │
│                                                              │
│  Source → Target           Target → Sources                  │
│  ───────────────           ───────────────                  │
│  Arrow → Enemy             Enemy ← [Arrow, Spell, Turret]   │
│  Spell → Enemy                                               │
│  Turret → Enemy                                              │
│                                                              │
│  Quand Enemy meurt :                                         │
│  → Toutes les refs vers Enemy sont invalidées                │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

---

## Définir un champ Entity Reference

```typescript
import { component, entityRef, f32 } from "./ecs";

@component
class Targeting {
  target = entityRef(0);  // 0 = NULL_ENTITY par défaut
}

@component
class Parent {
  parent = entityRef(0);
}

@component
class Following {
  leader = entityRef(0);
  distance = f32(5);
}
```

---

## Lire et Écrire des Références

### ⚠️ Important : N'utilise PAS `world.get()` / `world.set()` directement !

```typescript
// ❌ NE PAS FAIRE - Pas de validation ni tracking
world.set(arrow, Targeting, { target: enemy });
const data = world.get(arrow, Targeting);
// data.target pourrait être une entité morte !
```

### ✅ Utilise `getEntityRef()` et `setEntityRef()`

```typescript
// Définir une référence (avec tracking)
world.setEntityRef(arrow, Targeting, "target", enemy);

// Lire une référence (avec validation)
const target = world.getEntityRef(arrow, Targeting, "target");
if (target !== null) {
  // La cible est vivante et valide
  const targetPos = world.get(target, Position);
} else {
  // La cible est morte ou n'a jamais été définie
}
```

---

## Validation Automatique

### Comportement de `getEntityRef()`

```typescript
const enemy = world.spawn(Position);
world.setEntityRef(arrow, Targeting, "target", enemy);

// Tant que enemy est vivant
let target = world.getEntityRef(arrow, Targeting, "target");
console.log(target);  // enemy (Entity)

// Après despawn de enemy
world.despawn(enemy);
target = world.getEntityRef(arrow, Targeting, "target");
console.log(target);  // null (automatiquement !)
```

### Diagramme du cycle de vie

```
┌─────────────────────────────────────────────────────────────┐
│                                                             │
│  setEntityRef(arrow, target)                                │
│         │                                                   │
│         ▼                                                   │
│  ┌─────────────────┐                                       │
│  │ EntityRefStore  │                                       │
│  │ arrow → target  │                                       │
│  │ target ← arrow  │                                       │
│  └────────┬────────┘                                       │
│           │                                                 │
│           │  getEntityRef(arrow)                           │
│           │         │                                       │
│           │         ▼                                       │
│           │  ┌──────────────┐                              │
│           │  │ isAlive(target)?                            │
│           │  │  • Oui → return target                      │
│           │  │  • Non → return null                        │
│           │  └──────────────┘                              │
│           │                                                 │
│           │  despawn(target)                               │
│           │         │                                       │
│           │         ▼                                       │
│           │  ┌──────────────┐                              │
│           └─►│ Cleanup refs │                              │
│              │ to target    │                              │
│              └──────────────┘                              │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Accès Raw (sans validation)

Parfois tu veux la valeur brute, même si elle pointe vers une entité morte.

```typescript
// Lecture SANS validation
const rawTarget = world.getEntityRefRaw(arrow, Targeting, "target");
// Retourne l'entité stockée, même si elle est morte

// Utile pour :
// - Debug
// - Sérialisation
// - Cas spéciaux où tu veux gérer toi-même
```

---

## Nullification Manuelle

Tu peux forcer la nullification de toutes les références vers une entité.

```typescript
// Nullifier toutes les refs vers une entité
const count = world.nullifyRefsTo(enemy);
console.log(`${count} références nullifiées`);

// Après nullification :
const target = world.getEntityRefRaw(arrow, Targeting, "target");
console.log(target);  // NULL_ENTITY (0xFFFFFFFF)
```

---

## Patterns d'utilisation

### Système de ciblage

```typescript
@component
class Targeting {
  target = entityRef(0);
}

@component
class Position {
  x = f32(0);
  y = f32(0);
}

// Système qui fait suivre les projectiles vers leur cible
function projectileHoming(world: World) {
  world.query(Targeting, Position, Velocity).run(view => {
    const targetRefs = view.column(Targeting, "target");
    const x = view.column(Position, "x");
    const y = view.column(Position, "y");
    const vx = view.column(Velocity, "vx");
    const vy = view.column(Velocity, "vy");

    for (let i = 0; i < view.count; i++) {
      const projectile = view.entity(i);
      const target = world.getEntityRef(projectile, Targeting, "target");

      if (target === null) {
        // Cible morte - le projectile continue tout droit
        continue;
      }

      // Obtenir la position de la cible
      const targetPos = world.get(target, Position);
      if (!targetPos) continue;

      // Calculer la direction vers la cible
      const dx = targetPos.x - x[i];
      const dy = targetPos.y - y[i];
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist > 0) {
        const speed = 5;
        vx[i] = (dx / dist) * speed;
        vy[i] = (dy / dist) * speed;
      }
    }
  });
}
```

### Système parent-enfant simple

```typescript
@component
class Parent {
  parent = entityRef(0);
}

// Quand le parent bouge, les enfants suivent
function parentFollowSystem(world: World) {
  world.query(Parent, Position).run(view => {
    for (let i = 0; i < view.count; i++) {
      const child = view.entity(i);
      const parent = world.getEntityRef(child, Parent, "parent");

      if (parent === null) continue;

      const parentPos = world.get(parent, Position);
      if (!parentPos) continue;

      // L'enfant suit le parent avec un offset
      world.set(child, Position, {
        x: parentPos.x + 10,  // Offset X
        y: parentPos.y + 10,  // Offset Y
      });
    }
  });
}
```

### Chaîne de références

```typescript
@component
class LinkedList {
  next = entityRef(0);
  prev = entityRef(0);
}

// Parcourir une liste chaînée
function traverseList(world: World, head: Entity) {
  let current: Entity | null = head;
  const items: Entity[] = [];

  while (current !== null) {
    items.push(current);

    // Passer au suivant (validé automatiquement)
    current = world.getEntityRef(current, LinkedList, "next");
  }

  return items;
}
```

---

## Comparaison avec Relations

| Aspect | Entity References | Relations |
|--------|-------------------|-----------|
| Définition | `entityRef()` dans composant | `defineRelation()` |
| Stockage | Dans le composant | Table séparée |
| Multiplicité | 1 ref par champ | N relations par type |
| Cascade delete | Non automatique | Configurable |
| Query | Via composant | Via `relatedTo()` |

### Quand utiliser quoi ?

```typescript
// Entity Reference - relation simple, 1-à-1
@component
class Targeting {
  target = entityRef(0);  // Une seule cible
}

// Relation - relations multiples, hiérarchies
const ChildOf = defineRelation("ChildOf", { cascadeDelete: true });
// Un parent peut avoir plusieurs enfants
```

> 📖 Voir [06 - Relations](./06-relations.md) pour les relations complexes.

---

## Nettoyage automatique

### Au despawn de la source

```typescript
const arrow = world.spawn(Targeting);
world.setEntityRef(arrow, Targeting, "target", enemy);

// Les refs FROM arrow sont trackées
console.log(world.entityRefs.size);  // 1

world.despawn(arrow);

// Refs automatiquement nettoyées
console.log(world.entityRefs.size);  // 0
```

### Au despawn de la cible

```typescript
const enemy = world.spawn(Position);
world.setEntityRef(arrow1, Targeting, "target", enemy);
world.setEntityRef(arrow2, Targeting, "target", enemy);

console.log(world.entityRefs.size);  // 2

world.despawn(enemy);

// Refs vers enemy nettoyées
console.log(world.entityRefs.size);  // 0

// Les arrows gardent la valeur mais getEntityRef retourne null
world.getEntityRef(arrow1, Targeting, "target");  // null
world.getEntityRefRaw(arrow1, Targeting, "target");  // enemy (morte)
```

---

## Performance

### Coût des opérations

| Opération | Complexité | Notes |
|-----------|------------|-------|
| `setEntityRef()` | O(1) | + tracking |
| `getEntityRef()` | O(1) | + validation isAlive |
| `getEntityRefRaw()` | O(1) | Sans validation |
| Despawn source | O(k) | k = refs sortantes |
| Despawn target | O(k) | k = refs entrantes |

### Benchmarks typiques

```
Create 1000 refs: ~2ms
Read 1000 refs: ~0.4ms
Despawn target (cleanup 1000 refs): ~0.4ms
10000 ref updates: ~9ms
```

---

## Résumé

```
┌────────────────────────────────────────────────────────────────┐
│                  ENTITY REFERENCES                              │
│                                                                │
│  Définition         Lecture              Écriture              │
│  ──────────         ───────              ────────              │
│  entityRef(0)       getEntityRef()       setEntityRef()        │
│                     getEntityRefRaw()                          │
│                                                                │
│                                                                │
│  ┌─────────┐  setEntityRef   ┌─────────┐                      │
│  │ Source  │ ───────────────►│ Target  │                      │
│  └────┬────┘                 └────┬────┘                      │
│       │                           │                            │
│       │      ┌─────────────┐      │                            │
│       └─────►│EntityRefStore│◄────┘                            │
│              │   Tracking   │                                  │
│              └──────────────┘                                  │
│                     │                                          │
│                     ▼                                          │
│         ┌──────────────────────┐                              │
│         │ despawn(target)      │                              │
│         │ → refs invalidées    │                              │
│         │ → getEntityRef = null│                              │
│         └──────────────────────┘                              │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

**Suivant :** [06 - Relations](./06-relations.md)
