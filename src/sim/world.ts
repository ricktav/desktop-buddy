import type {
  ActiveWindowInfo,
  AlertRequest,
  BuddyManifest,
  DisplayInfo,
  WorldSnapshot,
} from '../shared/types';
import { Buddy, displayById, resolveAlertTarget, type Rng, type SimConfig } from './buddy';

export interface WorldOptions {
  cfg: SimConfig;
  rng?: Rng;
  now?: () => number;
}

/**
 * Pure simulation of every buddy on the virtual desktop. No Electron here so
 * it can be unit-tested with plain Node.
 */
export class World {
  readonly buddies: Buddy[] = [];
  displays: DisplayInfo[] = [];
  activeWindow: ActiveWindowInfo | null = null;
  idleSeconds = 0;
  mouse: { x: number; y: number } | null = null;
  private cfg: SimConfig;
  private readonly rng: Rng;
  private readonly now: () => number;
  private lastTick: number | null = null;

  constructor(opts: WorldOptions) {
    this.cfg = opts.cfg;
    this.rng = opts.rng ?? Math.random;
    this.now = opts.now ?? Date.now;
  }

  setConfig(cfg: SimConfig): void {
    this.cfg = cfg;
    // Buddies hold the same object reference, so mutate in place.
    for (const b of this.buddies) Object.assign((b as unknown as { cfg: SimConfig }).cfg, cfg);
  }

  setDisplays(displays: DisplayInfo[]): void {
    this.displays = displays;
    const primary = displays.find((d) => d.primary) ?? displays[0];
    for (const b of this.buddies) {
      if (primary && !displays.some((d) => d.id === b.displayId)) b.placeOn(primary);
      else b.onDisplaysChanged(displays);
    }
  }

  addBuddy(id: string, pack: string, manifest: BuddyManifest, opts: { name?: string; scale?: number } = {}): Buddy {
    const b = new Buddy(id, pack, manifest, this.cfg, this.rng, opts);
    const primary = this.displays.find((d) => d.primary) ?? this.displays[0];
    if (primary) b.placeOn(primary);
    this.buddies.push(b);
    return b;
  }

  removeBuddy(id: string): boolean {
    const i = this.buddies.findIndex((b) => b.id === id);
    if (i < 0) return false;
    this.buddies.splice(i, 1);
    return true;
  }

  findBuddy(ref?: string): Buddy | null {
    if (!ref) return this.buddies[0] ?? null;
    const lower = ref.toLowerCase();
    return this.buddies.find((b) => b.id === ref || b.name.toLowerCase() === lower) ?? null;
  }

  alert(req: AlertRequest): Buddy | null {
    const b = this.findBuddy(req.buddy);
    if (!b) return null;
    const target = resolveAlertTarget(req, this.displays, this.activeWindow, this.mouse, b.displayId);
    const seconds = req.duration ?? this.cfg.bubbleSeconds;
    b.queueAlert({
      message: req.message,
      level: req.level ?? 'info',
      target,
      durationMs: seconds <= 0 ? null : seconds * 1000,
    });
    return b;
  }

  /** Advance the simulation. `dt` defaults to the wall-clock delta, capped. */
  tick(dt?: number): WorldSnapshot {
    const now = this.now();
    if (dt === undefined) {
      dt = this.lastTick === null ? 1 / 60 : Math.min(0.25, (now - this.lastTick) / 1000);
    }
    this.lastTick = now;
    for (const b of this.buddies) {
      b.tick(dt, now, this.displays, this.activeWindow, this.idleSeconds);
    }
    return this.snapshot();
  }

  snapshot(): WorldSnapshot {
    return { buddies: this.buddies.map((b) => b.view()), t: this.now() };
  }

  displayFor(buddy: Buddy): DisplayInfo | null {
    return displayById(this.displays, buddy.displayId);
  }
}
