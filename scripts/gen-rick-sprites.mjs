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
  legL: { x0: 240, x1: 650, pivot: [512, 846] },
  legR: { x0: 650, x1: 1160, pivot: [788, 852] },
};
// the right leg (the kicking one) also bends at the knee: the shin hinges here
const KNEE = { y: 990, radius: 52, pivot: [857, 990] };
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
  const parts = { body: Buffer.from(src), legL: Buffer.alloc(N * N * 4), legR: Buffer.alloc(N * N * 4), shinR: Buffer.alloc(N * N * 4), armL: Buffer.alloc(N * N * 4), armR: Buffer.alloc(N * N * 4) };
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
  // a hidden thigh: carry each leg column up under the shorts to above the hip, so a raised leg
  // still meets the body
  for (const [name, L] of Object.entries(LEGS)) {
    const leg = parts[name];
    for (let x = L.x0; x < L.x1; x++) {
      let top = -1;
      for (let y = LEG_TOP; y < N; y++) if (leg[(y * N + x) * 4 + 3]) { top = y; break; }
      if (top < 0 || !inPoly(SHORTS, x + 0.5, top - 2)) continue; // only where the leg disappears into the shorts
      const from = (Math.min(N - 1, top + 6) * N + x) * 4;
      for (let y = L.pivot[1] - 50; y < top; y++) {
        const i = (y * N + x) * 4;
        leg[i] = leg[from]; leg[i + 1] = leg[from + 1]; leg[i + 2] = leg[from + 2]; leg[i + 3] = 255;
      }
    }
  }
  // split the right leg at the knee. Both halves keep a round cap around the hinge, so a bent knee
  // shows neither a gap nor a corner.
  const nearKnee = (x, y) => Math.hypot(x - KNEE.pivot[0], y - KNEE.pivot[1]) < KNEE.radius;
  for (let y = LEG_TOP; y < N; y++) for (let x = LEGS.legR.x0; x < LEGS.legR.x1; x++) {
    const i = (y * N + x) * 4;
    if (!parts.legR[i + 3]) continue;
    if (y >= KNEE.y || nearKnee(x, y)) for (let c = 0; c < 4; c++) parts.shinR[i + c] = parts.legR[i + c];
    if (y >= KNEE.y && !nearKnee(x, y)) parts.legR[i + 3] = 0;
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
 * pose: legL/legR {rot, sy} about the hip (sy < 1 lifts the foot; legR also takes knee, the shin's bend), armL/armR {dx, dy, rot, s},
 * lean (degrees, the whole upper body about the hips, kept small), lift (whole figure up, px),
 * eyes ('closed'), extra (svg on top, frame coordinates of the source).
 */
function frame(parts, pose = {}) {
  const { legL = {}, legR = {}, armL = {}, armR = {}, lean = 0, lift = 0, eyes = 'open', extra = '' } = pose;
  const shin = (o) => `<g transform="${T({ rot: o.knee ?? 0 }, KNEE.pivot)}"><image href="${parts.shinR}" width="${N}" height="${N}"/></g>`;
  const leg = (name, o) => `<g transform="${T({ rot: o.rot ?? 0, sy: o.sy ?? 1 }, LEGS[name].pivot)}"><image href="${parts[name]}" width="${N}" height="${N}"/>${name === 'legR' ? shin(o) : ''}</g>`;
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
  // trick: the high kick. Chamber the knee, snap the leg out to the side up to head height, hold, back.
  // (he leans away from the kick, the guard stays up, the right glove drops to guard the ribs)
  const kick = (rot, knee, lean, extra = '') => ({ legR: { rot, knee }, lean, armL: { dy: -12 }, armR: { dy: 24, rot: 10 }, extra });
  const HIYA = mark('HI-YA!', 1280, 260, 110, '#E63946');
  P.trick = [
    { armL: { dy: -8 }, armR: { dy: -8 } },
    kick(-70, 90, -2),
    kick(-100, 120, -4),
    kick(-106, 45, -6),
    kick(-110, 0, -7, HIYA),
    kick(-110, 0, -7, HIYA),
    kick(-100, 120, -4),
    kick(-55, 70, -2),
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
