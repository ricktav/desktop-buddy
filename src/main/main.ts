import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, powerMonitor, screen, shell, systemPreferences, Tray } from 'electron';
import { cpSync, existsSync } from 'node:fs';
import { basename, join } from 'node:path';
import { SPEED_PRESETS, type AlertRequest, type AppConfig } from '../shared/types';
import { World } from '../sim/world';
import { ActiveWindowTracker } from './activeWindow';
import { startApi } from './api';
import { configPath, loadConfig, saveConfig, userBuddiesDir } from './config';
import { bundledBuddiesDir, installPackProtocol, listAvailablePacks, loadedPackManifests, loadPack, registerPackScheme } from './packs';
import { ReminderScheduler } from './reminders';
import { installFileLog } from './logfile';
import { installStartup, isStartupInstalled, removeStartup } from './startup';
import { formatReport, importBundleText } from './bundle';
import { TimerManager, timerDoneMessage } from './timers';
import { NotificationService, announcement, launchContext, appDisplayName, type LaunchContext } from './notifications';
import { allDisplays, OverlayWindows } from './windows';

// Windows and Linux launches have no terminal, so keep a log file next to the config.
const LOG_FILE = installFileLog(app.getPath('userData'));
// Virtual machines (for example Proxmox without GPU passthrough) may need software rendering.
if (process.argv.includes('--disable-gpu') || process.env.BUDDY_DISABLE_GPU === '1') app.disableHardwareAcceleration();

const DEV = process.argv.includes('--dev');
/** `--capture=DIR` writes a PNG of every overlay window to DIR every 3 s (debugging aid). */
const CAPTURE_DIR = process.argv.find((a) => a.startsWith('--capture='))?.slice('--capture='.length) ?? null;
const TICK_MS = 1000 / 30;

registerPackScheme();

if (!app.requestSingleInstanceLock()) {
  console.error(
    'Desktop Buddy is already running (probably the background service or another npm start).\n' +
      'The running copy was asked to show a notice. To load a new build into it, choose "Restart Desktop Buddy" from the menu-bar paw,\n' +
      'or run: node bin/buddy.js service restart',
  );
  app.quit();
}

/** Build stamp shown in the menu so you can tell which build is running. */
const BUILD_STAMP = (() => {
  try {
    const { statSync } = require('node:fs') as typeof import('node:fs');
    return statSync(__filename).mtime.toLocaleString();
  } catch {
    return 'unknown';
  }
})();

let cfg: AppConfig;
let world: World;
let overlays: OverlayWindows;
let tray: Tray | null = null;
let draggingId: string | null = null;
let buddySeq = 0;
const tracker = new ActiveWindowTracker(['Electron', 'Desktop Buddy'], {
  scriptDir: join(app.getPath('userData'), 'probe'),
  // The Windows probe reports physical pixels; Electron works in DIPs.
  toDipRect: process.platform === 'win32' ? (r) => screen.screenToDipRect(null, r) : undefined,
});
const reminders = new ReminderScheduler((req) => world.alert(req));
const timers = new TimerManager((t) => {
  console.log(`timer done: ${t.name}`);
  // Sticky bubble (until clicked) so the celebration cannot be missed.
  world.alert({ message: timerDoneMessage(t), level: 'warn', target: 'active', duration: 0, buddy: t.buddy, cheer: true });
  buildTray();
});
let notifications: NotificationService | null = null;
let launchCtx: LaunchContext | null = null;

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
  return { idleSitAfter: c.idleSitAfter, idleSleepAfter: c.idleSleepAfter, walkSpeed: c.walkSpeed, bubbleSeconds: c.bubbleSeconds, speedFactor: c.speedFactor };
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

function setGlobalSpeed(factor: number): void {
  cfg.speedFactor = factor;
  saveConfig(cfg);
  world.setConfig(simConfig(cfg));
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
  const speedItems = [
    ...Object.entries(SPEED_PRESETS).map(([name, f]) => ({
      label: `${name[0].toUpperCase()}${name.slice(1)} (${f}×)`,
      type: 'radio' as const,
      checked: Math.abs((cfg.speedFactor ?? 1) - f) < 0.01,
      click: () => setGlobalSpeed(f),
    })),
    { type: 'separator' as const },
    { label: 'Run for 30 seconds (4×)', click: () => { world.boostSpeed(4, 30); buildTray(); } },
    { label: 'Stop boosts', click: () => { world.boostSpeed(1, null); buildTray(); } },
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
    ...(process.platform === 'win32'
      ? [
          { label: `Windows notifications: ${nstat?.notificationCenter ? 'reading' : 'unavailable (run: buddy diagnose)'}`, enabled: false },
          { label: 'Open Windows notification settings…', click: () => void shell.openExternal('ms-settings:notifications') },
        ]
      : [
          { label: `Notification Center: ${nstat?.notificationCenter ? 'reading' : 'unavailable (needs Full Disk Access)'}`, enabled: false },
          ...(nstat?.notificationCenter || process.platform !== 'darwin'
            ? []
            : [
                {
                  label: launchCtx?.responsibleApp
                    ? `Started from ${appDisplayName(launchCtx.responsibleApp)}: grant Full Disk Access to that app (or use the service)`
                    : 'Running as a service: grant Full Disk Access to Electron.app',
                  enabled: false,
                },
                {
                  label: 'Open Full Disk Access settings…',
                  click: () => void shell.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles'),
                },
                {
                  label: `Reveal the app to add there (${appDisplayName(launchCtx?.grantTo ?? appBundlePath())})…`,
                  click: () => shell.showItemInFolder(launchCtx?.grantTo ?? appBundlePath()),
                },
              ]),
          ...(process.platform === 'darwin'
            ? [{ label: `Dock badges: ${nstat?.dockBadge ? 'watching ' + cfg.notifications.badgeApps.join(', ') : 'unavailable'}`, enabled: false }]
            : []),
        ]),
    { label: `Apps: ${cfg.notifications.apps.map((a) => a.label).join(', ') || '(none, edit config)'}`, enabled: false },
  ];
  return Menu.buildFromTemplate([
    { label: `Desktop Buddy v${app.getVersion()} — built ${BUILD_STAMP}`, enabled: false },
    { type: 'separator' },
    ...(forBuddy
      ? [
          { label: `Pet ${forBuddy.name}`, click: () => forBuddy.pet(Date.now()) },
          ...(forBuddy.manifest.doubleClick ? [{ label: 'Do a trick', click: () => forBuddy.trick(Date.now()) }] : []),
          { label: 'Dismiss bubble', click: () => forBuddy.dismissBubble() },
          { label: `Run fast for 30 s`, click: () => { world.boostSpeed(3, 30, forBuddy.id); } },
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
    { label: 'Import buddy from clipboard (AI-made JSON)…', click: () => void importFromClipboard() },
    { type: 'separator' },
    { label: 'Movement speed', submenu: speedItems },
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
    ...(process.platform === 'win32'
      ? [{
          label: 'Start at login',
          type: 'checkbox' as const,
          checked: isStartupInstalled(),
          click: () => {
            if (isStartupInstalled()) removeStartup();
            else installStartup(process.execPath, app.isPackaged ? null : app.getAppPath());
            buildTray();
          },
        }]
      : []),
    { label: 'Open config file', click: () => void shell.openPath(configPath()) },
    { label: 'Open log file', click: () => void shell.openPath(LOG_FILE) },
    { label: 'Open buddies folder', click: () => void shell.openPath(userBuddiesDir()) },
    { label: 'Reload config', click: () => void reloadConfig() },
    { type: 'separator' },
    { label: `API: http://127.0.0.1:${cfg.api.port}${cfg.api.enabled ? '' : ' (disabled)'}`, enabled: false },
    {
      label: 'Restart Desktop Buddy (load new build)',
      click: () => {
        app.relaunch();
        app.exit(0);
      },
    },
    { label: 'Quit Desktop Buddy', click: () => app.quit() },
  ]);
}

/** Install a buddy from AI-written JSON on the clipboard and put it on screen. */
async function importFromClipboard(): Promise<void> {
  const text = await clipboard.readText();
  if (!text.trim()) {
    dialog.showMessageBoxSync({ type: 'info', message: 'The clipboard is empty', detail: 'Copy the JSON the AI wrote (the whole code block), then choose this again.' });
    return;
  }
  const res = importBundleText(text, { destRoot: userBuddiesDir(), bundledDir: bundledBuddiesDir(), autoSuffix: true });
  if (!res.ok || !res.id) {
    dialog.showMessageBoxSync({
      type: 'error',
      message: 'Could not import this buddy',
      detail: `${formatReport(res.report)}\n\nCopy this list back to the AI and ask it to fix the JSON.`,
    });
    return;
  }
  try {
    const id = addBuddyFromEntry({ pack: res.id });
    cfg.buddies.push({ pack: res.id, enabled: true });
    saveConfig(cfg);
    buildTray();
    const b = world.findBuddy(id);
    world.alert({ message: `Hi! I'm ${b?.name ?? res.id}. Nice to meet you!`, target: 'here', duration: 6, buddy: id, cheer: true });
  } catch (err) {
    dialog.showErrorBox('Imported, but could not load', (err as Error).message);
  }
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

/** The .app bundle that runs us (for granting macOS permissions). */
function appBundlePath(): string {
  const i = process.execPath.indexOf('.app/');
  return i >= 0 ? process.execPath.slice(0, i + 4) : process.execPath;
}

function trayIcon() {
  if (process.platform === 'darwin') {
    const p = join(__dirname, '..', 'assets', 'trayTemplate.png');
    const img = existsSync(p) ? nativeImage.createFromPath(p) : nativeImage.createEmpty();
    img.setTemplateImage(true);
    return img;
  }
  // Windows and Linux trays are not monochrome-aware: use the coloured paw (tray@2x.png is picked up automatically).
  const p = join(__dirname, '..', 'assets', 'tray.png');
  return existsSync(p) ? nativeImage.createFromPath(p) : nativeImage.createEmpty();
}

function buildTray(): void {
  if (!tray) {
    tray = new Tray(trayIcon());
    tray.setToolTip('Desktop Buddy');
    // Windows shows the menu on right-click only; make a left click open it too.
    if (process.platform === 'win32') tray.on('click', () => tray?.popUpContextMenu());
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

  console.log(`Desktop Buddy ${app.getVersion()} on ${process.platform} ${process.arch}, Electron ${process.versions.electron}; log: ${LOG_FILE}`);
  launchCtx = await launchContext();
  console.log(
    launchCtx.viaLaunchd
      ? 'launched by launchd (background service); permissions apply to Electron.app'
      : launchCtx.responsibleApp
        ? `launched from ${appDisplayName(launchCtx.responsibleApp)}; macOS permissions (Full Disk Access, Accessibility) must be granted to that app`
        : 'launched from a shell',
  );
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
      restart: () => setTimeout(() => { app.relaunch(); app.exit(0); }, 200),
      quit: () => setTimeout(() => app.quit(), 200),
      setSpeed: ({ factor, seconds, buddy }) => {
        if (buddy || seconds) {
          const n = world.boostSpeed(factor, seconds ?? null, buddy);
          if (buddy && n === 0) return { ok: false, error: `buddy "${buddy}" not found` };
          buildTray();
          return { ok: true, scope: buddy ? 'buddy' : 'temporary', affected: n };
        }
        setGlobalSpeed(factor);
        return { ok: true, scope: 'global', affected: world.buddies.length };
      },
      getSpeed: () => ({ global: cfg.speedFactor ?? 1, boosts: world.speedBoosts() }),
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
  world?.alert({
    message: 'I am already running (this copy was started earlier). To load a new build, pick "Restart Desktop Buddy" from the paw menu.',
    target: 'here',
    duration: 15,
    level: 'warn',
  });
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
