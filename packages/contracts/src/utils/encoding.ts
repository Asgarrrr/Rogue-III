// Base64url helpers and grid packing utilities

export function toBase64Url(bytes: Uint8Array): string {
  const binary = String.fromCharCode(...bytes);
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

export function fromBase64Url(input: string): Uint8Array {
  let base64 = input.replace(/-/g, "+").replace(/_/g, "/");
  while (base64.length % 4 !== 0) base64 += "=";
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

// Bit-pack an array of 0/1 cells into bytes (LSB-first within each byte)
export function bitPack01(cells: Uint8Array): Uint8Array {
  const n = cells.length;
  const out = new Uint8Array(Math.ceil(n / 8));
  for (let i = 0; i < n; i++) {
    const byteIndex = (i / 8) | 0;
    const bit = i % 8;
    if (cells[i] & 1) out[byteIndex] |= 1 << bit;
  }
  return out;
}

export function bitUnpack01(
  packed: Uint8Array,
  totalCells: number,
): Uint8Array {
  const out = new Uint8Array(totalCells);
  for (let i = 0; i < totalCells; i++) {
    const byteIndex = (i / 8) | 0;
    const bit = i % 8;
    out[i] = (packed[byteIndex] >> bit) & 1;
  }
  return out;
}

// Simple RLE for 0/1 streams: [value(1 byte), runLength (Uint32 little-endian)]*
export function rleEncode01(cells: Uint8Array): Uint8Array {
  if (cells.length === 0) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let current = cells[0] & 1;
  let run = 1;
  const flush = () => {
    const buf = new Uint8Array(1 + 4);
    buf[0] = current;
    const view = new DataView(buf.buffer);
    view.setUint32(1, run, true);
    chunks.push(buf);
  };
  for (let i = 1; i < cells.length; i++) {
    const v = cells[i] & 1;
    if (v === current && run < 0xffffffff) run++;
    else {
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

export function rleDecode01(data: Uint8Array, totalCells: number): Uint8Array {
  const out = new Uint8Array(totalCells);
  let pos = 0;
  let i = 0;
  while (pos < data.length && i < totalCells) {
    const value = data[pos] & 1;
    const view = new DataView(data.buffer, data.byteOffset + pos + 1);
    const run = view.getUint32(0, true);
    for (let k = 0; k < run && i < totalCells; k++) out[i++] = value;
    pos += 5;
  }
  return out;
}
