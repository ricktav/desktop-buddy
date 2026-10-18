// Rubber bath-toy duckling "Squeaky": a glossy yellow squeaky duck floating on
// a puddle of bathwater. Run: node scripts/gen-rubberduck-sprites.mjs
import { svgWrap, writePack, SLEEP_MARKS, BANG, HEART } from './lib/sprite.mjs';

const DEFS = `
<radialGradient id="tBody" cx="0.36" cy="0.28" r="0.9">
  <stop offset="0" stop-color="#FFF08A"/><stop offset="0.45" stop-color="#FFD51F"/><stop offset="1" stop-color="#EFA000"/>
</radialGradient>
<linearGradient id="tBill" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#FFAA2B"/><stop offset="1" stop-color="#E86A00"/>
</linearGradient>
<linearGradient id="tWater" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#C9F0FF" stop-opacity="0.95"/><stop offset="1" stop-color="#62BDF2" stop-opacity="0.9"/>
</linearGradient>`;
const OUT = '#B36A00';
const stroke = (w = 1.4, c = OUT) => `stroke="${c}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;

function water(ring = 0) {
  const r = 34 + ring * 4;
  return `<ellipse cx="64" cy="118.5" rx="44" ry="6" fill="url(#tWater)" stroke="#4FA8E0" stroke-width="1"/>` +
    `<ellipse cx="64" cy="118.5" rx="${r}" ry="${(r / 44 * 4).toFixed(1)}" fill="none" stroke="#fff" stroke-width="1.3" opacity="${(0.85 - ring * 0.15).toFixed(2)}"/>`;
}
const lip = () => `<path d="M 24 118 Q 64 128 104 118" fill="none" stroke="#DFF6FF" stroke-width="2.2" stroke-linecap="round" opacity="0.9"/>`;

function eye(cx, cy, mode) {
  switch (mode) {
    case 'closed': return `<path d="M ${cx - 4} ${cy} q 4 3.6 8 0" fill="none" stroke="#2A1A00" stroke-width="2.2" stroke-linecap="round"/>`;
    case 'happy': return `<path d="M ${cx - 4} ${cy + 1.5} q 4 -6 8 0" fill="none" stroke="#2A1A00" stroke-width="2.4" stroke-linecap="round"/>`;
    case 'wide': return `<circle cx="${cx}" cy="${cy}" r="5.6" fill="#fff" ${stroke(1)}/><circle cx="${cx}" cy="${cy}" r="3.3" fill="#111"/><circle cx="${cx + 1.4}" cy="${cy - 1.3}" r="1.1" fill="#fff"/>`;
    case 'up': return `<circle cx="${cx}" cy="${cy}" r="4.6" fill="#fff" ${stroke(0.9)}/><circle cx="${cx + 0.5}" cy="${cy - 1.8}" r="3" fill="#111"/><circle cx="${cx + 1.5}" cy="${cy - 2.8}" r="1" fill="#fff"/>`;
    case 'worried': return `<circle cx="${cx}" cy="${cy}" r="4.2" fill="#fff" ${stroke(0.9)}/><circle cx="${cx}" cy="${cy + 1}" r="3" fill="#111"/><circle cx="${cx + 1.2}" cy="${cy}" r="1" fill="#fff"/>` +
      `<path d="M ${cx - 5} ${cy - 6} l 9 2.6" fill="none" ${stroke(1.7, '#7A4500')}/>`;
    default: return `<circle cx="${cx}" cy="${cy}" r="3.6" fill="#111"/><circle cx="${cx + 1.3}" cy="${cy - 1.3}" r="1.2" fill="#fff"/>`;
  }
}

/** The duck itself, drawn around the water line. Everything is wrapped so it can rock and squash. */
function toyDuck({ rot = 0, sx = 1, sy = 1, dy = 0, eyes = 'open', bill = 'closed', wave = 0, ring = 0, extra = '', gloss = true } = {}) {
  const billSvg =
    bill === 'closed'
      ? `<path d="M 105 52 Q 121 49 127 58 Q 120 64 105 63 Z" fill="url(#tBill)" ${stroke(1.3, '#B85A00')}/><path d="M 107 59.5 Q 118 61.5 125 58.5" fill="none" ${stroke(1.1, '#B85A00')}/>`
      : bill === 'open'
        ? `<path d="M 105 49 Q 121 45 127 54 Q 120 59 105 58 Z" fill="url(#tBill)" ${stroke(1.3, '#B85A00')}/>` +
          `<path d="M 105 58 Q 118 58 124 61 Q 118 71 105 68 Z" fill="#E86A00" ${stroke(1.3, '#B85A00')}/><path d="M 108 59 Q 118 60 122 62" fill="none" stroke="#8E1E1E" stroke-width="3" stroke-linecap="round"/>`
        : /* up */ `<path d="M 105 46 Q 121 40 127 49 Q 120 55 105 56 Z" fill="url(#tBill)" ${stroke(1.3, '#B85A00')}/><path d="M 105 56 Q 117 55 123 56 Q 118 64 105 64 Z" fill="#E86A00" ${stroke(1.3, '#B85A00')}/>`;
  const duck =
    // body with upswept tail
    `<path d="M 20 76 C 24 100 38 117 64 117 C 92 117 105 100 101 84 C 97 73 84 71 76 73 C 60 75 44 84 20 76 Z" fill="url(#tBody)" ${stroke(1.6)}/>` +
    `<path d="M 24 80 C 26 90 30 97 36 103" fill="none" stroke="#fff" stroke-width="3" opacity="0.55" stroke-linecap="round"/>` +
    // wing bump
    `<path d="M 44 92 Q 56 79 78 88 Q 71 106 53 104 Q 43 101 44 92 Z" fill="#FFC200" ${stroke(1.3)}/>` +
    `<path d="M 50 94 Q 60 86 72 91" fill="none" stroke="#fff" stroke-width="2.2" opacity="0.6" stroke-linecap="round"/>` +
    // head
    `<circle cx="88" cy="57" r="22" fill="url(#tBody)" ${stroke(1.6)}/>` +
    (gloss ? `<ellipse cx="78" cy="44" rx="8" ry="4.2" fill="#fff" opacity="0.8" transform="rotate(-32 78 44)"/><circle cx="68" cy="52" r="1.8" fill="#fff" opacity="0.7"/>` : '') +
    `<ellipse cx="93" cy="64" rx="5.5" ry="3.2" fill="#FF7B5C" opacity="0.4"/>` +
    billSvg + eye(95, 51, eyes);
  return svgWrap(
    water(ring) +
    `<g transform="translate(-7 ${dy}) translate(64 117) rotate(${rot}) scale(${sx} ${sy}) translate(-64 -117)">${duck}</g>` +
    lip() + extra,
    { defs: DEFS },
  );
}

const SQUEAK = `<path d="M 110 36 l 4 -7 M 119 40 l 7 -5 M 123 49 l 7 -1" fill="none" stroke="#3B8FCB" stroke-width="2.4" stroke-linecap="round"/>`;

const anims = {
  idle: { fps: 2, frames: [toyDuck({ rot: -2, ring: 0 }), toyDuck({ rot: 0, dy: -1, ring: 1 }), toyDuck({ rot: 2, ring: 0 }), toyDuck({ rot: 0, dy: -1, ring: 1, eyes: 'closed' })] },
  walk: { fps: 8, frames: [0, 1, 2, 3].map((p) => toyDuck({ rot: [-9, 0, 9, 0][p], dy: p % 2 ? -5 : 0, sy: p % 2 ? 1.05 : 0.97, sx: p % 2 ? 0.97 : 1.03, ring: p % 2 })) },
  sit: { fps: 1.5, frames: [toyDuck({ sy: 0.88, sx: 1.08 }), toyDuck({ sy: 0.9, sx: 1.06, ring: 1 }), toyDuck({ sy: 0.88, sx: 1.08, eyes: 'closed' }), toyDuck({ sy: 0.9, sx: 1.06, ring: 1 })] },
  sleep: {
    fps: 1,
    frames: [
      toyDuck({ sy: 0.82, sx: 1.1, rot: -4, eyes: 'closed', extra: SLEEP_MARKS(0, 108) }),
      toyDuck({ sy: 0.84, sx: 1.09, rot: -3, eyes: 'closed', ring: 1, extra: SLEEP_MARKS(6, 108) }),
    ],
  },
  watch: { fps: 1.5, frames: [toyDuck({ rot: -5, eyes: 'up' }), toyDuck({ rot: -8, eyes: 'up', ring: 1 }), toyDuck({ rot: -5, eyes: 'up' }), toyDuck({ rot: -8, eyes: 'closed', ring: 1 })] },
  point: { fps: 2, frames: [toyDuck({ rot: 10, bill: 'up', eyes: 'open', extra: SQUEAK }), toyDuck({ rot: 12, bill: 'up', eyes: 'wide', ring: 1, dy: -2, extra: SQUEAK })] },
  alert: {
    fps: 4,
    frames: [
      toyDuck({ sx: 1.08, sy: 1.1, eyes: 'wide', bill: 'open', extra: BANG(112, 34) }),
      toyDuck({ sx: 1.02, sy: 1.16, eyes: 'wide', bill: 'open', dy: -8, extra: BANG(112, 30) }),
    ],
  },
  happy: {
    fps: 5,
    frames: [
      toyDuck({ rot: -6, eyes: 'happy', bill: 'open', dy: -3, extra: HEART(116, 28) }),
      toyDuck({ rot: 6, eyes: 'happy', bill: 'open', dy: -9, ring: 1, extra: HEART(116, 22) }),
    ],
  },
  drag: { fps: 2, frames: [toyDuck({ rot: -14, eyes: 'worried', bill: 'open', dy: -10 }), toyDuck({ rot: -8, eyes: 'worried', bill: 'open', dy: -12 })] },
  // Double-click trick: gets squeezed with a loud SQUEAK.
  trick: {
    fps: 8,
    frames: [
      toyDuck({ sx: 1.22, sy: 0.74, eyes: 'happy', bill: 'open', extra: SQUEAK }),
      toyDuck({ sx: 0.86, sy: 1.22, eyes: 'wide', bill: 'open', dy: -10, ring: 1, extra: SQUEAK }),
      toyDuck({ sx: 1.2, sy: 0.76, eyes: 'happy', bill: 'open', extra: SQUEAK }),
      toyDuck({ sx: 0.9, sy: 1.16, eyes: 'wide', bill: 'open', dy: -8, ring: 1, extra: SQUEAK }),
    ],
  },
};

writePack('rubber-duck', {
  name: 'Squeaky',
  petLines: ['SQUEAK!', '*squeeeak*', '*bobs happily*', '*bubble bubble*', 'Bath time!'],
  doubleClick: { animation: 'trick', seconds: 3, say: 'SQUEAK!', effect: { type: 'arc-letters', text: 'SQUEAK' } },
}, anims);
