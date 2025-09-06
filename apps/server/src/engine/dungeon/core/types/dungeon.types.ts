export interface DungeonConfig {
	width: number;
	height: number;
	roomCount: number;
	roomSizeRange: [number, number];
	algorithm: string;
}

export interface DungeonSeed {
	primary: number;
	layout: number;
	rooms: number;
	connections: number;
	details: number;
	version: string;
	timestamp: number;
}
