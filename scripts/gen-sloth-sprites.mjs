// Sloth buddy "Slowpoke": a three-toed sloth that hangs from the TOP edge of the screen by its
// claws and crawls hand over hand along it, very slowly. Uses manifest `edge: "top"`.
// Frame is 128x100; the claws hook over the screen edge at y = GRIP.
// Run: node scripts/gen-sloth-sprites.mjs
import { writePack, mark, HEART } from './lib/sprite.mjs';

const W = 128, H = 100, GRIP = 8;

const DEFS = `
<radialGradient id="slFur" cx="0.4" cy="0.2" r="0.95">
  <stop offset="0" stop-color="#B09878"/><stop offset="0.55" stop-color="#8A7458"/><stop offset="1" stop-color="#65523B"/>
</radialGradient>
<linearGradient id="slLimb" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#7B664B"/><stop offset="0.5" stop-color="#9A8467"/><stop offset="1" stop-color="#6C573F"/>
</linearGradient>
<linearGradient id="slLimbFar" x1="0" y1="0" x2="1" y2="0">
  <stop offset="0" stop-color="#5E4C37"/><stop offset="0.5" stop-color="#76624A"/><stop offset="1" stop-color="#4F402E"/>
</linearGradient>
<radialGradient id="slFace" cx="0.45" cy="0.35" r="0.8">
  <stop offset="0" stop-color="#F6EBD2"/><stop offset="0.7" stop-color="#E4D3AE"/><stop offset="1" stop-color="#C9B68D"/>
</radialGradient>`;
const OUT = '#3A2C1E', MASK = '#4A3626', CLAW = '#E9E1CC', CLAW_DK = '#8E8570', MOSS = '#7F9456';
const stroke = (w = 1.3, c = OUT) => `stroke="${c}" stroke-width="${w}" stroke-linejoin="round" stroke-linecap="round"`;

const svgWrap = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">\n<defs>${DEFS}</defs>\n${inner}\n</svg>\n`;

/** Three curved claws hooked over the top edge, pointing forward (right). */
function claws(x, y, down = false) {
  const s = down ? -1 : 1; // a dangling hand points its claws down instead of hooking up
  let d = '';
  for (let i = -1; i <= 1; i++) {
    const cx = x + i * 3.4;
    const path = `M ${cx} ${y + 2 * s} Q ${cx + 0.5} ${y - 6 * s} ${cx + 4.5} ${y - 7.5 * s}`;
    d += `<path d="${path}" fill="none" stroke="${CLAW_DK}" stroke-width="3.2" stroke-linecap="round"/>` +
      `<path d="${path}" fill="none" stroke="${CLAW}" stroke-width="1.7" stroke-linecap="round"/>`;
  }
  return d;
}

/** A long shaggy limb from the body (bx,by) to a gripping hand (hx,hy). */
function limb(bx, by, hx, hy, { far = false, bend = 5, down = false } = {}) {
  const mx = (bx + hx) / 2 + bend, my = (by + hy) / 2;
  const d = `M ${bx} ${by} Q ${mx} ${my} ${hx} ${hy + 3}`;
  const grad = far ? 'url(#slLimbFar)' : 'url(#slLimb)';
  return `<path d="${d}" fill="none" stroke="${OUT}" stroke-width="10" stroke-linecap="round"/>` +
    `<path d="${d}" fill="none" stroke="${grad}" stroke-width="7.4" stroke-linecap="round"/>` +
    `<path d="${d}" fill="none" stroke="#B4A082" stroke-width="1.2" stroke-linecap="round" stroke-dasharray="2 4" opacity="0.6"/>` +
    claws(hx, down ? hy + 6 : hy, down);
}

function torso(cx, cy, rot = 0) {
  let tufts = '';
  for (let i = 0; i < 9; i++) {
    const x = cx - 24 + i * 6.2;
    const y = cy + 12.5 + Math.sin(i * 1.7) * 1.2;
    tufts += `M ${x} ${y} l ${-1.5 + (i % 2)} ${5 + (i % 3)} l 3.4 -4.5 `;
  }
  return `<g transform="rotate(${rot} ${cx} ${cy})">` +
    `<path d="${tufts}" fill="#7A654A" ${stroke(1)}/>` +
    `<ellipse cx="${cx}" cy="${cy}" rx="31" ry="16" fill="url(#slFur)" ${stroke(1.5)}/>` +
    // fur streaks
    `<path d="M ${cx - 22} ${cy - 4} q 6 8 2 13 M ${cx - 9} ${cy - 8} q 5 9 1 17 M ${cx + 6} ${cy - 8} q 5 9 1 17 M ${cx + 19} ${cy - 5} q 4 7 0 13" fill="none" stroke="#5E4C37" stroke-width="1.2" stroke-linecap="round" opacity="0.7"/>` +
    // algae tint
    `<ellipse cx="${cx - 8}" cy="${cy + 3}" rx="12" ry="5.5" fill="${MOSS}" opacity="0.28"/>` +
    `<ellipse cx="${cx - 12}" cy="${cy - 8}" rx="10" ry="3.6" fill="#fff" opacity="0.2"/>` +
    // short tail nub
    `<ellipse cx="${cx - 31}" cy="${cy + 2}" rx="3" ry="3.4" fill="#6B573F" ${stroke(1)}/>` +
    `</g>`;
}

function eyeAt(x, y, mode) {
  switch (mode) {
    case 'closed': return `<path d="M ${x - 3.4} ${y} q 3.4 3 6.8 0" fill="none" stroke="#1B120A" stroke-width="1.9" stroke-linecap="round"/>`;
    case 'happy': return `<path d="M ${x - 3.4} ${y + 1.2} q 3.4 -4.6 6.8 0" fill="none" stroke="#1B120A" stroke-width="2" stroke-linecap="round"/>`;
    case 'wide': return `<circle cx="${x}" cy="${y}" r="4.6" fill="#fff" ${stroke(0.8)}/><circle cx="${x + 0.5}" cy="${y}" r="2.9" fill="#150D07"/><circle cx="${x + 1.4}" cy="${y - 1.1}" r="1" fill="#fff"/>`;
    case 'sleepy': return `<circle cx="${x}" cy="${y + 0.4}" r="2.8" fill="#150D07"/><path d="M ${x - 4} ${y - 0.6} h 8" stroke="#1B120A" stroke-width="2" stroke-linecap="round"/>`;
    default: return `<circle cx="${x}" cy="${y}" r="2.9" fill="#150D07"/><circle cx="${x + 1}" cy="${y - 1}" r="1" fill="#fff"/>`;
  }
}

function mouthAt(x, y, mode) {
  switch (mode) {
    case 'open': return `<ellipse cx="${x + 4}" cy="${y + 1.5}" rx="3" ry="3.4" fill="#6A2A2A" ${stroke(1)}/>`;
    case 'yawn': return `<ellipse cx="${x + 4}" cy="${y + 3}" rx="4.4" ry="6" fill="#6A2A2A" ${stroke(1.1)}/><ellipse cx="${x + 4}" cy="${y + 6}" rx="2.6" ry="2" fill="#D86A7A"/>`;
    case 'flat': return `<path d="M ${x - 1} ${y + 1} h 9" fill="none" stroke="${OUT}" stroke-width="1.5" stroke-linecap="round"/>`;
    default: return `<path d="M ${x - 2} ${y} q 5.5 5.4 11.5 -1.4" fill="none" stroke="${OUT}" stroke-width="1.6" stroke-linecap="round"/>`;
  }
}

/** Round head with the sloth's dark eye mask and permanent smile. Centre (cx, cy). */
function head(cx, cy, { eye = 'open', mouth = 'smile', rot = 0, blush = true } = {}) {
  return `<g transform="rotate(${rot} ${cx} ${cy})">` +
    `<ellipse cx="${cx - 3}" cy="${cy - 3}" rx="19" ry="16.5" fill="url(#slFur)" ${stroke(1.5)}/>` +
    `<path d="M ${cx - 16} ${cy - 10} q 3 -3 5 -1 M ${cx - 8} ${cy - 17} q 3 -1 4 1" fill="none" stroke="#5E4C37" stroke-width="1.3" stroke-linecap="round"/>` +
    `<ellipse cx="${cx + 3}" cy="${cy + 1}" rx="15" ry="12.6" fill="url(#slFace)" ${stroke(1.3)}/>` +
    `<ellipse cx="${cx + 5.5}" cy="${cy - 2.5}" rx="8.4" ry="4.8" transform="rotate(28 ${cx + 5.5} ${cy - 2.5})" fill="${MASK}"/>` +
    eyeAt(cx + 7, cy - 2.6, eye) +
    `<ellipse cx="${cx + 16}" cy="${cy + 3.6}" rx="3.4" ry="2.6" fill="#2B1D12"/>` +
    `<ellipse cx="${cx + 15.2}" cy="${cy + 2.8}" rx="1.1" ry="0.7" fill="#fff" opacity="0.6"/>` +
    mouthAt(cx + 6, cy + 7.4, mouth) +
    (blush ? `<ellipse cx="${cx - 1}" cy="${cy + 6}" rx="3.6" ry="2.2" fill="#F28B82" opacity="0.5"/>` : '') +
    `</g>`;
}

// Resting grip points (hands) and where each limb leaves the body.
const REST = { fn: [90, GRIP], ff: [80, GRIP], hf: [40, GRIP], hn: [30, GRIP] };
const BASE = { fn: [78, 44], ff: [72, 42], hf: [47, 42], hn: [40, 44] };

/**
 * One frame. `bob` moves the body down; `limbs` overrides hands: { fn: [dx, lift] ... }
 * where lift raises the hand off the edge (it reaches through the air).
 */
function frame({ dangle = false, bob = 0, tilt = 0, hdx = 0, hdy = 0, eye = 'open', mouth = 'smile', rot = 0, limbs = {}, extra = '', behind = '', hide = [], blush = true } = {}) {
  const hand = (k) => {
    const [dx = 0, lift = 0] = limbs[k] ?? [];
    return [REST[k][0] + dx, REST[k][1] + lift];
  };
  const L = (k, far, bend) => (hide.includes(k) ? '' : limb(BASE[k][0], BASE[k][1] + bob * 0.6, ...hand(k), { far, bend, down: dangle }));
  const bx = 58, by = 52 + bob;
  return svgWrap(
    behind +
      L('hf', true, -4) + L('ff', true, 4) +
      torso(bx, by, tilt) +
      L('hn', false, -6) + L('fn', false, 6) +
      // neck shadow, then the head
      `<ellipse cx="${88 + hdx * 0.5}" cy="${55 + bob + hdy * 0.4}" rx="9" ry="8" fill="#7A654A" ${stroke(1.2)}/>` +
      head(101 + hdx, 66 + bob + hdy, { eye, mouth, rot, blush }) +
      extra,
  );
}

// ---- animations ----------------------------------------------------------

/** Hand-over-hand crawl: diagonal gait, each limb reaches (lifted), grips, then pulls back. */
const PHASE = [[12, -7], [4, 0], [-4, 0], [-12, 0]];
const GAIT = { fn: 0, hf: 1, ff: 2, hn: 3 };
function crawl(k, bob, tilt) {
  const limbs = {};
  for (const [key, off] of Object.entries(GAIT)) {
    const [dx, lift] = PHASE[(k + off) % 4];
    limbs[key] = [dx, -lift]; // negative lift = hand dips below the edge while reaching
  }
  return frame({ limbs, bob, tilt, hdx: [2, 3, 1, 0][k], eye: 'open', mouth: 'smile' });
}

const anims = {
  idle: {
    fps: 1.4,
    frames: [
      frame({}),
      frame({ bob: 1, hdy: 1, rot: 2 }),
      frame({ bob: 1.5, eye: 'closed', hdy: 1.5, rot: 3 }),
      frame({ bob: 0.5, hdy: 0.5, rot: 1 }),
    ],
  },
  walk: { fps: 3, frames: [0, 1, 2, 3].map((k) => crawl(k, [0, 1.2, 0, 1.2][k], [-1, 0, 1, 0][k])) },
  sit: {
    fps: 1.2,
    frames: [
      frame({ bob: 3, hdy: 3, rot: 6, eye: 'sleepy', mouth: 'flat' }),
      frame({ bob: 3.6, hdy: 3.6, rot: 7, eye: 'sleepy', mouth: 'smile' }),
    ],
  },
  sleep: {
    fps: 1,
    frames: [0, 1].map((i) => frame({
      bob: 4 + i * 0.8, hdy: 6 + i, hdx: -4, rot: 14, eye: 'closed', mouth: 'flat',
      extra: mark('z', 112, 92 - i * 3, 11, '#5B8DEF') + mark('Z', 121, 80 - i * 4, 15, '#5B8DEF'),
    })),
  },
  watch: {
    fps: 1.5,
    frames: [
      frame({ eye: 'wide', hdy: -2, hdx: 3, rot: -6, mouth: 'flat' }),
      frame({ eye: 'wide', hdy: -2.5, hdx: 3.5, rot: -7, mouth: 'flat', bob: 0.6 }),
    ],
  },
  point: {
    fps: 2.5,
    frames: [
      frame({ eye: 'open', limbs: { fn: [24, 34] }, hdx: 2, rot: -3 }),
      frame({ eye: 'wide', limbs: { fn: [27, 31] }, hdx: 2, rot: -4, mouth: 'open' }),
    ],
  },
  alert: {
    fps: 5,
    frames: [
      frame({ eye: 'wide', mouth: 'open', hdy: -3, rot: -6, bob: -1, extra: mark('!', 120, 36, 26, '#E63946') }),
      frame({ eye: 'wide', mouth: 'open', hdy: -3.5, rot: -8, bob: -2, extra: mark('!', 120, 33, 29, '#E63946') }),
    ],
  },
  happy: {
    fps: 3,
    frames: [
      frame({ eye: 'happy', tilt: -4, bob: 1, hdx: -1, blush: true, extra: HEART(116, 30) }),
      frame({ eye: 'happy', tilt: 0, bob: 2, mouth: 'open' }),
      frame({ eye: 'happy', tilt: 4, bob: 1, hdx: 1, extra: HEART(10, 34) }),
    ],
  },
  // Dangling when picked up (and while it climbs back to the top edge afterwards).
  drag: {
    fps: 2.5,
    frames: [
      frame({ dangle: true, eye: 'wide', mouth: 'open', bob: 6, limbs: { fn: [12, 70], hn: [-4, 74], ff: [4, 66], hf: [0, 72] }, rot: -4 }),
      frame({ dangle: true, eye: 'wide', mouth: 'open', bob: 7, limbs: { fn: [16, 74], hn: [-8, 68], ff: [8, 72], hf: [-4, 66] }, rot: 4 }),
    ],
  },
  // Double-click: lets go with one hand, waves slowly, then a long yawn.
  trick: {
    fps: 2.2,
    frames: [
      frame({ eye: 'open', mouth: 'smile', limbs: { fn: [14, 16] }, hdx: 2 }),
      frame({ eye: 'happy', mouth: 'smile', limbs: { fn: [22, 24] }, hdx: 2, rot: -3 }),
      frame({ eye: 'happy', mouth: 'smile', limbs: { fn: [10, 26] }, hdx: 2, rot: 2 }),
      frame({ eye: 'closed', mouth: 'yawn', limbs: { fn: [0, 0] }, hdy: -2, rot: -9, bob: -1 }),
    ],
  },
};

writePack('sloth', {
  name: 'Slowpoke',
  edge: 'top',
  gripOffset: GRIP,
  speed: 0.3,
  feetOffset: 0,
  scale: 1.1,
  petLines: ['Heyyy…', '*slow blink*', 'Noooo rush…', '*yaaawn*', 'I was here first.', 'Five more minutes…'],
  // Double-click: a very slow wave and a yawn.
  doubleClick: { animation: 'trick', seconds: 5, say: 'Hi… five… *yawn*', effect: { type: 'confetti' } },
  frameHeight: H,
}, anims);
