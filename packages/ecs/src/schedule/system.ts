import type { Phase } from "../core/types";
import type { World } from "../core/world";
import type { Condition, RunCondition } from "./run-condition";
import { condition } from "./run-condition";
import type { SystemSet } from "./system-set";

export interface System {
  readonly name: string;
  readonly phase: Phase;
  readonly before: readonly string[];
  readonly after: readonly string[];
  enabled: boolean;
  /** If true, system auto-disables after first successful run */
  readonly once: boolean;
  /** Run conditions that must all be true for the system to execute */
  readonly conditions: Condition[];
  /** System sets this system belongs to */
  readonly sets: ReadonlySet<SystemSet>;
  /** Execute the system. Returns true if it actually ran. */
  run(world: World): boolean;
}

interface SystemConfig {
  name: string;
  phase?: Phase;
  before: string[];
  after: string[];
  enabled: boolean;
  once: boolean;
  conditions: Condition[];
  sets: Set<SystemSet>;
  run?: (world: World) => void;
}

class SystemBuilder {
  private readonly config: SystemConfig;

  constructor(name: string) {
    this.config = {
      name,
      before: [],
      after: [],
      enabled: true,
      once: false,
      conditions: [],
      sets: new Set(),
    };
  }

  inPhase(phase: Phase): this {
    this.config.phase = phase;
    return this;
  }

  before(...systems: string[]): this {
    this.config.before.push(...systems);
    return this;
  }

  after(...systems: string[]): this {
    this.config.after.push(...systems);
    return this;
  }

  disabled(): this {
    this.config.enabled = false;
    return this;
  }

  /**
   * Mark this system as one-shot: it will auto-disable after first successful run.
   *
   * @example
   * defineSystem("InitGame")
   *   .once()
   *   .inPhase(Phase.PreUpdate)
   *   .execute((world) => {
   *     // This runs only once, then the system is disabled
   *   });
   */
  once(): this {
    this.config.once = true;
    return this;
  }

  /**
   * Add a run condition. The system only executes if ALL conditions return true.
   * Conditions are evaluated in order with short-circuit logic.
   *
   * @example
   * // Simple predicate
   * defineSystem("GameLoop")
   *   .runIf((world) => world.getResource(GameState) === "playing")
   *   .execute(...);
   *
   * @example
   * // Using built-in conditions
   * defineSystem("EnemyAI")
   *   .runIf(inState(GameState, "playing"))
   *   .runIf(anyWith(Enemy, Alive))
   *   .execute(...);
   *
   * @example
   * // Composed conditions
   * defineSystem("Combat")
   *   .runIf(inState(GameState, "playing").and(anyWith(Enemy)))
   *   .execute(...);
   */
  runIf(cond: Condition | RunCondition): this {
    // Wrap simple predicates in Condition for consistency
    const wrapped =
      typeof (cond as Condition).and === "function"
        ? (cond as Condition)
        : condition(cond);
    this.config.conditions.push(wrapped);
    return this;
  }

  /**
   * Add this system to a set.
   *
   * @example
   * defineSystem("PlayerMovement")
   *   .inSet(MovementSet)
   *   .execute(...);
   */
  inSet(set: SystemSet): this {
    this.config.sets.add(set);
    return this;
  }

  /**
   * Add this system to multiple sets.
   *
   * @example
   * defineSystem("Combat")
   *   .inSets(SimulationSet, CombatSet)
   *   .execute(...);
   */
  inSets(...sets: SystemSet[]): this {
    for (const set of sets) {
      this.config.sets.add(set);
    }
    return this;
  }

  execute(fn: (world: World) => void): System {
    this.config.run = fn;
    return this.build();
  }

  private build(): System {
    if (this.config.phase === undefined) {
      throw new Error(`System "${this.config.name}": phase is required`);
    }
    if (!this.config.run) {
      throw new Error(
        `System "${this.config.name}": execute function is required`,
      );
    }

    const runFn = this.config.run;
    const conditions = this.config.conditions;
    const isOnce = this.config.once;

    const system: System = {
      name: this.config.name,
      phase: this.config.phase,
      before: this.config.before,
      after: this.config.after,
      enabled: this.config.enabled,
      once: isOnce,
      conditions,
      sets: this.config.sets,
      run(world: World): boolean {
        // Check all conditions
        for (const cond of conditions) {
          if (!cond(world)) {
            return false;
          }
        }

        // Execute the system
        runFn(world);

        // Auto-disable if one-shot
        if (isOnce) {
          this.enabled = false;
        }

        return true;
      },
    };

    return system;
  }
}

export function defineSystem(name: string): SystemBuilder {
  return new SystemBuilder(name);
}
