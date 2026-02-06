# Procgen V2 - Remaining Improvements

> **DEPRECATED:** Ce document a été remplacé par `IMPLEMENTATION_PLAN.md` qui contient un plan d'implémentation complet et détaillé.
>
> Voir: [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md)

---

Ce document liste les améliorations restantes identifiées lors de la counter-analysis.

## Contexte

L'analyse initiale a identifié 5 améliorations prioritaires qui ont été implémentées :
- ✅ Extraction BSP en passes composables
- ✅ Fix déterminisme (timestamp=0, spawns dans checksum, createSeedFromSeed)
- ✅ Decision tracing sur tous les choix aléatoires
- ✅ AbortSignal entre les passes du pipeline
- ✅ Invariant assertions (validateDungeon)

---

## Priorité Haute

### 1. Cellular Automata Generator
**Fichiers:** `src/generators/cellular/generator.ts`, `src/generators/cellular/passes.ts`

Le générateur Cellular Automata est marqué TODO dans `src/index.ts:69`:
```typescript
const generators: Record<string, Generator> = {
  bsp: createBSPGenerator(),
  // cellular: createCellularGenerator(), // TODO
};
```

**À implémenter:**
- Passes: `initializeRandom`, `applyCellularRules`, `findLargestRegion`, `connectRegions`, `calculateSpawns`
- Utiliser `CellularConfig` déjà défini dans `pipeline/types.ts`
- Utiliser `Grid.applyCellularAutomata()` et `findLargestRegion()` de `core/grid/flood-fill.ts`

### 2. Checksum 64-bit
**Fichier:** `src/generators/bsp/passes.ts:769-811`, `src/index.ts:369-403`

Le checksum DJB2 actuel est 32-bit, risque de collision avec ~10k dungeons (birthday paradox).

**À implémenter:**
- Utiliser un hash 64-bit (FNV-1a 64-bit ou xxHash)
- Modifier `calculateChecksum()` dans passes.ts et `computeChecksum()` dans index.ts
- Retourner un string hex de 16 caractères au lieu de 8

---

## Priorité Moyenne

### 3. Grid Immutability Fix
**Fichier:** `src/core/grid/grid.ts:369-371`

`getRawData()` retourne l'array mutable directement:
```typescript
getRawData(): Uint8Array {
  return this.data; // Retourne la référence directe!
}
```

**À implémenter:**
- Option 1: Retourner une copie `return new Uint8Array(this.data)`
- Option 2: Ajouter `getRawDataCopy()` et garder `getRawData()` pour perf interne
- Mettre à jour les usages dans `DungeonArtifact.terrain`

### 4. O(n²) MST Optimization
**Fichier:** `src/generators/bsp/passes.ts:334-348`

Le MST construit un graphe complet O(n²) avant Kruskal:
```typescript
for (let i = 0; i < rooms.length; i++) {
  for (let j = i + 1; j < rooms.length; j++) {
    // O(n²) edges
  }
}
```

**À implémenter:**
- Delaunay triangulation pour obtenir O(n) edges
- Puis MST sur ce graphe sparse
- Librairie suggérée: `delaunator` ou implémentation maison

### 5. Room Type Semantics
**Fichier:** `src/generators/bsp/passes.ts:273-283`

`Room.type` est toujours "normal", jamais utilisé pour différencier:
```typescript
const room: Room = {
  // ...
  type: "normal", // Toujours "normal"
};
```

**À implémenter:**
- Définir des types de rooms: "normal", "treasure", "boss", "entrance", "exit"
- Ajouter logique de sélection basée sur distance, taille, position
- Utiliser `Room.seed` pour génération de contenu per-room

---

## Nice-to-Have (Masterpiece Level)

### 6. Artifact Snapshots
**Fichiers:** `src/pipeline/builder.ts`, `src/pipeline/types.ts`

Capturer l'état du grid après chaque pass pour debugging visuel.

**À implémenter:**
- Ajouter `snapshots: GridArtifact[]` dans `PipelineResult`
- Si `options.captureSnapshots`, cloner le grid après chaque pass
- Utile pour visualiser la progression BSP → rooms → corridors

### 7. Generation Statistics
**Fichier:** `src/index.ts` ou nouveau `src/stats.ts`

Statistiques sur les dungeons générés.

**À implémenter:**
```typescript
interface GenerationStats {
  roomCount: number;
  avgRoomSize: number;
  totalFloorTiles: number;
  floorRatio: number;
  avgCorridorLength: number;
  connectivityDensity: number; // edges / (n*(n-1)/2)
}
```

### 8. Pass Library
**Fichier:** `src/passes/` (nouveau dossier)

Passes réutilisables pour différents algorithmes.

**À implémenter:**
- `src/passes/carving/` - Différents algorithmes de corridors (L-shaped, Bresenham, A*)
- `src/passes/connectivity/` - MST, Delaunay, random extra edges
- `src/passes/placement/` - Spawn algorithms, item distribution
- `src/passes/validation/` - Invariant checks as passes

### 9. Generator Chaining
**Fichier:** `src/index.ts` ou nouveau `src/composition.ts`

Permettre de chaîner des générateurs.

**À implémenter:**
```typescript
// BSP pour layout, puis Cellular pour texture des murs
const dungeon = chain(
  bspGenerator.createPipeline(config),
  cellularTexturePass(),
  spawnPass()
);
```

### 10. Property Testing
**Fichier:** `tests/property/` (nouveau dossier)

Générer N dungeons et vérifier invariants statistiques.

**À implémenter:**
```typescript
describe("property tests", () => {
  it("all dungeons are valid over 1000 seeds", () => {
    for (let i = 0; i < 1000; i++) {
      const result = generate({ ...config, seed: createSeed(i) });
      expect(validateDungeon(result.artifact).valid).toBe(true);
    }
  });
});
```

---

## Ordre d'Implémentation Recommandé

1. **Cellular Automata Generator** - Complète le package avec un 2e algorithme
2. **Checksum 64-bit** - Fix important pour production
3. **Grid Immutability** - Fix la copie pour éviter mutations accidentelles
4. **Room Type Semantics** - Prépare le terrain pour contenu procédural
5. **O(n²) MST** - Optimisation pour grandes maps (peut attendre)
6. **Artifact Snapshots** - Debugging visuel
7. **Generation Statistics** - Analytics
8. **Pass Library** - Extensibilité
9. **Generator Chaining** - Composition avancée
10. **Property Testing** - Confiance statistique

---

## Notes Techniques

### Fichiers Clés
- `src/index.ts` - API principale, seed functions, validateDungeon
- `src/pipeline/types.ts` - Tous les types, artifacts, configs
- `src/pipeline/builder.ts` - PipelineBuilder, RNG streams
- `src/generators/bsp/passes.ts` - 8 passes BSP avec decision tracing
- `src/generators/bsp/generator.ts` - BSPGenerator utilisant PipelineBuilder
- `src/core/grid/grid.ts` - Grid class haute performance
- `src/core/grid/flood-fill.ts` - Algorithmes flood fill et régions

### Tests
- `tests/generation.test.ts` - 142 tests dont invariants, tracing, abort signal
