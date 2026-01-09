import { Phase } from "./types";
import type { System } from "./system";
import type { World } from "./world";

function topologicalSort(systems: System[]): System[] {
  const graph = new Map<string, Set<string>>();
  const inDegree = new Map<string, number>();

  for (const system of systems) {
    graph.set(system.name, new Set());
    inDegree.set(system.name, 0);
  }

  for (const system of systems) {
    const edges = graph.get(system.name);
    if (!edges) continue;

    for (const before of system.before) {
      const beforeDegree = inDegree.get(before);
      if (beforeDegree !== undefined) {
        edges.add(before);
        inDegree.set(before, beforeDegree + 1);
      }
    }

    for (const after of system.after) {
      const afterEdges = graph.get(after);
      const systemDegree = inDegree.get(system.name);
      if (afterEdges && systemDegree !== undefined) {
        afterEdges.add(system.name);
        inDegree.set(system.name, systemDegree + 1);
      }
    }
  }

  const queue: string[] = [];
  for (const [name, degree] of inDegree.entries()) {
    if (degree === 0) queue.push(name);
  }

  const sorted: string[] = [];
  let queueIndex = 0;

  while (queueIndex < queue.length) {
    const current = queue[queueIndex++];

    sorted.push(current);

    const neighbors = graph.get(current);
    if (!neighbors) continue;

    for (const neighbor of neighbors) {
      const degree = inDegree.get(neighbor);
      if (degree === undefined) continue;

      const newDegree = degree - 1;
      inDegree.set(neighbor, newDegree);
      if (newDegree === 0) {
        queue.push(neighbor);
      }
    }
  }

  if (sorted.length !== systems.length) {
    throw new Error("Circular dependency detected in systems");
  }

  const systemMap = new Map(systems.map((s) => [s.name, s]));
  const result: System[] = [];

  for (const name of sorted) {
    const system = systemMap.get(name);
    if (system) result.push(system);
  }

  return result;
}

export class SystemScheduler {
  private systemsByPhase = new Map<Phase, System[]>();
  private allSystems: System[] = [];
  private compiled = false;

  register(system: System): void {
    this.allSystems.push(system);

    let phaseSystems = this.systemsByPhase.get(system.phase);
    if (!phaseSystems) {
      phaseSystems = [];
      this.systemsByPhase.set(system.phase, phaseSystems);
    }
    phaseSystems.push(system);

    this.compiled = false;
  }

  registerBatch(systems: System[]): void {
    for (const system of systems) {
      this.register(system);
    }
  }

  compile(): void {
    for (const [phase, systems] of this.systemsByPhase.entries()) {
      const sorted = topologicalSort(systems);
      this.systemsByPhase.set(phase, sorted);
    }
    this.compiled = true;
  }

  runPhase(phase: Phase, world: World): void {
    if (!this.compiled) {
      this.compile();
    }

    const systems = this.systemsByPhase.get(phase);
    if (!systems) return;

    for (const system of systems) {
      if (!system.enabled) continue;
      system.run(world);
    }
  }

  runAll(world: World): void {
    const phases = [Phase.PreUpdate, Phase.Update, Phase.PostUpdate];

    for (const phase of phases) {
      this.runPhase(phase, world);
    }
  }

  getSystem(name: string): System | undefined {
    return this.allSystems.find((s) => s.name === name);
  }

  enableSystem(name: string): boolean {
    const system = this.getSystem(name);
    if (system) {
      system.enabled = true;
      return true;
    }
    return false;
  }

  disableSystem(name: string): boolean {
    const system = this.getSystem(name);
    if (system) {
      system.enabled = false;
      return true;
    }
    return false;
  }

  getAllSystems(): readonly System[] {
    return this.allSystems;
  }

  getSystemsInPhase(phase: Phase): readonly System[] {
    return this.systemsByPhase.get(phase) ?? [];
  }

  clear(): void {
    this.allSystems = [];
    this.systemsByPhase.clear();
    this.compiled = false;
  }
}
