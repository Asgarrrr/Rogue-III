# 08 - Prefabs & Templates

> Modèles d'entités réutilisables

## Le Problème

Créer des entités complexes est répétitif et source d'erreurs.

```typescript
// ❌ Créer un gobelin à la main, à chaque fois
const goblin = world.spawn(Position, Health, Attack, AI, Enemy);
world.set(goblin, Position, { x: 100, y: 200 });
world.set(goblin, Health, { current: 30, max: 30 });
world.set(goblin, Attack, { damage: 5, range: 1 });
world.set(goblin, AI, { state: AIState.Patrol });
// ... encore et encore pour chaque gobelin
```

## La Solution : Prefabs

Un **Prefab** est un template qui définit quels composants et quelles valeurs par défaut utiliser.

```typescript
// ✅ Définir une fois
prefabs.define({
  name: "Goblin",
  components: [
    { type: Position },
    { type: Health, init: { current: 30, max: 30 } },
    { type: Attack, init: { damage: 5, range: 1 } },
    { type: AI, init: { state: AIState.Patrol } },
    { type: Enemy },
  ],
});

// ✅ Spawner facilement
const goblin = prefabs.spawn(world, "Goblin");
```

---

## Créer un Registre de Prefabs

```typescript
import { PrefabRegistry } from "./ecs";

const prefabs = new PrefabRegistry();
```

---

## Définir des Prefabs

### Méthode 1 : Objet de définition

```typescript
prefabs.define({
  name: "Player",
  components: [
    { type: Position, init: { x: 0, y: 0 } },
    { type: Health, init: { current: 100, max: 100 } },
    { type: Player },  // Tag, pas de init
  ],
});
```

### Méthode 2 : Builder fluent

```typescript
import { prefab } from "./ecs";

const playerDef = prefab("Player")
  .with(Position, { x: 0, y: 0 })
  .with(Health, { current: 100, max: 100 })
  .tag(Player)
  .build();

prefabs.define(playerDef);
```

### Valeurs par défaut partielles

```typescript
prefabs.define({
  name: "Enemy",
  components: [
    { type: Position },  // Utilise les défauts de Position (x=0, y=0)
    { type: Health, init: { max: 50 } },  // current prend le défaut du composant
  ],
});
```

---

## Spawner des Entités

### Spawn basique

```typescript
const goblin = prefabs.spawn(world, "Goblin");
// Entité avec tous les composants et valeurs du prefab
```

### Spawn avec overrides

```typescript
// Overrider certaines valeurs
const overrides = new Map();
overrides.set(Position, { x: 500, y: 300 });
overrides.set(Health, { current: 50 });  // Boss avec plus de vie

const bossGoblin = prefabs.spawn(world, "Goblin", overrides);
```

### Spawn multiple

```typescript
// Spawner 100 gobelins
const goblins = prefabs.spawnMany(world, "Goblin", 100);

// Avec positions différentes
const enemies = prefabs.spawnMany(world, "Goblin", 10, (index) => {
  const overrides = new Map();
  overrides.set(Position, { x: index * 50, y: 100 });
  return overrides;
});
```

---

## Héritage de Prefabs

Les prefabs peuvent **hériter** d'autres prefabs avec `extends`.

```typescript
// Prefab de base
prefabs.define({
  name: "Creature",
  components: [
    { type: Position },
    { type: Health, init: { current: 100, max: 100 } },
  ],
});

// Prefab qui hérite de Creature
prefabs.define({
  name: "Goblin",
  extends: "Creature",  // Hérite Position et Health
  components: [
    { type: Health, init: { current: 30, max: 30 } },  // Override Health
    { type: Attack, init: { damage: 5 } },  // Ajoute Attack
    { type: Enemy },  // Ajoute tag Enemy
  ],
});

// Spawn un gobelin = Position + Health(30) + Attack + Enemy
```

### Hiérarchie d'héritage

```
                    Entity
                       │
                       ▼
                   Creature
                   (Position, Health)
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
       Monster      Humanoid       Animal
    (+ Attack)    (+ Inventory)  (+ AI.Animal)
          │            │
     ┌────┴────┐   ┌───┴───┐
     ▼         ▼   ▼       ▼
  Goblin    Orc  Human   Elf
```

```typescript
// Implémentation de la hiérarchie
prefabs.define({
  name: "Entity",
  components: [{ type: Position }],
});

prefabs.define({
  name: "Creature",
  extends: "Entity",
  components: [{ type: Health, init: { current: 100, max: 100 } }],
});

prefabs.define({
  name: "Monster",
  extends: "Creature",
  components: [{ type: Attack }, { type: Enemy }],
});

prefabs.define({
  name: "Goblin",
  extends: "Monster",
  components: [
    { type: Health, init: { current: 30, max: 30 } },
    { type: Attack, init: { damage: 5, range: 1 } },
  ],
});

prefabs.define({
  name: "Orc",
  extends: "Monster",
  components: [
    { type: Health, init: { current: 80, max: 80 } },
    { type: Attack, init: { damage: 15, range: 1.5 } },
  ],
});
```

---

## Callbacks onCreate

Exécuter du code après la création d'une entité.

```typescript
prefabs.define({
  name: "Chest",
  components: [
    { type: Position },
    { type: Container },
  ],
  onCreate: (entity, world) => {
    // Ajouter des items aléatoires au coffre
    const itemCount = Math.floor(Math.random() * 5) + 1;
    for (let i = 0; i < itemCount; i++) {
      const item = prefabs.spawn(world, "RandomItem");
      world.relations.add(entity, Contains, item);
    }
  },
});
```

### Chaînage des callbacks (héritage)

```typescript
prefabs.define({
  name: "Parent",
  components: [],
  onCreate: (entity, world) => {
    console.log("Parent onCreate");
  },
});

prefabs.define({
  name: "Child",
  extends: "Parent",
  components: [],
  onCreate: (entity, world) => {
    console.log("Child onCreate");
  },
});

prefabs.spawn(world, "Child");
// Output:
// "Parent onCreate"  (d'abord le parent)
// "Child onCreate"   (ensuite l'enfant)
```

---

## Factory Functions

Pour des valeurs dynamiques, utilise une fonction au lieu d'un objet.

```typescript
let nextId = 0;

prefabs.define({
  name: "UniqueItem",
  components: [
    {
      type: Item,
      init: (entity, world) => {
        nextId++;
        return {
          id: nextId,
          name: `Item #${nextId}`,
        };
      },
    },
  ],
});

// Chaque item aura un ID unique
const item1 = prefabs.spawn(world, "UniqueItem");  // id: 1
const item2 = prefabs.spawn(world, "UniqueItem");  // id: 2
const item3 = prefabs.spawn(world, "UniqueItem");  // id: 3
```

### Valeurs aléatoires

```typescript
prefabs.define({
  name: "RandomEnemy",
  components: [
    { type: Position },
    {
      type: Health,
      init: () => {
        const max = 50 + Math.floor(Math.random() * 50);
        return { current: max, max };
      },
    },
    {
      type: Attack,
      init: () => ({
        damage: 5 + Math.floor(Math.random() * 10),
        range: 1,
      }),
    },
  ],
});
```

---

## Gestion du Registre

### Vérifier si un prefab existe

```typescript
if (prefabs.has("Goblin")) {
  const goblin = prefabs.spawn(world, "Goblin");
}
```

### Obtenir la définition

```typescript
const def = prefabs.get("Goblin");
console.log(def.name);        // "Goblin"
console.log(def.extends);     // "Monster"
console.log(def.components);  // [...]
```

### Lister tous les prefabs

```typescript
const allPrefabs = prefabs.names();
// ["Entity", "Creature", "Monster", "Goblin", "Orc", ...]
```

### Supprimer un prefab

```typescript
// Attention : ne peut pas supprimer si d'autres prefabs l'extend
prefabs.remove("Goblin");

// Erreur si quelqu'un l'extend :
// "Cannot remove prefab 'Monster' because 'Goblin' extends it"
```

### Vider le registre

```typescript
prefabs.clear();
```

---

## Exemple Complet : Roguelike

```typescript
import { PrefabRegistry, prefab } from "./ecs";

const prefabs = new PrefabRegistry();

// ═══════════════════════════════════════
// Entités de base
// ═══════════════════════════════════════

prefabs.define(
  prefab("Entity")
    .with(Position)
    .build()
);

prefabs.define(
  prefab("Creature")
    .extends("Entity")
    .with(Health, { current: 100, max: 100 })
    .with(Faction)
    .build()
);

// ═══════════════════════════════════════
// Joueur
// ═══════════════════════════════════════

prefabs.define(
  prefab("Player")
    .extends("Creature")
    .with(Health, { current: 100, max: 100 })
    .with(Attack, { damage: 10, range: 1 })
    .with(Defense, { armor: 5 })
    .with(Inventory, { maxSlots: 20 })
    .with(Experience, { current: 0, level: 1 })
    .tag(PlayerTag)
    .tag(Controllable)
    .onCreate((entity, world) => {
      world.set(entity, Faction, { id: FactionId.Player });
    })
    .build()
);

// ═══════════════════════════════════════
// Ennemis
// ═══════════════════════════════════════

prefabs.define(
  prefab("Enemy")
    .extends("Creature")
    .with(AI)
    .tag(EnemyTag)
    .onCreate((entity, world) => {
      world.set(entity, Faction, { id: FactionId.Enemies });
    })
    .build()
);

prefabs.define(
  prefab("Goblin")
    .extends("Enemy")
    .with(Health, { current: 30, max: 30 })
    .with(Attack, { damage: 5, range: 1 })
    .with(AI, { behavior: AIBehavior.Aggressive })
    .with(Loot, { goldMin: 1, goldMax: 5 })
    .build()
);

prefabs.define(
  prefab("GoblinArcher")
    .extends("Goblin")
    .with(Attack, { damage: 8, range: 5 })
    .with(AI, { behavior: AIBehavior.Ranged })
    .build()
);

prefabs.define(
  prefab("Orc")
    .extends("Enemy")
    .with(Health, { current: 80, max: 80 })
    .with(Attack, { damage: 15, range: 1.5 })
    .with(AI, { behavior: AIBehavior.Aggressive })
    .with(Loot, { goldMin: 5, goldMax: 20 })
    .build()
);

prefabs.define(
  prefab("Dragon")
    .extends("Enemy")
    .with(Health, { current: 500, max: 500 })
    .with(Attack, { damage: 50, range: 3 })
    .with(AI, { behavior: AIBehavior.Boss })
    .with(Loot, { goldMin: 100, goldMax: 500 })
    .tag(BossTag)
    .build()
);

// ═══════════════════════════════════════
// Items
// ═══════════════════════════════════════

prefabs.define(
  prefab("Item")
    .with(Position)
    .with(Item)
    .with(Sprite)
    .build()
);

prefabs.define(
  prefab("HealthPotion")
    .extends("Item")
    .with(Item, { stackable: true, maxStack: 10 })
    .with(Consumable, { effect: "heal", value: 30 })
    .with(Sprite, { id: SpriteId.HealthPotion })
    .onCreate((entity, world) => {
      world.setString(entity, Item, "name", "Potion de vie");
    })
    .build()
);

prefabs.define(
  prefab("Sword")
    .extends("Item")
    .with(Item, { stackable: false })
    .with(Equippable, { slot: EquipSlot.MainHand })
    .with(WeaponStats, { damage: 10 })
    .with(Sprite, { id: SpriteId.Sword })
    .onCreate((entity, world) => {
      world.setString(entity, Item, "name", "Épée");
    })
    .build()
);

// ═══════════════════════════════════════
// Utilisation
// ═══════════════════════════════════════

// Spawner le joueur
const player = prefabs.spawn(world, "Player");

// Spawner des ennemis
const goblins = prefabs.spawnMany(world, "Goblin", 10, (i) => {
  const overrides = new Map();
  overrides.set(Position, { x: 100 + i * 20, y: 200 });
  return overrides;
});

// Boss
const boss = prefabs.spawn(world, "Dragon");
world.set(boss, Position, { x: 500, y: 500 });
```

---

## Performance

### Benchmarks

```
Spawn 10k prefabs (4 composants): ~30-50ms
Spawn 1k deep prefabs (5 niveaux): ~4ms
```

### Conseils

```typescript
// ✅ Définir les prefabs une fois au démarrage
function init() {
  prefabs.define(...);
  prefabs.define(...);
}

// ✅ Réutiliser le registre
const enemy = prefabs.spawn(world, "Goblin");

// ❌ Ne pas redéfinir à chaque spawn
function spawnEnemy() {
  prefabs.define({ name: "Enemy", ... });  // NON !
  return prefabs.spawn(world, "Enemy");
}
```

---

## Résumé

```
┌────────────────────────────────────────────────────────────────┐
│                    PREFABS & TEMPLATES                          │
│                                                                │
│  Définition          Spawn              Héritage               │
│  ──────────          ─────              ────────               │
│  prefabs.define()    prefabs.spawn()    extends: "Parent"      │
│  prefab().build()    prefabs.spawnMany()                       │
│                                                                │
│                                                                │
│  ┌────────────────┐                                           │
│  │    Prefab      │                                           │
│  │   "Goblin"     │                                           │
│  │                │                                           │
│  │  Components:   │     spawn()      ┌─────────────┐          │
│  │  - Position    │  ──────────────► │   Entity    │          │
│  │  - Health(30)  │                  │  (vivante)  │          │
│  │  - Attack(5)   │                  └─────────────┘          │
│  │  - Enemy       │                                           │
│  └────────────────┘                                           │
│          │                                                     │
│          │ extends                                             │
│          ▼                                                     │
│  ┌────────────────┐                                           │
│  │    Prefab      │                                           │
│  │   "Monster"    │                                           │
│  └────────────────┘                                           │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

**Suivant :** [09 - Systems & Scheduler](./09-systems.md)
