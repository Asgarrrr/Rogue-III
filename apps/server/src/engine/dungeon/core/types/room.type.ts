export interface Room {
	id: number;
	x: number;
	y: number;
	width: number;
	height: number;
	type: string;
	seed: number;
	centerX: number;
	centerY: number;
	addFeature(type: string, position: { x: number; y: number }): void;
}
