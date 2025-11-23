// Base64url helpers and grid packing utilities

/**
 * Convert Uint8Array to base64url string.
 * Uses chunked processing to avoid stack overflow with large arrays.
 */
export function toBase64Url(bytes: Uint8Array): string {
  // Process in chunks to avoid stack overflow with large arrays
  const CHUNK_SIZE = 0x8000; // 32KB chunks
  let binary = "";
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, bytes.length));
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/**
 * Convert base64url string to Uint8Array.
 */
export function fromBase64Url(input: string): Uint8Array {
  let base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4 !== 0) base64 += "=";
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * Compute CRC32 for integrity checks.
 * Used to make share codes tamper-evident.
 */
export function crc32(input: string | Uint8Array): number {
  const bytes =
    typeof input === "string" ? new TextEncoder().encode(input) : input;
  let crc = 0xffffffff;

  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Bit-pack an array of 0/1 cells into bytes (LSB-first within each byte).
 */
export function bitPack01(cells: Uint8Array): Uint8Array {
  const n = cells.length;
  const out = new Uint8Array(Math.ceil(n / 8));
  for (let i = 0; i < n; i++) {
    const byteIndex = (i / 8) | 0;
    const bit = i % 8;
    const cell = cells[i];
    if (cell !== undefined && cell & 1) {
      const current = out[byteIndex] ?? 0;
      out[byteIndex] = current | (1 << bit);
    }
  }
  return out;
}

/**
 * Unpack bit-packed bytes back to 0/1 array.
 * @throws Error if packed array is too small for requested totalCells
 */
export function bitUnpack01(
  packed: Uint8Array,
  totalCells: number,
): Uint8Array {
  const requiredBytes = Math.ceil(totalCells / 8);
  if (packed.length < requiredBytes) {
    throw new Error(
      `Packed array too small: need ${requiredBytes} bytes for ${totalCells} cells, got ${packed.length}`,
    );
  }

  const out = new Uint8Array(totalCells);
  for (let i = 0; i < totalCells; i++) {
    const byteIndex = (i / 8) | 0;
    const bit = i % 8;
    const byte = packed[byteIndex];
    out[i] = byte !== undefined ? (byte >> bit) & 1 : 0;
  }
  return out;
}

/**
 * RLE encode 0/1 stream: [value(1 byte), runLength (Uint32 little-endian)]*
 */
export function rleEncode01(cells: Uint8Array): Uint8Array {
  if (cells.length === 0) return new Uint8Array();

  const firstCell = cells[0];
  if (firstCell === undefined) return new Uint8Array();

  const chunks: Uint8Array[] = [];
  let current = firstCell & 1;
  let run = 1;

  const flush = () => {
    const buf = new Uint8Array(1 + 4);
    buf[0] = current;
    const view = new DataView(buf.buffer);
    view.setUint32(1, run, true);
    chunks.push(buf);
  };

  for (let i = 1; i < cells.length; i++) {
    const cell = cells[i];
    if (cell === undefined) continue;
    const v = cell & 1;
    if (v === current && run < 0xffffffff) {
      run++;
    } else {
      flush();
      current = v;
      run = 1;
    }
  }
  flush();

  let total = 0;
  for (const c of chunks) total += c.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) {
    out.set(c, off);
    off += c.length;
  }
  return out;
}

/**
 * Decode RLE-encoded 0/1 stream.
 * @throws Error if data is malformed or doesn't decode to expected totalCells
 */
export function rleDecode01(data: Uint8Array, totalCells: number): Uint8Array {
  const out = new Uint8Array(totalCells);
  let pos = 0;
  let i = 0;

  while (pos < data.length && i < totalCells) {
    // Each chunk is 5 bytes: 1 byte value + 4 bytes run length
    if (pos + 5 > data.length) {
      throw new Error(
        `Malformed RLE data: incomplete chunk at position ${pos}`,
      );
    }

    const valueByte = data[pos];
    if (valueByte === undefined) {
      throw new Error(`Malformed RLE data: missing value at position ${pos}`);
    }
    const value = valueByte & 1;
    const view = new DataView(data.buffer, data.byteOffset + pos + 1);
    const run = view.getUint32(0, true);

    for (let k = 0; k < run && i < totalCells; k++) out[i++] = value;
    pos += 5;
  }

  if (i < totalCells) {
    throw new Error(
      `RLE data incomplete: decoded ${i} cells, expected ${totalCells}`,
    );
  }

  return out;
}
