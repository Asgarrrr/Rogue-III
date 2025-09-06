import { Room } from "../core/types";

export class RoomImpl implements Room {
	id: number;
	x: number;
	y: number;
	width: number;
	height: number;
	type: string;
	seed: number;
	features: Array<{ type: string; position: { x: number; y: number } }> = [];

	constructor(options: {
		id: number;
		x: number;
		y: number;
		width: number;
		height: number;
		type: string;
		seed: number;
	}) {
		this.id = options.id;
		this.x = options.x;
		this.y = options.y;
		this.width = options.width;
		this.height = options.height;
		this.type = options.type;
		this.seed = options.seed;
	}

	get centerX(): number {
		return this.x + Math.floor(this.width / 2);
	}

	get centerY(): number {
		return this.y + Math.floor(this.height / 2);
	}

	addFeature(type: string, position: { x: number; y: number }): void {
		this.features.push({ type, position });
	}
}
