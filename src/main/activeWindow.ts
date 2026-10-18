import { execFile, spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ActiveWindowInfo, Rect } from '../shared/types';

/**
 * PowerShell probe for Windows. It prints one line per interval:
 *   app<TAB>title<TAB>x<TAB>y<TAB>width<TAB>height     (physical pixels), or an empty line
 * when nothing suitable is in front (desktop, taskbar, minimised). The script must stay
 * ASCII-only because Windows PowerShell 5.1 reads files without a BOM as ANSI.
 */
export const WINDOWS_PS_SCRIPT = `param([int]$IntervalMs = 1500, [switch]$Once)
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Diagnostics;
public static class Fg {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int Left, Top, Right, Bottom; }
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] static extern bool SetProcessDpiAwarenessContext(IntPtr ctx);
  [DllImport("dwmapi.dll")] static extern int DwmGetWindowAttribute(IntPtr h, int attr, out RECT r, int size);
  public static void Init() {
    try { if (!SetProcessDpiAwarenessContext(new IntPtr(-4))) SetProcessDPIAware(); } catch { try { SetProcessDPIAware(); } catch {} }
  }
  public static string Query() {
    IntPtr h = GetForegroundWindow();
    if (h == IntPtr.Zero || !IsWindowVisible(h) || IsIconic(h)) return "";
    StringBuilder cls = new StringBuilder(256);
    GetClassName(h, cls, 256);
    string c = cls.ToString();
    if (c == "Shell_TrayWnd" || c == "Shell_SecondaryTrayWnd" || c == "Progman" || c == "WorkerW") return "";
    uint pid;
    GetWindowThreadProcessId(h, out pid);
    string app = "";
    try { app = Process.GetProcessById((int)pid).ProcessName; } catch {}
    StringBuilder t = new StringBuilder(512);
    GetWindowText(h, t, 512);
    RECT r;
    if (DwmGetWindowAttribute(h, 9, out r, Marshal.SizeOf(typeof(RECT))) != 0) { if (!GetWindowRect(h, out r)) return ""; }
    string title = t.ToString().Replace("\\t", " ").Replace("\\r", " ").Replace("\\n", " ");
    return app + "\\t" + title + "\\t" + r.Left + "\\t" + r.Top + "\\t" + (r.Right - r.Left) + "\\t" + (r.Bottom - r.Top);
  }
}
'@
[Fg]::Init()
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
do {
  try { [Console]::Out.WriteLine([Fg]::Query()) } catch { [Console]::Out.WriteLine('') }
  [Console]::Out.Flush()
  if ($Once) { break }
  Start-Sleep -Milliseconds $IntervalMs
} while ($true)
`;

/** Parse one probe line. Returns null for empty or malformed lines. Bounds are physical pixels. */
export function parseWindowsLine(line: string, now = Date.now()): ActiveWindowInfo | null {
  const parts = line.replace(/\r?\n$/, '').split('\t');
  if (parts.length < 6) return null;
  const [app, title, x, y, w, h] = parts;
  const nums = [x, y, w, h].map((v) => Number(v));
  if (!app || nums.some((n) => !Number.isFinite(n)) || nums[2] <= 0 || nums[3] <= 0) return null;
  return { app, title, bounds: { x: nums[0], y: nums[1], width: nums[2], height: nums[3] }, observedAt: now };
}

export interface TrackerOptions {
  /** Folder where the Windows probe script is written (it cannot be run from inside app.asar). */
  scriptDir?: string;
  /** Converts a physical-pixel rect to Electron DIPs (screen.screenToDipRect on Windows). */
  toDipRect?: (r: Rect) => Rect;
}

/** Keeps one long-lived PowerShell running and remembers its latest line. */
export class WindowsProbe {
  private child: ChildProcess | null = null;
  private buf = '';
  private restarts = 0;
  private stopped = false;
  private restartTimer: NodeJS.Timeout | null = null;
  latest = '';
  latestAt = 0;

  constructor(private readonly scriptPath: string, private intervalMs: number) {}

  start(): void {
    this.stopped = false;
    this.spawn();
  }

  private spawn(): void {
    try {
      const child = spawn(
        'powershell.exe',
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', this.scriptPath, '-IntervalMs', String(this.intervalMs)],
        { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
      );
      this.child = child;
      child.stdout?.setEncoding('utf8');
      child.stdout?.on('data', (chunk: string) => {
        this.buf += chunk;
        let i: number;
        while ((i = this.buf.indexOf('\n')) >= 0) {
          this.latest = this.buf.slice(0, i).replace(/\r$/, '');
          this.latestAt = Date.now();
          this.buf = this.buf.slice(i + 1);
          this.restarts = 0;
        }
      });
      child.stderr?.setEncoding('utf8');
      child.stderr?.on('data', (chunk: string) => console.warn(`active-window probe: ${chunk.trim().split('\n')[0]}`));
      child.on('error', (err) => console.warn(`active-window probe could not start: ${err.message}`));
      child.on('exit', (code) => {
        this.child = null;
        if (this.stopped) return;
        if (++this.restarts > 5) {
          console.warn(`active-window probe stopped for good after repeated failures (exit ${code}); the buddy will not follow your windows`);
          return;
        }
        this.restartTimer = setTimeout(() => this.spawn(), 1000 * this.restarts);
      });
    } catch (err) {
      console.warn(`active-window probe failed: ${(err as Error).message}`);
    }
  }

  stop(): void {
    this.stopped = true;
    if (this.restartTimer) clearTimeout(this.restartTimer);
    this.child?.kill();
    this.child = null;
  }
}

/**
 * Polls the frontmost window. macOS uses System Events via osascript (needs the
 * Accessibility permission); Windows uses a persistent PowerShell probe. Other
 * platforms return null, so the buddy just wanders.
 */
export class ActiveWindowTracker {
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private failures = 0;
  private probe: WindowsProbe | null = null;
  current: ActiveWindowInfo | null = null;
  onChange: ((info: ActiveWindowInfo | null) => void) | null = null;

  constructor(private ignoreApps: string[] = [], private readonly opts: TrackerOptions = {}) {}

  start(intervalSeconds: number): void {
    this.stop();
    const ms = Math.max(250, intervalSeconds * 1000);
    if (process.platform === 'win32' && this.opts.scriptDir) {
      try {
        mkdirSync(this.opts.scriptDir, { recursive: true });
        const scriptPath = join(this.opts.scriptDir, 'active-window.ps1');
        writeFileSync(scriptPath, WINDOWS_PS_SCRIPT, 'utf8');
        this.probe = new WindowsProbe(scriptPath, Math.min(ms, 1000));
        this.probe.start();
      } catch (err) {
        console.warn(`could not start the Windows window probe: ${(err as Error).message}`);
      }
    }
    this.timer = setInterval(() => void this.poll(), ms);
    void this.poll();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.probe?.stop();
    this.probe = null;
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
    if (process.platform === 'win32') return Promise.resolve(this.queryWindows());
    return Promise.resolve(null);
  }

  private queryWindows(): ActiveWindowInfo | null {
    const p = this.probe;
    if (!p || !p.latest || Date.now() - p.latestAt > 6000) return null;
    const info = parseWindowsLine(p.latest, p.latestAt);
    if (info?.bounds && this.opts.toDipRect) info.bounds = this.opts.toDipRect(info.bounds);
    return info;
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

/** For `buddy diagnose`: run the Windows probe once and report what it sees. */
export async function diagnoseActiveWindow(): Promise<string[]> {
  if (process.platform !== 'win32') return [];
  const { mkdtempSync, rmSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const dir = mkdtempSync(join(tmpdir(), 'buddy-probe-'));
  const script = join(dir, 'active-window.ps1');
  const out: string[] = ['', 'Active window (PowerShell probe)'];
  try {
    writeFileSync(script, WINDOWS_PS_SCRIPT, 'utf8');
    const stdout = await new Promise<string>((resolve, reject) => {
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-Once'], { timeout: 20000, windowsHide: true }, (err, so, se) => {
        if (err) reject(new Error((se || err.message).toString().trim().split('\n')[0]));
        else resolve(so);
      });
    });
    const info = parseWindowsLine(stdout.trim().split('\n')[0] ?? '');
    if (info?.bounds) {
      out.push(`✔ probe works; foreground window right now: ${info.app} "${info.title}" at ${info.bounds.x},${info.bounds.y} ${info.bounds.width}x${info.bounds.height} (physical pixels)`);
    } else {
      out.push('✘ probe ran but returned no window (that happens on the desktop or the taskbar; click a normal window and retry)');
    }
  } catch (err) {
    out.push(`✘ the PowerShell probe failed: ${(err as Error).message}`);
    out.push('  Check that powershell.exe runs scripts for your user (Get-ExecutionPolicy -List) and that antivirus is not blocking it.');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  return out;
}
