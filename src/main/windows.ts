import { BrowserWindow, screen, type Display } from 'electron';
import { join } from 'node:path';
import type { BuddyManifest, DisplayInfo, WorldSnapshot } from '../shared/types';

export function toDisplayInfo(d: Display): DisplayInfo {
  return {
    id: d.id,
    bounds: { ...d.bounds },
    workArea: { ...d.workArea },
    primary: screen.getPrimaryDisplay().id === d.id,
  };
}

export function allDisplays(): DisplayInfo[] {
  return screen.getAllDisplays().map(toDisplayInfo);
}

/**
 * One transparent, click-through, always-on-top window per display. The
 * renderer inside draws any buddy whose feet are on that display.
 */
export class OverlayWindows {
  private windows = new Map<number, BrowserWindow>();
  private dev: boolean;

  constructor(dev: boolean, private readonly getPacks: () => Record<string, BuddyManifest>) {
    this.dev = dev;
  }

  /**
   * Overlay bounds for a display. On Windows the window is made one pixel shorter than the
   * screen: a borderless window that exactly covers a monitor can be treated as a full-screen
   * app, which hides the taskbar and can disable transparency.
   */
  private boundsFor(d: Display) {
    const b = { ...d.bounds };
    if (process.platform === 'win32') b.height -= 1;
    return b;
  }

  sync(): void {
    const displays = screen.getAllDisplays();
    const ids = new Set(displays.map((d) => d.id));
    for (const [id, win] of this.windows) {
      if (!ids.has(id)) {
        win.destroy();
        this.windows.delete(id);
      }
    }
    for (const d of displays) {
      const existing = this.windows.get(d.id);
      if (existing) {
        existing.setBounds(this.boundsFor(d));
        existing.webContents.send('display', toDisplayInfo(d));
      } else {
        this.windows.set(d.id, this.create(d));
      }
    }
  }

  private create(d: Display): BrowserWindow {
    const win = new BrowserWindow({
      ...this.boundsFor(d),
      frame: false,
      transparent: true,
      hasShadow: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      focusable: false,
      show: false,
      backgroundColor: '#00000000',
      roundedCorners: false,
      webPreferences: {
        preload: join(__dirname, '..', 'preload', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: false,
      },
    });
    // Float above full-screen apps and follow every Space.
    win.setAlwaysOnTop(true, 'screen-saver');
    win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
    win.setIgnoreMouseEvents(true, { forward: true });
    win.setBounds(this.boundsFor(d));
    const info = toDisplayInfo(d);
    if (this.dev) {
      win.webContents.on('console-message', (ev) => {
        console.log(`[renderer ${d.id}] ${ev.level}: ${ev.message} (${ev.sourceId}:${ev.lineNumber})`);
      });
    }
    win.webContents.on('did-finish-load', () => {
      win.webContents.send('display', info);
      win.webContents.send('packs', this.getPacks());
      // Windows creates the window at the primary display's DPI; set the bounds again once it exists
      // so a window on a second monitor with a different scale gets the right size.
      win.setBounds(this.boundsFor(d));
      win.showInactive();
    });
    void win.loadFile(join(__dirname, '..', 'renderer', 'index.html'), { query: { display: String(d.id) } });
    if (this.dev && process.argv.includes('--dev')) win.webContents.openDevTools({ mode: 'detach' });
    return win;
  }

  broadcast(channel: string, payload: unknown): void {
    for (const win of this.windows.values()) {
      if (!win.isDestroyed()) win.webContents.send(channel, payload);
    }
  }

  sendPacks(): void {
    this.broadcast('packs', this.getPacks());
  }

  sendSnapshot(snapshot: WorldSnapshot): void {
    this.broadcast('snapshot', snapshot);
  }

  setIgnoreMouse(displayId: number, ignore: boolean): void {
    const win = this.windows.get(displayId);
    if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(ignore, { forward: true });
  }

  windowFor(displayId: number): BrowserWindow | undefined {
    return this.windows.get(displayId);
  }

  destroyAll(): void {
    for (const win of this.windows.values()) win.destroy();
    this.windows.clear();
  }
}
