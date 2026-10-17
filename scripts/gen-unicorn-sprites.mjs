// Shaded, naturalistic unicorn buddy "Aurora". Vector art with gradients and
// highlights; swap the frames for photo PNGs if you have them.
// Run: node scripts/gen-unicorn-sprites.mjs
import { svgWrap, writePack, SLEEP_MARKS, BANG, FLOOR } from './lib/sprite.mjs';

const DEFS = `
<radialGradient id="coat" cx="0.42" cy="0.32" r="0.75">
  <stop offset="0" stop-color="#FFFFFF"/><stop offset="0.6" stop-color="#F1F2F7"/><stop offset="1" stop-color="#C9CCDA"/>
</radialGradient>
<linearGradient id="coatLeg" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#D5D8E3"/><stop offset="0.5" stop-color="#F4F5F9"/><stop offset="1" stop-color="#C3C7D6"/>
</linearGradient>
<linearGradient id="coatLegBack" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#B9BDCC"/><stop offset="0.5" stop-color="#D8DBE5"/><stop offset="1" stop-color="#AEB2C2"/>
</linearGradient>
<linearGradient id="horn" x1="0" y1="1" x2="1" y2="0">
  <stop offset="0" stop-color="#D59A26"/><stop offset="0.45" stop-color="#FFE791"/><stop offset="1" stop-color="#FFF8D6"/>
</linearGradient>
<linearGradient id="mane" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#FF9BD0"/><stop offset="0.5" stop-color="#C19BFF"/><stop offset="1" stop-color="#8BD2FF"/>
</linearGradient>
<linearGradient id="mane2" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#FFC2E4"/><stop offset="0.5" stop-color="#DCCBFF"/><stop offset="1" stop-color="#BFE8FF"/>
</linearGradient>
<linearGradient id="hoof" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#6E6873"/><stop offset="1" stop-color="#2F2A36"/>
</linearGradient>
<radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
  <stop offset="0" stop-color="#FFF6C8" stop-opacity="0.9"/><stop offset="1" stop-color="#FFF6C8" stop-opacity="0"/>
</radialGradient>`;

const OUT = '#A9AEBF'; // soft outline
const SHADE = '#B8BCCB';

function hoof(x, y) {
  return `<path d="M ${x - 5.5} ${y - 7} h 11 l 1 7 h -13 z" fill="url(#hoof)" stroke="#262230" stroke-width="0.8"/>`;
}

/**
 * A leg from (x, top) to the hoof at (x + dx, floorY). `bend` bows the knee.
 * back=true uses the darker gradient for the far-side legs.
 */
function leg(x, top, dx, floorY, { bend = 0, back = false, width = 9, lift = 0 } = {}) {
  const hy = floorY - lift;
  const fill = back ? 'url(#coatLegBack)' : 'url(#coatLeg)';
  const cx = x + dx * 0.5 + bend, cy = (top + hy) / 2;
  return (
    `<path d="M ${x} ${top} Q ${cx} ${cy} ${x + dx} ${hy - 6}" fill="none" stroke="${OUT}" stroke-width="${width + 1.6}" stroke-linecap="round"/>` +
    `<path d="M ${x} ${top} Q ${cx} ${cy} ${x + dx} ${hy - 6}" fill="none" stroke="${fill}" stroke-width="${width}" stroke-linecap="round"/>` +
    hoof(x + dx, hy)
  );
}

/** Folded leg for the lying pose: a rounded blob along the ground. */
function foldedLeg(x, y, len, back = false) {
  const fill = back ? 'url(#coatLegBack)' : 'url(#coatLeg)';
  return (
    `<path d="M ${x} ${y} q ${len * 0.5} -8 ${len} 0" fill="none" stroke="${OUT}" stroke-width="11" stroke-linecap="round"/>` +
    `<path d="M ${x} ${y} q ${len * 0.5} -8 ${len} 0" fill="none" stroke="${fill}" stroke-width="9" stroke-linecap="round"/>` +
    hoof(x + len + 2, y + 5)
  );
}

function eye(cx, cy, mode) {
  switch (mode) {
    case 'closed':
      return `<path d="M ${cx - 3.5} ${cy} q 3.5 3.5 7 0" fill="none" stroke="#3A2E38" stroke-width="1.4" stroke-linecap="round"/>` +
        `<path d="M ${cx - 3} ${cy + 1.5} l -1.5 1.5 M ${cx} ${cy + 2.5} v 2 M ${cx + 3} ${cy + 1.5} l 1.5 1.5" stroke="#3A2E38" stroke-width="0.8" stroke-linecap="round"/>`;
    case 'happy':
      return `<path d="M ${cx - 3.5} ${cy + 1} q 3.5 -5 7 0" fill="none" stroke="#3A2E38" stroke-width="1.6" stroke-linecap="round"/>`;
    case 'worried':
      return `<ellipse cx="${cx}" cy="${cy}" rx="3" ry="3.4" fill="#FFF"/><circle cx="${cx}" cy="${cy + 0.5}" r="2.3" fill="#2B1F26"/><circle cx="${cx + 0.8}" cy="${cy - 0.6}" r="0.8" fill="#fff"/>` +
        `<path d="M ${cx - 4} ${cy - 5} l 8 2" stroke="#8A7F8E" stroke-width="1.4" stroke-linecap="round"/>`;
    case 'wide':
      return `<ellipse cx="${cx}" cy="${cy}" rx="3.6" ry="4" fill="#FFF"/><circle cx="${cx}" cy="${cy}" r="2.6" fill="#2B1F26"/><circle cx="${cx + 1}" cy="${cy - 1}" r="0.9" fill="#fff"/>`;
    case 'up':
      return `<ellipse cx="${cx}" cy="${cy}" rx="2.8" ry="3.2" fill="#FFF"/><circle cx="${cx + 0.3}" cy="${cy - 1.2}" r="2.2" fill="#2B1F26"/><circle cx="${cx + 1}" cy="${cy - 2}" r="0.7" fill="#fff"/>` +
        `<path d="M ${cx - 3.5} ${cy - 3.5} q 3.5 -2.5 7 0" fill="none" stroke="#8A7F8E" stroke-width="1" stroke-linecap="round"/>`;
    default:
      return `<ellipse cx="${cx}" cy="${cy}" rx="2.8" ry="3.2" fill="#FFF"/><circle cx="${cx + 0.3}" cy="${cy + 0.2}" r="2.3" fill="#2B1F26"/><circle cx="${cx + 1.1}" cy="${cy - 0.9}" r="0.8" fill="#fff"/>` +
        `<path d="M ${cx - 3.5} ${cy - 3} q 3.5 -2.5 7 0" fill="none" stroke="#8A7F8E" stroke-width="1" stroke-linecap="round"/>`;
  }
}

/**
 * Head + neck + mane, anchored at the neck base `(bx, by)`. `angle` is the
 * neck direction in degrees (0 = horizontal right, negative = up).
 */
function headNeck(bx, by, angle, { eyes = 'open', ears = 'up', glow = false } = {}) {
  const len = 36;
  const rad = (angle * Math.PI) / 180;
  const hx = bx + Math.cos(rad) * len, hy = by + Math.sin(rad) * len;
  // Head tilt follows the neck, softened so the muzzle still points forward.
  const tilt = (angle + 55) * 0.6;
  const earPath = ears === 'back'
    ? `<path d="M -4 -11 l -9 -5 l 3 10 z" fill="url(#coat)" stroke="${OUT}" stroke-width="0.8"/>`
    : `<path d="M -5 -11 l -3 -11 l 8 7 z" fill="url(#coat)" stroke="${OUT}" stroke-width="0.8"/><path d="M -5 -11 l -1.5 -7 l 4 4 z" fill="#E9B7C8"/>`;
  const head = `
<g transform="translate(${hx.toFixed(1)} ${hy.toFixed(1)}) rotate(${tilt.toFixed(1)})">
  ${glow ? `<circle cx="14" cy="-26" r="20" fill="url(#glow)"/>` : ''}
  ${earPath}
  <path d="M -12 -6 C -10 -14 2 -14 8 -8 L 20 2 C 24 6 22 13 15 13 L 4 12 C -6 11 -13 4 -12 -6 Z" fill="url(#coat)" stroke="${OUT}" stroke-width="1"/>
  <path d="M 6 -2 C 12 0 18 5 17 10" fill="none" stroke="${SHADE}" stroke-width="1.2" opacity="0.7"/>
  <circle cx="18" cy="6" r="1.3" fill="#CFA6B3"/>
  <path d="M 13 11 q 4 1 7 -1" fill="none" stroke="#B59AA6" stroke-width="0.9" stroke-linecap="round"/>
  <path d="M 2 -12 L 7 -13 L 14 -34 Z" fill="url(#horn)" stroke="#B9852A" stroke-width="0.7"/>
  <path d="M 4 -17 l 5 -1 M 6 -22 l 5 -1 M 8 -27 l 4 -1" stroke="#B9852A" stroke-width="0.7" opacity="0.8"/>
  ${eye(0, -3, eyes)}
  <path d="M -8 -12 C -4 -16 4 -14 6 -11 C 2 -13 -4 -12 -8 -12 Z" fill="url(#mane2)"/>
</g>`;
  // Neck as a thick stroke plus mane strands hanging off its top edge.
  const nx = -Math.sin(rad), ny = Math.cos(rad); // normal pointing "up" from the neck
  const strands = [0.1, 0.3, 0.5, 0.7, 0.9].map((t, i) => {
    const sx = bx + Math.cos(rad) * len * t - nx * 5, sy = by + Math.sin(rad) * len * t - ny * 5;
    const ex = sx - 18 - i * 3, ey = sy + 24 + i * 3;
    return `<path d="M ${sx.toFixed(1)} ${sy.toFixed(1)} C ${sx - 14} ${sy - 2} ${ex + 10} ${ey - 16} ${ex} ${ey}" fill="none" stroke="url(#${i % 2 ? 'mane2' : 'mane'})" stroke-width="${9 - i * 0.8}" stroke-linecap="round"/>`;
  });
  return (
    `<path d="M ${bx} ${by} L ${hx.toFixed(1)} ${hy.toFixed(1)}" stroke="${OUT}" stroke-width="20" stroke-linecap="round"/>` +
    `<path d="M ${bx} ${by} L ${hx.toFixed(1)} ${hy.toFixed(1)}" stroke="url(#coat)" stroke-width="18" stroke-linecap="round"/>` +
    strands.join('') +
    head
  );
}

function tail(x, y, lift = 0) {
  return (
    `<path d="M ${x} ${y} C ${x - 18} ${y - 6 - lift * 14} ${x - 24} ${y + 18 - lift * 10} ${x - 16} ${y + 36 - lift * 16}" fill="none" stroke="url(#mane)" stroke-width="9" stroke-linecap="round"/>` +
    `<path d="M ${x} ${y + 2} C ${x - 12} ${y + 2 - lift * 10} ${x - 18} ${y + 22 - lift * 8} ${x - 8} ${y + 34 - lift * 14}" fill="none" stroke="url(#mane2)" stroke-width="5" stroke-linecap="round"/>`
  );
}

function body(cx, cy, rx, ry) {
  return (
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="url(#coat)" stroke="${OUT}" stroke-width="1"/>` +
    `<path d="M ${cx - rx * 0.7} ${cy + ry * 0.55} Q ${cx} ${cy + ry * 1.05} ${cx + rx * 0.75} ${cy + ry * 0.5}" fill="none" stroke="${SHADE}" stroke-width="2" opacity="0.6"/>` +
    `<ellipse cx="${cx - rx * 0.25}" cy="${cy - ry * 0.45}" rx="${rx * 0.35}" ry="${ry * 0.25}" fill="#fff" opacity="0.5"/>` +
    `<path d="M ${cx - rx * 0.55} ${cy - ry * 0.2} q -6 10 2 ${ry * 0.9}" fill="none" stroke="${SHADE}" stroke-width="1.4" opacity="0.5"/>` +
    `<path d="M ${cx + rx * 0.5} ${cy - ry * 0.3} q 5 8 0 ${ry * 0.9}" fill="none" stroke="${SHADE}" stroke-width="1.2" opacity="0.45"/>`
  );
}

const SPARKLES = (dy = 0) =>
  [[20, 30], [108, 18], [40, 14], [118, 60]].map(([x, y], i) =>
    `<path d="M ${x} ${y - 4 - dy * (i % 2)} l 1.2 2.8 l 2.8 1.2 l -2.8 1.2 l -1.2 2.8 l -1.2 -2.8 l -2.8 -1.2 l 2.8 -1.2 z" fill="#FFE57A" stroke="#E0B030" stroke-width="0.5"/>`).join('');

/** Standing pose; phase 0..3 for walking or null. */
function standing({ phase = null, bob = 0, eyes = 'open', ears = 'up', neck = -58, tailLift = 0.3, extra = '', glow = false } = {}) {
  const by = 80 + bob;
  const sw = phase === null ? [0, 0, 0, 0] : [[-6, 4, 4, -6], [0, 0, 0, 0], [6, -4, -4, 6], [0, 0, 0, 0]][phase % 4];
  const lf = phase === null ? [0, 0, 0, 0] : [[3, 0, 0, 3], [0, 0, 0, 0], [0, 3, 3, 0], [0, 0, 0, 0]][phase % 4];
  return svgWrap(
    leg(44, by + 6, sw[0], FLOOR, { back: true, bend: -3, lift: lf[0] }) +
    leg(80, by + 6, sw[1], FLOOR, { back: true, bend: 2, lift: lf[1] }) +
    tail(34, by - 8, tailLift) +
    body(62, by, 34, 19) +
    leg(52, by + 8, sw[2], FLOOR, { bend: -2, lift: lf[2] }) +
    leg(88, by + 8, sw[3], FLOOR, { bend: 2, lift: lf[3] }) +
    headNeck(86, by - 8, neck, { eyes, ears, glow }) +
    extra,
    { defs: DEFS },
  );
}

/** Lying pose, legs folded. `neck` lets the head droop for sleep. */
function lying({ eyes = 'open', neck = -50, ears = 'up', extra = '', tailLift = 0, dx = 0 } = {}) {
  const by = 103;
  return svgWrap(
    `<g transform="translate(${dx} 0)">` +
    tail(32, by - 6, tailLift) +
    foldedLeg(40, FLOOR - 8, 14, true) +
    body(62, by, 36, 16) +
    foldedLeg(70, FLOOR - 6, 22) +
    headNeck(88, by - 8, neck, { eyes, ears }) +
    `</g>` +
    extra,
    { defs: DEFS },
  );
}

/** Rearing on the hind legs; `point` extends a foreleg toward the target. */
function rearing({ eyes = 'open', extra = '', point = true, pawLift = 0 } = {}) {
  const by = 80;
  const rot = `rotate(-30 48 ${FLOOR})`;
  return svgWrap(
    leg(44, by + 6, 2, FLOOR, { back: true, bend: -6 }) +
    leg(54, by + 8, -2, FLOOR, { bend: -4 }) +
    `<g transform="${rot}">` +
    tail(34, by - 8, 0.6) +
    body(62, by, 34, 19) +
    // tucked far foreleg
    `<path d="M 78 ${by + 8} q 6 8 14 2" fill="none" stroke="${OUT}" stroke-width="10.6" stroke-linecap="round"/>` +
    `<path d="M 78 ${by + 8} q 6 8 14 2" fill="none" stroke="url(#coatLegBack)" stroke-width="9" stroke-linecap="round"/>` +
    hoof(93, by + 14) +
    (point
      // pointing foreleg: straight forward in local space, which the rotation lifts up-right
      ? `<path d="M 86 ${by + 4} L 122 ${by + 6}" fill="none" stroke="${OUT}" stroke-width="10.6" stroke-linecap="round"/>` +
        `<path d="M 86 ${by + 4} L 122 ${by + 6}" fill="none" stroke="url(#coatLeg)" stroke-width="9" stroke-linecap="round"/>` +
        `<g transform="translate(125 ${by + 5}) rotate(-90) scale(0.8)">${hoof(0, 4)}</g>`
      // pawing foreleg, raised and bent
      : `<path d="M 86 ${by + 4} q 14 ${-2 - pawLift} 18 ${-12 - pawLift}" fill="none" stroke="${OUT}" stroke-width="10.6" stroke-linecap="round"/>` +
        `<path d="M 86 ${by + 4} q 14 ${-2 - pawLift} 18 ${-12 - pawLift}" fill="none" stroke="url(#coatLeg)" stroke-width="9" stroke-linecap="round"/>` +
        hoof(105, by - 6 - pawLift)) +
    headNeck(84, by - 10, -62, { eyes, ears: 'up', glow: true }) +
    `</g>` +
    extra,
    { defs: DEFS },
  );
}

function dangling({ eyes = 'worried', frameDy = 0 } = {}) {
  const by = 72 + frameDy;
  return svgWrap(
    leg(44, by + 6, 0, FLOOR, { back: true, bend: 0 }) +
    leg(80, by + 6, 0, FLOOR, { back: true, bend: 0 }) +
    tail(34, by - 8, -0.2) +
    body(62, by, 34, 19) +
    leg(52, by + 8, 1, FLOOR + 2, { bend: 0 }) +
    leg(88, by + 8, -1, FLOOR + 2, { bend: 0 }) +
    headNeck(86, by - 8, -62, { eyes, ears: 'back' }),
    { defs: DEFS },
  );
}

const anims = {
  idle: {
    fps: 2,
    frames: [
      standing({ tailLift: 0.3 }),
      standing({ tailLift: 0.5 }),
      standing({ tailLift: 0.3, eyes: 'closed' }),
      standing({ tailLift: 0.5 }),
    ],
  },
  walk: {
    fps: 8,
    frames: [0, 1, 2, 3].map((p) => standing({ phase: p, bob: p % 2 ? -2 : 0, tailLift: p % 2 ? 0.5 : 0.3 })),
  },
  sit: {
    fps: 1.5,
    frames: [
      lying({ tailLift: 0 }),
      lying({ tailLift: 0.2 }),
      lying({ tailLift: 0, eyes: 'closed' }),
      lying({ tailLift: 0.2 }),
    ],
  },
  sleep: {
    fps: 1,
    frames: [
      lying({ eyes: 'closed', neck: -14, ears: 'back', dx: -14, extra: SLEEP_MARKS(0, 104) }),
      lying({ eyes: 'closed', neck: -14, ears: 'back', dx: -14, extra: SLEEP_MARKS(6, 104) }),
    ],
  },
  watch: {
    fps: 1.5,
    frames: [
      standing({ eyes: 'up', neck: -72 }),
      standing({ eyes: 'up', neck: -76, tailLift: 0.5 }),
      standing({ eyes: 'up', neck: -72 }),
      standing({ eyes: 'closed', neck: -76, tailLift: 0.5 }),
    ],
  },
  point: {
    fps: 2,
    frames: [rearing({ eyes: 'open' }), rearing({ eyes: 'wide', extra: SPARKLES(2) })],
  },
  alert: {
    fps: 4,
    frames: [
      standing({ eyes: 'wide', neck: -70, tailLift: 0.8, extra: BANG(120, 30), glow: true }),
      standing({ eyes: 'wide', neck: -70, tailLift: 0.8, bob: -6, extra: BANG(120, 30), glow: true }),
    ],
  },
  happy: {
    fps: 5,
    frames: [
      standing({ eyes: 'happy', tailLift: 0.9, extra: SPARKLES(0), glow: true }),
      standing({ eyes: 'happy', tailLift: 0.2, bob: -5, extra: SPARKLES(4), glow: true }),
    ],
  },
  drag: {
    fps: 2,
    frames: [dangling({ frameDy: 0 }), dangling({ frameDy: -2 })],
  },
  // Double-click trick: rear up and paw the air.
  rear: {
    fps: 3,
    frames: [
      rearing({ point: false, pawLift: 0, eyes: 'wide', extra: SPARKLES(0) }),
      rearing({ point: false, pawLift: 6, eyes: 'happy', extra: SPARKLES(3) }),
      rearing({ point: false, pawLift: 2, eyes: 'wide', extra: SPARKLES(1) }),
    ],
  },
};

writePack('unicorn', {
  name: 'Aurora',
  petLines: ['*soft whinny*', '*shimmer*', '*nuzzles*', '✨', '*flicks tail*'],
  // Double-click: rears up ("steigeren") and spells LILY in a rainbow.
  doubleClick: { animation: 'rear', seconds: 4, effect: { type: 'arc-letters', text: 'LILY' } },
}, anims);
