import type { ComponentKey, ComponentType } from "./types";

export class ComponentRegistry {
  private readonly keyToId: Map<ComponentKey, number> = new Map();
  private readonly idToKey: ComponentKey[] = [];

  getId<T>(type: ComponentType<T>): number {
    let id = this.keyToId.get(type.key);
    if (id === undefined) {
      id = this.idToKey.length;
      this.idToKey.push(type.key);
      this.keyToId.set(type.key, id);
    }
    return id;
  }

  getKeyById(id: number): ComponentKey | undefined {
    return this.idToKey[id];
  }
}
