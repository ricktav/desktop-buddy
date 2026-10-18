// Builds examples/ghost.buddy.json: a complete single-file buddy bundle (the
// format an AI should produce) for a friendly ghost. Run: node scripts/make-example-bundle.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILL = '#F4F7FF', EDGE = '#7A86A8', INK = '#1E2233';

const BODY = `<path d='M 30 118 V 72 C 30 38 98 38 98 72 V 118 q -8.5 -8 -17 0 q -8.5 8 -17 0 q -8.5 -8 -17 0 q -8.5 8 -17 0 Z' fill='${FILL}' stroke='${EDGE}' stroke-width='2.5' stroke-linejoin='round'/>` +
  `<path d='M 38 60 C 40 50 52 46 60 47' fill='none' stroke='#fff' stroke-width='4' stroke-linecap='round' opacity='0.9'/>`;

function eye(x, y, mode) {
  switch (mode) {
    case 'closed': return `<path d='M ${x - 4} ${y} q 4 3.5 8 0' fill='none' stroke='${INK}' stroke-width='2.2' stroke-linecap='round'/>`;
    case 'happy': return `<path d='M ${x - 4} ${y + 1.5} q 4 -6 8 0' fill='none' stroke='${INK}' stroke-width='2.4' stroke-linecap='round'/>`;
    case 'wide': return `<ellipse cx='${x}' cy='${y}' rx='5.4' ry='7' fill='${INK}'/><circle cx='${x + 1.5}' cy='${y - 2.5}' r='1.7' fill='#fff'/>`;
    case 'up': return `<ellipse cx='${x}' cy='${y}' rx='4.5' ry='6' fill='${INK}'/><circle cx='${x + 1.2}' cy='${y - 3.2}' r='1.6' fill='#fff'/>`;
    case 'worried': return `<ellipse cx='${x}' cy='${y}' rx='4.5' ry='6' fill='${INK}'/><circle cx='${x + 1.2}' cy='${y - 1.8}' r='1.5' fill='#fff'/><path d='M ${x - 5} ${y - 9} l 9 3' stroke='${INK}' stroke-width='1.8' stroke-linecap='round'/>`;
    default: return `<ellipse cx='${x}' cy='${y}' rx='4.5' ry='6' fill='${INK}'/><circle cx='${x + 1.4}' cy='${y - 2}' r='1.5' fill='#fff'/>`;
  }
}

function mouth(kind) {
  if (kind === 'o') return `<ellipse cx='77' cy='90' rx='3.5' ry='4.5' fill='${INK}'/>`;
  if (kind === 'grin') return `<path d='M 68 86 q 9 12 18 0 z' fill='#C53D5E' stroke='${INK}' stroke-width='1.6' stroke-linejoin='round'/>`;
  if (kind === 'flat') return `<path d='M 70 89 h 12' stroke='${INK}' stroke-width='2' stroke-linecap='round'/>`;
  return `<path d='M 69 86 q 8 7 16 0' fill='none' stroke='${INK}' stroke-width='2.2' stroke-linecap='round'/>`;
}

function arm(x1, y1, x2, y2) {
  return `<path d='M ${x1} ${y1} Q ${(x1 + x2) / 2} ${(y1 + y2) / 2 - 6} ${x2} ${y2}' fill='none' stroke='${EDGE}' stroke-width='10' stroke-linecap='round'/>` +
    `<path d='M ${x1} ${y1} Q ${(x1 + x2) / 2} ${(y1 + y2) / 2 - 6} ${x2} ${y2}' fill='none' stroke='${FILL}' stroke-width='6.5' stroke-linecap='round'/>`;
}

const ARMS = {
  down: arm(34, 88, 24, 102) + arm(94, 88, 104, 102),
  up: arm(34, 84, 18, 60) + arm(94, 84, 110, 60),
  point: arm(34, 88, 24, 102) + arm(94, 84, 118, 56),
  hold: arm(34, 88, 28, 104) + arm(94, 88, 100, 78),
};

const BANG = `<rect x='110' y='20' width='6' height='20' rx='3' fill='#E63946'/><circle cx='113' cy='48' r='3.6' fill='#E63946'/>`;
const HEART = `<path d='M 108 26 c -3 -6 -12 -4 -10 3 c 1 4 6 7 10 11 c 4 -4 9 -7 10 -11 c 2 -7 -7 -9 -10 -3 z' fill='#F25F7A' stroke='#C03B58' stroke-width='1.2'/>`;
const ZZZ = (dy = 0) => `<path d='M 96 ${50 - dy} h 9 l -9 9 h 9' fill='none' stroke='#5B8DEF' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'/><path d='M 108 ${36 - dy} h 12 l -12 12 h 12' fill='none' stroke='#5B8DEF' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'/>`;

function ghost({ dy = 0, sx = 1, sy = 1, rot = 0, eyes = 'open', mouthKind = 'smile', arms = 'down', extra = '', blush = true } = {}) {
  const face = eye(66, 72, eyes) + eye(86, 72, eyes) + mouth(mouthKind) +
    (blush ? `<ellipse cx='60' cy='84' rx='5' ry='3' fill='#F7A3A3' opacity='0.6'/><ellipse cx='92' cy='84' rx='5' ry='3' fill='#F7A3A3' opacity='0.6'/>` : '');
  return `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128'>` +
    `<ellipse cx='64' cy='122' rx='30' ry='3' fill='#000' opacity='0.14'/>` +
    `<g transform='translate(0 ${dy}) translate(64 120) rotate(${rot}) scale(${sx} ${sy}) translate(-64 -120)'>${BODY}${ARMS[arms]}${face}</g>${extra}</svg>`;
}

const anims = {
  idle: { fps: 2, frames: [ghost({}), ghost({ dy: -2 }), ghost({ eyes: 'closed' }), ghost({ dy: -3 })] },
  walk: { fps: 8, frames: [0, 1, 2, 3].map((p) => ghost({ rot: [-6, 0, 6, 0][p], dy: p % 2 ? -4 : 0, sy: p % 2 ? 1.03 : 0.98 })) },
  sit: { fps: 1.5, frames: [ghost({ sy: 0.85, sx: 1.08 }), ghost({ sy: 0.87, sx: 1.07 }), ghost({ sy: 0.85, sx: 1.08, eyes: 'closed' }), ghost({ sy: 0.87, sx: 1.07 })] },
  sleep: { fps: 1, frames: [ghost({ sy: 0.62, sx: 1.2, eyes: 'closed', mouthKind: 'flat', arms: 'down', extra: ZZZ(0) }), ghost({ sy: 0.64, sx: 1.19, eyes: 'closed', mouthKind: 'flat', extra: ZZZ(6) })] },
  watch: { fps: 1.5, frames: [ghost({ eyes: 'up', rot: -3 }), ghost({ eyes: 'up', rot: -6 }), ghost({ eyes: 'up', rot: -3 }), ghost({ eyes: 'closed', rot: -6 })] },
  point: { fps: 2, frames: [ghost({ arms: 'point', mouthKind: 'o' }), ghost({ arms: 'point', mouthKind: 'o', eyes: 'wide', dy: -2 })] },
  alert: { fps: 4, frames: [ghost({ arms: 'up', eyes: 'wide', mouthKind: 'o', extra: BANG }), ghost({ arms: 'up', eyes: 'wide', mouthKind: 'o', dy: -8, extra: BANG })] },
  happy: { fps: 5, frames: [ghost({ arms: 'up', eyes: 'happy', mouthKind: 'grin', extra: HEART }), ghost({ arms: 'up', eyes: 'happy', mouthKind: 'grin', dy: -8, extra: HEART })] },
  drag: { fps: 2, frames: [ghost({ arms: 'up', eyes: 'worried', mouthKind: 'o', dy: -10, rot: -4 }), ghost({ arms: 'up', eyes: 'worried', mouthKind: 'o', dy: -12, rot: 4 })] },
  trick: { fps: 8, frames: [ghost({ arms: 'up', eyes: 'happy', mouthKind: 'grin', rot: -12, dy: -10 }), ghost({ arms: 'up', eyes: 'happy', mouthKind: 'grin', rot: 0, dy: -18 }), ghost({ arms: 'up', eyes: 'happy', mouthKind: 'grin', rot: 12, dy: -10 }), ghost({ arms: 'up', eyes: 'happy', mouthKind: 'grin', rot: 0, dy: -2 })] },
};

const manifest = {
  name: 'Wisp',
  frameWidth: 128,
  frameHeight: 128,
  scale: 1,
  facing: 'right',
  feetOffset: 6,
  petLines: ['Boo! ...just kidding.', '*floats happily*', 'Wooo!', '*spooky giggle*'],
  animations: {},
  doubleClick: { animation: 'trick', seconds: 3.5, say: 'Boooo!', effect: { type: 'bats', count: 4 } },
};
const files = {};
for (const [name, def] of Object.entries(anims)) {
  manifest.animations[name] = { fps: def.fps, frames: def.frames.map((svg, i) => { const f = `${name}-${i}.svg`; files[f] = svg; return f; }) };
}
mkdirSync(join(root, 'examples'), { recursive: true });
writeFileSync(join(root, 'examples', 'ghost.buddy.json'), JSON.stringify({ id: 'wisp-ghost', manifest, files }, null, 2) + '\n');
console.log(`wrote examples/ghost.buddy.json (${Object.keys(files).length} frames)`);
