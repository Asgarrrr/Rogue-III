import type { ComponentStore } from "./component-store";
import type { AnyComponentType, ComponentType, EntityId } from "./types";
import type { World } from "./world";

type TupleOfComponents<With extends readonly AnyComponentType[]> = {
  [I in keyof With]: With[I] extends ComponentType<infer C> ? C : never;
};

interface QueryTermsGeneric<
  With extends readonly AnyComponentType[],
  Not extends readonly AnyComponentType[] = [],
> {
  with: With;
  not?: Not;
  changedSince?: number;
}

export class Query<
  With extends readonly AnyComponentType[],
  Not extends readonly AnyComponentType[] = [],
> {
  private readonly world: World;
  private readonly withTypes: With;
  private readonly notTypes: Not extends readonly AnyComponentType[]
    ? Not
    : never;
  private readonly changedSinceTick?: number;

  constructor(world: World, terms: QueryTermsGeneric<With, Not>) {
    this.world = world;
    this.withTypes = terms.with;
    this.notTypes = (terms.not ?? []) as Not extends readonly AnyComponentType[]
      ? Not
      : never;
    this.changedSinceTick = terms.changedSince;
  }

  private getStores(): ComponentStore<unknown>[] {
    const stores: ComponentStore<unknown>[] = [];
    for (const type of this.withTypes) {
      const s = this.world.ensureStore(type) as ComponentStore<unknown>;
      stores.push(s);
    }
    return stores;
  }

  *[Symbol.iterator](): IterableIterator<
    [EntityId, ...TupleOfComponents<With>]
  > {
    const stores = this.getStores();
    stores.sort((a, b) => a.size() - b.size());
    const driver = stores[0];
    const notTypes = this.notTypes as readonly ComponentType<unknown>[];
    const changedSince = this.changedSinceTick;

    const denseEntities = driver.getDenseEntities();
    for (let i = 0; i < denseEntities.length; i++) {
      const entity = denseEntities[i];
      let excluded = false;
      for (const t of notTypes) {
        if (this.world.has(entity, t)) {
          excluded = true;
          break;
        }
      }
      if (excluded) continue;

      const tuple: unknown[] = [entity];
      let valid = true;
      for (const t of this.withTypes) {
        const value = this.world.get(entity, t);
        if (value === undefined) {
          valid = false;
          break;
        }
        tuple.push(value);
      }
      if (!valid) continue;

      if (changedSince !== undefined) {
        let changed = false;
        for (const store of stores) {
          const wt = (store as ComponentStore<unknown>).getLastWriteTick(
            entity,
          );
          if (wt !== undefined && wt > changedSince) {
            changed = true;
            break;
          }
        }
        if (!changed) continue;
      }

      yield tuple as [EntityId, ...TupleOfComponents<With>];
    }
  }
}

export function query<
  With extends readonly AnyComponentType[],
  Not extends readonly AnyComponentType[] = [],
>(world: World, terms: QueryTermsGeneric<With, Not>): Query<With, Not> {
  return new Query<With, Not>(world, terms);
}
