import { describe, expect, test } from "bun:test";
import { ComponentMask } from "@rogue/ecs";

describe("ComponentMask Performance", () => {
  test("ComponentMask vs BigInt - set operations", () => {
    const iterations = 1000000;

    // ComponentMask benchmark
    const startMask = performance.now();
    for (let i = 0; i < iterations; i++) {
      const mask = new ComponentMask();
      mask.set(0);
      mask.set(5);
      mask.set(10);
      mask.set(15);
    }
    const timeMask = performance.now() - startMask;

    // BigInt benchmark
    const startBigInt = performance.now();
    for (let i = 0; i < iterations; i++) {
      let mask = 0n;
      mask |= 1n << 0n;
      mask |= 1n << 5n;
      mask |= 1n << 10n;
      mask |= 1n << 15n;
    }
    const timeBigInt = performance.now() - startBigInt;

    console.log(`  ComponentMask: ${timeMask.toFixed(2)}ms`);
    console.log(`  BigInt: ${timeBigInt.toFixed(2)}ms`);
    console.log(`  Speedup: ${(timeBigInt / timeMask).toFixed(2)}x`);

    // ComponentMask should be significantly faster
    expect(timeMask).toBeLessThan(timeBigInt);
  });

  test("ComponentMask vs BigInt - has operations", () => {
    const iterations = 1000000;

    // Setup ComponentMask
    const mask = new ComponentMask();
    mask.set(0).set(5).set(10).set(15);

    // Setup BigInt
    let bigMask = 0n;
    bigMask |= 1n << 0n;
    bigMask |= 1n << 5n;
    bigMask |= 1n << 10n;
    bigMask |= 1n << 15n;

    // ComponentMask benchmark
    const startMask = performance.now();
    let countMask = 0;
    for (let i = 0; i < iterations; i++) {
      if (mask.has(0)) countMask++;
      if (mask.has(5)) countMask++;
      if (mask.has(10)) countMask++;
      if (mask.has(15)) countMask++;
    }
    const timeMask = performance.now() - startMask;

    // BigInt benchmark
    const startBigInt = performance.now();
    let countBigInt = 0;
    for (let i = 0; i < iterations; i++) {
      if ((bigMask & (1n << 0n)) !== 0n) countBigInt++;
      if ((bigMask & (1n << 5n)) !== 0n) countBigInt++;
      if ((bigMask & (1n << 10n)) !== 0n) countBigInt++;
      if ((bigMask & (1n << 15n)) !== 0n) countBigInt++;
    }
    const timeBigInt = performance.now() - startBigInt;

    console.log(`  ComponentMask: ${timeMask.toFixed(2)}ms (count: ${countMask})`);
    console.log(`  BigInt: ${timeBigInt.toFixed(2)}ms (count: ${countBigInt})`);
    console.log(`  Speedup: ${(timeBigInt / timeMask).toFixed(2)}x`);

    // ComponentMask should be significantly faster
    expect(timeMask).toBeLessThan(timeBigInt);
  });

  test("ComponentMask vs BigInt - containsAll operations", () => {
    const iterations = 1000000;

    // Setup ComponentMask
    const mask1 = new ComponentMask();
    mask1.set(0).set(5).set(10).set(15).set(20);
    const mask2 = new ComponentMask();
    mask2.set(0).set(5).set(10);

    // Setup BigInt
    let bigMask1 = 0n;
    bigMask1 |= 1n << 0n;
    bigMask1 |= 1n << 5n;
    bigMask1 |= 1n << 10n;
    bigMask1 |= 1n << 15n;
    bigMask1 |= 1n << 20n;
    let bigMask2 = 0n;
    bigMask2 |= 1n << 0n;
    bigMask2 |= 1n << 5n;
    bigMask2 |= 1n << 10n;

    // ComponentMask benchmark
    const startMask = performance.now();
    let countMask = 0;
    for (let i = 0; i < iterations; i++) {
      if (mask1.containsAll(mask2)) countMask++;
    }
    const timeMask = performance.now() - startMask;

    // BigInt benchmark
    const startBigInt = performance.now();
    let countBigInt = 0;
    for (let i = 0; i < iterations; i++) {
      if ((bigMask1 & bigMask2) === bigMask2) countBigInt++;
    }
    const timeBigInt = performance.now() - startBigInt;

    console.log(`  ComponentMask: ${timeMask.toFixed(2)}ms (count: ${countMask})`);
    console.log(`  BigInt: ${timeBigInt.toFixed(2)}ms (count: ${countBigInt})`);
    console.log(`  Speedup: ${(timeBigInt / timeMask).toFixed(2)}x`);

    // ComponentMask should be significantly faster
    expect(timeMask).toBeLessThan(timeBigInt);
  });
});
