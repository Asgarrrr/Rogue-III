import type { AnyComponentType, EmptyResources, SystemPhase } from "./types";

export interface SystemContext<
  Res extends Record<string, unknown> = EmptyResources,
> {
  worldTick: number;
  resources: Res;
}

export interface System<
  _With extends readonly AnyComponentType[] = readonly AnyComponentType[],
  _Not extends readonly AnyComponentType[] = [],
  Res extends Record<string, unknown> = EmptyResources,
> {
  name: string;
  phase: SystemPhase;
  after?: readonly string[];
  before?: readonly string[];
  run(world: unknown, ctx: SystemContext<Res>): void;
}

export function defineSystem<
  With extends readonly AnyComponentType[],
  Not extends readonly AnyComponentType[] = [],
  Res extends Record<string, unknown> = EmptyResources,
>(s: System<With, Not, Res>): System<With, Not, Res> {
  return s;
}

export function after<const N extends readonly string[]>(
  ...names: N
): { readonly after: N } {
  return { after: names } as const;
}

export function before<const N extends readonly string[]>(
  ...names: N
): { readonly before: N } {
  return { before: names } as const;
}

function topoSortStable(systems: System[]): System[] {
  // Kahn's algorithm with stable order by name within same in-degree
  const nameOrder = new Map<string, number>();
  for (let i = 0; i < systems.length; i++) nameOrder.set(systems[i].name, i);

  const afterMap = new Map<string, Set<string>>();
  const indegree = new Map<string, number>();
  for (const s of systems) {
    indegree.set(s.name, 0);
  }
  for (const s of systems) {
    const deps = new Set<string>(s.after ?? []);
    for (const before of s.before ?? []) {
      // if A.before B => B.after A
      deps.add(before);
    }
    afterMap.set(s.name, deps);
    for (const _d of deps)
      indegree.set(s.name, (indegree.get(s.name) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [name, deg] of indegree) if (deg === 0) queue.push(name);
  queue.sort((a, b) => (nameOrder.get(a) ?? 0) - (nameOrder.get(b) ?? 0));

  const out: string[] = [];
  while (queue.length) {
    const n = queue.shift();
    if (!n) break;
    out.push(n);
    for (const [k, deps] of afterMap) {
      if (!deps.has(n)) continue;
      const d = (indegree.get(k) ?? 0) - 1;
      indegree.set(k, d);
      if (d === 0) {
        queue.push(k);
        queue.sort((a, b) => (nameOrder.get(a) ?? 0) - (nameOrder.get(b) ?? 0));
      }
    }
  }

  if (out.length !== systems.length)
    return systems.slice().sort((a, b) => a.name.localeCompare(b.name));
  const byName = new Map(systems.map((s) => [s.name, s] as const));
  return out
    .map((n) => byName.get(n))
    .filter((s): s is System => s !== undefined);
}

export class Scheduler {
  private readonly phases: Map<SystemPhase, System[]> = new Map([
    ["init", []],
    ["preUpdate", []],
    ["update", []],
    ["postUpdate", []],
    ["lateUpdate", []],
  ]);

  add(system: System): void {
    const list = this.phases.get(system.phase);
    if (!list) throw new Error(`Unknown phase ${system.phase}`);
    list.push(system);
  }

  clear(): void {
    for (const [, list] of this.phases) list.length = 0;
  }

  runPhase<Res extends Record<string, unknown> = EmptyResources>(
    phase: SystemPhase,
    ctx: SystemContext<Res>,
    world: unknown,
  ): void {
    const systems = this.phases.get(phase);
    if (!systems) return;
    const ordered = topoSortStable(systems);
    for (const s of ordered) s.run(world, ctx);
  }
}
