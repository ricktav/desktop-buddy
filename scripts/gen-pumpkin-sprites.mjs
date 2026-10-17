// Halloween pumpkin buddy "Jack": a jack-o'-lantern on little vine legs with
// a flickering candle glow. Run: node scripts/gen-pumpkin-sprites.mjs
import { svgWrap, writePack, SLEEP_MARKS, BANG, HEART, FLOOR } from './lib/sprite.mjs';

const DEFS = `
<radialGradient id="pk" cx="0.4" cy="0.35" r="0.75">
  <stop offset="0" stop-color="#FFB347"/><stop offset="0.55" stop-color="#FF8A1F"/><stop offset="1" stop-color="#C9520A"/>
</radialGradient>
<linearGradient id="flame" x1="0" y1="1" x2="0" y2="0">
  <stop offset="0" stop-color="#FFF4A8"/><stop offset="0.5" stop-color="#FFC43D"/><stop offset="1" stop-color="#FF6A00"/>
</linearGradient>
<radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
  <stop offset="0" stop-color="#FFD27A" stop-opacity="0.75"/><stop offset="1" stop-color="#FFD27A" stop-opacity="0"/>
</radialGradient>`;
const OUT = '#5A2A08', RIB = '#B9460A', LIT = '#FFE27A', DARK = '#3B1A06', STEM = '#6B8E23', STEM_DK = '#3F5A12';

function stroke(w = 1.8, c = OUT) {
  return `stroke="${c}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
}

/** Carved face. `lit` picks the glowing fill; eyes/mouth change the cut shapes. */
function carved(cx, cy, rx, ry, { lit = true, eyes = 'open', mouth = 'grin' } = {}) {
  const fill = lit ? LIT : DARK;
  const inner = lit ? `<circle cx="${cx}" cy="${cy}" r="${rx * 0.9}" fill="url(#halo)"/>` : '';
  const ey = cy - ry * 0.25, ex = rx * 0.42;
  let e;
  switch (eyes) {
    case 'closed': e = `<path d="M ${cx - ex - 7} ${ey} q 7 4 14 0 M ${cx + ex - 7} ${ey} q 7 4 14 0" fill="none" ${stroke(2.4, DARK)}/>`; break;
    case 'happy': e = `<path d="M ${cx - ex - 7} ${ey + 2} q 7 -8 14 0 M ${cx + ex - 7} ${ey + 2} q 7 -8 14 0" fill="none" ${stroke(3, fill)}/>`; break;
    case 'wide': e = `<circle cx="${cx - ex}" cy="${ey}" r="7" fill="${fill}" ${stroke(1.4)}/><circle cx="${cx + ex}" cy="${ey}" r="7" fill="${fill}" ${stroke(1.4)}/>` +
      `<circle cx="${cx - ex}" cy="${ey}" r="2.5" fill="${DARK}"/><circle cx="${cx + ex}" cy="${ey}" r="2.5" fill="${DARK}"/>`; break;
    case 'up': e = `<path d="M ${cx - ex} ${ey - 10} l 8 11 h -16 z M ${cx + ex} ${ey - 10} l 8 11 h -16 z" fill="${fill}" ${stroke(1.4)}/>` +
      `<circle cx="${cx - ex}" cy="${ey - 4}" r="2" fill="${DARK}"/><circle cx="${cx + ex}" cy="${ey - 4}" r="2" fill="${DARK}"/>`; break;
    case 'worried': e = `<path d="M ${cx - ex - 8} ${ey + 4} l 16 0 l -10 -10 z M ${cx + ex + 8} ${ey + 4} l -16 0 l 10 -10 z" fill="${fill}" ${stroke(1.4)}/>`; break;
    default: e = `<path d="M ${cx - ex} ${ey - 8} l 8 10 h -16 z M ${cx + ex} ${ey - 8} l 8 10 h -16 z" fill="${fill}" ${stroke(1.4)}/>`;
  }
  const nose = `<path d="M ${cx} ${cy + 2} l 4 6 h -8 z" fill="${fill}" ${stroke(1.2)}/>`;
  const my = cy + ry * 0.45;
  let m;
  if (mouth === 'grin') m = `<path d="M ${cx - 22} ${my - 4} l 6 6 l 5 -6 l 5 6 l 6 -6 l 5 6 l 6 -6 q -4 14 -16 14 q -13 0 -17 -14 z" fill="${fill}" ${stroke(1.4)}/>` +
    `<path d="M ${cx - 10} ${my + 2} v 5 M ${cx + 8} ${my + 2} v 5" ${stroke(2.2, lit ? '#C9520A' : '#1E0C03')}/>`;
  else if (mouth === 'o') m = `<ellipse cx="${cx}" cy="${my + 2}" rx="6" ry="7" fill="${fill}" ${stroke(1.4)}/>`;
  else if (mouth === 'flat') m = `<path d="M ${cx - 12} ${my} h 24 l -3 4 h -18 z" fill="${fill}" ${stroke(1.4)}/>`;
  else if (mouth === 'big') m = `<path d="M ${cx - 26} ${my - 6} l 7 7 l 6 -7 l 6 7 l 7 -7 l 7 7 q -3 18 -20 18 q -17 0 -20 -18 z" fill="${fill}" ${stroke(1.4)}/>` +
    `<path d="M ${cx - 8} ${my + 1} v 6 M ${cx + 9} ${my + 1} v 6" ${stroke(2.2, '#C9520A')}/>`;
  else m = `<path d="M ${cx - 16} ${my - 2} q 16 12 32 0" fill="none" ${stroke(3, fill)}/>`;
  return inner + e + nose + m;
}

function pumpkinBody(cx, cy, rx, ry) {
  const ribs = [-0.55, -0.2, 0.2, 0.55].map((t) =>
    `<path d="M ${cx + rx * t} ${cy - ry + 3} q ${rx * t * 0.35} ${ry} 0 ${ry * 2 - 6}" fill="none" stroke="${RIB}" stroke-width="1.8" opacity="0.7"/>`).join('');
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#pk)" ${stroke(2)}/>` + ribs +
    `<ellipse cx="${cx - rx * 0.35}" cy="${cy - ry * 0.5}" rx="${rx * 0.25}" ry="${ry * 0.18}" fill="#fff" opacity="0.25"/>`;
}

function stem(cx, top, { flame = 0 } = {}) {
  const fl = flame
    ? `<path d="M ${cx + 2} ${top - 2} q -10 -${12 * flame} -2 -${22 * flame} q 2 ${8 * flame} 6 ${10 * flame} q 6 -${6 * flame} 2 -${16 * flame} q 10 ${10 * flame} 2 ${28 * flame} z" fill="url(#flame)" ${stroke(1.2, '#D9530A')}/>`
    : '';
  return fl + `<path d="M ${cx - 5} ${top + 2} q 1 -12 6 -14 q 7 -1 6 10 l -2 6 z" fill="${STEM}" ${stroke(1.6, STEM_DK)}/>` +
    `<path d="M ${cx + 6} ${top - 4} c 8 -6 14 0 10 6 c -3 -4 -7 -4 -10 -6 z" fill="#7FB33A" ${stroke(1.2, STEM_DK)}/>` +
    `<path d="M ${cx + 8} ${top - 6} q 8 -10 14 -4" fill="none" ${stroke(1.4, STEM_DK)}/>`;
}

function leg(x, top, dx, { lift = 0, dangle = 0 } = {}) {
  const y = FLOOR - lift + dangle;
  return `<path d="M ${x} ${top} Q ${x + dx * 0.4} ${top + 10} ${x + dx} ${y - 3}" fill="none" ${stroke(7, STEM_DK)}/>` +
    `<path d="M ${x} ${top} Q ${x + dx * 0.4} ${top + 10} ${x + dx} ${y - 3}" fill="none" ${stroke(4.6, STEM)}/>` +
    `<path d="M ${x + dx - 7} ${y} q 7 -8 15 0 q -7 4 -15 0 z" fill="#7FB33A" ${stroke(1.3, STEM_DK)}/>`;
}

/** Vine arm from the side of the pumpkin to (ex, ey), ending in a leaf. */
function vineArm(x, y, ex, ey) {
  const mx = (x + ex) / 2, my = (y + ey) / 2 - 10;
  return `<path d="M ${x} ${y} Q ${mx} ${my} ${ex} ${ey}" fill="none" ${stroke(6.5, STEM_DK)}/>` +
    `<path d="M ${x} ${y} Q ${mx} ${my} ${ex} ${ey}" fill="none" ${stroke(4, STEM)}/>` +
    `<path d="M ${ex} ${ey} c 6 -8 14 -4 10 4 c -4 -3 -8 -2 -10 -4 z" fill="#7FB33A" ${stroke(1.3, STEM_DK)}/>`;
}

function pose({ bob = 0, squash = 0, phase = null, lit = true, eyes = 'open', mouth = 'grin', flame = 0, arm = null, dangle = 0, extra = '' } = {}) {
  const rx = 40 + squash * 6, ry = 32 - squash * 6;
  const cy = FLOOR - 14 - ry + bob;
  const cx = 64;
  const sw = phase === null ? [0, 0] : [[-5, 5], [0, 0], [5, -5], [0, 0]][phase % 4];
  const lift = phase === null ? [0, 0] : [[4, 0], [0, 0], [0, 4], [0, 0]][phase % 4];
  return svgWrap(
    leg(cx - 16, cy + ry - 8, sw[0], { lift: lift[0], dangle }) +
    leg(cx + 16, cy + ry - 8, sw[1], { lift: lift[1], dangle }) +
    pumpkinBody(cx, cy, rx, ry) +
    carved(cx, cy + 2, rx, ry, { lit, eyes, mouth }) +
    stem(cx, cy - ry + 2, { flame }) +
    (arm ? vineArm(cx + rx - 6, cy - 4, arm[0], arm[1]) : '') +
    extra,
    { defs: DEFS },
  );
}

const anims = {
  idle: { fps: 3, frames: [pose(), pose({ flame: 0 }), pose({ lit: true, mouth: 'grin', eyes: 'closed' }), pose()] },
  walk: { fps: 8, frames: [0, 1, 2, 3].map((p) => pose({ phase: p, bob: p % 2 ? -5 : 0, squash: p % 2 ? -0.3 : 0.2 })) },
  sit: { fps: 1.5, frames: [pose({ squash: 1, bob: 6 }), pose({ squash: 1.1, bob: 6 }), pose({ squash: 1, bob: 6, eyes: 'closed' }), pose({ squash: 1.1, bob: 6 })] },
  sleep: {
    fps: 1,
    frames: [
      pose({ squash: 1, bob: 6, lit: false, eyes: 'closed', mouth: 'flat', extra: SLEEP_MARKS(0) }),
      pose({ squash: 1, bob: 6, lit: false, eyes: 'closed', mouth: 'flat', extra: SLEEP_MARKS(6) }),
    ],
  },
  watch: { fps: 1.5, frames: [pose({ eyes: 'up', bob: -2 }), pose({ eyes: 'up', bob: -3 }), pose({ eyes: 'up', bob: -2 }), pose({ eyes: 'closed', bob: -3 })] },
  point: { fps: 2, frames: [pose({ arm: [118, 40], mouth: 'o' }), pose({ arm: [120, 36], mouth: 'o', eyes: 'wide' })] },
  alert: {
    fps: 4,
    frames: [
      pose({ eyes: 'wide', mouth: 'o', flame: 1, extra: BANG(120, 30) }),
      pose({ eyes: 'wide', mouth: 'o', flame: 1.4, bob: -8, squash: -0.4, extra: BANG(120, 30) }),
    ],
  },
  happy: {
    fps: 5,
    frames: [
      pose({ eyes: 'happy', mouth: 'big', flame: 0.8, extra: HEART() }),
      pose({ eyes: 'happy', mouth: 'big', flame: 1.1, bob: -8, squash: -0.3, extra: HEART() }),
    ],
  },
  drag: { fps: 2, frames: [pose({ eyes: 'worried', mouth: 'o', dangle: 3, bob: -6 }), pose({ eyes: 'worried', mouth: 'o', dangle: 2, bob: -8 })] },
};

writePack('pumpkin', {
  name: 'Jack',
  petLines: ['Boo!', '*flickers*', 'Trick or treat?', '*spooky giggle*', 'Happy Halloween!'],
}, anims);
