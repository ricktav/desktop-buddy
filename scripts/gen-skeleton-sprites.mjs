// Skeleton buddy "Rattles": a chibi skeleton with glowing eye sockets, a
// ribcage and bony limbs. Run: node scripts/gen-skeleton-sprites.mjs
import { writePack, BANG, HEART } from './lib/sprite.mjs';
import { humanAnimations, stroke, OUT } from './lib/chibi.mjs';

const BONE = '#F3EFE3', BONE_DK = '#CFC8B5', SOCKET = '#1C1B24', GLOW = '#9BF0FF';

function socket(x, y, rx, ry, { dot = true, dotDy = 0, dotR = 2 } = {}) {
  return `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${SOCKET}" ${stroke(1.2, '#0F0E14')}/>` +
    (dot ? `<circle cx="${x}" cy="${y + dotDy}" r="${dotR}" fill="${GLOW}"/><circle cx="${x}" cy="${y + dotDy}" r="${dotR * 2}" fill="${GLOW}" opacity="0.25"/>` : '');
}

function teeth(cx, y, w, h = 4) {
  const n = 5, tw = w / n;
  let out = `<rect x="${cx - w / 2}" y="${y}" width="${w}" height="${h}" rx="1" fill="#FFF" ${stroke(1.2)}/>`;
  for (let i = 1; i < n; i++) out += `<path d="M ${cx - w / 2 + tw * i} ${y} v ${h}" ${stroke(0.9)}/>`;
  return out;
}

/** Skull face: eye sockets with glowing pupils, nasal cavity, a row of teeth. */
function face(cx, cy, { eyes = 'open', mouth = 'smile' }) {
  const L = cx - 7, R = cx + 7, ey = cy - 1;
  let e;
  switch (eyes) {
    case 'closed': e = `<path d="M ${L - 4} ${ey} q 4 3 8 0 M ${R - 4} ${ey} q 4 3 8 0" fill="none" ${stroke(2.2, SOCKET)}/>`; break;
    case 'happy': e = `<path d="M ${L - 4} ${ey + 1} q 4 -6 8 0 M ${R - 4} ${ey + 1} q 4 -6 8 0" fill="none" ${stroke(2.4, SOCKET)}/>`; break;
    case 'up': e = socket(L, ey, 5, 5.5, { dotDy: -2 }) + socket(R, ey, 5, 5.5, { dotDy: -2 }); break;
    case 'wide': e = socket(L, ey, 6, 6.5, { dotR: 2.6 }) + socket(R, ey, 6, 6.5, { dotR: 2.6 }); break;
    case 'worried': e = socket(L, ey, 5, 5.5, { dotDy: 1 }) + socket(R, ey, 5, 5.5, { dotDy: 1 }) +
      `<path d="M ${L - 5} ${ey - 8} l 9 2 M ${R + 5} ${ey - 8} l -9 2" fill="none" ${stroke(1.8)}/>`; break;
    default: e = socket(L, ey, 5, 5.5) + socket(R, ey, 5, 5.5);
  }
  const nose = `<path d="M ${cx} ${cy + 3} l -2.5 4 h 5 z" fill="${SOCKET}"/>`;
  let m;
  if (mouth === 'o') m = `<ellipse cx="${cx}" cy="${cy + 11}" rx="3.5" ry="4" fill="${SOCKET}" ${stroke(1.2)}/>`;
  else if (mouth === 'grin') m = teeth(cx, cy + 8, 18, 5);
  else if (mouth === 'flat') m = teeth(cx, cy + 9, 10, 3);
  else m = teeth(cx, cy + 9, 14, 4);
  return e + nose + m;
}

/** Ribcage on a dark chest with a spine down the middle. */
function torso(x, y, w, h) {
  const cx = x + w / 2;
  let ribs = '';
  for (let i = 0; i < 4; i++) {
    const ry = y + 6 + i * 6;
    ribs += `<path d="M ${cx} ${ry} q -9 -1 -11 ${4 - i * 0.6} M ${cx} ${ry} q 9 -1 11 ${4 - i * 0.6}" fill="none" ${stroke(3.4, BONE_DK)}/>` +
      `<path d="M ${cx} ${ry} q -9 -1 -11 ${4 - i * 0.6} M ${cx} ${ry} q 9 -1 11 ${4 - i * 0.6}" fill="none" ${stroke(2.2, BONE)}/>`;
  }
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="7" fill="#2A2A36" ${stroke()}/>` +
    `<path d="M ${cx} ${y + 3} v ${h - 6}" ${stroke(3.2, BONE)}/>` + ribs +
    `<path d="M ${cx - 10} ${y + h - 4} h 20" ${stroke(3, BONE_DK)}/>`;
}

const style = {
  skin: BONE, skinDark: BONE_DK, blush: false, ears: false,
  face,
  sleeve: BONE, hand: BONE,
  pants: [BONE, BONE_DK], shoe: BONE,
  torso,
  // Cranium cracks and a jaw line.
  hairFront: (cx, cy) => `<path d="M ${cx + 6} ${cy - 16} l 3 4 l -2 3 l 3 3" fill="none" ${stroke(1.2, BONE_DK)}/>` +
    `<path d="M ${cx - 12} ${cy + 12} q 12 6 24 0" fill="none" ${stroke(1.2, BONE_DK)}/>`,
};

/** A bat seen from the front, centred at (x, y). `s` scales it, `flap` raises the wing tips. */
const bat = (x, y, s = 1.5, flap = 0) => {
  const wing = (m) =>
    `<path d="M ${m * 2} -1 C ${m * 8} -9 ${m * 15} ${-9 - flap} ${m * 19} ${-4 - flap} ` +
    `C ${m * 17} -2 ${m * 15} -1 ${m * 13} 2 C ${m * 12} 0 ${m * 10} 0 ${m * 9} 3 C ${m * 8} 1 ${m * 6} 2 ${m * 3} 5 Z" fill="#2A2A36" ${stroke(0.8, '#111')}/>`;
  return `<g transform="translate(${x} ${y}) scale(${s})">
${wing(-1)}${wing(1)}
<ellipse cx="0" cy="2" rx="3.4" ry="5.5" fill="#2A2A36" ${stroke(0.8, '#111')}/>
<path d="M -3 -5 l -1.5 -4.5 l 3.5 2 z M 3 -5 l 1.5 -4.5 l -3.5 2 z" fill="#2A2A36" ${stroke(0.8, '#111')}/>
<circle cx="0" cy="-4" r="3.6" fill="#2A2A36" ${stroke(0.8, '#111')}/>
<circle cx="-1.4" cy="-4.4" r="0.9" fill="${GLOW}"/><circle cx="1.4" cy="-4.4" r="0.9" fill="${GLOW}"/>
</g>`;
};

const anims = humanAnimations(style, {
  alert: { extraFrames: [BANG(122, 56) + bat(102, 24, 1.5, 0), BANG(122, 56) + bat(102, 18, 1.5, 4)] },
  happy: { extra: HEART() },
});

writePack('skeleton', {
  name: 'Rattles',
  petLines: ['*rattle rattle*', 'Bone-jour!', 'I have a bone to pick with you.', '*clatters*', 'Nothing gets under my skin.'],
}, anims);
