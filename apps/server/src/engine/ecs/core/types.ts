// Core ECS shared types

export type EntityId = number;

export type ComponentKey = string;

export interface ComponentType<_TComponent> {
  key: ComponentKey;
}

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
