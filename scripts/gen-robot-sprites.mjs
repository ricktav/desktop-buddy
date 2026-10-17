// Pixel-art robot buddy "Bolt". 32x32 pixel grid, 4 SVG units per pixel.
// Run: node scripts/gen-robot-sprites.mjs
import { PixelCanvas, svgWrap, writePack, SLEEP_MARKS, BANG, HEART, FLOOR } from './lib/sprite.mjs';

const CELL = 4;
const GRID = 32;
const C = {
  body: '#8E9AAE', bodyDk: '#4C5566', bodyLt: '#C9D2E0', edge: '#262B36',
  eye: '#4FF0FF', eyeDk: '#1A6E7A', eyeOff: '#2E3540',
  accent: '#FF8C42', accentDk: '#B85A1E', red: '#FF4D4D', green: '#6CF26C',
  tread: '#3A404C', treadLt: '#5B6473', glass: '#DDF7FF',
};

/**
 * Draw the robot. All parts are parameterised so poses can be composed.
 *  dy          whole-robot vertical offset (negative = up)
 *  eyes        'on' | 'off' | 'up' | 'wide' | 'happy' | 'worried' | 'closed'
 *  mouth       'line' | 'smile' | 'o' | 'flat'
 *  bulb        colour of the antenna light
 *  legs        'stand' | ['walk', phase] | 'sit' | 'dangle'
 *  armR        'down' | 'point' | 'up' | 'wave'
 *  armL        'down' | 'up'
 */
function robot({ dy = 0, eyes = 'on', mouth = 'line', bulb = C.green, legs = 'stand', armR = 'down', armL = 'down', headDy = 0 } = {}) {
  const cv = new PixelCanvas(GRID, GRID, CELL);
  // Floor is at pixel row 31 (y = 124 → bottom). Body sits so feet end at row 30.
  const base = dy;
  const sitting = legs === 'sit';
  const bodyDy = base + (sitting ? 5 : 0);

  // ---- legs & feet -------------------------------------------------------
  if (legs === 'stand' || Array.isArray(legs)) {
    const phase = Array.isArray(legs) ? legs[1] : null;
    const off = phase === null ? [0, 0] : [[-1, 1], [0, 0], [1, -1], [0, 0]][phase % 4];
    const lift = phase === null ? [0, 0] : [[1, 0], [0, 0], [0, 1], [0, 0]][phase % 4];
    // left leg (further from viewer), right leg
    cv.box(11 + off[0], 23 + base - lift[0], 3, 7, C.bodyDk, C.edge);
    cv.box(10 + off[0], 29 + base - lift[0], 5, 2, C.tread, C.edge);
    cv.box(18 + off[1], 23 + base - lift[1], 3, 7, C.body, C.edge);
    cv.box(17 + off[1], 29 + base - lift[1], 5, 2, C.tread, C.edge);
    cv.rect(18 + off[1], 30 + base - lift[1], 3, 1, C.treadLt);
  } else if (sitting) {
    // Legs stretched out in front along the floor.
    cv.box(12, 27 + base, 10, 3, C.bodyDk, C.edge);
    cv.box(21, 26 + base, 4, 5, C.tread, C.edge);
    cv.box(14, 28 + base, 10, 3, C.body, C.edge);
    cv.box(23, 27 + base, 4, 4, C.tread, C.edge);
  } else if (legs === 'dangle') {
    cv.box(11, 24 + base, 3, 6, C.bodyDk, C.edge);
    cv.box(10, 29 + base, 5, 2, C.tread, C.edge);
    cv.box(18, 25 + base, 3, 5, C.body, C.edge);
    cv.box(17, 29 + base, 5, 2, C.tread, C.edge);
  }

  // ---- body ----------------------------------------------------------------
  cv.box(10, 14 + bodyDy, 12, 10, C.body, C.edge);
  cv.rect(11, 15 + bodyDy, 10, 1, C.bodyLt);
  cv.rect(11, 15 + bodyDy, 1, 8, C.bodyLt);
  cv.box(13, 17 + bodyDy, 6, 4, C.bodyDk, C.edge);
  cv.rect(14, 18 + bodyDy, 2, 2, C.accent);
  cv.rect(17, 18 + bodyDy, 1, 1, C.green);
  cv.rect(17, 19 + bodyDy, 1, 1, C.red);
  // neck
  cv.rect(14, 13 + bodyDy, 4, 1, C.bodyDk);

  // ---- arms ---------------------------------------------------------------
  const arm = (x, kind, shade) => {
    if (kind === 'down') {
      cv.box(x, 15 + bodyDy, 2, 7, shade, C.edge);
      cv.box(x - (x < 16 ? 1 : 0), 21 + bodyDy, 3, 2, C.bodyDk, C.edge);
    } else if (kind === 'up') {
      cv.box(x, 8 + bodyDy, 2, 7, shade, C.edge);
      cv.box(x - (x < 16 ? 1 : 0), 6 + bodyDy, 3, 2, C.bodyDk, C.edge);
    }
  };
  arm(8, armL, C.bodyDk);
  if (armR === 'point') {
    // Diagonal arm to the upper right ending in a pointing hand.
    for (let i = 0; i < 7; i++) {
      cv.rect(22 + i, 15 + bodyDy - i, 2, 2, C.body);
      cv.set(22 + i, 17 + bodyDy - i, C.edge);
      cv.set(24 + i, 14 + bodyDy - i, C.edge);
    }
    cv.box(28, 6 + bodyDy, 3, 3, C.bodyDk, C.edge);
    cv.rect(31, 7 + bodyDy, 1, 1, C.bodyDk);
  } else if (armR === 'wave') {
    cv.box(22, 9 + bodyDy, 2, 6, C.body, C.edge);
    cv.box(22, 7 + bodyDy, 3, 2, C.bodyDk, C.edge);
  } else {
    arm(22, armR, C.body);
  }

  // ---- head ---------------------------------------------------------------
  const hy = 4 + bodyDy + headDy;
  cv.box(9, hy, 14, 9, C.body, C.edge);
  cv.rect(10, hy + 1, 12, 1, C.bodyLt);
  cv.rect(10, hy + 1, 1, 6, C.bodyLt);
  // visor
  cv.box(11, hy + 2, 10, 5, C.eyeOff, C.edge);
  const eye = (x, y, w, h, c) => cv.rect(x, y, w, h, c);
  switch (eyes) {
    case 'off':
      break;
    case 'closed':
      eye(13, hy + 4, 2, 1, C.eyeDk); eye(17, hy + 4, 2, 1, C.eyeDk);
      break;
    case 'up':
      eye(13, hy + 3, 2, 2, C.eye); eye(17, hy + 3, 2, 2, C.eye);
      cv.set(14, hy + 3, C.glass); cv.set(18, hy + 3, C.glass);
      break;
    case 'wide':
      eye(12, hy + 3, 3, 3, C.eye); eye(17, hy + 3, 3, 3, C.eye);
      cv.set(13, hy + 4, C.glass); cv.set(18, hy + 4, C.glass);
      break;
    case 'happy':
      eye(12, hy + 4, 1, 1, C.eye); eye(13, hy + 3, 2, 1, C.eye); eye(15, hy + 4, 1, 1, C.eye);
      eye(16, hy + 4, 1, 1, C.eye); eye(17, hy + 3, 2, 1, C.eye); eye(19, hy + 4, 1, 1, C.eye);
      break;
    case 'worried':
      eye(13, hy + 4, 2, 2, C.eye); eye(17, hy + 4, 2, 2, C.eye);
      cv.set(12, hy + 3, C.eyeDk); cv.set(13, hy + 3, C.eyeDk); cv.set(18, hy + 3, C.eyeDk); cv.set(19, hy + 3, C.eyeDk);
      break;
    default:
      eye(13, hy + 4, 2, 2, C.eye); eye(17, hy + 4, 2, 2, C.eye);
      cv.set(14, hy + 4, C.glass); cv.set(18, hy + 4, C.glass);
  }
  // mouth grille
  if (mouth === 'line') cv.rect(13, hy + 7, 6, 1, C.bodyDk);
  else if (mouth === 'smile') { cv.rect(14, hy + 7, 4, 1, C.bodyDk); cv.set(13, hy + 6, C.bodyDk); cv.set(18, hy + 6, C.bodyDk); }
  else if (mouth === 'o') cv.box(14, hy + 6, 3, 2, C.eyeOff, C.bodyDk);
  else if (mouth === 'flat') cv.rect(12, hy + 7, 8, 1, C.bodyDk);
  // ear bolts
  cv.rect(8, hy + 3, 1, 3, C.bodyDk); cv.rect(23, hy + 3, 1, 3, C.bodyDk);
  // antenna
  cv.rect(15, hy - 3, 2, 3, C.bodyDk);
  cv.box(14, hy - 5, 4, 3, bulb, C.edge);

  return cv;
}

function frame(opts, extra = '') {
  return svgWrap(robot(opts).toSvgRects(0, 0) + extra);
}

const anims = {
  idle: {
    fps: 2,
    frames: [
      frame({ bulb: C.green }),
      frame({ bulb: C.accent }),
      frame({ bulb: C.green }),
      frame({ bulb: C.accent, eyes: 'closed' }),
    ],
  },
  walk: {
    fps: 8,
    frames: [0, 1, 2, 3].map((p) => frame({ legs: ['walk', p], dy: p % 2 ? -1 : 0 })),
  },
  sit: {
    fps: 1.5,
    frames: [
      frame({ legs: 'sit', bulb: C.green }),
      frame({ legs: 'sit', bulb: C.accent }),
      frame({ legs: 'sit', bulb: C.green }),
      frame({ legs: 'sit', bulb: C.accent, eyes: 'closed' }),
    ],
  },
  sleep: {
    fps: 1,
    frames: [
      frame({ legs: 'sit', eyes: 'off', bulb: C.bodyDk, mouth: 'flat' }, SLEEP_MARKS(0)),
      frame({ legs: 'sit', eyes: 'off', bulb: C.eyeOff, mouth: 'flat' }, SLEEP_MARKS(6)),
    ],
  },
  watch: {
    fps: 1.5,
    frames: [
      frame({ eyes: 'up', headDy: -1 }),
      frame({ eyes: 'up', headDy: -1, bulb: C.accent }),
      frame({ eyes: 'up', headDy: -1 }),
      frame({ eyes: 'closed', headDy: -1, bulb: C.accent }),
    ],
  },
  point: {
    fps: 2,
    frames: [frame({ armR: 'point', mouth: 'o' }), frame({ armR: 'point', eyes: 'wide', mouth: 'o', bulb: C.accent })],
  },
  alert: {
    fps: 4,
    frames: [
      frame({ eyes: 'wide', mouth: 'o', bulb: C.red, armL: 'up', armR: 'up' }, BANG(118, 30)),
      frame({ eyes: 'wide', mouth: 'o', bulb: C.accent, armL: 'up', armR: 'up', dy: -2 }, BANG(118, 30)),
    ],
  },
  happy: {
    fps: 5,
    frames: [
      frame({ eyes: 'happy', mouth: 'smile', armR: 'wave', bulb: C.green }, HEART()),
      frame({ eyes: 'happy', mouth: 'smile', armR: 'up', bulb: C.accent, dy: -1 }, HEART()),
    ],
  },
  drag: {
    fps: 2,
    frames: [
      frame({ eyes: 'worried', mouth: 'o', legs: 'dangle', armL: 'up', armR: 'up', bulb: C.red }),
      frame({ eyes: 'worried', mouth: 'o', legs: 'dangle', armL: 'up', armR: 'up', bulb: C.accent }),
    ],
  },
};

writePack('robot-pixel', {
  name: 'Bolt',
  feetOffset: 128 - FLOOR - 2, // feet end on pixel row 30 (y = 124)
  pixelArt: true,
  petLines: ['BEEP.', '*whirr*', 'Affirmative.', '01101000 01101001', '*servo noises*'],
}, anims);
