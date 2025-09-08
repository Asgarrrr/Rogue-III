import { CellularGenerator } from "./cellular-generator";
import { DungeonConfig, DungeonSeed } from "../../../core/types";

/**
 * Performance test script for the new cellular generator
 */
export async function testCellularGeneratorPerformance() {
	console.log("🧪 Testing Cellular Generator Performance\n");

	const config: DungeonConfig = {
		width: 80,
		height: 60,
		roomCount: 8,
		roomSizeRange: [6, 15],
		algorithm: "cellular",
	};

	const seeds: DungeonSeed = {
		primary: 12345,
		layout: 12345,
		rooms: 54321,
		connections: 98765,
		details: 11111,
		version: "1.0.0",
		timestamp: Date.now(),
	};

	// Test 1: Performance benchmarking
	console.log("📊 Performance Benchmark:");
	const iterations = 10;
	const times: number[] = [];

	for (let i = 0; i < iterations; i++) {
		const generator = new CellularGenerator(config, seeds);
		const startTime = performance.now();
		const dungeon = generator.generate();
		const endTime = performance.now();
		const duration = endTime - startTime;
		times.push(duration);

		console.log(
			`  Run ${i + 1}: ${duration.toFixed(2)}ms - ${dungeon.rooms.length} rooms, ${dungeon.connections.length} connections`
		);
	}

	const avgTime = times.reduce((sum, time) => sum + time, 0) / times.length;
	const minTime = Math.min(...times);
	const maxTime = Math.max(...times);

	console.log(`\n📈 Performance Summary:`);
	console.log(`  Average: ${avgTime.toFixed(2)}ms`);
	console.log(`  Min: ${minTime.toFixed(2)}ms`);
	console.log(`  Max: ${maxTime.toFixed(2)}ms`);
	console.log(
		`  Std Dev: ${Math.sqrt(times.reduce((sum, time) => sum + Math.pow(time - avgTime, 2), 0) / times.length).toFixed(2)}ms`
	);

	// Test 2: Determinism validation
	console.log(`\n🔒 Determinism Test:`);
	const generator1 = new CellularGenerator(config, seeds);
	const generator2 = new CellularGenerator(config, seeds);

	const dungeon1 = generator1.generate();
	const dungeon2 = generator2.generate();

	const isDeterministic = dungeon1.getChecksum() === dungeon2.getChecksum();
	console.log(
		`  Same seeds produce identical results: ${isDeterministic ? "✅ PASS" : "❌ FAIL"}`
	);
	console.log(`  Checksum 1: ${dungeon1.getChecksum()}`);
	console.log(`  Checksum 2: ${dungeon2.getChecksum()}`);

	if (isDeterministic) {
		console.log(
			`  Rooms match: ${dungeon1.rooms.length === dungeon2.rooms.length ? "✅" : "❌"}`
		);
		console.log(
			`  Connections match: ${dungeon1.connections.length === dungeon2.connections.length ? "✅" : "❌"}`
		);
	}

	// Test 3: Async generation with progress
	console.log(`\n⏳ Async Generation Test:`);
	const asyncGenerator = new CellularGenerator(config, seeds);
	let progressUpdates = 0;

	const asyncStartTime = performance.now();
	const asyncDungeon = await asyncGenerator.generateAsync((progress) => {
		progressUpdates++;
		if (progressUpdates <= 5) {
			console.log(`  Progress: ${progress.toFixed(1)}%`);
		}
	});
	const asyncEndTime = performance.now();

	console.log(
		`  Async generation completed in ${(asyncEndTime - asyncStartTime).toFixed(2)}ms`
	);
	console.log(`  Progress updates received: ${progressUpdates}`);
	console.log(
		`  Async result matches sync: ${asyncDungeon.getChecksum() === dungeon1.getChecksum() ? "✅" : "❌"}`
	);

	// Test 4: Generation statistics
	console.log(`\n📊 Generation Statistics:`);
	const stats = generator1.getGenerationStats();
	console.log(
		`  Grid size: ${stats.gridSize.width}x${stats.gridSize.height} (${stats.gridSize.totalCells} cells)`
	);
	console.log(`  Caverns found: ${stats.caverns.total}`);
	console.log(`  Total floor area: ${stats.caverns.totalFloorArea} cells`);
	console.log(`  Average cavern size: ${stats.caverns.averageSize} cells`);
	console.log(`  Largest cavern: ${stats.caverns.largest} cells`);
	console.log(
		`  Configuration: ${stats.configuration.variant} variant, ${stats.configuration.iterations} iterations`
	);

	return {
		avgTime,
		minTime,
		maxTime,
		isDeterministic,
		progressUpdates,
		stats,
	};
}

// Run tests if this file is executed directly
if (require.main === module) {
	testCellularGeneratorPerformance()
		.then((results) => {
			console.log(`\n🎉 All tests completed!`);
			console.log(`Performance: ${results.avgTime.toFixed(2)}ms average`);
			console.log(`Determinism: ${results.isDeterministic ? "PASS" : "FAIL"}`);
		})
		.catch((error) => {
			console.error(`❌ Test failed:`, error);
			process.exit(1);
		});
}
