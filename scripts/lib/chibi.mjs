// Reusable chibi-human rig: big round head, short body, stubby limbs.
// A `style` object supplies the colours and the hair / outfit / accessory
// drawings; poses and animations are shared by every human buddy.
import { svgWrap, SLEEP_MARKS, FLOOR } from './sprite.mjs';

export const OUT = '#2B2B3A';

export function stroke(w = 1.6, c = OUT) {
  return `stroke="${c}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;
}

function face(st, cx, cy, { eyes = 'open', mouth = 'smile' } = {}) {
  if (st.face) return st.face(cx, cy, { eyes, mouth });
  const lashes = st.lashes
    ? (x) => `<path d="M ${x - 4.5} ${cy - 3.5} l -1.5 -1.5 M ${x + 4.5} ${cy - 3.5} l 1.5 -1.5" ${stroke(1.2)}/>`
    : () => '';
  const eye = (x) => {
    switch (eyes) {
      case 'closed': return `<path d="M ${x - 3.5} ${cy} q 3.5 3 7 0" fill="none" ${stroke(1.8)}/>`;
      case 'happy': return `<path d="M ${x - 3.5} ${cy + 1} q 3.5 -5 7 0" fill="none" ${stroke(2)}/>`;
      case 'up': return `<circle cx="${x}" cy="${cy}" r="4" fill="#fff" ${stroke(1)}/><circle cx="${x + 0.3}" cy="${cy - 1.8}" r="2.4" fill="${st.iris ?? OUT}"/><circle cx="${x + 1.2}" cy="${cy - 2.6}" r="0.8" fill="#fff"/>` + lashes(x);
      case 'wide': return `<circle cx="${x}" cy="${cy}" r="5" fill="#fff" ${stroke(1)}/><circle cx="${x}" cy="${cy}" r="2.4" fill="${st.iris ?? OUT}"/><circle cx="${x + 1}" cy="${cy - 1}" r="0.8" fill="#fff"/>` + lashes(x);
      case 'worried': return `<circle cx="${x}" cy="${cy}" r="4" fill="#fff" ${stroke(1)}/><circle cx="${x}" cy="${cy + 1}" r="2.4" fill="${st.iris ?? OUT}"/>` +
        `<path d="M ${x - 4} ${cy - 6.5} l 8 2" fill="none" ${stroke(1.6)}/>`;
      default: return `<circle cx="${x}" cy="${cy}" r="4" fill="#fff" ${stroke(1)}/><circle cx="${x + 0.5}" cy="${cy + 0.3}" r="2.6" fill="${st.iris ?? OUT}"/><circle cx="${x + 1.4}" cy="${cy - 0.8}" r="0.9" fill="#fff"/>` + lashes(x);
    }
  };
  const lip = st.lip ?? OUT;
  let m = '';
  if (mouth === 'smile') m = `<path d="M ${cx - 6} ${cy + 8} q 6 6 12 0" fill="none" ${stroke(1.8, lip)}/>`;
  else if (mouth === 'grin') m = `<path d="M ${cx - 7} ${cy + 7} q 7 9 14 0 z" fill="#C53D5E" ${stroke(1.6, lip)}/><path d="M ${cx - 4.5} ${cy + 8.2} h 9" stroke="#fff" stroke-width="2"/>`;
  else if (mouth === 'o') m = `<ellipse cx="${cx}" cy="${cy + 9}" rx="3" ry="3.6" fill="#C53D5E" ${stroke(1.4, lip)}/>`;
  else if (mouth === 'flat') m = `<path d="M ${cx - 5} ${cy + 9} h 10" fill="none" ${stroke(1.8, lip)}/>`;
  const blush = st.blush === false ? '' :
    `<circle cx="${cx - 14}" cy="${cy + 6}" r="3" fill="#F7A3A3" opacity="0.6"/><circle cx="${cx + 14}" cy="${cy + 6}" r="3" fill="#F7A3A3" opacity="0.6"/>`;
  return eye(cx - 7) + eye(cx + 7) + m + blush;
}

function head(st, cx, cy, opts = {}) {
  return `
<g transform="rotate(${opts.tilt ?? 0} ${cx} ${cy})">
  ${st.hairBack ? st.hairBack(cx, cy) : ''}
  <circle cx="${cx}" cy="${cy}" r="20" fill="${st.skin}" ${stroke()}/>
  <path d="M ${cx - 18} ${cy - 6} q 18 -10 36 0" fill="none" stroke="${st.skinDark}" stroke-width="1" opacity="0.5"/>
  ${st.ears === false ? '' : `<ellipse cx="${cx - 20}" cy="${cy + 2}" rx="3" ry="4" fill="${st.skin}" ${stroke(1.2)}/>
  <ellipse cx="${cx + 20}" cy="${cy + 2}" rx="3" ry="4" fill="${st.skin}" ${stroke(1.2)}/>`}
  ${face(st, cx, cy + 1, opts)}
  ${st.hairFront ? st.hairFront(cx, cy) : ''}
  ${opts.headExtra ? opts.headExtra(cx, cy) : ''}
</g>`;
}

function arm(st, x, y, ex, ey, held) {
  return `<path d="M ${x} ${y} L ${ex} ${ey}" fill="none" stroke="${OUT}" stroke-width="9.5" stroke-linecap="round"/>` +
    `<path d="M ${x} ${y} L ${ex} ${ey}" fill="none" stroke="${st.sleeve}" stroke-width="7" stroke-linecap="round"/>` +
    `<circle cx="${ex}" cy="${ey}" r="4.8" fill="${st.hand}" ${stroke(1.4)}/>` +
    (held ? held(ex, ey) : '');
}

function legs(st, x, top, { phase = null, bend = false, dangle = false } = {}) {
  const shoe = (lx, ly) => `<path d="M ${lx - 6} ${ly - 5} h 10 q 5 0 5 5 h -15 z" fill="${st.shoe}" ${stroke(1.4)}/>`;
  const [p1, p2] = st.pants;
  if (bend) {
    const seg = (x0, y0, x1, y1, x2, y2, col) =>
      `<path d="M ${x0} ${y0} L ${x1} ${y1} L ${x2} ${y2}" fill="none" stroke="${OUT}" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/>` +
      `<path d="M ${x0} ${y0} L ${x1} ${y1} L ${x2} ${y2}" fill="none" stroke="${col}" stroke-width="9.5" stroke-linecap="round" stroke-linejoin="round"/>`;
    return seg(x - 6, top, x + 12, top + 2, x + 12, FLOOR - 4, p1) + seg(x + 6, top, x + 22, top + 4, x + 22, FLOOR - 4, p2) +
      shoe(x + 14, FLOOR) + shoe(x + 24, FLOOR);
  }
  const sw = phase === null ? [0, 0] : [[-6, 6], [0, 0], [6, -6], [0, 0]][phase % 4];
  const lift = phase === null ? [0, 0] : [[3, 0], [0, 0], [0, 3], [0, 0]][phase % 4];
  const d = dangle ? 3 : 0;
  const one = (lx, dx, lf, col) =>
    `<path d="M ${lx} ${top} L ${lx + dx} ${FLOOR - 4 - lf + d}" fill="none" stroke="${OUT}" stroke-width="12" stroke-linecap="round"/>` +
    `<path d="M ${lx} ${top} L ${lx + dx} ${FLOOR - 4 - lf + d}" fill="none" stroke="${col}" stroke-width="9.5" stroke-linecap="round"/>` +
    shoe(lx + dx + 2, FLOOR - lf + d);
  return one(x - 7, sw[0], lift[0], p1) + one(x + 7, sw[1], lift[1], p2);
}

/** Standing figure. Arm values are end points relative to the shoulder. */
export function standing(st, { phase = null, bob = 0, armL = [-14, 22], armR = [14, 22], eyes = 'open', mouth = 'smile', tilt = 0, extra = '', behind = '', heldL = null, heldR = null, headExtra = null } = {}) {
  const cx = 64, torsoTop = 62 + bob, torsoH = 32;
  const shoulderY = torsoTop + 6;
  return svgWrap(
    behind +
    legs(st, cx, torsoTop + torsoH - 4, { phase }) +
    st.torso(cx - 15, torsoTop, 30, torsoH) +
    arm(st, cx - 13, shoulderY, cx - 13 + armL[0], shoulderY + armL[1], heldL) +
    arm(st, cx + 13, shoulderY, cx + 13 + armR[0], shoulderY + armR[1], heldR) +
    head(st, cx, 40 + bob, { eyes, mouth, tilt, headExtra }) +
    extra,
    { defs: st.defs ?? '' },
  );
}

export function sitting(st, { eyes = 'open', mouth = 'smile', armL = [-12, 18], armR = [14, 18], extra = '', heldL = null, heldR = null } = {}) {
  const cx = 60, torsoTop = 78, torsoH = 26;
  return svgWrap(
    legs(st, cx, torsoTop + torsoH - 6, { bend: true }) +
    st.torso(cx - 15, torsoTop, 30, torsoH) +
    arm(st, cx - 13, torsoTop + 6, cx - 13 + armL[0], torsoTop + 6 + armL[1], heldL) +
    arm(st, cx + 13, torsoTop + 6, cx + 13 + armR[0], torsoTop + 6 + armR[1], heldR) +
    head(st, cx, 56, { eyes, mouth }) +
    extra,
    { defs: st.defs ?? '' },
  );
}

/** Lying on the back, asleep: a rotated standing figure resting on the floor. */
export function lying(st, { zDy = 0 } = {}) {
  const figure = standing(st, { eyes: 'closed', mouth: 'flat', armL: [-4, 26], armR: [4, 26] });
  const inner = figure.replace(/^<svg[^>]*>\n/, '').replace(/\n<\/svg>\n$/, '');
  return svgWrap(
    `<g transform="translate(64 ${FLOOR - 28}) rotate(-90) translate(-64 -64) translate(0 8)">${inner}</g>` +
    SLEEP_MARKS(zDy, 100),
  );
}

export function dangling(st, { frameDy = 0 } = {}) {
  const cx = 64, torsoTop = 56 + frameDy, torsoH = 32, shoulderY = torsoTop + 6;
  return svgWrap(
    legs(st, cx, torsoTop + torsoH - 4, { dangle: true }) +
    st.torso(cx - 15, torsoTop, 30, torsoH) +
    arm(st, cx - 13, shoulderY, cx - 24, shoulderY - 20) +
    arm(st, cx + 13, shoulderY, cx + 24, shoulderY - 20) +
    head(st, cx, 34 + frameDy, { eyes: 'worried', mouth: 'o', tilt: -4 }),
    { defs: st.defs ?? '' },
  );
}

/** The standard animation set. `o` lets a style override per-animation options. */
export function humanAnimations(st, o = {}) {
  const S = (opts) => standing(st, { ...(o.standing ?? {}), ...opts });
  return {
    idle: {
      fps: 2,
      frames: [S({}), S({ armR: [15, 21] }), S({ eyes: 'closed' }), S({ armL: [-15, 21] })],
    },
    walk: {
      fps: 8,
      frames: [0, 1, 2, 3].map((p) =>
        S({ phase: p, bob: p % 2 ? -2 : 0, armL: [[-4, 22], [-14, 22], [-20, 18], [-14, 22]][p], armR: [[20, 18], [14, 22], [4, 22], [14, 22]][p] })),
    },
    sit: {
      fps: 1.5,
      frames: [
        sitting(st, o.sitting), sitting(st, { ...(o.sitting ?? {}), armR: [16, 16] }),
        sitting(st, { ...(o.sitting ?? {}), eyes: 'closed' }), sitting(st, { ...(o.sitting ?? {}), armL: [-14, 16] }),
      ],
    },
    sleep: { fps: 1, frames: [lying(st, { zDy: 0 }), lying(st, { zDy: 6 })] },
    watch: {
      fps: 1.5,
      frames: [
        S({ eyes: 'up', armL: [-10, 22], armR: [10, 22] }),
        S({ eyes: 'up', tilt: -5, armL: [-10, 22], armR: [10, 22] }),
        S({ eyes: 'up', armL: [-10, 22], armR: [10, 22] }),
        S({ eyes: 'up', tilt: 5, armL: [-10, 22], armR: [10, 22] }),
      ],
    },
    point: {
      fps: 2,
      frames: [
        S({ ...(o.point ?? {}), armR: [34, -22], armL: [-10, 22], mouth: 'o' }),
        S({ ...(o.point ?? {}), armR: [36, -24], armL: [-10, 22], mouth: 'o', eyes: 'wide' }),
      ],
    },
    alert: {
      fps: 4,
      // `extraFrames` lets a style vary the overlay per frame (e.g. a flapping bat).
      frames: [
        S({ ...(o.alert ?? {}), extra: o.alert?.extraFrames?.[0] ?? o.alert?.extra ?? '', eyes: 'wide', mouth: 'o', armL: [-22, -16], armR: [22, -16] }),
        S({ ...(o.alert ?? {}), extra: o.alert?.extraFrames?.[1] ?? o.alert?.extra ?? '', eyes: 'wide', mouth: 'o', armL: [-22, -18], armR: [22, -18], bob: -6 }),
      ],
    },
    happy: {
      fps: 5,
      frames: [
        S({ ...(o.happy ?? {}), eyes: 'happy', mouth: 'grin', armL: [-22, -14], armR: [22, -14] }),
        S({ ...(o.happy ?? {}), eyes: 'happy', mouth: 'grin', armL: [-24, -8], armR: [24, -8], bob: -6 }),
      ],
    },
    drag: { fps: 2, frames: [dangling(st), dangling(st, { frameDy: -2 })] },
  };
}
