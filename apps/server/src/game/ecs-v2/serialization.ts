import { getComponentByName, getComponentMeta } from "./component";
import type { ComponentClass, Entity } from "./types";
import { World } from "./world";
import { type MigrationRegistry, globalMigrations } from "./migration";
import { getRelationByName, type RelationType } from "./relation";

export interface SerializedEntity {
  id: number;
  components: Record<string, Record<string, number>>;
}

/**
 * A serialized relation.
 */
export interface SerializedRelation {
  /** Relation type name */
  type: string;
  /** Source entity ID (from snapshot) */
  source: number;
  /** Target entity ID (from snapshot) */
  target: number;
  /** Optional relation data */
  data?: unknown;
}

export interface WorldSnapshot {
  version: string;
  tick: number;
  entities: SerializedEntity[];
  resources: Record<string, unknown>;
  /** Serialized relations (optional for backward compatibility) */
  relations?: SerializedRelation[];
}

export const SNAPSHOT_VERSION = "1.1.0";

export interface WorldSerializerOptions {
  /** Migration registry to use for version upgrades. Defaults to globalMigrations. */
  migrations?: MigrationRegistry;
  /** If true, skip unknown components during deserialization instead of throwing. */
  skipUnknownComponents?: boolean;
  /** If true, skip unknown fields during deserialization instead of applying them. */
  skipUnknownFields?: boolean;
  /** If true, skip unknown relations during deserialization instead of throwing. */
  skipUnknownRelations?: boolean;
  /** Relation types to serialize. If not specified, no relations are serialized. */
  relationTypes?: RelationType[];
}

export class WorldSerializer {
  private readonly migrations: MigrationRegistry;
  private readonly skipUnknownComponents: boolean;
  private readonly skipUnknownFields: boolean;
  private readonly skipUnknownRelations: boolean;
  private readonly relationTypes: RelationType[];

  constructor(options: WorldSerializerOptions = {}) {
    this.migrations = options.migrations ?? globalMigrations;
    this.skipUnknownComponents = options.skipUnknownComponents ?? false;
    this.skipUnknownFields = options.skipUnknownFields ?? false;
    this.skipUnknownRelations = options.skipUnknownRelations ?? false;
    this.relationTypes = options.relationTypes ?? [];
  }

  serialize(world: World): WorldSnapshot {
    const entities: SerializedEntity[] = [];

    for (const archetype of world.getArchetypesChangedSince(-1)) {
      for (let row = 0; row < archetype.count; row++) {
        const entity = archetype.getEntity(row);
        const components: Record<string, Record<string, number>> = {};

        for (const compType of archetype.componentTypes) {
          const meta = getComponentMeta(compType);
          if (meta.isTag) {
            components[meta.id.name] = {};
          } else {
            const data: Record<string, number> = {};
            for (const field of meta.fields) {
              const value = archetype.getFieldValue(
                row,
                meta.id.index,
                field.name,
              );
              if (value !== undefined) {
                data[field.name] = value;
              }
            }
            components[meta.id.name] = data;
          }
        }

        entities.push({ id: entity, components });
      }
    }

    // Serialize relations
    const relations: SerializedRelation[] = [];
    for (const relationType of this.relationTypes) {
      world.relations.forEach(relationType, (source, target, data) => {
        relations.push({
          type: relationType.id.name,
          source: source as number,
          target: target as number,
          data,
        });
      });
    }

    return {
      version: SNAPSHOT_VERSION,
      tick: world.getCurrentTick(),
      entities,
      resources: world.resources.toJSON(),
      relations: relations.length > 0 ? relations : undefined,
    };
  }

  deserialize(snapshot: WorldSnapshot, maxEntities?: number): World {
    // Apply migrations if needed
    let migratedSnapshot = snapshot;
    if (snapshot.version !== SNAPSHOT_VERSION) {
      if (this.migrations.canMigrate(snapshot.version, SNAPSHOT_VERSION)) {
        migratedSnapshot = this.migrations.migrate(snapshot, SNAPSHOT_VERSION);
      } else {
        throw new Error(
          `Snapshot version mismatch: expected ${SNAPSHOT_VERSION}, got ${snapshot.version}. ` +
            `No migration path available.`,
        );
      }
    }

    const world = new World(maxEntities);

    // Map from old entity IDs to new entity IDs (for relation remapping)
    const entityIdMap = new Map<number, Entity>();

    for (const serialized of migratedSnapshot.entities) {
      const componentTypes: ComponentClass[] = [];
      const componentData: Array<{
        meta: ReturnType<typeof getComponentMeta>;
        data: Record<string, number>;
      }> = [];

      for (const [name, data] of Object.entries(serialized.components)) {
        const compClass = getComponentByName(name);
        if (!compClass) {
          if (this.skipUnknownComponents) {
            continue;
          }
          throw new Error(`Unknown component: ${name}`);
        }
        componentTypes.push(compClass);

        // Filter unknown fields if option is set
        const meta = getComponentMeta(compClass);
        let filteredData = data;
        if (this.skipUnknownFields && !meta.isTag) {
          const knownFields = new Set(meta.fields.map((f) => f.name));
          filteredData = Object.fromEntries(
            Object.entries(data).filter(([key]) => knownFields.has(key)),
          );
        }

        componentData.push({ meta, data: filteredData });
      }

      if (componentTypes.length === 0) continue;

      const entity = world.spawn(...componentTypes);

      // Track the mapping from old ID to new ID
      entityIdMap.set(serialized.id, entity);

      for (const { meta, data } of componentData) {
        if (!meta.isTag && Object.keys(data).length > 0) {
          world.set(
            entity,
            componentTypes.find(
              (c) => getComponentMeta(c).id.name === meta.id.name,
            )!,
            data,
          );
        }
      }
    }

    world.resources.fromJSON(migratedSnapshot.resources);

    // Restore relations (after all entities are created)
    if (migratedSnapshot.relations) {
      for (const rel of migratedSnapshot.relations) {
        const relationType = getRelationByName(rel.type);
        if (!relationType) {
          if (this.skipUnknownRelations) {
            continue;
          }
          throw new Error(`Unknown relation type: ${rel.type}`);
        }

        const newSource = entityIdMap.get(rel.source);
        const newTarget = entityIdMap.get(rel.target);

        if (newSource === undefined || newTarget === undefined) {
          // Skip relations with missing entities (they might have been filtered)
          continue;
        }

        world.relate(newSource, relationType, newTarget, rel.data);
      }
    }

    return world;
  }

  /**
   * Check if a snapshot can be deserialized (either directly or via migrations).
   */
  canDeserialize(snapshot: WorldSnapshot): boolean {
    if (snapshot.version === SNAPSHOT_VERSION) return true;
    return this.migrations.canMigrate(snapshot.version, SNAPSHOT_VERSION);
  }

  /**
   * Get the migration path that would be applied to deserialize a snapshot.
   * Returns empty array if no migration needed, or throws if no path exists.
   */
  getMigrationPath(snapshot: WorldSnapshot): string[] {
    if (snapshot.version === SNAPSHOT_VERSION) return [];
    const path = this.migrations.getMigrationPath(
      snapshot.version,
      SNAPSHOT_VERSION,
    );
    return path.map(
      (m) => m.description ?? `${m.fromVersion} -> ${m.toVersion}`,
    );
  }
}

export function serializeWorld(world: World): WorldSnapshot {
  return new WorldSerializer().serialize(world);
}

export function deserializeWorld(
  snapshot: WorldSnapshot,
  maxEntities?: number,
): World {
  return new WorldSerializer().deserialize(snapshot, maxEntities);
}
