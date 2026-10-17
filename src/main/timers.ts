import type { TimerInfo } from '../shared/types';

export interface TimerOptions {
  name?: string;
  buddy?: string;
}

/**
 * Countdown timers. When one finishes, `onDone` fires so a buddy can cheer.
 * Timers live in memory for the app's lifetime.
 */
export class TimerManager {
  private timers = new Map<string, TimerInfo & { handle: NodeJS.Timeout }>();
  private seq = 0;

  constructor(
    private readonly onDone: (t: TimerInfo) => void,
    private readonly now: () => number = Date.now,
    private readonly schedule: (fn: () => void, ms: number) => NodeJS.Timeout = setTimeout,
    private readonly cancelHandle: (h: NodeJS.Timeout) => void = clearTimeout,
  ) {}

  start(durationMs: number, opts: TimerOptions = {}): TimerInfo {
    if (!Number.isFinite(durationMs) || durationMs <= 0) throw new Error('timer duration must be positive');
    const id = `t${++this.seq}`;
    const info: TimerInfo = {
      id,
      name: opts.name?.trim() || `Timer ${this.seq}`,
      endsAt: this.now() + durationMs,
      durationMs,
      buddy: opts.buddy,
    };
    const handle = this.schedule(() => {
      this.timers.delete(id);
      this.onDone(info);
    }, Math.min(durationMs, 2_147_000_000));
    this.timers.set(id, { ...info, handle });
    return info;
  }

  cancel(id: string): boolean {
    const t = this.timers.get(id);
    if (!t) return false;
    this.cancelHandle(t.handle);
    this.timers.delete(id);
    return true;
  }

  cancelAll(): void {
    for (const id of [...this.timers.keys()]) this.cancel(id);
  }

  list(): TimerInfo[] {
    return [...this.timers.values()]
      .map(({ handle: _h, ...info }) => info)
      .sort((a, b) => a.endsAt - b.endsAt);
  }

  /** "12:34" style remaining time for menus. */
  remainingLabel(t: TimerInfo): string {
    const ms = Math.max(0, t.endsAt - this.now());
    const total = Math.round(ms / 1000);
    const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
    const mm = String(m).padStart(2, '0'), ss = String(s).padStart(2, '0');
    return h ? `${h}:${mm}:${ss}` : `${m}:${ss}`;
  }
}

/** Message the buddy shouts when a timer completes. */
export function timerDoneMessage(t: TimerInfo): string {
  const mins = Math.round(t.durationMs / 60000);
  const span = mins >= 1 ? `${mins} min` : `${Math.round(t.durationMs / 1000)} s`;
  return `⏰ ${t.name} is done! (${span})`;
}
