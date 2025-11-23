// Core ECS shared types

export type EntityId = number;

export type ComponentKey = string;

export interface ComponentType<_TComponent> {
  key: ComponentKey;
}

// biome-ignore lint/suspicious/noExplicitAny: Required for generic component arrays in ECS queries
export type AnyComponentType = ComponentType<any>;

// Empty resources type for default generic parameters
export type EmptyResources = Record<string, never>;

export function defineComponent<TComponent>(
  key: ComponentKey,
): ComponentType<TComponent> {
  return { key };
}

export type SystemPhase =
  | "init"
  | "preUpdate"
  | "update"
  | "postUpdate"
  | "lateUpdate";
