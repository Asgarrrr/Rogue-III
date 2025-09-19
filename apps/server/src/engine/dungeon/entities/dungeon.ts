import type { Room } from "../core/types";
import type { DungeonConfig, DungeonSeed } from "../core/types/dungeon.types";
import type { Connection } from "./connection";

export interface Dungeon {
  rooms: Room[];
  connections: Connection[];
  config: DungeonConfig;
  seeds: DungeonSeed;
  checksum: string;
  // Optional boolean grid: true = wall, false = floor
  grid?: boolean[][];
  getChecksum(): string;
}

export class DungeonImpl implements Dungeon {
  rooms: Room[];
  connections: Connection[];
  config: DungeonConfig;
  seeds: DungeonSeed;
  checksum: string;
  grid?: boolean[][];

  constructor(options: {
    rooms: Room[];
    connections: Connection[];
    config: DungeonConfig;
    seeds: DungeonSeed;
    checksum: string;
    grid?: boolean[][];
  }) {
    this.rooms = options.rooms;
    this.connections = options.connections;
    this.config = options.config;
    this.seeds = options.seeds;
    this.checksum = options.checksum;
    this.grid = options.grid;
  }

  getChecksum(): string {
    return this.checksum;
  }
}
