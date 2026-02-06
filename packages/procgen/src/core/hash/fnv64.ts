/**
 * FNV-1a 64-bit hash implementation
 *
 * Provides a 64-bit hash with much lower collision probability than DJB2 32-bit.
 * Birthday paradox collision threshold: ~10 billion hashes instead of ~10 thousand.
 */

// FNV-1a 64-bit parameters
const FNV64_OFFSET_BASIS = 14695981039346656037n;
const FNV64_PRIME = 1099511628211n;
const MASK_64 = (1n << 64n) - 1n;

/**
 * FNV-1a 64-bit hasher for incremental hashing
 */
export class FNV64Hasher {
  private hash: bigint;

  constructor() {
    this.hash = FNV64_OFFSET_BASIS;
  }

  /**
   * Add a single byte to the hash
   */
  updateByte(byte: number): this {
    this.hash ^= BigInt(byte & 0xff);
    this.hash = (this.hash * FNV64_PRIME) & MASK_64;
    return this;
  }

  /**
   * Add a Uint8Array to the hash
   */
  updateBytes(data: Uint8Array): this {
    for (let i = 0; i < data.length; i++) {
      const byte = data[i] ?? 0;
      this.hash ^= BigInt(byte);
      this.hash = (this.hash * FNV64_PRIME) & MASK_64;
    }
    return this;
  }

  /**
   * Add a 32-bit integer to the hash (little-endian)
   */
  updateInt32(value: number): this {
    const v = value >>> 0; // Ensure unsigned
    this.updateByte(v & 0xff);
    this.updateByte((v >> 8) & 0xff);
    this.updateByte((v >> 16) & 0xff);
    this.updateByte((v >> 24) & 0xff);
    return this;
  }

  /**
   * Add a string to the hash (UTF-8 encoded)
   */
  updateString(str: string): this {
    for (let i = 0; i < str.length; i++) {
      const code = str.charCodeAt(i);
      // Simple ASCII handling - for multi-byte, would need TextEncoder
      if (code < 128) {
        this.updateByte(code);
      } else {
        // Handle multi-byte characters
        if (code < 0x800) {
          this.updateByte(0xc0 | (code >> 6));
          this.updateByte(0x80 | (code & 0x3f));
        } else if (code < 0x10000) {
          this.updateByte(0xe0 | (code >> 12));
          this.updateByte(0x80 | ((code >> 6) & 0x3f));
          this.updateByte(0x80 | (code & 0x3f));
        } else {
          this.updateByte(0xf0 | (code >> 18));
          this.updateByte(0x80 | ((code >> 12) & 0x3f));
          this.updateByte(0x80 | ((code >> 6) & 0x3f));
          this.updateByte(0x80 | (code & 0x3f));
        }
      }
    }
    return this;
  }

  /**
   * Get the final hash as a 16-character hex string
   */
  digest(): string {
    return this.hash.toString(16).padStart(16, "0");
  }

  /**
   * Get the raw bigint hash value
   */
  digestBigInt(): bigint {
    return this.hash;
  }

  /**
   * Reset the hasher for reuse
   */
  reset(): this {
    this.hash = FNV64_OFFSET_BASIS;
    return this;
  }
}

/**
 * Create a new FNV64 hasher instance
 */
export function createFNV64Hasher(): FNV64Hasher {
  return new FNV64Hasher();
}

/**
 * Quick hash of a Uint8Array
 */
export function fnv64Hash(data: Uint8Array): string {
  return new FNV64Hasher().updateBytes(data).digest();
}

/**
 * Quick hash of a string
 */
export function fnv64HashString(str: string): string {
  return new FNV64Hasher().updateString(str).digest();
}
