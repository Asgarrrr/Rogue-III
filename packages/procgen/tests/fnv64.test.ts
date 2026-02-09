import { describe, expect, it } from "bun:test";
import {
  createFNV64Hasher,
  FNV64Hasher,
  fnv64Hash,
  fnv64HashString,
} from "../src/core/hash/fnv64";

describe("FNV64Hasher", () => {
  describe("createFNV64Hasher", () => {
    it("should create a new hasher instance", () => {
      const hasher = createFNV64Hasher();
      expect(hasher).toBeInstanceOf(FNV64Hasher);
    });

    it("should create independent hasher instances", () => {
      const hasher1 = createFNV64Hasher();
      const hasher2 = createFNV64Hasher();

      hasher1.updateString("test");
      const hash1 = hasher1.digest();
      const hash2 = hasher2.digest();

      expect(hash1).not.toBe(hash2);
    });
  });

  describe("updateByte", () => {
    it("should update hash with a single byte", () => {
      const hasher = createFNV64Hasher();
      const initialHash = hasher.digest();

      hasher.updateByte(65); // 'A'
      const updatedHash = hasher.digest();

      expect(updatedHash).not.toBe(initialHash);
    });

    it("should handle multiple byte updates", () => {
      const hasher = createFNV64Hasher();
      hasher.updateByte(72).updateByte(105); // 'Hi'

      const hash = hasher.digest();
      expect(hash).toBeTruthy();
      expect(hash).toHaveLength(16);
    });

    it("should mask bytes to 0-255 range", () => {
      const hasher1 = createFNV64Hasher();
      const hasher2 = createFNV64Hasher();

      hasher1.updateByte(256); // Should wrap to 0
      hasher2.updateByte(0);

      expect(hasher1.digest()).toBe(hasher2.digest());
    });

    it("should return this for method chaining", () => {
      const hasher = createFNV64Hasher();
      const result = hasher.updateByte(42);
      expect(result).toBe(hasher);
    });
  });

  describe("updateString", () => {
    it("should update hash with a string", () => {
      const hasher = createFNV64Hasher();
      const initialHash = hasher.digest();

      hasher.updateString("hello");
      const updatedHash = hasher.digest();

      expect(updatedHash).not.toBe(initialHash);
    });

    it("should handle empty string", () => {
      const hasher = createFNV64Hasher();
      const initialHash = hasher.digest();

      hasher.updateString("");
      const emptyHash = hasher.digest();

      expect(emptyHash).toBe(initialHash);
    });

    it("should handle ASCII characters", () => {
      const hasher = createFNV64Hasher();
      hasher.updateString("Hello, World!");

      const hash = hasher.digest();
      expect(hash).toBeTruthy();
      expect(hash).toHaveLength(16);
    });

    it("should return this for method chaining", () => {
      const hasher = createFNV64Hasher();
      const result = hasher.updateString("test");
      expect(result).toBe(hasher);
    });
  });

  describe("digest", () => {
    it("should return a 16-character hex string", () => {
      const hasher = createFNV64Hasher();
      hasher.updateString("test");

      const hash = hasher.digest();
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });

    it("should pad with leading zeros if needed", () => {
      const hasher = createFNV64Hasher();
      const hash = hasher.digest();

      expect(hash).toHaveLength(16);
      expect(hash).toMatch(/^[0-9a-f]{16}$/);
    });

    it("should not modify internal state", () => {
      const hasher = createFNV64Hasher();
      hasher.updateString("test");

      const hash1 = hasher.digest();
      const hash2 = hasher.digest();

      expect(hash1).toBe(hash2);
    });
  });

  describe("digestBigInt", () => {
    it("should return a bigint value", () => {
      const hasher = createFNV64Hasher();
      hasher.updateString("test");

      const hash = hasher.digestBigInt();
      expect(typeof hash).toBe("bigint");
    });

    it("should match digest hex representation", () => {
      const hasher = createFNV64Hasher();
      hasher.updateString("test");

      const hexHash = hasher.digest();
      const bigintHash = hasher.digestBigInt();

      expect(bigintHash.toString(16).padStart(16, "0")).toBe(hexHash);
    });
  });

  describe("reset", () => {
    it("should reset hash to initial state", () => {
      const hasher = createFNV64Hasher();
      const initialHash = hasher.digest();

      hasher.updateString("test");
      hasher.reset();
      const resetHash = hasher.digest();

      expect(resetHash).toBe(initialHash);
    });

    it("should return this for method chaining", () => {
      const hasher = createFNV64Hasher();
      const result = hasher.reset();
      expect(result).toBe(hasher);
    });

    it("should allow reusing hasher after reset", () => {
      const hasher = createFNV64Hasher();

      hasher.updateString("first");
      const firstHash = hasher.digest();

      hasher.reset().updateString("second");
      const secondHash = hasher.digest();

      expect(firstHash).not.toBe(secondHash);
    });
  });

  describe("updateBytes", () => {
    it("should update hash with Uint8Array", () => {
      const hasher = createFNV64Hasher();
      const data = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"

      hasher.updateBytes(data);
      const hash = hasher.digest();

      expect(hash).toBeTruthy();
      expect(hash).toHaveLength(16);
    });

    it("should match byte-by-byte hashing", () => {
      const data = new Uint8Array([1, 2, 3, 4, 5]);

      const hasher1 = createFNV64Hasher().updateBytes(data);
      const hasher2 = createFNV64Hasher()
        .updateByte(1)
        .updateByte(2)
        .updateByte(3)
        .updateByte(4)
        .updateByte(5);

      expect(hasher1.digest()).toBe(hasher2.digest());
    });

    it("should handle empty Uint8Array", () => {
      const hasher = createFNV64Hasher();
      const initialHash = hasher.digest();

      hasher.updateBytes(new Uint8Array([]));
      const emptyHash = hasher.digest();

      expect(emptyHash).toBe(initialHash);
    });
  });

  describe("updateInt32", () => {
    it("should update hash with 32-bit integer", () => {
      const hasher = createFNV64Hasher();
      hasher.updateInt32(12345);

      const hash = hasher.digest();
      expect(hash).toBeTruthy();
      expect(hash).toHaveLength(16);
    });

    it("should handle little-endian encoding", () => {
      const hasher = createFNV64Hasher();
      hasher.updateInt32(0x01020304);

      // Should be equivalent to bytes [0x04, 0x03, 0x02, 0x01]
      const hasherBytes = createFNV64Hasher()
        .updateByte(0x04)
        .updateByte(0x03)
        .updateByte(0x02)
        .updateByte(0x01);

      expect(hasher.digest()).toBe(hasherBytes.digest());
    });

    it("should handle negative numbers as unsigned", () => {
      const hasher = createFNV64Hasher();
      hasher.updateInt32(-1);

      const hash = hasher.digest();
      expect(hash).toBeTruthy();
    });

    it("should return this for method chaining", () => {
      const hasher = createFNV64Hasher();
      const result = hasher.updateInt32(42);
      expect(result).toBe(hasher);
    });
  });

  describe("incremental hashing", () => {
    it("should produce same result as full string", () => {
      const fullString = "Hello, World!";

      const hasher1 = createFNV64Hasher().updateString(fullString);

      const hasher2 = createFNV64Hasher()
        .updateString("Hello")
        .updateString(", ")
        .updateString("World!");

      expect(hasher1.digest()).toBe(hasher2.digest());
    });

    it("should work with mixed updates", () => {
      const hasher1 = createFNV64Hasher()
        .updateString("test")
        .updateInt32(123)
        .updateByte(65);

      const hasher2 = createFNV64Hasher()
        .updateByte(116) // 't'
        .updateByte(101) // 'e'
        .updateByte(115) // 's'
        .updateByte(116) // 't'
        .updateInt32(123)
        .updateByte(65);

      expect(hasher1.digest()).toBe(hasher2.digest());
    });
  });

  describe("deterministic behavior", () => {
    it("should produce same hash for same input", () => {
      const input = "deterministic test";

      const hash1 = createFNV64Hasher().updateString(input).digest();
      const hash2 = createFNV64Hasher().updateString(input).digest();
      const hash3 = createFNV64Hasher().updateString(input).digest();

      expect(hash1).toBe(hash2);
      expect(hash2).toBe(hash3);
    });

    it("should produce different hashes for different inputs", () => {
      const hash1 = createFNV64Hasher().updateString("input1").digest();
      const hash2 = createFNV64Hasher().updateString("input2").digest();
      const hash3 = createFNV64Hasher().updateString("input3").digest();

      expect(hash1).not.toBe(hash2);
      expect(hash2).not.toBe(hash3);
      expect(hash1).not.toBe(hash3);
    });

    it("should be sensitive to input order", () => {
      const hash1 = createFNV64Hasher().updateString("ab").digest();
      const hash2 = createFNV64Hasher().updateString("ba").digest();

      expect(hash1).not.toBe(hash2);
    });

    it("should be sensitive to case", () => {
      const hash1 = createFNV64Hasher().updateString("Test").digest();
      const hash2 = createFNV64Hasher().updateString("test").digest();

      expect(hash1).not.toBe(hash2);
    });
  });

  describe("UTF-8 multibyte characters", () => {
    it("should handle 2-byte UTF-8 characters", () => {
      const hasher = createFNV64Hasher();
      hasher.updateString("café"); // é is 2-byte UTF-8

      const hash = hasher.digest();
      expect(hash).toBeTruthy();
      expect(hash).toHaveLength(16);
    });

    it("should handle 3-byte UTF-8 characters", () => {
      const hasher = createFNV64Hasher();
      hasher.updateString("你好"); // Chinese characters are 3-byte UTF-8

      const hash = hasher.digest();
      expect(hash).toBeTruthy();
      expect(hash).toHaveLength(16);
    });

    it("should handle 4-byte UTF-8 characters (emoji)", () => {
      const hasher = createFNV64Hasher();
      hasher.updateString("🚀"); // Rocket emoji is 4-byte UTF-8

      const hash = hasher.digest();
      expect(hash).toBeTruthy();
      expect(hash).toHaveLength(16);
    });

    it("should produce consistent hashes for UTF-8 strings", () => {
      const input = "Hello 世界 🌍";

      const hash1 = createFNV64Hasher().updateString(input).digest();
      const hash2 = createFNV64Hasher().updateString(input).digest();

      expect(hash1).toBe(hash2);
    });

    it("should distinguish between similar UTF-8 strings", () => {
      const hash1 = createFNV64Hasher().updateString("café").digest();
      const hash2 = createFNV64Hasher().updateString("cafe").digest();

      expect(hash1).not.toBe(hash2);
    });
  });

  describe("Unicode and emoji", () => {
    it("should handle emoji correctly", () => {
      const emojis = ["😀", "🎉", "🔥", "💻", "🚀"];
      const hashes = emojis.map((emoji) =>
        createFNV64Hasher().updateString(emoji).digest(),
      );

      // All hashes should be unique
      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(emojis.length);
    });

    it("should handle multiple emojis in a string", () => {
      const input = "Hello 👋 World 🌍!";

      const hash1 = createFNV64Hasher().updateString(input).digest();
      const hash2 = createFNV64Hasher().updateString(input).digest();

      expect(hash1).toBe(hash2);
    });

    it("should handle various Unicode characters", () => {
      const unicodeStrings = [
        "Ω", // Greek
        "Щ", // Cyrillic
        "א", // Hebrew
        "ش", // Arabic
        "漢", // CJK
        "♠", // Symbol
      ];

      const hashes = unicodeStrings.map((str) =>
        createFNV64Hasher().updateString(str).digest(),
      );

      // All hashes should be unique
      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(unicodeStrings.length);
    });

    it("should handle emoji with skin tone modifiers", () => {
      const hash1 = createFNV64Hasher().updateString("👋").digest();
      const hash2 = createFNV64Hasher().updateString("👋🏻").digest();

      // Different emojis should have different hashes
      expect(hash1).not.toBe(hash2);
    });

    it("should handle zero-width characters", () => {
      const normal = "test";
      const withZWJ = "te\u200Dst"; // Zero-width joiner

      const hash1 = createFNV64Hasher().updateString(normal).digest();
      const hash2 = createFNV64Hasher().updateString(withZWJ).digest();

      expect(hash1).not.toBe(hash2);
    });
  });

  describe("empty input", () => {
    it("should return FNV offset basis for empty input", () => {
      const emptyHash = createFNV64Hasher().digest();

      // FNV-1a offset basis: 14695981039346656037n
      expect(emptyHash).toBe("cbf29ce484222325");
    });

    it("should handle empty string consistently", () => {
      const hash1 = createFNV64Hasher().updateString("").digest();
      const hash2 = createFNV64Hasher().digest();

      expect(hash1).toBe(hash2);
    });
  });

  describe("collision resistance", () => {
    it("should have low collision rate for sequential numbers", () => {
      const hashes = new Set<string>();
      const count = 1000;

      for (let i = 0; i < count; i++) {
        const hash = createFNV64Hasher().updateString(i.toString()).digest();
        hashes.add(hash);
      }

      // Should have no collisions
      expect(hashes.size).toBe(count);
    });

    it("should have low collision rate for similar strings", () => {
      const strings = [
        "test1",
        "test2",
        "test3",
        "test11",
        "test12",
        "test21",
        "1test",
        "2test",
        "ttest",
      ];

      const hashes = strings.map((str) =>
        createFNV64Hasher().updateString(str).digest(),
      );

      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).toBe(strings.length);
    });

    it("should distinguish single byte differences", () => {
      const base = "a".repeat(100);
      const modified = `${"a".repeat(99)}b`;

      const hash1 = createFNV64Hasher().updateString(base).digest();
      const hash2 = createFNV64Hasher().updateString(modified).digest();

      expect(hash1).not.toBe(hash2);
    });
  });

  describe("edge cases", () => {
    it("should handle very long strings", () => {
      const longString = "a".repeat(10000);

      const hash = createFNV64Hasher().updateString(longString).digest();
      expect(hash).toBeTruthy();
      expect(hash).toHaveLength(16);
    });

    it("should handle strings with null bytes", () => {
      const hasher1 = createFNV64Hasher().updateByte(0);
      const hash1 = hasher1.digest();

      expect(hash1).toBeTruthy();
      expect(hash1).toHaveLength(16);
    });

    it("should handle all ASCII characters", () => {
      let allAscii = "";
      for (let i = 0; i < 128; i++) {
        allAscii += String.fromCharCode(i);
      }

      const hash = createFNV64Hasher().updateString(allAscii).digest();
      expect(hash).toBeTruthy();
      expect(hash).toHaveLength(16);
    });

    it("should handle repeated resets", () => {
      const hasher = createFNV64Hasher();
      const initialHash = hasher.digest();

      for (let i = 0; i < 10; i++) {
        hasher.updateString("test").reset();
      }

      expect(hasher.digest()).toBe(initialHash);
    });
  });
});

describe("fnv64Hash", () => {
  it("should hash Uint8Array correctly", () => {
    const data = new Uint8Array([72, 101, 108, 108, 111]);
    const hash = fnv64Hash(data);

    expect(hash).toBeTruthy();
    expect(hash).toHaveLength(16);
  });

  it("should match manual hashing", () => {
    const data = new Uint8Array([1, 2, 3, 4, 5]);

    const hash1 = fnv64Hash(data);
    const hash2 = createFNV64Hasher().updateBytes(data).digest();

    expect(hash1).toBe(hash2);
  });

  it("should be deterministic", () => {
    const data = new Uint8Array([1, 2, 3]);

    const hash1 = fnv64Hash(data);
    const hash2 = fnv64Hash(data);

    expect(hash1).toBe(hash2);
  });
});

describe("fnv64HashString", () => {
  it("should hash string correctly", () => {
    const hash = fnv64HashString("Hello, World!");

    expect(hash).toBeTruthy();
    expect(hash).toHaveLength(16);
  });

  it("should match manual hashing", () => {
    const input = "test string";

    const hash1 = fnv64HashString(input);
    const hash2 = createFNV64Hasher().updateString(input).digest();

    expect(hash1).toBe(hash2);
  });

  it("should be deterministic", () => {
    const input = "consistent input";

    const hash1 = fnv64HashString(input);
    const hash2 = fnv64HashString(input);

    expect(hash1).toBe(hash2);
  });

  it("should handle empty string", () => {
    const hash = fnv64HashString("");
    expect(hash).toBe("cbf29ce484222325");
  });

  it("should handle UTF-8 strings", () => {
    const hash = fnv64HashString("Hello 世界 🚀");

    expect(hash).toBeTruthy();
    expect(hash).toHaveLength(16);
  });
});

describe("FNV64 algorithm properties", () => {
  it("should use avalanche effect (small input change = large hash change)", () => {
    const hash1 = fnv64HashString("test");
    const hash2 = fnv64HashString("tess");

    // Count differing hex digits
    let differences = 0;
    for (let i = 0; i < 16; i++) {
      if (hash1[i] !== hash2[i]) differences++;
    }

    // Should have some differences (at least a few digits change)
    expect(differences).toBeGreaterThan(3);
  });

  it("should distribute hashes uniformly across hex digits", () => {
    const hashes = [];
    for (let i = 0; i < 100; i++) {
      hashes.push(fnv64HashString(`test${i}`));
    }

    // Count occurrences of each hex digit across all hashes
    const digitCounts: Record<string, number> = {};
    for (const hash of hashes) {
      for (const char of hash) {
        digitCounts[char] = (digitCounts[char] || 0) + 1;
      }
    }

    // Each digit should appear at least once (weak test for distribution)
    const hexDigits = "0123456789abcdef";
    for (const digit of hexDigits) {
      expect(digitCounts[digit]).toBeGreaterThan(0);
    }
  });

  it("should handle maximum bigint values without overflow", () => {
    const hasher = createFNV64Hasher();

    // Hash a lot of data to exercise the wraparound
    for (let i = 0; i < 1000; i++) {
      hasher.updateString(`overflow test ${i}`);
    }

    const hash = hasher.digest();
    expect(hash).toBeTruthy();
    expect(hash).toHaveLength(16);
  });
});
