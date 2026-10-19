// Validation and import of buddy packs, shared by the CLI (`buddy validate`,
// `buddy import`) and the tray menu (Import buddy from clipboard). No Electron
// imports so it can run from plain Node and be unit-tested.
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, extname } from 'node:path';

export const KNOWN_ANIMATIONS = ['idle', 'walk', 'run', 'sit', 'sleep', 'watch', 'point', 'alert', 'happy', 'drag', 'rear', 'spin', 'trick'];
export const REQUIRED_ANIMATIONS = ['idle', 'walk'];
export const RECOMMENDED_ANIMATIONS = ['sit', 'sleep', 'watch', 'point', 'alert', 'happy', 'drag'];
const FRAME_EXTENSIONS = new Set(['.svg', '.png', '.webp', '.gif']);
const MAX_FRAME_BYTES = 300 * 1024;
/** Photo-style packs ship raster frames, which are larger than vector ones. */
const MAX_RASTER_FRAME_BYTES = 1024 * 1024;
const MAX_TOTAL_BYTES = 6 * 1024 * 1024;
const MAX_RASTER_TOTAL_BYTES = 40 * 1024 * 1024;
const MAX_FRAMES_TOTAL = 150;
const ID_PATTERN = /^[a-z0-9][a-z0-9-]{1,40}$/;
const FILE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,60}$/;

export interface Report {
  errors: string[];
  warnings: string[];
  info: string[];
}

export interface Bundle {
  id?: string;
  manifest: Record<string, unknown>;
  files: Record<string, string>;
}

export interface ImportOptions {
  /** Directory that holds installed buddy folders. */
  destRoot: string;
  /** Override the folder name. */
  id?: string;
  /** Replace an existing buddy with the same id. */
  force?: boolean;
  /** When the id exists, append -2, -3, … instead of failing. */
  autoSuffix?: boolean;
  /** Directory of bundled packs; ids that collide with it are refused unless forced. */
  bundledDir?: string;
}

export interface ImportResult {
  ok: boolean;
  id: string | null;
  dir: string | null;
  report: Report;
}

export function userDataDir(): string {
  const home = homedir();
  if (process.platform === 'darwin') return join(home, 'Library', 'Application Support', 'desktop-buddy');
  if (process.platform === 'win32') return join(process.env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'desktop-buddy');
  return join(process.env.XDG_CONFIG_HOME ?? join(home, '.config'), 'desktop-buddy');
}

export function userBuddiesPath(): string {
  return join(userDataDir(), 'buddies');
}

const newReport = (): Report => ({ errors: [], warnings: [], info: [] });
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

type FileGetter = (name: string) => string | Buffer | undefined;

/** Validate a manifest and the frames it references. `get` returns a frame's contents. */
export function validatePack(manifest: unknown, get: FileGetter): Report {
  const r = newReport();
  const err = (m: string) => r.errors.push(m);
  const warn = (m: string) => r.warnings.push(m);
  if (!isObj(manifest)) {
    err('buddy.json must be a JSON object');
    return r;
  }
  const m = manifest;

  if (typeof m.name !== 'string' || !m.name.trim()) err('"name" is required (a short display name, e.g. "Wisp")');
  else if (m.name.length > 40) warn('"name" is long; keep it under 40 characters');

  for (const k of ['frameWidth', 'frameHeight'] as const) {
    if (m[k] === undefined) warn(`"${k}" is missing; 128 will be assumed`);
    else if (typeof m[k] !== 'number' || (m[k] as number) <= 0 || (m[k] as number) > 1024) err(`"${k}" must be a number between 1 and 1024`);
  }
  if (m.scale !== undefined && (typeof m.scale !== 'number' || m.scale < 0.2 || m.scale > 4)) err('"scale" must be a number between 0.2 and 4');
  if (m.facing !== undefined && m.facing !== 'left' && m.facing !== 'right') err('"facing" must be "left" or "right"');
  else if (m.facing === undefined) warn('"facing" is missing; the artwork is assumed to face right');
  if (m.feetOffset !== undefined && (typeof m.feetOffset !== 'number' || m.feetOffset < 0)) err('"feetOffset" must be a number of pixels >= 0');
  else if (m.feetOffset === undefined) warn('"feetOffset" is missing; 0 will be used, so the bottom of the frame is treated as the feet');
  if (m.flip !== undefined && typeof m.flip !== 'boolean') err('"flip" must be true or false');
  if (m.edge !== undefined && m.edge !== 'bottom' && m.edge !== 'top') err('"edge" must be "bottom" or "top"');
  if (m.edge === 'top' && m.gripOffset === undefined) r.warnings.push('edge "top" without "gripOffset": the top of the frame will touch the top of the screen. Set gripOffset to the pixels between the frame top and the branch/hands.');
  if (m.gripOffset !== undefined && (typeof m.gripOffset !== 'number' || m.gripOffset < 0 || m.gripOffset > 1024)) err('"gripOffset" must be a number of pixels >= 0');
  if (m.speed !== undefined && (typeof m.speed !== 'number' || m.speed < 0.1 || m.speed > 3)) err('"speed" must be a number between 0.1 and 3');
  if (m.petLines !== undefined && (!Array.isArray(m.petLines) || m.petLines.some((l) => typeof l !== 'string'))) err('"petLines" must be an array of strings');

  const fw = typeof m.frameWidth === 'number' ? m.frameWidth : 128;
  const fh = typeof m.frameHeight === 'number' ? m.frameHeight : 128;

  const anims = m.animations;
  if (!isObj(anims)) {
    err('"animations" is required and must be an object like { "idle": { "frames": [...], "fps": 2 } }');
    return r;
  }
  for (const req of REQUIRED_ANIMATIONS) if (!anims[req]) err(`animation "${req}" is required`);

  let totalFrames = 0;
  let totalBytes = 0;
  let hasRaster = false;
  const sizes = new Map<string, string>();
  const seen = new Set<string>();
  for (const [name, def] of Object.entries(anims)) {
    if (!KNOWN_ANIMATIONS.includes(name)) warn(`animation "${name}" is not a known name and will only play if a trick uses it (known: ${KNOWN_ANIMATIONS.join(', ')})`);
    if (!isObj(def)) {
      err(`animation "${name}" must be an object with "frames" and "fps"`);
      continue;
    }
    if (typeof def.fps !== 'number' || def.fps <= 0 || def.fps > 60) {
      if (def.fps === undefined) warn(`animation "${name}" has no "fps"; 4 will be used`);
      else err(`animation "${name}": "fps" must be a number between 0 and 60`);
    }
    if (def.loop !== undefined && typeof def.loop !== 'boolean') err(`animation "${name}": "loop" must be true or false`);
    if (!Array.isArray(def.frames) || def.frames.length === 0) {
      err(`animation "${name}": "frames" must be a non-empty list of file names`);
      continue;
    }
    if (def.frames.length > 24) warn(`animation "${name}" has ${def.frames.length} frames; 2 to 8 is plenty`);
    for (const f of def.frames) {
      totalFrames++;
      if (typeof f !== 'string' || !FILE_PATTERN.test(f) || f.includes('..')) {
        err(`animation "${name}": frame name ${JSON.stringify(f)} is not allowed (letters, digits, . _ - only, no folders)`);
        continue;
      }
      if (!FRAME_EXTENSIONS.has(extname(f).toLowerCase())) {
        err(`frame "${f}" must end in .svg, .png, .webp or .gif`);
        continue;
      }
      const data = get(f);
      if (data === undefined) {
        err(`frame "${f}" (animation "${name}") is listed but the file is missing`);
        continue;
      }
      if (seen.has(f)) continue;
      seen.add(f);
      const bytes = typeof data === 'string' ? Buffer.byteLength(data) : data.length;
      totalBytes += bytes;
      const ext = extname(f).toLowerCase();
      const raster = ext !== '.svg';
      if (raster) hasRaster = true;
      const limit = raster ? MAX_RASTER_FRAME_BYTES : MAX_FRAME_BYTES;
      if (bytes > limit) err(`frame "${f}" is ${Math.round(bytes / 1024)} KB; the limit is ${limit / 1024} KB. ${raster ? 'Use smaller frames (256x256 is plenty) or WebP.' : 'Simplify the drawing.'}`);
      if (ext === '.svg') checkSvg(f, typeof data === 'string' ? data : data.toString('utf8'), fw, fh, r);
      else if (ext === '.png') checkPng(f, typeof data === 'string' ? Buffer.from(data, 'latin1') : data, fw, fh, r, sizes);
    }
  }
  if (totalFrames > MAX_FRAMES_TOTAL) err(`${totalFrames} frames in total; the limit is ${MAX_FRAMES_TOTAL}`);
  const totalLimit = hasRaster ? MAX_RASTER_TOTAL_BYTES : MAX_TOTAL_BYTES;
  if (totalBytes > totalLimit) err(`pack is ${(totalBytes / 1048576).toFixed(1)} MB; the limit is ${totalLimit / 1048576} MB`);
  if (new Set(sizes.values()).size > 1) warn(`PNG frames have different sizes (${[...new Set(sizes.values())].join(', ')}); every frame should be the same size so the buddy does not jump`);

  const missing = RECOMMENDED_ANIMATIONS.filter((a) => !anims[a]);
  if (missing.length) r.info.push(`no ${missing.join(', ')} animation: those moments will fall back to "idle"`);

  const dc = m.doubleClick;
  if (dc !== undefined) {
    if (!isObj(dc)) err('"doubleClick" must be an object');
    else {
      if (dc.animation !== undefined && (typeof dc.animation !== 'string' || !anims[dc.animation])) err(`"doubleClick.animation" ${JSON.stringify(dc.animation)} is not one of this pack's animations`);
      if (dc.seconds !== undefined && (typeof dc.seconds !== 'number' || dc.seconds < 0.5 || dc.seconds > 30)) err('"doubleClick.seconds" must be between 0.5 and 30');
      if (dc.say !== undefined && (typeof dc.say !== 'string' || dc.say.length > 60)) err('"doubleClick.say" must be a string of at most 60 characters');
      const fx = dc.effect;
      if (fx !== undefined) {
        if (!isObj(fx)) err('"doubleClick.effect" must be an object');
        else if (fx.type === 'arc-letters') {
          if (typeof fx.text !== 'string' || fx.text.length < 1 || fx.text.length > 12) err('arc-letters effect needs "text" of 1 to 12 characters');
        } else if (fx.type === 'bats') {
          if (fx.count !== undefined && (typeof fx.count !== 'number' || fx.count < 1 || fx.count > 12)) err('bats effect "count" must be 1 to 12');
        } else if (fx.type !== 'confetti') {
          err(`unknown effect type ${JSON.stringify(fx.type)}; use "arc-letters", "bats" or "confetti"`);
        }
      }
    }
  } else {
    r.info.push('no "doubleClick" trick defined (optional)');
  }

  r.info.push(`${Object.keys(anims).length} animations, ${totalFrames} frames, ${(totalBytes / 1024).toFixed(0)} KB`);
  return r;
}

/** Read the IHDR of a PNG: size and whether it can carry transparency. */
export function pngInfo(buf: Buffer): { width: number; height: number; alpha: boolean } | null {
  if (buf.length < 33 || buf.readUInt32BE(0) !== 0x89504e47 || buf.readUInt32BE(4) !== 0x0d0a1a0a || buf.toString('latin1', 12, 16) !== 'IHDR') return null;
  const colorType = buf[25];
  const hasTrns = buf.includes(Buffer.from('tRNS'));
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20), alpha: colorType === 4 || colorType === 6 || hasTrns };
}

function checkPng(file: string, buf: Buffer, fw: number, fh: number, r: Report, sizes: Map<string, string>): void {
  const info = pngInfo(buf);
  if (!info) {
    r.errors.push(`${file}: not a valid PNG file`);
    return;
  }
  sizes.set(file, `${info.width}x${info.height}`);
  if (!info.alpha) r.warnings.push(`${file}: has no transparency; the buddy will be drawn on a solid rectangle. Remove the background (see docs/PHOTO-BUDDY.md).`);
  if (Math.abs(info.width / info.height - fw / fh) > 0.02) r.warnings.push(`${file}: is ${info.width}x${info.height} but frameWidth x frameHeight is ${fw}x${fh}; the image will be stretched`);
}

function checkSvg(file: string, text: string, fw: number, fh: number, r: Report): void {
  const body = text.replace(/^﻿/, '').replace(/^\s*(<\?xml[\s\S]*?\?>|<!--[\s\S]*?-->|<!DOCTYPE[^>]*>|\s)*/i, '');
  if (!/^<svg[\s>]/i.test(body)) {
    r.errors.push(`${file}: must start with <svg ...> (no markdown fences, no explanation text)`);
    return;
  }
  if (!/<\/svg>\s*$/i.test(body)) r.errors.push(`${file}: does not end with </svg>; the drawing looks cut off`);
  if (!/xmlns\s*=\s*["']http:\/\/www\.w3\.org\/2000\/svg["']/.test(body)) r.errors.push(`${file}: the <svg> needs xmlns='http://www.w3.org/2000/svg' or it will not render`);
  if (/<script[\s>]/i.test(body)) r.errors.push(`${file}: <script> is not allowed`);
  if (/<foreignObject/i.test(body)) r.errors.push(`${file}: <foreignObject> is not allowed`);
  if (/\son[a-z]+\s*=/i.test(body)) r.errors.push(`${file}: event handler attributes (onclick, onload, ...) are not allowed`);
  if (/(?:xlink:)?href\s*=\s*["']\s*(?!#|data:)/i.test(body)) r.errors.push(`${file}: external references (href) are not allowed; use only #id or data: links`);
  if (/url\(\s*["']?\s*(?!#|data:)/i.test(body)) r.errors.push(`${file}: url(...) must point to an #id or data: URI, not an outside file`);
  if (/@import/i.test(body)) r.errors.push(`${file}: @import is not allowed`);
  const open = (body.match(/<(?!\/|\?|!)[a-zA-Z][^>]*[^/]>/g) ?? []).length;
  void open;
  const vb = /viewBox\s*=\s*["']\s*(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+)[\s,]+(-?[\d.]+)\s*["']/.exec(body);
  if (!vb) {
    if (!/\swidth\s*=/.test(body) || !/\sheight\s*=/.test(body)) r.warnings.push(`${file}: no viewBox; add viewBox='0 0 ${fw} ${fh}' so it scales correctly`);
  } else {
    const w = Number(vb[3]), h = Number(vb[4]);
    if (w > 0 && h > 0 && Math.abs(w / h - fw / fh) > 0.02) r.warnings.push(`${file}: viewBox ${w}x${h} does not match frameWidth x frameHeight ${fw}x${fh}; the drawing will be stretched`);
    if (Number(vb[1]) !== 0 || Number(vb[2]) !== 0) r.warnings.push(`${file}: viewBox should start at 0 0`);
  }
}

/** Validate an installed pack folder (buddy.json plus frames). */
export function validateFolder(dir: string): Report {
  const file = join(dir, 'buddy.json');
  if (!existsSync(file)) {
    const r = newReport();
    r.errors.push(`no buddy.json in ${dir}`);
    return r;
  }
  let manifest: unknown;
  try {
    manifest = JSON.parse(readFileSync(file, 'utf8'));
  } catch (err) {
    const r = newReport();
    r.errors.push(`buddy.json is not valid JSON: ${(err as Error).message}`);
    return r;
  }
  return validatePack(manifest, (name) => {
    const p = join(dir, name);
    return existsSync(p) && statSync(p).isFile() ? readFileSync(p) : undefined;
  });
}

/** Parse pasted text into a bundle. Tolerates markdown code fences and text around the JSON. */
export function parseBundleText(text: string): { bundle?: Bundle; error?: string } {
  let t = text.replace(/^﻿/, '').trim();
  const fence = /^```[a-zA-Z]*[ \t]*\r?\n([\s\S]*?)\r?\n```\s*$/.exec(t);
  if (fence) t = fence[1].trim();
  if (!t.startsWith('{')) {
    const fenced = /```(?:json)?[ \t]*\r?\n(\{[\s\S]*?\})\r?\n```/.exec(t);
    if (fenced) t = fenced[1];
    else {
      const a = t.indexOf('{'), b = t.lastIndexOf('}');
      if (a >= 0 && b > a) t = t.slice(a, b + 1);
    }
  }
  let raw: unknown;
  try {
    raw = JSON.parse(t);
  } catch (err) {
    const msg = (err as Error).message;
    const pos = /position (\d+)/.exec(msg);
    let where = '';
    if (pos) {
      const upTo = t.slice(0, Number(pos[1]));
      const line = upTo.split('\n').length;
      const col = upTo.length - upTo.lastIndexOf('\n');
      const near = t.slice(Math.max(0, Number(pos[1]) - 30), Number(pos[1]) + 30).replace(/\s+/g, ' ');
      where = ` (line ${line}, column ${col}, near "${near}")`;
    }
    return { error: `not valid JSON: ${msg}${where}. Common causes: a double quote inside an SVG string (use single quotes in SVG), a trailing comma, or a cut-off answer.` };
  }
  if (!isObj(raw)) return { error: 'the JSON must be an object' };
  let manifest: unknown = raw.manifest;
  const files = raw.files;
  if (manifest === undefined && raw.animations !== undefined) {
    // Flat layout: manifest fields at the top level next to "files" and "id".
    const { id: _id, files: _files, ...rest } = raw;
    manifest = rest;
  }
  if (!isObj(manifest)) return { error: 'the JSON needs a "manifest" object (name, frameWidth, frameHeight, animations, ...)' };
  if (!isObj(files) || Object.values(files).some((v) => typeof v !== 'string')) return { error: 'the JSON needs a "files" object mapping each frame file name to its SVG text' };
  return { bundle: { id: typeof raw.id === 'string' ? raw.id : undefined, manifest, files: files as Record<string, string> } };
}

export function validateBundle(b: Bundle): Report {
  const r = validatePack(b.manifest, (name) => (Object.prototype.hasOwnProperty.call(b.files, name) ? b.files[name] : undefined));
  const used = new Set<string>();
  const anims = b.manifest.animations;
  if (isObj(anims)) for (const def of Object.values(anims)) if (isObj(def) && Array.isArray(def.frames)) for (const f of def.frames) used.add(String(f));
  for (const f of Object.keys(b.files)) if (!used.has(f)) r.warnings.push(`file "${f}" is in "files" but no animation uses it; it will be ignored`);
  return r;
}

export function sanitizeId(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
}

function chooseId(wanted: string, opts: ImportOptions, r: Report): string | null {
  let id = sanitizeId(wanted);
  if (!ID_PATTERN.test(id)) {
    r.errors.push(`cannot make a folder name from ${JSON.stringify(wanted)}; pass an id of 2 to 41 characters: lowercase letters, digits and dashes`);
    return null;
  }
  const taken = (i: string) => existsSync(join(opts.destRoot, i)) || (!!opts.bundledDir && existsSync(join(opts.bundledDir, i)));
  if (taken(id) && !opts.force) {
    if (opts.autoSuffix) {
      let n = 2;
      while (taken(`${id}-${n}`)) n++;
      r.info.push(`id "${id}" is already used; installed as "${id}-${n}"`);
      id = `${id}-${n}`;
    } else {
      const bundled = !!opts.bundledDir && existsSync(join(opts.bundledDir, id));
      r.errors.push(`a buddy called "${id}" already exists${bundled ? ' (bundled)' : ''}; choose another id or use --force to replace it`);
      return null;
    }
  }
  return id;
}

export function importBundleText(text: string, opts: ImportOptions): ImportResult {
  const parsed = parseBundleText(text);
  if (!parsed.bundle) {
    const r = newReport();
    r.errors.push(parsed.error ?? 'could not read the bundle');
    return { ok: false, id: null, dir: null, report: r };
  }
  const b = parsed.bundle;
  const report = validateBundle(b);
  if (report.errors.length) return { ok: false, id: null, dir: null, report };
  const wanted = opts.id ?? b.id ?? String(b.manifest.name);
  const id = chooseId(wanted, opts, report);
  if (!id) return { ok: false, id: null, dir: null, report };
  const dir = join(opts.destRoot, id);
  mkdirSync(dir, { recursive: true });
  const anims = b.manifest.animations as Record<string, { frames: string[] }>;
  const used = new Set<string>();
  for (const def of Object.values(anims)) for (const f of def.frames) used.add(f);
  for (const f of used) writeFileSync(join(dir, f), b.files[f]);
  writeFileSync(join(dir, 'buddy.json'), JSON.stringify(b.manifest, null, 2) + '\n');
  return { ok: true, id, dir, report };
}

export function importFolder(src: string, opts: ImportOptions): ImportResult {
  const report = validateFolder(src);
  if (report.errors.length) return { ok: false, id: null, dir: null, report };
  const manifest = JSON.parse(readFileSync(join(src, 'buddy.json'), 'utf8')) as { name: string; animations: Record<string, { frames: string[] }> };
  const base = src.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? manifest.name;
  const id = chooseId(opts.id ?? base, opts, report);
  if (!id) return { ok: false, id: null, dir: null, report };
  const dir = join(opts.destRoot, id);
  mkdirSync(dir, { recursive: true });
  const used = new Set<string>();
  for (const def of Object.values(manifest.animations)) for (const f of def.frames) used.add(f);
  for (const f of used) copyFileSync(join(src, f), join(dir, f));
  copyFileSync(join(src, 'buddy.json'), join(dir, 'buddy.json'));
  return { ok: true, id, dir, report };
}

/** Plain-text rendering of a report for terminals and dialogs. */
export function formatReport(r: Report): string {
  const lines: string[] = [];
  for (const e of r.errors) lines.push(`✘ ${e}`);
  for (const w of r.warnings) lines.push(`! ${w}`);
  for (const i of r.info) lines.push(`  ${i}`);
  return lines.join('\n');
}
