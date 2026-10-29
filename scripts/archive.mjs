import { gzipSync, gunzipSync, zipSync, unzipSync } from "fflate";
const align = (n) => Math.ceil(n / 512) * 512;
function header(name, size, mode) {
  const h = Buffer.alloc(512);
  const octal = (offset, length, number) =>
    h.write(
      number.toString(8).padStart(length - 1, "0") + "\0",
      offset,
      length,
      "ascii",
    );
  h.write(name, 0, 100, "utf8");
  octal(100, 8, mode);
  octal(108, 8, 0);
  octal(116, 8, 0);
  octal(124, 12, size);
  octal(136, 12, 0);
  h.fill(32, 148, 156);
  h[156] = 48;
  h.write("ustar\0", 257);
  h.write("00", 263);
  h.write(
    [...h]
      .reduce((a, b) => a + b, 0)
      .toString(8)
      .padStart(6, "0") + "\0 ",
    148,
    8,
    "ascii",
  );
  return h;
}
export function pack(entries, format) {
  if (format === "zip")
    return zipSync(
      Object.fromEntries(entries.map((entry) => [entry.name, entry.bytes])),
      { level: 6 },
    );
  const chunks = [];
  for (const entry of entries)
    chunks.push(
      header(entry.name, entry.bytes.length, entry.mode),
      entry.bytes,
      Buffer.alloc(align(entry.bytes.length) - entry.bytes.length),
    );
  chunks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(chunks), { level: 6, mtime: 0 });
}
export function unpack(bytes, format) {
  if (format === "zip")
    return Object.entries(unzipSync(bytes)).map(([name, bytes]) => ({
      name,
      bytes,
      mode: 0o644,
    }));
  const data = Buffer.from(gunzipSync(bytes)),
    entries = [];
  for (let offset = 0; offset + 512 <= data.length && data[offset] !== 0;) {
    const h = data.subarray(offset, offset + 512);
    const str = (at, length) =>
      h
        .subarray(at, at + length)
        .toString("utf8")
        .replace(/\0.*$/s, "")
        .trim();
    const expected = parseInt(str(148, 8), 8);
    const sum = [...h].reduce(
      (sum, byte, i) => sum + (i >= 148 && i < 156 ? 32 : byte),
      0,
    );
    if (sum !== expected || h[156] !== 48)
      throw new Error("Invalid tar entry/checksum");
    const size = parseInt(str(124, 12), 8);
    if (!Number.isSafeInteger(size) || offset + 512 + size > data.length)
      throw new Error("Truncated tar entry");
    entries.push({
      name: str(0, 100),
      mode: parseInt(str(100, 8), 8),
      bytes: data.subarray(offset + 512, offset + 512 + size),
    });
    offset += 512 + align(size);
  }
  return entries;
}
