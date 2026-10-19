// Render a contact sheet of one or more packs with headless Chromium.
// Usage: node scripts/lib/sheet.mjs <out.png> <pack> [pack...]
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { ROOT } from './sprite.mjs';

const [out, ...packs] = process.argv.slice(2);
let html = `<html><body style="margin:0;background:#dfe7f0;font-family:sans-serif">`;
for (const p of packs) {
  const m = JSON.parse(readFileSync(join(ROOT, 'buddies', p, 'buddy.json')));
  html += `<h3 style="margin:6px">${p} (${m.name})</h3><div style="display:flex;flex-wrap:wrap">`;
  for (const [a, d] of Object.entries(m.animations)) {
    html += `<div style="margin:4px;text-align:center"><div style="font-size:11px">${a}</div><div style="display:flex">`;
    for (const f of d.frames) html += `<img src="file://${join(ROOT, 'buddies', p, f)}" width="${process.env.SIZE ?? 112}" height="${Math.round((process.env.SIZE ?? 112) * (m.frameHeight ?? 128) / (m.frameWidth ?? 128))}">`;
    html += `</div></div>`;
  }
  html += `</div>`;
}
html += `</body></html>`;
const page = out.replace(/\.png$/, '.html');
writeFileSync(page, html);
execFileSync('/opt/pw-browsers/chromium-1194/chrome-linux/chrome', [
  '--headless', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--allow-file-access-from-files',
  `--window-size=${process.env.SHEET_W ?? 1500},${process.env.SHEET_H ?? Math.max(400, 560 * packs.length)}`, `--screenshot=${out}`, `file://${page}`,
], { stdio: 'ignore' });
console.log('wrote', out);
