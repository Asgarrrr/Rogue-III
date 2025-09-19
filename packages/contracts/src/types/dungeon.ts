export type BaseDungeonConfig = {
  width: number;
  height: number;
  roomSizeRange: [number, number];
};

export type DungeonConfig =
  | (BaseDungeonConfig & { algorithm: "cellular"; roomCount: number })
  | (BaseDungeonConfig & { algorithm: "bsp"; roomCount: number });

export interface DungeonSeed {
  primary: number;
  layout: number;
  rooms: number;
  connections: number;
  details: number;
  version: string;
  timestamp: number;
}
