// Shared helpers for sprite generators.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const W = 128;
export const H = 128;
export const FLOOR = 122;

export function svgWrap(inner, { defs = '', extraAttrs = '' } = {}) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}"${extraAttrs}>\n${defs ? `<defs>${defs}</defs>\n` : ''}${inner}\n</svg>\n`;
}

/** Bold outlined text used for "z", "!" and similar marks. */
export function mark(text, x, y, size, color) {
  return `<text x="${x}" y="${y}" font-family="Arial Rounded MT Bold, Helvetica, Arial, sans-serif" font-weight="bold" font-size="${size}" fill="${color}" stroke="#fff" stroke-width="2" paint-order="stroke" text-anchor="middle">${text}</text>`;
}

export const SLEEP_MARKS = (dy = 0, x = 112) => mark('z', x, 56 - dy, 13, '#5B8DEF') + mark('Z', x + 10, 42 - dy * 1.5, 18, '#5B8DEF');
export const BANG = (x = 120, y = 28) => mark('!', x, y, 26, '#E63946');
export const HEART = (x = 112, y = 22) =>
  `<path d="M ${x} ${y} c -3 -6 -12 -4 -10 3 c 1 4 6 7 10 11 c 4 -4 9 -7 10 -11 c 2 -7 -7 -9 -10 -3 z" fill="#F25F7A" stroke="#C03B58" stroke-width="1.2"/>`;

/** Write a pack folder: frames + buddy.json. `anims` is {name: {fps, frames: [svgString]}}. */
export function writePack(pack, { name, feetOffset = H - FLOOR, petLines = [], pixelArt = false, scale = 1, ...extra }, anims) {
  const dir = join(ROOT, 'buddies', pack);
  mkdirSync(dir, { recursive: true });
  const manifest = {
    name,
    frameWidth: W,
    frameHeight: H,
    scale,
    facing: 'right',
    feetOffset,
    ...(pixelArt ? { pixelArt: true } : {}),
    petLines,
    ...extra,
    animations: {},
  };
  for (const [anim, def] of Object.entries(anims)) {
    manifest.animations[anim] = {
      frames: def.frames.map((svg, i) => {
        const file = `${anim}-${i}.svg`;
        writeFileSync(join(dir, file), svg);
        return file;
      }),
      fps: def.fps,
    };
  }
  writeFileSync(join(dir, 'buddy.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`wrote ${pack}: ${Object.keys(anims).length} animations`);
}

/**
 * Tiny pixel canvas that emits crisp SVG rects. Coordinates are in pixel-art
 * units; `cell` is how many SVG units each pixel covers.
 */
export class PixelCanvas {
  constructor(w, h, cell) {
    this.w = w;
    this.h = h;
    this.cell = cell;
    this.px = new Array(w * h).fill(null);
  }
  set(x, y, c) {
    x = Math.round(x);
    y = Math.round(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    this.px[y * this.w + x] = c;
  }
  rect(x, y, w, h, c) {
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.set(x + i, y + j, c);
  }
  /** Outline a rect: fill with `fill`, 1px border with `edge`. */
  box(x, y, w, h, fill, edge) {
    this.rect(x, y, w, h, edge);
    this.rect(x + 1, y + 1, w - 2, h - 2, fill);
  }
  line(x0, y0, x1, y1, c) {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      this.set(x0, y0, c);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  /** Draw text-free pixel data from a string grid using a palette map. */
  blit(x, y, rows, palette) {
    rows.forEach((row, j) => {
      [...row].forEach((ch, i) => {
        if (ch !== ' ' && ch !== '.' && palette[ch]) this.set(x + i, y + j, palette[ch]);
      });
    });
  }
  toSvgRects(ox = 0, oy = 0) {
    const out = [];
    for (let y = 0; y < this.h; y++) {
      let x = 0;
      while (x < this.w) {
        const c = this.px[y * this.w + x];
        if (!c) { x++; continue; }
        let run = 1;
        while (x + run < this.w && this.px[y * this.w + x + run] === c) run++;
        out.push(`<rect x="${ox + x * this.cell}" y="${oy + y * this.cell}" width="${run * this.cell}" height="${this.cell}" fill="${c}"/>`);
        x += run;
      }
    }
    return `<g shape-rendering="crispEdges">${out.join('')}</g>`;
  }
}
