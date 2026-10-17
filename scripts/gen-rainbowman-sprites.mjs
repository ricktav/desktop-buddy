// Rainbow Man buddy "Roy G." A cheerful chibi with rainbow hair and a striped
// suit who leaves a little rainbow arc when he is excited.
// Run: node scripts/gen-rainbowman-sprites.mjs
import { writePack, BANG, HEART, FLOOR } from './lib/sprite.mjs';
import { humanAnimations, stroke } from './lib/chibi.mjs';

const RAINBOW = ['#FF3B30', '#FF9500', '#FFD60A', '#34C759', '#2F9BFF', '#5856D6', '#AF52DE'];
const HAIR_OUT = '#3B2F5C';

function stripedRect(x, y, w, h, r = 5) {
  const id = `clip${x}${y}${w}${h}`.replace(/[^a-z0-9]/gi, '');
  const n = RAINBOW.length;
  const bands = RAINBOW.map((c, i) => `<rect x="${x}" y="${y + (h / n) * i}" width="${w}" height="${h / n + 0.5}" fill="${c}"/>`).join('');
  return `<clipPath id="${id}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/></clipPath>` +
    `<g clip-path="url(#${id})">${bands}</g>` +
    `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="none" ${stroke()}/>`;
}

function rainbowArc(cx, cy, r, { width = 3, opacity = 1 } = {}) {
  return `<g opacity="${opacity}">` + RAINBOW.map((c, i) => {
    const rr = r - i * width;
    return `<path d="M ${cx - rr} ${cy} A ${rr} ${rr} 0 0 1 ${cx + rr} ${cy}" fill="none" stroke="${c}" stroke-width="${width}"/>`;
  }).join('') + `</g>`;
}

const style = {
  skin: '#F6C9A5', skinDark: '#D9A27A',
  sleeve: '#3E3E58', hand: '#fff',
  pants: ['#2F9BFF', '#5AB0FF'], shoe: '#2F2F44',
  torso: (x, y, w, h) => stripedRect(x, y, w, h, 7),
  // Rainbow afro: a white disc behind the head topped with a rainbow arc.
  hairBack: (cx, cy) => `<circle cx="${cx}" cy="${cy - 8}" r="25" fill="#FFF" stroke="${HAIR_OUT}" stroke-width="1.6"/>` + rainbowArc(cx, cy - 6, 24.5, { width: 3.3 }),
};

const arc = rainbowArc(64, FLOOR - 2, 56, { width: 4, opacity: 0.9 });
const anims = humanAnimations(style, {
  alert: { behind: arc, extra: BANG(120, 30) },
  happy: { behind: arc, extra: HEART() },
});

writePack('rainbow-man', {
  name: 'Roy G.',
  petLines: ['Hey there, sunshine!', '*jazz hands*', 'Every colour, all at once!', '*sparkles*', 'High five!'],
}, anims);
