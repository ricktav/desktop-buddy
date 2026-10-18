// DNA buddy "Helix": a chibi double helix in purple and pink with a round head,
// tendril arms and legs. The helix rotates (the phase shifts per frame) and
// "unzips" in the middle for its double-click trick.
// Run: node scripts/gen-dna-sprites.mjs
import { svgWrap, writePack, SLEEP_MARKS, BANG, HEART, FLOOR } from './lib/sprite.mjs';

const DEFS = `
<radialGradient id="head" cx="0.38" cy="0.3" r="0.85">
  <stop offset="0" stop-color="#FFEAF8"/><stop offset="0.55" stop-color="#F3BDE8"/><stop offset="1" stop-color="#C9A0F7"/>
</radialGradient>`;

const PUR = { front: '#9B5CFF', back: '#6A35C4', line: '#3F1A85', rung: '#C9A0FF' };
const PNK = { front: '#FF6FB1', back: '#C7407F', line: '#8A1F54', rung: '#FFA3CF' };
const INK = '#2B1250';
const K = (2 * Math.PI) / 46; // one full twist every 46 px

const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

/**
 * Double-helix body. Strand +1 is purple, strand -1 is pink; depth comes from
 * cos so the strand in front is drawn over the rungs and the one behind under them.
 *  split: 0..1 unzips the middle (rungs break, strands bulge apart).
 */
function helix({ y0, y1, A = 17, phase = 0, split = 0 }) {
  const cx = 64;
  const ymid = (y0 + y1) / 2;
  const pts = (s) => {
    const out = [];
    for (let y = y0; y <= y1 + 0.01; y += 2) {
      const th = K * (y - y0) + phase;
      const taper = clamp((y - y0) / 14, 0, 1) * (0.42 + 0.58 * clamp((y1 - y) / 14, 0, 1));
      const bulge = 1 + split * 0.85 * Math.exp(-(((y - ymid) / 17) ** 2));
      out.push({ x: cx + s * A * taper * bulge * Math.sin(th), y, z: s * Math.cos(th) });
    }
    return out;
  };
  const runs = (s) => {
    const p = pts(s);
    const res = [];
    let cur = [p[0]];
    for (let i = 1; i < p.length; i++) {
      const same = Math.sign(p[i].z || 1) === Math.sign(cur[cur.length - 1].z || 1);
      cur.push(p[i]);
      if (!same) {
        res.push({ front: cur[0].z + cur[1].z > 0 ? true : false, pts: cur });
        cur = [p[i]];
      }
    }
    if (cur.length > 1) res.push({ front: cur[0].z + cur[cur.length - 1].z > 0, pts: cur });
    return res;
  };
  const pathOf = (pts) => 'M ' + pts.map((q) => `${q.x.toFixed(1)} ${q.y.toFixed(1)}`).join(' L ');
  const draw = (run, col, gloss) =>
    `<path d="${pathOf(run.pts)}" fill="none" stroke="${col.line}" stroke-width="8.4" stroke-linecap="round" stroke-linejoin="round"/>` +
    `<path d="${pathOf(run.pts)}" fill="none" stroke="${run.front ? col.front : col.back}" stroke-width="5.6" stroke-linecap="round" stroke-linejoin="round"/>` +
    (gloss && run.front ? `<path d="${pathOf(run.pts)}" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity="0.4" transform="translate(-1.3 -0.6)"/>` : '');
  const A1 = runs(1), A2 = runs(-1);
  const backs = [...A1.filter((r) => !r.front).map((r) => draw(r, PUR)), ...A2.filter((r) => !r.front).map((r) => draw(r, PNK))];
  const fronts = [...A1.filter((r) => r.front).map((r) => draw(r, PUR, true)), ...A2.filter((r) => r.front).map((r) => draw(r, PNK, true))];
  // rungs: base pairs, each half attached to its strand, breaking apart where it is unzipped
  const p1 = pts(1), p2 = pts(-1);
  let rungs = '';
  for (let y = y0 + 6, i = 0; y < y1 - 3; y += 8, i++) {
    const idx = Math.round((y - y0) / 2);
    const a = p1[idx], b = p2[idx];
    if (!a || !b || Math.abs(a.x - b.x) < 5) continue;
    const g = split * 0.92 * Math.exp(-(((y - ymid) / 20) ** 2));
    const m = (a.x + b.x) / 2;
    const fa = (t) => ({ x: a.x + (m - a.x) * t, y });
    const fb = (t) => ({ x: b.x + (m - b.x) * t, y });
    const reach = 0.5 * (1 - g) + 0.02;
    const left = i % 2 ? PUR.rung : PNK.rung, right = i % 2 ? PNK.rung : PUR.rung;
    const seg = (from, to, col) =>
      `<path d="M ${from.x.toFixed(1)} ${y} L ${to.x.toFixed(1)} ${y}" stroke="${PUR.line}" stroke-width="5.6" stroke-linecap="round"/>` +
      `<path d="M ${from.x.toFixed(1)} ${y} L ${to.x.toFixed(1)} ${y}" stroke="${col}" stroke-width="3.2" stroke-linecap="round"/>`;
    rungs += seg(fa(0), fa(reach * 2 > 1 ? 1 : reach * 2 * 0.98), left) + seg(fb(0), fb(reach * 2 > 1 ? 1 : reach * 2 * 0.98), right);
  }
  return backs.join('') + rungs + fronts.join('');
}

function eye(x, y, mode) {
  switch (mode) {
    case 'closed': return `<path d="M ${x - 4} ${y} q 4 3.4 8 0" fill="none" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/>`;
    case 'happy': return `<path d="M ${x - 4} ${y + 1.4} q 4 -6 8 0" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`;
    case 'wide': return `<ellipse cx="${x}" cy="${y}" rx="5.6" ry="6.6" fill="#fff" stroke="${INK}" stroke-width="1.2"/><circle cx="${x}" cy="${y}" r="3.2" fill="${INK}"/><circle cx="${x + 1.2}" cy="${y - 1.3}" r="1.1" fill="#fff"/>`;
    case 'up': return `<ellipse cx="${x}" cy="${y}" rx="4.4" ry="5.4" fill="${INK}"/><circle cx="${x + 1.1}" cy="${y - 2.8}" r="1.5" fill="#fff"/>`;
    case 'worried': return `<ellipse cx="${x}" cy="${y}" rx="4.2" ry="5.2" fill="${INK}"/><circle cx="${x + 1}" cy="${y - 1.8}" r="1.4" fill="#fff"/><path d="M ${x - 5} ${y - 8} l 9 2.6" fill="none" stroke="${INK}" stroke-width="1.8" stroke-linecap="round"/>`;
    default: return `<ellipse cx="${x}" cy="${y}" rx="4.2" ry="5.4" fill="${INK}"/><circle cx="${x + 1.2}" cy="${y - 2}" r="1.5" fill="#fff"/><circle cx="${x - 1.2}" cy="${y + 1.8}" r="0.7" fill="#fff" opacity="0.8"/>`;
  }
}

function head(cx, cy, { eyes = 'open', mouth = 'smile', tilt = 0 } = {}) {
  let m;
  if (mouth === 'grin') m = `<path d="M ${cx - 6.5} ${cy + 8} q 6.5 9.5 13 0 z" fill="#B8324F" stroke="#7C1F36" stroke-width="1.2" stroke-linejoin="round"/><path d="M ${cx - 4.6} ${cy + 8.9} h 9.2" stroke="#fff" stroke-width="2"/>`;
  else if (mouth === 'o') m = `<ellipse cx="${cx}" cy="${cy + 10}" rx="3" ry="3.8" fill="#B8324F" stroke="#7C1F36" stroke-width="1.1"/>`;
  else if (mouth === 'flat') m = `<path d="M ${cx - 4} ${cy + 10} h 8" fill="none" stroke="#9E2F4C" stroke-width="2" stroke-linecap="round"/>`;
  else m = `<path d="M ${cx - 5} ${cy + 8} q 5 5 10 0" fill="none" stroke="#9E2F4C" stroke-width="2.2" stroke-linecap="round"/>`;
  return `<g transform="rotate(${tilt} ${cx} ${cy + 16})">` +
    // tiny twisting tuft
    `<path d="M ${cx - 2} ${cy - 17} C ${cx - 9} ${cy - 22} ${cx + 3} ${cy - 23} ${cx - 2} ${cy - 27}" fill="none" stroke="${PUR.line}" stroke-width="4.6" stroke-linecap="round"/><path d="M ${cx - 2} ${cy - 17} C ${cx - 9} ${cy - 22} ${cx + 3} ${cy - 23} ${cx - 2} ${cy - 27}" fill="none" stroke="${PUR.front}" stroke-width="2.4" stroke-linecap="round"/>` +
    `<path d="M ${cx + 2} ${cy - 17} C ${cx + 9} ${cy - 22} ${cx - 3} ${cy - 23} ${cx + 2} ${cy - 27}" fill="none" stroke="${PNK.line}" stroke-width="4.6" stroke-linecap="round"/><path d="M ${cx + 2} ${cy - 17} C ${cx + 9} ${cy - 22} ${cx - 3} ${cy - 23} ${cx + 2} ${cy - 27}" fill="none" stroke="${PNK.front}" stroke-width="2.4" stroke-linecap="round"/>` +
    `<circle cx="${cx}" cy="${cy}" r="19.5" fill="url(#head)" stroke="${PUR.line}" stroke-width="2"/>` +
    `<ellipse cx="${cx - 8}" cy="${cy - 11}" rx="6.5" ry="3.2" fill="#fff" opacity="0.6" transform="rotate(-28 ${cx - 8} ${cy - 11})"/>` +
    `<ellipse cx="${cx - 13.5}" cy="${cy + 7}" rx="4.2" ry="2.7" fill="#FF8FB8" opacity="0.6"/><ellipse cx="${cx + 13.5}" cy="${cy + 7}" rx="4.2" ry="2.7" fill="#FF8FB8" opacity="0.6"/>` +
    eye(cx - 7.5, cy - 1, eyes) + eye(cx + 7.5, cy - 1, eyes) + m + `</g>`;
}

const tendril = (x1, y1, x2, y2, col, bend = 0) => {
  const mx = (x1 + x2) / 2 + bend, my = (y1 + y2) / 2;
  const d = `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`;
  return `<path d="${d}" fill="none" stroke="${col.line}" stroke-width="7.4" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${col.front}" stroke-width="4.6" stroke-linecap="round"/>` +
    `<circle cx="${x2}" cy="${y2}" r="4.4" fill="#FFD9EE" stroke="${col.line}" stroke-width="1.6"/>`;
};

const foot = (x, y, col) => `<ellipse cx="${x + 2}" cy="${y}" rx="7.4" ry="3.6" fill="#FFD9EE" stroke="${col.line}" stroke-width="1.6"/>`;

/**
 * One full figure. arms: [left, right] hand end points relative to the shoulders.
 */
function dna({ phase = 0, bob = 0, tilt = 0, headTilt = 0, eyes = 'open', mouth = 'smile', armL = [-9, 20], armR = [9, 20], swing = 0, lift = [0, 0], split = 0, sit = false, extra = '', A = 17 } = {}) {
  const hy = 34 + bob;
  const y0 = 50 + bob, y1 = (sit ? 117 : 114) + bob * 0.3;
  const airborne = bob < -4;
  const footY = airborne ? 120 + bob + 3 : 120;
  const legs = sit
    ? foot(56, 119, PUR) + foot(76, 119, PNK)
    : `<path d="M 57 ${y1 - 4} Q ${55 + swing} ${(y1 + footY) / 2} ${54 + swing} ${footY - 3 - lift[0]}" fill="none" stroke="${PUR.line}" stroke-width="7.4" stroke-linecap="round"/><path d="M 57 ${y1 - 4} Q ${55 + swing} ${(y1 + footY) / 2} ${54 + swing} ${footY - 3 - lift[0]}" fill="none" stroke="${PUR.front}" stroke-width="4.6" stroke-linecap="round"/>` +
      `<path d="M 71 ${y1 - 4} Q ${73 - swing} ${(y1 + footY) / 2} ${74 - swing} ${footY - 3 - lift[1]}" fill="none" stroke="${PNK.line}" stroke-width="7.4" stroke-linecap="round"/><path d="M 71 ${y1 - 4} Q ${73 - swing} ${(y1 + footY) / 2} ${74 - swing} ${footY - 3 - lift[1]}" fill="none" stroke="${PNK.front}" stroke-width="4.6" stroke-linecap="round"/>` +
      foot(54 + swing, footY - lift[0], PUR) + foot(74 - swing, footY - lift[1], PNK);
  const sy = y0 + 24;
  const body =
    tendril(50, sy, 50 + armL[0], sy + armL[1], PUR, -4) +
    helix({ y0, y1, A, phase, split }) +
    tendril(78, sy, 78 + armR[0], sy + armR[1], PNK, 4);
  // arms are drawn behind the helix on the near side so they emerge from it
  const figure = legs + body + head(64, hy, { eyes, mouth, tilt: headTilt }) + extra;
  const squash = sit ? ` scale(1.05 0.9)` : '';
  const k = 0.92;
  return svgWrap(
    `<ellipse cx="64" cy="122" rx="26" ry="3" fill="#000" opacity="0.14"/>` +
    `<g transform="translate(64 122) scale(${k}) rotate(${tilt})${squash} translate(-64 -122)">${figure}</g>`,
    { defs: DEFS },
  );
}

/** Lying on its back asleep: the standing figure rotated 90° about its centre. */
function lying({ phase = 0, extra = '' } = {}) {
  const standing = dna({ phase, eyes: 'closed', mouth: 'flat', armL: [-6, 22], armR: [6, 22] });
  const inner = standing.replace(/^<svg[^>]*>\n<defs>[\s\S]*?<\/defs>\n/, '').replace(/\n<\/svg>\n$/, '');
  return svgWrap(`<g transform="translate(0 24) rotate(90 64 76)">${inner.replace(/<ellipse cx="64" cy="122"[^>]*\/>/, '')}</g>` +
    `<ellipse cx="64" cy="122" rx="40" ry="3" fill="#000" opacity="0.14"/>` + extra, { defs: DEFS });
}

const SPARK = (dy = 0) =>
  [[18, 40], [112, 34], [30, 16]].map(([x, y], i) =>
    `<path d="M ${x} ${y - 4 - dy * (i % 2)} l 1.2 2.8 l 2.8 1.2 l -2.8 1.2 l -1.2 2.8 l -1.2 -2.8 l -2.8 -1.2 l 2.8 -1.2 z" fill="#FFB3DE" stroke="#C75FA0" stroke-width="0.5"/>`).join('');

const PI2 = Math.PI * 2;
const ph = (i, n) => (i / n) * PI2;

const anims = {
  idle: { fps: 3, frames: [0, 1, 2, 3].map((i) => dna({ phase: ph(i, 4), eyes: i === 2 ? 'closed' : 'open', bob: i % 2 ? -1 : 0, headTilt: [0, -2, 0, 2][i] })) },
  walk: {
    fps: 8,
    frames: [0, 1, 2, 3].map((i) => dna({
      phase: ph(i, 4) * 2, bob: i % 2 ? -3 : 0, tilt: [-4, 0, 4, 0][i], swing: [-4, 0, 4, 0][i], lift: [[3, 0], [0, 0], [0, 3], [0, 0]][i],
      armL: [[-14, 14], [-9, 20], [-4, 22], [-9, 20]][i], armR: [[4, 22], [9, 20], [14, 14], [9, 20]][i],
    })),
  },
  sit: { fps: 2, frames: [0, 1, 2].map((i) => dna({ phase: ph(i, 3), sit: true, eyes: i === 2 ? 'closed' : 'open', armL: [-12, 14], armR: [12, 14] })) },
  sleep: { fps: 1, frames: [lying({ phase: 0, extra: SLEEP_MARKS(0, 106) }), lying({ phase: Math.PI, extra: SLEEP_MARKS(6, 106) })] },
  watch: { fps: 2, frames: [0, 1, 2, 3].map((i) => dna({ phase: ph(i, 4), eyes: i === 3 ? 'closed' : 'up', headTilt: [-6, -9, -6, -9][i], armL: [-8, 20], armR: [8, 20] })) },
  point: { fps: 3, frames: [0, 1].map((i) => dna({ phase: ph(i, 2), mouth: 'o', eyes: i ? 'wide' : 'open', armR: [34, -26], armL: [-8, 20], tilt: 2 })) },
  alert: {
    fps: 5,
    frames: [0, 1].map((i) => dna({ phase: ph(i, 2), eyes: 'wide', mouth: 'o', armL: [-20, -22], armR: [20, -22], bob: i ? -8 : 0, extra: BANG(116, 32) })),
  },
  happy: {
    fps: 6,
    frames: [0, 1].map((i) => dna({ phase: ph(i, 2) * 2, eyes: 'happy', mouth: 'grin', armL: [-22, -16], armR: [22, -16], bob: i ? -8 : 0, extra: HEART(20, 30) })),
  },
  drag: { fps: 3, frames: [0, 1].map((i) => dna({ phase: ph(i, 2), eyes: 'worried', mouth: 'o', armL: [-20, -24], armR: [20, -24], bob: -10 - i * 2, headTilt: i ? 4 : -4 })) },
  // Double-click trick: the helix spins faster and unzips in the middle, like DNA replication.
  trick: {
    fps: 6,
    frames: [0, 0.5, 1, 0.55].map((split, i) => dna({
      phase: ph(i, 4) * 3, split, eyes: 'happy', mouth: 'grin', armL: [-20, -18], armR: [20, -18], bob: i === 2 ? -6 : -2, extra: SPARK(i),
    })),
  },
};

writePack('dna', {
  name: 'Helix',
  petLines: ['I have your genes... I mean eyes!', '*twists happily*', 'Base pairs forever!', 'A-T, C-G, you and me.', '*replicates giggles*'],
  doubleClick: { animation: 'trick', seconds: 3.5, say: 'Replicating!', effect: { type: 'arc-letters', text: 'DNA' } },
}, anims);
