// Types shared between the main process, the simulation and the renderer.

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A physical display, in Electron DIP screen coordinates. */
export interface DisplayInfo {
  id: number;
  /** Full bounds of the display. */
  bounds: Rect;
  /** Bounds minus menu bar / dock. The buddy's "floor" is the bottom of this. */
  workArea: Rect;
  primary: boolean;
}

/** What is currently frontmost on the user's desktop. */
export interface ActiveWindowInfo {
  app: string;
  title: string;
  /** Global screen rect, or null when the window could not be measured. */
  bounds: Rect | null;
  /** Monotonic timestamp (ms) at which this was observed. */
  observedAt: number;
}

export type AnimationName =
  | 'idle'
  | 'walk'
  | 'sit'
  | 'sleep'
  | 'watch'
  | 'point'
  | 'alert'
  | 'happy'
  | 'drag';

export interface AnimationDef {
  frames: string[];
  fps: number;
  /** When false the animation stops on its last frame. Default true. */
  loop?: boolean;
}

/** Contents of a buddy folder's buddy.json. */
export interface BuddyManifest {
  name: string;
  /** Frame size in CSS pixels before scaling. */
  frameWidth: number;
  frameHeight: number;
  /** Default scale. */
  scale?: number;
  /** Which way the artwork faces. Frames are mirrored for the other direction. */
  facing?: 'left' | 'right';
  /** Y offset (px, pre-scale) between the frame bottom and the buddy's feet. */
  feetOffset?: number;
  /** Render frames with nearest-neighbour scaling (for PNG pixel art). */
  pixelArt?: boolean;
  animations: Partial<Record<AnimationName, AnimationDef>> & { idle: AnimationDef; walk: AnimationDef };
  /** Optional lines the buddy says when petted. */
  petLines?: string[];
}

export type BuddyMood = 'wander' | 'approach' | 'watch' | 'sit' | 'sleep' | 'alert' | 'guide' | 'drag' | 'fall' | 'happy';

export interface BubbleState {
  text: string;
  /** 'info' | 'warn' | 'error' change the bubble colour. */
  level: 'info' | 'warn' | 'error';
  /** Epoch ms when the bubble should disappear, or null for sticky. */
  until: number | null;
}

/** Renderer-facing snapshot of one buddy. */
export interface BuddyView {
  id: string;
  name: string;
  /** Folder key used to resolve sprite URLs. */
  pack: string;
  /** Global DIP coordinates of the buddy's feet (bottom centre). */
  x: number;
  y: number;
  facing: 'left' | 'right';
  animation: AnimationName;
  frame: number;
  scale: number;
  mood: BuddyMood;
  bubble: BubbleState | null;
  /** When guiding, the global point being pointed at. */
  pointer: { x: number; y: number } | null;
}

export interface WorldSnapshot {
  buddies: BuddyView[];
  /** Epoch ms. */
  t: number;
}

/** Alert / guide request accepted by the local API and the CLI. */
export interface AlertRequest {
  message: string;
  level?: 'info' | 'warn' | 'error';
  /**
   * Where the buddy should go:
   *  - "active": under the active window (default)
   *  - "here": stay where it is
   *  - "mouse": the current cursor position
   *  - {x, y}: a global screen point to walk to and point at
   */
  target?: 'active' | 'here' | 'mouse' | { x: number; y: number };
  /** Seconds the bubble stays. Default from config. 0 = until clicked. */
  duration?: number;
  /** Buddy id or name. Default: the first buddy. */
  buddy?: string;
}

export interface ReminderConfig {
  message: string;
  /** e.g. "45m", "1h", "90s". */
  every?: string;
  /** "HH:MM" local time. */
  at?: string;
  /** 0 = Sunday … 6 = Saturday. Default every day. */
  days?: number[];
  level?: 'info' | 'warn' | 'error';
  target?: AlertRequest['target'];
}

export interface BuddyConfigEntry {
  /** Folder name under a buddies directory, or an absolute path. */
  pack: string;
  /** Optional display name override. */
  name?: string;
  scale?: number;
  enabled?: boolean;
}

export interface AppConfig {
  buddies: BuddyConfigEntry[];
  /** Seconds idle before sitting. */
  idleSitAfter: number;
  /** Seconds idle before sleeping. */
  idleSleepAfter: number;
  /** Walking speed in DIP per second. */
  walkSpeed: number;
  /** Seconds between active-window polls. */
  activeWindowPoll: number;
  /** Seconds a bubble stays by default. */
  bubbleSeconds: number;
  api: {
    enabled: boolean;
    port: number;
    /** Optional shared secret. When set, requests need header `x-buddy-token`. */
    token?: string;
  };
  reminders: ReminderConfig[];
}

export const DEFAULT_CONFIG: AppConfig = {
  buddies: [{ pack: 'lab-yellow', enabled: true }],
  idleSitAfter: 90,
  idleSleepAfter: 300,
  walkSpeed: 60,
  activeWindowPoll: 1.5,
  bubbleSeconds: 12,
  api: { enabled: true, port: 47821 },
  reminders: [
    { message: 'Time to stretch and look away from the screen for a bit!', every: '45m', target: 'here' },
  ],
};
