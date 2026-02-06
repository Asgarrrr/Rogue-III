# 11 - Observers (Reactive Component Callbacks)

> Callbacks réactifs lors des modifications de composants

## Concept

Les **Observers** permettent d'exécuter du code automatiquement quand un composant est ajouté, modifié, ou retiré. Contrairement aux anciens Hooks, les Observers supportent plusieurs callbacks par composant.

```
┌─────────────────────────────────────────────────────────────────┐
│                                                                 │
│   world.add(entity, Health)  ────►  onAdd observers            │
│                                                                 │
│   world.set(entity, Health)  ────►  onSet observers            │
│                                                                 │
│   world.remove(entity, Health) ──►  onRemove observers         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Types d'Observers

### onAdd - Composant ajouté

```typescript
const sub = world.observers.onAdd(Health, (entity, data) => {
  console.log(`Health ajouté à ${entity} avec ${data.current}/${data.max}`);
});

// Plus tard, se désabonner si nécessaire
sub.unsubscribe();
```

### onSet - Composant modifié

```typescript
world.observers.onSet(Health, (entity, newData, oldData) => {
  console.log(`Health de ${entity}: ${oldData?.current} → ${newData.current}`);

  if (oldData && newData.current < oldData.current) {
    console.log("L'entité a pris des dégâts !");
  }
});
```

### onRemove - Composant retiré

```typescript
world.observers.onRemove(Health, (entity, data) => {
  console.log(`Health retiré de ${entity}`);
});
```

### onChange - Tous les événements

```typescript
world.observers.onChange(Health, (entity, newData, oldData) => {
  // Appelé sur add, set, ET remove
  console.log(`Health changé pour ${entity}`);
});
```

---

## Abonnements Multiples

Plusieurs observers peuvent être enregistrés pour le même composant :

```typescript
// Observer 1: Logging
world.observers.onAdd(Position, (entity, data) => {
  console.log(`Position added to ${entity}`);
});

// Observer 2: Spatial index
world.observers.onAdd(Position, (entity, data) => {
  spatialIndex.insert(entity, data.x, data.y);
});

// Les deux callbacks sont exécutés
```

---

## Désabonnement

Chaque appel retourne une subscription qui peut être annulée :

```typescript
const subscription = world.observers.onAdd(Position, callback);

// Plus tard...
subscription.unsubscribe();  // Ne reçoit plus de notifications
```

---

## Exemple Pratique

```typescript
// Synchroniser automatiquement le spatial index
world.observers.onAdd(Position, (entity, data) => {
  const spatial = world.getResource(SpatialIndex);
  spatial?.grid.insert(entity, data.x, data.y);
});

world.observers.onSet(Position, (entity, newData) => {
  const spatial = world.getResource(SpatialIndex);
  spatial?.grid.update(entity, newData.x, newData.y);
});

world.observers.onRemove(Position, (entity) => {
  const spatial = world.getResource(SpatialIndex);
  spatial?.grid.remove(entity);
});
```

---

## Death Detection

```typescript
world.observers.onSet(Health, (entity, data) => {
  if (data.current <= 0) {
    world.emit({ type: "entity_died", entity });
  }
});
```

---

## Résumé

```
┌────────────────────────────────────────────────────────────────┐
│                       OBSERVERS                                │
│                                                                │
│  onAdd              onSet                   onRemove           │
│  ─────              ─────                   ────────           │
│  Ajout composant    Modification           Retrait             │
│                     (old → new data)                           │
│                                                                │
│  onChange                                                      │
│  ────────                                                      │
│  Tous les événements (add + set + remove)                      │
│                                                                │
│  Avantages :                                                   │
│  • Multiples observers par composant                           │
│  • Désabonnement individuel                                    │
│  • API plus simple                                             │
│                                                                │
│  Use cases :                                                   │
│  • Synchroniser spatial index                                  │
│  • Détection de mort                                           │
│  • Logging / Debug                                             │
│  • Trigger d'effets                                            │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

---

**Suivant :** [12 - Sérialisation](./12-serialisation.md)
