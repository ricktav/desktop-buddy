// Bailey 2: the Bailey photo buddy with a rigged walk and run, and a jump for the double-click trick.
// The original Bailey swaps between three different photos to walk, so the whole dog shifts
// and wiggles. Here every walk/run frame is made from ONE photo (walk-2, mid-stride, all four
// legs visible): the body stays put and only the legs swing around their shoulder/hip.
// The trick crouches, leaps (the happy-1 photo) and lands, with the shadow staying on the ground.
// Reads buddies/bailey, writes buddies/bailey2 (idle, sit, sleep and alert are copied as they are).
// Run: node scripts/gen-bailey2.mjs
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'buddies', 'bailey');
const OUT = join(ROOT, 'buddies', 'bailey2');
const W = 320, H = 256;
const GROUND = 247; // lowest paw row; the shadow sits on 248 like the other photo buddies

// ---------- raster helpers (straight RGBA as Float32, 0..1) ----------

async function load(name) {
  const { data } = await sharp(join(SRC, name)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const d = new Float32Array(W * H * 4);
  for (let i = 0; i < d.length; i++) d[i] = data[i] / 255;
  return d;
}

const blank = () => new Float32Array(W * H * 4);

/** Drop the baked shadow: faint pixels near the ground. */
function stripShadow(img) {
  for (let y = 236; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    if (img[i + 3] < 0.5) img[i + 3] = 0;
  }
  return img;
}

function sample(img, x, y) {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const out = [0, 0, 0, 0];
  for (const [dx, dy, w] of [[0, 0, (1 - fx) * (1 - fy)], [1, 0, fx * (1 - fy)], [0, 1, (1 - fx) * fy], [1, 1, fx * fy]]) {
    const px = x0 + dx, py = y0 + dy;
    if (w === 0 || px < 0 || py < 0 || px >= W || py >= H) continue;
    const i = (py * W + px) * 4, a = img[i + 3] * w;
    out[0] += img[i] * a; out[1] += img[i + 1] * a; out[2] += img[i + 2] * a; out[3] += a;
  }
  if (out[3] > 0) { out[0] /= out[3]; out[1] /= out[3]; out[2] /= out[3]; }
  return out;
}

/** Paint `src` over `dst` (straight alpha). `weight(x, y)` can fade the source. */
function over(dst, src, weight) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4;
    const a = src[i + 3] * (weight ? weight(x, y) : 1);
    if (a <= 0) continue;
    const da = dst[i + 3], oa = a + da * (1 - a);
    for (let c = 0; c < 3; c++) dst[i + c] = (src[i + c] * a + dst[i + c] * da * (1 - a)) / oa;
    dst[i + 3] = oa;
  }
  return dst;
}

/**
 * Inverse-mapped transform: out(p) = img(pivot + R(-angle) * S^-1 * (p - pivot - shift)).
 * `sy` squashes along y (in the rotated frame), `mask(x, y)` weights the source.
 */
function transform(img, { pivot = [W / 2, H / 2], angle = 0, sx = 1, sy = 1, shift = [0, 0], mask } = {}) {
  const out = blank();
  const r = (angle * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const px = x - pivot[0] - shift[0], py = y - pivot[1] - shift[1];
    // undo rotation, then undo scale
    let qx = c * px + s * py, qy = -s * px + c * py;
    qx = qx / sx + pivot[0]; qy = qy / sy + pivot[1];
    if (qx < -1 || qy < -1 || qx > W || qy > H) continue;
    const v = sample(img, qx, qy);
    if (mask) v[3] *= mask(qx, qy);
    if (v[3] <= 0) continue;
    out.set(v, (y * W + x) * 4);
  }
  return out;
}

function inPoly(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function bottomRow(img) {
  for (let y = H - 1; y >= 0; y--) for (let x = 0; x < W; x++) if (img[(y * W + x) * 4 + 3] > 0.5) return y;
  return H - 1;
}

function bbox(img) {
  let x0 = W, x1 = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (img[(y * W + x) * 4 + 3] > 0.5) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); }
  return [x0, x1];
}

/** Soft elliptical ground shadow (same look as photo-pack --shadow 0.28). */
function shadow(cx, rx, strength = 0.28) {
  const out = blank(), ry = 4.6, cy = GROUND + 1;
  for (let y = Math.floor(cy - ry * 3); y < Math.min(H, cy + ry * 3); y++) for (let x = 0; x < W; x++) {
    const d = Math.hypot((x - cx) / rx, (y - cy) / ry);
    const a = strength * (1 - smooth(0.55, 1.35, d));
    if (a > 0) out[(y * W + x) * 4 + 3] = a;
  }
  return out;
}
const smooth = (a, b, t) => { const u = Math.min(1, Math.max(0, (t - a) / (b - a))); return u * u * (3 - 2 * u); };

async function save(img, name) {
  const buf = Buffer.alloc(W * H * 4);
  for (let i = 0; i < img.length; i++) buf[i] = Math.round(Math.min(1, Math.max(0, img[i])) * 255);
  await sharp(buf, { raw: { width: W, height: H, channels: 4 } }).webp({ quality: 88, alphaQuality: 100 }).toFile(join(OUT, name));
}

// ---------- the leg rig (coordinates in the walk-2 photo) ----------
// rest = angle of the leg in the photo (degrees from vertical, + = paw forward/left).
// far legs are drawn behind the body, near legs in front.
const LEGS = [
  { id: 'front-far', far: true, pivot: [134, 184], rest: -14, front: true,
    poly: [[121, 176], [148, 176], [152, 200], [158, 215], [158, 238], [135, 238], [136, 212], [128, 197], [121, 186]] },
  { id: 'hind-far', far: true, pivot: [195, 178], rest: 11, front: false,
    poly: [[183, 168], [207, 170], [208, 186], [206, 206], [201, 220], [193, 236], [171, 236], [171, 226], [181, 217], [185, 200], [184, 180]] },
  { id: 'front-near', far: false, pivot: [108, 182], rest: 26, front: true,
    poly: [[93, 172], [121, 172], [121, 184], [112, 200], [102, 216], [97, 230], [91, 238], [67, 238], [67, 227], [80, 221], [86, 205], [94, 183]] },
  { id: 'hind-near', far: false, pivot: [228, 184], rest: -13, front: false,
    poly: [[208, 176], [236, 176], [243, 190], [251, 200], [254, 215], [254, 238], [225, 238], [229, 225], [231, 212], [221, 200], [207, 190]] },
];
// the tail hangs down next to the near hind leg; it always stays with the body
const TAIL = [[238, 165], [275, 165], [275, 200], [250, 200], [243, 188]];
const CLAIM = 5; // px: opaque pixels this close to a leg's outline (below its pivot) belong to that leg
// Below its pivot a leg cross-fades from the static body (the 'shoulder') to the swinging leg over
// CAP px, so a swinging leg never opens a hole or leaves a hard edge.
const CAP = 8;

/**
 * One frame of a gait. `t` in 0..1. Each leg swings angle = c + A*cos(2*pi*(t - phase));
 * while it swings forward it is lifted (shortened) so the paw clears the ground.
 */
function distToPoly(poly, x, y) {
  if (inPoly(poly, x, y)) return 0;
  let best = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [ax, ay] = poly[j], [bx, by] = poly[i];
    const dx = bx - ax, dy = by - ay;
    const u = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
    best = Math.min(best, Math.hypot(x - ax - u * dx, y - ay - u * dy));
  }
  return best;
}

/**
 * Which leg owns each pixel of the base photo (-1 = body). Inside a polygon, or below the leg's
 * pivot and within CLAIM px of it, so stray fur at a leg's edge moves with the leg.
 */
function labelLegs(base) {
  const label = new Int8Array(W * H).fill(-1);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (base[(y * W + x) * 4 + 3] <= 0 || inPoly(TAIL, x + 0.5, y + 0.5)) continue;
    let best = -1, bestD = CLAIM;
    LEGS.forEach((leg, k) => {
      if (y < leg.poly.reduce((m, p) => Math.min(m, p[1]), H)) return;
      const d = distToPoly(leg.poly, x + 0.5, y + 0.5);
      if (d === 0 || (y >= leg.pivot[1] && d < bestD)) { best = k; bestD = d; }
    });
    label[y * W + x] = best;
  }
  return label;
}

let labelCache;
function gaitFrame(base, t, g) {
  const label = (labelCache ??= labelLegs(base));
  const body = new Float32Array(base);
  LEGS.forEach((leg, k) => {
    for (let y = Math.ceil(leg.pivot[1]); y < H; y++) for (let x = 0; x < W; x++) if (label[y * W + x] === k) body[(y * W + x) * 4 + 3] *= 1 - smooth(leg.pivot[1], leg.pivot[1] + CAP, y);
  });
  const layers = { far: [], near: [] };
  LEGS.forEach((leg, k) => {
    const p = g.legs[leg.id];
    const w = 2 * Math.PI * (t - p.phase);
    const angle = p.c + p.A * Math.cos(w);
    const lift = Math.max(0, -Math.sin(w)); // > 0 while the leg swings forward
    const mask = (x, y) => {
      const xi = Math.round(x - 0.5), yi = Math.round(y - 0.5);
      if (xi < 0 || yi < 0 || xi >= W || yi >= H || label[yi * W + xi] !== k) return 0;
      return smooth(leg.pivot[1], leg.pivot[1] + CAP, y);
    };
    const layer = transform(base, { pivot: leg.pivot, angle: angle - leg.rest, sy: 1 - g.lift * lift, mask });
    (leg.far ? layers.far : layers.near).push({ leg, layer });
  });
  let img = blank();
  for (const { layer } of layers.far) over(img, layer);
  over(img, body);
  for (const { layer } of layers.near) over(img, layer);
  // a little pitch makes the run read as a gallop
  if (g.pitch) img = transform(img, { pivot: [170, 190], angle: g.pitch * Math.sin(2 * Math.PI * t) });
  // plant the lowest paw on the ground: this gives the natural up-and-down of the body
  return transform(img, { shift: [0, GROUND - bottomRow(img)] });
}

function withShadow(img, rxScale = 1, strength = 0.28) {
  const [x0, x1] = bbox(img);
  const out = shadow((x0 + x1) / 2, (x1 - x0) * 0.3 * rxScale, strength);
  return over(out, img);
}

const WALK = {
  lift: 0.1,
  legs: {
    'front-near': { c: 5, A: 20, phase: 0 },
    'front-far': { c: 5, A: 20, phase: 0.5 },
    'hind-far': { c: -2, A: 14, phase: 0.08 },
    'hind-near': { c: -2, A: 14, phase: 0.58 },
  },
};
// rotary gallop: the two fronts land close together, then the two hinds
const RUN = {
  lift: 0.16,
  pitch: 3,
  legs: {
    'front-near': { c: 6, A: 32, phase: 0 },
    'front-far': { c: 6, A: 32, phase: 0.12 },
    'hind-far': { c: -4, A: 26, phase: 0.5 },
    'hind-near': { c: -4, A: 26, phase: 0.62 },
  },
};

// ---------- build ----------

mkdirSync(OUT, { recursive: true });
const walkBase = stripShadow(await load('walk-2.webp'));
const leap = stripShadow(await load('happy-1.webp'));
const stand = stripShadow(await load('idle-1.webp'));

const WALK_FRAMES = 8, RUN_FRAMES = 6;
for (let i = 0; i < WALK_FRAMES; i++) await save(withShadow(gaitFrame(walkBase, i / WALK_FRAMES, WALK)), `walk-${i + 1}.webp`);
for (let i = 0; i < RUN_FRAMES; i++) await save(withShadow(gaitFrame(walkBase, i / RUN_FRAMES, RUN)), `run-${i + 1}.webp`);

// jump: crouch, leap up (nose up), hang, come down (nose down), land
const footPivot = (img) => { const [x0, x1] = bbox(img); return [(x0 + x1) / 2, bottomRow(img)]; };
function crouch(img, s) {
  const pivot = footPivot(img);
  const out = transform(img, { pivot, sx: 1 + (1 - s) * 0.4, sy: s });
  return withShadow(transform(out, { shift: [0, GROUND - bottomRow(out)] }));
}
function air(img, height, tilt) {
  const t = transform(img, { pivot: [160, 180], angle: tilt });
  const placed = transform(t, { shift: [0, GROUND - height - bottomRow(t)] });
  const k = Math.max(0.45, 1 - height / 110);
  const [x0, x1] = bbox(stand);
  return over(shadow((x0 + x1) / 2, (x1 - x0) * 0.3 * k, 0.28 * k), placed);
}
const JUMP = [
  crouch(stand, 0.95),
  crouch(stand, 0.88),
  air(leap, 12, 6),
  air(leap, 38, 4),
  air(leap, 56, 1),
  air(leap, 62, 0),
  air(leap, 56, -2),
  air(leap, 38, -4),
  air(leap, 12, -6),
  crouch(stand, 0.9),
  crouch(stand, 0.97),
];
for (const [i, f] of JUMP.entries()) await save(f, `jump-${i + 1}.webp`);

for (const f of ['idle-1', 'idle-2', 'idle-3', 'sit-1', 'sit-2', 'sleep-1', 'alert-1', 'happy-1']) copyFileSync(join(SRC, `${f}.webp`), join(OUT, `${f}.webp`));

const manifest = JSON.parse(readFileSync(join(SRC, 'buddy.json'), 'utf8'));
const frames = (prefix, n) => Array.from({ length: n }, (_, i) => `${prefix}-${i + 1}.webp`);
manifest.name = 'Bailey 2';
manifest.animations.walk = { frames: frames('walk', WALK_FRAMES), fps: 10 };
manifest.animations.run = { frames: frames('run', RUN_FRAMES), fps: 14 };
manifest.animations.trick = { frames: frames('jump', JUMP.length), fps: 12 };
manifest.doubleClick = { animation: 'trick', seconds: (JUMP.length / 12) * 3, say: 'Woof!', effect: { type: 'confetti' } };
writeFileSync(join(OUT, 'buddy.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`wrote ${OUT}`);
