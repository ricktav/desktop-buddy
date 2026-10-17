// Generates chibi Labrador sprite frames (SVG) plus a buddy.json manifest for
// each coat colour. Run: node scripts/gen-lab-sprites.mjs
// Artwork faces RIGHT; the renderer mirrors it to face left.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const COATS = {
  'lab-yellow': {
    name: 'Biscuit',
    fur: '#EFC979', furDark: '#C9A054', light: '#FBECC4', nose: '#3B2A22',
    innerEar: '#D9AD5A', eyeRing: null,
  },
  'lab-chocolate': {
    name: 'Mocha',
    fur: '#7A4A2B', furDark: '#54321C', light: '#A6744F', nose: '#2A1A12',
    innerEar: '#5E3620', eyeRing: '#C79B78',
  },
  'lab-black': {
    name: 'Pepper',
    fur: '#35353B', furDark: '#1D1D22', light: '#55555E', nose: '#111114',
    innerEar: '#2A2A30', eyeRing: '#9A9AA6',
  },
};

const PET_LINES = ['Woof!', '*happy tail wiggles*', '*leans in*', 'Hi!', '*boop*'];

const W = 128, H = 128, FLOOR = 122;

function svgWrap(inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">\n${inner}\n</svg>\n`;
}

function stroke(c) {
  return `stroke="${c.furDark}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"`;
}

// ---- parts -----------------------------------------------------------------

function leg(c, x, top, len, { lift = 0 } = {}) {
  const y = top - lift;
  return `<rect x="${x - 5}" y="${y}" width="10" height="${len}" rx="5" fill="${c.fur}" ${stroke(c)}/>`;
}

function tail(c, from, mid, to) {
  return `<path d="M ${from[0]} ${from[1]} Q ${mid[0]} ${mid[1]} ${to[0]} ${to[1]}" fill="none" stroke="${c.furDark}" stroke-width="10" stroke-linecap="round"/>` +
    `<path d="M ${from[0]} ${from[1]} Q ${mid[0]} ${mid[1]} ${to[0]} ${to[1]}" fill="none" stroke="${c.fur}" stroke-width="7" stroke-linecap="round"/>`;
}

function collar(c, cx, cy, rx) {
  return `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="5" fill="#E63946" stroke="#A82633" stroke-width="1.2"/>` +
    `<circle cx="${cx}" cy="${cy + 6}" r="3.6" fill="#F4C542" stroke="#B88A1E" stroke-width="1"/>`;
}

function ear(c, side, cx, cy, mode) {
  // side: -1 left, +1 right. Hangs from the top-side of the head.
  const s = side;
  if (mode === 'up') {
    const bx = cx + s * 20, by = cy - 18;
    return `<path d="M ${bx} ${by + 8} C ${bx + s * 4} ${by - 10} ${bx + s * 14} ${by - 22} ${bx + s * 12} ${by - 26} C ${bx + s * 18} ${by - 12} ${bx + s * 16} ${by + 4} ${bx + s * 6} ${by + 12} Z" fill="${c.fur}" ${stroke(c)}/>` +
      `<path d="M ${bx + s * 5} ${by + 4} C ${bx + s * 6} ${by - 6} ${bx + s * 10} ${by - 14} ${bx + s * 10} ${by - 18}" fill="none" stroke="${c.innerEar}" stroke-width="3" stroke-linecap="round"/>`;
  }
  const bx = cx + s * 24, by = cy - 14;
  const droop = mode === 'sad' ? 8 : 0;
  return `<path d="M ${bx - s * 6} ${by} C ${bx + s * 8} ${by - 6} ${bx + s * 14} ${by + 10} ${bx + s * 12} ${by + 28 + droop} C ${bx + s * 10} ${by + 40 + droop} ${bx - s * 2} ${by + 38 + droop} ${bx - s * 4} ${by + 26 + droop} Z" fill="${c.fur}" ${stroke(c)}/>` +
    `<path d="M ${bx + s * 3} ${by + 8} C ${bx + s * 7} ${by + 14} ${bx + s * 7} ${by + 24} ${bx + s * 4} ${by + 30 + droop}" fill="none" stroke="${c.innerEar}" stroke-width="3" stroke-linecap="round"/>`;
}

function eye(c, cx, cy, mode) {
  const ring = c.eyeRing ? `stroke="${c.eyeRing}" stroke-width="1.2"` : `stroke="${c.furDark}" stroke-width="1"`;
  switch (mode) {
    case 'closed':
      return `<path d="M ${cx - 5} ${cy} q 5 4 10 0" fill="none" stroke="${c.nose}" stroke-width="2.2" stroke-linecap="round"/>`;
    case 'happy':
      return `<path d="M ${cx - 5} ${cy + 1} q 5 -6 10 0" fill="none" stroke="${c.nose}" stroke-width="2.4" stroke-linecap="round"/>`;
    case 'up':
      return `<ellipse cx="${cx}" cy="${cy}" rx="6.5" ry="7" fill="#fff" ${ring}/>` +
        `<circle cx="${cx}" cy="${cy - 3}" r="4.4" fill="${c.nose}"/><circle cx="${cx + 1.6}" cy="${cy - 4.6}" r="1.4" fill="#fff"/>`;
    case 'wide':
      return `<ellipse cx="${cx}" cy="${cy}" rx="7.5" ry="8" fill="#fff" ${ring}/>` +
        `<circle cx="${cx}" cy="${cy}" r="3.6" fill="${c.nose}"/><circle cx="${cx + 1.4}" cy="${cy - 1.4}" r="1.2" fill="#fff"/>`;
    case 'worried':
      return `<ellipse cx="${cx}" cy="${cy}" rx="6.5" ry="7" fill="#fff" ${ring}/>` +
        `<circle cx="${cx}" cy="${cy + 1}" r="3.8" fill="${c.nose}"/><circle cx="${cx + 1.4}" cy="${cy - 0.5}" r="1.2" fill="#fff"/>` +
        `<path d="M ${cx - 6} ${cy - 10} l 12 3" fill="none" stroke="${c.furDark}" stroke-width="2.2" stroke-linecap="round"/>`;
    default: // open
      return `<ellipse cx="${cx}" cy="${cy}" rx="6.5" ry="7" fill="#fff" ${ring}/>` +
        `<circle cx="${cx}" cy="${cy + 0.5}" r="4.6" fill="${c.nose}"/><circle cx="${cx + 1.8}" cy="${cy - 1.6}" r="1.5" fill="#fff"/>`;
  }
}

function head(c, cx, cy, { eyes = 'open', ears = 'down', tongue = false, tilt = 0, mouth = 'smile' } = {}) {
  const r = 30;
  const parts = [];
  parts.push(ear(c, -1, cx, cy, ears));
  parts.push(ear(c, 1, cx, cy, ears));
  parts.push(`<circle cx="${cx}" cy="${cy}" r="${r}" fill="${c.fur}" ${stroke(c)}/>`);
  // muzzle
  parts.push(`<ellipse cx="${cx}" cy="${cy + 13}" rx="15" ry="11" fill="${c.light}" ${stroke(c)}/>`);
  parts.push(`<ellipse cx="${cx}" cy="${cy + 6}" rx="5.5" ry="4.2" fill="${c.nose}"/>`);
  parts.push(`<circle cx="${cx - 1.8}" cy="${cy + 4.6}" r="1.2" fill="#fff" opacity="0.8"/>`);
  if (mouth === 'smile') {
    parts.push(`<path d="M ${cx - 7} ${cy + 15} q 7 7 14 0" fill="none" stroke="${c.nose}" stroke-width="1.8" stroke-linecap="round"/>`);
    parts.push(`<path d="M ${cx} ${cy + 10} v 6" fill="none" stroke="${c.nose}" stroke-width="1.6" stroke-linecap="round"/>`);
  } else if (mouth === 'open') {
    parts.push(`<path d="M ${cx - 7} ${cy + 15} q 7 9 14 0 z" fill="#8E2B3A" stroke="${c.nose}" stroke-width="1.6"/>`);
  } else if (mouth === 'o') {
    parts.push(`<ellipse cx="${cx}" cy="${cy + 17}" rx="3.5" ry="4" fill="#8E2B3A" stroke="${c.nose}" stroke-width="1.4"/>`);
  }
  if (tongue) {
    parts.push(`<path d="M ${cx - 3} ${cy + 17} q 3 10 7 0 z" fill="#F28B9B" stroke="#C85A6D" stroke-width="1.2" stroke-linejoin="round"/>`);
  }
  parts.push(eye(c, cx - 13, cy - 4, eyes));
  parts.push(eye(c, cx + 13, cy - 4, eyes));
  // cheek blush
  parts.push(`<circle cx="${cx - 22}" cy="${cy + 8}" r="3.5" fill="#F6A6A6" opacity="0.55"/>`);
  parts.push(`<circle cx="${cx + 22}" cy="${cy + 8}" r="3.5" fill="#F6A6A6" opacity="0.55"/>`);
  const inner = parts.join('\n');
  return tilt ? `<g transform="rotate(${tilt} ${cx} ${cy})">${inner}</g>` : inner;
}

function mark(text, x, y, size, color) {
  return `<text x="${x}" y="${y}" font-family="Arial Rounded MT Bold, Helvetica, Arial, sans-serif" font-weight="bold" font-size="${size}" fill="${color}" stroke="#fff" stroke-width="2" paint-order="stroke" text-anchor="middle">${text}</text>`;
}

// ---- poses ------------------------------------------------------------------

/** Standing on four legs. phase: 0..3 walk cycle, or null for standing. */
function standing(c, { phase = null, bob = 0, tailUp = 0.5, headOpts = {}, extra = '', headDy = 0 } = {}) {
  const by = 92 + bob;
  const legs = [];
  const legTop = 100 + bob;
  const len = FLOOR - legTop;
  if (phase === null) {
    legs.push(leg(c, 48, legTop, len), leg(c, 60, legTop, len), leg(c, 86, legTop, len), leg(c, 98, legTop, len));
  } else {
    // Diagonal gait: back-left & front-right swing together.
    const swing = [[-4, 3], [0, 0], [4, 3], [0, 0]];
    const [a, la] = swing[phase % 4];
    const [b, lb] = swing[(phase + 2) % 4];
    legs.push(leg(c, 48 + a, legTop, len, { lift: la }), leg(c, 60 + b, legTop, len, { lift: lb }));
    legs.push(leg(c, 86 + b, legTop, len, { lift: lb }), leg(c, 98 + a, legTop, len, { lift: la }));
  }
  const tailEnd = [20, 86 - tailUp * 30];
  return svgWrap([
    legs[0], legs[1],
    tail(c, [40, by - 6], [22, by - 10], tailEnd),
    `<ellipse cx="72" cy="${by}" rx="36" ry="22" fill="${c.fur}" ${stroke(c)}/>`,
    `<ellipse cx="76" cy="${by + 9}" rx="22" ry="11" fill="${c.light}"/>`,
    legs[2], legs[3],
    collar(c, 84, by - 16, 18),
    head(c, 84, 50 + bob + headDy, headOpts),
    extra,
  ].join('\n'));
}

/** Sitting on haunches. */
function sitting(c, { tailUp = 0.3, headOpts = {}, extra = '' } = {}) {
  return svgWrap([
    tail(c, [54, 112], [30, 120], [24, 104 - tailUp * 20]),
    `<ellipse cx="78" cy="96" rx="26" ry="26" fill="${c.fur}" ${stroke(c)}/>`,
    `<ellipse cx="80" cy="104" rx="16" ry="15" fill="${c.light}"/>`,
    // haunch + back paw
    `<ellipse cx="60" cy="108" rx="14" ry="11" fill="${c.fur}" ${stroke(c)}/>`,
    `<ellipse cx="58" cy="118" rx="9" ry="4.5" fill="${c.fur}" ${stroke(c)}/>`,
    leg(c, 84, 96, FLOOR - 96), leg(c, 97, 96, FLOOR - 96),
    collar(c, 84, 70, 17),
    head(c, 84, 44, headOpts),
    extra,
  ].join('\n'));
}

/** Lying down asleep. */
function lying(c, { zOffset = 0, headOpts = {} } = {}) {
  return svgWrap([
    tail(c, [34, 108], [16, 114], [12, 98]),
    `<ellipse cx="70" cy="104" rx="40" ry="16" fill="${c.fur}" ${stroke(c)}/>`,
    `<ellipse cx="104" cy="116" rx="9" ry="4.5" fill="${c.fur}" ${stroke(c)}/>`,
    `<ellipse cx="118" cy="116" rx="9" ry="4.5" fill="${c.fur}" ${stroke(c)}/>`,
    head(c, 92, 90, { eyes: 'closed', ears: 'down', mouth: 'smile', ...headOpts }),
    mark('z', 112, 56 - zOffset, 13, '#5B8DEF'),
    mark('Z', 122, 42 - zOffset * 1.5, 18, '#5B8DEF'),
  ].join('\n'));
}

/** Standing upright on hind legs (pointing / being carried). */
function upright(c, { point = false, dangle = false, headOpts = {}, extra = '' } = {}) {
  const arms = point
    ? `<path d="M 60 82 L 56 104" fill="none" stroke="${c.furDark}" stroke-width="12" stroke-linecap="round"/>` +
      `<path d="M 60 82 L 56 104" fill="none" stroke="${c.fur}" stroke-width="9" stroke-linecap="round"/>`
    : `<path d="M 60 82 L 54 106" fill="none" stroke="${c.furDark}" stroke-width="12" stroke-linecap="round"/>` +
      `<path d="M 60 82 L 54 106" fill="none" stroke="${c.fur}" stroke-width="9" stroke-linecap="round"/>` +
      `<path d="M 90 82 L 96 106" fill="none" stroke="${c.furDark}" stroke-width="12" stroke-linecap="round"/>` +
      `<path d="M 90 82 L 96 106" fill="none" stroke="${c.fur}" stroke-width="9" stroke-linecap="round"/>`;
  const pointArm = point
    ? `<path d="M 92 84 L 120 44" fill="none" stroke="${c.furDark}" stroke-width="12" stroke-linecap="round"/>` +
      `<path d="M 92 84 L 120 44" fill="none" stroke="${c.fur}" stroke-width="9" stroke-linecap="round"/>` +
      `<circle cx="121" cy="42" r="6" fill="${c.light}" ${stroke(c)}/>`
    : '';
  const legTop = dangle ? 108 : 104;
  return svgWrap([
    tail(c, [56, 104], [30, 108], [26, 86]),
    `<ellipse cx="76" cy="94" rx="24" ry="28" fill="${c.fur}" ${stroke(c)}/>`,
    `<ellipse cx="78" cy="100" rx="15" ry="18" fill="${c.light}"/>`,
    leg(c, 66, legTop, FLOOR - legTop), leg(c, 84, legTop, FLOOR - legTop),
    arms,
    collar(c, 80, 66, 17),
    head(c, 80, 40, headOpts),
    pointArm,
    extra,
  ].join('\n'));
}

// ---- animation sets ------------------------------------------------------------

function frames(c) {
  const heart = `<path d="M 112 22 c -3 -6 -12 -4 -10 3 c 1 4 6 7 10 11 c 4 -4 9 -7 10 -11 c 2 -7 -7 -9 -10 -3 z" fill="#F25F7A" stroke="#C03B58" stroke-width="1.2"/>`;
  const bang = mark('!', 120, 28, 26, '#E63946');
  return {
    idle: {
      fps: 2,
      frames: [
        standing(c, { tailUp: 0.5 }),
        standing(c, { tailUp: 0.8 }),
        standing(c, { tailUp: 0.5 }),
        standing(c, { tailUp: 0.8, headOpts: { eyes: 'closed' } }),
      ],
    },
    walk: {
      fps: 8,
      frames: [0, 1, 2, 3].map((p) => standing(c, { phase: p, bob: p % 2 ? -2 : 0, tailUp: p % 2 ? 0.7 : 0.4 })),
    },
    sit: {
      fps: 1.5,
      frames: [
        sitting(c, { tailUp: 0.2 }),
        sitting(c, { tailUp: 0.5 }),
        sitting(c, { tailUp: 0.2 }),
        sitting(c, { tailUp: 0.5, headOpts: { eyes: 'closed' } }),
      ],
    },
    sleep: {
      fps: 1,
      frames: [lying(c, { zOffset: 0 }), lying(c, { zOffset: 6 })],
    },
    watch: {
      fps: 1.5,
      frames: [
        standing(c, { tailUp: 0.6, headDy: -3, headOpts: { eyes: 'up' } }),
        standing(c, { tailUp: 0.9, headDy: -4, headOpts: { eyes: 'up', tilt: -6 } }),
        standing(c, { tailUp: 0.6, headDy: -3, headOpts: { eyes: 'up' } }),
        standing(c, { tailUp: 0.9, headDy: -4, headOpts: { eyes: 'up', tilt: 6 } }),
      ],
    },
    point: {
      fps: 2,
      frames: [
        upright(c, { point: true, headOpts: { eyes: 'open', mouth: 'open' } }),
        upright(c, { point: true, headOpts: { eyes: 'wide', mouth: 'open' } }),
      ],
    },
    alert: {
      fps: 4,
      frames: [
        standing(c, { tailUp: 0.9, headOpts: { eyes: 'wide', ears: 'up', mouth: 'o' }, extra: bang }),
        standing(c, { tailUp: 0.9, bob: -8, headOpts: { eyes: 'wide', ears: 'up', mouth: 'o' }, extra: bang }),
      ],
    },
    happy: {
      fps: 5,
      frames: [
        standing(c, { tailUp: 1, headOpts: { eyes: 'happy', tongue: true, mouth: 'open' }, extra: heart }),
        standing(c, { tailUp: 0.2, bob: -4, headOpts: { eyes: 'happy', tongue: true, mouth: 'open' }, extra: heart }),
      ],
    },
    drag: {
      fps: 2,
      frames: [
        upright(c, { dangle: true, headOpts: { eyes: 'worried', ears: 'sad', mouth: 'o' } }),
        upright(c, { dangle: true, headOpts: { eyes: 'worried', ears: 'sad', mouth: 'o', tilt: -4 } }),
      ],
    },
  };
}

for (const [pack, coat] of Object.entries(COATS)) {
  const dir = join(root, 'buddies', pack);
  mkdirSync(dir, { recursive: true });
  const anims = frames(coat);
  const manifest = {
    name: coat.name,
    frameWidth: W,
    frameHeight: H,
    scale: 1,
    facing: 'right',
    feetOffset: H - FLOOR,
    petLines: PET_LINES,
    animations: {},
  };
  for (const [anim, def] of Object.entries(anims)) {
    const names = def.frames.map((svg, i) => {
      const file = `${anim}-${i}.svg`;
      writeFileSync(join(dir, file), svg);
      return file;
    });
    manifest.animations[anim] = { frames: names, fps: def.fps };
  }
  writeFileSync(join(dir, 'buddy.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`wrote ${pack}: ${Object.keys(anims).length} animations`);
}
