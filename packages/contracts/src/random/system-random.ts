import { SeededRandom } from "./seeded-random";

interface CryptoLike {
  getRandomValues?: (array: Uint32Array) => Uint32Array;
}

let fallbackCounter = 0;

function fallbackUint32(): number {
  fallbackCounter = (fallbackCounter + 0x9e3779b9) >>> 0;
  const mixedSeed = (Date.now() ^ fallbackCounter) >>> 0;
  const rng = new SeededRandom(mixedSeed);
  return Math.floor(rng.next() * 0x100000000) >>> 0;
}

/**
 * Return an unsigned 32-bit random integer.
 *
 * Uses Web Crypto when available and falls back to a time-mixed PRNG path.
 */
export function randomUint32(): number {
  const cryptoLike: CryptoLike | undefined =
    typeof globalThis === "object" ? (globalThis.crypto as CryptoLike | undefined) : undefined;

  if (cryptoLike?.getRandomValues) {
    const buffer = new Uint32Array(1);
    cryptoLike.getRandomValues(buffer);
    const value = buffer[0];
    if (value !== undefined) return value >>> 0;
  }

  return fallbackUint32();
}

