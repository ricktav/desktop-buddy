#!/usr/bin/env node
// Turns raw images (from an image/video generator, photos, 3D renders) into a Desktop Buddy pack:
// removes the background, trims, scales every frame by the same factor, aligns the feet and
// writes frames + buddy.json. See docs/PHOTO-BUDDY.md.
//
//   node scripts/photo-pack.mjs <input-folder> --name "Rex" [options]
//   node scripts/photo-pack.mjs --sheet sheet.png --grid 4x3 --layout idle:4,walk:4,sit:2,sleep:2 --name Rex
//
// Needs `npm install` (uses sharp). Does not need Electron.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const KNOWN = ['idle', 'walk', 'sit', 'sleep', 'watch', 'point', 'alert', 'happy', 'drag', 'rear', 'spin', 'trick'];
const DEFAULT_FPS = { idle: 2, walk: 8, sit: 2, sleep: 1.5, watch: 2, point: 3, alert: 6, happy: 6, drag: 4, rear: 4, spin: 8, trick: 6 };

const HELP = `photo-pack: build a Desktop Buddy pack from images

Usage
  node scripts/photo-pack.mjs <input-folder> --name <Name> [options]
  node scripts/photo-pack.mjs --sheet <image> --grid <cols>x<rows> --layout idle:4,walk:4 --name <Name>

Input folder: files named <animation>-<n>.(png|jpg|webp), e.g. idle-1.png, walk-3.png.
Optional <input-folder>/buddy.meta.json supplies name, petLines, doubleClick, fps, facing, ...

Options
  --out <dir>          output folder (default: ./out/<id>)
  --id <id>            pack folder name (default: from --name)
  --key <mode>         background: auto (default) | none | white | black | green | magenta | #rrggbb
                       Images that already have real transparency are left alone.
  --tolerance <0-255>  how far from the key colour counts as background (default 60, soft edge adds 40)
  --erode <px>         shrink the cut-out by this many pixels to hide halos (default 1)
  --keep-holes         keep enclosed pockets of the background colour (for characters with green/white parts)
  --frame-scale <f=x,..> multiply one frame's size, e.g. idle-1=1.45 when the generator drew that image smaller
  --registered         the character stays at the same spot in every image (video frames, one fixed
                       camera): keep relative positions instead of re-centring each frame
  --facing <right|left> which way the artwork faces (default right)
  --size <WxH|N>       output frame size in pixels (default 256)
  --fill <0-1>         how much of the frame the largest pose may fill (default 0.88)
  --display <px>       on-screen height of one frame in CSS pixels (default 128 => scale 0.5 for 256)
  --pad-bottom <px>    empty space under the feet (default 8); written as feetOffset
  --shadow [0-1]       bake a soft ground shadow under the feet (default strength 0.28)
  --format <png|webp>  frame format (default png)
  --quality <1-100>    webp quality (default 90)
  --fps <anim=n,...>   override frame rates, e.g. walk=10,idle=3
  --sheet <file>       slice one sheet image instead of reading a folder
  --grid <CxR>         columns x rows of the sheet
  --layout <a:n,...>   animation order and frame counts, reading the sheet left-to-right, top-to-bottom
  --split <dir>        with --sheet: only cut the sheet into <dir>/<anim>-<n>.png (n from 1) and stop,
                       so several sheets can be gathered into one folder first
  --preview <file>     also write a contact sheet (checkerboard background) for review
  --install            run \`buddy import\` on the result (replaces a pack with the same id)
  --force              overwrite a non-empty output folder
`;

// ---------- argument parsing ----------

function parseArgs(argv) {
  const o = { _: [], key: 'auto', tolerance: 60, erode: 1, facing: 'right', size: '256', fill: 0.88, display: 128, padBottom: 8, format: 'png', quality: 90 };
  const flags = new Set(['registered', 'install', 'force', 'help', 'keepHoles']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { o._.push(a); continue; }
    const k = a.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (flags.has(k)) { o[k] = true; continue; }
    if (k === 'shadow') {
      const n = argv[i + 1];
      if (n !== undefined && /^[\d.]+$/.test(n)) { o.shadow = Number(n); i++; } else o.shadow = 0.28;
      continue;
    }
    const v = argv[++i];
    if (v === undefined) throw new Error(`--${a.slice(2)} needs a value`);
    o[k] = v;
  }
  for (const k of ['tolerance', 'erode', 'fill', 'display', 'padBottom', 'quality']) o[k] = Number(o[k]);
  return o;
}

const sanitizeId = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);

// ---------- loading ----------

/** Decode any image to straight RGBA. */
async function loadRgba(input) {
  const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { w: info.width, h: info.height, d: data };
}

function readFolder(dir) {
  const frames = [];
  for (const f of readdirSync(dir)) {
    const m = /^([a-z]+)[-_ ]?(\d+)\.(png|jpe?g|webp)$/i.exec(f);
    if (!m) continue;
    const anim = m[1].toLowerCase();
    if (!KNOWN.includes(anim)) { console.warn(`skipping ${f}: "${anim}" is not an animation name (${KNOWN.join(', ')})`); continue; }
    frames.push({ anim, n: Number(m[2]), source: join(dir, f), name: f });
  }
  frames.sort((a, b) => (a.anim === b.anim ? a.n - b.n : KNOWN.indexOf(a.anim) - KNOWN.indexOf(b.anim)));
  return frames;
}

async function readSheet(file, grid, layout) {
  const g = /^(\d+)x(\d+)$/i.exec(grid ?? '');
  if (!g) throw new Error('--grid must look like 4x3 (columns x rows)');
  const cols = Number(g[1]), rows = Number(g[2]);
  if (!layout) throw new Error('--layout is required with --sheet, e.g. idle:4,walk:4,sit:2,sleep:2');
  const meta = await sharp(file).metadata();
  const cw = Math.floor(meta.width / cols), ch = Math.floor(meta.height / rows);
  const frames = [];
  let cell = 0;
  for (const part of layout.split(',')) {
    const [anim, count] = part.split(':');
    const n = Number(count ?? 1);
    if (!KNOWN.includes(anim)) throw new Error(`--layout: "${anim}" is not an animation name (${KNOWN.join(', ')})`);
    for (let i = 0; i < n; i++, cell++) {
      if (cell >= cols * rows) throw new Error(`--layout needs more than the ${cols * rows} cells of the grid`);
      const left = (cell % cols) * cw, top = Math.floor(cell / cols) * ch;
      frames.push({ anim, n: i, source: await sharp(file).extract({ left, top, width: cw, height: ch }).png().toBuffer(), name: `${anim}-${i}` });
    }
  }
  return frames;
}

// ---------- background removal ----------

const hex = (s) => [1, 3, 5].map((i) => parseInt(s.slice(i, i + 2), 16));
const KEYS = { white: [255, 255, 255], black: [0, 0, 0], green: [0, 255, 0], magenta: [255, 0, 255] };

/** Median colour of the pixels along the border. */
function borderColor({ w, h, d }) {
  const rs = [], gs = [], bs = [];
  const take = (x, y) => { const i = (y * w + x) * 4; rs.push(d[i]); gs.push(d[i + 1]); bs.push(d[i + 2]); };
  for (let x = 0; x < w; x++) { take(x, 0); take(x, h - 1); }
  for (let y = 0; y < h; y++) { take(0, y); take(w - 1, y); }
  const med = (a) => a.sort((p, q) => p - q)[a.length >> 1];
  return [med(rs), med(gs), med(bs)];
}

function hasRealAlpha({ w, h, d }) {
  let transparent = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) transparent++;
  return transparent > w * h * 0.02;
}

/**
 * Removes the background by flood-filling inwards from the border, so a green eye or a white
 * highlight inside the character survives. Edge pixels get a soft alpha and the key colour is
 * unmixed from them (c = a*F + (1-a)*K).
 */
export function keyOut(img, mode, tolerance, erode, keepHoles = false) {
  const { w, h, d } = img;
  if (mode === 'none') return { ...img, keyed: false };
  if (mode === 'auto' && hasRealAlpha(img)) return { ...img, keyed: false, note: 'already transparent' };
  const K = mode === 'auto' ? borderColor(img) : KEYS[mode] ?? (/^#[0-9a-f]{6}$/i.test(mode) ? hex(mode) : null);
  if (!K) throw new Error(`--key: unknown mode "${mode}"`);
  const lo = tolerance, hi = tolerance + 40;
  const dist = new Float32Array(w * h);
  const km = (K[0] + K[1] + K[2]) / 3;
  const kv = [K[0] - km, K[1] - km, K[2] - km];
  const kc = Math.hypot(...kv);
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    dist[p] = Math.hypot(d[i] - K[0], d[i + 1] - K[1], d[i + 2] - K[2]) / Math.sqrt(3);
    // A saturated key colour (green screen) also shows up darker where the subject casts a shadow
    // on it. Same hue, different brightness: count that as background too. Greys and blacks have
    // no chroma, so dark eyes and noses are safe.
    if (kc > 60) {
      const m = (d[i] + d[i + 1] + d[i + 2]) / 3;
      const c0 = d[i] - m, c1 = d[i + 1] - m, c2 = d[i + 2] - m;
      const cm = Math.hypot(c0, c1, c2);
      if (cm > 0) {
        const cos = (c0 * kv[0] + c1 * kv[1] + c2 * kv[2]) / (cm * kc);
        if (cos > 0.96 && cm / kc > 0.4 && cm / kc < 1.6) dist[p] = Math.min(dist[p], lo * 0.5);
      }
    }
  }
  // Region of background: connected to the border and closer than `hi`.
  const bg = new Uint8Array(w * h);
  const stack = [];
  const push = (x, y) => { const p = y * w + x; if (!bg[p] && dist[p] < hi) { bg[p] = 1; stack.push(p); } };
  // Pockets of pure key colour (the gap between the legs) are background too, unless --keep-holes.
  if (!keepHoles) for (let p = 0; p < w * h; p++) if (dist[p] < lo) { bg[p] = 1; stack.push(p); }
  for (let x = 0; x < w; x++) { push(x, 0); push(x, h - 1); }
  for (let y = 0; y < h; y++) { push(0, y); push(w - 1, y); }
  while (stack.length) {
    const p = stack.pop(), x = p % w, y = (p / w) | 0;
    if (x > 0) push(x - 1, y);
    if (x < w - 1) push(x + 1, y);
    if (y > 0) push(x, y - 1);
    if (y < h - 1) push(x, y + 1);
  }
  const out = Buffer.from(d);
  for (let p = 0; p < w * h; p++) {
    if (!bg[p]) continue;
    const a = Math.min(1, Math.max(0, (dist[p] - lo) / (hi - lo)));
    const i = p * 4;
    if (a <= 0) { out[i + 3] = 0; continue; }
    for (let c = 0; c < 3; c++) out[i + c] = Math.max(0, Math.min(255, Math.round((d[i + c] - (1 - a) * K[c]) / a)));
    out[i + 3] = Math.round(a * 255 * (d[i + 3] / 255));
  }
  for (let n = 0; n < erode; n++) {
    const prev = Buffer.from(out);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4 + 3;
      if (prev[i] === 0) continue;
      const nb = [x > 0 ? prev[i - 4] : 0, x < w - 1 ? prev[i + 4] : 0, y > 0 ? prev[i - w * 4] : 0, y < h - 1 ? prev[i + w * 4] : 0];
      const m = Math.min(...nb);
      if (m < prev[i]) out[i] = Math.round((prev[i] + m) / 2);
    }
  }
  return { w, h, d: out, keyed: true, key: K };
}

/** Bounding box of pixels with alpha above the threshold, or null if the image is empty. */
function alphaBox({ w, h, d }, threshold = 16) {
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    if (d[(y * w + x) * 4 + 3] > threshold) {
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// ---------- layout ----------

function parseSize(s) {
  const m = /^(\d+)(?:x(\d+))?$/i.exec(String(s));
  if (!m) throw new Error('--size must be N or WxH, e.g. 256 or 320x256');
  const w = Number(m[1]), h = Number(m[2] ?? m[1]);
  if (w < 32 || h < 32 || w > 1024 || h > 1024) throw new Error('--size must be between 32 and 1024');
  return { w, h };
}

/** Draws the cropped `box` of `img` at `scale`, centred horizontally with its bottom edge on the baseline. */
async function composeFrame(img, box, scale, canvas, shadow, padBottom) {
  const cw = Math.max(1, Math.round(box.w * scale)), ch = Math.max(1, Math.round(box.h * scale));
  const dx = Math.round((canvas.w - cw) / 2), dy = canvas.h - padBottom - ch;
  const sprite = await sharp(img.d, { raw: { width: img.w, height: img.h, channels: 4 } })
    .extract({ left: box.x, top: box.y, width: box.w, height: box.h })
    .resize(cw, ch, { kernel: 'lanczos3' })
    .png()
    .toBuffer();
  const layers = [];
  if (shadow) {
    const rx = Math.max(6, Math.round(cw * 0.3)), ry = Math.max(3, Math.round(canvas.h * 0.018));
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${canvas.w}" height="${canvas.h}"><defs><filter id="b"><feGaussianBlur stdDeviation="${Math.max(1.5, ry * 0.6)}"/></filter></defs><ellipse cx="${dx + cw / 2}" cy="${canvas.h - padBottom}" rx="${rx}" ry="${ry}" fill="#000" fill-opacity="${shadow}" filter="url(#b)"/></svg>`;
    layers.push({ input: Buffer.from(svg), left: 0, top: 0 });
  }
  layers.push({ input: sprite, left: dx, top: dy });
  return sharp({ create: { width: canvas.w, height: canvas.h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(layers);
}

// ---------- main ----------

export async function run(argv) {
  const o = parseArgs(argv);
  if (o.help || (!o._.length && !o.sheet)) { console.log(HELP); return null; }

  if (o.sheet && o.split) {
    const cells = await readSheet(resolve(o.sheet), o.grid, o.layout);
    mkdirSync(resolve(o.split), { recursive: true });
    for (const c of cells) writeFileSync(join(resolve(o.split), `${c.anim}-${c.n + 1}.png`), c.source);
    console.log(`wrote ${cells.length} cells to ${resolve(o.split)}`);
    return null;
  }

  const inDir = o._[0] ? resolve(o._[0]) : null;
  let meta = {};
  if (inDir && existsSync(join(inDir, 'buddy.meta.json'))) meta = JSON.parse(readFileSync(join(inDir, 'buddy.meta.json'), 'utf8'));
  const name = o.name ?? meta.name;
  if (!name) throw new Error('--name is required (or "name" in buddy.meta.json)');
  const id = sanitizeId(o.id ?? name);
  const outDir = resolve(o.out ?? join('out', id));
  if (existsSync(outDir) && readdirSync(outDir).length && !o.force) throw new Error(`${outDir} is not empty; use --force to overwrite`);
  if (existsSync(outDir)) rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });

  const frames = o.sheet ? await readSheet(resolve(o.sheet), o.grid, o.layout) : readFolder(inDir);
  if (!frames.length) throw new Error('no frames found; name files like idle-1.png, walk-2.png (animations: ' + KNOWN.join(', ') + ')');
  const anims = [...new Set(frames.map((f) => f.anim))];
  for (const req of ['idle', 'walk']) if (!anims.includes(req)) throw new Error(`"${req}" frames are required`);
  const canvas = parseSize(o.size);
  const facing = o.facing ?? meta.facing ?? 'right';

  const frameScales = { ...(meta.frameScale ?? {}), ...Object.fromEntries((o.frameScale ?? '').split(',').filter(Boolean).map((p) => p.split('=')).map(([k, v]) => [k.replace(/\.[^.]+$/, ''), Number(v)])) };

  // 1. decode and cut out
  const cut = [];
  for (const f of frames) {
    const img = keyOut(await loadRgba(f.source), o.key, o.tolerance, o.erode, !!o.keepHoles);
    const box = alphaBox(img);
    if (!box) throw new Error(`${f.name}: nothing left after removing the background. Try --key none, --tolerance, or a different --key colour.`);
    if (!img.keyed && o.key === 'auto' && !img.note) console.warn(`${f.name}: kept as is (no background removed)`);
    cut.push({ ...f, img, box, fs: frameScales[f.name.replace(/\.[^.]+$/, '')] ?? 1 });
  }

  // 2. one scale for everything
  let union = null;
  if (o.registered) {
    const x0 = Math.min(...cut.map((c) => c.box.x)), y0 = Math.min(...cut.map((c) => c.box.y));
    const x1 = Math.max(...cut.map((c) => c.box.x + c.box.w)), y1 = Math.max(...cut.map((c) => c.box.y + c.box.h));
    union = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    const dims = new Set(cut.map((c) => `${c.img.w}x${c.img.h}`));
    if (dims.size > 1) console.warn(`--registered expects all images to be the same size, got ${[...dims].join(', ')}`);
  }
  const maxW = Math.max(...cut.map((c) => (union ? union.w : c.box.w * c.fs)));
  const maxH = Math.max(...cut.map((c) => (union ? union.h : c.box.h * c.fs)));
  const availW = canvas.w * o.fill, availH = (canvas.h - o.padBottom) * o.fill;
  const scale = Math.min(availW / maxW, availH / maxH);

  // 3. place every frame: feet on the baseline, centred (or registered)
  for (const c of cut) {
    const crop = clampBox(union ?? c.box, c.img);
    const comp = await composeFrame(c.img, crop, scale * c.fs, canvas, o.shadow, o.padBottom);
    const file = `${c.anim}-${c.n}.${o.format}`;
    const target = o.format === 'webp' ? comp.webp({ quality: o.quality, alphaQuality: 100 }) : comp.png({ compressionLevel: 9 });
    await target.toFile(join(outDir, file));
    c.file = file;
  }

  // 4. manifest
  const fpsOverride = Object.fromEntries((o.fps ?? '').split(',').filter(Boolean).map((p) => p.split('=')).map(([k, v]) => [k, Number(v)]));
  const animations = {};
  for (const a of anims) {
    const list = cut.filter((c) => c.anim === a).sort((p, q) => p.n - q.n).map((c) => c.file);
    animations[a] = { frames: list, fps: fpsOverride[a] ?? meta.fps?.[a] ?? DEFAULT_FPS[a] };
  }
  const { fps: _fps, frameScale: _fs, ...metaRest } = meta;
  const manifest = {
    name,
    frameWidth: canvas.w,
    frameHeight: canvas.h,
    scale: Math.round((o.display / canvas.h) * 1000) / 1000,
    facing,
    feetOffset: o.padBottom,
    ...metaRest,
    animations,
  };
  writeFileSync(join(outDir, 'buddy.json'), JSON.stringify(manifest, null, 2) + '\n');

  // 5. optional contact sheet
  if (o.preview) await contactSheet(cut, outDir, canvas, o.padBottom, resolve(o.preview));

  // 6. validate with the app's own validator when it has been built
  let errors = 0;
  const bundleJs = join(ROOT, 'dist', 'main', 'bundle.js');
  if (existsSync(bundleJs)) {
    const { validateFolder, formatReport } = await import(bundleJs);
    const report = validateFolder(outDir);
    errors = report.errors.length;
    console.log(formatReport(report));
  } else {
    console.log('(run `npm run build` once to also validate the result here)');
  }
  console.log(`\nwrote ${cut.length} frames in ${anims.length} animations to ${outDir}`);
  console.log(`install with:  node bin/buddy.js import "${outDir}" --id ${id}`);
  if (o.install && !errors) {
    const r = spawnSync(process.execPath, [join(ROOT, 'bin', 'buddy.js'), 'import', outDir, '--id', id, '--force'], { stdio: 'inherit' });
    if (r.status) errors++;
  }
  return { outDir, manifest, errors };
}

function clampBox(box, img) {
  const x = Math.max(0, box.x), y = Math.max(0, box.y);
  return { x, y, w: Math.min(img.w - x, box.w), h: Math.min(img.h - y, box.h) };
}

async function contactSheet(cut, outDir, canvas, padBottom, file) {
  const cols = Math.min(8, cut.length), rows = Math.ceil(cut.length / cols);
  const cell = 160, label = 14;
  const cs = cell / canvas.w;
  const ch = Math.round(canvas.h * cs);
  const tile = 16;
  const guideY = (i) => Math.floor(i / cols) * (ch + label) + label + ch - Math.round(padBottom * cs);
  const bgSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${cols * cell}" height="${rows * (ch + label)}"><defs><pattern id="c" width="${tile * 2}" height="${tile * 2}" patternUnits="userSpaceOnUse"><rect width="${tile * 2}" height="${tile * 2}" fill="#ddd"/><rect width="${tile}" height="${tile}" fill="#bbb"/><rect x="${tile}" y="${tile}" width="${tile}" height="${tile}" fill="#bbb"/></pattern></defs><rect width="100%" height="100%" fill="url(#c)"/>${cut.map((c, i) => `<text x="${(i % cols) * cell + 4}" y="${Math.floor(i / cols) * (ch + label) + 11}" font-size="10" font-family="sans-serif" fill="#000">${c.file}</text>`).join('')}${cut.map((_, i) => `<line x1="${(i % cols) * cell}" x2="${(i % cols) * cell + cell}" y1="${guideY(i)}" y2="${guideY(i)}" stroke="#f0f" stroke-opacity="0.35"/>`).join('')}</svg>`;
  const layers = [];
  for (let i = 0; i < cut.length; i++) {
    layers.push({ input: await sharp(join(outDir, cut[i].file)).resize(cell, ch).png().toBuffer(), left: (i % cols) * cell, top: Math.floor(i / cols) * (ch + label) + label });
  }
  await sharp(Buffer.from(bgSvg)).composite(layers).png().toFile(file);
  console.log(`contact sheet: ${file}`);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run(process.argv.slice(2)).then((r) => { if (r?.errors) process.exit(1); }, (e) => { console.error(`error: ${e.message}`); process.exit(1); });
}
