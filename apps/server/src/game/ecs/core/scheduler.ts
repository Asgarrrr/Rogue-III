/**
 * System Scheduler
 *
 * Executes systems in the correct order based on phases and dependencies.
 * Uses topological sort for dependency resolution.
 */

import { SystemPhase } from "../types";
import type { System } from "./system";
import type { World } from "./world";

/**
 * Helper to get or create a value in a Map.
 */
function getOrCreate<K, V>(map: Map<K, V>, key: K, factory: () => V): V {
  const existing = map.get(key);
  if (existing !== undefined) return existing;

  const value = factory();
  map.set(key, value);
  return value;
}

/**
 * Topological sort using Kahn's algorithm.
 */
class TopologicalSorter {
  static sort(systems: System[]): System[] {
    const graph = new Map<string, Set<string>>();
    const inDegree = new Map<string, number>();

    // Build graph - initialize all nodes
    for (const system of systems) {
      graph.set(system.name, new Set());
      inDegree.set(system.name, 0);
    }

    // Add edges
    for (const system of systems) {
      const systemEdges = graph.get(system.name);
      if (!systemEdges) continue;

      // "A before B" means A -> B edge
      for (const before of system.before) {
        const beforeDegree = inDegree.get(before);
        if (beforeDegree !== undefined) {
          systemEdges.add(before);
          inDegree.set(before, beforeDegree + 1);
        }
      }

      // "A after B" means B -> A edge
      for (const after of system.after) {
        const afterEdges = graph.get(after);
        const systemDegree = inDegree.get(system.name);
        if (afterEdges && systemDegree !== undefined) {
          afterEdges.add(system.name);
          inDegree.set(system.name, systemDegree + 1);
        }
      }
    }

    // Kahn's algorithm
    const queue: string[] = [];
    for (const [name, degree] of inDegree.entries()) {
      if (degree === 0) queue.push(name);
    }

    const sorted: string[] = [];
    while (queue.length > 0) {
      const current = queue.shift();
      if (current === undefined) break;

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
}

/**
 * System Scheduler for managing system execution.
 */
export class SystemScheduler {
  private systemsByPhase = new Map<SystemPhase, System[]>();
  private allSystems: System[] = [];
  private compiled = false;

  /**
   * Registers a system.
   */
  register(system: System): void {
    this.allSystems.push(system);

    const phaseSystems = getOrCreate(
      this.systemsByPhase,
      system.phase,
      () => [],
    );
    phaseSystems.push(system);

    this.compiled = false;
  }

  /**
   * Registers multiple systems at once.
   */
  registerBatch(systems: System[]): void {
    for (const system of systems) {
      this.register(system);
    }
  }

  /**
   * Compiles the scheduler by sorting systems in each phase.
   */
  compile(): void {
    for (const [phase, systems] of this.systemsByPhase.entries()) {
      const sorted = TopologicalSorter.sort(systems);
      this.systemsByPhase.set(phase, sorted);
    }
    this.compiled = true;
  }

  /**
   * Runs all systems in a specific phase.
   */
  runPhase(phase: SystemPhase, world: World): void {
    if (!this.compiled) {
      this.compile();
    }

    const systems = this.systemsByPhase.get(phase);
    if (!systems) return;

    for (const system of systems) {
      if (!system.enabled) continue;

      try {
        system.run(world);
      } catch (error) {
        console.error(`[ECS] Error in system "${system.name}":`, error);
        throw error;
      }
    }
  }

  /**
   * Runs all phases in order (excluding Init).
   */
  runAll(world: World): void {
    const phases = [
      SystemPhase.PreUpdate,
      SystemPhase.Update,
      SystemPhase.PostUpdate,
      SystemPhase.LateUpdate,
    ];

    for (const phase of phases) {
      this.runPhase(phase, world);
    }
  }

  /**
   * Runs the Init phase (call once at startup).
   */
  runInit(world: World): void {
    this.runPhase(SystemPhase.Init, world);
  }

  /**
   * Gets a system by name.
   */
  getSystem(name: string): System | undefined {
    return this.allSystems.find((s) => s.name === name);
  }

  /**
   * Replaces a system with a new implementation.
   * Preserves the system's position in the execution order.
   *
   * @returns true if replacement succeeded
   */
  replaceSystem(name: string, newSystem: System): boolean {
    const index = this.allSystems.findIndex((s) => s.name === name);
    if (index === -1) return false;

    const oldSystem = this.allSystems[index];

    // Replace in allSystems
    this.allSystems[index] = newSystem;

    // Replace in phase array
    const phaseSystems = this.systemsByPhase.get(oldSystem.phase);
    if (phaseSystems) {
      const phaseIndex = phaseSystems.findIndex((s) => s.name === name);
      if (phaseIndex !== -1) {
        phaseSystems[phaseIndex] = newSystem;
      }
    }

    // Handle phase change
    if (newSystem.phase !== oldSystem.phase) {
      // Remove from old phase
      const oldPhaseSystems = this.systemsByPhase.get(oldSystem.phase);
      if (oldPhaseSystems) {
        const oldIdx = oldPhaseSystems.findIndex((s) => s.name === name);
        if (oldIdx !== -1) {
          oldPhaseSystems.splice(oldIdx, 1);
        }
      }

      // Add to new phase
      const newPhaseSystems = getOrCreate(
        this.systemsByPhase,
        newSystem.phase,
        () => [],
      );
      newPhaseSystems.push(newSystem);

      // Recompilation needed
      this.compiled = false;
    }

    return true;
  }

  /**
   * Enables a system.
   */
  enableSystem(name: string): void {
    const system = this.getSystem(name);
    if (system) system.enabled = true;
  }

  /**
   * Disables a system.
   */
  disableSystem(name: string): void {
    const system = this.getSystem(name);
    if (system) system.enabled = false;
  }

  /**
   * Returns all registered systems.
   */
  getAllSystems(): readonly System[] {
    return this.allSystems;
  }

  /**
   * Returns systems in a specific phase.
   */
  getSystemsInPhase(phase: SystemPhase): readonly System[] {
    return this.systemsByPhase.get(phase) ?? [];
  }

  /**
   * Clears all registered systems.
   */
  clear(): void {
    this.allSystems = [];
    this.systemsByPhase.clear();
    this.compiled = false;
  }
}
