import { app, protocol, net } from 'electron';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, isAbsolute, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { BuddyManifest } from '../shared/types';
import { userBuddiesDir } from './config';

export const PACK_SCHEME = 'buddy';

export interface LoadedPack {
  /** Key used in sprite URLs: buddy://<key>/<file>. */
  key: string;
  dir: string;
  manifest: BuddyManifest;
}

const packs = new Map<string, LoadedPack>();

export function bundledBuddiesDir(): string {
  // When packaged, extra files live next to the asar; in dev they are in the repo.
  const candidates = [join(app.getAppPath(), 'buddies'), join(process.resourcesPath ?? '', 'buddies')];
  return candidates.find((c) => existsSync(c)) ?? candidates[0];
}

export function registerPackScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: PACK_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, bypassCSP: true } },
  ]);
}

/** Must be called after app.whenReady(). */
export function installPackProtocol(): void {
  protocol.handle(PACK_SCHEME, (request) => {
    const url = new URL(request.url);
    const pack = packs.get(url.hostname);
    if (!pack) return new Response('unknown buddy pack', { status: 404 });
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const file = resolve(pack.dir, rel);
    if (!file.startsWith(pack.dir + sep) && file !== pack.dir) return new Response('forbidden', { status: 403 });
    if (!existsSync(file)) return new Response('not found', { status: 404 });
    return net.fetch(pathToFileURL(file).toString());
  });
}

function validateManifest(m: unknown, dir: string): BuddyManifest {
  if (!m || typeof m !== 'object') throw new Error(`buddy.json in ${dir} is not an object`);
  const man = m as BuddyManifest;
  if (typeof man.name !== 'string') throw new Error(`buddy.json in ${dir}: "name" is required`);
  if (!man.animations?.idle?.frames?.length || !man.animations?.walk?.frames?.length) {
    throw new Error(`buddy.json in ${dir}: animations.idle and animations.walk are required`);
  }
  man.frameWidth ??= 128;
  man.frameHeight ??= 128;
  for (const def of Object.values(man.animations)) {
    if (!def) continue;
    def.fps ??= 4;
    for (const f of def.frames) {
      if (!existsSync(join(dir, f))) throw new Error(`buddy.json in ${dir}: missing frame ${f}`);
    }
  }
  return man;
}

/** Resolve a pack reference (folder name or absolute path) to a directory. */
export function resolvePackDir(ref: string): string | null {
  if (isAbsolute(ref)) return existsSync(join(ref, 'buddy.json')) ? ref : null;
  for (const base of [userBuddiesDir(), bundledBuddiesDir()]) {
    const dir = join(base, ref);
    if (existsSync(join(dir, 'buddy.json'))) return dir;
  }
  return null;
}

export function loadPack(ref: string): LoadedPack {
  const dir = resolvePackDir(ref);
  if (!dir) throw new Error(`Buddy pack "${ref}" not found (looked in ${userBuddiesDir()} and ${bundledBuddiesDir()})`);
  const key = isAbsolute(ref) ? `path-${hash(dir)}` : ref;
  const existing = packs.get(key);
  if (existing) return existing;
  const manifest = validateManifest(JSON.parse(readFileSync(join(dir, 'buddy.json'), 'utf8')), dir);
  const pack: LoadedPack = { key, dir, manifest };
  packs.set(key, pack);
  return pack;
}

/** Every pack directory we know about, bundled and user-installed. */
export function listAvailablePacks(): Array<{ ref: string; name: string; dir: string; source: 'bundled' | 'user' }> {
  const out: Array<{ ref: string; name: string; dir: string; source: 'bundled' | 'user' }> = [];
  const seen = new Set<string>();
  const scan = (base: string, source: 'bundled' | 'user') => {
    if (!existsSync(base)) return;
    for (const entry of readdirSync(base)) {
      const dir = join(base, entry);
      if (!statSync(dir).isDirectory() || !existsSync(join(dir, 'buddy.json'))) continue;
      if (seen.has(entry)) continue;
      seen.add(entry);
      let name = entry;
      try {
        name = (JSON.parse(readFileSync(join(dir, 'buddy.json'), 'utf8')) as BuddyManifest).name ?? entry;
      } catch {
        /* ignore */
      }
      out.push({ ref: entry, name, dir, source });
    }
  };
  scan(userBuddiesDir(), 'user');
  scan(bundledBuddiesDir(), 'bundled');
  return out;
}

/** Manifests of every pack loaded so far, keyed by pack key (for the renderer). */
export function loadedPackManifests(): Record<string, BuddyManifest> {
  const out: Record<string, BuddyManifest> = {};
  for (const [key, pack] of packs) out[key] = pack.manifest;
  return out;
}

export function packDisplayName(ref: string): string {
  return basename(ref);
}

function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
