// Rainbow Man buddy "Roy G." A cheerful chibi with rainbow hair and a striped
// suit who leaves a little rainbow arc when he is excited.
// Run: node scripts/gen-rainbowman-sprites.mjs
import { svgWrap, writePack, SLEEP_MARKS, BANG, HEART, FLOOR } from './lib/sprite.mjs';

const RAINBOW = ['#FF3B30', '#FF9500', '#FFD60A', '#34C759', '#2F9BFF', '#5856D6', '#AF52DE'];
const SKIN = '#F6C9A5', SKIN_DK = '#D9A27A', OUT = '#2B2B3A', HAIR_OUT = '#3B2F5C';

function stroke(w = 1.6) {
  return `stroke="${OUT}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
}

/** Rainbow-striped rectangle with rounded corners. */
function stripedRect(x, y, w, h, r = 5, horizontal = true) {
  const id = `clip${x}${y}${w}${h}`.replace(/[^a-z0-9]/gi, '');
  const n = RAINBOW.length;
  const bands = RAINBOW.map((c, i) =>
    horizontal
      ? `<rect x="${x}" y="${y + (h / n) * i}" width="${w}" height="${h / n + 0.5}" fill="${c}"/>`
      : `<rect x="${x + (w / n) * i}" y="${y}" width="${w / n + 0.5}" height="${h}" fill="${c}"/>`).join('');
  return `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/></clipPath>` +
    `<g clip-path="url(#${id})">${bands}</g>` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="none" ${stroke()}/>`;
}

/** Rainbow arc (half ring) centred at (cx, cy) with outer radius r. */
function rainbowArc(cx, cy, r, { width = 3, opacity = 1, sweep = 'top' } = {}) {
  return `<g opacity="${opacity}">` + RAINBOW.map((c, i) => {
    const rr = r - i * width;
    const d = sweep === 'top'
      ? `M ${cx - rr} ${cy} A ${rr} ${rr} 0 0 1 ${cx + rr} ${cy}`
      : `M ${cx} ${cy - rr} A ${rr} ${rr} 0 0 1 ${cx} ${cy + rr}`;
    return `<path d="${d}" fill="none" stroke="${c}" stroke-width="${width}"/>`;
  }).join('') + `</g>`;
}

function face(cx, cy, { eyes = 'open', mouth = 'smile' } = {}) {
  const eye = (x) => {
    switch (eyes) {
      case 'closed': return `<path d="M ${x - 3.5} ${cy} q 3.5 3 7 0" fill="none" ${stroke(1.8)}/>`;
      case 'happy': return `<path d="M ${x - 3.5} ${cy + 1} q 3.5 -5 7 0" fill="none" ${stroke(2)}/>`;
      case 'up': return `<circle cx="${x}" cy="${cy}" r="4" fill="#fff" ${stroke(1)}/><circle cx="${x + 0.3}" cy="${cy - 1.8}" r="2.4" fill="${OUT}"/><circle cx="${x + 1.2}" cy="${cy - 2.6}" r="0.8" fill="#fff"/>`;
      case 'wide': return `<circle cx="${x}" cy="${cy}" r="5" fill="#fff" ${stroke(1)}/><circle cx="${x}" cy="${cy}" r="2.4" fill="${OUT}"/><circle cx="${x + 1}" cy="${cy - 1}" r="0.8" fill="#fff"/>`;
      case 'worried': return `<circle cx="${x}" cy="${cy}" r="4" fill="#fff" ${stroke(1)}/><circle cx="${x}" cy="${cy + 1}" r="2.4" fill="${OUT}"/>` +
        `<path d="M ${x - 4} ${cy - 6.5} l 8 2" fill="none" ${stroke(1.6)}/>`;
      default: return `<circle cx="${x}" cy="${cy}" r="4" fill="#fff" ${stroke(1)}/><circle cx="${x + 0.5}" cy="${cy + 0.3}" r="2.6" fill="${OUT}"/><circle cx="${x + 1.4}" cy="${cy - 0.8}" r="0.9" fill="#fff"/>`;
    }
  };
  let m = '';
  if (mouth === 'smile') m = `<path d="M ${cx - 6} ${cy + 8} q 6 6 12 0" fill="none" ${stroke(1.8)}/>`;
  else if (mouth === 'grin') m = `<path d="M ${cx - 7} ${cy + 7} q 7 9 14 0 z" fill="#C53D5E" ${stroke(1.6)}/><path d="M ${cx - 4.5} ${cy + 8.2} h 9" stroke="#fff" stroke-width="2"/>`;
  else if (mouth === 'o') m = `<ellipse cx="${cx}" cy="${cy + 9}" rx="3" ry="3.6" fill="#C53D5E" ${stroke(1.4)}/>`;
  else if (mouth === 'flat') m = `<path d="M ${cx - 5} ${cy + 9} h 10" fill="none" ${stroke(1.8)}/>`;
  return eye(cx - 7) + eye(cx + 7) + m +
    `<circle cx="${cx - 14}" cy="${cy + 6}" r="3" fill="#F7A3A3" opacity="0.6"/><circle cx="${cx + 14}" cy="${cy + 6}" r="3" fill="#F7A3A3" opacity="0.6"/>`;
}

function head(cx, cy, opts = {}) {
  // Big round head with a rainbow afro on top.
  return `
<g transform="rotate(${opts.tilt ?? 0} ${cx} ${cy})">
  <circle cx="${cx}" cy="${cy - 8}" r="25" fill="#FFF" stroke="${HAIR_OUT}" stroke-width="1.6"/>
  ${rainbowArc(cx, cy - 6, 24.5, { width: 3.3 })}
  <circle cx="${cx}" cy="${cy}" r="20" fill="${SKIN}" ${stroke()}/>
  <path d="M ${cx - 18} ${cy - 6} q 18 -10 36 0" fill="none" stroke="${SKIN_DK}" stroke-width="1" opacity="0.5"/>
  <ellipse cx="${cx - 20}" cy="${cy + 2}" rx="3" ry="4" fill="${SKIN}" ${stroke(1.2)}/>
  <ellipse cx="${cx + 20}" cy="${cy + 2}" rx="3" ry="4" fill="${SKIN}" ${stroke(1.2)}/>
  ${face(cx, cy + 1, opts)}
</g>`;
}

function arm(x, y, ex, ey, { glove = '#fff' } = {}) {
  return `<path d="M ${x} ${y} L ${ex} ${ey}" fill="none" stroke="${OUT}" stroke-width="9.5" stroke-linecap="round"/>` +
    `<path d="M ${x} ${y} L ${ex} ${ey}" fill="none" stroke="#3E3E58" stroke-width="7" stroke-linecap="round"/>` +
    `<circle cx="${ex}" cy="${ey}" r="4.8" fill="${glove}" ${stroke(1.4)}/>`;
}

function legs(x, top, { phase = null, bend = false, dangle = false } = {}) {
  const shoe = (lx, ly) => `<path d="M ${lx - 6} ${ly - 5} h 10 q 5 0 5 5 h -15 z" fill="#2F2F44" ${stroke(1.4)}/>`;
  if (bend) {
    // Sitting: thighs forward, shins down.
    return `<path d="M ${x - 6} ${top} L ${x + 12} ${top + 2} L ${x + 12} ${FLOOR - 4}" fill="none" stroke="${OUT}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="M ${x - 6} ${top} L ${x + 12} ${top + 2} L ${x + 12} ${FLOOR - 4}" fill="none" stroke="#2F9BFF" stroke-width="9.5" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="M ${x + 6} ${top} L ${x + 22} ${top + 4} L ${x + 22} ${FLOOR - 4}" fill="none" stroke="${OUT}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="M ${x + 6} ${top} L ${x + 22} ${top + 4} L ${x + 22} ${FLOOR - 4}" fill="none" stroke="#5AB0FF" stroke-width="9.5" stroke-linecap="round" stroke-linejoin="round"/>` +
      shoe(x + 14, FLOOR) + shoe(x + 24, FLOOR);
  }
  const sw = phase === null ? [0, 0] : [[-6, 6], [0, 0], [6, -6], [0, 0]][phase % 4];
  const lift = phase === null ? [0, 0] : [[3, 0], [0, 0], [0, 3], [0, 0]][phase % 4];
  const d = dangle ? 3 : 0;
  const one = (lx, dx, lf, col) =>
    `<path d="M ${lx} ${top} L ${lx + dx} ${FLOOR - 4 - lf + d}" fill="none" stroke="${OUT}" stroke-width="12" stroke-linecap="round"/>` +
    `<path d="M ${lx} ${top} L ${lx + dx} ${FLOOR - 4 - lf + d}" fill="none" stroke="${col}" stroke-width="9.5" stroke-linecap="round"/>` +
    shoe(lx + dx + 2, FLOOR - lf + d);
  return one(x - 7, sw[0], lift[0], '#2F9BFF') + one(x + 7, sw[1], lift[1], '#5AB0FF');
}

/**
 * Standing figure. Arms are given as end points relative to the shoulders.
 */
function standing({ phase = null, bob = 0, armL = [-14, 22], armR = [14, 22], eyes = 'open', mouth = 'smile', tilt = 0, extra = '', arc = null } = {}) {
  const cx = 64, torsoTop = 62 + bob, torsoH = 32;
  const shoulderY = torsoTop + 6;
  return svgWrap(
    (arc ? rainbowArc(cx, FLOOR - 2, 56, { width: 4, opacity: arc }) : '') +
    legs(cx, torsoTop + torsoH - 4 + bob * 0, { phase }) +
    stripedRect(cx - 15, torsoTop, 30, torsoH, 7) +
    arm(cx - 13, shoulderY, cx - 13 + armL[0], shoulderY + armL[1]) +
    arm(cx + 13, shoulderY, cx + 13 + armR[0], shoulderY + armR[1]) +
    head(cx, 40 + bob, { eyes, mouth, tilt }) +
    extra,
  );
}

function sitting({ eyes = 'open', mouth = 'smile', armL = [-12, 18], armR = [14, 18], extra = '' } = {}) {
  const cx = 60, torsoTop = 78, torsoH = 26;
  return svgWrap(
    legs(cx, torsoTop + torsoH - 6, { bend: true }) +
    stripedRect(cx - 15, torsoTop, 30, torsoH, 7) +
    arm(cx - 13, torsoTop + 6, cx - 13 + armL[0], torsoTop + 6 + armL[1]) +
    arm(cx + 13, torsoTop + 6, cx + 13 + armR[0], torsoTop + 6 + armR[1]) +
    head(cx, 56, { eyes, mouth }) +
    extra,
  );
}

/** Lying on his back, asleep. Built by rotating a standing figure. */
function lying({ zDy = 0 } = {}) {
  const figure = standing({ eyes: 'closed', mouth: 'flat', armL: [-4, 26], armR: [4, 26] });
  const inner = figure.replace(/^<svg[^>]*>\n/, '').replace(/\n<\/svg>\n$/, '');
  // Standing figure spans x 36..92, y 7..122. Rotate 90° clockwise about the
  // centre and drop it so the body rests on the floor.
  return svgWrap(
    `<g transform="translate(64 ${FLOOR - 28}) rotate(-90) translate(-64 -64) translate(0 8)">${inner}</g>` +
    SLEEP_MARKS(zDy, 100),
  );
}

function dangling({ frameDy = 0 } = {}) {
  const cx = 64, torsoTop = 56 + frameDy, torsoH = 32, shoulderY = torsoTop + 6;
  return svgWrap(
    legs(cx, torsoTop + torsoH - 4, { dangle: true }) +
    stripedRect(cx - 15, torsoTop, 30, torsoH, 7) +
    arm(cx - 13, shoulderY, cx - 24, shoulderY - 20) +
    arm(cx + 13, shoulderY, cx + 24, shoulderY - 20) +
    head(cx, 34 + frameDy, { eyes: 'worried', mouth: 'o', tilt: -4 }),
  );
}

const anims = {
  idle: {
    fps: 2,
    frames: [
      standing(),
      standing({ armR: [15, 21] }),
      standing({ eyes: 'closed' }),
      standing({ armL: [-15, 21] }),
    ],
  },
  walk: {
    fps: 8,
    frames: [0, 1, 2, 3].map((p) =>
      standing({ phase: p, bob: p % 2 ? -2 : 0, armL: [[-4, 22], [-14, 22], [-20, 18], [-14, 22]][p], armR: [[20, 18], [14, 22], [4, 22], [14, 22]][p] })),
  },
  sit: {
    fps: 1.5,
    frames: [sitting(), sitting({ armR: [16, 16] }), sitting({ eyes: 'closed' }), sitting({ armL: [-14, 16] })],
  },
  sleep: { fps: 1, frames: [lying({ zDy: 0 }), lying({ zDy: 6 })] },
  watch: {
    fps: 1.5,
    frames: [
      standing({ eyes: 'up', armL: [-10, 22], armR: [10, 22] }),
      standing({ eyes: 'up', tilt: -5, armL: [-10, 22], armR: [10, 22] }),
      standing({ eyes: 'up', armL: [-10, 22], armR: [10, 22] }),
      standing({ eyes: 'up', tilt: 5, armL: [-10, 22], armR: [10, 22] }),
    ],
  },
  point: {
    fps: 2,
    frames: [
      standing({ armR: [34, -22], armL: [-10, 22], mouth: 'o' }),
      standing({ armR: [36, -24], armL: [-10, 22], mouth: 'o', eyes: 'wide' }),
    ],
  },
  alert: {
    fps: 4,
    frames: [
      standing({ eyes: 'wide', mouth: 'o', armL: [-22, -16], armR: [22, -16], extra: BANG(120, 30), arc: 0.9 }),
      standing({ eyes: 'wide', mouth: 'o', armL: [-22, -18], armR: [22, -18], bob: -6, extra: BANG(120, 30), arc: 0.9 }),
    ],
  },
  happy: {
    fps: 5,
    frames: [
      standing({ eyes: 'happy', mouth: 'grin', armL: [-22, -14], armR: [22, -14], extra: HEART(), arc: 0.9 }),
      standing({ eyes: 'happy', mouth: 'grin', armL: [-24, -8], armR: [24, -8], bob: -6, extra: HEART(), arc: 0.9 }),
    ],
  },
  drag: { fps: 2, frames: [dangling(), dangling({ frameDy: -2 })] },
};

writePack('rainbow-man', {
  name: 'Roy G.',
  petLines: ['Hey there, sunshine!', '*jazz hands*', 'Every colour, all at once!', '*sparkles*', 'High five!'],
}, anims);
