import type { SerializedEntity, WorldSnapshot } from "./serialization";

/**
 * A migration transforms a snapshot from one version to another.
 */
export interface Migration {
  /** Source version (e.g., "1.0.0") */
  readonly fromVersion: string;
  /** Target version (e.g., "1.1.0") */
  readonly toVersion: string;
  /** Human-readable description of what this migration does */
  readonly description?: string;
  /**
   * Transform the snapshot from fromVersion to toVersion.
   * Should return a new snapshot object (not mutate the input).
   */
  migrate(snapshot: WorldSnapshot): WorldSnapshot;
}

/**
 * Helper type for entity transformations
 */
export type EntityTransformer = (entity: SerializedEntity) => SerializedEntity;

/**
 * Helper type for component transformations
 */
export type ComponentTransformer = (
  componentName: string,
  data: Record<string, number>,
) => Record<string, number> | null;

/**
 * Registry for managing schema migrations.
 * Migrations are applied in sequence from source to target version.
 */
export class MigrationRegistry {
  private readonly migrations: Migration[] = [];
  private readonly migrationsByFrom = new Map<string, Migration>();

  /**
   * Register a migration.
   * Migrations should be registered in order from oldest to newest.
   */
  register(migration: Migration): this {
    // Check for duplicate
    if (this.migrationsByFrom.has(migration.fromVersion)) {
      throw new Error(
        `Migration from version "${migration.fromVersion}" already registered`,
      );
    }

    this.migrations.push(migration);
    this.migrationsByFrom.set(migration.fromVersion, migration);

    return this;
  }

  /**
   * Register multiple migrations at once.
   */
  registerAll(migrations: Migration[]): this {
    for (const m of migrations) {
      this.register(m);
    }
    return this;
  }

  /**
   * Check if a migration path exists from source to target version.
   */
  canMigrate(fromVersion: string, toVersion: string): boolean {
    if (fromVersion === toVersion) return true;

    try {
      this.getMigrationPath(fromVersion, toVersion);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get the sequence of migrations needed to go from source to target version.
   * Throws if no path exists.
   */
  getMigrationPath(fromVersion: string, toVersion: string): Migration[] {
    if (fromVersion === toVersion) return [];

    const path: Migration[] = [];
    let currentVersion = fromVersion;

    // Prevent infinite loops
    const maxIterations = 100;
    let iterations = 0;

    while (currentVersion !== toVersion && iterations < maxIterations) {
      const migration = this.migrationsByFrom.get(currentVersion);

      if (!migration) {
        throw new Error(
          `No migration path from "${fromVersion}" to "${toVersion}". ` +
            `Stuck at version "${currentVersion}". ` +
            `Available migrations: ${this.getAvailableVersions().join(", ")}`,
        );
      }

      path.push(migration);
      currentVersion = migration.toVersion;
      iterations++;
    }

    if (iterations >= maxIterations) {
      throw new Error(
        `Migration path too long or circular dependency detected ` +
          `(from "${fromVersion}" to "${toVersion}")`,
      );
    }

    return path;
  }

  /**
   * Apply migrations to transform a snapshot from its version to the target version.
   */
  migrate(snapshot: WorldSnapshot, targetVersion: string): WorldSnapshot {
    const sourceVersion = snapshot.version;

    if (sourceVersion === targetVersion) {
      return snapshot;
    }

    const path = this.getMigrationPath(sourceVersion, targetVersion);
    let current = snapshot;

    for (const migration of path) {
      current = migration.migrate(current);
      // Ensure version is updated
      current = { ...current, version: migration.toVersion };
    }

    return current;
  }

  /**
   * Get all registered source versions.
   */
  getAvailableVersions(): string[] {
    return [...this.migrationsByFrom.keys()];
  }

  /**
   * Get the count of registered migrations.
   */
  get count(): number {
    return this.migrations.length;
  }

  /**
   * Clear all registered migrations.
   */
  clear(): void {
    this.migrations.length = 0;
    this.migrationsByFrom.clear();
  }
}

// ============================================================================
// Migration Helpers
// ============================================================================

/**
 * Create a migration that transforms entities.
 */
export function createEntityMigration(
  fromVersion: string,
  toVersion: string,
  transformer: EntityTransformer,
  description?: string,
): Migration {
  return {
    fromVersion,
    toVersion,
    description,
    migrate(snapshot: WorldSnapshot): WorldSnapshot {
      return {
        ...snapshot,
        version: toVersion,
        entities: snapshot.entities.map(transformer),
      };
    },
  };
}

/**
 * Create a migration that adds a new field to a component with a default value.
 */
export function addFieldMigration(
  fromVersion: string,
  toVersion: string,
  componentName: string,
  fieldName: string,
  defaultValue: number,
  description?: string,
): Migration {
  return createEntityMigration(
    fromVersion,
    toVersion,
    (entity) => {
      const component = entity.components[componentName];
      if (component && component[fieldName] === undefined) {
        return {
          ...entity,
          components: {
            ...entity.components,
            [componentName]: {
              ...component,
              [fieldName]: defaultValue,
            },
          },
        };
      }
      return entity;
    },
    description ??
      `Add ${componentName}.${fieldName} with default ${defaultValue}`,
  );
}

/**
 * Create a migration that removes a field from a component.
 */
export function removeFieldMigration(
  fromVersion: string,
  toVersion: string,
  componentName: string,
  fieldName: string,
  description?: string,
): Migration {
  return createEntityMigration(
    fromVersion,
    toVersion,
    (entity) => {
      const component = entity.components[componentName];
      if (component && fieldName in component) {
        const { [fieldName]: _, ...rest } = component;
        return {
          ...entity,
          components: {
            ...entity.components,
            [componentName]: rest,
          },
        };
      }
      return entity;
    },
    description ?? `Remove ${componentName}.${fieldName}`,
  );
}

/**
 * Create a migration that renames a field in a component.
 */
export function renameFieldMigration(
  fromVersion: string,
  toVersion: string,
  componentName: string,
  oldFieldName: string,
  newFieldName: string,
  description?: string,
): Migration {
  return createEntityMigration(
    fromVersion,
    toVersion,
    (entity) => {
      const component = entity.components[componentName];
      if (component && oldFieldName in component) {
        const value = component[oldFieldName]!;
        const newComponent: Record<string, number> = {};
        for (const key in component) {
          if (key !== oldFieldName) {
            newComponent[key] = component[key]!;
          }
        }
        newComponent[newFieldName] = value;
        return {
          ...entity,
          components: {
            ...entity.components,
            [componentName]: newComponent,
          },
        };
      }
      return entity;
    },
    description ?? `Rename ${componentName}.${oldFieldName} to ${newFieldName}`,
  );
}

/**
 * Create a migration that renames a component.
 */
export function renameComponentMigration(
  fromVersion: string,
  toVersion: string,
  oldName: string,
  newName: string,
  description?: string,
): Migration {
  return createEntityMigration(
    fromVersion,
    toVersion,
    (entity) => {
      const data = entity.components[oldName];
      if (data) {
        const newComponents: Record<string, Record<string, number>> = {};
        for (const key in entity.components) {
          if (key !== oldName) {
            newComponents[key] = entity.components[key]!;
          }
        }
        newComponents[newName] = data;
        return {
          ...entity,
          components: newComponents,
        };
      }
      return entity;
    },
    description ?? `Rename component ${oldName} to ${newName}`,
  );
}

/**
 * Create a migration that removes a component entirely.
 */
export function removeComponentMigration(
  fromVersion: string,
  toVersion: string,
  componentName: string,
  description?: string,
): Migration {
  return createEntityMigration(
    fromVersion,
    toVersion,
    (entity) => {
      if (componentName in entity.components) {
        const { [componentName]: _, ...rest } = entity.components;
        return {
          ...entity,
          components: rest,
        };
      }
      return entity;
    },
    description ?? `Remove component ${componentName}`,
  );
}

/**
 * Create a migration that transforms a field value.
 */
export function transformFieldMigration(
  fromVersion: string,
  toVersion: string,
  componentName: string,
  fieldName: string,
  transform: (value: number) => number,
  description?: string,
): Migration {
  return createEntityMigration(
    fromVersion,
    toVersion,
    (entity) => {
      const component = entity.components[componentName];
      if (component && fieldName in component) {
        return {
          ...entity,
          components: {
            ...entity.components,
            [componentName]: {
              ...component,
              [fieldName]: transform(component[fieldName]!),
            },
          },
        };
      }
      return entity;
    },
    description ?? `Transform ${componentName}.${fieldName}`,
  );
}

/**
 * Compose multiple migrations into a single migration.
 */
export function composeMigrations(
  fromVersion: string,
  toVersion: string,
  migrations: Array<(snapshot: WorldSnapshot) => WorldSnapshot>,
  description?: string,
): Migration {
  return {
    fromVersion,
    toVersion,
    description,
    migrate(snapshot: WorldSnapshot): WorldSnapshot {
      let current = snapshot;
      for (const m of migrations) {
        current = m(current);
      }
      return { ...current, version: toVersion };
    },
  };
}

// Global migration registry (can be replaced per-project)
export const globalMigrations = new MigrationRegistry();
