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
import { TimerManager, timerDoneMessage } from './timers';
import { NotificationService, announcement } from './notifications';
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
const timers = new TimerManager((t) => {
  console.log(`timer done: ${t.name}`);
  // Sticky bubble (until clicked) so the celebration cannot be missed.
  world.alert({ message: timerDoneMessage(t), level: 'warn', target: 'active', duration: 0, buddy: t.buddy, cheer: true });
  buildTray();
});
let notifications: NotificationService | null = null;

function startNotifications(): void {
  notifications?.stop();
  notifications = new NotificationService(cfg.notifications, (n) => {
    const text = announcement(n, cfg.notifications.showBody);
    console.log(`notification: ${text}`);
    world.alert({ message: text, level: 'info', target: 'here', duration: cfg.notifications.bubbleSeconds });
  });
  notifications.start();
}

function startTimerFromMenu(ms: number, name: string): void {
  const t = timers.start(ms, { name });
  world.alert({ message: `⏱ ${t.name}: ${timers.remainingLabel(t)} on the clock.`, target: 'here', duration: 4 });
  buildTray();
}

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
    // Nothing configured, or every configured pack failed to load: start with
    // the default dog so the app never launches with an empty screen.
    try {
      addBuddyFromEntry({ pack: 'lab-yellow' });
      if (!cfg.buddies.some((e) => e.pack === 'lab-yellow' && e.enabled !== false)) {
        cfg.buddies.push({ pack: 'lab-yellow', enabled: true });
        saveConfig(cfg);
      }
      console.log('no buddies configured; added the default dog');
    } catch (err) {
      console.error('no buddies could be loaded:', (err as Error).message);
    }
  }
  console.log(`buddies on screen: ${world.buddies.map((b) => b.id).join(', ') || '(none)'}`);
}

/** Remove one buddy from the screen and from the saved config. */
function removeBuddyAndSave(id: string): boolean {
  const b = world.findBuddy(id);
  if (!b) return false;
  world.removeBuddy(b.id);
  const i = cfg.buddies.findIndex((e) => e.enabled !== false && e.pack === b.pack);
  if (i >= 0) cfg.buddies.splice(i, 1);
  saveConfig(cfg);
  buildTray();
  return true;
}

/** Tick or untick a pack in the Buddies menu. */
function setPackEnabled(ref: string, enabled: boolean): void {
  console.log(`${enabled ? 'enable' : 'disable'} pack ${ref}`);
  if (enabled) {
    try {
      const id = addBuddyFromEntry({ pack: ref });
      cfg.buddies.push({ pack: ref, enabled: true });
      const b = world.findBuddy(id);
      console.log(`added ${id} at ${b?.x.toFixed(0)},${b?.y.toFixed(0)} on display ${b?.displayId}`);
    } catch (err) {
      console.error('could not add buddy:', (err as Error).message);
      dialog.showErrorBox('Could not load buddy', (err as Error).message);
    }
  } else {
    for (const b of world.buddies.filter((x) => x.pack === ref)) world.removeBuddy(b.id);
    cfg.buddies = cfg.buddies.filter((e) => e.pack !== ref);
  }
  saveConfig(cfg);
  buildTray();
}

async function reloadConfig(): Promise<void> {
  cfg = loadConfig();
  world.setConfig(simConfig(cfg));
  loadBuddies();
  reminders.load(cfg.reminders);
  tracker.start(cfg.activeWindowPoll);
  startNotifications();
  buildTray();
}

function sendAlert(req: AlertRequest) {
  const b = world.alert(req);
  return b ? ({ ok: true, buddy: b.id } as const) : ({ ok: false, error: `buddy "${req.buddy}" not found` } as const);
}

function buildMenu(forBuddyId?: string): Menu {
  const available = listAvailablePacks();
  const activePacks = new Set(world.buddies.map((b) => b.pack));
  // One checkbox per pack: ticked packs are on screen. Untick to remove.
  const packItems = available.map((p) => ({
    label: `${p.name}  (${p.ref})`,
    type: 'checkbox' as const,
    checked: activePacks.has(p.ref),
    click: () => setPackEnabled(p.ref, !activePacks.has(p.ref)),
  }));
  const actionItems = world.buddies.map((b) => ({
    label: b.name,
    submenu: [
      { label: 'Pet', click: () => b.pet(Date.now()) },
      { label: 'Dismiss bubble', click: () => b.dismissBubble() },
      { label: 'Say hello here', click: () => world.alert({ message: 'I am right here.', target: 'here', buddy: b.id }) },
      { type: 'separator' as const },
      { label: `Remove ${b.name}`, click: () => removeBuddyAndSave(b.id) },
    ],
  }));
  const forBuddy = forBuddyId ? world.findBuddy(forBuddyId) : null;
  const running = timers.list();
  const timerItems = [
    ...running.map((t) => ({
      label: `⏱ ${t.name} — ${timers.remainingLabel(t)} left`,
      submenu: [{ label: 'Cancel', click: () => { timers.cancel(t.id); buildTray(); } }],
    })),
    ...(running.length ? [{ type: 'separator' as const }] : []),
    ...[1, 5, 10, 15, 25, 45, 60].map((m) => ({ label: `Start ${m} min timer`, click: () => startTimerFromMenu(m * 60_000, `${m} min timer`) })),
    { type: 'separator' as const },
    { label: 'Pomodoro (25 min)', click: () => startTimerFromMenu(25 * 60_000, 'Pomodoro') },
    { label: 'Custom… (use: buddy timer 12m Name)', enabled: false },
  ];
  const nstat = notifications?.status();
  const notifItems = [
    {
      label: 'Announce notifications',
      type: 'checkbox' as const,
      checked: cfg.notifications.enabled,
      click: () => { cfg.notifications.enabled = !cfg.notifications.enabled; saveConfig(cfg); startNotifications(); buildTray(); },
    },
    {
      label: 'Show message preview',
      type: 'checkbox' as const,
      checked: cfg.notifications.showBody,
      click: () => { cfg.notifications.showBody = !cfg.notifications.showBody; saveConfig(cfg); buildTray(); },
    },
    { type: 'separator' as const },
    { label: `Notification Center: ${nstat?.notificationCenter ? 'reading' : 'unavailable (needs Full Disk Access)'}`, enabled: false },
    { label: `Dock badges: ${nstat?.dockBadge ? 'watching ' + cfg.notifications.badgeApps.join(', ') : 'unavailable'}`, enabled: false },
    { label: `Apps: ${cfg.notifications.apps.map((a) => a.label).join(', ') || '(none, edit config)'}`, enabled: false },
  ];
  return Menu.buildFromTemplate([
    ...(forBuddy
      ? [
          { label: `Pet ${forBuddy.name}`, click: () => forBuddy.pet(Date.now()) },
          ...(forBuddy.manifest.doubleClick ? [{ label: 'Do a trick', click: () => forBuddy.trick(Date.now()) }] : []),
          { label: 'Dismiss bubble', click: () => forBuddy.dismissBubble() },
          { label: `Remove ${forBuddy.name}`, click: () => removeBuddyAndSave(forBuddy.id) },
          { type: 'separator' as const },
        ]
      : []),
    { label: 'Buddies', submenu: packItems.length ? packItems : [{ label: '(no packs found)', enabled: false }] },
    { label: 'Buddy actions', submenu: actionItems.length ? actionItems : [{ label: '(none on screen)', enabled: false }] },
    {
      label: 'Remove all buddies',
      enabled: world.buddies.length > 0,
      click: () => {
        for (const b of [...world.buddies]) world.removeBuddy(b.id);
        cfg.buddies = [];
        saveConfig(cfg);
        buildTray();
      },
    },
    {
      label: 'Reset to default buddy',
      click: () => {
        for (const b of [...world.buddies]) world.removeBuddy(b.id);
        cfg.buddies = [{ pack: 'lab-yellow', enabled: true }];
        saveConfig(cfg);
        loadBuddies();
        world.setDisplays(allDisplays());
        overlays.sync();
        buildTray();
      },
    },
    { label: 'Install buddy folder…', click: () => void installBuddyFolder() },
    { type: 'separator' },
    { label: running.length ? `Timers (${running.length} running)` : 'Timers', submenu: timerItems },
    { label: 'Notifications', submenu: notifItems },
    { type: 'separator' },
    { label: 'Test alert', click: () => world.alert({ message: 'This is a test alert. Everything works!', level: 'warn' }) },
    {
      label: 'Test guide (point at mouse)',
      click: () => world.alert({ message: 'Look here!', target: 'mouse', duration: 8 }),
    },
    { label: 'Test cheer', click: () => world.alert({ message: '🎉 Hooray! (test)', level: 'warn', target: 'active', duration: 0, cheer: true }) },
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
  ipcMain.on('trick', (_e, id: string) => world.findBuddy(id)?.trick(Date.now()));
  ipcMain.on('dismiss', (_e, id: string) => world.findBuddy(id)?.dismissBubble());
  ipcMain.on('context-menu', (e, id: string) => {
    const win = BrowserWindow.fromWebContents(e.sender) ?? undefined;
    buildMenu(id).popup({ window: win });
  });
}

function tick(): void {
  if (world.displays.length === 0) world.setDisplays(allDisplays());
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
  startNotifications();
  wireIpc();
  buildTray();
  // Keep the timer countdowns in the tray menu fresh.
  setInterval(() => { if (timers.list().length) buildTray(); }, 15_000);

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
      removeBuddy: (id) => ({ ok: removeBuddyAndSave(id) }),
      reload: reloadConfig,
      startTimer: (ms, name, buddy) => {
        const t = timers.start(ms, { name, buddy });
        world.alert({ message: `⏱ ${t.name}: ${timers.remainingLabel(t)} on the clock.`, target: 'here', duration: 4, buddy });
        buildTray();
        return t;
      },
      listTimers: () => timers.list().map((t) => ({ ...t, remaining: timers.remainingLabel(t) })),
      cancelTimer: (id) => {
        const ok = timers.cancel(id);
        if (ok) buildTray();
        return ok;
      },
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
  timers.cancelAll();
  notifications?.stop();
  overlays?.destroyAll();
});
