import { Room } from "../core/types";
import { Connection } from "./connection";
import { DungeonConfig, DungeonSeed } from "../core/types/dungeon.types";

export interface Dungeon {
	rooms: Room[];
	connections: Connection[];
	config: DungeonConfig;
	seeds: DungeonSeed;
	checksum: string;
	getChecksum(): string;
}

export class DungeonImpl implements Dungeon {
	rooms: Room[];
	connections: Connection[];
	config: DungeonConfig;
	seeds: DungeonSeed;
	checksum: string;

	constructor(options: {
		rooms: Room[];
		connections: Connection[];
		config: DungeonConfig;
		seeds: DungeonSeed;
		checksum: string;
	}) {
		this.rooms = options.rooms;
		this.connections = options.connections;
		this.config = options.config;
		this.seeds = options.seeds;
		this.checksum = options.checksum;
	}

	getChecksum(): string {
		return this.checksum;
	}
}
