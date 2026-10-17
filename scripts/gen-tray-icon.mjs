// Writes a monochrome paw-print template icon (16px and 32px) for the macOS menu bar.
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, alphaAt) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const i = y * (size * 4 + 1) + 1 + x * 4;
      raw[i] = 0; raw[i + 1] = 0; raw[i + 2] = 0; raw[i + 3] = alphaAt(x, y);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}
// Paw: one big pad + four toe pads, in a 16x16 design space, supersampled.
function paw(size) {
  const s = size / 16;
  const blobs = [
    [8, 10.5, 3.6, 3.0], // main pad (cx, cy, rx, ry)
    [3.4, 6.2, 1.6, 1.9], [6.6, 3.6, 1.6, 1.9], [9.4, 3.6, 1.6, 1.9], [12.6, 6.2, 1.6, 1.9],
  ];
  return (x, y) => {
    let hit = 0;
    const N = 4;
    for (let sy = 0; sy < N; sy++) for (let sx = 0; sx < N; sx++) {
      const px = (x + (sx + 0.5) / N) / s, py = (y + (sy + 0.5) / N) / s;
      if (blobs.some(([cx, cy, rx, ry]) => ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 <= 1)) hit++;
    }
    return Math.round((hit / (N * N)) * 255);
  };
}
mkdirSync(join(root, 'assets'), { recursive: true });
writeFileSync(join(root, 'assets', 'trayTemplate.png'), png(16, paw(16)));
writeFileSync(join(root, 'assets', 'trayTemplate@2x.png'), png(32, paw(32)));
console.log('wrote assets/trayTemplate.png and @2x');
