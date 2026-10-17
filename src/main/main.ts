import { app, BrowserWindow, dialog, ipcMain, Menu, nativeImage, powerMonitor, screen, shell, systemPreferences, Tray } from 'electron';
import { cpSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import type { AlertRequest, AppConfig } from '../shared/types';
import { World } from '../sim/world';
import { ActiveWindowTracker } from './activeWindow';
import { startApi } from './api';
import { configPath, loadConfig, saveConfig, userBuddiesDir } from './config';
import { installPackProtocol, listAvailablePacks, loadedPackManifests, loadPack, registerPackScheme } from './packs';
import { ReminderScheduler } from './reminders';
import { allDisplays, OverlayWindows } from './windows';

const DEV = process.argv.includes('--dev');
/** `--capture=DIR` writes a PNG of every overlay window to DIR every 3 s (debugging aid). */
const CAPTURE_DIR = process.argv.find((a) => a.startsWith('--capture='))?.slice('--capture='.length) ?? null;
const TICK_MS = 1000 / 30;

registerPackScheme();

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let cfg: AppConfig;
let world: World;
let overlays: OverlayWindows;
let tray: Tray | null = null;
let draggingId: string | null = null;
let buddySeq = 0;
const tracker = new ActiveWindowTracker(['Electron', 'Desktop Buddy']);
const reminders = new ReminderScheduler((req) => world.alert(req));

function simConfig(c: AppConfig) {
  return { idleSitAfter: c.idleSitAfter, idleSleepAfter: c.idleSleepAfter, walkSpeed: c.walkSpeed, bubbleSeconds: c.bubbleSeconds };
}

function addBuddyFromEntry(entry: AppConfig['buddies'][number]): string {
  const pack = loadPack(entry.pack);
  const id = `${pack.key}-${++buddySeq}`;
  world.addBuddy(id, pack.key, pack.manifest, { name: entry.name, scale: entry.scale });
  overlays?.sendPacks();
  return id;
}

function loadBuddies(): void {
  for (const b of [...world.buddies]) world.removeBuddy(b.id);
  for (const entry of cfg.buddies) {
    if (entry.enabled === false) continue;
    try {
      addBuddyFromEntry(entry);
    } catch (err) {
      console.error((err as Error).message);
    }
  }
  if (world.buddies.length === 0) {
    try {
      addBuddyFromEntry({ pack: 'lab-yellow' });
    } catch (err) {
      console.error('no buddies could be loaded:', (err as Error).message);
    }
  }
}

async function reloadConfig(): Promise<void> {
  cfg = loadConfig();
  world.setConfig(simConfig(cfg));
  loadBuddies();
  reminders.load(cfg.reminders);
  tracker.start(cfg.activeWindowPoll);
  buildTray();
}

function sendAlert(req: AlertRequest) {
  const b = world.alert(req);
  return b ? ({ ok: true, buddy: b.id } as const) : ({ ok: false, error: `buddy "${req.buddy}" not found` } as const);
}

function buildMenu(forBuddyId?: string): Menu {
  const available = listAvailablePacks();
  const buddyItems = world.buddies.map((b) => ({
    label: `${b.name} (${b.pack})`,
    submenu: [
      { label: 'Pet', click: () => b.pet(Date.now()) },
      { label: 'Dismiss bubble', click: () => b.dismissBubble() },
      { label: 'Say hello here', click: () => world.alert({ message: 'Woof! I am right here.', target: 'here', buddy: b.id }) },
      { type: 'separator' as const },
      {
        label: 'Remove',
        click: () => {
          world.removeBuddy(b.id);
          cfg.buddies = cfg.buddies.filter((e) => !(e.pack === b.pack && (e.name ?? '') === (b.name === b.manifest.name ? '' : b.name)));
          saveConfig(cfg);
          buildTray();
        },
      },
    ],
  }));
  const addItems = available.map((p) => ({
    label: `${p.name} (${p.ref}, ${p.source})`,
    click: () => {
      cfg.buddies.push({ pack: p.ref, enabled: true });
      saveConfig(cfg);
      addBuddyFromEntry({ pack: p.ref });
      buildTray();
    },
  }));
  return Menu.buildFromTemplate([
    ...(forBuddyId
      ? [
          { label: 'Pet', click: () => world.findBuddy(forBuddyId)?.pet(Date.now()) },
          { label: 'Dismiss bubble', click: () => world.findBuddy(forBuddyId)?.dismissBubble() },
          { type: 'separator' as const },
        ]
      : []),
    { label: 'Buddies', submenu: buddyItems.length ? buddyItems : [{ label: '(none)', enabled: false }] },
    { label: 'Add buddy', submenu: addItems.length ? addItems : [{ label: '(no packs found)', enabled: false }] },
    { label: 'Install buddy folder…', click: () => void installBuddyFolder() },
    { type: 'separator' },
    { label: 'Test alert', click: () => world.alert({ message: 'This is a test alert. Everything works!', level: 'warn' }) },
    {
      label: 'Test guide (point at mouse)',
      click: () => world.alert({ message: 'Look here!', target: 'mouse', duration: 8 }),
    },
    { type: 'separator' },
    { label: 'Open config file', click: () => void shell.openPath(configPath()) },
    { label: 'Open buddies folder', click: () => void shell.openPath(userBuddiesDir()) },
    { label: 'Reload config', click: () => void reloadConfig() },
    { type: 'separator' },
    { label: `API: http://127.0.0.1:${cfg.api.port}${cfg.api.enabled ? '' : ' (disabled)'}`, enabled: false },
    { label: 'Quit Desktop Buddy', click: () => app.quit() },
  ]);
}

async function installBuddyFolder(): Promise<void> {
  const result = await dialog.showOpenDialog({ title: 'Choose a buddy folder (must contain buddy.json)', properties: ['openDirectory'] });
  if (result.canceled || !result.filePaths[0]) return;
  const src = result.filePaths[0];
  if (!existsSync(join(src, 'buddy.json'))) {
    dialog.showErrorBox('Not a buddy folder', `${src} has no buddy.json`);
    return;
  }
  const dest = join(userBuddiesDir(), basename(src));
  cpSync(src, dest, { recursive: true });
  cfg.buddies.push({ pack: basename(src), enabled: true });
  saveConfig(cfg);
  try {
    addBuddyFromEntry({ pack: basename(src) });
  } catch (err) {
    dialog.showErrorBox('Could not load buddy', (err as Error).message);
  }
  buildTray();
}

function trayIcon() {
  const p = join(__dirname, '..', 'assets', 'trayTemplate.png');
  const img = existsSync(p) ? nativeImage.createFromPath(p) : nativeImage.createEmpty();
  img.setTemplateImage(true);
  return img;
}

function buildTray(): void {
  if (!tray) {
    tray = new Tray(trayIcon());
    tray.setToolTip('Desktop Buddy');
  }
  tray.setContextMenu(buildMenu());
}

function wireIpc(): void {
  ipcMain.on('ignore-mouse', (e, ignore: boolean) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (win && !win.isDestroyed()) win.setIgnoreMouseEvents(ignore, { forward: true });
  });
  ipcMain.on('drag-start', (_e, id: string) => {
    const b = world.findBuddy(id);
    if (!b) return;
    const p = screen.getCursorScreenPoint();
    b.startDrag(p.x, p.y);
    draggingId = id;
  });
  ipcMain.on('drag-end', (_e, id: string) => {
    world.findBuddy(id)?.endDrag(world.displays);
    if (draggingId === id) draggingId = null;
  });
  ipcMain.on('pet', (_e, id: string) => world.findBuddy(id)?.pet(Date.now()));
  ipcMain.on('dismiss', (_e, id: string) => world.findBuddy(id)?.dismissBubble());
  ipcMain.on('context-menu', (e, id: string) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    buildMenu(id).popup({ window: win });
  });
}

function tick(): void {
  world.idleSeconds = powerMonitor.getSystemIdleTime();
  if (draggingId) {
    const b = world.findBuddy(draggingId);
    const p = screen.getCursorScreenPoint();
    b?.drag(p.x, p.y, world.displays);
  }
  world.mouse = screen.getCursorScreenPoint();
  overlays.sendSnapshot(world.tick());
}

app.whenReady().then(async () => {
  app.dock?.hide();
  installPackProtocol();
  if (process.platform === 'darwin') {
    // Prompts the user to grant Accessibility so we can see the frontmost window.
    systemPreferences.isTrustedAccessibilityClient(true);
  }

  cfg = loadConfig();
  world = new World({ cfg: simConfig(cfg) });
  world.setDisplays(allDisplays());
  overlays = new OverlayWindows(DEV || CAPTURE_DIR !== null, loadedPackManifests);
  overlays.sync();
  loadBuddies();
  tracker.onChange = (info) => {
    world.activeWindow = info;
  };
  tracker.start(cfg.activeWindowPoll);
  reminders.load(cfg.reminders);
  wireIpc();
  buildTray();

  if (cfg.api.enabled) {
    startApi(cfg.api.port, cfg.api.token, {
      alert: sendAlert,
      state: () => ({ ...world.snapshot(), displays: world.displays, activeWindow: world.activeWindow, idleSeconds: world.idleSeconds }),
      listBuddies: () => ({ active: world.buddies.map((b) => ({ id: b.id, name: b.name, pack: b.pack })), available: listAvailablePacks() }),
      addBuddy: async (ref) => {
        try {
          const id = addBuddyFromEntry({ pack: ref });
          cfg.buddies.push({ pack: ref, enabled: true });
          saveConfig(cfg);
          buildTray();
          return { ok: true, id };
        } catch (err) {
          return { ok: false, error: (err as Error).message };
        }
      },
      removeBuddy: (id) => {
        const ok = world.removeBuddy(id);
        buildTray();
        return { ok };
      },
      reload: reloadConfig,
    });
  }

  const onDisplays = () => {
    world.setDisplays(allDisplays());
    overlays.sync();
  };
  screen.on('display-added', onDisplays);
  screen.on('display-removed', onDisplays);
  screen.on('display-metrics-changed', onDisplays);

  setInterval(tick, TICK_MS);

  if (CAPTURE_DIR) {
    const { writeFile } = await import('node:fs/promises');
    let n = 0;
    setInterval(async () => {
      n++;
      for (const d of world.displays) {
        const win = overlays.windowFor(d.id);
        if (!win) continue;
        try {
          const probe = await win.webContents.executeJavaScript(
            `JSON.stringify([...document.querySelectorAll('.buddy')].map((el) => ({ id: el.dataset.id, src: el.querySelector('img').src, loaded: el.querySelector('img').complete && el.querySelector('img').naturalWidth > 0, bubble: el.querySelector('.bubble')?.textContent ?? null, transform: el.style.transform, pointer: document.getElementById('pointers').childElementCount })))`,
          );
          console.log(`[probe ${d.id}] ${probe}`);
          const img = await win.webContents.capturePage();
          await writeFile(join(CAPTURE_DIR, `overlay-${d.id}-${n}.png`), img.toPNG());
        } catch (err) {
          console.warn('capture failed:', (err as Error).message);
        }
      }
    }, 3000);
  }
});

app.on('second-instance', () => {
  world?.alert({ message: 'I am already running! Look for me in the menu bar.', target: 'here' });
});

app.on('window-all-closed', () => {
  // Keep running in the tray even if a window goes away.
});

app.on('before-quit', () => {
  tracker.stop();
  reminders.clear();
  overlays?.destroyAll();
});
