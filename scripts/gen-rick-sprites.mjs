// "Rick MTV": a boxer in a pixel-art caricature style, built from ONE source picture
// (scripts/source/rick-mtv.webp, transparent background). The picture is cut into parts (head,
// two gloved arms, upper body, two legs) which are moved, rotated and squashed to make the
// animation frames, then packed with scripts/photo-pack.mjs.
//
// The figure faces the camera and has writing on its shirt, so the pack sets `flip: false`: it is
// never mirrored. Walking and running are a separate side-view drawing (`animFlip`), which is
// mirrored to follow the direction of travel.
//
// Run: node scripts/gen-rick-sprites.mjs        (needs `npm install` for sharp)
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import sharp from 'sharp';
import { run } from './photo-pack.mjs';
import { renderRickSide, GRID } from './lib/rick-side.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'scripts', 'source', 'rick-mtv.webp');
const N = 1408; // source canvas

// ---- cut lines (source pixel coordinates) --------------------------------------------
const POLYS = {
  head: [[540, 25], [820, 25], [820, 255], [790, 282], [785, 340], [745, 375], [640, 378], [600, 345], [598, 292], [548, 282]],
  armL: [[372, 268], [618, 268], [622, 392], [566, 424], [548, 476], [536, 600], [372, 600]],
  armR: [[760, 250], [960, 250], [985, 470], [985, 600], [820, 600], [812, 470], [790, 400], [760, 330]],
  legL: [[300, 785], [650, 785], [650, 1400], [300, 1400]],
  legR: [[650, 785], [1100, 785], [1100, 1400], [650, 1400]],
  upper: [[0, 0], [N, 0], [N, 835], [0, 835]],
};
// Pivots: where each part hinges.
const PIV = { base: [650, 835], head: [700, 372], armL: [540, 430], armR: [800, 440], legL: [520, 835], legR: [780, 840], ground: [700, 1353] };
const SHIRT = [11, 20, 20]; // fills what a glove hid, so moving a glove never shows a hole
const GROUND_Y = 1353;
const PAD = 200; // room above the source picture for hops

async function maskOf(poly) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${N}" height="${N}"><rect width="${N}" height="${N}" fill="#000"/><polygon points="${poly.map((p) => p.join(',')).join(' ')}" fill="#fff"/></svg>`;
  const { data } = await sharp(Buffer.from(svg)).greyscale().raw().toBuffer({ resolveWithObject: true });
  return data;
}

async function buildParts() {
  const { data: src } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const M = Object.fromEntries(await Promise.all(Object.entries(POLYS).map(async ([k, p]) => [k, await maskOf(p)])));
  // Cut regions overlap where a glove touches the face. Keep only what belongs to the part:
  // gloves and sleeves are neutral dark or teal/white, faces and forearms are orange-brown.
  const skinLike = (i) => src[i] > src[i + 1] + 14 && src[i] > src[i + 2] + 30 && src[i] + src[i + 1] + src[i + 2] > 150;
  const neutralDark = (i) => Math.abs(src[i] - src[i + 1]) < 18 && Math.abs(src[i + 1] - src[i + 2]) < 22 && src[i] + src[i + 1] + src[i + 2] < 360;
  const cut = (masks, drop) => {
    const out = Buffer.alloc(N * N * 4);
    for (let p = 0; p < N * N; p++) {
      if (!masks.every((m) => m[p] > 127)) continue;
      const i = p * 4;
      if (drop && drop(i, p % N, (p / N) | 0)) continue;
      out[i] = src[i]; out[i + 1] = src[i + 1]; out[i + 2] = src[i + 2]; out[i + 3] = src[i + 3];
    }
    return out;
  };
  const png = (buf) => sharp(buf, { raw: { width: N, height: N, channels: 4 } }).png().toBuffer();

  // The upper body keeps everything above the hips, but the head and arms are cut out of it. What
  // sits behind a glove (shoulder, chin) is filled with shirt colour so a moving glove shows no hole.
  const base = cut([M.upper]);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const p = y * N + x, i = p * 4;
    if (M.head[p] > 127) { base[i + 3] = 0; if (y > 345 && x > 625 && x < 775) { base[i] = SHIRT[0]; base[i + 1] = SHIRT[1]; base[i + 2] = SHIRT[2]; base[i + 3] = 255; } }
    else if (M.armL[p] > 127 && base[i + 3]) { if (x >= 525 && y > 380) { base[i] = SHIRT[0]; base[i + 1] = SHIRT[1]; base[i + 2] = SHIRT[2]; } else base[i + 3] = 0; }
    else if (M.armR[p] > 127 && base[i + 3]) { if (x <= 812 && y > 360) { base[i] = SHIRT[0]; base[i + 1] = SHIRT[1]; base[i + 2] = SHIRT[2]; } else base[i + 3] = 0; }
  }
  const b64 = async (buf) => 'data:image/png;base64,' + (await png(buf)).toString('base64');
  return {
    base: await b64(base),
    head: await b64(cut([M.head], (i, x, y) => y > 285 && (x < 616 || x > 772) && neutralDark(i))),
    armL: await b64(cut([M.armL], (i, x, y) => y < 430 && skinLike(i))),
    armR: await b64(cut([M.armR], (i, x, y) => y < 430 && skinLike(i))),
    legL: await b64(cut([M.legL])),
    legR: await b64(cut([M.legR])),
  };
}

// ---- posing ----------------------------------------------------------------------------

const T = ({ dx = 0, dy = 0, rot = 0, sx = 1, sy = 1 } = {}, [px, py], pivot) => {
  const [qx, qy] = pivot ?? [px, py];
  return `translate(${dx} ${dy}) translate(${qx} ${qy}) rotate(${rot}) scale(${sx} ${sy}) translate(${-qx} ${-qy})`;
};

const EYES_CLOSED = `
  <ellipse cx="663" cy="219" rx="29" ry="15" fill="#F08C28"/><ellipse cx="746" cy="231" rx="23" ry="14" fill="#E98320"/>
  <path d="M 636 218 Q 663 236 690 219" fill="none" stroke="#4A2A08" stroke-width="6" stroke-linecap="round"/>
  <path d="M 726 231 Q 746 246 766 230" fill="none" stroke="#4A2A08" stroke-width="6" stroke-linecap="round"/>`;

const mark = (text, x, y, size, fill) => `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="${size}" fill="${fill}" stroke="#fff" stroke-width="10" paint-order="stroke" text-anchor="middle">${text}</text>`;

/**
 * pose: base{dx,dy,rot}, head, armL, armR (relative to the upper body), legL, legR (own hinge),
 * legSy (squash about the ground), g (whole figure about the ground), eyes ('closed'), extra (svg).
 */
function frame(parts, pose = {}) {
  const { base = {}, head = {}, armL = {}, armR = {}, legL = {}, legR = {}, legSy = 1, g = {}, eyes = 'open', extra = '' } = pose;
  const leg = (name, o, hinge) => {
    // A squashed leg scales about its own foot on the ground; its hinge rotation comes first.
    const pivotGround = [hinge[0], GROUND_Y];
    return `<g transform="${T({ ...o, sy: o.sy ?? 1 }, hinge)}"><g transform="${T({ sy: legSy }, pivotGround)}"><image href="${parts[name]}" width="${N}" height="${N}"/></g></g>`;
  };
  const upper =
    `<g transform="${T(base, PIV.base)}">` +
    `<image href="${parts.base}" width="${N}" height="${N}"/>` +
    `<g transform="${T(head, PIV.head)}"><image href="${parts.head}" width="${N}" height="${N}"/>${eyes === 'closed' ? EYES_CLOSED : ''}</g>` +
    `<g transform="${T(armL, PIV.armL)}"><image href="${parts.armL}" width="${N}" height="${N}"/></g>` +
    `<g transform="${T(armR, PIV.armR)}"><image href="${parts.armR}" width="${N}" height="${N}"/></g>` +
    `</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${N}" height="${N + PAD}" viewBox="0 ${-PAD} ${N} ${N + PAD}">` +
    `<g transform="${T(g, PIV.ground)}">${leg('legL', legL, PIV.legL)}${leg('legR', legR, PIV.legR)}${upper}</g>${extra}</svg>`;
}

/** Squash legs to `c` of their height: hips drop, so the upper body follows. */
const crouch = (c) => ({ legSy: c, dy: (1 - c) * (GROUND_Y - 835) });

function buildPoses() {
  const P = {};
  // idle: breathing in the guard, one blink
  P.idle = [0, 1, 2, 3].map((k) => ({
    base: { dy: [0, 10, 16, 6][k], rot: [0, 0.6, 0, -0.6][k] },
    head: { dy: [0, 3, 4, 1][k] },
    armL: { rot: [0, -1.5, -2, -1][k] },
    armR: { rot: [0, 1.5, 2, 1][k] },
    eyes: k === 2 ? 'closed' : 'open',
  }));
  const c1 = crouch(0.78);
  P.sit = [0, 1].map((k) => ({ legSy: c1.legSy, base: { dy: c1.dy + [0, 6][k] }, head: { dy: 8, rot: [3, 5][k] }, armL: { dy: 20, rot: -4 }, armR: { dy: 20, rot: 4 } }));
  const c2 = crouch(0.66);
  P.sleep = [0, 1].map((k) => ({
    legSy: c2.legSy, base: { dy: c2.dy + [0, 8][k], rot: 6 },
    head: { dy: 22, rot: 22 + k * 2 },
    armL: { dy: 50, rot: 12 }, armR: { dy: 50, rot: -12 },
    eyes: 'closed',
    extra: mark('z', 1010, 330 - k * 20, 130, '#5B8DEF') + mark('Z', 1110, 200 - k * 30, 190, '#5B8DEF'),
  }));
  P.watch = [0, 1].map((k) => ({ base: { dx: 20, rot: 3 }, head: { dx: [15, 18][k], rot: [7, 9][k] }, armL: { rot: 2 }, armR: { rot: -2 } }));
  // point: a jab straight at the camera (a glove that grows toward the viewer)
  P.point = [
    { base: { rot: 2 }, armR: { sx: 1.32, sy: 1.32, dx: 30, dy: -30 } },
    { base: { rot: -2 }, armL: { sx: 1.32, sy: 1.32, dx: -30, dy: -30 } },
  ];
  P.alert = [0, 1].map((k) => ({
    g: { dy: [-26, -36][k] },
    head: { rot: [3, -3][k] }, armL: { dy: -25, rot: [8, -8][k] }, armR: { dy: -25, rot: [-8, 8][k] },
    extra: mark('!', 1040 + k * 10, 250, 300, '#E63946'),
  }));
  const c3 = crouch(0.9);
  P.happy = [
    { legSy: c3.legSy, base: { dy: c3.dy }, armL: { dy: 10 }, armR: { dy: 10 } },
    { g: { dy: -85 }, legL: { rot: 6 }, legR: { rot: -6 }, armL: { dy: -70, rot: -6 }, armR: { dy: -70, rot: 6 }, head: { rot: -3 } },
    { base: { dy: 30 }, armL: { dy: -30 }, armR: { dy: -30 } },
  ];
  // drag: dangling in mid-air
  P.drag = [0, 1].map((k) => ({
    g: { rot: [5, -5][k] }, legL: { rot: [10, -8][k] }, legR: { rot: [-10, 8][k] },
    armL: { dy: 50, rot: -10 }, armR: { dy: 50, rot: 10 }, head: { rot: [-4, 4][k] },
  }));
  // trick: shadow boxing, jab / bounce / jab / hop
  P.trick = [
    { base: { rot: 5 }, head: { rot: -2 }, armL: { sx: 1.4, sy: 1.4, dx: -20, dy: -40 } },
    { base: { dy: 14 }, head: { dy: 3 } },
    { base: { rot: -5 }, head: { rot: 2 }, armR: { sx: 1.4, sy: 1.4, dx: 20, dy: -40 } },
    { g: { dy: -40 }, armL: { dy: -30, rot: -6 }, armR: { dy: -30, rot: 6 } },
  ];
  return P;
}

// ---- main ------------------------------------------------------------------------------

const parts = await buildParts();
const poses = buildPoses();
const raw = join(tmpdir(), 'rick-mtv-raw');
rmSync(raw, { recursive: true, force: true });
mkdirSync(raw, { recursive: true });
let count = 0;
for (const [anim, list] of Object.entries(poses)) {
  for (let i = 0; i < list.length; i++) {
    const svg = frame(parts, list[i]);
    await sharp(Buffer.from(svg)).png().toFile(join(raw, `${anim}-${i + 1}.png`));
    count++;
  }
}
// Walking and running are drawn in side view (scripts/lib/rick-side.mjs). The picture is placed on
// the same canvas as the front-view frames so that size and ground line match.
const SIDE_SCALE = N / GRID;
async function sideFrame(opts) {
  const art = await renderRickSide(opts, SIDE_SCALE);
  return sharp({ create: { width: N, height: N + PAD, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: art, left: 0, top: PAD }]).png().toBuffer();
}
const WALK_N = 8;
for (let k = 0; k < WALK_N; k++) {
  writeFileSync(join(raw, `walk-${k + 1}.png`), await sideFrame({ phase: k / WALK_N }));
  writeFileSync(join(raw, `run-${k + 1}.png`), await sideFrame({ phase: k / WALK_N, swing: 38, flexMax: 85, lean: 15, rock: 2, armSwing: 14 }));
  count += 2;
}
writeFileSync(join(raw, 'buddy.meta.json'), JSON.stringify({
  name: 'Rick MTV',
  facing: 'right',
  flip: false,
  animFlip: { walk: true, run: true },
  petLines: ['Fight and fit!', '*bounces on his toes*', 'Jab, jab, cross!', 'Hit the gym!', 'MTV all day.', '*cracks knuckles*'],
  doubleClick: { animation: 'trick', seconds: 3.2, say: 'Fight and fit!', effect: { type: 'confetti' } },
}, null, 2));
console.log(`rendered ${count} frames to ${raw}`);

const out = join(ROOT, 'buddies', 'rick-mtv');
const res = await run([raw, '--name', 'Rick MTV', '--id', 'rick-mtv', '--out', out, '--force', '--key', 'none', '--registered',
  '--size', '208x384', '--display', '190', '--shadow', '--erode', '0', '--format', 'webp', '--quality', '90',
  '--preview', join(raw, 'preview.png'), '--fps', 'idle=2,walk=10,run=14,trick=5,point=4']);
if (res?.errors) process.exit(1);
console.log('preview:', join(raw, 'preview.png'));
void readFileSync;
