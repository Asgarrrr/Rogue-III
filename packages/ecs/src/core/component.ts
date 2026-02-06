import { FIELD_MARKER, type FieldDescriptor } from "./field";
import {
  type ComponentClass,
  type ComponentId,
  type ComponentMeta,
  FIELD_BYTE_SIZE,
  type FieldMeta,
} from "./types";

let nextComponentIndex = 0;
const COMPONENT_META = new Map<ComponentClass, ComponentMeta>();
const COMPONENT_BY_NAME = new Map<string, ComponentClass>();

/** Decorator to register a class as an ECS component. */
export function component<T extends ComponentClass>(target: T): T {
  const instance = new target();
  const entries = Object.entries(instance as Record<string, unknown>);

  const fields: FieldMeta[] = [];
  let offset = 0;
  let isTag = true;

  for (const [name, value] of entries) {
    if (typeof value === "object" && value !== null && FIELD_MARKER in value) {
      const desc = value as FieldDescriptor;
      fields.push({
        name,
        type: desc.type,
        offset,
        default: desc.default,
      });
      offset += FIELD_BYTE_SIZE[desc.type];
      isTag = false;
    }
  }

  const id: ComponentId = {
    index: nextComponentIndex++,
    name: target.name,
  };

  const meta: ComponentMeta = {
    id,
    fields,
    stride: offset,
    isTag,
  };

  COMPONENT_META.set(target, meta);
  COMPONENT_BY_NAME.set(target.name, target);
  (target as ComponentClass).__ecs = meta;

  return target;
}

/** Get metadata for a registered component. Throws if not registered. */
export function getComponentMeta(target: ComponentClass): ComponentMeta {
  const meta = COMPONENT_META.get(target);
  if (!meta) {
    throw new Error(
      `Component not registered: ${target.name}. Use @component decorator.`,
    );
  }
  return meta;
}

/** Check if a component class has been registered. */
export function hasComponentMeta(target: ComponentClass): boolean {
  return COMPONENT_META.has(target);
}

/** Get total number of registered components. */
export function getComponentCount(): number {
  return nextComponentIndex;
}

/** Get a component class by its name. */
export function getComponentByName(name: string): ComponentClass | undefined {
  return COMPONENT_BY_NAME.get(name);
}

/** Get all registered component classes. */
export function getAllComponents(): ComponentClass[] {
  return [...COMPONENT_BY_NAME.values()];
}
