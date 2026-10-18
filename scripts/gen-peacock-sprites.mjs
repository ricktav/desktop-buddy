// Peacock buddy "Plume": a chibi peacock with a shimmering blue body, a green
// train of eye-spot feathers that trails behind it, and a big fan it opens when
// excited. Run: node scripts/gen-peacock-sprites.mjs
import { svgWrap, writePack, SLEEP_MARKS, BANG, HEART } from './lib/sprite.mjs';

const DEFS = `
<linearGradient id="fth" x1="0" y1="1" x2="0" y2="0">
  <stop offset="0" stop-color="#C2A93A"/><stop offset="0.45" stop-color="#2E9C60"/><stop offset="1" stop-color="#137C8C"/>
</linearGradient>
<linearGradient id="fthDark" x1="0" y1="1" x2="0" y2="0">
  <stop offset="0" stop-color="#8E7B2A"/><stop offset="0.5" stop-color="#1F7B4C"/><stop offset="1" stop-color="#0F5F73"/>
</linearGradient>
<radialGradient id="pBody" cx="0.38" cy="0.3" r="0.9">
  <stop offset="0" stop-color="#6AD2EC"/><stop offset="0.5" stop-color="#1F8FD0"/><stop offset="1" stop-color="#0D4C94"/>
</radialGradient>
<linearGradient id="pNeck" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#1668B4"/><stop offset="0.5" stop-color="#2FA8DC"/><stop offset="1" stop-color="#1259A6"/>
</linearGradient>
<linearGradient id="pWing" x1="0" y1="0" x2="1" y2="1">
  <stop offset="0" stop-color="#58C98C"/><stop offset="0.6" stop-color="#1F9A6B"/><stop offset="1" stop-color="#C9A93A"/>
</linearGradient>`;

const OUT = '#0A3C70';
const stroke = (w = 1.4, c = OUT) => `stroke="${c}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;

/** A feather pointing up from (0,0): leaf shape, quill, barbs and an eye-spot. */
function feather(L, W, { ocellus = true, dark = false } = {}) {
  const barbs = [0.25, 0.45, 0.65].map((t) => `<path d="M 0 ${-L * t} l ${W * 0.85} ${-L * 0.08} M 0 ${-L * t} l ${-W * 0.85} ${-L * 0.08}" stroke="#E6D27A" stroke-width="0.8" opacity="0.7" fill="none"/>`).join('');
  const cy = -L * 0.8;
  const oc = ocellus
    ? `<ellipse cx="0" cy="${cy}" rx="${W * 0.8}" ry="${W * 1.04}" fill="#E8C547" stroke="#8A6A12" stroke-width="0.8"/>` +
      `<ellipse cx="0" cy="${cy}" rx="${W * 0.6}" ry="${W * 0.84}" fill="#1FA9B8"/><ellipse cx="0" cy="${cy + 0.6}" rx="${W * 0.34}" ry="${W * 0.52}" fill="#15407E"/>` +
      `<ellipse cx="${-W * 0.14}" cy="${cy - W * 0.22}" rx="${W * 0.1}" ry="${W * 0.17}" fill="#fff" opacity="0.85"/>`
    : '';
  return `<path d="M 0 0 C ${W} ${-L * 0.2} ${W * 1.15} ${-L * 0.72} 0 ${-L} C ${-W * 1.15} ${-L * 0.72} ${-W} ${-L * 0.2} 0 0 Z" fill="url(#${dark ? 'fthDark' : 'fth'})" stroke="#0B5A45" stroke-width="1.1" stroke-linejoin="round"/>` +
    `<path d="M 0 0 L 0 ${-L * 0.97}" stroke="#E6D27A" stroke-width="1" opacity="0.9"/>` + barbs + oc;
}
const featherAt = (x, y, angle, L, W, o) => `<g transform="translate(${x} ${y}) rotate(${angle.toFixed(1)})">${feather(L, W, o)}</g>`;

/** Open fan behind the bird. open: 0 closed .. 1 full; shimmer jiggles the feathers. */
function fan(cx, cy, open, shimmer = 0) {
  if (open < 0.05) return '';
  const spread = 18 + 76 * open;
  const n = 13;
  let out = '';
  // fuller second layer behind
  for (let i = 0; i < n - 1; i++) {
    const a = -spread * 0.95 + (2 * spread * 0.95 * (i + 0.5)) / (n - 1);
    out += featherAt(cx, cy, a, (30 + 12 * Math.cos((a * Math.PI) / 180)) * (0.5 + 0.5 * open), 8, { ocellus: false, dark: true });
  }
  for (let i = 0; i < n; i++) {
    const a = -spread + (2 * spread * i) / (n - 1) + shimmer * (i % 2 ? 2.4 : -2.4);
    const L = (40 + 17 * Math.cos((a * Math.PI) / 180 * 0.95)) * (0.55 + 0.45 * open);
    out += featherAt(cx, cy, a, L, 8.6, { ocellus: true });
  }
  return `<g transform="rotate(-5 ${cx} ${cy})">${out}</g>`;
}

/** The closed train trailing behind the bird. base: direction in degrees (-90 = left, -180 = straight down). */
function train(x, y, { base = -112, sway = 0, len = 48 } = {}) {
  let out = '';
  [-30, -15, 0, 15, 30].forEach((d, i) => {
    out += featherAt(x, y, base + d * 0.6 + sway * (1 + i * 0.12), len - Math.abs(d) * 0.2, 7.6, { ocellus: true });
  });
  return out;
}

const eye = (x, y, mode) => {
  switch (mode) {
    case 'closed': return `<path d="M ${x - 3.4} ${y} q 3.4 3 6.8 0" fill="none" stroke="#08203F" stroke-width="1.9" stroke-linecap="round"/>`;
    case 'happy': return `<path d="M ${x - 3.4} ${y + 1.2} q 3.4 -5 6.8 0" fill="none" stroke="#08203F" stroke-width="2" stroke-linecap="round"/>`;
    case 'wide': return `<circle cx="${x}" cy="${y}" r="4.8" fill="#fff" ${stroke(1, '#08203F')}/><circle cx="${x + 0.4}" cy="${y}" r="2.9" fill="#08203F"/><circle cx="${x + 1.3}" cy="${y - 1.2}" r="1" fill="#fff"/>`;
    case 'up': return `<circle cx="${x}" cy="${y}" r="3.8" fill="#fff" opacity="0.92"/><circle cx="${x + 0.5}" cy="${y - 1.5}" r="2.7" fill="#08203F"/><circle cx="${x + 1.4}" cy="${y - 2.4}" r="0.9" fill="#fff"/>`;
    case 'worried': return `<circle cx="${x}" cy="${y}" r="3.6" fill="#fff" opacity="0.92"/><circle cx="${x}" cy="${y + 1}" r="2.6" fill="#08203F"/><circle cx="${x + 1}" cy="${y}" r="0.9" fill="#fff"/><path d="M ${x - 4.6} ${y - 5.4} l 8.4 2.4" fill="none" stroke="#fff" stroke-width="1.7" stroke-linecap="round"/>`;
    default: return `<circle cx="${x}" cy="${y}" r="3.4" fill="#08203F"/><circle cx="${x + 1.2}" cy="${y - 1.2}" r="1.1" fill="#fff"/>`;
  }
};

/** Head with white eyebrow, beak and crest; (hx, hy) is the head centre. */
function head(hx, hy, { eyes = 'open', beak = 0, tilt = 0, crestSway = 0, back = false } = {}) {
  const dir = back ? -1 : 1;
  const crest = [[-14, 13], [-6, 15], [3, 16], [11, 14], [18, 11]].map(([dx, h], i) => {
    const tx = hx + dir * (-1 + dx * 0.55) + crestSway * (i - 2) * 0.5, ty = hy - 12 - h;
    return `<path d="M ${hx + dir * dx * 0.12} ${hy - 9} L ${tx.toFixed(1)} ${ty.toFixed(1)}" stroke="#0F4F66" stroke-width="1.3" stroke-linecap="round"/>` +
      `<circle cx="${tx.toFixed(1)}" cy="${(ty - 0.6).toFixed(1)}" r="2.5" fill="#25B6BE" ${stroke(0.8, '#0A5E66')}/>`;
  }).join('');
  const bx = hx + dir * 10;
  const upper = `<path d="M ${bx - dir * 1} ${hy - 4 - beak * 0.4} Q ${bx + dir * 14} ${hy - beak * 0.5} ${bx + dir * 1} ${hy + 3 - beak * 0.3} Z" fill="#E2CBA0" ${stroke(0.9, '#8A7344')}/>`;
  const lower = beak > 0 ? `<path d="M ${bx - dir * 1} ${hy + 3 - beak * 0.2} Q ${bx + dir * 10} ${hy + 3 + beak * 0.6} ${bx} ${hy + 6 + beak * 0.8} Z" fill="#B79F73" ${stroke(0.9, '#8A7344')}/>` : '';
  return `<g transform="rotate(${tilt} ${hx} ${hy + 8})">` + crest +
    `<circle cx="${hx}" cy="${hy}" r="11.8" fill="url(#pBody)" ${stroke(1.5)}/>` +
    `<ellipse cx="${hx - dir * 4}" cy="${hy - 6}" rx="5" ry="2.6" fill="#fff" opacity="0.4" transform="rotate(-20 ${hx - dir * 4} ${hy - 6})"/>` +
    `<path d="M ${hx - dir * 1} ${hy - 8} q ${dir * 6} -3 ${dir * 11} 1" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>` +
    `<ellipse cx="${hx + dir * 4}" cy="${hy + 5}" rx="3.6" ry="1.9" fill="#fff" opacity="0.95"/>` +
    lower + upper + eye(hx + dir * 4.4, hy - 2, eyes) + `</g>`;
}

const leg = (x, y0, y1, swing = 0, lift = 0) =>
  `<path d="M ${x} ${y0} L ${x + swing} ${y1 - lift - 2}" stroke="#7A6446" stroke-width="2.8" stroke-linecap="round"/>` +
  `<path d="M ${x + swing - 2} ${y1 - lift} l 9 1 M ${x + swing} ${y1 - lift - 1} l 7 -3 M ${x + swing} ${y1 - lift - 1} l 5 4" fill="none" stroke="#7A6446" stroke-width="2" stroke-linecap="round"/>`;

/** The flank wing with scalloped feathers; point/up raise it like an arm. */
function wing(cx, cy, mode = 'rest') {
  if (mode === 'point') return `<g transform="translate(${cx + 8} ${cy - 4}) rotate(-38)"><path d="M 0 0 Q 10 -9 28 -5 Q 38 0 36 7 Q 20 10 6 8 Z" fill="url(#pWing)" ${stroke(1.2, '#0B5A45')}/><path d="M 10 0 L 32 3 M 8 5 L 30 7" stroke="#E6D27A" stroke-width="1" opacity="0.8"/></g>`;
  if (mode === 'up') return `<g transform="translate(${cx + 4} ${cy - 6}) rotate(-84)"><path d="M 0 0 Q 10 -9 26 -5 Q 36 0 34 7 Q 20 10 6 8 Z" fill="url(#pWing)" ${stroke(1.2, '#0B5A45')}/><path d="M 10 0 L 30 3 M 8 5 L 28 7" stroke="#E6D27A" stroke-width="1" opacity="0.8"/></g>`;
  return `<g transform="translate(${cx} ${cy}) rotate(-8)"><path d="M -15 0 Q -12 -10 2 -10 Q 15 -7 17 4 Q 6 9 -6 8 Q -15 7 -15 0 Z" fill="url(#pWing)" ${stroke(1.2, '#0B5A45')}/>` +
    `<path d="M -8 1 q 4 -2 8 0 M -9 5 q 5 -2 11 0 M -4 -4 q 4 -2 9 0" fill="none" stroke="#E6D27A" stroke-width="1" opacity="0.85"/></g>`;
}

/** Standing peacock. fan: 0..1; sit/tuck for resting poses. */
function peacock({ bob = 0, phase = null, neckUp = 0, headTilt = 0, eyes = 'open', beak = 0, fanOpen = 0, shimmer = 0, sway = 0, wingMode = 'rest', sit = false, extra = '', crestSway = 0, dangle = false } = {}) {
  const bx = 62, by = (sit ? 98 : 90) + bob, rx = 24, ry = sit ? 15 : 18.5;
  const sw = phase === null ? [0, 0] : [[-5, 5], [0, 0], [5, -5], [0, 0]][phase % 4];
  const lf = phase === null ? [0, 0] : [[4, 0], [0, 0], [0, 4], [0, 0]][phase % 4];
  const hx = 90, hy = (sit ? 66 : 52) + bob - neckUp;
  const neckBase = { x: 78, y: by - 8 };
  const neckPath = `M ${neckBase.x} ${neckBase.y} C ${neckBase.x + 10} ${neckBase.y - 6} ${hx - 6} ${hy + 16} ${hx - 2} ${hy + 6}`;
  const legs = sit ? '' : leg(56, by + 14, 121, sw[0] - (dangle ? 0 : 0), lf[0]) + leg(70, by + 14, 121, sw[1], lf[1]);
  return svgWrap(
    `<ellipse cx="62" cy="122" rx="30" ry="3" fill="#000" opacity="0.15"/>` +
    (fanOpen > 0.05 ? fan(62, by - 6, fanOpen, shimmer) : train(46, by + 3, { base: sit ? -98 : -112, sway, len: sit ? 44 : 48 })) +
    legs +
    `<ellipse cx="${bx}" cy="${by}" rx="${rx}" ry="${ry}" fill="url(#pBody)" ${stroke(1.6)}/>` +
    `<ellipse cx="${bx - 8}" cy="${by - 8}" rx="9" ry="4" fill="#fff" opacity="0.28" transform="rotate(-20 ${bx - 8} ${by - 8})"/>` +
    // tail root where the feathers join
    `<path d="M ${bx - rx + 1} ${by - 2} q -8 2 -9 8 q 6 0 10 -3 z" fill="#1F9A6B" ${stroke(1, '#0B5A45')}/>` +
    wing(bx - 2, by + 2, wingMode) +
    `<path d="${neckPath}" fill="none" stroke="${OUT}" stroke-width="14.5" stroke-linecap="round"/><path d="${neckPath}" fill="none" stroke="url(#pNeck)" stroke-width="11.5" stroke-linecap="round"/>` +
    head(hx, hy, { eyes, beak, tilt: headTilt, crestSway }) + extra,
    { defs: DEFS },
  );
}

/** Asleep: the head turned back and tucked on the shoulder, the train lying behind. */
function sleeping({ extra = '', breathe = 0 } = {}) {
  const bx = 64, by = 104 - breathe, rx = 27, ry = 16 + breathe;
  return svgWrap(
    `<ellipse cx="62" cy="122" rx="34" ry="3" fill="#000" opacity="0.15"/>` +
    train(40, by + 2, { base: -96, len: 42 }) +
    `<ellipse cx="${bx}" cy="${by}" rx="${rx}" ry="${ry}" fill="url(#pBody)" ${stroke(1.6)}/>` +
    head(78, by - 8, { eyes: 'closed', back: true, tilt: 14 }) +
    wing(bx - 4, by + 1) + extra,
    { defs: DEFS },
  );
}

const SPARKS = (dy = 0) =>
  [[14, 30], [112, 26], [24, 10], [118, 56]].map(([x, y], i) =>
    `<path d="M ${x} ${y - 4 - dy * (i % 2)} l 1.2 2.8 l 2.8 1.2 l -2.8 1.2 l -1.2 2.8 l -1.2 -2.8 l -2.8 -1.2 l 2.8 -1.2 z" fill="#FFE57A" stroke="#E0B030" stroke-width="0.5"/>`).join('');

const anims = {
  idle: { fps: 2, frames: [peacock({ sway: 0 }), peacock({ sway: 3, crestSway: 2 }), peacock({ eyes: 'closed' }), peacock({ sway: -3, crestSway: -2 })] },
  walk: { fps: 8, frames: [0, 1, 2, 3].map((p) => peacock({ phase: p, bob: p % 2 ? -2 : 0, sway: [-5, 0, 5, 0][p], headTilt: [-3, 0, 3, 0][p], crestSway: [2, 0, -2, 0][p] })) },
  sit: { fps: 1.5, frames: [peacock({ sit: true }), peacock({ sit: true, sway: 2 }), peacock({ sit: true, eyes: 'closed' }), peacock({ sit: true, sway: -2 })] },
  sleep: { fps: 1, frames: [sleeping({ extra: SLEEP_MARKS(0, 104) }), sleeping({ breathe: 1.5, extra: SLEEP_MARKS(6, 104) })] },
  watch: { fps: 1.5, frames: [peacock({ eyes: 'up', neckUp: 6, headTilt: -8 }), peacock({ eyes: 'up', neckUp: 8, headTilt: -12, crestSway: 2 }), peacock({ eyes: 'up', neckUp: 6, headTilt: -8 }), peacock({ eyes: 'closed', neckUp: 8, headTilt: -12 })] },
  point: { fps: 2, frames: [peacock({ wingMode: 'point', beak: 4 }), peacock({ wingMode: 'point', beak: 6, eyes: 'wide', bob: -1 })] },
  alert: {
    fps: 4,
    frames: [
      peacock({ fanOpen: 0.7, eyes: 'wide', beak: 6, neckUp: 3, extra: BANG(118, 26) }),
      peacock({ fanOpen: 1, eyes: 'wide', beak: 8, neckUp: 4, bob: -6, extra: BANG(118, 26) }),
    ],
  },
  happy: {
    fps: 5,
    frames: [
      peacock({ fanOpen: 1, shimmer: 1, eyes: 'happy', beak: 4, extra: HEART(116, 36) }),
      peacock({ fanOpen: 1, shimmer: -1, eyes: 'happy', beak: 6, bob: -5, extra: HEART(116, 30) }),
    ],
  },
  drag: { fps: 2, frames: [peacock({ eyes: 'worried', beak: 5, bob: -10, wingMode: 'up', sway: 8 }), peacock({ eyes: 'worried', beak: 5, bob: -12, wingMode: 'up', sway: -8 })] },
  // Double-click trick: the full fan opens and shimmers with sparkles.
  trick: {
    fps: 6,
    frames: [
      peacock({ fanOpen: 0.5, eyes: 'happy', beak: 3, extra: SPARKS(0) }),
      peacock({ fanOpen: 1, shimmer: 1, eyes: 'happy', beak: 5, neckUp: 3, extra: SPARKS(3) }),
      peacock({ fanOpen: 1, shimmer: -1, eyes: 'happy', beak: 5, neckUp: 4, bob: -3, extra: SPARKS(1) }),
      peacock({ fanOpen: 1, shimmer: 1, eyes: 'happy', beak: 5, neckUp: 3, extra: SPARKS(2) }),
    ],
  },
};

writePack('peacock', {
  name: 'Plume',
  petLines: ['Admire me!', '*struts*', 'Fabulous, I know.', '*shimmers*', 'Eyes on the feathers!'],
  doubleClick: { animation: 'trick', seconds: 3.5, say: 'Ta-da!', effect: { type: 'confetti' } },
}, anims);
