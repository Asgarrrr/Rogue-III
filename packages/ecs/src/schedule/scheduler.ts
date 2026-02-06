import { Phase } from "../core/types";
import type { World } from "../core/world";
import type { System } from "./system";
import type { Condition } from "./run-condition";
import type {
  SystemSet,
  SetConfig,
  SetConfigBuilder,
  SetChainBuilder,
} from "./system-set";
import { SetConfigBuilder as SetConfigBuilderImpl } from "./system-set";
import { SetChainBuilder as SetChainBuilderImpl } from "./system-set";

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
    const current = queue[queueIndex++]!;

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

/** Manages system registration, ordering, and execution across phases. */
export class SystemScheduler {
  private systemsByPhase = new Map<Phase, System[]>();
  private allSystems: System[] = [];
  private setConfigs = new Map<SystemSet, SetConfig>();
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

  /**
   * Configure a system set.
   *
   * @example
   * scheduler.configureSet(PhysicsSet)
   *   .runIf(inState(GameState, "playing"))
   *   .before(RenderSet);
   */
  configureSet(set: SystemSet): SetConfigBuilder {
    let config = this.setConfigs.get(set);
    if (!config) {
      config = {
        conditions: [],
        beforeSets: new Set(),
        afterSets: new Set(),
      };
      this.setConfigs.set(set, config);
    }
    this.compiled = false;
    return new SetConfigBuilderImpl(config);
  }

  /**
   * Configure multiple sets to run in sequence.
   *
   * @example
   * scheduler.configureSets(InputSet, PhysicsSet, RenderSet).chain();
   */
  configureSets(...sets: SystemSet[]): SetChainBuilder {
    this.compiled = false;
    return new SetChainBuilderImpl(sets, (set) => {
      let config = this.setConfigs.get(set);
      if (!config) {
        config = {
          conditions: [],
          beforeSets: new Set(),
          afterSets: new Set(),
        };
        this.setConfigs.set(set, config);
      }
      return config;
    });
  }

  compile(): void {
    // Validate all system dependencies exist
    this.validateDependencies();

    // Expand set membership: inherit conditions and ordering from sets
    const expandedSystems = this.allSystems.map((system) =>
      this.expandSystemSets(system),
    );

    // Rebuild systemsByPhase with expanded systems
    this.systemsByPhase.clear();
    for (const system of expandedSystems) {
      let phaseSystems = this.systemsByPhase.get(system.phase);
      if (!phaseSystems) {
        phaseSystems = [];
        this.systemsByPhase.set(system.phase, phaseSystems);
      }
      phaseSystems.push(system);
    }

    // Sort systems in each phase
    for (const [phase, systems] of this.systemsByPhase.entries()) {
      const sorted = topologicalSort(systems);
      this.systemsByPhase.set(phase, sorted);
    }
    this.compiled = true;
  }

  /**
   * Validate that all system dependencies (before/after) reference existing systems.
   * Throws an error if any unknown dependency is found.
   */
  private validateDependencies(): void {
    const systemNames = new Set(this.allSystems.map((s) => s.name));
    const errors: string[] = [];

    for (const system of this.allSystems) {
      for (const before of system.before) {
        if (!systemNames.has(before)) {
          errors.push(
            `System "${system.name}" has .before("${before}") but no system named "${before}" exists`,
          );
        }
      }

      for (const after of system.after) {
        if (!systemNames.has(after)) {
          errors.push(
            `System "${system.name}" has .after("${after}") but no system named "${after}" exists`,
          );
        }
      }
    }

    if (errors.length > 0) {
      throw new Error(
        `Invalid system dependencies:\n  - ${errors.join("\n  - ")}`,
      );
    }
  }

  /**
   * Expand a system's set membership by inheriting conditions and ordering.
   */
  private expandSystemSets(system: System): System {
    if (system.sets.size === 0) {
      return system;
    }

    // Collect conditions and ordering from all sets
    const inheritedConditions: Condition[] = [];
    const inheritedBefore = new Set<string>();
    const inheritedAfter = new Set<string>();

    for (const set of system.sets) {
      const setConfig = this.setConfigs.get(set);
      if (!setConfig) continue;

      // Inherit conditions
      inheritedConditions.push(...setConfig.conditions);

      // Inherit ordering: if set A is before set B, then systems in A are before B
      for (const beforeSet of setConfig.beforeSets) {
        // Find all systems in beforeSet and add them to this system's before list
        for (const otherSystem of this.allSystems) {
          if (otherSystem !== system && otherSystem.sets.has(beforeSet)) {
            inheritedBefore.add(otherSystem.name);
          }
        }
      }

      for (const afterSet of setConfig.afterSets) {
        // Find all systems in afterSet and add them to this system's after list
        for (const otherSystem of this.allSystems) {
          if (otherSystem !== system && otherSystem.sets.has(afterSet)) {
            inheritedAfter.add(otherSystem.name);
          }
        }
      }
    }

    // If no inherited conditions or ordering, return original system
    if (inheritedConditions.length === 0 && inheritedBefore.size === 0 && inheritedAfter.size === 0) {
      return system;
    }

    // Combine all conditions (inherited first, then system's own)
    const allConditions = [...inheritedConditions, ...system.conditions];
    const originalRun = system.run.bind(system);

    // Create expanded system with inherited properties and new run method
    const expandedSystem: System = {
      ...system,
      conditions: allConditions,
      before: [...system.before, ...inheritedBefore],
      after: [...system.after, ...inheritedAfter],
      run(world: World): boolean {
        // Check inherited conditions from sets first
        for (const cond of inheritedConditions) {
          if (!cond(world)) {
            return false;
          }
        }

        // Now run the original system (which will check its own conditions)
        return originalRun(world);
      },
    };

    return expandedSystem;
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
