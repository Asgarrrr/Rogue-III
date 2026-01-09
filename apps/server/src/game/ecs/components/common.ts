/**
 * Common Components
 *
 * Shared component schemas used across features.
 */

import { ComponentSchema, ComponentType } from "../core/component";

/**
 * TemplateId component - tracks which template an entity was created from.
 */
export const TemplateIdSchema = ComponentSchema.define<{ id: string }>(
  "TemplateId",
)
  .field("id", ComponentType.String, "")
  .useAoS()
  .build();

/**
 * Name component - human-readable identifier.
 */
export const NameSchema = ComponentSchema.define<{ name: string }>("Name")
  .field("name", ComponentType.String, "")
  .useAoS()
  .build();

/**
 * Tags component - multiple string tags for categorization.
 */
export interface TagsData {
  readonly tags: Set<string>;
}

export const TagsSchema = ComponentSchema.define<TagsData>("Tags")
  .field("tags", ComponentType.Object, () => new Set<string>())
  .useAoS()
  .build();

/**
 * Disabled component - marks entity as temporarily inactive.
 */
export const DisabledSchema =
  ComponentSchema.define<Record<string, never>>("Disabled").build();

/**
 * PersistOnSave component - marks entity for serialization.
 */
export const PersistOnSaveSchema =
  ComponentSchema.define<Record<string, never>>("PersistOnSave").build();

/**
 * DontSerialize component - excludes entity from serialization.
 */
export const DontSerializeSchema =
  ComponentSchema.define<Record<string, never>>("DontSerialize").build();
