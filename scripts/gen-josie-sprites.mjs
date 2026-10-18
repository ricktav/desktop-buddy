// Dr. Josie: a chibi scientist with long wavy golden hair, big violet eyes, a
// white lab coat over a purple top and a small red-and-yellow shield emblem,
// based on the user's sticker set. Props: test tube, glasses, trophy and a
// glass dome with a virus (AAV9). Built on the shared chibi rig.
// Run: node scripts/gen-josie-sprites.mjs
import { writePack, BANG, HEART } from './lib/sprite.mjs';
import { humanAnimations, standing, stroke, OUT } from './lib/chibi.mjs';

const GOLD = '#E0AE57', GOLD_LT = '#F5D68E', GOLD_DK = '#B6822F', HAIR_OUT = '#85591B';
const SKIN = '#FCDCC8', SKIN_DK = '#E3B193';
const PURPLE = '#6B3F8F', PURPLE_DK = '#3E2257';
const COAT = '#FFFFFF', COAT_SHADE = '#DCE0EA';

const DEFS = `
<linearGradient id="hair" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="${GOLD_LT}"/><stop offset="0.35" stop-color="${GOLD}"/><stop offset="1" stop-color="${GOLD_DK}"/>
</linearGradient>
<radialGradient id="iris" cx="0.5" cy="0.35" r="0.75">
  <stop offset="0" stop-color="#D9B8FF"/><stop offset="0.55" stop-color="#9A5BE8"/><stop offset="1" stop-color="#5B2AA8"/>
</radialGradient>`;

// ---- hair --------------------------------------------------------------------

/** Volume behind the head plus two long wavy curtains that fall over the shoulders. */
function hairBack(cx, cy) {
  const curtain = (m) => {
    const X = (dx) => (cx + m * dx).toFixed(1);
    const Y = (dy) => (cy + dy).toFixed(1);
    return `<path d="M ${X(18)} ${Y(-16)} C ${X(31)} ${Y(-10)} ${X(31)} ${Y(4)} ${X(27)} ${Y(13)} ` +
      `C ${X(33)} ${Y(22)} ${X(28)} ${Y(31)} ${X(31)} ${Y(39)} C ${X(27)} ${Y(47)} ${X(18)} ${Y(46)} ${X(17)} ${Y(38)} ` +
      `C ${X(22)} ${Y(31)} ${X(15)} ${Y(25)} ${X(17)} ${Y(15)} Z" fill="url(#hair)" ${stroke(1.4, HAIR_OUT)}/>` +
      `<path d="M ${X(25)} ${Y(2)} C ${X(28)} ${Y(12)} ${X(24)} ${Y(20)} ${X(27)} ${Y(30)}" fill="none" stroke="${GOLD_LT}" stroke-width="1.6" stroke-linecap="round" opacity="0.85"/>`;
  };
  return `<circle cx="${cx}" cy="${cy - 5}" r="24.5" fill="url(#hair)" ${stroke(1.4, HAIR_OUT)}/>` + curtain(-1) + curtain(1);
}

/** Side-swept fringe, curls that frame the cheeks and a few highlight strands. */
function hairFront(cx, cy) {
  const lock = (m) => {
    const X = (dx) => (cx + m * dx).toFixed(1);
    const Y = (dy) => (cy + dy).toFixed(1);
    return `<path d="M ${X(20)} ${Y(-8)} C ${X(25)} ${Y(2)} ${X(21)} ${Y(12)} ${X(24)} ${Y(22)} C ${X(19)} ${Y(25)} ${X(15.5)} ${Y(19)} ${X(17)} ${Y(11)} ` +
      `C ${X(18)} ${Y(4)} ${X(17)} ${Y(-2)} ${X(16)} ${Y(-9)} Z" fill="url(#hair)" ${stroke(1.2, HAIR_OUT)}/>`;
  };
  return (
    lock(-1) + lock(1) +
    `<path d="M ${cx - 21} ${cy - 3} C ${cx - 25} ${cy - 27} ${cx + 25} ${cy - 29} ${cx + 21} ${cy - 3} ` +
    `C ${cx + 19} ${cy - 11} ${cx + 12} ${cy - 16} ${cx + 3} ${cy - 10} C ${cx - 2} ${cy - 17} ${cx - 12} ${cy - 15} ${cx - 21} ${cy - 3} Z" fill="url(#hair)" ${stroke(1.4, HAIR_OUT)}/>` +
    `<path d="M ${cx - 12} ${cy - 19} q 8 -6 17 -3 M ${cx - 17} ${cy - 11} q 3 -5 8 -7 M ${cx + 8} ${cy - 17} q 7 1 11 7" fill="none" stroke="${GOLD_LT}" stroke-width="1.7" stroke-linecap="round" opacity="0.9"/>` +
    `<path d="M ${cx + 3} ${cy - 10} q -4 4 -9 4" fill="none" stroke="${HAIR_OUT}" stroke-width="1" opacity="0.5"/>`
  );
}

// ---- face --------------------------------------------------------------------

const INK = '#2A1240';

function eye(x, y, mode, side) {
  const flick = `<path d="M ${x + side * 5.4} ${y - 3} l ${side * 2.4} -1.7" fill="none" stroke="${INK}" stroke-width="1.5" stroke-linecap="round"/>`;
  if (mode === 'closed') return `<path d="M ${x - 5.2} ${y} q 5.2 4.2 10.4 0" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>` + flick.replace(`${y - 3}`, `${y - 0.5}`);
  if (mode === 'happy') return `<path d="M ${x - 5.2} ${y + 1.6} q 5.2 -7 10.4 0" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>` + flick.replace(`${y - 3}`, `${y - 0.8}`);
  const r = mode === 'wide' ? 1.14 : 1;
  const dy = mode === 'up' ? -1.9 : mode === 'worried' ? 0.9 : 0;
  return (
    (mode === 'wide' ? `<ellipse cx="${x}" cy="${y}" rx="6.8" ry="8" fill="#fff" stroke="${INK}" stroke-width="1"/>` : '') +
    `<ellipse cx="${x}" cy="${y + dy * 0.3}" rx="${5.3 * r}" ry="${6.5 * r}" fill="url(#iris)" stroke="${INK}" stroke-width="1.1"/>` +
    `<ellipse cx="${x}" cy="${y + dy}" rx="${2.5 * r}" ry="${3.5 * r}" fill="#2A0F4A"/>` +
    `<circle cx="${x - 1.9}" cy="${y - 2.7 + dy}" r="1.9" fill="#fff"/><circle cx="${x + 2.1}" cy="${y + 2.4 + dy}" r="1" fill="#fff" opacity="0.9"/>` +
    `<path d="M ${x - 5.8} ${y - 2.4} Q ${x} ${y - 9.2} ${x + 5.8} ${y - 2.4}" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>` + flick
  );
}

function brow(x, y, mode, side) {
  const c = '#A8731F';
  if (mode === 'worried') {
    const inner = -side; // inner end faces the nose
    const ox = x - inner * 5, ix = x + inner * 5;
    return `<path d="M ${ox} ${y - 7.5} L ${ix} ${y - 10.8}" fill="none" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/>`;
  }
  const lift = mode === 'wide' || mode === 'up' ? 2.4 : 0;
  return `<path d="M ${x - 5} ${y - 9 - lift} q 5 -3 10 0" fill="none" stroke="${c}" stroke-width="1.7" stroke-linecap="round"/>`;
}

function face(cx, cy, { eyes = 'open', mouth = 'smile' }) {
  const ey = cy + 3, my = cy + 14.5, L = cx - 8, R = cx + 8;
  let m;
  if (mouth === 'grin') m = `<path d="M ${cx - 6} ${my - 1.5} q 6 9.5 12 0 z" fill="#B8324F" stroke="#7C1F36" stroke-width="1.2" stroke-linejoin="round"/><path d="M ${cx - 4.4} ${my - 0.6} h 8.8" stroke="#fff" stroke-width="2"/><path d="M ${cx - 2.6} ${my + 3.8} q 2.6 2 5.2 0" fill="none" stroke="#F28BA3" stroke-width="1.6" stroke-linecap="round"/>`;
  else if (mouth === 'o') m = `<ellipse cx="${cx}" cy="${my + 0.6}" rx="2.9" ry="3.5" fill="#B8324F" stroke="#7C1F36" stroke-width="1.1"/>`;
  else if (mouth === 'flat') m = `<path d="M ${cx - 4} ${my + 0.5} h 8" fill="none" stroke="#9E2F4C" stroke-width="1.9" stroke-linecap="round"/>`;
  else m = `<path d="M ${cx - 4.6} ${my - 0.6} q 4.6 4.6 9.2 0" fill="none" stroke="#9E2F4C" stroke-width="2" stroke-linecap="round"/>`;
  return (
    `<ellipse cx="${cx - 13.5}" cy="${ey + 7}" rx="4.4" ry="2.8" fill="#F7A0A8" opacity="0.6"/><ellipse cx="${cx + 13.5}" cy="${ey + 7}" rx="4.4" ry="2.8" fill="#F7A0A8" opacity="0.6"/>` +
    brow(L, ey, eyes, -1) + brow(R, ey, eyes, 1) + eye(L, ey, eyes, -1) + eye(R, ey, eyes, 1) +
    `<path d="M ${cx - 1} ${cy + 10} q 1 1.4 2 0" fill="none" stroke="${SKIN_DK}" stroke-width="1.2" stroke-linecap="round"/>` + m
  );
}

/** Round glasses (the "Nerd" sticker), drawn over the face. */
const glasses = (cx, cy) => {
  const ey = cy + 4;
  return `<circle cx="${cx - 8}" cy="${ey}" r="8" fill="#fff" fill-opacity="0.18" stroke="#5A3A82" stroke-width="1.6"/><circle cx="${cx + 8}" cy="${ey}" r="8" fill="#fff" fill-opacity="0.18" stroke="#5A3A82" stroke-width="1.6"/>` +
    `<path d="M ${cx - 0.4} ${ey - 1} q 0.4 -1.4 0.8 0 M ${cx - 16} ${ey - 1} l -3.5 -1.5 M ${cx + 16} ${ey - 1} l 3.5 -1.5" fill="none" stroke="#5A3A82" stroke-width="1.5" stroke-linecap="round"/>` +
    `<path d="M ${cx - 12} ${ey - 5} q 2 -2 4 -2" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round" opacity="0.8"/>`;
};

// ---- outfit ------------------------------------------------------------------

const emblem = (x, y, s = 1) =>
  `<g transform="translate(${x} ${y}) scale(${s})"><path d="M 0 -5 L 6 -3.4 L 5 3.4 L 0 7 L -5 3.4 L -6 -3.4 Z" fill="#D62839" stroke="#7A1420" stroke-width="0.9" stroke-linejoin="round"/>` +
  `<path d="M 2.6 -1.9 Q -2.8 -3.1 -2.2 -0.4 Q -0.6 0.8 0.5 1.4 Q 2.4 3 -2.8 3.7" fill="none" stroke="#FFD43B" stroke-width="1.5" stroke-linecap="round"/></g>`;

/** White lab coat over a purple top, shield emblem on the chest. */
function torso(x, y, w, h) {
  const cx = x + w / 2;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${COAT}" ${stroke()}/>` +
    `<path d="M ${cx - 7} ${y} L ${cx + 7} ${y} L ${cx} ${y + 15} Z" fill="${PURPLE}" stroke="${PURPLE_DK}" stroke-width="1"/>` +
    `<path d="M ${cx - 7} ${y} L ${cx - 3.5} ${y + 12} L ${cx - 1} ${y + h} M ${cx + 7} ${y} L ${cx + 3.5} ${y + 12} L ${cx + 1} ${y + h}" fill="none" ${stroke(1.2, COAT_SHADE)}/>` +
    `<rect x="${x + 3}" y="${y + h - 12}" width="8" height="7" rx="1.5" fill="${COAT}" ${stroke(1.1, COAT_SHADE)}/>` +
    `<path d="M ${x + 5.5} ${y + h - 16} v 6" ${stroke(2, '#7A4FD0')}/>` +
    emblem(cx + 9, y + 15, 0.95);
}

// ---- props --------------------------------------------------------------------

const tube = (hx, hy) =>
  `<g transform="translate(${hx} ${hy - 1}) rotate(-12)"><rect x="-2.4" y="-13" width="4.8" height="15" rx="2.4" fill="#E8F4FF" fill-opacity="0.75" stroke="#4A5A7A" stroke-width="1"/>` +
  `<rect x="-2.4" y="-6" width="4.8" height="8" rx="2.4" fill="#9B5CF0"/><rect x="-3.2" y="-14" width="6.4" height="2" rx="1" fill="#8893A8"/><circle cx="0.8" cy="-9" r="0.8" fill="#fff" opacity="0.8"/></g>`;

/** Glass dome with the purple virus (AAV9). */
const dome = (hx, hy) => {
  let spikes = '';
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    spikes += `<path d="M ${(Math.cos(a) * 4.6).toFixed(1)} ${(-11 + Math.sin(a) * 4.6).toFixed(1)} L ${(Math.cos(a) * 7).toFixed(1)} ${(-11 + Math.sin(a) * 7).toFixed(1)}" stroke="#4B3BD0" stroke-width="1" stroke-linecap="round"/><circle cx="${(Math.cos(a) * 7.4).toFixed(1)}" cy="${(-11 + Math.sin(a) * 7.4).toFixed(1)}" r="0.9" fill="#8F7CFF"/>`;
  }
  return `<g transform="translate(${hx} ${hy - 1})"><ellipse cx="0" cy="1" rx="10.5" ry="2.8" fill="#3A2A4A" stroke="#1C1226" stroke-width="1"/>` +
    `<ellipse cx="0" cy="-0.6" rx="6.5" ry="1.5" fill="#B58CFF" opacity="0.85"/>` +
    `<path d="M -8.8 0 L -8.8 -11 Q -8.8 -23 0 -23 Q 8.8 -23 8.8 -11 L 8.8 0 Z" fill="#DDEBFF" fill-opacity="0.4" stroke="#7A8FB8" stroke-width="1.2"/>` +
    spikes + `<circle cx="0" cy="-11" r="4.6" fill="#6D5CFF" stroke="#3B2FB0" stroke-width="0.8"/><circle cx="-1.4" cy="-12.4" r="1.2" fill="#fff" opacity="0.7"/>` +
    `<path d="M -6.2 -19 Q -6.6 -13 -6.1 -6" fill="none" stroke="#fff" stroke-width="1.2" stroke-linecap="round" opacity="0.7"/></g>`;
};

const trophy = (hx, hy) =>
  `<g transform="translate(${hx} ${hy - 3})"><path d="M -6 -14 h 12 v 5 q 0 6 -6 7 q -6 -1 -6 -7 z" fill="#FFD43B" stroke="#B8860B" stroke-width="1.1"/>` +
  `<path d="M -6 -12 q -5 0 -4 4 q 1 3 5 3 M 6 -12 q 5 0 4 4 q -1 3 -5 3" fill="none" stroke="#B8860B" stroke-width="1.2"/>` +
  `<rect x="-1.2" y="-2" width="2.4" height="3" fill="#E0A91C"/><rect x="-4" y="1" width="8" height="2.6" rx="1" fill="#B8860B"/><path d="M -3.5 -12 q 0 5 1.5 7" stroke="#fff" stroke-width="1" opacity="0.7" fill="none"/></g>`;

const star = (x, y, s = 1, c = '#FFE27A') =>
  `<path d="M ${x} ${y - 4 * s} l ${1.1 * s} ${2.6 * s} l ${2.6 * s} ${1.1 * s} l ${-2.6 * s} ${1.1 * s} l ${-1.1 * s} ${2.6 * s} l ${-1.1 * s} ${-2.6 * s} l ${-2.6 * s} ${-1.1 * s} l ${2.6 * s} ${-1.1 * s} z" fill="${c}" stroke="#E0B030" stroke-width="0.5"/>`;

const style = {
  defs: DEFS,
  skin: SKIN, skinDark: SKIN_DK, ears: false, blush: false,
  face, hairBack, hairFront,
  sleeve: COAT, hand: SKIN,
  pants: ['#3A3354', '#4A4268'], shoe: '#F4F4FA',
  torso,
};

const anims = humanAnimations(style, {
  standing: { heldL: tube },
  sitting: { heldL: tube },
  watch: { headExtra: glasses },
  point: { heldR: (x, y) => star(x + 2, y - 5, 1.1) },
  alert: { heldR: dome, extra: BANG(116, 34) },
  happy: { heldR: trophy, extra: HEART(20, 30) },
});

// Double-click trick: a superhero hop with a fist in the air and the emblem glowing.
const glow = (bob) => `<circle cx="73" cy="${77 + bob}" r="10" fill="#FFE27A" opacity="0.55"/>` + emblem(73, 77 + bob, 0.95);
/** Scale a finished frame about the feet so tall jump poses stay inside the 128 box. */
const shrink = (svg, k) => svg.replace(/(<svg[^>]*>\n)([\s\S]*)(\n<\/svg>\n)$/, (_m, a, inner, z) => `${a}<g transform="translate(64 122) scale(${k}) translate(-64 -122)">${inner}</g>${z}`);
const T = (o) => shrink(standing(style, { eyes: 'happy', mouth: 'grin', armL: [-9, 14], ...o }), 0.84);
anims.trick = {
  fps: 8,
  frames: [
    T({ bob: 3, armR: [10, 14], extra: glow(3) }),
    T({ bob: -12, armR: [20, -34], extra: glow(-12) + star(20, 36, 1.3) + star(106, 44, 1) }),
    T({ bob: -20, armR: [22, -36], extra: glow(-20) + star(24, 30, 1.2) + star(110, 36, 1.4) + star(16, 58, 0.9) }),
    T({ bob: -6, armR: [20, -28], extra: glow(-6) + star(100, 40, 1) }),
  ],
};

writePack('dr-josie', {
  name: 'Dr. Josie',
  petLines: ['Hoi!', 'Time for science!', '*adjusts glasses*', 'Eureka!', 'Gezellig!'],
  doubleClick: { animation: 'trick', seconds: 3.5, say: 'Super science!', effect: { type: 'confetti' } },
}, anims);
