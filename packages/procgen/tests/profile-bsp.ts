import { generate } from "../src/api";
import { createSeed } from "../src/seed";

const seed = createSeed(12345);

const config = {
  width: 200,
  height: 150,
  seed,
  algorithm: "bsp" as const,
};

// Warm up
for (let i = 0; i < 3; i++) {
  generate(config, { skipValidation: true });
}

// Profile
const times: number[] = [];
for (let i = 0; i < 20; i++) {
  const start = performance.now();
  generate(config, { skipValidation: true });
  times.push(performance.now() - start);
}

console.log("Times:", times.map((t) => t.toFixed(2)).join(", "));
console.log("Min:", Math.min(...times).toFixed(2), "ms");
console.log(
  "Avg:",
  (times.reduce((a, b) => a + b) / times.length).toFixed(2),
  "ms",
);
