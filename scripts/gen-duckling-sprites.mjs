// Natural duckling "Pip": a downy yellow duckling with soft shading, brown
// head and back markings, an orange bill and webbed feet. Vector art with
// gradients (no image model is involved, so this is a detailed illustration
// rather than a photograph; swap in PNG photos with the same names to change that).
// Run: node scripts/gen-duckling-sprites.mjs
import { svgWrap, writePack, SLEEP_MARKS, BANG, HEART, FLOOR } from './lib/sprite.mjs';

const DEFS = `
<radialGradient id="dBody" cx="0.38" cy="0.3" r="0.85">
  <stop offset="0" stop-color="#FFF3AE"/><stop offset="0.5" stop-color="#FFD94C"/><stop offset="1" stop-color="#E8A71C"/>
</radialGradient>
<radialGradient id="dHead" cx="0.36" cy="0.28" r="0.85">
  <stop offset="0" stop-color="#FFF6BC"/><stop offset="0.5" stop-color="#FFDB52"/><stop offset="1" stop-color="#EAAA1F"/>
</radialGradient>
<linearGradient id="dWing" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#F7CB3F"/><stop offset="1" stop-color="#CC8D14"/>
</linearGradient>
<linearGradient id="dBillTop" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#FFB347"/><stop offset="1" stop-color="#F07F12"/>
</linearGradient>
<linearGradient id="dBillLow" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#E9791A"/><stop offset="1" stop-color="#C85D0B"/>
</linearGradient>`;

const OUT = '#9A6410';
const stroke = (w = 1.2, c = OUT) => `stroke="${c}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;

function foot(x, y, { lift = 0, back = false } = {}) {
  const col = back ? '#D9731A' : '#F58B1E';
  const yy = y - lift;
  return `<path d="M ${x} ${yy - 14} L ${x} ${yy - 3}" fill="none" stroke="${col}" stroke-width="3.4" stroke-linecap="round"/>` +
    `<path d="M ${x - 3} ${yy - 3.5} Q ${x + 6} ${yy - 7} ${x + 14} ${yy} Q ${x + 6} ${yy + 1} ${x - 3} ${yy} Z" fill="${col}" ${stroke(0.9, '#A8520A')}/>` +
    `<path d="M ${x + 1} ${yy - 2.6} L ${x + 10} ${yy - 0.4}" fill="none" ${stroke(0.7, '#A8520A')}/>`;
}

const shadow = (cx = 62, rx = 30) => `<ellipse cx="${cx}" cy="122" rx="${rx}" ry="3.2" fill="#000" opacity="0.16"/>`;

/** Fluffy ticks along the top arc of an ellipse for a downy look. */
function fluff(cx, cy, rx, ry, from = 195, to = 345, step = 13) {
  let out = '';
  for (let a = from; a <= to; a += step) {
    const t = (a * Math.PI) / 180;
    const x = cx + Math.cos(t) * rx, y = cy + Math.sin(t) * ry;
    const nx = Math.cos(t), ny = Math.sin(t);
    out += `M ${x.toFixed(1)} ${y.toFixed(1)} l ${(nx * 3.4).toFixed(1)} ${(ny * 3.4).toFixed(1)} `;
  }
  return `<path d="${out}" fill="none" stroke="#E3A41C" stroke-width="1.4" stroke-linecap="round" opacity="0.8"/>`;
}

function body(cx, cy, rx, ry) {
  return (
    // tail tuft
    `<path d="M ${cx - rx + 3} ${cy - 5} Q ${cx - rx - 11} ${cy - 12} ${cx - rx - 8} ${cy - 20} Q ${cx - rx + 4} ${cy - 13} ${cx - rx + 9} ${cy - 9} Z" fill="url(#dBody)" ${stroke(1)}/>` +
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#dBody)" ${stroke(1.3)}/>` +
    fluff(cx, cy, rx, ry) +
    // brown back stripe, belly highlight and soft sheen
    `<path d="M ${cx - rx * 0.7} ${cy - ry * 0.55} Q ${cx - rx * 0.1} ${cy - ry * 1.02} ${cx + rx * 0.55} ${cy - ry * 0.78}" fill="none" stroke="#8A6024" stroke-width="5" opacity="0.32" stroke-linecap="round"/>` +
    `<ellipse cx="${cx + 4}" cy="${cy + ry * 0.45}" rx="${rx * 0.62}" ry="${ry * 0.42}" fill="#FFF3B8" opacity="0.7"/>` +
    `<ellipse cx="${cx - rx * 0.25}" cy="${cy - ry * 0.4}" rx="${rx * 0.28}" ry="${ry * 0.2}" fill="#fff" opacity="0.45"/>`
  );
}

/** Resting wing lying along the flank. */
function wingRest(cx, cy, size = 1) {
  return `<g transform="translate(${cx} ${cy}) scale(${size})"><path d="M -17 -1 Q -14 -12 2 -11 Q 15 -9 19 4 Q 8 8 -5 8 Q -16 7 -17 -1 Z" fill="url(#dWing)" ${stroke(1)}/>` +
    `<path d="M -9 1 Q 0 -3 11 3 M -11 5 Q 0 2 13 7" fill="none" stroke="#B57412" stroke-width="0.9" opacity="0.8"/></g>`;
}

/** Wing spread out from the shoulder at (x, y); angle in degrees (0 = backwards-horizontal, negative rotates up). */
function wingSpread(x, y, angle, len = 1, far = false) {
  return `<g transform="translate(${x} ${y}) rotate(${angle}) scale(${len})" opacity="${far ? 0.9 : 1}">` +
    `<path d="M 0 0 Q 8 -10 26 -8 Q 38 -3 40 7 Q 24 11 10 9 Q 2 7 0 0 Z" fill="${far ? '#D9A12A' : 'url(#dWing)'}" ${stroke(1)}/>` +
    `<path d="M 8 0 L 36 4 M 6 5 L 32 8 M 10 -4 L 30 -3" fill="none" stroke="#B57412" stroke-width="0.9" opacity="0.8"/></g>`;
}

function eye(cx, cy, mode) {
  switch (mode) {
    case 'closed': return `<path d="M ${cx - 4} ${cy} q 4 3.4 8 0" fill="none" stroke="#2A1A0A" stroke-width="2" stroke-linecap="round"/>`;
    case 'happy': return `<path d="M ${cx - 4} ${cy + 1.4} q 4 -5.6 8 0" fill="none" stroke="#2A1A0A" stroke-width="2.2" stroke-linecap="round"/>`;
    case 'wide': return `<circle cx="${cx}" cy="${cy}" r="5.4" fill="#fff" ${stroke(0.9)}/><circle cx="${cx + 0.4}" cy="${cy}" r="3.2" fill="#1B1208"/><circle cx="${cx + 1.5}" cy="${cy - 1.2}" r="1.1" fill="#fff"/>`;
    case 'up': return `<circle cx="${cx}" cy="${cy}" r="4.4" fill="#fff" opacity="0.9"/><circle cx="${cx + 0.6}" cy="${cy - 1.5}" r="3.1" fill="#1B1208"/><circle cx="${cx + 1.6}" cy="${cy - 2.6}" r="1" fill="#fff"/>`;
    case 'worried': return `<circle cx="${cx}" cy="${cy}" r="3.9" fill="#fff" opacity="0.9"/><circle cx="${cx}" cy="${cy + 1}" r="3" fill="#1B1208"/><circle cx="${cx + 1.2}" cy="${cy}" r="1" fill="#fff"/>` +
      `<path d="M ${cx - 5} ${cy - 5.5} l 9 2.4" fill="none" stroke="#6A4412" stroke-width="1.6" stroke-linecap="round"/>`;
    default: return `<circle cx="${cx}" cy="${cy}" r="3.7" fill="#1B1208"/><circle cx="${cx + 1.3}" cy="${cy - 1.3}" r="1.2" fill="#fff"/><circle cx="${cx - 1}" cy="${cy + 1.2}" r="0.6" fill="#fff" opacity="0.7"/>`;
  }
}

function head(cx, cy, { eyes = 'open', bill = 0, tilt = 0 } = {}) {
  const oT = -bill * 0.55, oB = bill * 0.85;
  const billSvg =
    (bill > 0 ? `<path d="M ${cx + 12} ${cy + 3 + oT} L ${cx + 27} ${cy + 3 + oT * 0.5} L ${cx + 25} ${cy + 7 + oB} L ${cx + 12} ${cy + 8 + oB} Z" fill="#8E2B1A"/>` : '') +
    `<path d="M ${cx + 12} ${cy - 2 + oT} Q ${cx + 27} ${cy - 5 + oT} ${cx + 32} ${cy + 2 + oT} Q ${cx + 27} ${cy + 5 + oT * 0.6} ${cx + 12} ${cy + 5 + oT * 0.2} Z" fill="url(#dBillTop)" ${stroke(1, '#A8520A')}/>` +
    `<ellipse cx="${cx + 23}" cy="${cy - 0.6 + oT}" rx="1.1" ry="0.8" fill="#8A3A06"/>` +
    `<path d="M ${cx + 12} ${cy + 5 + oB * 0.3} Q ${cx + 24} ${cy + 5 + oB} ${cx + 28} ${cy + 4 + oB} Q ${cx + 23} ${cy + 10 + oB} ${cx + 12} ${cy + 9 + oB * 0.5} Z" fill="url(#dBillLow)" ${stroke(0.9, '#A8520A')}/>`;
  return `<g transform="rotate(${tilt} ${cx} ${cy + 12})">` +
    `<circle cx="${cx}" cy="${cy}" r="19" fill="url(#dHead)" ${stroke(1.3)}/>` +
    // downy tuft and brown cap markings
    `<path d="M ${cx - 4} ${cy - 18} q -2 -7 3 -9 M ${cx + 1} ${cy - 19} q 1 -7 6 -7" fill="none" stroke="#E3A41C" stroke-width="1.5" stroke-linecap="round"/>` +
    `<path d="M ${cx - 17} ${cy - 5} Q ${cx - 14} ${cy - 19} ${cx + 3} ${cy - 18} Q ${cx - 6} ${cy - 11} ${cx - 8} ${cy - 1} Z" fill="#A9772C" opacity="0.5"/>` +
    `<path d="M ${cx + 2} ${cy - 3} Q ${cx - 8} ${cy - 3} ${cx - 16} ${cy + 3}" fill="none" stroke="#7A5420" stroke-width="2.6" opacity="0.6" stroke-linecap="round"/>` +
    `<ellipse cx="${cx - 6}" cy="${cy - 10}" rx="6" ry="3" fill="#fff" opacity="0.5" transform="rotate(-25 ${cx - 6} ${cy - 10})"/>` +
    `<ellipse cx="${cx + 4}" cy="${cy + 8}" rx="5" ry="3" fill="#F29A6B" opacity="0.35"/>` +
    billSvg + eye(cx + 5, cy - 3, eyes) + `</g>`;
}

/**
 * Standing / posed duckling.
 *  wing: 'rest' | 'up' | 'point' | 'flapUp' | 'flapDown'
 */
function duck({ phase = null, bob = 0, rot = 0, eyes = 'open', bill = 0, headDy = 0, headTilt = 0, wing = 'rest', dangle = false, extra = '', farWing = false } = {}) {
  const bx = 60, by = 90 + bob, rx = 30, ry = 23;
  const sw = phase === null ? [0, 0] : [[-5, 5], [0, 0], [5, -5], [0, 0]][phase % 4];
  const lf = phase === null ? [0, 0] : [[4, 0], [0, 0], [0, 4], [0, 0]][phase % 4];
  const dy = dangle ? 3 : 0;
  const hx = 88, hy = 63 + bob + headDy;
  const wingSvg = wing === 'rest' ? wingRest(bx - 2, by + 1)
    : wing === 'up' ? wingSpread(bx + 8, by - 6, -62, 0.95)
    : wing === 'point' ? wingSpread(bx + 17, by - 3, -6, 1.15)
    : wing === 'flapUp' ? wingSpread(bx + 6, by - 8, -88, 0.95)
    : wingSpread(bx + 6, by - 4, -8, 0.95);
  const far = farWing ? wingSpread(bx + 2, by - 10, wing === 'flapDown' ? -36 : -78, 0.9, true) : '';
  const upper =
    far + body(bx, by, rx, ry) + wingSvg + head(hx, hy, { eyes, bill, tilt: headTilt }) + extra;
  return svgWrap(
    shadow() +
    foot(50 + sw[0], FLOOR - 0 + dy, { lift: lf[0], back: true }) +
    foot(70 + sw[1], FLOOR - 0 + dy, { lift: lf[1] }) +
    `<g transform="rotate(${rot} 62 122)">${upper}</g>`,
    { defs: DEFS },
  );
}

function sitting({ eyes = 'open', bill = 0, extra = '', blink = false } = {}) {
  const bx = 60, by = 100, rx = 31, ry = 18;
  return svgWrap(
    shadow(62, 32) +
    body(bx, by, rx, ry) + wingRest(bx - 2, by + 1) +
    // feet tucked in front
    `<path d="M 76 120 Q 86 116 94 121 Q 86 122 76 122 Z" fill="#F58B1E" ${stroke(0.9, '#A8520A')}/>` +
    head(88, 76, { eyes: blink ? 'closed' : eyes, bill }) + extra,
    { defs: DEFS },
  );
}

function sleeping({ extra = '', breathe = 0 } = {}) {
  const bx = 62, by = 102 - breathe, rx = 34, ry = 19 + breathe;
  return svgWrap(
    shadow(62, 36) +
    body(bx, by, rx, ry) +
    // head tucked down onto the chest, bill resting sideways
    head(86, 98, { eyes: 'closed', tilt: 28 }) +
    wingRest(bx - 4, by - 2, 1.05) + extra,
    { defs: DEFS },
  );
}

const SPARK = (dy = 0) =>
  [[16, 44], [112, 30], [26, 20]].map(([x, y], i) =>
    `<path d="M ${x} ${y - 4 - dy * (i % 2)} l 1.2 2.8 l 2.8 1.2 l -2.8 1.2 l -1.2 2.8 l -1.2 -2.8 l -2.8 -1.2 l 2.8 -1.2 z" fill="#FFE57A" stroke="#E0B030" stroke-width="0.5"/>`).join('');

const anims = {
  idle: { fps: 2, frames: [duck({}), duck({ rot: -1.5, headTilt: -3 }), duck({ eyes: 'closed' }), duck({ rot: 1.5, headTilt: 3 })] },
  walk: { fps: 8, frames: [0, 1, 2, 3].map((p) => duck({ phase: p, rot: [-5, 0, 5, 0][p], bob: p % 2 ? -2 : 0, headTilt: [3, 0, -3, 0][p] })) },
  sit: { fps: 1.5, frames: [sitting({}), sitting({ bill: 0 }), sitting({ blink: true }), sitting({})] },
  sleep: { fps: 1, frames: [sleeping({ extra: SLEEP_MARKS(0, 104) }), sleeping({ breathe: 1.5, extra: SLEEP_MARKS(6, 104) })] },
  watch: { fps: 1.5, frames: [duck({ eyes: 'up', headDy: -4, headTilt: -8 }), duck({ eyes: 'up', headDy: -5, headTilt: -12 }), duck({ eyes: 'up', headDy: -4, headTilt: -8 }), duck({ eyes: 'closed', headDy: -5, headTilt: -12 })] },
  point: { fps: 2, frames: [duck({ wing: 'point', bill: 4, eyes: 'open', rot: 3 }), duck({ wing: 'point', bill: 6, eyes: 'wide', rot: 3, bob: -1 })] },
  alert: {
    fps: 4,
    frames: [
      duck({ wing: 'up', farWing: true, bill: 6, eyes: 'wide', headDy: -3, extra: BANG(118, 30) }),
      duck({ wing: 'up', farWing: true, bill: 8, eyes: 'wide', headDy: -3, bob: -7, extra: BANG(118, 30) }),
    ],
  },
  happy: {
    fps: 5,
    frames: [
      duck({ wing: 'flapUp', farWing: true, bill: 4, eyes: 'happy', extra: HEART() }),
      duck({ wing: 'flapDown', farWing: true, bill: 6, eyes: 'happy', bob: -5, extra: HEART() }),
    ],
  },
  drag: {
    fps: 2,
    frames: [
      duck({ wing: 'flapUp', bill: 5, eyes: 'worried', dangle: true, bob: -8, headTilt: -4 }),
      duck({ wing: 'flapDown', bill: 5, eyes: 'worried', dangle: true, bob: -10, headTilt: 4 }),
    ],
  },
  // Double-click trick: a flapping hop with a loud "quack".
  trick: {
    fps: 8,
    frames: [
      duck({ wing: 'flapUp', farWing: true, bill: 8, eyes: 'happy', bob: -14, extra: SPARK(0) }),
      duck({ wing: 'flapDown', farWing: true, bill: 4, eyes: 'happy', bob: -22, extra: SPARK(3) }),
      duck({ wing: 'flapUp', farWing: true, bill: 8, eyes: 'happy', bob: -14, extra: SPARK(1) }),
      duck({ wing: 'flapDown', farWing: true, bill: 3, eyes: 'happy', bob: -4, extra: SPARK(2) }),
    ],
  },
};

writePack('duckling', {
  name: 'Pip',
  petLines: ['Quack!', '*peep peep*', '*waddles happily*', '*fluffs feathers*', 'Peep!'],
  doubleClick: { animation: 'trick', seconds: 3, say: 'Quack quack!', effect: { type: 'confetti' } },
}, anims);
