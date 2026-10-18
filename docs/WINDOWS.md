# Desktop Buddy on Windows

Windows 10 (1903+) and Windows 11 are supported. Everything works the same as on
macOS (overlay on every display, alerts, timers, buddy packs, the local API and
CLI). Only the OS-specific parts differ:

| Feature | macOS | Windows |
|---|---|---|
| Active window | `osascript` + System Events | persistent PowerShell probe (`GetForegroundWindow`, DWM frame bounds, per-monitor DPI) |
| Message announcements | Notification Center DB, Dock badge fallback | toast history in `wpndatabase.db` |
| Start at login | launchd agent | `DesktopBuddy.vbs` in the Startup folder |
| Menu | menu-bar icon | tray icon (left or right click opens the menu) |
| Logs | `~/Library/Logs/desktop-buddy.log` | `%APPDATA%\desktop-buddy\buddy.log` |

> **Status: written without access to a Windows machine.** The pure parts are unit-tested
> (`test/windows.test.mjs`) but the Win32, DPI and notification-database code is first
> verified on real Windows. Use the checklist below, and send the output of
> `buddy diagnose` plus `buddy.log` if anything misbehaves.

## Install and run (from source)

Prerequisites: [Node.js 22+](https://nodejs.org), Git, and on a fresh Windows install the
[Visual C++ Redistributable](https://aka.ms/vs/17/release/vc_redist.x64.exe)
(`winget install Microsoft.VCRedist.2015+.x64`). Without it `npm start` fails with
"Cannot find native binding" / "The specified module could not be found". On Proxmox set the
VM's CPU type to `host`. If the repository is private and `git clone` asks for a password,
sign in through the browser popup (Git Credential Manager) or use `gh auth login`.
In PowerShell:

```powershell
git clone https://github.com/ricktav/desktop-buddy.git
cd desktop-buddy
npm install
npm start
```

No permissions prompts are needed. If PowerShell blocks `npm` ("running scripts is
disabled"), run `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` once. The probe
is started with `-ExecutionPolicy Bypass` itself, so it is not affected.

A paw icon appears in the system tray (it may sit under the `^` overflow arrow; drag
it out to pin it). Open its menu for buddies, speed, timers and settings.

### The CLI

```powershell
node bin\buddy.js alert "Build done" --level success
node bin\buddy.js timer 25m Pomodoro
node bin\buddy.js diagnose
Get-Clipboard -Raw | node bin\buddy.js import -     # import a buddy bundle from the clipboard
npm link                                              # optional: gives you a global `buddy` command
```

### Background and start at login

```powershell
node bin\buddy.js service install     # writes DesktopBuddy.vbs to the Startup folder and starts it
node bin\buddy.js service status
node bin\buddy.js service restart
node bin\buddy.js service uninstall
```

Or tick **Start at login** in the tray menu. `buddy start` / `buddy stop` launch or
quit the app without touching the Startup entry. After a `git pull`, `npm run update`
rebuilds and restarts.

### Installer

```powershell
npm run dist:win        # release\Desktop Buddy Setup x.y.z.exe (NSIS) and a portable .exe
```

The installer is unsigned, so SmartScreen shows "Windows protected your PC": choose
*More info → Run anyway*.

## Message announcements (WhatsApp, Teams, ...)

Windows records toast notifications in
`%LOCALAPPDATA%\Microsoft\Windows\Notifications\wpndatabase.db`. The buddy reads new
rows from it (read-only, falling back to a private copy when the file is locked), keeps
only apps listed under `notifications.apps` in the config (`windowsIds` fragments, e.g.
`WhatsApp`), and says "Message from Alice: ...". No extra permission is required.

Requirements:

- The app must be allowed to show notifications (Settings → System → Notifications)
  and **Do not disturb / Focus assist must not suppress them**, or no toast is logged.
- Notification history is written for apps that show toasts; some apps only draw their
  own pop-ups and do not appear there.

## Proxmox test checklist

Create a Windows 10/11 VM (VirtIO disk and network drivers; 2 vCPU, 4 GB; a display
via SPICE or noVNC, not "none"). Install Node.js 22, Git and WhatsApp Desktop or any app
that shows toasts. Then:

1. `npm install && npm start`. **Expect:** the buddy appears at the bottom edge of the screen, standing on the taskbar's top edge, not cut off.
   - Invisible or black box? Set `$env:BUDDY_DISABLE_GPU=1` and start again (virtual GPUs). Report this.
2. Tray icon visible and the menu opens with a left and with a right click.
3. Open Notepad and move it around. **Expect:** the buddy walks to it and watches it. If not, run `node bin\buddy.js diagnose` and send the "Active window" section.
4. Resize the VM display (or add a second monitor), and set display scaling to 125 % / 150 % in Settings → Display. **Expect:** the buddy still stands at the bottom, and the watched window position matches Notepad's real position (DPI conversion).
5. Click the buddy (pet), double-click Biscuit/unicorn (trick), drag it and let go (fall). Hover and click-through: clicking the desktop *through* the empty parts of the overlay must still work.
6. `node bin\buddy.js alert "Hello" --level success` and `node bin\buddy.js timer 10s Test`.
7. Leave the machine untouched for the idle time. **Expect:** sit, then sleep. Move the mouse: it wakes.
8. Send yourself a WhatsApp message (or any toast from a watched app). **Expect:** the buddy announces it within a few seconds. Otherwise run `buddy diagnose` and send the "Notifications" section.
9. `buddy service install`, sign out and in. **Expect:** the buddy starts by itself with no console window. `buddy service uninstall` removes it.
10. `npm run dist:win` and run the installer or the portable exe.

### Known caveats

- The probe compiles a few lines of C# with `Add-Type` on first start, so the first window may be reported ~1 s after launch. Antivirus software may flag a long-running hidden `powershell.exe`; allow-list it if so.
- Fullscreen games and exclusive-fullscreen video can cover the overlay (it is an always-on-top window, not a driver hook).
- Elevated (administrator) windows can be foreground windows the probe still sees, but the buddy cannot be dragged over them with UIPI restrictions in some cases.
- Windows 10 N / LTSC editions without Windows PowerShell 5.1 are not supported.

## Troubleshooting

```powershell
node bin\buddy.js logs        # prints the log path and the last lines
node bin\buddy.js diagnose    # active-window probe + notification database checks
```

Log file: `%APPDATA%\desktop-buddy\buddy.log`. Config file: `%APPDATA%\desktop-buddy\config.json`.
