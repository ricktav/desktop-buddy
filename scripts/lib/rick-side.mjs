// Side-view "Rick MTV" drawn in the palette of the pixel-art picture (scripts/source/rick-mtv.webp):
// a boxer in a black MTV shirt, black shorts with green trim and black gloves, walking right with his
// guard up. Everything is drawn on a 176x176 pixel grid without anti-aliasing and then scaled up with
// nearest-neighbour, so it reads as the same kind of pixel art as the front view.
import sharp from 'sharp';

export const GRID = 176;
export const GROUND = 169; // y of the floor on the grid
const D2R = Math.PI / 180;

const C = {
  out: '#2a1507',
  skin: '#ee8a2a', skinHi: '#fba646', skinSh: '#c96a14', skinFar: '#b65f12',
  hair: '#b9772a', hairHi: '#e0a04a', hairSh: '#7a4a16',
  beard: '#8f5a26', beardSh: '#6e421a',
  shirt: '#0c1616', shirtHi: '#1d2c2c', shirtFar: '#081010',
  shorts: '#0d1a1a', shortsHi: '#1c2e2c', green: '#98ad22', greenSh: '#627414',
  glove: '#1b1b1f', gloveHi: '#55555e', gloveFar: '#121216', strap: '#2c2c33',
  teal: '#2c93a4', white: '#f4ead6', iris: '#2d7fbf', pupil: '#0a0f18',
};

const p = (n) => Number(n.toFixed(2));
const pt = (x, y) => `${p(x)} ${p(y)}`;

/** A limb segment as a thick round-capped stroke with a 1px outline. */
function seg(a, b, w, fill, outline = C.out, hi = null) {
  const d = `M ${pt(...a)} L ${pt(...b)}`;
  return `<path d="${d}" stroke="${outline}" stroke-width="${w + 2}" stroke-linecap="round" fill="none"/>` +
    `<path d="${d}" stroke="${fill}" stroke-width="${w}" stroke-linecap="round" fill="none"/>` +
    (hi ? `<path d="${d}" stroke="${hi}" stroke-width="${Math.max(1, w * 0.28)}" stroke-linecap="round" fill="none" transform="translate(${p(-w * 0.18)} ${p(-w * 0.1)})"/>` : '');
}

const polar = (o, len, deg) => [o[0] + len * Math.sin(deg * D2R), o[1] + len * Math.cos(deg * D2R)];

/** Leg joints for a given thigh angle (forward positive, from straight down) and knee flexion. */
function legFK(hip, thigh, flex, L1 = 33, L2 = 32) {
  const knee = polar(hip, L1, thigh);
  const ankle = polar(knee, L2, thigh - flex);
  return { hip, knee, ankle };
}

function foot(ankle, angle, far) {
  // A bare foot: heel at the ankle, toes forward; `angle` > 0 points the toes down.
  const col = far ? C.skinFar : C.skin;
  const toe = [ankle[0] + 13 * Math.cos(angle * D2R), ankle[1] + 3 + 13 * Math.sin(angle * D2R)];
  const heel = [ankle[0] - 3, ankle[1] + 2];
  const d = `M ${pt(heel[0], heel[1] - 4)} L ${pt(ankle[0] + 3, ankle[1] - 3)} L ${pt(toe[0] - 2, toe[1] - 4)} Q ${pt(toe[0] + 3, toe[1] - 2)} ${pt(toe[0] + 1, toe[1] + 1)} L ${pt(heel[0] + 1, heel[1] + 2)} Q ${pt(heel[0] - 3, heel[1] + 1)} ${pt(heel[0], heel[1] - 4)} Z`;
  return `<path d="${d}" fill="${col}" stroke="${C.out}" stroke-width="1.4" stroke-linejoin="round"/>` +
    `<path d="M ${pt(toe[0] - 1, toe[1] - 2.5)} l 0 2 M ${pt(toe[0] - 4, toe[1] - 2.8)} l 0 2" stroke="${C.out}" stroke-width="0.8" fill="none"/>`;
}

function glove(c, far, r = 8.5) {
  const f = far ? C.gloveFar : C.glove;
  return `<ellipse cx="${p(c[0])}" cy="${p(c[1])}" rx="${r}" ry="${r + 0.8}" fill="${f}" stroke="${C.out}" stroke-width="1.4"/>` +
    `<ellipse cx="${p(c[0] + 2)}" cy="${p(c[1] - 3)}" rx="${r * 0.42}" ry="${r * 0.3}" fill="${far ? C.glove : C.gloveHi}" opacity="0.9"/>` +
    // cuff strap
    `<rect x="${p(c[0] - r - 1)}" y="${p(c[1] + r - 3)}" width="${p(r * 1.2)}" height="5" rx="1.5" fill="${C.strap}" stroke="${C.out}" stroke-width="1" transform="rotate(-18 ${p(c[0])} ${p(c[1] + r)})"/>`;
}

function headDraw(hx, hy, { eye = 'open', mouth = 'smirk', tilt = 0, hairLift = 0 } = {}) {
  const outline = `stroke="${C.out}" stroke-width="1.4" stroke-linejoin="round"`;
  const eyeSvg = eye === 'closed'
    ? `<path d="M ${pt(hx + 3, hy - 3)} q 4 3 8 0" stroke="${C.out}" stroke-width="1.6" fill="none"/>`
    : `<ellipse cx="${p(hx + 7)}" cy="${p(hy - 3)}" rx="4.2" ry="3.2" fill="${C.white}" stroke="${C.out}" stroke-width="0.9"/>` +
      `<circle cx="${p(hx + 8.6)}" cy="${p(hy - 3)}" r="2.5" fill="${C.iris}"/><circle cx="${p(hx + 9)}" cy="${p(hy - 3)}" r="1.3" fill="${C.pupil}"/>` +
      `<rect x="${p(hx + 9.2)}" y="${p(hy - 4.2)}" width="1" height="1" fill="#fff"/>`;
  const mouthSvg = mouth === 'open'
    ? `<ellipse cx="${p(hx + 10)}" cy="${p(hy + 10.5)}" rx="3" ry="2.2" fill="#5a1f1a" stroke="${C.out}" stroke-width="0.9"/>`
    : `<path d="M ${pt(hx + 6, hy + 10.5)} q 4 1.6 8 -1" stroke="${C.out}" stroke-width="1.3" fill="none" stroke-linecap="round"/>`;
  return `<g transform="rotate(${tilt} ${p(hx)} ${p(hy + 10)})">` +
    // neck
    `<path d="M ${pt(hx - 8, hy + 12)} L ${pt(hx - 7, hy + 24)} L ${pt(hx + 5, hy + 24)} L ${pt(hx + 6, hy + 12)} Z" fill="${C.skinSh}" ${outline}/>` +
    // skull and face (profile, facing right)
    `<path d="M ${pt(hx - 15, hy - 2)} C ${pt(hx - 16, hy - 14)} ${pt(hx - 6, hy - 20)} ${pt(hx + 4, hy - 19)} C ${pt(hx + 12, hy - 18)} ${pt(hx + 15, hy - 11)} ${pt(hx + 15, hy - 5)} ` +
    `L ${pt(hx + 20, hy + 3)} L ${pt(hx + 15, hy + 5)} L ${pt(hx + 16, hy + 11)} C ${pt(hx + 15, hy + 18)} ${pt(hx + 8, hy + 22)} ${pt(hx - 1, hy + 21)} C ${pt(hx - 11, hy + 20)} ${pt(hx - 15, hy + 12)} ${pt(hx - 15, hy - 2)} Z" fill="${C.skin}" ${outline}/>` +
    `<path d="M ${pt(hx + 2, hy - 16)} C ${pt(hx + 11, hy - 16)} ${pt(hx + 14, hy - 9)} ${pt(hx + 14, hy - 5)}" stroke="${C.skinHi}" stroke-width="2" fill="none" stroke-linecap="round"/>` +
    // beard / stubble along the jaw
    `<path d="M ${pt(hx - 8, hy + 4)} C ${pt(hx - 2, hy + 10)} ${pt(hx + 6, hy + 8)} ${pt(hx + 14, hy + 6)} L ${pt(hx + 16, hy + 11)} C ${pt(hx + 15, hy + 18)} ${pt(hx + 8, hy + 22)} ${pt(hx - 1, hy + 21)} C ${pt(hx - 9, hy + 20)} ${pt(hx - 13, hy + 14)} ${pt(hx - 14, hy + 8)} Z" fill="${C.beard}" opacity="0.92"/>` +
    `<path d="M ${pt(hx + 2, hy + 14)} l 2 1 M ${pt(hx + 7, hy + 16)} l 2 1 M ${pt(hx - 3, hy + 12)} l 2 1" stroke="${C.beardSh}" stroke-width="1" fill="none"/>` +
    // ear
    `<ellipse cx="${p(hx - 5)}" cy="${p(hy + 2)}" rx="3.4" ry="4.6" fill="${C.skinSh}" stroke="${C.out}" stroke-width="1.1"/>` +
    // brow, eye, mouth
    `<path d="M ${pt(hx + 2, hy - 8.5)} L ${pt(hx + 12, hy - 7)}" stroke="${C.hairSh}" stroke-width="2.4" stroke-linecap="round"/>` +
    eyeSvg + mouthSvg +
    // hair: swept-up quiff
    `<path d="M ${pt(hx - 16, hy - 1)} C ${pt(hx - 19, hy - 14)} ${pt(hx - 9, hy - 25 - hairLift)} ${pt(hx + 3, hy - 24 - hairLift)} C ${pt(hx + 12, hy - 24 - hairLift)} ${pt(hx + 17, hy - 17)} ${pt(hx + 15, hy - 10)} ` +
    `C ${pt(hx + 11, hy - 14)} ${pt(hx + 6, hy - 13)} ${pt(hx + 1, hy - 12)} C ${pt(hx - 4, hy - 11)} ${pt(hx - 8, hy - 8)} ${pt(hx - 9, hy - 3)} C ${pt(hx - 12, hy - 3)} ${pt(hx - 14, hy)} ${pt(hx - 16, hy - 1)} Z" fill="${C.hair}" ${outline}/>` +
    `<path d="M ${pt(hx - 8, hy - 15)} q 6 -5 14 -4 M ${pt(hx - 11, hy - 8)} q 6 -4 13 -3 M ${pt(hx - 2, hy - 20)} q 6 -1 11 2" stroke="${C.hairHi}" stroke-width="1.6" fill="none" stroke-linecap="round"/>` +
    `</g>`;
}

/**
 * Side view of Rick, facing right.
 * pose: phase 0..1 (walk cycle), swing (thigh amplitude, degrees), flexMax (knee flexion in swing),
 * lean, bobExtra, arms {near:[upperDeg,foreDeg], far:[...]}, eye, mouth, tilt.
 */
export function rickSide({ phase = 0, swing = 24, flexMax = 52, lean = 7, rock = 1.4, armSwing = 4, eye = 'open', mouth = 'smirk', tilt = 0, still = false, extra = '' } = {}) {
  const ph = (k) => (((phase + k) % 1) + 1) % 1;
  const legPose = (f) => {
    if (still) return { thigh: 6 * (f ? -1 : 1), flex: 6, footAng: 0 };
    const thigh = swing * Math.sin(2 * Math.PI * f);
    const inSwing = f >= 0.75 || f < 0.25 ? false : true; // placeholder, replaced below
    void inSwing;
    // Stance is f in (0.25, 0.75): the thigh angle falls from +swing to -swing. Swing is the rest.
    const s = f >= 0.75 ? (f - 0.75) / 0.5 : f < 0.25 ? (f + 0.25) / 0.5 : -1;
    const flex = s >= 0 ? 6 + flexMax * Math.sin(Math.PI * s) : 6 + 6 * Math.sin(Math.PI * ((f - 0.25) / 0.5));
    const footAng = s >= 0 ? 18 * Math.sin(Math.PI * s) - 6 : 0;
    return { thigh, flex, footAng };
  };
  const near = legPose(ph(0)), far = legPose(ph(0.5));
  const fkAt = (hip, lp) => legFK(hip, lp.thigh, lp.flex);
  // Drop the hips so that the lowest foot touches the floor.
  const probeHip = [88, 60];
  const low = (lp) => fkAt(probeHip, lp).ankle[1] + 6 - probeHip[1];
  const hipY = GROUND - Math.max(low(near), low(far));
  const hip = [86 + 3 * Math.sin(2 * Math.PI * phase * 2) * 0, hipY];
  const nFK = fkAt([hip[0] + 2, hip[1]], near), fFK = fkAt([hip[0] - 2, hip[1]], far);

  // Upper body leans forward a little and rocks with the steps.
  const lean2 = lean + (still ? 0 : rock * Math.sin(4 * Math.PI * phase + 0.6));
  const torsoLen = 40;
  const shoulder = polar(hip, -torsoLen, lean2); // polar measures from "down"; negative length = up
  const sh = [hip[0] + torsoLen * Math.sin(lean2 * D2R), hip[1] - torsoLen * Math.cos(lean2 * D2R)];
  void shoulder;
  const headC = [sh[0] + 8 * Math.sin(lean2 * D2R) + 3, sh[1] - 25];

  // Arms in guard, swinging a little against the legs.
  const aSw = still ? 0 : armSwing * Math.sin(2 * Math.PI * phase);
  const armPts = (base, sw, far_) => {
    const s0 = [sh[0] + (far_ ? -1 : 3), sh[1] + 5];
    const e = polar(s0, 19, 22 + sw);
    const g = [e[0] + 17 * Math.sin((38 - sw) * D2R), e[1] - 17 * Math.cos((38 - sw) * D2R)];
    void base;
    return { s0, e, g };
  };
  const aNear = armPts(0, -aSw, false), aFar = armPts(0, aSw, true);

  // Torso: black shirt, tapering to the waist, then the shorts.
  const hipA = [hip[0], hip[1] + 2];
  const t = (dx, dy) => [sh[0] + dx, sh[1] + dy];
  const torso =
    `<path d="M ${pt(...t(-12, -3))} C ${pt(...t(-4, -6))} ${pt(...t(8, -6))} ${pt(...t(15, -1))} C ${pt(...t(17, 12))} ${pt(...t(14, 24))} ${pt(hip[0] + 12, hip[1] - 12)} L ${pt(hip[0] - 12, hip[1] - 12)} C ${pt(...t(-14, 24))} ${pt(...t(-14, 10))} ${pt(...t(-12, -3))} Z" fill="${C.shirt}" stroke="${C.out}" stroke-width="1.4" stroke-linejoin="round"/>` +
    `<path d="M ${pt(...t(5, 4))} C ${pt(...t(10, 10))} ${pt(...t(10, 20))} ${pt(...t(8, 28))}" stroke="${C.shirtHi}" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.8"/>` +
    // MTV print as three tiny blocks on the chest
    `<g fill="${C.white}"><rect x="${p(sh[0] + 3)}" y="${p(sh[1] + 8)}" width="3" height="4"/><rect x="${p(sh[0] + 7)}" y="${p(sh[1] + 8)}" width="3" height="4"/><rect x="${p(sh[0] + 11)}" y="${p(sh[1] + 8)}" width="2" height="4"/></g>` +
    `<rect x="${p(sh[0] + 2)}" y="${p(sh[1] + 14)}" width="12" height="1.4" fill="${C.white}" opacity="0.85"/>`;
  const shorts =
    `<path d="M ${pt(hip[0] - 13, hip[1] - 14)} L ${pt(hip[0] + 13, hip[1] - 14)} L ${pt(hip[0] + 15, hip[1] + 14)} L ${pt(hip[0] - 15, hip[1] + 14)} Z" fill="${C.shorts}" stroke="${C.out}" stroke-width="1.4" stroke-linejoin="round"/>` +
    `<path d="M ${pt(hip[0] + 13, hip[1] - 14)} L ${pt(hip[0] + 15, hip[1] + 14)} L ${pt(hip[0] + 7, hip[1] + 14)} L ${pt(hip[0] + 6, hip[1] - 14)} Z" fill="${C.green}"/>` +
    `<path d="M ${pt(hip[0] + 6, hip[1] - 14)} L ${pt(hip[0] + 7, hip[1] + 14)}" stroke="${C.greenSh}" stroke-width="1.2" fill="none"/>` +
    `<path d="M ${pt(hip[0] - 13, hip[1] - 14)} L ${pt(hip[0] + 13, hip[1] - 14)}" stroke="${C.shortsHi}" stroke-width="2"/>`;
  // The shorts' leg: a black sleeve over the top of the thigh with the green side stripe.
  const shortsLeg = (fk, far_) => {
    const d = Math.hypot(fk.knee[0] - fk.hip[0], fk.knee[1] - fk.hip[1]);
    const e = [fk.hip[0] + ((fk.knee[0] - fk.hip[0]) * 19) / d, fk.hip[1] + ((fk.knee[1] - fk.hip[1]) * 19) / d];
    return seg(fk.hip, e, 18, far_ ? C.shirtFar : C.shorts, C.out) +
      `<path d="M ${pt(e[0] + 7, e[1] + 1)} L ${pt(fk.hip[0] + 7, fk.hip[1] + 1)}" stroke="${C.green}" stroke-width="2.4" stroke-linecap="butt" fill="none" transform="translate(${p((e[0] - fk.hip[0]) * 0)} 0)"/>`;
  };

  const leg = (fk, lp, far_) => {
    const col = far_ ? C.skinFar : C.skin;
    return seg(fk.hip, fk.knee, 16, col, C.out, far_ ? null : C.skinHi) + seg(fk.knee, fk.ankle, 12, col, C.out, far_ ? null : C.skinHi) +
      `<circle cx="${p(fk.knee[0] + 1.5)}" cy="${p(fk.knee[1])}" r="3.4" fill="${far_ ? C.skinFar : C.skinSh}" opacity="0.7"/>` +
      foot(fk.ankle, lp.footAng, far_);
  };
  const arm = (a, far_) => {
    const col = far_ ? C.shirtFar : C.shirt; // short sleeve to the elbow, then skin
    const mid = [(a.s0[0] + a.e[0]) / 2, (a.s0[1] + a.e[1]) / 2];
    return seg(a.e, a.g, 9, far_ ? C.skinFar : C.skin, C.out, far_ ? null : C.skinHi) +
      seg(a.s0, mid, 11, col, C.out, far_ ? null : C.shirtHi) +
      seg(mid, a.e, 9.5, far_ ? C.skinFar : C.skin, C.out) +
      `<path d="M ${pt(mid[0] - 3, mid[1] - 1)} l 6 -2" stroke="${C.teal}" stroke-width="1.6" fill="none"/>` +
      glove(a.g, far_);
  };

  const body =
    // far limbs first
    leg(fFK, far, true) + shortsLeg(fFK, true) + arm(aFar, true) +
    shorts + torso +
    leg(nFK, near, false) + shortsLeg(nFK, false) +
    headDraw(headC[0], headC[1], { eye, mouth, tilt }) +
    arm(aNear, false) + extra;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${GRID}" height="${GRID}" viewBox="0 0 ${GRID} ${GRID}" shape-rendering="crispEdges">${body}</svg>`;
}

/** Renders a pose to a pixel-art PNG buffer scaled up by `scale` with nearest-neighbour. */
export async function renderRickSide(opts, scale = 8) {
  const small = await sharp(Buffer.from(rickSide(opts))).png().toBuffer();
  return sharp(small).resize(GRID * scale, GRID * scale, { kernel: 'nearest' }).png().toBuffer();
}
