import type { Phase } from "./types";
import type { World } from "./world";

export interface System {
  readonly name: string;
  readonly phase: Phase;
  readonly before: readonly string[];
  readonly after: readonly string[];
  enabled: boolean;
  run(world: World): void;
}

interface SystemConfig {
  name: string;
  phase?: Phase;
  before: string[];
  after: string[];
  enabled: boolean;
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

    return {
      name: this.config.name,
      phase: this.config.phase,
      before: this.config.before,
      after: this.config.after,
      enabled: this.config.enabled,
      run: this.config.run,
    };
  }
}

export function defineSystem(name: string): SystemBuilder {
  return new SystemBuilder(name);
}
