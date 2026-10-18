// Writes the paw-print icons: black template (macOS menu bar), coloured tray (Windows/Linux)
// and a 512px app icon for installers.
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
function png(size, alphaAt, rgb = [0, 0, 0], bg = null) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const i = y * (size * 4 + 1) + 1 + x * 4;
      const a = alphaAt(x, y);
      if (bg) {
        const [bx, by, bz, ba] = bg(x, y, size);
        const fa = a / 255, oa = fa + (ba / 255) * (1 - fa);
        const mix = (f, b) => oa ? Math.round((f * fa + b * (ba / 255) * (1 - fa)) / oa) : 0;
        raw[i] = mix(rgb[0], bx); raw[i + 1] = mix(rgb[1], by); raw[i + 2] = mix(rgb[2], bz); raw[i + 3] = Math.round(oa * 255);
      } else { raw[i] = rgb[0]; raw[i + 1] = rgb[1]; raw[i + 2] = rgb[2]; raw[i + 3] = a; }
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
function tileBg(x, y, size) {
  const r = size * 0.22, cx = Math.min(Math.max(x, r), size - 1 - r), cy = Math.min(Math.max(y, r), size - 1 - r);
  const d = Math.hypot(x - cx, y - cy);
  return d <= r ? [233, 124, 48, 255] : [0, 0, 0, 0];
}
function haloBg() { return [255, 255, 255, 0]; }
mkdirSync(join(root, 'assets'), { recursive: true });
writeFileSync(join(root, 'assets', 'trayTemplate.png'), png(16, paw(16)));
writeFileSync(join(root, 'assets', 'trayTemplate@2x.png'), png(32, paw(32)));
// Coloured tray icon: warm brown paw (reads on both light and dark taskbars thanks to a white halo).
const BROWN = [122, 78, 44];
writeFileSync(join(root, 'assets', 'tray.png'), png(16, paw(16), BROWN, haloBg));
writeFileSync(join(root, 'assets', 'tray@2x.png'), png(32, paw(32), BROWN, haloBg));
// App icon: white paw on a rounded orange tile.
mkdirSync(join(root, 'build'), { recursive: true });
writeFileSync(join(root, 'build', 'icon.png'), png(512, paw(512), [255, 255, 255], tileBg));
console.log('wrote assets/trayTemplate*.png, assets/tray*.png and build/icon.png');
