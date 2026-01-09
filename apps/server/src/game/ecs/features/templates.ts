/**
 * Entity Templates
 *
 * Blueprints for creating entities with predefined component configurations.
 * Supports inheritance and runtime instantiation with overrides.
 */

import type { Entity } from "../types";
import type { World } from "../core/world";

/**
 * Component data for a template.
 */
export type TemplateComponents = Readonly<Record<string, unknown>>;

/**
 * Entity template definition.
 */
export interface EntityTemplate<
  T extends TemplateComponents = TemplateComponents,
> {
  /** Unique template identifier */
  readonly id: string;
  /** Optional parent template to inherit from */
  readonly extends?: string;
  /** Component default values */
  readonly components: T;
  /** Optional tags for categorization */
  readonly tags?: readonly string[];
}

/**
 * Type-safe template builder.
 */
export class EntityTemplateBuilder<
  T extends TemplateComponents = Record<string, never>,
> {
  private id: string;
  private parentId?: string;
  private components: Record<string, unknown> = {};
  private tags: string[] = [];

  constructor(id: string) {
    this.id = id;
  }

  /**
   * Extends another template.
   */
  extends(parentId: string): this {
    this.parentId = parentId;
    return this;
  }

  /**
   * Adds a component with default values.
   */
  with<K extends string, V>(
    componentName: K,
    defaultValue: V,
  ): EntityTemplateBuilder<T & { [P in K]: V }> {
    this.components[componentName] = defaultValue;
    return this as EntityTemplateBuilder<T & { [P in K]: V }>;
  }

  /**
   * Adds tags to the template.
   */
  tagged(...tags: string[]): this {
    this.tags.push(...tags);
    return this;
  }

  /**
   * Builds the template.
   */
  build(): EntityTemplate<T> {
    return {
      id: this.id,
      extends: this.parentId,
      components: this.components as T,
      tags: this.tags.length > 0 ? this.tags : undefined,
    };
  }
}

/**
 * Creates a new template builder.
 */
export function defineTemplate(id: string): EntityTemplateBuilder {
  return new EntityTemplateBuilder(id);
}

/**
 * Deep merge two objects.
 */
function deepMerge<T extends Record<string, unknown>>(
  base: T,
  override: Partial<T>,
): T {
  const result = { ...base };

  for (const key of Object.keys(override) as Array<keyof T>) {
    const overrideValue = override[key];
    const baseValue = result[key];

    if (
      overrideValue !== undefined &&
      typeof overrideValue === "object" &&
      overrideValue !== null &&
      !Array.isArray(overrideValue) &&
      typeof baseValue === "object" &&
      baseValue !== null &&
      !Array.isArray(baseValue)
    ) {
      result[key] = deepMerge(
        baseValue as Record<string, unknown>,
        overrideValue as Record<string, unknown>,
      ) as T[keyof T];
    } else if (overrideValue !== undefined) {
      result[key] = overrideValue as T[keyof T];
    }
  }

  return result;
}

/**
 * Registry for entity templates.
 */
export class EntityTemplateRegistry {
  private readonly templates = new Map<string, EntityTemplate>();
  private readonly compiledTemplates = new Map<string, TemplateComponents>();
  private readonly tagIndex = new Map<string, Set<string>>();

  /**
   * Registers a template.
   */
  register<T extends TemplateComponents>(template: EntityTemplate<T>): void {
    if (this.templates.has(template.id)) {
      throw new Error(`Template "${template.id}" already registered`);
    }

    this.templates.set(template.id, template);
    this.compiledTemplates.delete(template.id); // Invalidate cache

    // Index by tags
    if (template.tags) {
      for (const tag of template.tags) {
        const ids = this.tagIndex.get(tag);
        if (ids) {
          ids.add(template.id);
        } else {
          this.tagIndex.set(tag, new Set([template.id]));
        }
      }
    }
  }

  /**
   * Gets a template by ID.
   */
  get(id: string): EntityTemplate | undefined {
    return this.templates.get(id);
  }

  /**
   * Checks if a template exists.
   */
  has(id: string): boolean {
    return this.templates.has(id);
  }

  /**
   * Gets templates by tag.
   */
  getByTag(tag: string): readonly string[] {
    const ids = this.tagIndex.get(tag);
    return ids ? Array.from(ids) : [];
  }

  /**
   * Compiles a template by resolving inheritance.
   */
  compile(id: string): TemplateComponents {
    const cached = this.compiledTemplates.get(id);
    if (cached) return cached;

    const template = this.templates.get(id);
    if (!template) {
      throw new Error(`Template "${id}" not found`);
    }

    let components: TemplateComponents;

    if (template.extends) {
      const parentComponents = this.compile(template.extends);
      components = deepMerge(
        parentComponents as Record<string, unknown>,
        template.components as Record<string, unknown>,
      );
    } else {
      components = { ...template.components };
    }

    this.compiledTemplates.set(id, components);
    return components;
  }

  /**
   * Instantiates a template as an entity.
   */
  instantiate(
    world: World,
    templateId: string,
    overrides?: Partial<TemplateComponents>,
  ): Entity {
    const components = this.compile(templateId);
    const entity = world.spawn();

    // Add TemplateId component for serialization
    if (world.components.hasComponent("TemplateId")) {
      world.addComponent(entity, "TemplateId", { id: templateId });
    }

    // Add all template components
    for (const [componentName, defaultData] of Object.entries(components)) {
      const overrideData = overrides?.[componentName];

      if (
        overrideData !== undefined &&
        typeof defaultData === "object" &&
        defaultData !== null
      ) {
        const mergedData = deepMerge(
          defaultData as Record<string, unknown>,
          overrideData as Record<string, unknown>,
        );
        world.addComponent(entity, componentName, mergedData);
      } else {
        world.addComponent(entity, componentName, overrideData ?? defaultData);
      }
    }

    return entity;
  }

  /**
   * Instantiates multiple entities from a template.
   */
  instantiateBatch(
    world: World,
    templateId: string,
    count: number,
    overridesFn?: (index: number) => Partial<TemplateComponents>,
  ): Entity[] {
    const entities: Entity[] = new Array(count);

    for (let i = 0; i < count; i++) {
      const overrides = overridesFn?.(i);
      entities[i] = this.instantiate(world, templateId, overrides);
    }

    return entities;
  }

  /**
   * Returns all registered template IDs.
   */
  getAllTemplateIds(): readonly string[] {
    return Array.from(this.templates.keys());
  }

  /**
   * Clears all templates.
   */
  clear(): void {
    this.templates.clear();
    this.compiledTemplates.clear();
    this.tagIndex.clear();
  }
}
