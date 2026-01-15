# ECS Fiche de Référence Rapide

Reference API complète du système ECS. Toutes les signatures et exemples au coup d'oeil.

---

## 1. Composants

### Décorateur et Déclaration

| Signature | Exemple |
|-----------|---------|
| `@component class MyComponent { }` | `@component class Position { x = f32(0); y = f32(0); }` |

### Types de Champs

| Fonction | Type | Plage | Exemple |
|----------|------|-------|---------|
| `f32(default)` | Float 32-bit | IEEE 754 | `x = f32(0)` |
| `f64(default)` | Float 64-bit | IEEE 754 | `x = f64(0)` |
| `i8(default)` | Signed 8-bit | -128 à 127 | `health = i8(100)` |
| `i16(default)` | Signed 16-bit | -32768 à 32767 | `health = i16(1000)` |
| `i32(default)` | Signed 32-bit | -2B à 2B | `id = i32(0)` |
| `u8(default)` | Unsigned 8-bit | 0 à 255 | `level = u8(1)` |
| `u16(default)` | Unsigned 16-bit | 0 à 65535 | `damage = u16(0)` |
| `u32(default)` | Unsigned 32-bit | 0 à 4B | `count = u32(0)` |
| `bool(default)` | Boolean | true/false | `alive = bool(true)` |
| `str(default)` | String (interné) | 0-4B chars | `name = str("Unknown")` |
| `entityRef(default)` | Entity ref validée | NULL_ENTITY | `target = entityRef()` |

### Composant Complet

```typescript
@component
class Item {
  name = str("Unknown");
  damage = u32(0);
  weight = f32(0.5);
  holder = entityRef();  // Référence à l'entity qui le porte
}
```

---

## 2. API World

### Spawn et Despawn

| Méthode | Signature | Exemple |
|---------|-----------|---------|
| `spawn()` | `spawn(...types: ComponentClass[]): Entity` | `world.spawn(Position, Velocity)` |
| `despawn()` | `despawn(entity: Entity): boolean` | `world.despawn(entity)` |
| `isAlive()` | `isAlive(entity: Entity): boolean` | `if (world.isAlive(e)) { ... }` |

### Ajouter/Retirer Composants

| Méthode | Signature | Exemple |
|---------|-----------|---------|
| `add()` | `add<T>(e: Entity, type: Class<T>, data?: Partial<Data<T>>): boolean` | `world.add(e, Health, { current: 50 })` |
| `addOrSet()` | `addOrSet<T>(e: Entity, type: Class<T>, data?: Partial<Data<T>>): boolean` | `world.addOrSet(e, Health, { current: 50 })` |
| `remove()` | `remove<T>(e: Entity, type: Class<T>): boolean` | `world.remove(e, Health)` |
| `has()` | `has<T>(e: Entity, type: Class<T>): boolean` | `if (world.has(e, Position)) { ... }` |

> **Note:** `add()` retourne `false` si le composant existe déjà. Utilisez `addOrSet()` pour ajouter ou mettre à jour.

### Récupérer/Modifier Données

| Méthode | Signature | Exemple |
|---------|-----------|---------|
| `get()` | `get<T>(e: Entity, type: Class<T>): Data<T> \| null` | `const pos = world.get(e, Position)` |
| `set()` | `set<T>(e: Entity, type: Class<T>, data: Partial<Data<T>>): void` | `world.set(e, Position, { x: 10 })` |
| `getField()` | `getField<T>(e: Entity, type: Class<T>, field: string): number \| null` | `const x = world.getField(e, Position, "x")` |
| `setField()` | `setField<T>(e: Entity, type: Class<T>, field: string, val: number): void` | `world.setField(e, Position, "x", 10)` |

### Champs String

| Méthode | Signature | Exemple |
|---------|-----------|---------|
| `getString()` | `getString<T>(e: Entity, type: Class<T>, field: string): string \| null` | `const name = world.getString(e, Item, "name")` |
| `setString()` | `setString<T>(e: Entity, type: Class<T>, field: string, val: string): boolean` | `world.setString(e, Item, "name", "Sword")` |

### Références d'Entity

| Méthode | Signature | Exemple |
|---------|-----------|---------|
| `getEntityRef()` | `getEntityRef<T>(e: Entity, type: Class<T>, field: string): Entity \| null` | `const target = world.getEntityRef(e, Targeting, "target")` |
| `setEntityRef()` | `setEntityRef<T>(e: Entity, type: Class<T>, field: string, ref: Entity): boolean` | `world.setEntityRef(e, Targeting, "target", enemy)` |

### Opérations Batch

| Méthode | Signature | Exemple |
|---------|-----------|---------|
| `batch()` | `batch(entity: Entity): EntityBuilder` | `world.batch(e).add(A).add(B).commit()` |

### Compter Entities

| Méthode | Signature | Exemple |
|---------|-----------|---------|
| `getEntityCount()` | `getEntityCount(): number` | `const count = world.getEntityCount()` |
| `getArchetypeCount()` | `getArchetypeCount(): number` | `const archs = world.getArchetypeCount()` |

---

## 3. Queries

### Créer des Queries

| Méthode | Signature | Exemple |
|---------|-----------|---------|
| `query()` | `query(...types: ComponentClass[]): QueryBuilder` | `world.query(Position, Velocity)` |
| `queryAny()` | `queryAny(...types: ComponentClass[]): UnionQueryBuilder` | `world.queryAny(Sprite, Mesh)` |

### Filtres

| Méthode | Signature | Exemple |
|---------|-----------|---------|
| `not()` | `not(...types: ComponentClass[]): QueryBuilder` | `.not(Dead, Hidden)` |
| `where()` | `where<T>(type: Class<T>, pred: (data: Data<T>) => boolean): QueryBuilder` | `.where(Position, p => p.x > 0)` |
| `added()` | `added(): QueryBuilder` | `.added()` |
| `modified()` | `modified(): QueryBuilder` | `.modified()` |
| `changed()` | `changed(): QueryBuilder` | `.changed()` |
| `changedComponent()` | `changedComponent(...types: ComponentClass[]): QueryBuilder` | `.changedComponent(Position)` |

### Exécution

| Méthode | Signature | Exemple |
|---------|-----------|---------|
| `run()` | `run(callback: (view: ArchetypeView) => void): void` | `.run(view => { for (const e of view.iter()) {...} })` |
| `iter()` | `iter(): Generator<Entity>` | `for (const e of query.iter()) { ... }` |
| `iterDeterministic()` | `iterDeterministic(): Generator<Entity>` | `for (const e of query.iterDeterministic()) { ... }` |
| `forEach()` | `forEach(cb: (e: Entity) => void): void` | `.forEach(e => console.log(e))` |
| `collect()` | `collect(): Entity[]` | `const entities = query.collect()` |
| `count()` | `count(): number` | `const n = query.count()` |
| `first()` | `first(): Entity \| null` | `const first = query.first()` |

> **Note:** Utilisez `iterDeterministic()` au lieu de `iter()` quand l'ordre est important (replay, tests).

### Exemple Complet

```typescript
world.query(Position, Velocity)
  .where(Position, p => p.x > 0)
  .not(Dead)
  .run(view => {
    for (const row of view.iterRows()) {
      const e = view.entity(row);
      // Traiter entity
    }
  });
```

---

## 4. Relations

### Créer une Relation

| Méthode | Signature | Exemple |
|---------|-----------|---------|
| `defineRelation()` | `defineRelation<T>(name: string, options?: RelationOptions): RelationType<T>` | `const ChildOf = defineRelation("ChildOf", { exclusive: true })` |

### Options Relation

```typescript
interface RelationOptions {
  exclusive?: boolean;      // Une cible seulement (défaut: false)
  symmetric?: boolean;       // Auto-bidirectionnel (défaut: false)
  cascadeDelete?: boolean;   // Source supprimée si cible l'est (défaut: false)
  autoCleanup?: boolean;     // Nettoyage auto au despawn (défaut: true)
}
```

### Opérations Relation

| Méthode | Signature | Exemple |
|---------|-----------|---------|
| `relate()` | `relate<T>(src: Entity, rel: RelationType<T>, tgt: Entity, data?: T): boolean` | `world.relate(child, ChildOf, parent)` |
| `unrelate()` | `unrelate<T>(src: Entity, rel: RelationType<T>, tgt: Entity): boolean` | `world.unrelate(child, ChildOf, parent)` |
| `hasRelation()` | `hasRelation<T>(src: Entity, rel: RelationType<T>, tgt: Entity): boolean` | `if (world.hasRelation(e, ChildOf, parent))` |
| `getTarget()` | `getTarget<T>(src: Entity, rel: RelationType<T>): Entity \| null` | `const parent = world.getTarget(child, ChildOf)` |
| `getTargets()` | `getTargets<T>(src: Entity, rel: RelationType<T>): Entity[]` | `const items = world.getTargets(player, Contains)` |
| `getSources()` | `getSources<T>(tgt: Entity, rel: RelationType<T>): Entity[]` | `const children = world.getSources(parent, ChildOf)` |
| `getRelationData()` | `getRelationData<T>(src: Entity, rel: RelationType<T>, tgt: Entity): T \| undefined` | `const data = world.getRelationData(sword, EquippedIn, player)` |
| `setRelationData()` | `setRelationData<T>(src: Entity, rel: RelationType<T>, tgt: Entity, data: T): boolean` | `world.setRelationData(sword, EquippedIn, player, newData)` |

### Relations Intégrées

| Relation | Exclusive | Cascade | Description |
|----------|-----------|---------|-------------|
| `ChildOf` | Oui | Oui | Hiérarchie parent-enfant |
| `Contains` | Non | Non | Conteneur (inventaire, coffre) |
| `Targets` | Oui | Non | Ciblage (ennemi cible joueur) |

### Query by Relation

| Méthode | Signature | Exemple |
|---------|-----------|---------|
| `withRelation()` | `withRelation<T>(rel: RelationType<T>, target: Entity \| Wildcard): QueryBuilder` | `world.query(Position).withRelation(ChildOf, parent).run(...)` |
| `withRelationTo()` | `withRelationTo<T>(rel: RelationType<T>, source: Entity \| Wildcard): QueryBuilder` | `world.query(Position).withRelationTo(ChildOf, parent).run(...)` |

**WILDCARD constant** : Permet de matcher n'importe quelle cible/source

```typescript
import { WILDCARD } from "./ecs";

// Toutes les entités avec un parent (n'importe lequel)
world.query(Position)
  .withRelation(ChildOf, WILDCARD)
  .run(view => {
    // Traiter tous les enfants
  });

// Tous les items dans un conteneur spécifique
world.query(Item)
  .withRelation(Contains, chest)
  .run(view => {
    // Traiter items dans ce coffre
  });

// Inverse: tous les ennemis ciblés par une tourelle spécifique
world.query(Enemy)
  .withRelationTo(Targets, turret)
  .run(view => {
    // Traiter ennemis ciblés par cette tourelle
  });
```

---

## 5. Observers (Hooks)

### S'abonner à Changements

| Méthode | Signature | Exemple |
|---------|-----------|---------|
| `onAdd()` | `onAdd<T>(type: Class<T>, cb: (e: Entity, data: Data<T>) => void): ObserverSubscription` | `world.observers.onAdd(Position, (e, p) => {...})` |
| `onRemove()` | `onRemove<T>(type: Class<T>, cb: (e: Entity, data: Data<T>) => void): ObserverSubscription` | `world.observers.onRemove(Health, (e, h) => {...})` |
| `onSet()` | `onSet<T>(type: Class<T>, cb: (e: Entity, newData: Data<T>, oldData: Data<T> \| null) => void): ObserverSubscription` | `world.observers.onSet(Position, (e, newP, oldP) => {...})` |
| `onChange()` | `onChange<T>(type: Class<T>, cb: (e: Entity, newData: Data<T>, oldData: Data<T> \| null) => void): ObserverSubscription` | `world.observers.onChange(Position, ...)` |

### Gestion Subscription

| Méthode | Signature | Exemple |
|---------|-----------|---------|
| `unsubscribe()` | `unsubscribe(): void` | `sub.unsubscribe()` |

### Exemple

```typescript
const sub = world.observers.onSet(Position, (entity, newPos, oldPos) => {
  console.log(`Entity ${entity} moved from ${oldPos?.x} to ${newPos.x}`);
});

// Plus tard
sub.unsubscribe();
```

---

## 6. Systems

### Définir un System

| Méthode | Signature | Exemple |
|---------|-----------|---------|
| `defineSystem()` | `defineSystem(name: string): SystemBuilder` | `defineSystem("PlayerMovement")` |

### Configuration System

| Méthode | Signature | Exemple |
|---------|-----------|---------|
| `inPhase()` | `inPhase(phase: Phase): SystemBuilder` | `.inPhase(Phase.Update)` |
| `before()` | `before(...systems: string[]): SystemBuilder` | `.before("Render", "Physics")` |
| `after()` | `after(...systems: string[]): SystemBuilder` | `.after("Input")` |
| `disabled()` | `disabled(): SystemBuilder` | `.disabled()` |
| `once()` | `once(): SystemBuilder` | `.once()` |
| `runIf()` | `runIf(cond: Condition \| RunCondition): SystemBuilder` | `.runIf((world) => world.has(PlayerRef))` |
| `inSet()` | `inSet(set: SystemSet): SystemBuilder` | `.inSet(PhysicsSet)` |
| `inSets()` | `inSets(...sets: SystemSet[]): SystemBuilder` | `.inSets(PhysicsSet, AnimationSet)` |
| `execute()` | `execute(fn: (world: World) => void): System` | `.execute(world => { ... })` |

### Phases Disponibles

```typescript
enum Phase {
  PreUpdate = 0,
  Update = 1,
  PostUpdate = 2,
  PreRender = 3,
  Render = 4,
  PostRender = 5,
}
```

### Exemple System

```typescript
defineSystem("PlayerMovement")
  .inPhase(Phase.Update)
  .before("Physics")
  .runIf((world) => {
    const state = world.getResource(GameState);
    return state === "playing";
  })
  .execute((world) => {
    world.query(Position, Velocity)
      .run(view => {
        for (const row of view.iterRows()) {
          const e = view.entity(row);
          const pos = world.get(e, Position);
          const vel = world.get(e, Velocity);
          if (pos && vel) {
            world.set(e, Position, {
              x: pos.x + vel.vx,
              y: pos.y + vel.vy,
            });
          }
        }
      });
  });
```

---

## 7. System Sets

### Créer et Configurer Sets

| Méthode | Signature | Exemple |
|---------|-----------|---------|
| `configureSet()` | `configureSet(set: SystemSet): SetConfigBuilder` | `scheduler.configureSet(PhysicsSet)` |
| `configureSets()` | `configureSets(...sets: SystemSet[]): SetChainBuilder` | `scheduler.configureSets(InputSet, PhysicsSet, RenderSet)` |

### Configuration Set

| Méthode | Signature | Exemple |
|---------|-----------|---------|
| `runIf()` | `runIf(cond: Condition): SetConfigBuilder` | `.runIf((world) => true)` |
| `before()` | `before(set: SystemSet): SetConfigBuilder` | `.before(RenderSet)` |
| `after()` | `after(set: SystemSet): SetConfigBuilder` | `.after(PhysicsSet)` |
| `chain()` | `chain(): void` | `.chain()` |

### Exemple Sets

```typescript
// Créer un set
const PhysicsSet = Symbol("PhysicsSet");
const RenderSet = Symbol("RenderSet");

// Configurer sets
scheduler.configureSets(PhysicsSet, RenderSet).chain();

// Physique avant rendu
scheduler.configureSet(PhysicsSet).before(RenderSet);

// Ajouter system à set
defineSystem("ApplyVelocity")
  .inPhase(Phase.Update)
  .inSet(PhysicsSet)
  .execute(world => { ... });
```

---

## 8. Markers (Composants Tag)

### Markers Disponibles

| Marqueur | Catégorie | Description |
|----------|-----------|-------------|
| `Renderable` | Rendu | Entity peut être rendue |
| `Hidden` | Rendu | Entity cachée du rendu |
| `Culled` | Rendu | Entity en dehors de la caméra |
| `Collidable` | Physique | Participe à collision |
| `Blocking` | Physique | Bloque le mouvement |
| `Trigger` | Physique | Zone trigger (pas de collision) |
| `Player` | Gameplay | Contrôlé par joueur |
| `Enemy` | Gameplay | Contrôlé par IA |
| `NPC` | Gameplay | Neutre/friendly |
| `Pickable` | Gameplay | Peut être ramassé |
| `Interactable` | Gameplay | Peut interagir |
| `Dead` | Lifecycle | Mort (cleanup) |
| `JustSpawned` | Lifecycle | Fraîchement créé |
| `PendingDespawn` | Lifecycle | À supprimer |
| `Serializable` | Sérialisation | Sauvegardable |
| `NetworkSynced` | Sérialisation | Sync réseau |
| `MapEntity` | Sérialisation | Entité de map (static) |

### Utilisation

```typescript
@component class Item { ... }

// Spawn avec marker
const item = world.spawn(Item, Pickable, Renderable);

// Query avec marker
world.query(Pickable, Renderable).run(view => {
  // Tous les items ramassables et visibles
});

// Query sans marker
world.query(Item).not(Hidden).run(view => {
  // Items visibles
});
```

---

## 9. Bundles

### Créer un Bundle

| Méthode | Signature | Exemple |
|---------|-----------|---------|
| `bundle()` | `bundle<T>(...types: T): Bundle<T>` | `const PlayerBundle = bundle(Position, Health, Player)` |
| `spawnBundle()` | `spawnBundle(world, bundle, overrides?): Entity` | `world.spawn(...PlayerBundle.types)` |

### Opérations Bundle

| Méthode | Signature | Exemple |
|---------|-----------|---------|
| `defaults()` | `defaults(values: BundleDefaults<T>): Bundle<T>` | `.defaults({ Health: { current: 100 } })` |
| `with()` | `with(...others: Bundle \| ComponentClass[]): Bundle` | `.with(Renderable, Sprite)` |
| `applyDefaults()` | `applyDefaults(world, entity): void` | `bundle.applyDefaults(world, entity)` |

### Exemple Bundle

```typescript
// Créer bundle avec defaults
const EnemyBundle = bundle(Position, Health, Velocity, Enemy, Collidable)
  .defaults({
    Position: { x: 0, y: 0 },
    Health: { current: 50, max: 50 },
    Velocity: { vx: 0, vy: 0 },
  });

// Spawn avec bundle
const enemy = world.spawn(...EnemyBundle.types);
EnemyBundle.applyDefaults(world, enemy);

// Ou directement
const e = spawnBundle(world, EnemyBundle, {
  Position: { x: 10, y: 20 },  // Overrides
});

// Composer bundles
const VisibleEnemyBundle = EnemyBundle.with(Renderable, Sprite);
```

---

## 10. Resources

### Stockage Global

| Méthode | Signature | Exemple |
|---------|-----------|---------|
| `setResource()` | `setResource<T>(type: new (...) => T, value: T): void` | `world.setResource(GameState, "playing")` |
| `getResource()` | `getResource<T>(type: new (...) => T): T \| null` | `const state = world.getResource(GameState)` |
| `hasResource()` | `hasResource<T>(type: new (...) => T): boolean` | `if (world.hasResource(GameState)) { ... }` |

### Exemple Resource

```typescript
class GameState {
  status = "menu"; // "menu" | "playing" | "paused"
  score = 0;
}

// Initialiser
world.setResource(GameState, new GameState());

// Récupérer
const state = world.getResource(GameState);
if (state) {
  state.status = "playing";
}

// Vérifier
if (world.hasResource(GameState)) {
  // ...
}
```

---

## 11. Tick et Exécution

| Méthode | Signature | Exemple |
|---------|-----------|---------|
| `addSystem()` | `addSystem(system: System): void` | `world.addSystem(mySystem)` |
| `runTick()` | `runTick(): void` | `world.runTick()` |
| `getCurrentTick()` | `getCurrentTick(): number` | `const tick = world.getCurrentTick()` |

### Loop Principal

```typescript
const world = new World();

// Ajouter systems
world.addSystem(defineSystem("Input").inPhase(Phase.Update).execute(...));
world.addSystem(defineSystem("Physics").inPhase(Phase.Update).execute(...));
world.addSystem(defineSystem("Render").inPhase(Phase.Render).execute(...));

// Main loop
while (gameRunning) {
  // Execute all systems for this tick
  world.runTick();

  // Tick incremented after all systems run
  const tick = world.getCurrentTick();
}
```

---

## 12. Patterns Courants

### Pattern: Spawner

```typescript
@component class Spawner { count = u32(0); }

defineSystem("SpawnEnemies")
  .inPhase(Phase.Update)
  .execute(world => {
    world.query(Spawner).forEach(spawner => {
      const data = world.get(spawner, Spawner);
      if (data && data.count < 10) {
        const enemy = world.spawn(...EnemyBundle.types);
        EnemyBundle.applyDefaults(world, enemy);
        world.set(spawner, Spawner, { count: data.count + 1 });
      }
    });
  });
```

### Pattern: Health System

```typescript
@component class Health { current = u32(100); max = u32(100); }

defineSystem("DeathSystem")
  .inPhase(Phase.PostUpdate)
  .execute(world => {
    world.query(Health, Enemy)
      .where(Health, h => h.current === 0)
      .forEach(entity => {
        world.add(entity, Dead);
        world.observers.onAdd(Dead, (e) => {
          world.despawn(e);
        });
      });
  });
```

### Pattern: Hiérarchie

```typescript
const parent = world.spawn(Position, Renderable);
const child1 = world.spawn(Position);
const child2 = world.spawn(Position);

// Créer hiérarchie
world.relate(child1, ChildOf, parent);
world.relate(child2, ChildOf, parent);

// Obtenir enfants
const children = world.getSources(parent, ChildOf);

// Despawn parent = despawn auto des enfants (cascade)
world.despawn(parent);
```

### Pattern: Inventory

```typescript
const player = world.spawn(Position, Health);
const sword = world.spawn(Item);
const shield = world.spawn(Item);

// Ranger dans inventaire
world.relate(sword, Contains, player);
world.relate(shield, Contains, player);

// Obtenir items
const items = world.getTargets(player, Contains);

// Remove item
world.unrelate(sword, Contains, player);
```

---

## 13. APIs Avancées

### Hiérarchie

| Méthode | Signature | Exemple |
|---------|-----------|---------|
| `despawnHierarchy()` | `despawnHierarchy(entity: Entity): boolean` | `world.despawnHierarchy(parent)` |
| `despawnChildren()` | `despawnChildren<T>(entity: Entity, relation: RelationType<T>): number` | `world.despawnChildren(parent, ChildOf)` |

### Change Detection

| Méthode | Signature | Exemple |
|---------|-----------|---------|
| `getChangedEntities()` | `getChangedEntities(sinceTick: number): Entity[]` | `world.getChangedEntities(lastTick)` |
| `getArchetypesChangedSince()` | `getArchetypesChangedSince(sinceTick: number): Archetype[]` | `world.getArchetypesChangedSince(0)` |

### CommandBuffer (Deferred Operations)

| Méthode | Signature | Exemple |
|---------|-----------|---------|
| `spawn()` | `spawn(...components: ComponentClass[]): void` | `buffer.spawn(Position, Velocity)` |
| `despawn()` | `despawn(entity: Entity): void` | `buffer.despawn(entity)` |
| `add()` | `add<T>(entity: Entity, type: ComponentClass<T>, data?: Partial<T>): void` | `buffer.add(e, Health, { current: 100 })` |
| `remove()` | `remove<T>(entity: Entity, type: ComponentClass<T>): void` | `buffer.remove(e, Health)` |
| `flush()` | `flush(world: World): void` | `buffer.flush(world)` |
| `registerComponent()` | `registerComponent(type: ComponentClass): void` | `buffer.registerComponent(Health)` |

```typescript
// Usage CommandBuffer
const buffer = new CommandBuffer();
buffer.registerComponents(Position, Health, Velocity);

// Enqueue commands
buffer.spawn(Position, Health);
buffer.add(entity, Velocity, { vx: 5 });

// Execute all at once
buffer.flush(world);
```

### EventQueue

| Méthode | Signature | Exemple |
|---------|-----------|---------|
| `emit()` | `emit<T>(event: T): void` | `events.emit({ type: "damage", amount: 10 })` |
| `on()` | `on<T>(type: string, handler: (e: T) => void, priority?: number): Subscription` | `events.on("damage", e => ...)` |
| `onAny()` | `onAny(handler: (e: GameEvent) => void, priority?: number): Subscription` | `events.onAny(e => console.log(e))` |
| `off()` | `off(subscriptionId: number): boolean` | `events.off(sub.id)` |
| `flush()` | `flush(options?: FlushOptions): void` | `events.flush()` ou `events.flush({ recursive: true })` |
| `hasPendingEvents()` | `hasPendingEvents(): boolean` | `if (events.hasPendingEvents()) { ... }` |
| `drain()` | `drain<T>(type: string): T[]` | `const dmgEvents = events.drain("damage")` |

#### Event Recording (Debug/Replay)

| Méthode | Signature | Exemple |
|---------|-----------|---------|
| `startRecording()` | `startRecording(): void` | `events.startRecording()` |
| `stopRecording()` | `stopRecording(): void` | `events.stopRecording()` |
| `getRecordedEvents()` | `getRecordedEvents(): RecordedEvent[]` | `const history = events.getRecordedEvents()` |
| `replay()` | `replay(events: RecordedEvent[]): void` | `events.replay(history)` |

#### Typed Event Channels

| Méthode | Signature | Exemple |
|---------|-----------|---------|
| `defineEventChannel()` | `defineEventChannel<T>(name: string): EventChannel<T>` | `const DmgCh = defineEventChannel<DamageEvent>("damage")` |
| `emitChannel()` | `emitChannel<T>(channel: EventChannel<T>, event: T): void` | `events.emitChannel(DmgCh, { target, amount })` |
| `onChannel()` | `onChannel<T>(ch: EventChannel<T>, handler: (e: T) => void, priority?: number): Unsubscribe` | `events.onChannel(DmgCh, e => ...)` |

```typescript
// Typed Event Channel Usage
type DamageEvent = { target: Entity; amount: number };
const DamageChannel = defineEventChannel<DamageEvent>("damage");

// Type-safe emit
events.emitChannel(DamageChannel, { target: entity, amount: 50 });

// Type-safe handler
events.onChannel(DamageChannel, (e) => {
  console.log(`Entity ${e.target} took ${e.amount} damage`);
});

// Recursive flush (handle chained events)
while (events.hasPendingEvents()) {
  events.flush({ recursive: true, maxDepth: 10 });
}
```

### SpatialGrid

| Méthode | Signature | Exemple |
|---------|-----------|---------|
| `insert()` | `insert(entity: Entity, x: number, y: number): void` | `grid.insert(e, pos.x, pos.y)` |
| `update()` | `update(entity: Entity, x: number, y: number): void` | `grid.update(e, newX, newY)` |
| `remove()` | `remove(entity: Entity): void` | `grid.remove(e)` |
| `queryRect()` | `queryRect(x, y, width, height): Entity[]` | `grid.queryRect(0, 0, 100, 100)` |
| `queryRadius()` | `queryRadius(x, y, radius): Entity[]` | `grid.queryRadius(50, 50, 20)` |
| `queryNearest()` | `queryNearest(x, y, count, maxRadius?): Entity[]` | `grid.queryNearest(50, 50, 5)` |

```typescript
// Usage SpatialGrid
const grid = new SpatialGrid({
  worldWidth: 1000,
  worldHeight: 1000,
  cellSize: 32,
});

// Insert entities
grid.insert(player, 100, 200);

// Query nearby
const nearby = grid.queryRadius(100, 200, 50);
```

### Debug / Inspector

| Méthode | Signature | Exemple |
|---------|-----------|---------|
| `createInspector()` | `createInspector(world: World): WorldInspector` | `const inspector = createInspector(world)` |
| `getStats()` | `getStats(): WorldStats` | `inspector.getStats()` |
| `inspectEntity()` | `inspectEntity(entity: Entity): EntityInfo \| null` | `inspector.inspectEntity(e)` |
| `dumpEntity()` | `dumpEntity(entity: Entity): string` | `console.log(inspector.dumpEntity(e))` |
| `dumpWorld()` | `dumpWorld(): string` | `console.log(inspector.dumpWorld())` |

---

## Cheat Sheet pour les Recherches

| Je veux... | Utiliser... |
|-----------|------------|
| Créer entity | `world.spawn(ComponentType, ...)` |
| Ajouter composant | `world.add(entity, ComponentType, data)` |
| Modifier composant | `world.set(entity, ComponentType, data)` |
| Un seul champ | `world.setField(entity, ComponentType, "fieldName", value)` |
| String field | `world.setString(entity, ComponentType, "name", "text")` |
| Entity ref | `world.setEntityRef(entity, ComponentType, "fieldName", target)` |
| Requête simple | `world.query(Type1, Type2).run(view => ...)` |
| Requête avec filtre | `.where(Type, data => data.x > 0)` |
| Requête exclusions | `.not(Type1, Type2)` |
| Entities modifiées | `.modified()` or `.changed()` |
| Relation créer | `world.relate(source, RelationType, target, data)` |
| Relation obtenir | `world.getTarget(source, RelationType)` |
| Query avec relation | `.withRelation(RelationType, target)` |
| Query relation inverse | `.withRelationTo(RelationType, source)` |
| Query relation wildcard | `.withRelation(RelationType, WILDCARD)` |
| Observer changes | `world.observers.onSet(Type, callback)` |
| System définir | `defineSystem("Name").inPhase(Phase.Update).execute(...)` |
| System conditions | `.runIf(condition)` |
| Dépendances systems | `.before("Name").after("Name")` |
| Resource global | `world.setResource(ResourceClass, value)` |
| Récupérer resource | `world.getResource(ResourceClass)` |
| Exécuter tick | `world.runTick()` |
| Entites total | `world.getEntityCount()` |
| Entity vivante? | `world.isAlive(entity)` |

---

*Généré pour la révision v3 de l'ECS. Voir `/docs/` pour plus de détails.*
