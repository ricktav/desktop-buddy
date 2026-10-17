import type { BuddyManifest, DisplayInfo, WorldSnapshot } from './types';

/** API exposed to the renderer on window.buddy by the preload script. */
export interface BuddyBridge {
  onDisplay(cb: (d: DisplayInfo) => void): void;
  onSnapshot(cb: (s: WorldSnapshot) => void): void;
  /** Manifests of every loaded pack, keyed by pack key. Sent on load and whenever packs change. */
  onPacks(cb: (packs: Record<string, BuddyManifest>) => void): void;
  setIgnoreMouse(ignore: boolean): void;
  dragStart(id: string): void;
  dragEnd(id: string): void;
  pet(id: string): void;
  dismiss(id: string): void;
  contextMenu(id: string): void;
}
