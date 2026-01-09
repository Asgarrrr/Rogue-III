/**
 * Game Resources
 *
 * Shared game state resources.
 */

export {
  type TurnPhase,
  type PendingAction,
  type TurnState,
  TurnStateManager,
} from "./turn-state";

export {
  TileType,
  TileFlags,
  GameMap,
} from "./game-map";

import type { World } from "../../core/world";
import { TurnStateManager } from "./turn-state";
import { GameMap } from "./game-map";
import { SeededRandom } from "../../../dungeon/core/random/seeded-random";

export function registerGameResources(
  world: World,
  mapWidth: number = 80,
  mapHeight: number = 50,
  gameSeed: number = Date.now(),
): { turnState: TurnStateManager; gameMap: GameMap; gameRng: SeededRandom } {
  const turnState = new TurnStateManager();
  const gameMap = new GameMap(mapWidth, mapHeight);
  const gameRng = new SeededRandom(gameSeed);

  world.resources.register("turnState", turnState);
  world.resources.register("gameMap", gameMap);
  world.resources.register("gameRng", gameRng);

  return { turnState, gameMap, gameRng };
}
