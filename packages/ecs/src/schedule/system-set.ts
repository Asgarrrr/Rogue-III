import type { Condition } from "./run-condition";

/**
 * A system set is a label for grouping related systems.
 */
export type SystemSet = symbol | string;

/**
 * Configuration for a system set.
 */
export interface SetConfig {
  conditions: Condition[];
  beforeSets: Set<SystemSet>;
  afterSets: Set<SystemSet>;
}

/**
 * Builder for configuring a single system set.
 */
export class SetConfigBuilder {
  constructor(private config: SetConfig) {}

  runIf(cond: Condition): this {
    this.config.conditions.push(cond);
    return this;
  }

  before(otherSet: SystemSet): this {
    this.config.beforeSets.add(otherSet);
    return this;
  }

  after(otherSet: SystemSet): this {
    this.config.afterSets.add(otherSet);
    return this;
  }
}

/**
 * Builder for chaining multiple sets in order.
 */
export class SetChainBuilder {
  constructor(
    private sets: SystemSet[],
    private getConfig: (set: SystemSet) => SetConfig,
  ) {}

  chain(): void {
    for (let i = 0; i < this.sets.length - 1; i++) {
      const config = this.getConfig(this.sets[i]!);
      config.beforeSets.add(this.sets[i + 1]!);
    }
  }
}
