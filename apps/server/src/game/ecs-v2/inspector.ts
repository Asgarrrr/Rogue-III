import type { Entity, ComponentClass } from "./types";
import type { World } from "./world";
import type { Archetype } from "./archetype";
import { getComponentMeta, getAllComponents } from "./component";

export interface EntityInfo {
  id: number;
  alive: boolean;
  components: ComponentInfo[];
}

export interface ComponentInfo {
  name: string;
  isTag: boolean;
  data: Record<string, number> | null;
}

export interface ArchetypeInfo {
  id: number;
  entityCount: number;
  capacity: number;
  version: number;
  components: string[];
  mask: string;
}

export interface WorldStats {
  entityCount: number;
  maxEntities: number;
  archetypeCount: number;
  componentTypeCount: number;
  currentTick: number;
  resourceCount: number;
}

export class WorldInspector {
  constructor(private readonly world: World) {}

  getStats(): WorldStats {
    return {
      entityCount: this.world.getEntityCount(),
      maxEntities: 1 << 20,
      archetypeCount: this.world.getArchetypeCount(),
      componentTypeCount: getAllComponents().length,
      currentTick: this.world.getCurrentTick(),
      resourceCount: this.world.resources.size,
    };
  }

  inspectEntity(entity: Entity): EntityInfo | null {
    if (!this.world.isAlive(entity)) {
      return { id: entity, alive: false, components: [] };
    }

    const components: ComponentInfo[] = [];

    for (const compClass of getAllComponents()) {
      if (this.world.has(entity, compClass)) {
        const meta = getComponentMeta(compClass);
        const data = this.world.get(entity, compClass);
        components.push({
          name: meta.id.name,
          isTag: meta.isTag,
          data: meta.isTag ? null : (data as Record<string, number>),
        });
      }
    }

    return { id: entity, alive: true, components };
  }

  inspectArchetype(archetypeId: number): ArchetypeInfo | null {
    const archetypes = this.world.getArchetypesChangedSince(-1);
    const archetype = archetypes.find((a) => a.id === archetypeId);

    if (!archetype) return null;

    return this.archetypeToInfo(archetype);
  }

  listArchetypes(): ArchetypeInfo[] {
    return this.world
      .getArchetypesChangedSince(-1)
      .map((a) => this.archetypeToInfo(a));
  }

  findEntitiesWith(...componentTypes: ComponentClass[]): Entity[] {
    const entities: Entity[] = [];
    this.world.query(...componentTypes).run((view) => {
      for (let i = 0; i < view.rawCount(); i++) {
        entities.push(view.entity(i));
      }
    });
    return entities;
  }

  countEntitiesWith(...componentTypes: ComponentClass[]): number {
    return this.world.query(...componentTypes).count();
  }

  dumpEntity(entity: Entity): string {
    const info = this.inspectEntity(entity);
    if (!info) return `Entity ${entity}: NOT FOUND`;
    if (!info.alive) return `Entity ${entity}: DEAD`;

    const lines = [`Entity ${entity}:`];
    for (const comp of info.components) {
      if (comp.isTag) {
        lines.push(`  [${comp.name}] (tag)`);
      } else {
        const fields = Object.entries(comp.data || {})
          .map(([k, v]) => `${k}=${v}`)
          .join(", ");
        lines.push(`  [${comp.name}] ${fields}`);
      }
    }
    return lines.join("\n");
  }

  dumpWorld(): string {
    const stats = this.getStats();
    const lines = [
      "=== World State ===",
      `Entities: ${stats.entityCount}`,
      `Archetypes: ${stats.archetypeCount}`,
      `Component Types: ${stats.componentTypeCount}`,
      `Tick: ${stats.currentTick}`,
      `Resources: ${stats.resourceCount}`,
      "",
      "=== Archetypes ===",
    ];

    for (const arch of this.listArchetypes()) {
      lines.push(
        `  [${arch.id}] ${arch.components.join(", ")} (${arch.entityCount} entities)`,
      );
    }

    return lines.join("\n");
  }

  private archetypeToInfo(archetype: Archetype): ArchetypeInfo {
    return {
      id: archetype.id,
      entityCount: archetype.count,
      capacity: archetype.capacity,
      version: archetype.version,
      components: archetype.componentTypes.map(
        (c) => getComponentMeta(c).id.name,
      ),
      mask: archetype.mask.toString(2),
    };
  }
}

export function createInspector(world: World): WorldInspector {
  return new WorldInspector(world);
}
