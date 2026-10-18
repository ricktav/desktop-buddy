import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import sharp from 'sharp';
const require = createRequire(import.meta.url);
const { run, keyOut } = await import('../scripts/photo-pack.mjs');
const { validateFolder, pngInfo } = require('../dist/main/bundle.js');

const quiet = async (fn) => {
  const log = console.log, warn = console.warn;
  console.log = () => {}; console.warn = () => {};
  try { return await fn(); } finally { console.log = log; console.warn = warn; }
};

/** A 400x400 image: solid background, a red "animal" with a background-coloured eye inside it. */
async function fake(bg, { w = 120, h = 80, x = 140, y = 200, size = 400 } = {}) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="100%" height="100%" fill="${bg}"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="#c0392b"/><circle cx="${x + w - 20}" cy="${y + 20}" r="8" fill="${bg}"/></svg>`;
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function inputDir(bg, shots) {
  const dir = mkdtempSync(join(tmpdir(), 'buddy-photo-in-'));
  for (const [name, opts] of Object.entries(shots)) writeFileSync(join(dir, name), await fake(bg, opts));
  return dir;
}

test('keyOut removes the border background but keeps an interior hole of the same colour', async () => {
  const buf = await sharp(await fake('#00ff00')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = keyOut({ w: buf.info.width, h: buf.info.height, d: buf.data }, 'auto', 60, 1);
  const alphaAt = (x, y) => out.d[(y * out.w + x) * 4 + 3];
  assert.equal(alphaAt(5, 5), 0, 'corner is transparent');
  assert.equal(alphaAt(180, 240), 255, 'body is opaque');
  assert.equal(alphaAt(140 + 120 - 20, 200 + 20), 255, 'the green eye inside the body is not punched out');
});

test('builds a valid pack: same-size PNG frames, feet on one baseline, same scale', async () => {
  const dir = await inputDir('#00ff00', {
    'idle-1.png': {}, 'idle-2.png': { y: 190, h: 90 },
    'walk-1.png': { x: 120 }, 'walk-2.png': { x: 160 },
    'sit-1.png': { h: 50, y: 230 },
  });
  const out = join(mkdtempSync(join(tmpdir(), 'buddy-photo-out-')), 'rex');
  const res = await quiet(() => run([dir, '--name', 'Rex', '--out', out, '--key', 'green', '--shadow']));
  assert.equal(res.errors, 0);
  const man = JSON.parse(readFileSync(join(out, 'buddy.json'), 'utf8'));
  assert.equal(man.name, 'Rex');
  assert.equal(man.frameWidth, 256);
  assert.equal(man.scale, 0.5);
  assert.deepEqual(man.animations.idle.frames, ['idle-1.png', 'idle-2.png']);
  assert.equal(man.animations.walk.fps, 8);
  const report = validateFolder(out);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.warnings.filter((w) => /no transparency|different sizes|stretched/.test(w)), []);

  const bottoms = [];
  let heights = {};
  for (const f of readdirSync(out).filter((n) => n.endsWith('.png'))) {
    const { data, info } = await sharp(join(out, f)).raw().toBuffer({ resolveWithObject: true });
    assert.equal(info.width, 256);
    assert.equal(info.height, 256);
    let top = info.height, bottom = -1;
    for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
      if (data[(y * info.width + x) * 4 + 3] > 200) { top = Math.min(top, y); bottom = Math.max(bottom, y); }
    }
    bottoms.push(bottom);
    heights[f] = bottom - top + 1;
  }
  assert.ok(Math.max(...bottoms) - Math.min(...bottoms) <= 1, `feet on one baseline: ${bottoms}`);
  assert.ok(Math.abs(Math.max(...bottoms) - (256 - 8 - 1)) <= 2, `baseline near the bottom padding: ${bottoms}`);
  assert.ok(heights['sit-1.png'] < heights['idle-1.png'], 'a sitting pose stays smaller: one scale for all frames');
});

test('--registered keeps a hop above the ground', async () => {
  const dir = await inputDir('#ffffff', { 'idle-1.png': { y: 250 }, 'idle-2.png': { y: 250 }, 'walk-1.png': { y: 250 }, 'walk-2.png': { y: 250 }, 'happy-1.png': { y: 150 }, 'happy-2.png': { y: 250 } });
  const out = join(mkdtempSync(join(tmpdir(), 'buddy-photo-out-')), 'hop');
  await quiet(() => run([dir, '--name', 'Hop', '--out', out, '--key', 'white', '--registered']));
  const bottom = async (f) => {
    const { data, info } = await sharp(join(out, f)).raw().toBuffer({ resolveWithObject: true });
    for (let y = info.height - 1; y >= 0; y--) for (let x = 0; x < info.width; x++) if (data[(y * info.width + x) * 4 + 3] > 200) return y;
  };
  assert.ok((await bottom('happy-1.png')) < (await bottom('happy-2.png')) - 10);
});

test('slices a sprite sheet and writes webp', async () => {
  const cells = [];
  for (let i = 0; i < 4; i++) cells.push({ input: await fake('#ff00ff', { size: 200, x: 40 + i * 5, y: 80, w: 100, h: 70 }), left: (i % 2) * 200, top: Math.floor(i / 2) * 200 });
  const sheet = join(mkdtempSync(join(tmpdir(), 'buddy-sheet-')), 'sheet.png');
  await sharp({ create: { width: 400, height: 400, channels: 3, background: '#ff00ff' } }).composite(cells).png().toFile(sheet);
  const out = join(mkdtempSync(join(tmpdir(), 'buddy-photo-out-')), 'sheet');
  const res = await quiet(() => run(['--sheet', sheet, '--grid', '2x2', '--layout', 'idle:2,walk:2', '--name', 'Sheety', '--out', out, '--key', 'magenta', '--format', 'webp', '--size', '192x160', '--preview', join(out, '..', 'preview.png')]));
  assert.equal(res.errors, 0);
  const man = JSON.parse(readFileSync(join(out, 'buddy.json'), 'utf8'));
  assert.deepEqual(man.animations.walk.frames, ['walk-0.webp', 'walk-1.webp']);
  assert.equal(man.frameHeight, 160);
  assert.equal((await sharp(join(out, 'idle-0.webp')).metadata()).width, 192);
});

test('refuses missing idle/walk and unnamed packs with a clear error', async () => {
  const dir = await inputDir('#00ff00', { 'idle-1.png': {} });
  await assert.rejects(quiet(() => run([dir, '--name', 'X', '--out', join(tmpdir(), 'x1')])), /"walk" frames are required/);
  await assert.rejects(quiet(() => run([dir, '--out', join(tmpdir(), 'x2')])), /--name is required/);
});

test('validator checks PNG frames: signature, transparency, sizes', () => {
  const man = (frames) => ({ name: 'P', frameWidth: 64, frameHeight: 64, facing: 'right', feetOffset: 4, animations: { idle: { frames, fps: 2 }, walk: { frames, fps: 4 } } });
  const png = (w, h, colorType) => {
    const b = Buffer.alloc(40);
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
    b.writeUInt32BE(13, 8); b.write('IHDR', 12, 'latin1'); b.writeUInt32BE(w, 16); b.writeUInt32BE(h, 20); b[24] = 8; b[25] = colorType;
    return b;
  };
  const { validatePack } = require('../dist/main/bundle.js');
  assert.deepEqual(pngInfo(png(64, 64, 6)), { width: 64, height: 64, alpha: true });
  assert.equal(pngInfo(Buffer.from('nope')), null);
  const ok = validatePack(man(['a.png']), () => png(64, 64, 6));
  assert.deepEqual(ok.errors, []);
  assert.match(validatePack(man(['a.png']), () => Buffer.from('not a png at all, really')).errors.join(), /not a valid PNG/);
  assert.match(validatePack(man(['a.png']), () => png(64, 64, 2)).warnings.join(), /no transparency/);
  assert.match(validatePack(man(['a.png']), () => png(128, 64, 6)).warnings.join(), /stretched/);
  const mixed = validatePack(man(['a.png', 'b.png']), (n) => (n === 'a.png' ? png(64, 64, 6) : png(32, 32, 6)));
  assert.match(mixed.warnings.join(), /different sizes/);
});

test('--split cuts a sheet into numbered single files', async () => {
  const sheet = join(mkdtempSync(join(tmpdir(), 'buddy-split-')), 'sheet.png');
  await sharp({ create: { width: 200, height: 100, channels: 3, background: '#00ff00' } }).png().toFile(sheet);
  const dir = join(mkdtempSync(join(tmpdir(), 'buddy-split-out-')), 'raw');
  await quiet(() => run(['--sheet', sheet, '--grid', '2x1', '--layout', 'idle:1,walk:1', '--split', dir]));
  assert.deepEqual(readdirSync(dir).sort(), ['idle-1.png', 'walk-1.png']);
});
