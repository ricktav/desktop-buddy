// "Tilly": a cartoon 2-year-old girl with pigtails and bows riding a pink
// tricycle. The pedals drive the front wheel and her legs follow them with a
// small two-bone solver, so the pedalling looks right. Double-click: a wheelie.
// Run: node scripts/gen-toddler-sprites.mjs
import { svgWrap, writePack, SLEEP_MARKS, BANG, HEART } from './lib/sprite.mjs';

const C = {
  frame: '#FF4D8D', frameDk: '#A81E55', seat: '#C93A74',
  tire: '#34343F', rim: '#F4F4FA', hub: '#8A8AA0',
  hair: '#8F5C2E', hairDk: '#5C3A1A', hairLt: '#B98350',
  skin: '#FFDCC4', skinDk: '#E6AF90', ink: '#3A2418',
  dress: '#FFD43B', dressDk: '#D9A21B', bow: '#FF6FA5', shoe: '#FF6FA5', sock: '#FFFFFF',
};
const stroke = (w = 1.4, c = C.ink) => `stroke="${c}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
const f1 = (n) => n.toFixed(1);

// ---- geometry ---------------------------------------------------------------
const HUB = { x: 82, y: 105 };       // front wheel centre
const REAR = { x: 30, y: 111 };      // rear wheel centre
const HIP = { x: 58, y: 84 };
const GRIP = { x: 90, y: 61 };
const BELL = { x: 82, y: 57 };

/** Two-bone IK: returns the middle joint (knee/elbow) bending toward negative y; clamps the reach. */
function ik(a, b, l1, l2, bendUp = true) {
  let dx = b.x - a.x, dy = b.y - a.y;
  let d = Math.hypot(dx, dy) || 0.01;
  const max = l1 + l2 - 0.4;
  if (d > max) { dx *= max / d; dy *= max / d; d = max; b = { x: a.x + dx, y: a.y + dy }; }
  const ux = dx / d, uy = dy / d;
  const along = (l1 * l1 - l2 * l2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  const k1 = { x: a.x + ux * along - uy * h, y: a.y + uy * along + ux * h };
  const k2 = { x: a.x + ux * along + uy * h, y: a.y + uy * along - ux * h };
  const knee = (k1.y < k2.y) === bendUp ? k1 : k2;
  return { mid: knee, end: b };
}

const limb = (p0, p1, p2, w, col, line = C.ink) => {
  const d = `M ${f1(p0.x)} ${f1(p0.y)} L ${f1(p1.x)} ${f1(p1.y)} L ${f1(p2.x)} ${f1(p2.y)}`;
  return `<path d="${d}" fill="none" stroke="${line}" stroke-width="${w + 2.6}" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${d}" fill="none" stroke="${col}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
};

// ---- the tricycle ------------------------------------------------------------
function wheel(cx, cy, R, rot, far = false) {
  const tr = R - 2.5, ir = R - 5.5;
  let sp = '';
  for (let i = 0; i < 6; i++) {
    const a = ((rot + i * 60) * Math.PI) / 180;
    sp += `M ${cx} ${cy} L ${f1(cx + Math.cos(a) * ir)} ${f1(cy + Math.sin(a) * ir)} `;
  }
  return `<g opacity="${far ? 0.78 : 1}">` +
    `<circle cx="${cx}" cy="${cy}" r="${ir}" fill="#fff" opacity="0.3"/>` +
    `<path d="${sp}" fill="none" stroke="${C.frame}" stroke-width="1.8" stroke-linecap="round"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${tr}" fill="none" stroke="${C.tire}" stroke-width="5"/>` +
    `<path d="M ${f1(cx - tr * 0.75)} ${f1(cy - tr * 0.6)} A ${tr} ${tr} 0 0 1 ${f1(cx + tr * 0.2)} ${f1(cy - tr)}" fill="none" stroke="#fff" stroke-width="1.3" opacity="0.28" stroke-linecap="round"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${R > 14 ? 3.6 : 2.8}" fill="${C.rim}" stroke="${C.hub}" stroke-width="1.2"/></g>`;
}

const tube = (d, w = 4.6) => `<path d="${d}" fill="none" stroke="${C.frameDk}" stroke-width="${w + 2}" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${C.frame}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;

function frameParts(fl) {
  const wave = [`M 94 61 q 7 -4 12 1 t 11 1`, `M 94 61 q 7 -1 12 -3 t 11 2`, `M 94 61 q 7 2 12 4 t 11 -2`][fl % 3];
  const wave2 = [`M 94 62.5 q 7 -2 12 3 t 9 3`, `M 94 62.5 q 7 1 12 -1 t 9 2`, `M 94 62.5 q 7 4 12 6 t 9 -1`][fl % 3];
  return (
    // main tube, seat post and seat
    tube('M 34 109 Q 46 98 58 95 L 80 80', 5) +
    tube('M 58 95 L 58 86', 3.6) +
    `<path d="M 45 86 Q 45 81 52 81 L 66 81 Q 73 81 71 86.5 Z" fill="${C.seat}" ${stroke(1.4, '#7A1A45')}/>` +
    `<path d="M 49 83 Q 58 81.5 66 83" fill="none" stroke="#fff" stroke-width="1.2" opacity="0.4" stroke-linecap="round"/>` +
    // fork to the front hub, stem and handlebar
    tube(`M 80 80 L ${HUB.x} ${HUB.y}`, 4.2) + tube('M 80 80 L 84 61', 3.6) +
    `<path d="M 76 61 L 92 61" stroke="${C.frameDk}" stroke-width="5.2" stroke-linecap="round"/><path d="M 76 61 L 92 61" stroke="${C.frame}" stroke-width="3.2" stroke-linecap="round"/>` +
    `<path d="M 88 61 L 95 61" stroke="#2A2A36" stroke-width="5.4" stroke-linecap="round"/>` +
    `<path d="${wave}" fill="none" stroke="#FF8FBE" stroke-width="3" stroke-linecap="round"/><path d="${wave2}" fill="none" stroke="#FFD43B" stroke-width="2.4" stroke-linecap="round"/>`
  );
}

function bell(ring) {
  return `<path d="M ${BELL.x - 4} ${BELL.y + 2} Q ${BELL.x - 4} ${BELL.y - 5} ${BELL.x} ${BELL.y - 5} Q ${BELL.x + 4} ${BELL.y - 5} ${BELL.x + 4} ${BELL.y + 2} Z" fill="#E8EDF5" ${stroke(1, '#7A8499')}/><circle cx="${BELL.x}" cy="${BELL.y - 6}" r="1.2" fill="#7A8499"/>` +
    (ring ? `<path d="M ${BELL.x + 8} ${BELL.y - 8} q 4 4 0 9 M ${BELL.x + 12} ${BELL.y - 12} q 7 8 0 18 M ${BELL.x - 8} ${BELL.y - 8} q -4 4 0 9" fill="none" stroke="#F2A900" stroke-width="2" stroke-linecap="round"/>` : '');
}

const crankPos = (deg, sign = 1) => {
  const a = (deg * Math.PI) / 180;
  return { x: HUB.x + sign * Math.cos(a) * 7.5, y: HUB.y + sign * Math.sin(a) * 7.5 };
};
const crankArm = (p) => `<path d="M ${HUB.x} ${HUB.y} L ${f1(p.x)} ${f1(p.y)}" stroke="#5A5A70" stroke-width="3" stroke-linecap="round"/><rect x="${f1(p.x - 4.5)}" y="${f1(p.y - 1.6)}" width="9" height="3.2" rx="1.4" fill="#2A2A36"/>`;

// ---- the toddler ---------------------------------------------------------------
function foot(p, ang = 0) {
  return `<g transform="translate(${f1(p.x)} ${f1(p.y)}) rotate(${ang})"><rect x="-3.2" y="-8" width="6.4" height="5.4" rx="1.5" fill="${C.sock}" ${stroke(0.9, '#B9A99A')}/>` +
    `<path d="M -5.5 -3 Q 0 -5.4 5.8 -2.6 Q 9.4 -1 8.6 2.2 Q 8 3.6 5 3.6 L -4.6 3.6 Q -7 3.2 -5.5 -3 Z" fill="${C.shoe}" ${stroke(1.1, '#B3366A')}/><path d="M -2 -2.4 h 5" stroke="#fff" stroke-width="1.3" stroke-linecap="round" opacity="0.8"/></g>`;
}

const eye = (x, y, s, mode) => {
  const r = (v) => (v * s).toFixed(1);
  switch (mode) {
    case 'closed': return `<path d="M ${f1(x - 3.4 * s)} ${f1(y)} q ${r(3.4)} ${r(3)} ${r(6.8)} 0" fill="none" stroke="${C.ink}" stroke-width="1.9" stroke-linecap="round"/>`;
    case 'happy': return `<path d="M ${f1(x - 3.4 * s)} ${f1(y + 1)} q ${r(3.4)} ${r(-5)} ${r(6.8)} 0" fill="none" stroke="${C.ink}" stroke-width="2" stroke-linecap="round"/>`;
    case 'wide': return `<ellipse cx="${x}" cy="${y}" rx="${r(4.4)}" ry="${r(5.4)}" fill="#fff" ${stroke(0.9)}/><ellipse cx="${x}" cy="${y}" rx="${r(2.8)}" ry="${r(3.6)}" fill="${C.ink}"/><circle cx="${f1(x + 1 * s)}" cy="${f1(y - 1.4 * s)}" r="${r(1.1)}" fill="#fff"/>`;
    case 'up': return `<ellipse cx="${x}" cy="${y}" rx="${r(3.4)}" ry="${r(4.4)}" fill="${C.ink}"/><circle cx="${f1(x + 1 * s)}" cy="${f1(y - 2.2 * s)}" r="${r(1.1)}" fill="#fff"/>`;
    case 'worried': return `<ellipse cx="${x}" cy="${y}" rx="${r(3.4)}" ry="${r(4.4)}" fill="${C.ink}"/><circle cx="${f1(x + 0.9 * s)}" cy="${f1(y - 1.2 * s)}" r="${r(1.1)}" fill="#fff"/><path d="M ${f1(x - 4 * s)} ${f1(y - 6.4 * s)} l ${r(7.4)} ${r(2)}" fill="none" stroke="${C.hairDk}" stroke-width="1.5" stroke-linecap="round"/>`;
    default: return `<ellipse cx="${x}" cy="${y}" rx="${r(3.4)}" ry="${r(4.4)}" fill="${C.ink}"/><circle cx="${f1(x + 1 * s)}" cy="${f1(y - 1.4 * s)}" r="${r(1.2)}" fill="#fff"/><circle cx="${f1(x - 1 * s)}" cy="${f1(y + 1.6 * s)}" r="${r(0.6)}" fill="#fff" opacity="0.8"/>`;
  }
};

const bowAt = (x, y, rot) => `<g transform="translate(${f1(x)} ${f1(y)}) rotate(${rot})"><path d="M 0 0 L -7 -4.6 L -7 4.6 Z M 0 0 L 7 -4.6 L 7 4.6 Z" fill="${C.bow}" ${stroke(1, '#B3366A')}/><circle r="2.2" fill="#FF9DC2" ${stroke(0.8, '#B3366A')}/></g>`;

function head(hx, hy, { eyes = 'open', mouth = 'smile', tilt = 0, sway = 0 } = {}) {
  let m;
  if (mouth === 'grin') m = `<path d="M ${hx + 6} ${hy + 9.5} q 5.4 7.4 10.6 0 z" fill="#B8324F" stroke="#7C1F36" stroke-width="1" stroke-linejoin="round"/><path d="M ${hx + 7.6} ${hy + 10.4} h 7.4" stroke="#fff" stroke-width="1.7"/>`;
  else if (mouth === 'o') m = `<ellipse cx="${hx + 11.5}" cy="${hy + 11.5}" rx="2.7" ry="3.3" fill="#B8324F" stroke="#7C1F36" stroke-width="1"/>`;
  else if (mouth === 'flat') m = `<path d="M ${hx + 8} ${hy + 11.5} h 6.4" fill="none" stroke="#9E2F4C" stroke-width="1.8" stroke-linecap="round"/>`;
  else m = `<path d="M ${hx + 7.5} ${hy + 10} q 4.2 4 8.4 0" fill="none" stroke="#9E2F4C" stroke-width="1.9" stroke-linecap="round"/>`;
  const sw = sway;
  const pigFar = `M ${hx - 6} ${hy - 12} C ${hx - 22 + sw} ${hy - 20} ${hx - 28 + sw} ${hy - 4} ${hx - 21 + sw} ${hy + 3} C ${hx - 18} ${hy - 6} ${hx - 13} ${hy - 8} ${hx - 6} ${hy - 9} Z`;
  const pigNear = `M ${hx - 12} ${hy - 4} C ${hx - 25 + sw} ${hy + 2} ${hx - 25 + sw} ${hy + 18} ${hx - 17 + sw} ${hy + 22} C ${hx - 12} ${hy + 13} ${hx - 10} ${hy + 5} ${hx - 9} ${hy - 1} Z`;
  return `<g transform="rotate(${tilt} ${hx} ${hy + 14})">` +
    `<path d="${pigFar}" fill="${C.hair}" ${stroke(1.3, C.hairDk)}/>` + bowAt(hx - 8, hy - 12, -30) +
    `<ellipse cx="${hx + 16.6}" cy="${hy + 5}" rx="2.8" ry="2.5" fill="${C.skin}" ${stroke(1.3)}/>` +
    `<circle cx="${hx}" cy="${hy}" r="16.5" fill="${C.skin}" ${stroke(1.5)}/>` +
    `<ellipse cx="${hx - 9}" cy="${hy + 4}" rx="2.8" ry="3.8" fill="${C.skinDk}" ${stroke(1, C.ink)}/>` +
    // hair cap with a soft fringe
    `<path d="M ${hx - 16.5} ${hy + 9} C ${hx - 21} ${hy - 16} ${hx + 4} ${hy - 26} ${hx + 15.5} ${hy - 9} C ${hx + 11} ${hy - 13} ${hx + 4} ${hy - 9} ${hx - 3} ${hy - 11} C ${hx - 6} ${hy - 6} ${hx - 7} ${hy + 1} ${hx - 8} ${hy + 9} Z" fill="${C.hair}" ${stroke(1.4, C.hairDk)}/>` +
    `<path d="M ${hx - 12} ${hy - 14} q 7 -6 15 -3 M ${hx - 3} ${hy - 19} q 6 0 10 4" fill="none" stroke="${C.hairLt}" stroke-width="1.7" stroke-linecap="round" opacity="0.85"/>` +
    `<path d="${pigNear}" fill="${C.hair}" ${stroke(1.3, C.hairDk)}/><path d="M ${hx - 15 + sw} ${hy + 4} q -2 8 0 14" fill="none" stroke="${C.hairLt}" stroke-width="1.4" stroke-linecap="round" opacity="0.8"/>` + bowAt(hx - 11, hy - 4, 20) +
    `<ellipse cx="${hx + 4.6}" cy="${hy + 9.6}" rx="4.2" ry="2.6" fill="#FF8FA8" opacity="0.55"/><ellipse cx="${hx + 13.4}" cy="${hy + 9.6}" rx="2.6" ry="2.2" fill="#FF8FA8" opacity="0.45"/>` +
    eye(hx + 3.2, hy + 2.6, 1, eyes) + eye(hx + 12.2, hy + 2.6, 0.78, eyes) +
    `<path d="M ${hx} ${hy - 4} q 3.4 -2 6.2 -0.6 M ${hx + 9.4} ${hy - 4.4} q 2.6 -1.4 4.6 0" fill="none" stroke="${C.hairDk}" stroke-width="1.4" stroke-linecap="round" opacity="0.8"/>` +
    `<g transform="translate(-2.4 0)">${m}</g>` + `</g>`;
}

/** The little girl and her ride. */
function scene({
  crank = 60, wheel: wrot = crank, bob = 0, lean = { x: 0, y: 0 }, tilt = 0, hop = 0, rotAbout = { x: 30, y: 122 },
  eyes = 'open', mouth = 'smile', headTilt = 0, sway = 0, fl = 0,
  nearHand = null, farHand = null, nearFoot = null, farFoot = null, ring = false, extra = '', point = false,
} = {}) {
  const SH = { x: 66 + lean.x, y: 68 + lean.y + bob };
  const hip = { x: HIP.x, y: HIP.y + bob * 0.5 };
  const head0 = { x: SH.x - 2, y: SH.y - 20 };
  const pN = nearFoot ?? { x: crankPos(crank).x - 1, y: crankPos(crank).y - 3 };
  const pF = farFoot ?? { x: crankPos(crank, -1).x - 1, y: crankPos(crank, -1).y - 3 };
  const legN = ik(hip, pN, 18, 18), legF = ik(hip, pF, 18, 18);
  const hN = nearHand ?? GRIP, hF = farHand ?? { x: GRIP.x + 3, y: GRIP.y + 1 };
  const armN = ik({ x: SH.x + 1, y: SH.y }, hN, 14, 14, false), armF = ik({ x: SH.x - 1, y: SH.y }, hF, 14, 14, false);

  const sleeve = (arm, sh) => {
    const t = 0.5;
    const e = { x: sh.x + (arm.mid.x - sh.x) * t, y: sh.y + (arm.mid.y - sh.y) * t };
    return `<path d="M ${f1(sh.x)} ${f1(sh.y)} L ${f1(e.x)} ${f1(e.y)}" stroke="${C.dressDk}" stroke-width="9" stroke-linecap="round"/><path d="M ${f1(sh.x)} ${f1(sh.y)} L ${f1(e.x)} ${f1(e.y)}" stroke="${C.dress}" stroke-width="6.6" stroke-linecap="round"/>`;
  };
  const finger = (a) => {
    if (!point) return '';
    const dx = a.end.x - a.mid.x, dy = a.end.y - a.mid.y, d = Math.hypot(dx, dy) || 1;
    const tip = { x: a.end.x + (dx / d) * 8, y: a.end.y + (dy / d) * 8 };
    return `<path d="M ${f1(a.end.x)} ${f1(a.end.y)} L ${f1(tip.x)} ${f1(tip.y)}" stroke="${C.ink}" stroke-width="5" stroke-linecap="round"/><path d="M ${f1(a.end.x)} ${f1(a.end.y)} L ${f1(tip.x)} ${f1(tip.y)}" stroke="${C.skin}" stroke-width="2.6" stroke-linecap="round"/>`;
  };
  const arm = (a, sh, hand, pf = false) => limb(sh, a.mid, a.end, 6, C.skin) + sleeve(a, sh) + (pf ? finger(a) : '') + `<circle cx="${f1(a.end.x)}" cy="${f1(a.end.y)}" r="4.4" fill="${C.skin}" ${stroke(1.2)}/>`;
  const leg = (l) => limb(hip, l.mid, l.end, 7, C.skin);

  // dress: bodice leaning forward and a flared skirt over the seat
  const dress =
    `<path d="M ${f1(SH.x - 8)} ${f1(SH.y - 2)} Q ${f1(SH.x - 12)} ${f1((SH.y + hip.y) / 2)} ${f1(hip.x - 14)} ${f1(hip.y + 3)} L ${f1(hip.x + 14)} ${f1(hip.y + 3)} Q ${f1(SH.x + 8)} ${f1((SH.y + hip.y) / 2)} ${f1(SH.x + 6)} ${f1(SH.y - 2)} Z" fill="${C.dress}" ${stroke(1.5, C.dressDk)}/>` +
    `<ellipse cx="${f1(hip.x)}" cy="${f1(hip.y + 1)}" rx="16" ry="6.2" fill="${C.dress}" ${stroke(1.5, C.dressDk)}/>` +
    `<path d="M ${f1(hip.x - 12)} ${f1(hip.y + 4)} q 3 2.4 6 0 q 3 2.4 6 0 q 3 2.4 6 0 q 3 2.4 6 0" fill="none" stroke="${C.dressDk}" stroke-width="1.2" opacity="0.7"/>` +
    `<path d="M ${f1(SH.x - 6)} ${f1(SH.y - 1)} q 6 6 11 -1" fill="#fff" stroke="#E8DCC0" stroke-width="1"/>` +
    [[-3, 8], [2, 17], [-6, 22], [5, 24]].map(([dx, dy]) => `<circle cx="${f1(SH.x + dx - (dy / 30) * 4)}" cy="${f1(SH.y + dy * 0.7)}" r="1.5" fill="#fff" opacity="0.85"/>`).join('') +
    `<rect x="${f1(SH.x - 4)}" y="${f1(SH.y - 8)}" width="6" height="8" rx="2" fill="${C.skin}"/>`;

  const bike = `<g transform="translate(0 ${-hop})">` +
    crankArm(crankPos(crank, -1)) + legFar(legF) +
    wheel(REAR.x + 7, REAR.y - 1, 11, wrot, true) + wheel(REAR.x, REAR.y, 11, wrot) + frameParts(fl) + wheel(HUB.x, HUB.y, 17, wrot) + bell(ring) +
    crankArm(crankPos(crank, 1)) +
    `</g>`;
  function legFar(l) { return limb(hip, l.mid, l.end, 7, C.skinDk) + foot(l.end, 0); }

  const rider = `<g transform="translate(0 ${-hop})">` +
    arm(armF, { x: SH.x - 1, y: SH.y }, hF) +
    leg(legN) + foot(legN.end, 0) +
    dress +
    head(head0.x, head0.y, { eyes, mouth, tilt: headTilt, sway }) +
    arm(armN, { x: SH.x + 1, y: SH.y }, hN, true) +
    `</g>`;

  return svgWrap(
    `<ellipse cx="60" cy="122" rx="42" ry="3.2" fill="#000" opacity="0.15"/>` +
    `<g transform="rotate(${tilt} ${rotAbout.x} ${rotAbout.y})">${bike}${rider}</g>` + extra,
  );
}

// ---- animations ------------------------------------------------------------------
const feetDown = { nearFoot: { x: 72, y: 118 }, farFoot: { x: 64, y: 119 } };
const ARMS_UP = { nearHand: { x: 86, y: 38 }, farHand: { x: 72, y: 40 } };

const anims = {
  idle: {
    fps: 3,
    frames: [
      scene({ crank: 60, fl: 0 }),
      scene({ crank: 60, fl: 1, headTilt: 3, sway: 2, bob: -1 }),
      scene({ crank: 60, fl: 2, eyes: 'closed' }),
      scene({ crank: 60, fl: 1, headTilt: -3, sway: -2, bob: -1 }),
    ],
  },
  walk: {
    fps: 8,
    frames: [0, 1, 2, 3].map((i) => scene({ crank: 30 + i * 90, bob: i % 2 ? -1.5 : 0.5, fl: i % 3, sway: [4, 0, -4, 0][i], headTilt: [-2, 0, 2, 0][i], mouth: 'grin' })),
  },
  sit: {
    fps: 2,
    frames: [
      scene({ ...feetDown, fl: 0 }), scene({ ...feetDown, fl: 1, headTilt: 3 }), scene({ ...feetDown, fl: 2, eyes: 'closed' }), scene({ ...feetDown, fl: 1, headTilt: -3 }),
    ],
  },
  sleep: {
    fps: 1,
    frames: [
      scene({ ...feetDown, lean: { x: 9, y: 7 }, headTilt: 22, eyes: 'closed', mouth: 'flat', nearHand: { x: 88, y: 63 }, farHand: { x: 84, y: 64 }, extra: SLEEP_MARKS(0, 108) }),
      scene({ ...feetDown, lean: { x: 9, y: 8 }, headTilt: 22, eyes: 'closed', mouth: 'flat', bob: 0.5, nearHand: { x: 88, y: 63 }, farHand: { x: 84, y: 64 }, extra: SLEEP_MARKS(6, 108) }),
    ],
  },
  watch: {
    fps: 1.5,
    frames: [
      scene({ ...feetDown, eyes: 'up', headTilt: -10, lean: { x: -1, y: -1 } }), scene({ ...feetDown, eyes: 'up', headTilt: -14, lean: { x: -2, y: -1 }, fl: 1 }),
      scene({ ...feetDown, eyes: 'up', headTilt: -10, lean: { x: -1, y: -1 } }), scene({ ...feetDown, eyes: 'closed', headTilt: -14, lean: { x: -2, y: -1 }, fl: 2 }),
    ],
  },
  point: {
    fps: 2,
    frames: [
      scene({ ...feetDown, mouth: 'o', point: true, nearHand: { x: 110, y: 52 } }), scene({ ...feetDown, mouth: 'o', point: true, eyes: 'wide', nearHand: { x: 112, y: 46 }, bob: -1, fl: 1 }),
    ],
  },
  alert: {
    fps: 4,
    frames: [
      scene({ ...feetDown, eyes: 'wide', mouth: 'o', nearHand: { x: BELL.x, y: BELL.y + 3 }, ring: true, extra: BANG(116, 34) }),
      scene({ ...feetDown, eyes: 'wide', mouth: 'o', nearHand: { x: BELL.x, y: BELL.y + 1 }, ring: true, hop: 4, bob: -1, extra: BANG(116, 30), fl: 1 }),
    ],
  },
  happy: {
    fps: 5,
    frames: [
      scene({ crank: 30, ...ARMS_UP, eyes: 'happy', mouth: 'grin', fl: 0, extra: HEART(114, 24) }),
      scene({ crank: 120, ...ARMS_UP, nearHand: { x: 90, y: 34 }, eyes: 'happy', mouth: 'grin', hop: 5, fl: 1, headTilt: -4, extra: HEART(114, 18) }),
    ],
  },
  drag: {
    fps: 2,
    frames: [
      scene({ crank: 80, eyes: 'worried', mouth: 'o', tilt: -16, hop: 8, rotAbout: { x: 60, y: 90 }, fl: 0 }),
      scene({ crank: 100, eyes: 'worried', mouth: 'o', tilt: -10, hop: 10, rotAbout: { x: 60, y: 90 }, fl: 2, sway: 4 }),
    ],
  },
  // Double-click trick: a wheelie, waving and shouting "Wheee!".
  trick: {
    fps: 6,
    frames: [
      scene({ crank: 30, tilt: -10, nearHand: { x: 88, y: 44 }, eyes: 'happy', mouth: 'grin', fl: 0 }),
      scene({ crank: 120, tilt: -24, nearHand: { x: 86, y: 38 }, eyes: 'happy', mouth: 'grin', fl: 1, sway: 5 }),
      scene({ crank: 210, tilt: -26, nearHand: { x: 92, y: 40 }, eyes: 'happy', mouth: 'grin', fl: 2, sway: -5 }),
      scene({ crank: 300, tilt: -14, nearHand: { x: 88, y: 44 }, eyes: 'happy', mouth: 'grin', fl: 1 }),
    ],
  },
};

writePack('toddler-trike', {
  name: 'Tilly',
  petLines: ['Wheee!', '*ring ring*', 'Look at me go!', 'Hoi hoi!', '*giggles*'],
  doubleClick: { animation: 'trick', seconds: 3, say: 'Wheee!', effect: { type: 'confetti' } },
}, anims);
