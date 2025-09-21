export class GridResource {
	readonly width: number;
	readonly height: number;
	private readonly walls: Uint8Array; // 1 = wall, 0 = floor

	constructor(grid: boolean[][]) {
		this.height = grid.length;
		this.width = this.height > 0 ? grid[0]!.length : 0;
		this.walls = new Uint8Array(this.width * this.height);
		for (let y = 0; y < this.height; y++) {
			const row = grid[y]!;
			for (let x = 0; x < this.width; x++) {
				// Dungeon boolean grid: true = wall, false = floor
				this.walls[y * this.width + x] = row[x] ? 1 : 0;
			}
		}
	}

	isBlocked(x: number, y: number): boolean {
		if (x < 0 || y < 0 || x >= this.width || y >= this.height) return true;
		return this.walls[y * this.width + x] === 1;
	}

	isWalkable(x: number, y: number): boolean {
		return !this.isBlocked(x, y);
	}
}
