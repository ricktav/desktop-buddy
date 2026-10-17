import type { AlertRequest, ReminderConfig } from '../shared/types';

export function parseDuration(s: string): number | null {
  const m = /^\s*(\d+(?:\.\d+)?)\s*(ms|s|sec|m|min|h|hr|d)?\s*$/i.exec(s);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = (m[2] ?? 'm').toLowerCase();
  const mult: Record<string, number> = { ms: 1, s: 1000, sec: 1000, m: 60_000, min: 60_000, h: 3_600_000, hr: 3_600_000, d: 86_400_000 };
  return n * mult[unit];
}

/** Milliseconds until the next occurrence of HH:MM on an allowed weekday. */
export function msUntilNext(at: string, days: number[] | undefined, now = new Date()): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(at.trim());
  if (!m) return null;
  const hh = Number(m[1]), mm = Number(m[2]);
  if (hh > 23 || mm > 59) return null;
  const allowed = days && days.length ? new Set(days) : null;
  for (let offset = 0; offset < 8; offset++) {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    d.setHours(hh, mm, 0, 0);
    if (d.getTime() <= now.getTime()) continue;
    if (allowed && !allowed.has(d.getDay())) continue;
    return d.getTime() - now.getTime();
  }
  return null;
}

export class ReminderScheduler {
  private timers: NodeJS.Timeout[] = [];

  constructor(private fire: (req: AlertRequest) => void) {}

  load(reminders: ReminderConfig[]): void {
    this.clear();
    for (const r of reminders) {
      if (!r.message) continue;
      const req: AlertRequest = { message: r.message, level: r.level, target: r.target ?? 'here' };
      if (r.every) {
        const ms = parseDuration(r.every);
        if (!ms || ms < 1000) {
          console.warn(`reminder "${r.message}": bad "every" value ${r.every}`);
          continue;
        }
        this.timers.push(setInterval(() => this.fire(req), ms));
      } else if (r.at) {
        const schedule = () => {
          const wait = msUntilNext(r.at!, r.days);
          if (wait === null) {
            console.warn(`reminder "${r.message}": bad "at" value ${r.at}`);
            return;
          }
          const t = setTimeout(() => {
            this.fire(req);
            schedule();
          }, Math.min(wait, 2_147_000_000));
          this.timers.push(t);
        };
        schedule();
      }
    }
  }

  clear(): void {
    for (const t of this.timers) {
      clearInterval(t);
      clearTimeout(t);
    }
    this.timers = [];
  }
}
