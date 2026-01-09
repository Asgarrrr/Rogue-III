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

export function getComponentMeta(target: ComponentClass): ComponentMeta {
  const meta = COMPONENT_META.get(target);
  if (!meta) {
    throw new Error(
      `Component not registered: ${target.name}. Use @component decorator.`,
    );
  }
  return meta;
}

export function hasComponentMeta(target: ComponentClass): boolean {
  return COMPONENT_META.has(target);
}

export function getComponentCount(): number {
  return nextComponentIndex;
}

export function getComponentByName(name: string): ComponentClass | undefined {
  return COMPONENT_BY_NAME.get(name);
}

export function getAllComponents(): ComponentClass[] {
  return [...COMPONENT_BY_NAME.values()];
}
