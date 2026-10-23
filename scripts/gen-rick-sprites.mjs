// "Rick MTV": a boxer in a pixel-art caricature style, built from ONE source picture
// (scripts/source/rick-mtv.webp, transparent background).
//
// The picture stays exactly as drawn: head, face, shirt and shorts never move, tilt or squash.
// Only the legs (cut out below the shorts and hinged at the hip) and the gloves move. The legs get
// a hidden thigh under the shorts, so a leg raised high still joins the hip. Double-click does a
// high kick.
//
// The figure faces the camera and has writing on its shirt, so the pack sets `flip: false`: it is
// never mirrored and shuffles sideways like a boxer.
//
// Run: node scripts/gen-rick-sprites.mjs        (needs `npm install` for sharp)
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'scripts', 'source', 'rick-mtv.webp');
const OUT = join(ROOT, 'buddies', 'rick-mtv');
const N = 1408; // source canvas
const GROUND_Y = 1353; // soles of the feet in the source

// Output frame: a fixed window on the source, wide enough on the right for the kick.
const VIEW = { x: 80, y: -97, w: 1400, h: 1477 };
const FW = 364, FH = 384;
const FEET = Math.round(FH - ((GROUND_Y - VIEW.y) * FH) / VIEW.h); // px from frame bottom to the soles

// ---- cut lines (source pixel coordinates) --------------------------------------------
// The shorts: everything inside stays with the body. Below them are the legs.
const SHORTS = [[520, 640], [805, 640], [818, 700], [884, 832], [884, 852], [806, 876], [738, 924], [688, 924], [650, 852], [604, 918], [548, 910], [424, 834], [424, 806], [515, 660]];
const LEG_TOP = 780;
const LEGS = {
  // thigh: how far the hidden thigh reaches up under the shorts from the hem. The standing leg only
  // needs a little; the kicking leg needs it all the way up to a rounded hip.
  legL: { x0: 240, x1: 650, pivot: [512, 846], ankle: [440, 1210], thigh: 40 },
  legR: { x0: 650, x1: 1160, pivot: [788, 852], ankle: [960, 1265], thigh: Infinity },
};
const ARMS = {
  armL: { poly: [[372, 268], [618, 268], [622, 392], [566, 424], [548, 476], [536, 600], [372, 600]], pivot: [450, 560] },
  armR: { poly: [[760, 250], [960, 250], [985, 470], [985, 600], [820, 600], [812, 470], [790, 400], [760, 330]], pivot: [900, 560] },
};
const SHIRT = [11, 20, 20]; // fills what a glove hid, so moving a glove never shows a hole

function inPoly(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

async function buildParts() {
  const { data: src } = await sharp(SRC).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  const skinLike = (i) => src[i] > src[i + 1] + 14 && src[i] > src[i + 2] + 30 && src[i] + src[i + 1] + src[i + 2] > 150;
  const parts = { body: Buffer.from(src), legL: Buffer.alloc(N * N * 4), legR: Buffer.alloc(N * N * 4), armL: Buffer.alloc(N * N * 4), armR: Buffer.alloc(N * N * 4) };
  const copy = (dst, i) => { dst[i] = src[i]; dst[i + 1] = src[i + 1]; dst[i + 2] = src[i + 2]; dst[i + 3] = src[i + 3]; };

  // legs: below LEG_TOP and outside the shorts (skin that shows through the shorts' outline counts as leg)
  for (let y = LEG_TOP; y < N; y++) for (let x = 0; x < N; x++) {
    const i = (y * N + x) * 4;
    if (!src[i + 3]) continue;
    if (inPoly(SHORTS, x + 0.5, y + 0.5) && !(y > 820 && skinLike(i))) continue;
    const leg = x < LEGS.legL.x1 ? parts.legL : parts.legR;
    copy(leg, i);
    parts.body[i + 3] = 0;
  }
  // a hidden thigh: carry the leg up under the shorts to above the hip, so a raised leg still meets
  // the body. It is extended along the leg's own axis (hip to ankle), not straight up: a vertical
  // extension on a slanted leg reads as a second, backwards bend once the leg swings high.
  for (const [name, L] of Object.entries(LEGS)) {
    const leg = parts[name];
    const [px, py] = L.pivot;
    const len = Math.hypot(L.ankle[0] - px, L.ankle[1] - py);
    const ux = (L.ankle[0] - px) / len, uy = (L.ankle[1] - py) / len;
    const at = (u, v) => [Math.round(px + u * ux - v * uy), Math.round(py + u * uy + v * ux)];
    const idx = ([x, y]) => (x >= 0 && x < N && y >= 0 && y < N ? (y * N + x) * 4 : -1);
    // per line along the axis (v, half-pixel steps): where the leg comes out of the shorts, and a
    // skin colour from solid thigh below the hem's shadow, smoothed across lines so it shades evenly
    const V = 150, lines = [];
    for (let v = -V; v <= V; v += 0.5) {
      let top = -1;
      for (let u = 0; u < 400; u += 0.5) { const i = idx(at(u, v)); if (i >= 0 && leg[i + 3]) { top = u; break; } }
      const [tx, ty] = top < 0 ? [0, 0] : at(top - 2, v);
      if (top < 0 || !inPoly(SHORTS, tx + 0.5, ty + 0.5)) { lines.push(null); continue; } // only where the leg disappears into the shorts
      const c = [0, 0, 0]; let n = 0;
      for (let k = 18; k < 40; k++) { const i = idx(at(top + k, v)); if (i >= 0 && leg[i + 3] === 255 && skinLike(i)) { c[0] += src[i]; c[1] += src[i + 1]; c[2] += src[i + 2]; n++; } }
      lines.push(n ? { top, c: c.map((t) => t / n) } : null);
    }
    const smooth = lines.map((l, j) => {
      if (!l) return null;
      const c = [0, 0, 0]; let n = 0;
      for (let d = -12; d <= 12; d++) { const m = lines[j + d]; if (m) { c[0] += m.c[0]; c[1] += m.c[1]; c[2] += m.c[2]; n++; } }
      return { top: l.top, c: c.map((t) => Math.round(t / n)) };
    });
    // fill (inverse-mapped, so no gaps) from the hip down past the hem's shadow band. Above the
    // hip the thigh ends in a rounded cap, so when it swings out it reads as a hip, not a cut-off tube.
    const used = smooth.flatMap((l, j) => (l ? [j / 2 - V] : []));
    const vc = (used[0] + used[used.length - 1]) / 2, R = (used[used.length - 1] - used[0]) / 2;
    for (let y = py - 120; y < py + 160; y++) for (let x = px - 220; x < px + 220; x++) {
      const dx = x - px, dy = y - py, u = dx * ux + dy * uy, v = -dx * uy + dy * ux;
      const l = smooth[Math.round((v + V) * 2)];
      if (!l || u >= l.top + 12 || u < l.top - L.thigh) continue;
      if (u < 0 && u < -0.6 * Math.sqrt(Math.max(0, R * R - (v - vc) ** 2))) continue;
      const i = (y * N + x) * 4;
      leg[i] = l.c[0]; leg[i + 1] = l.c[1]; leg[i + 2] = l.c[2]; leg[i + 3] = 255;
    }
  }
  // arms: glove and forearm. What sits behind a glove (shoulder, chin) is filled with shirt colour.
  for (const [name, A] of Object.entries(ARMS)) {
    for (let y = 0; y < 640; y++) for (let x = 0; x < N; x++) {
      if (!inPoly(A.poly, x + 0.5, y + 0.5)) continue;
      const i = (y * N + x) * 4;
      if (!src[i + 3]) continue;
      if (y < 430 && skinLike(i)) continue; // the face next to a glove stays with the body
      copy(parts[name], i);
      const behindShirt = name === 'armL' ? x >= 525 && y > 380 : x <= 812 && y > 360;
      if (behindShirt) { parts.body[i] = SHIRT[0]; parts.body[i + 1] = SHIRT[1]; parts.body[i + 2] = SHIRT[2]; }
      else parts.body[i + 3] = 0;
    }
  }
  const uri = async (buf) => 'data:image/png;base64,' + (await sharp(buf, { raw: { width: N, height: N, channels: 4 } }).png().toBuffer()).toString('base64');
  return Object.fromEntries(await Promise.all(Object.entries(parts).map(async ([k, v]) => [k, await uri(v)])));
}

// ---- posing ----------------------------------------------------------------------------

const T = ({ dx = 0, dy = 0, rot = 0, sx = 1, sy = 1 } = {}, [qx, qy]) =>
  `translate(${dx} ${dy}) translate(${qx} ${qy}) rotate(${rot}) scale(${sx} ${sy}) translate(${-qx} ${-qy})`;

const mark = (text, x, y, size, fill) => `<text x="${x}" y="${y}" font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="${size}" fill="${fill}" stroke="#fff" stroke-width="10" paint-order="stroke" text-anchor="middle">${text}</text>`;

// closed eyelids drawn over the eyes in the picture's own skin tone and outline colour
const EYES_CLOSED = `
  <ellipse cx="664" cy="221" rx="40" ry="20" fill="#EC8A2C"/><ellipse cx="746" cy="231" rx="33" ry="18" fill="#E7852A"/>
  <path d="M 628 222 Q 664 242 700 222" fill="none" stroke="#3A2006" stroke-width="7" stroke-linecap="round"/>
  <path d="M 716 232 Q 746 250 776 231" fill="none" stroke="#3A2006" stroke-width="7" stroke-linecap="round"/>`;

/**
 * pose: legL/legR {rot, sy} about the hip (sy < 1 lifts the foot), armL/armR {dx, dy, rot, s},
 * lean (degrees, the whole upper body about the hips, kept small), lift (whole figure up, px),
 * eyes ('closed'), extra (svg on top, frame coordinates of the source).
 */
function frame(parts, pose = {}) {
  const { legL = {}, legR = {}, armL = {}, armR = {}, lean = 0, lift = 0, eyes = 'open', extra = '' } = pose;
  const leg = (name, o) => `<g transform="${T({ rot: o.rot ?? 0, sy: o.sy ?? 1 }, LEGS[name].pivot)}"><image href="${parts[name]}" width="${N}" height="${N}"/></g>`;
  const arm = (name, o) => `<g transform="${T({ dx: o.dx, dy: o.dy, rot: o.rot, sx: o.s ?? 1, sy: o.s ?? 1 }, ARMS[name].pivot)}"><image href="${parts[name]}" width="${N}" height="${N}"/></g>`;
  // the leg that is drawn in front: a raised leg goes behind the other one
  const legs = (legR.rot ?? 0) < -20 ? leg('legR', legR) + leg('legL', legL) : leg('legL', legL) + leg('legR', legR);
  const upper = `<g transform="${T({ rot: lean }, [650, 860])}"><image href="${parts.body}" width="${N}" height="${N}"/>${eyes === 'closed' ? EYES_CLOSED : ''}${arm('armL', armL)}${arm('armR', armR)}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${FW * 2}" height="${FH * 2}" viewBox="${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}">` +
    `<g transform="translate(0 ${-lift})">${legs}${upper}</g>${extra}</svg>`;
}

function buildPoses() {
  const P = {};
  // idle: the picture itself, gloves breathing a little
  P.idle = [0, 6, 10, 6].map((d, k) => ({ armL: { dy: -d }, armR: { dy: -[6, 10, 6, 0][k] } }));
  // walk: a boxer's sideways shuffle. One foot at a time lifts (hip turns it out, leg shortens).
  P.walk = [0, 1, 2, 3, 4, 5].map((k) => {
    const s = Math.sin((k * Math.PI) / 3);
    const l = Math.max(0, s), r = Math.max(0, -s);
    return {
      legL: { rot: 7 * l, sy: 1 - 0.07 * l },
      legR: { rot: -7 * r, sy: 1 - 0.07 * r },
      armL: { dy: -8 * r }, armR: { dy: -8 * l },
    };
  });
  // sit / sleep: guard down
  P.sit = [0, 1].map((k) => ({ armL: { dy: 60 + 4 * k, rot: -6 }, armR: { dy: 60 + 4 * k, rot: 6 } }));
  P.sleep = [0, 1].map((k) => ({
    armL: { dy: 70, rot: -8 }, armR: { dy: 70, rot: 8 }, eyes: 'closed',
    extra: mark('z', 1060, 330 - k * 20, 130, '#5B8DEF') + mark('Z', 1160, 200 - k * 30, 190, '#5B8DEF'),
  }));
  // point: a jab straight at the camera (a glove that grows toward the viewer)
  P.point = [
    { armR: { s: 1.3, dx: -40, dy: -40 } },
    { armL: { s: 1.3, dx: 40, dy: -40 } },
  ];
  P.alert = [0, 1].map((k) => ({ armL: { dy: -20 - 6 * k }, armR: { dy: -26 + 6 * k }, extra: mark('!', 1080 + k * 10, 250, 300, '#E63946') }));
  // happy: a hop, knees tucked
  P.happy = [
    { lift: 0 },
    { lift: 70, legL: { rot: 8, sy: 0.9 }, legR: { rot: -8, sy: 0.9 }, armL: { dy: -40 }, armR: { dy: -40 } },
    { lift: 100, legL: { rot: 10, sy: 0.88 }, legR: { rot: -10, sy: 0.88 }, armL: { dy: -50 }, armR: { dy: -50 } },
    { lift: 40, legL: { rot: 4 }, legR: { rot: -4 }, armL: { dy: -20 }, armR: { dy: -20 } },
  ];
  // drag: dangling, legs swinging
  P.drag = [0, 1].map((k) => ({ lift: 20, legL: { rot: [10, -4][k] }, legR: { rot: [4, -10][k] }, armL: { dy: 10 }, armR: { dy: 10 } }));
  // trick: the high kick. The picture shows the leg from the front, where a knee cannot bend, so the
  // leg swings up straight from the hip to the side, to shoulder height, and back to guard.
  // (he leans away from the kick like a real side kick, the guard stays up, the right glove drops
  // to guard the ribs)
  const kick = (rot, lean, extra = '') => ({ legR: { rot }, lean, armL: { dy: -12 }, armR: { dy: 24, rot: 10 }, extra });
  const HIYA = mark('HI-YA!', 1280, 260, 110, '#E63946');
  P.trick = [
    { armL: { dy: -8 }, armR: { dy: -8 } },
    kick(-28, -3),
    kick(-62, -8),
    kick(-88, -12),
    kick(-100, -14, HIYA),
    kick(-100, -14, HIYA),
    kick(-70, -9),
    kick(-34, -4),
    { armL: { dy: -8 }, armR: { dy: -8 } },
  ];
  return P;
}

/** Soft ground shadow; `k` shrinks it while he is in the air. */
function shadowSvg(k = 1) {
  const cx = ((700 - VIEW.x) * FW) / VIEW.w, cy = FH - FEET, rx = 82 * k, ry = 6 * k;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${FW}" height="${FH}"><defs><filter id="b"><feGaussianBlur stdDeviation="3"/></filter></defs><ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#000" fill-opacity="${0.28 * k}" filter="url(#b)"/></svg>`);
}

// ---- main ------------------------------------------------------------------------------

const parts = await buildParts();
const poses = buildPoses();
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const FPS = { idle: 3, walk: 8, sit: 2, sleep: 1.5, point: 4, alert: 6, happy: 8, drag: 4, trick: 7 };
const animations = {};
for (const [anim, list] of Object.entries(poses)) {
  animations[anim] = { frames: [], fps: FPS[anim] };
  for (let i = 0; i < list.length; i++) {
    const sprite = await sharp(Buffer.from(frame(parts, list[i]))).resize(FW, FH, { kernel: 'lanczos3' }).png().toBuffer();
    const name = `${anim}-${i + 1}.webp`;
    await sharp({ create: { width: FW, height: FH, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: shadowSvg(Math.max(0.5, 1 - (list[i].lift ?? 0) / 200)) }, { input: sprite }])
      .webp({ quality: 90, alphaQuality: 100 })
      .toFile(join(OUT, name));
    animations[anim].frames.push(name);
  }
}
animations.trick.loop = false;
const manifest = {
  frameWidth: FW,
  frameHeight: FH,
  scale: 0.53,
  feetOffset: FEET,
  name: 'Rick MTV',
  facing: 'right',
  flip: false,
  petLines: ['Fight and fit!', '*bounces on his toes*', 'Jab, jab, cross!', 'Hit the gym!', 'MTV all day.', '*cracks knuckles*'],
  doubleClick: { animation: 'trick', seconds: animations.trick.frames.length / FPS.trick + 0.4, say: 'Hi-ya!', effect: { type: 'confetti' } },
  animations,
};
writeFileSync(join(OUT, 'buddy.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`wrote ${OUT}`);
