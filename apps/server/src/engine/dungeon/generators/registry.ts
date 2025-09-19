import type { DungeonConfig, DungeonSeed } from "../core/types";
import { BSPGenerator } from "./algorithms/bsp-generator";
import { CellularGenerator } from "./algorithms/cellular";
import type { DungeonGenerator } from "./base/dungeon-generator";

export type GeneratorFactory = (
  config: DungeonConfig,
  seeds: DungeonSeed,
) => DungeonGenerator;

const DEFAULT_REGISTRY: Record<string, GeneratorFactory> = {
  cellular: (config, seeds) => new CellularGenerator(config, seeds),
  bsp: (config, seeds) => new BSPGenerator(config, seeds),
};

export function createGeneratorFromRegistry(
  config: DungeonConfig,
  seeds: DungeonSeed,
): DungeonGenerator {
  const key = String(config.algorithm).toLowerCase();
  const factory = DEFAULT_REGISTRY[key] ?? DEFAULT_REGISTRY.cellular;
  return factory(config, seeds);
}
