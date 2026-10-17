import { execFile } from 'node:child_process';
import type { ActiveWindowInfo } from '../shared/types';

/**
 * Polls the frontmost window. On macOS this uses System Events via osascript,
 * which needs the Accessibility (and Automation) permission the first time.
 * Other platforms return null; add a provider here to support them.
 */
export class ActiveWindowTracker {
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private failures = 0;
  current: ActiveWindowInfo | null = null;
  onChange: ((info: ActiveWindowInfo | null) => void) | null = null;

  constructor(private ignoreApps: string[] = []) {}

  start(intervalSeconds: number): void {
    this.stop();
    const ms = Math.max(250, intervalSeconds * 1000);
    this.timer = setInterval(() => void this.poll(), ms);
    void this.poll();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async poll(): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    try {
      const info = await this.query();
      if (info && this.ignoreApps.some((a) => a.toLowerCase() === info.app.toLowerCase())) return;
      const changed =
        !!info !== !!this.current ||
        (info && this.current && (info.app !== this.current.app || info.title !== this.current.title || !sameRect(info.bounds, this.current.bounds)));
      this.current = info;
      if (changed) this.onChange?.(info);
      this.failures = 0;
    } catch (err) {
      if (this.failures++ === 0) console.warn('active window query failed:', (err as Error).message);
    } finally {
      this.busy = false;
    }
  }

  private query(): Promise<ActiveWindowInfo | null> {
    if (process.platform === 'darwin') return queryMac();
    return Promise.resolve(null);
  }
}

function sameRect(a: ActiveWindowInfo['bounds'], b: ActiveWindowInfo['bounds']): boolean {
  if (!a || !b) return a === b;
  return Math.abs(a.x - b.x) < 2 && Math.abs(a.y - b.y) < 2 && Math.abs(a.width - b.width) < 2 && Math.abs(a.height - b.height) < 2;
}

const MAC_SCRIPT = `
tell application "System Events"
  set frontApp to first application process whose frontmost is true
  set appName to name of frontApp
  try
    set w to front window of frontApp
    set {px, py} to position of w
    set {sw, sh} to size of w
    set t to ""
    try
      set t to name of w
    end try
    return appName & tab & t & tab & px & tab & py & tab & sw & tab & sh
  on error
    return appName & tab & "" & tab & "" & tab & "" & tab & "" & tab & ""
  end try
end tell`;

function queryMac(): Promise<ActiveWindowInfo | null> {
  return new Promise((resolve, reject) => {
    execFile('osascript', ['-e', MAC_SCRIPT], { timeout: 2000 }, (err, stdout) => {
      if (err) return reject(err);
      const [app, title, x, y, w, h] = stdout.trimEnd().split('\t');
      if (!app) return resolve(null);
      const nums = [x, y, w, h].map((v) => Number(v));
      const bounds = nums.every((n) => Number.isFinite(n)) && nums[2] > 0 ? { x: nums[0], y: nums[1], width: nums[2], height: nums[3] } : null;
      resolve({ app, title: title ?? '', bounds, observedAt: Date.now() });
    });
  });
}
