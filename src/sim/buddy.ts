import type {
  ActiveWindowInfo,
  AlertRequest,
  AnimationName,
  BubbleState,
  BuddyManifest,
  BuddyMood,
  BuddyView,
  DisplayInfo,
  Rect,
  TrickEffect,
} from '../shared/types';

export interface SimConfig {
  idleSitAfter: number;
  idleSleepAfter: number;
  walkSpeed: number;
  bubbleSeconds: number;
  /** Multiplier on all movement; undefined means 1. */
  speedFactor?: number;
}

export interface Rng {
  (): number;
}

export interface PendingAlert {
  message: string;
  level: 'info' | 'warn' | 'error';
  /** Resolved global target. */
  target: { kind: 'floor'; x: number; displayId: number } | { kind: 'point'; x: number; y: number; displayId: number } | { kind: 'here' };
  durationMs: number | null;
  cheer?: boolean;
  /** Travel speed multiplier for this trip. */
  speed?: number;
}

const EDGE_MARGIN = 40;
const RISE_SPEED = 260; // DIP/s when floating up to a guide point
const FALL_SPEED = 700;
const CLIMB_SPEED = 220; // a top-edge buddy climbs back up this fast after being dropped
const HOVER_ABOVE_POINT = 28; // feet sit this far below the pointed-at target

export function floorOf(display: DisplayInfo): number {
  return display.workArea.y + display.workArea.height;
}

/** Where a buddy of the given edge rests on a display: the bottom of the work area, or its top. */
export function homeOf(display: DisplayInfo, edge: 'bottom' | 'top' | undefined): number {
  return edge === 'top' ? display.workArea.y : floorOf(display);
}

export function displayContaining(displays: DisplayInfo[], x: number, y: number): DisplayInfo | null {
  for (const d of displays) {
    const b = d.bounds;
    if (x >= b.x && x < b.x + b.width && y >= b.y && y < b.y + b.height) return d;
  }
  return null;
}

export function displayById(displays: DisplayInfo[], id: number): DisplayInfo | null {
  return displays.find((d) => d.id === id) ?? null;
}

/** The display whose horizontal range contains `x`, preferring `preferId`. */
function displayAtX(displays: DisplayInfo[], x: number, preferId: number): DisplayInfo | null {
  const prefer = displayById(displays, preferId);
  if (prefer && x >= prefer.bounds.x && x < prefer.bounds.x + prefer.bounds.width) return prefer;
  for (const d of displays) {
    if (x >= d.bounds.x && x < d.bounds.x + d.bounds.width) return d;
  }
  return null;
}

function clampToDisplay(display: DisplayInfo, x: number): number {
  const wa = display.workArea;
  return Math.min(wa.x + wa.width - EDGE_MARGIN, Math.max(wa.x + EDGE_MARGIN, x));
}

function rectCentre(r: Rect): { x: number; y: number } {
  return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
}

export class Buddy {
  readonly id: string;
  name: string;
  readonly pack: string;
  readonly manifest: BuddyManifest;
  scale: number;

  x = 0;
  y = 0;
  displayId = 0;
  facing: 'left' | 'right' = 'right';
  mood: BuddyMood = 'wander';
  animation: AnimationName = 'idle';
  bubble: BubbleState | null = null;
  pointer: { x: number; y: number } | null = null;
  effect: TrickEffect | null = null;
  cheering = false;

  private animTime = 0;
  /** A temporary or per-buddy speed boost on top of the global speed factor. */
  private boost: { factor: number; until: number } | null = null;
  /** Global factor times boost, refreshed every tick. */
  private curFactor = 1;
  /** Speed multiplier of the walk in progress, used to pace the leg animation. */
  private moveFactor = 1;
  private targetX: number | null = null;
  private targetY: number | null = null;
  private speedScale = 1;
  /** Seconds remaining in the current pause / watch / happy phase. */
  private timer = 0;
  private watchedKey: string | null = null;
  private pendingAlerts: PendingAlert[] = [];
  private currentAlert: PendingAlert | null = null;
  private alertPhase: 'travel' | 'rise' | 'show' | 'fall' | null = null;
  private wasIdle = false;
  private dragOffset = { x: 0, y: 0 };

  constructor(
    id: string,
    pack: string,
    manifest: BuddyManifest,
    private readonly cfg: SimConfig,
    private readonly rng: Rng = Math.random,
    opts: { name?: string; scale?: number } = {},
  ) {
    this.id = id;
    this.pack = pack;
    this.manifest = manifest;
    this.name = opts.name ?? manifest.name;
    this.scale = opts.scale ?? manifest.scale ?? 1;
  }

  private get top(): boolean {
    return this.manifest.edge === 'top';
  }

  private homeY(display: DisplayInfo): number {
    return homeOf(display, this.manifest.edge);
  }

  /** Walking speed relative to other buddies; alerts never go slower than 60%. */
  private get baseSpeed(): number {
    const s = Math.min(3, Math.max(0.1, this.manifest.speed ?? 1));
    return this.currentAlert ? Math.max(s, 0.6) : s;
  }

  /** Where the anchor point should be so the buddy sits just short of a guide target. */
  private guideY(display: DisplayInfo, targetY: number): number {
    if (!this.top) return targetY + HOVER_ABOVE_POINT;
    const below = (this.manifest.frameHeight - (this.manifest.gripOffset ?? 0)) * this.scale;
    return Math.max(this.homeY(display), targetY - HOVER_ABOVE_POINT - below);
  }

  /** Place the buddy at its edge of a display. */
  placeOn(display: DisplayInfo, x?: number): void {
    this.displayId = display.id;
    this.x = clampToDisplay(display, x ?? display.workArea.x + display.workArea.width * (0.2 + 0.6 * this.rng()));
    this.y = this.homeY(display);
    this.targetX = null;
    this.targetY = null;
  }

  /** Move faster (or slower) than the global speed. `seconds` null = until changed; factor 1 with null clears the boost. */
  setBoost(factor: number, seconds: number | null, now: number): void {
    if (seconds === null && factor === 1) this.boost = null;
    else this.boost = { factor, until: seconds === null ? Infinity : now + seconds * 1000 };
  }

  /** Current boost, if any, for status displays. */
  boostInfo(now: number): { factor: number; remainingSeconds: number | null } | null {
    if (!this.boost || now >= this.boost.until) return null;
    return { factor: this.boost.factor, remainingSeconds: this.boost.until === Infinity ? null : (this.boost.until - now) / 1000 };
  }

  queueAlert(alert: PendingAlert): void {
    this.pendingAlerts.push(alert);
  }

  get hasAlert(): boolean {
    return this.currentAlert !== null || this.pendingAlerts.length > 0;
  }

  dismissBubble(): void {
    if (this.bubble) this.bubble.until = 0;
  }

  /** Double-click: perform the pack's trick, if it defines one. */
  trick(now: number): void {
    const def = this.manifest.doubleClick;
    if (!def || this.mood === 'drag' || this.mood === 'fall' || this.hasAlert) return;
    this.wasIdle = false;
    this.setMood('trick');
    this.animation = def.animation && this.manifest.animations[def.animation] ? def.animation : 'happy';
    this.timer = def.seconds ?? 3;
    this.effect = def.effect ?? null;
    this.bubble = def.say ? { text: def.say, level: 'info', until: now + this.timer * 1000 } : null;
  }

  pet(now: number): void {
    if (this.mood === 'drag' || this.mood === 'trick') return;
    if (this.currentAlert) {
      // A click on an alerting or cheering buddy acknowledges the alert.
      this.dismissBubble();
      return;
    }
    if (this.mood === 'sleep') {
      // Waking a sleeping buddy by petting it.
      this.wasIdle = false;
    }
    this.setMood('happy');
    this.timer = 2.2;
    const lines = this.manifest.petLines ?? [];
    if (lines.length && this.rng() < 0.7 && !this.bubble) {
      this.bubble = { text: lines[Math.floor(this.rng() * lines.length)], level: 'info', until: now + 2500 };
    }
  }

  startDrag(px: number, py: number): void {
    this.effect = null;
    this.dragOffset = { x: this.x - px, y: this.y - py };
    this.setMood('drag');
    this.targetX = null;
    this.targetY = null;
  }

  drag(px: number, py: number, displays: DisplayInfo[]): void {
    if (this.mood !== 'drag') return;
    this.x = px + this.dragOffset.x;
    this.y = py + this.dragOffset.y;
    const d = displayContaining(displays, px, py);
    if (d) this.displayId = d.id;
  }

  endDrag(displays: DisplayInfo[]): void {
    if (this.mood !== 'drag') return;
    const d = displayById(displays, this.displayId) ?? displays[0];
    if (d) this.x = clampToDisplay(d, this.x);
    this.setMood('fall');
  }

  /** Re-anchor after displays changed. */
  onDisplaysChanged(displays: DisplayInfo[]): void {
    const d = displayById(displays, this.displayId) ?? displays[0];
    if (!d) return;
    if (this.mood !== 'drag' && this.mood !== 'guide' && this.alertPhase !== 'rise' && this.alertPhase !== 'show') {
      this.placeOn(d, this.x);
    }
  }

  tick(dt: number, now: number, displays: DisplayInfo[], active: ActiveWindowInfo | null, idleSeconds: number): void {
    const display = displayById(displays, this.displayId) ?? displays[0];
    if (!display) return;
    if (this.bubble && this.bubble.until !== null && now >= this.bubble.until) {
      this.bubble = null;
    }
    if (this.boost && now >= this.boost.until) this.boost = null;
    this.curFactor = (this.cfg.speedFactor ?? 1) * (this.boost ? this.boost.factor : 1);

    // 1. Idle handling: sit, then sleep. Any activity wakes the buddy.
    const idle = idleSeconds >= this.cfg.idleSitAfter;
    if (!this.hasAlert && this.mood !== 'drag' && this.mood !== 'fall' && this.mood !== 'guide' && this.mood !== 'trick') {
      if (idle) {
        if (idleSeconds >= this.cfg.idleSleepAfter && this.mood !== 'sleep') this.setMood('sleep');
        else if (idleSeconds < this.cfg.idleSleepAfter && this.mood !== 'sit' && this.mood !== 'sleep') {
          this.setMood('sit');
        }
        this.wasIdle = true;
      } else if (this.wasIdle) {
        this.wasIdle = false;
        this.setMood('happy');
        this.timer = 1.5;
      }
    }

    // 1b. Self-heal: an alert must only live in the alert/guide/drag/fall moods.
    if (this.currentAlert && !['alert', 'guide', 'drag', 'fall'].includes(this.mood)) {
      this.finishAlert();
    }

    // 2. Start a queued alert when free.
    if (!this.currentAlert && this.pendingAlerts.length && this.mood !== 'drag' && this.mood !== 'fall' && this.mood !== 'trick') {
      this.beginAlert(this.pendingAlerts.shift()!, displays, now);
    }

    // 3. Watch the active window.
    if (!this.hasAlert && active && (this.mood === 'wander' || this.mood === 'watch' || this.mood === 'approach')) {
      this.considerActiveWindow(active, displays);
    }

    switch (this.mood) {
      case 'wander':
        this.tickWander(dt, display, displays);
        break;
      case 'approach':
        this.tickWalk(dt, displays, 0.6);
        if (this.targetX === null) {
          this.setMood('watch');
          this.timer = 20 + this.rng() * 40;
          if (active?.bounds) this.faceToward(rectCentre(active.bounds).x);
        }
        break;
      case 'watch':
        this.timer -= dt;
        if (this.timer <= 0) this.setMood('wander');
        break;
      case 'sit':
      case 'sleep':
        break;
      case 'happy':
        this.timer -= dt;
        if (this.timer <= 0) this.setMood('wander');
        break;
      case 'trick':
        this.timer -= dt;
        if (this.timer <= 0) {
          this.effect = null;
          this.setMood('happy');
          this.timer = 1.2;
        }
        break;
      case 'drag':
        break;
      case 'fall': {
        const home = this.homeY(display);
        const v = (this.top ? CLIMB_SPEED : FALL_SPEED) * dt;
        this.y = this.y < home ? Math.min(home, this.y + v) : Math.max(home, this.y - v);
        if (this.y === home) {
          if (this.currentAlert) {
            this.finishAlert();
          } else {
            this.setMood('happy');
            this.timer = 1;
          }
        }
        break;
      }
      case 'alert':
      case 'guide':
        this.tickAlert(dt, now, displays);
        break;
    }

    // Legs move faster when the buddy does (never slower than 70% or faster than 3.5x).
    this.animTime += dt * (this.animation === 'walk' ? Math.min(3.5, Math.max(0.7, this.moveFactor)) : 1);
  }

  // ---- behaviours ------------------------------------------------------

  private tickWander(dt: number, display: DisplayInfo, displays: DisplayInfo[]): void {
    if (this.targetX !== null) {
      this.tickWalk(dt, displays, this.speedScale);
      if (this.targetX === null) this.timer = 2 + this.rng() * 8;
      return;
    }
    this.animation = 'idle';
    this.timer -= dt;
    if (this.timer > 0) return;
    // Pick somewhere new to go. Occasionally wander onto a neighbouring display.
    let dest = display;
    if (displays.length > 1 && this.rng() < 0.25) {
      const others = displays.filter((d) => d.id !== display.id);
      dest = others[Math.floor(this.rng() * others.length)];
    }
    const wa = dest.workArea;
    this.targetX = clampToDisplay(dest, wa.x + this.rng() * wa.width);
    this.speedScale = 0.6 + this.rng() * 0.5;
    if (this.rng() < 0.15) {
      // Sit for a moment instead.
      this.targetX = null;
      this.animation = 'sit';
      this.timer = 6 + this.rng() * 10;
    }
  }

  /** Walk toward targetX along the floor, switching displays when crossing. */
  private tickWalk(dt: number, displays: DisplayInfo[], speedScale: number): void {
    if (this.targetX === null) return;
    const speed = this.cfg.walkSpeed * speedScale * this.curFactor * this.baseSpeed;
    this.moveFactor = speedScale * this.curFactor * this.baseSpeed;
    const dx = this.targetX - this.x;
    const step = Math.min(Math.abs(dx), speed * dt);
    if (Math.abs(dx) < 1) {
      this.x = this.targetX;
      this.targetX = null;
      this.animation = 'idle';
      return;
    }
    this.facing = dx > 0 ? 'right' : 'left';
    this.animation = 'walk';
    const nx = this.x + Math.sign(dx) * step;
    const next = displayAtX(displays, nx, this.displayId);
    if (next) {
      if (next.id !== this.displayId) {
        this.displayId = next.id;
      }
      this.x = nx;
      this.y = this.homeY(next);
    } else {
      // Nothing to walk onto: stop at the edge.
      const d = displayById(displays, this.displayId)!;
      this.x = clampToDisplay(d, nx);
      this.targetX = null;
      this.animation = 'idle';
    }
  }

  private considerActiveWindow(active: ActiveWindowInfo, displays: DisplayInfo[]): void {
    if (!active.bounds) return;
    const key = `${active.app}|${active.title}|${Math.round(active.bounds.x / 50)}|${Math.round(active.bounds.width / 50)}`;
    if (key === this.watchedKey) return;
    this.watchedKey = key;
    const c = rectCentre(active.bounds);
    const d = displayContaining(displays, c.x, c.y) ?? displayAtX(displays, c.x, this.displayId);
    if (!d) return;
    this.targetX = clampToDisplay(d, c.x);
    this.setMood('approach');
  }

  private beginAlert(alert: PendingAlert, displays: DisplayInfo[], now: number): void {
    this.currentAlert = alert;
    this.wasIdle = false;
    this.bubble = null;
    if (alert.target.kind === 'here') {
      this.alertPhase = 'show';
      this.setMood('alert');
      this.showBubble(alert, now);
      return;
    }
    const d = displayById(displays, alert.target.displayId) ?? displays[0];
    this.targetX = clampToDisplay(d, alert.target.x);
    this.targetY = alert.target.kind === 'point' ? this.guideY(d, alert.target.y) : null;
    this.alertPhase = 'travel';
    this.setMood(alert.target.kind === 'point' ? 'guide' : 'alert');
    // Make sure we are at our edge before travelling.
    if (this.y !== this.homeY(d) && this.displayId === d.id) this.y = this.homeY(d);
  }

  private tickAlert(dt: number, now: number, displays: DisplayInfo[]): void {
    const alert = this.currentAlert;
    if (!alert) {
      this.setMood('wander');
      return;
    }
    switch (this.alertPhase) {
      case 'travel':
        this.tickWalk(dt, displays, alert.speed ?? 1.4);
        if (this.targetX === null) {
          if (this.targetY !== null) {
            this.alertPhase = 'rise';
          } else {
            this.alertPhase = 'show';
            this.showBubble(alert, now);
          }
        }
        break;
      case 'rise': {
        const ty = this.targetY ?? this.y;
        this.animation = 'point';
        if (alert.target.kind === 'point') {
          this.pointer = { x: alert.target.x, y: alert.target.y };
          this.faceToward(alert.target.x);
        }
        const v = RISE_SPEED * Math.max(1, this.curFactor, (alert.speed ?? 1.4) / 1.4) * dt;
        if (this.y > ty) this.y = Math.max(ty, this.y - v);
        else if (this.y < ty) this.y = Math.min(ty, this.y + v);
        if (Math.abs(this.y - ty) <= 0.5) {
          this.y = ty;
          this.alertPhase = 'show';
          this.showBubble(alert, now);
        }
        break;
      }
      case 'show':
        this.animation = this.cheering ? this.cheerAnimation() : this.mood === 'guide' ? 'point' : 'alert';
        if (!this.bubble) {
          // Bubble expired or dismissed.
          if (this.mood === 'guide') {
            this.pointer = null;
            this.alertPhase = 'fall';
            this.setMood('fall');
          } else {
            this.finishAlert();
          }
        }
        break;
      case 'fall':
        // Handled by the 'fall' mood.
        break;
    }
  }

  private showBubble(alert: PendingAlert, now: number): void {
    this.bubble = {
      text: alert.message,
      level: alert.level,
      until: alert.durationMs === null ? null : now + alert.durationMs,
    };
    if (alert.cheer) {
      this.cheering = true;
      this.effect = { type: 'confetti' };
      this.animTime = 0;
    }
  }

  /** Animation used while cheering: the pack's trick animation, else happy. */
  private cheerAnimation(): AnimationName {
    const t = this.manifest.doubleClick?.animation;
    return t && this.manifest.animations[t] ? t : 'happy';
  }

  private finishAlert(): void {
    this.currentAlert = null;
    this.alertPhase = null;
    this.pointer = null;
    this.targetY = null;
    if (this.cheering) {
      this.cheering = false;
      this.effect = null;
    }
    this.setMood('watch');
    this.timer = 4;
  }

  private faceToward(x: number): void {
    if (Math.abs(x - this.x) > 10) this.facing = x > this.x ? 'right' : 'left';
  }

  private setMood(mood: BuddyMood): void {
    if (this.mood === mood) return;
    this.mood = mood;
    this.animTime = 0;
    switch (mood) {
      case 'wander':
        this.animation = 'idle';
        this.timer = 1 + this.rng() * 3;
        this.targetX = null;
        break;
      case 'approach':
        this.animation = 'walk';
        break;
      case 'watch':
        this.animation = 'watch';
        break;
      case 'sit':
        this.animation = 'sit';
        this.targetX = null;
        break;
      case 'sleep':
        this.animation = 'sleep';
        this.targetX = null;
        break;
      case 'happy':
        this.animation = 'happy';
        break;
      case 'drag':
        this.animation = 'drag';
        break;
      case 'fall':
        this.animation = 'drag';
        break;
      case 'alert':
        this.animation = 'alert';
        break;
      case 'guide':
        this.animation = 'walk';
        break;
      case 'trick':
        this.targetX = null;
        break;
    }
  }

  // ---- view ------------------------------------------------------------

  private currentFrame(): { animation: AnimationName; frame: number } {
    const anims = this.manifest.animations;
    const name: AnimationName = anims[this.animation] ? this.animation : 'idle';
    const def = anims[name]!;
    const total = def.frames.length;
    const raw = Math.floor(this.animTime * def.fps);
    const frame = def.loop === false ? Math.min(raw, total - 1) : raw % total;
    return { animation: name, frame };
  }

  view(): BuddyView {
    const { animation, frame } = this.currentFrame();
    return {
      id: this.id,
      name: this.name,
      pack: this.pack,
      x: this.x,
      y: this.y,
      facing: this.facing,
      animation,
      frame,
      scale: this.scale,
      mood: this.mood,
      bubble: this.bubble,
      pointer: this.pointer,
      effect: this.effect,
      cheering: this.cheering,
    };
  }
}

export function resolveAlertTarget(
  req: AlertRequest,
  displays: DisplayInfo[],
  active: ActiveWindowInfo | null,
  mouse: { x: number; y: number } | null,
  fallbackDisplayId: number,
): PendingAlert['target'] {
  const target = req.target ?? 'active';
  if (target === 'here') return { kind: 'here' };
  if (target === 'mouse') {
    if (mouse) {
      const d = displayContaining(displays, mouse.x, mouse.y) ?? displays[0];
      return { kind: 'point', x: mouse.x, y: mouse.y, displayId: d.id };
    }
    return { kind: 'here' };
  }
  if (typeof target === 'object') {
    const d = displayContaining(displays, target.x, target.y) ?? displays[0];
    return { kind: 'point', x: target.x, y: target.y, displayId: d.id };
  }
  // 'active'
  if (active?.bounds) {
    const c = rectCentre(active.bounds);
    const d = displayContaining(displays, c.x, c.y) ?? displays[0];
    return { kind: 'floor', x: c.x, displayId: d.id };
  }
  void fallbackDisplayId;
  return { kind: 'here' };
}
