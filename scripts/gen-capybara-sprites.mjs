// Capybara buddy "Capy": a calm, barrel-shaped capybara with a blunt snout,
// small round ears and stubby legs. In its double-click trick it relaxes with
// a yuzu on its head while steam rises. Run: node scripts/gen-capybara-sprites.mjs
import { svgWrap, writePack, SLEEP_MARKS, BANG, HEART, FLOOR } from './lib/sprite.mjs';

const DEFS = `
<radialGradient id="cFur" cx="0.4" cy="0.25" r="0.9">
  <stop offset="0" stop-color="#C79A68"/><stop offset="0.5" stop-color="#9C6B3F"/><stop offset="1" stop-color="#6F4627"/>
</radialGradient>
<radialGradient id="cHead" cx="0.4" cy="0.25" r="0.95">
  <stop offset="0" stop-color="#CFA070"/><stop offset="0.55" stop-color="#A06F42"/><stop offset="1" stop-color="#75492A"/>
</radialGradient>
<linearGradient id="cLeg" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#7E5230"/><stop offset="0.5" stop-color="#9C6B3F"/><stop offset="1" stop-color="#6A4326"/>
</linearGradient>
<linearGradient id="cLegFar" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#5E3C22"/><stop offset="0.5" stop-color="#7A4F2D"/><stop offset="1" stop-color="#52341D"/>
</linearGradient>
<radialGradient id="yuzu" cx="0.4" cy="0.3" r="0.8">
  <stop offset="0" stop-color="#FFD25A"/><stop offset="0.6" stop-color="#FF9F1C"/><stop offset="1" stop-color="#D9730D"/>
</radialGradient>`;
const OUT = '#4A2E17';
const stroke = (w = 1.3, c = OUT) => `stroke="${c}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;

const shadow = (rx = 40) => `<ellipse cx="60" cy="122" rx="${rx}" ry="3.4" fill="#000" opacity="0.17"/>`;

function leg(x, top, dx = 0, { lift = 0, far = false } = {}) {
  const y = FLOOR - lift;
  const fill = far ? 'url(#cLegFar)' : 'url(#cLeg)';
  return `<path d="M ${x - 5.5} ${top} L ${x - 5.5 + dx} ${y - 4} Q ${x - 5.5 + dx} ${y} ${x - 1 + dx} ${y} L ${x + 3 + dx} ${y} Q ${x + 6.5 + dx} ${y} ${x + 6.5 + dx} ${y - 4} L ${x + 6.5} ${top} Z" fill="${fill}" ${stroke(1.2)}/>` +
    `<path d="M ${x - 1 + dx} ${y - 0.5} v -3 M ${x + 3 + dx} ${y - 0.5} v -3" fill="none" stroke="#2E1B0C" stroke-width="1" stroke-linecap="round"/>`;
}

function fur(cx, cy, rx, ry) {
  let d = '';
  for (let a = 200; a <= 340; a += 12) {
    const t = (a * Math.PI) / 180;
    const x = cx + Math.cos(t) * rx * 0.92, y = cy + Math.sin(t) * ry * 0.92;
    d += `M ${x.toFixed(1)} ${y.toFixed(1)} l ${(Math.cos(t) * 2.6 - 1.5).toFixed(1)} ${(Math.sin(t) * 2.6 + 2.5).toFixed(1)} `;
  }
  return `<path d="${d}" fill="none" stroke="#5E3C22" stroke-width="1.2" stroke-linecap="round" opacity="0.7"/>`;
}

function torso(cx, cy, rx, ry) {
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#cFur)" ${stroke(1.5)}/>` + fur(cx, cy, rx, ry) +
    `<ellipse cx="${cx + 2}" cy="${cy + ry * 0.5}" rx="${rx * 0.7}" ry="${ry * 0.38}" fill="#D0A36E" opacity="0.55"/>` +
    `<ellipse cx="${cx - rx * 0.25}" cy="${cy - ry * 0.5}" rx="${rx * 0.34}" ry="${ry * 0.2}" fill="#fff" opacity="0.22"/>` +
    // tiny tail nub
    `<ellipse cx="${cx - rx + 1}" cy="${cy + 2}" rx="3" ry="3.6" fill="#7A4E2D" ${stroke(1)}/>`;
}

function eye(x, y, mode) {
  switch (mode) {
    case 'closed': return `<path d="M ${x - 4} ${y} q 4 3.4 8 0" fill="none" stroke="#1E1209" stroke-width="2" stroke-linecap="round"/>`;
    case 'happy': return `<path d="M ${x - 4} ${y + 1.4} q 4 -5.4 8 0" fill="none" stroke="#1E1209" stroke-width="2.2" stroke-linecap="round"/>`;
    case 'wide': return `<circle cx="${x}" cy="${y}" r="5.2" fill="#fff" ${stroke(0.9)}/><circle cx="${x + 0.4}" cy="${y}" r="3.2" fill="#1B1008"/><circle cx="${x + 1.4}" cy="${y - 1.2}" r="1.1" fill="#fff"/>`;
    case 'up': return `<ellipse cx="${x}" cy="${y}" rx="4" ry="4.2" fill="#F6EFE4" opacity="0.95"/><circle cx="${x + 0.5}" cy="${y - 1.5}" r="3" fill="#1B1008"/><circle cx="${x + 1.5}" cy="${y - 2.5}" r="1" fill="#fff"/>`;
    case 'worried': return `<ellipse cx="${x}" cy="${y}" rx="4" ry="4.2" fill="#F6EFE4"/><circle cx="${x}" cy="${y + 1}" r="3" fill="#1B1008"/><circle cx="${x + 1.2}" cy="${y}" r="1" fill="#fff"/>` +
      `<path d="M ${x - 5} ${y - 5.6} l 9 2.4" fill="none" stroke="#3A2210" stroke-width="1.7" stroke-linecap="round"/>`;
    default: return `<circle cx="${x}" cy="${y}" r="3.2" fill="#1B1008"/><circle cx="${x + 1.2}" cy="${y - 1.2}" r="1.1" fill="#fff"/>`;
  }
}

/** Head with a blunt, boxy snout, drawn around (0,0) and moved with translate. */
function head(x, y, { eyes = 'open', mouth = 'smile', tilt = 0, earsUp = false, yuzu = false } = {}) {
  const m = mouth === 'o' ? `<ellipse cx="25" cy="9" rx="3.4" ry="4" fill="#3B1D10" ${stroke(1)}/>`
    : mouth === 'big' ? `<path d="M 15 8 Q 24 18 31 7 Q 24 11 15 8 Z" fill="#8E3B2A" ${stroke(1)}/>`
    : mouth === 'flat' ? `<path d="M 16 10 Q 24 11 30 9" fill="none" stroke="#3B2210" stroke-width="1.6" stroke-linecap="round"/>`
    : `<path d="M 16 9 Q 24 15 31 8" fill="none" stroke="#3B2210" stroke-width="1.7" stroke-linecap="round"/>`;
  return `<g transform="translate(${x} ${y}) rotate(${tilt})">` +
    // ear behind the head
    `<ellipse cx="-9" cy="${earsUp ? -20 : -18}" rx="3.8" ry="${earsUp ? 5.2 : 3.8}" fill="url(#cHead)" ${stroke(1.1)}/><ellipse cx="-9" cy="${earsUp ? -20 : -18}" rx="1.8" ry="${earsUp ? 3 : 2}" fill="#3F2515" opacity="0.8"/>` +
    // long, flat-topped head with a blunt, boxy muzzle
    `<path d="M -18 -10 Q -10 -19 8 -18 L 26 -16 Q 32 -14 32 -5 L 32 9 Q 31 16 23 16 Q 5 19 -11 15 Q -22 6 -18 -10 Z" fill="url(#cHead)" ${stroke(1.5)}/>` +
    // muzzle, brow sheen and nostrils on the top corner of the snout
    `<path d="M 14 -6 Q 22 -9 32 -5 L 32 9 Q 31 16 23 16 Q 14 16 12 8 Z" fill="#B98456" opacity="0.6"/>` +
    `<ellipse cx="-3" cy="-13" rx="8" ry="2.8" fill="#fff" opacity="0.28" transform="rotate(-10 -3 -13)"/>` +
    `<ellipse cx="28" cy="-8" rx="4.4" ry="4.2" fill="#2F1A0D" ${stroke(0.8, '#1B0E06')}/><ellipse cx="27" cy="-9.4" rx="1.4" ry="1.2" fill="#8A6A4E" opacity="0.8"/>` +
    `<circle cx="19" cy="-2" r="0.9" fill="#4A2E17"/><circle cx="24" cy="2" r="0.9" fill="#4A2E17"/><circle cx="17" cy="4" r="0.9" fill="#4A2E17"/>` +
    m + eye(7, -6, eyes) +
    (yuzu ? `<circle cx="1" cy="-26" r="7.5" fill="url(#yuzu)" ${stroke(1.1, '#B85F0A')}/><path d="M -2 -31 q 3 -3 6 0" fill="none" stroke="#B85F0A" stroke-width="0.9" opacity="0.7"/><path d="M 1 -33 q 1 -4 6 -4 q -1 4 -6 4 Z" fill="#6FAF3C" ${stroke(0.8, '#3F7A1E')}/><ellipse cx="-2" cy="-28" rx="2.4" ry="1.6" fill="#fff" opacity="0.5"/>` : '') +
    `</g>`;
}

/** Standing capybara. */
function capy({ phase = null, bob = 0, headDy = 0, tilt = 0, eyes = 'open', mouth = 'smile', earsUp = false, pointLeg = false, dangle = false, extra = '', rot = 0, yuzu = false, breathe = 0 } = {}) {
  const cx = 56, cy = 86 + bob, rx = 38, ry = 21 + breathe;
  const sw = phase === null ? [0, 0, 0, 0] : [[-5, 5, 5, -5], [0, 0, 0, 0], [5, -5, -5, 5], [0, 0, 0, 0]][phase % 4];
  const lf = phase === null ? [0, 0, 0, 0] : [[3, 0, 0, 3], [0, 0, 0, 0], [0, 3, 3, 0], [0, 0, 0, 0]][phase % 4];
  const d = dangle ? 2 : 0;
  const hx = 92, hy = 72 + bob + headDy;
  const frontNear = pointLeg
    ? `<path d="M 82 ${cy + 6} L 112 ${cy - 8}" fill="none" stroke="${OUT}" stroke-width="11.4" stroke-linecap="round"/><path d="M 82 ${cy + 6} L 112 ${cy - 8}" fill="none" stroke="url(#cLeg)" stroke-width="9" stroke-linecap="round"/><circle cx="113" cy="${cy - 9}" r="4.6" fill="#6A4326" ${stroke(1)}/>`
    : leg(86, cy + 8, sw[3], { lift: lf[3] });
  return svgWrap(
    shadow() +
    leg(36, cy + 8, sw[0], { lift: lf[0], far: true }) + leg(76, cy + 8, sw[1], { lift: lf[1], far: true }) +
    `<g transform="rotate(${rot} 60 122)">` +
    torso(cx, cy, rx, ry) + head(hx, hy, { eyes, mouth, tilt, earsUp, yuzu }) + extra + `</g>` +
    leg(46, cy + 8, sw[2], { lift: lf[2] }) + frontNear,
    { defs: DEFS },
  ).replace(/(<g transform="rotate[^>]*>)/, '$1').replace(/translate\(0 0\)/, '') + (d ? '' : '');
}

/** Lying down on its belly, legs tucked. */
function lying({ eyes = 'open', mouth = 'smile', headDy = 0, tilt = 0, yuzu = false, extra = '', breathe = 0, rest = false } = {}) {
  const cx = 58, cy = 102 - breathe, rx = 40, ry = 17 + breathe;
  return svgWrap(
    shadow(44) +
    torso(cx, cy, rx, ry) +
    // tucked front leg and paw
    `<path d="M 68 112 Q 84 106 98 113 Q 98 120 88 120 L 70 120 Q 64 119 68 112 Z" fill="url(#cLeg)" ${stroke(1.2)}/>` +
    head(rest ? 88 : 90, (rest ? 98 : 84) + headDy, { eyes, mouth, tilt, yuzu }) + extra,
    { defs: DEFS },
  );
}

const STEAM = (shift = 0) =>
  [[34, 70], [58, 62], [82, 66]].map(([x, y], i) =>
    `<path d="M ${x + shift * (i % 2 ? 1 : -1)} ${y} q -6 -8 0 -15 q 6 -7 0 -15" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" opacity="0.7"/>`).join('');

const anims = {
  idle: { fps: 2, frames: [capy({}), capy({ breathe: 0.8, tilt: -1 }), capy({ eyes: 'closed' }), capy({ breathe: 0.8, tilt: 1 })] },
  walk: { fps: 7, frames: [0, 1, 2, 3].map((p) => capy({ phase: p, bob: p % 2 ? -1.5 : 0, tilt: [2, 0, -2, 0][p] })) },
  sit: { fps: 1.2, frames: [lying({}), lying({ breathe: 1 }), lying({ eyes: 'closed' }), lying({ breathe: 1 })] },
  sleep: { fps: 0.9, frames: [lying({ eyes: 'closed', mouth: 'flat', rest: true, tilt: 14, extra: SLEEP_MARKS(0, 108) }), lying({ eyes: 'closed', mouth: 'flat', rest: true, tilt: 14, breathe: 1.5, extra: SLEEP_MARKS(6, 108) })] },
  watch: { fps: 1.5, frames: [capy({ eyes: 'up', headDy: -3, tilt: -8 }), capy({ eyes: 'up', headDy: -4, tilt: -12 }), capy({ eyes: 'up', headDy: -3, tilt: -8 }), capy({ eyes: 'closed', headDy: -4, tilt: -12 })] },
  point: { fps: 2, frames: [capy({ pointLeg: true, mouth: 'o' }), capy({ pointLeg: true, mouth: 'o', eyes: 'wide', bob: -1 })] },
  alert: {
    fps: 4,
    frames: [
      capy({ eyes: 'wide', mouth: 'o', earsUp: true, headDy: -3, extra: BANG(116, 28) }),
      capy({ eyes: 'wide', mouth: 'o', earsUp: true, headDy: -3, bob: -8, extra: BANG(116, 28) }),
    ],
  },
  happy: {
    fps: 5,
    frames: [
      capy({ eyes: 'happy', mouth: 'big', extra: HEART(112, 26) }),
      capy({ eyes: 'happy', mouth: 'big', bob: -7, tilt: -3, extra: HEART(112, 20) }),
    ],
  },
  drag: { fps: 2, frames: [capy({ eyes: 'worried', mouth: 'o', dangle: true, bob: -9, tilt: -4 }), capy({ eyes: 'worried', mouth: 'o', dangle: true, bob: -11, tilt: 4 })] },
  // Double-click trick: pure relaxation with a yuzu on the head and rising steam.
  trick: {
    fps: 2.5,
    frames: [
      lying({ eyes: 'closed', mouth: 'smile', yuzu: true, extra: STEAM(0) }),
      lying({ eyes: 'closed', mouth: 'smile', yuzu: true, breathe: 1, extra: STEAM(3) }),
      lying({ eyes: 'closed', mouth: 'smile', yuzu: true, extra: STEAM(-3) }),
      lying({ eyes: 'closed', mouth: 'smile', yuzu: true, breathe: 1, extra: STEAM(2) }),
    ],
  },
};

writePack('capybara', {
  name: 'Capy',
  petLines: ['*chill*', '*happy capybara noises*', 'Everything is fine.', '*slow blink*', 'Zen...'],
  doubleClick: { animation: 'trick', seconds: 4, say: 'Chilllll...', effect: { type: 'confetti' } },
}, anims);
