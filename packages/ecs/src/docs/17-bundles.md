# Bundles

Les Bundles sont des groupes réutilisables de composants avec des valeurs par défaut optionnelles. Ils simplifient la création d'entités avec des patterns communs.

## Différence avec les Prefabs

| Bundles | Prefabs |
|---------|---------|
| Groupes de **types** | Templates avec **valeurs** |
| Compile-time | Runtime |
| Pas de registry | Registry global |
| Léger | Plus de features |

Utilisez les Bundles pour regrouper des composants, les Prefabs pour des templates complets avec callbacks.

## Création

```typescript
import { bundle, spawnBundle } from "./ecs";

// Bundle simple - liste de types
const MovableBundle = bundle(Position, Velocity);

// Avec valeurs par défaut
const EnemyBundle = bundle(Position, Health, Enemy).defaults({
  Position: { x: 0, y: 0 },
  Health: { current: 100, max: 100 },
});
```

## Utilisation

### Spawn basique

```typescript
// Méthode 1 : Spread dans spawn()
const entity = world.spawn(...MovableBundle.types);

// Méthode 2 : spawnBundle() avec defaults
const enemy = spawnBundle(world, EnemyBundle);
```

### Avec overrides

```typescript
// Override certaines valeurs
const enemy = spawnBundle(world, EnemyBundle, {
  Position: { x: 100, y: 50 },  // Override position
  // Health garde les defaults
});
```

## Composition

### Ajouter des composants

```typescript
const MovableBundle = bundle(Position, Velocity);

// Ajouter un composant
const EnemyBundle = MovableBundle.with(Health, Enemy);

// Ou un autre bundle
const CombatBundle = bundle(Health, Attack, Defense);
const WarriorBundle = MovableBundle.with(CombatBundle);
```

### Héritage de defaults

```typescript
const BaseCreatureBundle = bundle(Position, Health).defaults({
  Health: { current: 100, max: 100 },
});

// Les defaults sont hérités
const EnemyBundle = BaseCreatureBundle.with(Enemy, AI);

// Override les defaults hérités
const BossBundle = EnemyBundle.with(Boss).defaults({
  Health: { current: 500, max: 500 },  // Override
});
```

## Exemple Complet : Hiérarchie d'ennemis

```typescript
// === Bundles de base ===

const TransformBundle = bundle(Position, Rotation).defaults({
  Position: { x: 0, y: 0 },
  Rotation: { angle: 0 },
});

const MovableBundle = TransformBundle.with(Velocity).defaults({
  Velocity: { x: 0, y: 0 },
});

const CombatBundle = bundle(Health, Attack, Defense).defaults({
  Health: { current: 100, max: 100 },
  Attack: { power: 10 },
  Defense: { armor: 5 },
});

// === Bundles d'entités ===

const CreatureBundle = MovableBundle.with(CombatBundle);

const EnemyBundle = CreatureBundle.with(Enemy, AI).defaults({
  AI: { aggression: 0.5 },
});

const BossBundle = EnemyBundle.with(Boss).defaults({
  Health: { current: 500, max: 500 },
  Attack: { power: 50 },
  AI: { aggression: 1.0 },
});

const PlayerBundle = CreatureBundle.with(Player, Inventory);

// === Spawn ===

// Ennemi standard
const goblin = spawnBundle(world, EnemyBundle, {
  Position: { x: 10, y: 20 },
});

// Boss avec position custom
const dragon = spawnBundle(world, BossBundle, {
  Position: { x: 50, y: 50 },
});

// Joueur
const player = spawnBundle(world, PlayerBundle, {
  Position: { x: 0, y: 0 },
  Health: { current: 150, max: 150 },
});
```

## API Détaillée

### `bundle(...types)`

Crée un bundle avec les types de composants spécifiés.

```typescript
const MyBundle = bundle(ComponentA, ComponentB, ComponentC);
```

### `.defaults(values)`

Retourne un nouveau bundle avec des valeurs par défaut.

```typescript
const WithDefaults = MyBundle.defaults({
  ComponentA: { field: value },
  ComponentB: { field: value },
});
```

### `.with(...others)`

Compose avec d'autres bundles ou composants.

```typescript
// Avec des composants
const Extended = MyBundle.with(ComponentD, ComponentE);

// Avec un autre bundle
const Combined = MyBundle.with(OtherBundle);

// Mixte
const Full = MyBundle.with(OtherBundle, ComponentF);
```

### `spawnBundle(world, bundle, overrides?)`

Spawn une entité avec le bundle et applique les defaults/overrides.

```typescript
const entity = spawnBundle(world, MyBundle);

const entityWithOverrides = spawnBundle(world, MyBundle, {
  ComponentA: { field: customValue },
});
```

### `.applyDefaults(world, entity)`

Applique les defaults à une entité existante.

```typescript
const entity = world.spawn(...MyBundle.types);
MyBundle.applyDefaults(world, entity);
```

## Performance

Les bundles sont évalués à la construction, pas au runtime :

- `bundle()` : O(1)
- `.defaults()` : O(n components)
- `.with()` : O(n components)
- `spawnBundle()` : O(n components) pour appliquer les defaults

Pour le spawn haute performance, préférer `world.spawn()` direct avec les types, puis `set()` pour les valeurs critiques.
