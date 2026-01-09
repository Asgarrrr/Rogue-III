/**
 * System Definition
 *
 * Systems contain pure logic that operates on entities with specific components.
 * Uses a builder pattern for declarative system definition.
 */

import type { QueryDescriptor, SystemPhase } from "../types";
import type { World } from "./world";

/**
 * System interface defining the structure of a system.
 */
export interface System {
  readonly name: string;
  readonly phase: SystemPhase;
  readonly query?: QueryDescriptor;
  readonly before: readonly string[];
  readonly after: readonly string[];
  enabled: boolean;

  run(world: World): void;
}

/**
 * Builder pattern for creating systems.
 */
export class SystemBuilder {
  private system: {
    name: string;
    phase?: SystemPhase;
    query?: QueryDescriptor;
    before: string[];
    after: string[];
    enabled: boolean;
    run?: (world: World) => void;
  };

  constructor(name: string) {
    this.system = {
      name,
      before: [],
      after: [],
      enabled: true,
    };
  }

  /**
   * Sets the execution phase for the system.
   */
  inPhase(phase: SystemPhase): this {
    this.system.phase = phase;
    return this;
  }

  /**
   * Sets the query for entities this system operates on.
   */
  withQuery(descriptor: QueryDescriptor): this {
    this.system.query = descriptor;
    return this;
  }

  /**
   * Specifies systems that should run after this system.
   */
  runBefore(...systems: string[]): this {
    this.system.before.push(...systems);
    return this;
  }

  /**
   * Specifies systems that should run before this system.
   */
  runAfter(...systems: string[]): this {
    this.system.after.push(...systems);
    return this;
  }

  /**
   * Sets the execution function and returns the built system.
   */
  execute(fn: (world: World) => void): System {
    this.system.run = fn;
    return this.build();
  }

  /**
   * Builds and returns the system.
   */
  build(): System {
    if (!this.system.phase) {
      throw new Error(`System "${this.system.name}": phase is required`);
    }
    if (!this.system.run) {
      throw new Error(
        `System "${this.system.name}": execute function is required`,
      );
    }

    return {
      name: this.system.name,
      phase: this.system.phase,
      query: this.system.query,
      before: this.system.before,
      after: this.system.after,
      enabled: this.system.enabled,
      run: this.system.run,
    };
  }
}

/**
 * Factory function for creating systems.
 */
export function defineSystem(name: string): SystemBuilder {
  return new SystemBuilder(name);
}
