import { execFile } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
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
        const out = await run('sqlite3', ['-readonly', NC_DB_PATH, 'SELECT IFNULL(MAX(rec_id), 0) FROM record;']);
        this.lastId = Number(out.trim()) || 0;
        if (this.warned) console.log('Notification Center watcher is reading notifications now.');
        return [];
      }
      const ids = this.apps.map((a) => `'${a.bundleId.replace(/'/g, "''")}'`).join(',');
      const sql = `SELECT r.rec_id AS rec_id, a.identifier AS identifier, hex(r.data) AS data_hex FROM record r JOIN app a ON a.app_id = r.app_id WHERE r.rec_id > ${this.lastId} AND a.identifier IN (${ids}) ORDER BY r.rec_id;`;
      const out = await run('sqlite3', ['-readonly', '-json', NC_DB_PATH, sql]);
      // Advance even when nothing matched, so we never re-scan old rows.
      const maxOut = await run('sqlite3', ['-readonly', NC_DB_PATH, 'SELECT IFNULL(MAX(rec_id), 0) FROM record;']);
      this.lastId = Math.max(this.lastId, Number(maxOut.trim()) || 0);
      if (!out.trim()) return [];
      const rows = JSON.parse(out) as NcRow[];
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
        console.warn(
          `Notification Center watcher paused: ${(err as Error).message.split('\n')[0]}. ` +
            `Grant Full Disk Access to ${process.execPath} (or Terminal when using npm start) to read ${NC_DB_PATH}. Retrying every minute.`,
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

  async poll(): Promise<IncomingNotification[]> {
    if (!this.available) return [];
    const results: IncomingNotification[] = [];
    for (const name of this.appNames) {
      try {
        const label = await readDockBadge(name);
        const next = parseBadge(label);
        const prev = this.counts.get(name) ?? null;
        const delta = badgeDelta(prev, next);
        this.counts.set(name, next);
        if (delta !== null) results.push({ label: name, title: null, body: null, unread: delta, source: 'dock-badge' });
      } catch (err) {
        if (!this.failed) console.warn(`Dock badge watcher disabled: ${(err as Error).message}`);
        this.failed = true;
      }
    }
    return results;
  }
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

/**
 * Step-by-step check of every link in the notification chain, for the CLI
 * (`buddy diagnose`). Returns human-readable lines.
 */
export async function diagnose(cfg: NotificationsConfig): Promise<string[]> {
  const out: string[] = [];
  const ok = (m: string) => out.push(`✔ ${m}`);
  const bad = (m: string) => out.push(`✘ ${m}`);
  const info = (m: string) => out.push(`  ${m}`);
  if (process.platform !== 'darwin') {
    bad(`platform is ${process.platform}; notification watching only works on macOS`);
    return out;
  }
  info(`watched apps: ${cfg.apps.map((a) => `${a.label} (${a.bundleId})`).join(', ') || '(none)'}`);
  info(`badge apps: ${cfg.badgeApps.join(', ') || '(none)'}; enabled=${cfg.enabled}; showBody=${cfg.showBody}`);

  // 1. Notification Center database
  out.push('', 'Notification Center database');
  info(NC_DB_PATH);
  try {
    const count = (await run('sqlite3', ['-readonly', NC_DB_PATH, 'SELECT COUNT(*) FROM record;'])).trim();
    ok(`readable; ${count} records`);
    const apps = await run('sqlite3', ['-readonly', '-json', NC_DB_PATH,
      'SELECT a.identifier AS id, COUNT(*) AS n, MAX(r.rec_id) AS last FROM record r JOIN app a ON a.app_id = r.app_id GROUP BY a.identifier ORDER BY last DESC LIMIT 20;']);
    const rows = apps.trim() ? (JSON.parse(apps) as Array<{ id: string; n: number; last: number }>) : [];
    info('apps with recent notifications (most recent first):');
    for (const r of rows) info(`   ${r.id}  (${r.n} records)`);
    if (!rows.length) bad('no records at all: macOS has not stored any notifications, or the table is empty');
    const watchedIds = new Set(cfg.apps.map((a) => a.bundleId));
    const matching = rows.filter((r) => watchedIds.has(r.id));
    if (matching.length) {
      ok(`watched app(s) present: ${matching.map((m) => m.id).join(', ')}`);
      const latest = await run('sqlite3', ['-readonly', '-json', NC_DB_PATH,
        `SELECT r.rec_id AS rec_id, a.identifier AS identifier, hex(r.data) AS data_hex FROM record r JOIN app a ON a.app_id = r.app_id WHERE a.identifier IN (${[...watchedIds].map((i) => `'${i.replace(/'/g, "''")}'`).join(',')}) ORDER BY r.rec_id DESC LIMIT 1;`]);
      const row = (JSON.parse(latest) as NcRow[])[0];
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
    info('   Grant Full Disk Access (System Settings → Privacy & Security → Full Disk Access) to the app running the buddy:');
    info('   Terminal/iTerm for `npm start`, or the Electron binary for the background service. Then restart it.');
  }

  // 2. Dock badge
  out.push('', 'Dock badge');
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
  private nc: NotificationCenterWatcher;
  private dock: DockBadgeWatcher;
  private busy = false;

  constructor(private cfg: NotificationsConfig, private readonly onNotification: (n: IncomingNotification) => void) {
    this.nc = new NotificationCenterWatcher(cfg.apps);
    this.dock = new DockBadgeWatcher(cfg.badgeApps);
  }

  start(): void {
    this.stop();
    if (!this.cfg.enabled || process.platform !== 'darwin') return;
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
