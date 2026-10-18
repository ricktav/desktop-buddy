import { execFile } from 'node:child_process';
import { copyFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { join } from 'node:path';
import type { NotificationsConfig, WatchedApp } from '../shared/types';

/** One announced event. */
export interface IncomingNotification {
  /** Friendly app name, e.g. WhatsApp. */
  label: string;
  /** Sender / title, when known. */
  title: string | null;
  /** Message preview, when known. */
  body: string | null;
  /** Unread count from a Dock badge, when that is the source. */
  unread: number | null;
  source: 'notification-center' | 'dock-badge';
}

// ---- pure helpers (unit-tested) -------------------------------------------

/** Extract title / subtitle / body from a Notification Center record converted to XML plist. */
export function parseNotificationPlist(xml: string): { title: string | null; subtitle: string | null; body: string | null } {
  const get = (key: string): string | null => {
    const m = new RegExp(`<key>${key}</key>\\s*<string>([\\s\\S]*?)</string>`).exec(xml);
    return m ? decodeXml(m[1]).trim() || null : null;
  };
  return { title: get('titl'), subtitle: get('subt'), body: get('body') };
}

function decodeXml(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_m, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&');
}

/** Text the buddy says for a notification. */
export function announcement(n: IncomingNotification, showBody: boolean): string {
  if (n.source === 'dock-badge') {
    return n.unread && n.unread > 1 ? `📨 ${n.label}: ${n.unread} unread messages` : `📨 New ${n.label} message`;
  }
  const who = n.title ? ` from ${n.title}` : '';
  const preview = showBody && n.body ? `: ${trimPreview(n.body)}` : '';
  return `📨 ${n.label} message${who}${preview}`;
}

function trimPreview(s: string, max = 80): string {
  const one = s.replace(/\s+/g, ' ').trim();
  return one.length > max ? one.slice(0, max - 1) + '…' : one;
}

/** Parse a Dock badge label ("3", "12", "", "•") into a number of unread items. */
export function parseBadge(label: string | null | undefined): number {
  if (!label) return 0;
  const m = /\d+/.exec(label);
  if (m) return Number(m[0]);
  return label.trim() ? 1 : 0;
}

/** Decide which badge changes are worth announcing: only increases. */
export function badgeDelta(prev: number | null, next: number): number | null {
  if (prev === null) return null; // first reading sets the baseline silently
  return next > prev ? next : null;
}

// ---- macOS providers -------------------------------------------------------

export const NC_DB_PATH = join(homedir(), 'Library', 'Group Containers', 'group.com.apple.usernoted', 'db2', 'db');

export interface LaunchContext {
  /** True when launchd started us directly (the background service). */
  viaLaunchd: boolean;
  /** The .app that macOS holds responsible for our file access (a terminal app when started from a shell). */
  responsibleApp: string | null;
  /** The app bundle path that must be granted Full Disk Access. */
  grantTo: string;
}

/** Work out which app macOS will check for permissions by walking up the process tree. */
export async function launchContext(): Promise<LaunchContext> {
  const self = appBundleOf(process.execPath) ?? process.execPath;
  if (process.platform !== 'darwin') return { viaLaunchd: false, responsibleApp: null, grantTo: self };
  let pid = process.ppid;
  let responsible: string | null = null;
  for (let hops = 0; hops < 12 && pid > 1; hops++) {
    let line: string;
    try {
      line = (await run('ps', ['-o', 'ppid=,comm=', '-p', String(pid)])).trim();
    } catch {
      break;
    }
    const m = /^(\d+)\s+(.*)$/.exec(line);
    if (!m) break;
    const comm = m[2];
    const bundle = appBundleOf(comm);
    if (bundle && !bundle.includes('/node_modules/electron/')) {
      responsible = bundle;
      break;
    }
    pid = Number(m[1]);
  }
  const viaLaunchd = process.ppid === 1 && responsible === null;
  return { viaLaunchd, responsibleApp: responsible, grantTo: responsible ?? self };
}

function appBundleOf(path: string): string | null {
  const i = path.indexOf('.app/');
  return i >= 0 ? path.slice(0, i + 4) : null;
}

export function appDisplayName(bundlePath: string): string {
  const base = bundlePath.split('/').pop() ?? bundlePath;
  return base.replace(/\.app$/, '');
}

function run(cmd: string, args: string[], timeout = 4000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, { timeout, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => (err ? reject(err) : resolve(stdout)));
  });
}

interface NcRow {
  rec_id: number;
  identifier: string;
  data_hex: string;
}

type SqliteModule = { DatabaseSync: new (path: string, opts?: { readOnly?: boolean }) => { prepare(sql: string): { all(...p: unknown[]): unknown[]; get(...p: unknown[]): unknown }; close(): void } };

function loadSqlite(): SqliteModule | null {
  try {
    // Electron 35+ (Node 22.13+) ships node:sqlite; reading in-process avoids a
    // helper command and keeps permission attribution with this app.
    return require('node:sqlite') as SqliteModule;
  } catch {
    return null;
  }
}

/** Run a read-only query against the Notification Center database. */
async function ncQuery<T>(sql: string): Promise<T[]> {
  const mod = loadSqlite();
  if (mod) {
    const db = new mod.DatabaseSync(NC_DB_PATH, { readOnly: true });
    try {
      return db.prepare(sql).all() as T[];
    } finally {
      db.close();
    }
  }
  const out = await run('sqlite3', ['-readonly', '-json', NC_DB_PATH, sql]);
  return out.trim() ? (JSON.parse(out) as T[]) : [];
}

async function ncMaxId(): Promise<number> {
  const rows = await ncQuery<{ m: number }>('SELECT IFNULL(MAX(rec_id), 0) AS m FROM record;');
  return Number(rows[0]?.m ?? 0) || 0;
}

/**
 * Reads new rows from the macOS Notification Center database for the watched
 * apps. Needs Full Disk Access for the process (Terminal when running from
 * `npm start`, the Electron binary when running as a service).
 */
export class NotificationCenterWatcher {
  private lastId: number | null = null;
  private failed = false;
  /** After a failure (usually missing Full Disk Access) retry at this time. */
  private retryAt = 0;
  private warned = false;

  constructor(private readonly apps: WatchedApp[]) {}

  get available(): boolean {
    return process.platform === 'darwin' && this.apps.length > 0 && !this.failed;
  }

  async poll(): Promise<IncomingNotification[]> {
    if (process.platform !== 'darwin' || this.apps.length === 0) return [];
    if (this.failed) {
      if (Date.now() < this.retryAt) return [];
      this.failed = false; // try again; permission may have been granted meanwhile
      this.lastId = null;
    }
    try {
      if (this.lastId === null) {
        this.lastId = await ncMaxId();
        if (this.warned) console.log('Notification Center watcher is reading notifications now.');
        return [];
      }
      const ids = this.apps.map((a) => `'${a.bundleId.replace(/'/g, "''")}'`).join(',');
      const sql = `SELECT r.rec_id AS rec_id, a.identifier AS identifier, hex(r.data) AS data_hex FROM record r JOIN app a ON a.app_id = r.app_id WHERE r.rec_id > ${this.lastId} AND a.identifier IN (${ids}) ORDER BY r.rec_id;`;
      const rows = await ncQuery<NcRow>(sql);
      // Advance even when nothing matched, so we never re-scan old rows.
      this.lastId = Math.max(this.lastId, await ncMaxId());
      if (!rows.length) return [];
      const results: IncomingNotification[] = [];
      for (const row of rows) {
        const app = this.apps.find((a) => a.bundleId === row.identifier);
        if (!app) continue;
        try {
          const xml = await plistToXml(Buffer.from(row.data_hex ?? '', 'hex'));
          const { title, subtitle, body } = parseNotificationPlist(xml);
          results.push({ label: app.label, title: title ?? subtitle, body, unread: null, source: 'notification-center' });
        } catch (err) {
          // One odd record must not disable the watcher.
          console.warn(`could not parse notification record ${row.rec_id}: ${(err as Error).message}`);
          results.push({ label: app.label, title: null, body: null, unread: null, source: 'notification-center' });
        }
      }
      return results;
    } catch (err) {
      if (!this.warned) {
        const ctx = await launchContext();
        const how = ctx.viaLaunchd
          ? 'running as the background service'
          : ctx.responsibleApp
            ? `started from ${appDisplayName(ctx.responsibleApp)}, which macOS holds responsible for file access`
            : 'started from a shell';
        console.warn(
          `Notification Center watcher paused: ${(err as Error).message.split('\n')[0]}. ` +
            `The buddy is ${how}. Grant Full Disk Access to: ${ctx.grantTo}` +
            (ctx.responsibleApp ? ` (or install the background service with "buddy service install" so the grant on Electron.app applies).` : '.') +
            ' Retrying every minute.',
        );
        this.warned = true;
      }
      this.failed = true;
      this.retryAt = Date.now() + 60_000;
      return [];
    }
  }
}

async function plistToXml(blob: Buffer): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), 'buddy-nc-'));
  const file = join(dir, 'n.plist');
  try {
    writeFileSync(file, blob);
    return await run('plutil', ['-convert', 'xml1', '-o', '-', file]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Watches the unread badge on Dock icons (e.g. "WhatsApp") and reports
 * increases. Needs Accessibility, which the app already asks for.
 */
export class DockBadgeWatcher {
  private counts = new Map<string, number | null>();
  private failed = false;

  constructor(private readonly appNames: string[]) {
    for (const n of appNames) this.counts.set(n, null);
  }

  get available(): boolean {
    return process.platform === 'darwin' && this.appNames.length > 0 && !this.failed;
  }

  private introduced = false;

  async poll(): Promise<IncomingNotification[]> {
    if (!this.available) return [];
    const results: IncomingNotification[] = [];
    if (!this.introduced) {
      this.introduced = true;
      try {
        const tiles = await listDockBadges();
        const names = tiles.map(([n, l]) => (l ? `${n}(${l})` : n));
        console.log(`Dock tiles: ${names.join(', ') || '(none readable)'}`);
        for (const name of this.appNames) {
          if (!tiles.some(([n]) => n.toLowerCase() === name.toLowerCase())) {
            console.warn(`Dock badge watcher: "${name}" is not in the Dock, so its badge cannot be watched. Keep the app in the Dock (or running).`);
          }
        }
      } catch (err) {
        console.warn(`Dock badge watcher: cannot list the Dock: ${(err as Error).message.split('\n')[0]}`);
      }
    }
    for (const name of this.appNames) {
      try {
        const label = await readDockBadge(name);
        const next = parseBadge(label);
        const prev = this.counts.get(name) ?? null;
        const delta = badgeDelta(prev, next);
        this.counts.set(name, next);
        if (prev !== null && prev !== next) console.log(`Dock badge ${name}: ${prev} → ${next}`);
        if (delta !== null) results.push({ label: name, title: null, body: null, unread: delta, source: 'dock-badge' });
      } catch (err) {
        if (!this.failed) console.warn(`Dock badge watcher disabled: ${(err as Error).message}`);
        this.failed = true;
      }
    }
    return results;
  }
}

/** Every app tile in the Dock with its badge label, e.g. [["WhatsApp", "3"], ["Mail", ""]]. */
export async function listDockBadges(): Promise<Array<[string, string]>> {
  const script = `
tell application "System Events"
  tell process "Dock"
    set out to ""
    repeat with el in UI elements of list 1
      set n to name of el
      set lbl to ""
      try
        set lbl to value of attribute "AXStatusLabel" of el
      end try
      if lbl is missing value then set lbl to ""
      set out to out & n & tab & lbl & linefeed
    end repeat
    return out
  end tell
end tell`;
  const raw = await run('osascript', ['-e', script], 6000);
  return raw.split('\n').filter((l) => l.includes('\t')).map((l) => {
    const [n, lbl] = l.split('\t');
    return [n, lbl ?? ''];
  });
}

async function readDockBadge(appName: string): Promise<string> {
  const script = `
tell application "System Events"
  tell process "Dock"
    try
      return value of attribute "AXStatusLabel" of UI element "${appName.replace(/"/g, '\\"')}" of list 1
    on error
      return ""
    end try
  end tell
end tell`;
  return (await run('osascript', ['-e', script])).trim();
}

// ---- Windows: toast notifications are logged in wpndatabase.db -------------------

export const WPN_DB_PATH = join(process.env.LOCALAPPDATA ?? join(homedir(), 'AppData', 'Local'), 'Microsoft', 'Windows', 'Notifications', 'wpndatabase.db');

/** Title and body from a toast's XML payload: the first two <text> elements of the binding. */
export function parseToastXml(xml: string): { title: string | null; body: string | null } {
  const texts: string[] = [];
  for (const m of xml.matchAll(/<text(?![^>]*placement=["']attribution["'])[^>]*>([\s\S]*?)<\/text>/g)) {
    const t = decodeXml(m[1]).trim();
    if (t) texts.push(t);
  }
  return { title: texts[0] ?? null, body: texts.length > 1 ? texts.slice(1).join(' ') : null };
}

/** Does a notification's app id (e.g. "5319275A.WhatsAppDesktop_cv1g1gvanyjgm!App") match any watched fragment? */
export function toastAppMatches(primaryId: string | null | undefined, fragments: string[] | undefined): boolean {
  if (!primaryId || !fragments?.length) return false;
  const id = primaryId.toLowerCase();
  return fragments.some((f) => f && id.includes(f.toLowerCase()));
}

/** Payload columns come back as text or bytes, UTF-8 or UTF-16. */
export function decodePayload(v: unknown): string {
  if (typeof v === 'string') return v;
  if (v instanceof Uint8Array) {
    const buf = Buffer.from(v);
    if (buf.length > 1 && (buf[1] === 0 || (buf[0] === 0xff && buf[1] === 0xfe))) return buf.toString('utf16le').replace(/^﻿/, '');
    return buf.toString('utf8').replace(/^﻿/, '');
  }
  return '';
}

interface WpnRow { rid: number; app: string | null; payload: unknown }
interface SqliteDb { prepare(sql: string): { all(...p: unknown[]): unknown[]; get(...p: unknown[]): unknown }; close(): void }

/** Open the notification database directly, or a private copy of it when Windows holds it locked. */
function openWpn(): { db: SqliteDb; done: () => void } {
  const mod = loadSqlite();
  if (!mod) throw new Error('Electron has no built-in SQLite (node:sqlite) in this version');
  try {
    const db = new mod.DatabaseSync(WPN_DB_PATH, { readOnly: true });
    db.prepare('SELECT 1 FROM Notification LIMIT 1').get();
    return { db, done: () => db.close() };
  } catch {
    const dir = mkdtempSync(join(tmpdir(), 'buddy-wpn-'));
    for (const ext of ['', '-wal', '-shm']) {
      try { copyFileSync(WPN_DB_PATH + ext, join(dir, 'wpn.db' + ext)); } catch { /* the -wal/-shm may not exist */ }
    }
    const db = new mod.DatabaseSync(join(dir, 'wpn.db'));
    return { db, done: () => { db.close(); rmSync(dir, { recursive: true, force: true }); } };
  }
}

function wpnQuery<T>(sql: string, ...params: unknown[]): T[] {
  const { db, done } = openWpn();
  try {
    return db.prepare(sql).all(...params) as T[];
  } finally {
    done();
  }
}

const WPN_SELECT = 'SELECT n.rowid AS rid, h.PrimaryId AS app, n.Payload AS payload FROM Notification n LEFT JOIN NotificationHandler h ON h.RecordId = n.HandlerId';

export class WindowsNotificationWatcher {
  private lastId: number | null = null;
  private failed = false;
  private retryAt = 0;
  private warned = false;

  constructor(private readonly apps: WatchedApp[]) {}

  get available(): boolean {
    return process.platform === 'win32' && this.apps.some((a) => a.windowsIds?.length) && !this.failed;
  }

  async poll(): Promise<IncomingNotification[]> {
    if (process.platform !== 'win32' || !this.apps.some((a) => a.windowsIds?.length)) return [];
    if (this.failed) {
      if (Date.now() < this.retryAt) return [];
      this.failed = false;
      this.lastId = null;
    }
    try {
      if (this.lastId === null) {
        this.lastId = Number(wpnQuery<{ m: number }>('SELECT IFNULL(MAX(rowid), 0) AS m FROM Notification')[0]?.m ?? 0);
        if (this.warned) console.log('Windows notification watcher is reading notifications now.');
        return [];
      }
      const rows = wpnQuery<WpnRow>(`${WPN_SELECT} WHERE n.rowid > ? ORDER BY n.rowid`, this.lastId);
      if (!rows.length) return [];
      this.lastId = Math.max(this.lastId, ...rows.map((r) => Number(r.rid)));
      const out: IncomingNotification[] = [];
      for (const r of rows) {
        const app = this.apps.find((a) => toastAppMatches(r.app, a.windowsIds));
        if (!app) continue;
        const { title, body } = parseToastXml(decodePayload(r.payload));
        out.push({ label: app.label, title, body, unread: null, source: 'notification-center' });
      }
      return out;
    } catch (err) {
      if (!this.warned) {
        console.warn(`Windows notification watcher paused: ${(err as Error).message.split('\n')[0]} (database: ${WPN_DB_PATH}). Run "buddy diagnose" for details. Retrying every minute.`);
        this.warned = true;
      }
      this.failed = true;
      this.retryAt = Date.now() + 60_000;
      return [];
    }
  }
}

async function diagnoseWindows(cfg: NotificationsConfig): Promise<string[]> {
  const out: string[] = [];
  const ok = (m: string) => out.push(`✔ ${m}`);
  const bad = (m: string) => out.push(`✘ ${m}`);
  const info = (m: string) => out.push(`  ${m}`);
  info(`watched apps: ${cfg.apps.filter((a) => a.windowsIds?.length).map((a) => `${a.label} (ids containing: ${a.windowsIds!.join(', ')})`).join('; ') || '(none have windowsIds)'}`);
  out.push('', 'Windows notification database');
  info(WPN_DB_PATH);
  if (!loadSqlite()) {
    bad('this runtime has no built-in SQLite; run "buddy diagnose" with the app\'s Electron (node_modules\\electron) or Node 22.13+');
    return out;
  }
  try {
    const n = wpnQuery<{ c: number }>('SELECT COUNT(*) AS c FROM Notification')[0]?.c ?? 0;
    ok(`readable; ${n} notifications logged`);
    const apps = wpnQuery<{ app: string | null; n: number; last: number }>(
      'SELECT h.PrimaryId AS app, COUNT(*) AS n, MAX(n.rowid) AS last FROM Notification n LEFT JOIN NotificationHandler h ON h.RecordId = n.HandlerId GROUP BY h.PrimaryId ORDER BY last DESC LIMIT 20');
    info('apps with logged notifications (most recent first):');
    for (const a of apps) info(`   ${a.app ?? '(unknown)'}  (${a.n})`);
    const watched = apps.filter((a) => cfg.apps.some((w) => toastAppMatches(a.app, w.windowsIds)));
    if (watched.length) {
      ok(`watched app(s) found: ${watched.map((w) => w.app).join(', ')}`);
      const row = wpnQuery<WpnRow>(`${WPN_SELECT} WHERE h.PrimaryId = ? ORDER BY n.rowid DESC LIMIT 1`, watched[0].app)[0];
      const xml = decodePayload(row?.payload);
      const t = parseToastXml(xml);
      ok(`latest record parses: title=${JSON.stringify(t.title)} body=${JSON.stringify(t.body)}`);
      if (!t.title && !t.body) info('   payload starts with: ' + xml.slice(0, 160).replace(/\s+/g, ' '));
    } else {
      bad('none of the watched apps appear. If WhatsApp is listed above under another id, add a fragment of it to "windowsIds" in the config.');
      info('   If it is not listed at all, WhatsApp is not posting toasts: Settings > System > Notifications > WhatsApp must be On.');
    }
  } catch (err) {
    bad(`cannot read the database: ${(err as Error).message.split('\n')[0]}`);
    try {
      const cols = wpnQuery<{ name: string }>('SELECT name FROM sqlite_master WHERE type = \'table\'');
      info('   tables: ' + cols.map((c) => c.name).join(', '));
    } catch { /* ignore */ }
  }
  return out;
}

/**
 * Step-by-step check of every link in the notification chain, for the CLI
 * (`buddy diagnose`). Returns human-readable lines.
 */
export async function diagnose(cfg: NotificationsConfig): Promise<string[]> {
  const out: string[] = [];
  const ok = (m: string) => out.push(`✔ ${m}`);
  const bad = (m: string) => out.push(`✘ ${m}`);
  const info = (m: string) => out.push(`  ${m}`);
  if (process.platform === 'win32') return diagnoseWindows(cfg);
  if (process.platform !== 'darwin') {
    bad(`platform is ${process.platform}; notification watching only works on macOS and Windows`);
    return out;
  }
  const ctx = await launchContext();
  info(`this check runs from ${ctx.responsibleApp ? appDisplayName(ctx.responsibleApp) : 'a shell'}; the buddy's own permissions may differ (see its log)`);
  info(`watched apps: ${cfg.apps.map((a) => `${a.label} (${a.bundleId})`).join(', ') || '(none)'}`);
  info(`badge apps: ${cfg.badgeApps.join(', ') || '(none)'}; enabled=${cfg.enabled}; showBody=${cfg.showBody}`);

  // 1. Notification Center database
  out.push('', 'Notification Center database');
  info(NC_DB_PATH);
  try {
    const count = (await ncQuery<{ c: number }>('SELECT COUNT(*) AS c FROM record;'))[0]?.c ?? 0;
    ok(`readable; ${count} records (via ${loadSqlite() ? 'built-in sqlite' : 'sqlite3 command'})`);
    const rows = await ncQuery<{ id: string; n: number; last: number }>(
      'SELECT a.identifier AS id, COUNT(*) AS n, MAX(r.rec_id) AS last FROM record r JOIN app a ON a.app_id = r.app_id GROUP BY a.identifier ORDER BY last DESC LIMIT 20;');
    info('apps with recent notifications (most recent first):');
    for (const r of rows) info(`   ${r.id}  (${r.n} records)`);
    if (!rows.length) bad('no records at all: macOS has not stored any notifications, or the table is empty');
    const watchedIds = new Set(cfg.apps.map((a) => a.bundleId));
    const matching = rows.filter((r) => watchedIds.has(r.id));
    if (matching.length) {
      ok(`watched app(s) present: ${matching.map((m) => m.id).join(', ')}`);
      const row = (await ncQuery<NcRow>(
        `SELECT r.rec_id AS rec_id, a.identifier AS identifier, hex(r.data) AS data_hex FROM record r JOIN app a ON a.app_id = r.app_id WHERE a.identifier IN (${[...watchedIds].map((i) => `'${i.replace(/'/g, "''")}'`).join(',')}) ORDER BY r.rec_id DESC LIMIT 1;`))[0];
      try {
        const xml = await plistToXml(Buffer.from(row.data_hex ?? '', 'hex'));
        const parsed = parseNotificationPlist(xml);
        ok(`latest record ${row.rec_id} parses: title=${JSON.stringify(parsed.title)} subtitle=${JSON.stringify(parsed.subtitle)} body=${JSON.stringify(parsed.body)}`);
        if (!parsed.title && !parsed.body) {
          bad('record has no title/body: this is probably not a message notification, or the plist layout differs. Top-level keys found:');
          const keys = [...xml.matchAll(/<key>([^<]+)<\/key>/g)].map((m) => m[1]);
          info('   ' + [...new Set(keys)].slice(0, 40).join(', '));
        }
      } catch (err) {
        bad(`could not parse latest record: ${(err as Error).message}`);
      }
    } else {
      bad('none of the watched bundle ids have notifications in the database.');
      info('   If WhatsApp is listed above under another id, put that id in config.notifications.apps.');
      info('   If it is not listed at all, WhatsApp is not posting notifications: check WhatsApp settings and System Settings → Notifications → WhatsApp.');
    }
  } catch (err) {
    bad(`cannot read the database: ${(err as Error).message.split('\n')[0]}`);
    info(`   For THIS check, grant Full Disk Access to ${ctx.responsibleApp ? appDisplayName(ctx.responsibleApp) : 'your terminal app'}.`);
    info('   For the buddy itself, see its log line "Notification Center watcher paused": it names the app to grant.');
    info('   Simplest: run it as the background service (buddy service install) and grant Electron.app.');
  }

  // 2. Dock badge
  out.push('', 'Dock badge');
  try {
    const tiles = await listDockBadges();
    info('Dock tiles: ' + (tiles.map(([n, l]) => (l ? `${n}(${l})` : n)).join(', ') || '(none readable)'));
  } catch (err) {
    bad(`cannot list the Dock: ${(err as Error).message.split('\n')[0]} (Accessibility permission for Terminal?)`);
  }
  for (const name of cfg.badgeApps) {
    try {
      const label = await readDockBadge(name);
      ok(`${name}: badge label ${JSON.stringify(label)} → ${parseBadge(label)} unread`);
    } catch (err) {
      bad(`${name}: ${(err as Error).message.split('\n')[0]}`);
      info('   Needs Accessibility permission for Terminal / the Electron binary.');
    }
  }
  return out;
}

/** Runs both providers on a timer and hands results to `onNotification`. */
export class NotificationService {
  private timer: NodeJS.Timeout | null = null;
  private nc: NotificationCenterWatcher | WindowsNotificationWatcher;
  private dock: DockBadgeWatcher;
  private busy = false;

  constructor(private cfg: NotificationsConfig, private readonly onNotification: (n: IncomingNotification) => void) {
    this.nc = process.platform === 'win32' ? new WindowsNotificationWatcher(cfg.apps) : new NotificationCenterWatcher(cfg.apps);
    this.dock = new DockBadgeWatcher(cfg.badgeApps);
  }

  start(): void {
    this.stop();
    if (!this.cfg.enabled || (process.platform !== 'darwin' && process.platform !== 'win32')) return;
    this.timer = setInterval(() => void this.tick(), Math.max(1000, this.cfg.pollSeconds * 1000));
    void this.tick();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  status(): { enabled: boolean; notificationCenter: boolean; dockBadge: boolean } {
    return { enabled: this.cfg.enabled && this.timer !== null, notificationCenter: this.nc.available, dockBadge: this.dock.available };
  }

  private async tick(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const fromNc = await this.nc.poll();
      for (const n of fromNc) this.onNotification(n);
      // The badge is only a fallback: when Notification Center works for an
      // app, its badge increase would duplicate the announcement.
      const fromDock = await this.dock.poll();
      for (const n of fromDock) {
        const covered = this.nc.available && this.cfg.apps.some((a) => a.label.toLowerCase() === n.label.toLowerCase());
        if (!covered) this.onNotification(n);
      }
    } finally {
      this.busy = false;
    }
  }
}
