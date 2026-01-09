# 11 - Hooks

> Callbacks lors des modifications de composants

## Concept

Les **Hooks** permettent d'exécuter du code automatiquement quand un composant est ajouté, modifié, ou retiré.

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   world.add(entity, Health)  ────►  onAdd hook                 │
│                                                                 │
│   world.set(entity, Health)  ────►  onSet hook                 │
│                                                                 │
│   world.remove(entity, Health) ──►  onRemove hook              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Types de Hooks

### onAdd - Composant ajouté

```typescript
world.hooks.registerOnAdd(Health, (entity, componentIndex, data) => {
  console.log(`Health ajouté à ${entity} avec ${data.current}/${data.max}`);
});
```

### onSet - Composant modifié

```typescript
world.hooks.registerOnSet(Health, (entity, componentIndex, newData, previousData) => {
  console.log(`Health de ${entity}: ${previousData.current} → ${newData.current}`);

  if (newData.current < previousData.current) {
    console.log("L'entité a pris des dégâts !");
  }
});
```

### onRemove - Composant retiré

```typescript
world.hooks.registerOnRemove(Health, (entity, componentIndex, data) => {
  console.log(`Health retiré de ${entity}`);
});
```

---

## Helpers pré-définis

### Logging Hooks

```typescript
import { createLoggingHooks } from "./ecs-v2";

const loggingHooks = createLoggingHooks();
world.hooks.registerAll(Position, loggingHooks);

// Affiche automatiquement tous les changements de Position
```

### Validation Hooks

```typescript
import { createValidationHooks } from "./ecs-v2";

const validationHooks = createValidationHooks({
  onSet: (entity, componentIndex, data) => {
    // Valider que health ne dépasse pas max
    if (data.current > data.max) {
      throw new Error("Health cannot exceed max!");
    }
  },
});

world.hooks.registerAll(Health, validationHooks);
```

---

## Combiner des Hooks

```typescript
import { combineHooks } from "./ecs-v2";

const combinedHooks = combineHooks(
  createLoggingHooks(),
  createValidationHooks({ ... }),
  myCustomHooks,
);

world.hooks.registerAll(Health, combinedHooks);
```

---

## Exemple Pratique

```typescript
// Synchroniser automatiquement le spatial index
world.hooks.registerOnAdd(Position, (entity, _, data) => {
  const spatial = world.getResource(SpatialIndex);
  spatial?.grid.insert(entity, data.x, data.y);
});

world.hooks.registerOnSet(Position, (entity, _, newData) => {
  const spatial = world.getResource(SpatialIndex);
  spatial?.grid.update(entity, newData.x, newData.y);
});

world.hooks.registerOnRemove(Position, (entity) => {
  const spatial = world.getResource(SpatialIndex);
  spatial?.grid.remove(entity);
});
```

---

## Résumé

```
┌────────────────────────────────────────────────────────────────┐
│                         HOOKS                                   │
│                                                                │
│  onAdd              onSet                   onRemove           │
│  ─────              ─────                   ────────           │
│  Ajout composant    Modification           Retrait             │
│                     (old → new data)                           │
│                                                                │
│  Use cases :                                                   │
│  • Synchroniser spatial index                                  │
│  • Validation des données                                      │
│  • Logging / Debug                                             │
│  • Trigger d'effets                                            │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

**Suivant :** [12 - Sérialisation](./12-serialisation.md)
