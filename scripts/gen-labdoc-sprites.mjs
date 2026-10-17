// Lab doctor buddy "Dr. Vee": a chibi scientist-doctor in a white coat over
// teal scrubs, stethoscope, clipboard, blond bob with red-dipped tips.
// Run: node scripts/gen-labdoc-sprites.mjs
import { writePack, BANG, HEART } from './lib/sprite.mjs';
import { humanAnimations, stroke, OUT } from './lib/chibi.mjs';

const BLOND = '#F4D26C', BLOND_DK = '#D9B24A', RED = '#E23B3B', RED_DK = '#A82424';
const COAT = '#FFFFFF', COAT_SHADE = '#DEE3EC', SCRUB = '#3FB8AF', SCRUB_DK = '#2B8A83';

const DEFS = `
<linearGradient id="hairTips" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="${BLOND}"/><stop offset="0.62" stop-color="${BLOND}"/>
  <stop offset="0.78" stop-color="#F08A4B"/><stop offset="0.9" stop-color="${RED}"/><stop offset="1" stop-color="${RED_DK}"/>
</linearGradient>
<linearGradient id="hairTipsLock" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="${BLOND}"/><stop offset="0.55" stop-color="${BLOND}"/>
  <stop offset="0.75" stop-color="#F08A4B"/><stop offset="1" stop-color="${RED}"/>
</linearGradient>
<linearGradient id="flask" x1="0" y1="0" x2="0" y2="1">
  <stop offset="0" stop-color="#7CF2A5" stop-opacity="0.2"/><stop offset="0.45" stop-color="#7CF2A5" stop-opacity="0.2"/>
  <stop offset="0.46" stop-color="#3DD67A"/><stop offset="1" stop-color="#1FA85A"/>
</linearGradient>`;

/** Long bob behind the head, blond fading to red at the tips. */
function hairBack(cx, cy) {
  return `
<path d="M ${cx - 24} ${cy - 2} C ${cx - 28} ${cy - 30} ${cx + 28} ${cy - 30} ${cx + 24} ${cy - 2}
         L ${cx + 27} ${cy + 20} Q ${cx + 22} ${cy + 27} ${cx + 16} ${cy + 23}
         Q ${cx} ${cy + 28} ${cx - 16} ${cy + 23} Q ${cx - 22} ${cy + 27} ${cx - 27} ${cy + 20} Z"
      fill="url(#hairTips)" ${stroke(1.6, '#7A4A1E')}/>
<path d="M ${cx - 22} ${cy + 4} q 1 10 -2 16 M ${cx + 22} ${cy + 4} q -1 10 2 16" fill="none" stroke="${BLOND_DK}" stroke-width="1" opacity="0.7"/>`;
}

/** Swept fringe and two front locks with red tips. */
function hairFront(cx, cy) {
  return `
<path d="M ${cx - 20} ${cy - 5} C ${cx - 18} ${cy - 24} ${cx + 2} ${cy - 27} ${cx + 21} ${cy - 9}
         C ${cx + 12} ${cy - 15} ${cx + 4} ${cy - 14} ${cx - 2} ${cy - 10}
         C ${cx - 8} ${cy - 13} ${cx - 14} ${cy - 10} ${cx - 20} ${cy - 5} Z"
      fill="${BLOND}" ${stroke(1.4, '#7A4A1E')}/>
<path d="M ${cx - 6} ${cy - 14} q 6 -4 14 -2" fill="none" stroke="${BLOND_DK}" stroke-width="1" opacity="0.8"/>
<path d="M ${cx - 21} ${cy - 6} q -6 12 -2 26 l 5 -2 q 0 -14 2 -22 Z" fill="url(#hairTipsLock)" ${stroke(1.2, '#7A4A1E')}/>
<path d="M ${cx + 21} ${cy - 6} q 6 12 2 26 l -5 -2 q 0 -14 -2 -22 Z" fill="url(#hairTipsLock)" ${stroke(1.2, '#7A4A1E')}/>`;
}

/** White coat open over teal scrubs, with pocket, pen, badge and stethoscope. */
function torso(x, y, w, h) {
  const cx = x + w / 2;
  return `
<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="${COAT}" ${stroke()}/>
<path d="M ${cx - 7} ${y} L ${cx} ${y + 12} L ${cx + 7} ${y} Z" fill="${SCRUB}"/>
<path d="M ${cx - 7} ${y} L ${cx} ${y + 12} M ${cx + 7} ${y} L ${cx} ${y + 12}" fill="none" ${stroke(1.2, SCRUB_DK)}/>
<path d="M ${cx - 7} ${y} L ${cx - 2} ${y + 14} L ${cx - 1} ${y + h}" fill="none" ${stroke(1.2, COAT_SHADE)}/>
<path d="M ${cx + 7} ${y} L ${cx + 2} ${y + 14} L ${cx + 1} ${y + h}" fill="none" ${stroke(1.2, COAT_SHADE)}/>
<circle cx="${cx}" cy="${y + 18}" r="1.1" fill="${OUT}"/><circle cx="${cx}" cy="${y + 24}" r="1.1" fill="${OUT}"/>
<rect x="${x + 3}" y="${y + h - 11}" width="8" height="7" rx="1.5" fill="${COAT}" ${stroke(1.1, COAT_SHADE)}/>
<path d="M ${x + 6} ${y + h - 16} v 7" ${stroke(2, '#2F6FD6')}/><path d="M ${x + 6} ${y + h - 16} v 2" ${stroke(2, '#E23B3B')}/>
<rect x="${x + w - 11}" y="${y + h - 13}" width="8" height="6" rx="1" fill="#F7F7FA" ${stroke(1, '#8A93A6')}/>
<rect x="${x + w - 9.5}" y="${y + h - 11.5}" width="2.5" height="3" fill="#3A7BD5"/>
<path d="M ${cx - 9} ${y - 1} C ${cx - 11} ${y + 8} ${cx - 6} ${y + 14} ${cx - 3} ${y + 16}
         M ${cx + 9} ${y - 1} C ${cx + 11} ${y + 8} ${cx + 6} ${y + 14} ${cx + 3} ${y + 16}" fill="none" ${stroke(2.2, '#3A3A48')}/>
<circle cx="${cx}" cy="${y + 19}" r="3.2" fill="#C9CED8" ${stroke(1.2, '#4A4F5C')}/>
<circle cx="${cx}" cy="${y + 19}" r="1.2" fill="#7A8090"/>`;
}

const clipboard = (hx, hy) =>
  `<g transform="translate(${hx} ${hy}) rotate(-8)">
<rect x="-6" y="-9" width="12" height="15" rx="1.5" fill="#B5783B" ${stroke(1.2, '#6E4620')}/>
<rect x="-4.5" y="-6.5" width="9" height="11" fill="#FFFFFF"/>
<rect x="-3" y="-10.5" width="6" height="3" rx="1" fill="#8A93A6"/>
<path d="M -3 -3 h 6 M -3 -0.5 h 6 M -3 2 h 4" ${stroke(0.8, '#8A93A6')}/>
</g>`;

const pen = (hx, hy) =>
  `<g transform="translate(${hx} ${hy}) rotate(-50)">
<rect x="-1.5" y="-13" width="3" height="16" rx="1" fill="#2F6FD6" ${stroke(0.9)}/>
<path d="M -1.5 -13 L 0 -17 L 1.5 -13 Z" fill="#F3D9B0" ${stroke(0.9)}/>
</g>`;

const flask = (hx, hy) =>
  `<g transform="translate(${hx} ${hy - 4})">
<path d="M -3 -18 h 6 v 8 l 8 14 q 1 3 -2 3 h -18 q -3 0 -2 -3 l 8 -14 z" fill="url(#flask)" ${stroke(1.2, '#3C4A6E')}/>
<rect x="-4" y="-19" width="8" height="2.5" rx="1" fill="#C9CED8" ${stroke(0.9, '#3C4A6E')}/>
<circle cx="-2" cy="-1" r="1.4" fill="#C9FFDD"/><circle cx="3" cy="2" r="1" fill="#C9FFDD"/><circle cx="0" cy="-24" r="1.6" fill="#7CF2A5" opacity="0.8"/><circle cx="4" cy="-29" r="1.1" fill="#7CF2A5" opacity="0.6"/>
</g>`;

const style = {
  defs: DEFS,
  skin: '#F7D3B5', skinDark: '#DBAE8C', lashes: true, iris: '#3A7BD5', lip: '#9E2F4C',
  sleeve: COAT, hand: '#F7D3B5',
  pants: ['#2E3A59', '#3C4A6E'], shoe: '#2B2B3A',
  torso, hairBack, hairFront,
};

const anims = humanAnimations(style, {
  standing: { heldL: clipboard },
  sitting: { heldL: clipboard },
  point: { heldR: pen },
  alert: { heldR: flask, heldL: null, extra: BANG(118, 34) },
  happy: { extra: HEART(), heldL: null },
});

writePack('lab-doctor', {
  name: 'Dr. Vee',
  petLines: ['Results look good!', '*checks clipboard*', 'Stay hydrated.', 'Have you stretched today?', '*adjusts coat*'],
}, anims);
