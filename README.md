# Desktop Buddy

A chibi Labrador that lives along the bottom of your screens. It wanders,
walks over to whatever window you are working in and watches it, sits down
when you go idle, falls asleep if you stay away, and delivers alerts and
on-screen guidance from your scripts, tools and timed reminders.

Built with Electron + TypeScript for macOS and Windows ([Windows guide](docs/WINDOWS.md)). Twenty buddies ship in the box,
and you can have any AI design more for you (see
[Make your own buddy with an AI](docs/CREATE-A-BUDDY.md)).

| Pack | Name | Style |
|---|---|---|
| `lab-yellow` | Biscuit | Chibi yellow Labrador (default) |
| `lab-chocolate` | Mocha | Chibi chocolate Labrador |
| `lab-black` | Pepper | Chibi black Labrador |
| `robot-pixel` | Bolt | 32×32 pixel-art robot with a blinking antenna |
| `unicorn` | Aurora | Shaded, naturalistic unicorn with a flowing mane and glowing horn |
| `rainbow-man` | Roy G. | Chibi man with rainbow hair and a striped suit who throws rainbows when excited |
| `lab-doctor` | Dr. Vee | Chibi lab doctor in a white coat over scrubs, stethoscope and clipboard, blond bob with red tips |
| `skeleton` | Rattles | Chibi skeleton with glowing eye sockets and a ribcage; a bat shows up on alerts |
| `pumpkin` | Jack | Halloween jack-o'-lantern on vine legs with a flickering candle that flares when alerting |
| `duckling` | Pip | Natural, downy duckling with soft shading and brown markings; hops and flaps on double-click |
| `rubber-duck` | Squeaky | Glossy yellow rubber bath duck floating on a puddle; double-click squeezes it for a SQUEAK |
| `dr-josie` | Dr. Josie | Chibi scientist with long wavy golden hair, violet eyes, white lab coat and a red shield emblem; test tube, glasses, trophy and a virus under a glass dome; superhero hop on double-click |
| `dna` | Helix | Chibi DNA double helix in glossy purple and pink: a round head, a body that really twists around base-pair rungs, tendril arms and legs; double-click and it unzips and replicates |
| `dna-strand` | Strand | The headless DNA: just the twisting purple and pink helix with its face drawn on the strands; double-click and it unzips into RNA |
| `peacock` | Plume | Chibi peacock with a shimmering blue body and a trailing train of eye-spot feathers that fans out when it is excited |
| `toddler-trike` | Tilly | Cartoon toddler girl with pigtails and bows pedalling a pink tricycle (her legs follow the pedals); rings her bell on alerts and pops a wheelie on double-click |
| `bailey` | Bailey | Photo-realistic curly grey-and-white dog with a collar; trots, and breaks into a run when sent somewhere in a hurry |
| `bailey2` | Bailey 2 | Bailey with a rigged walk and run (the legs swing, the body stays steady) and a jump when double-clicked; rebuild with `node scripts/gen-bailey2.mjs` |
| `sloth` | Slowpoke | Three-toed sloth that hangs from the **top** edge of the screen and crawls hand over hand, very slowly; dropped, it climbs back up; double-click for a slow wave and a yawn |
| `capybara` | Capy | Calm capybara with a blunt snout; double-click and it relaxes with a yuzu on its head and rising steam |

**Choosing buddies.** Click the paw in the menu bar and open *Buddies*: each
pack is a checkbox. Tick one to put it on screen, untick it to remove it.
Several can be on screen at once, and *Remove all buddies* clears the
screen. Right-clicking a buddy also offers *Remove*. If you ever end up
with nobody on screen, tick a pack again, use *Reset to default buddy*, or
simply relaunch: the app always starts with at least Biscuit. From a terminal:
`buddy add unicorn`, `buddy remove <id>` (ids are listed by `buddy buddies`).
Your selection is saved to the config file.

## Quick start

```bash
npm install
npm start          # builds and launches; the buddy appears, a paw icon lands in the menu bar
```

**Windows:** see [docs/WINDOWS.md](docs/WINDOWS.md) (no permissions needed; includes a test checklist).

First launch on macOS asks for two permissions. Both are needed so the
buddy can see which window is in front:

1. **Accessibility**: System Settings → Privacy & Security → Accessibility → enable *Electron* (or *Desktop Buddy* once packaged).
2. **Automation → System Events**: macOS prompts for this the first time the buddy looks up the frontmost window.

Without them the buddy still works; it just will not walk toward your active window.

To build a `.app`/`.dmg`:

```bash
npm run dist       # output in release/
```

### Run in the background and start at login

```bash
npm run build
node bin/buddy.js service install     # or `buddy service install` after `npm link`
```

This registers a launchd user agent that starts Desktop Buddy at login with
no terminal window and restarts it if it crashes. `buddy service status`,
`buddy service restart` and `buddy service uninstall` manage it. Logs go to
`~/Library/Logs/desktop-buddy.log`. Alternatively build the `.app` with
`npm run dist` and add it to *System Settings → General → Login Items*.

**Updating.** Only one Desktop Buddy runs at a time. While the service is
running, `npm start` builds and then quits, and you keep seeing the old
build. After a `git pull`, run

```bash
npm run update     # pull, install, build, restart the service
```

or pick *Restart Desktop Buddy (load new build)* from the paw menu. The
first line of the menu shows the version and build time of the running
copy, so you can tell at a glance.

## What the buddy does

| Situation | Behaviour |
|---|---|
| Nothing special | Wanders along the bottom of the screen (the top of the Dock), pauses, occasionally sits. Crosses onto other monitors. |
| You switch windows | Walks slowly to stand beneath the new window and looks up at it for a while. |
| Idle 90 s (configurable) | Sits down. |
| Idle 5 min (configurable) | Lies down and sleeps. Any mouse or keyboard activity wakes it. |
| Alert arrives | Runs to the active window (or wherever you asked), perks its ears and shows a speech bubble. |
| Guide arrives | Runs to the spot, floats up, points at it with a pulsing marker and a bubble, then hops back down. |
| Reminder fires | Same as an alert, with the message you configured. |
| You click it | Happy wiggle. Click a bubble to dismiss it. |
| A timer finishes | The buddy runs to your active window, bounces, throws confetti and holds a bubble until you click it. |
| A WhatsApp message arrives | The buddy announces "WhatsApp message from …" with a short preview (see *Notifications*). |
| You double-click it | Packs can define a trick. Aurora the unicorn rears up and spells L I L Y along a rainbow; Jack the pumpkin leaps into a spin, shouts BOO! and bats circle him. |
| Too many on screen | Untick packs under *Buddies* in the menu, or right-click a buddy and choose *Remove*. |
| You drag it | Dangles from the cursor; drops back to the floor of whichever screen you release it on. |
| Right-click / menu bar paw | Menu: pet, dismiss, tick or untick buddies, test alert, open config, quit. |

The overlay windows are click-through everywhere except on the buddy itself,
so it never gets in the way of what is underneath.

## Sending alerts and guidance

The app runs a local HTTP API on `127.0.0.1:47821` (configurable). Use the
bundled CLI or plain HTTP from any script, build tool, cron job or AI agent.

```bash
# CLI (node bin/buddy.js, or `npm link` to get a global `buddy` command)
buddy alert "Build failed" --level error          # runs to your active window
buddy alert "Deploy done" --target here            # speaks where it stands
buddy alert "Look at this" --target mouse          # points at the cursor
buddy guide 640 320 "Click the Save button"        # walks to a screen point and points at it
buddy say "Stand-up in 5 minutes" --duration 0     # sticky bubble until clicked
buddy state                                        # positions, moods, active window, idle time
buddy buddies                                      # active buddies and installable packs
buddy add lab-black                                # add a second buddy
buddy import examples/ghost.buddy.json             # install an AI-made buddy (file, folder, or - for stdin)
buddy validate my-buddy.json                       # check an AI-made buddy and list problems
buddy remove lab-black-2
buddy reload                                       # re-read config.json
```

```bash
# Raw HTTP
curl -X POST localhost:47821/alert -H 'content-type: application/json' \
     -d '{"message":"Tests passed","level":"info","target":"active","duration":10}'
curl -X POST localhost:47821/guide -d '{"message":"Here","x":640,"y":320}'
```

| Route | Body | Notes |
|---|---|---|
| `POST /alert` | `message`, `level` (`info`/`warn`/`error`), `target` (`active`/`here`/`mouse`/`{x,y}`), `duration` seconds (0 = sticky), `buddy` name or id | Default target is the active window |
| `POST /say` | `message`, `duration`, `buddy` | Bubble without moving |
| `POST /guide` | `message`, `x`, `y`, `duration`, `buddy` | Global screen coordinates (points, origin top-left of the main display) |
| `GET /state` | | Full snapshot |
| `GET /buddies` | | Active and available packs |
| `POST /buddies` | `pack` | Add a buddy from a pack name or absolute folder path |
| `DELETE /buddies/:id` | | Remove a buddy |
| `POST /reload` | | Reload config |

Set `api.token` in the config to require an `x-buddy-token` header (the CLI
reads `BUDDY_TOKEN`). The server only listens on localhost.

## Moving faster

Buddies stroll at a relaxed pace by default. Ask for more speed whenever you like:

```bash
buddy speed                      # show the current speed and any boosts
buddy speed fast                 # everyone, saved: slow (0.5×), normal, fast (2×), turbo (4×) or a number such as 2.5
buddy speed turbo --for 30       # everyone, for 30 seconds, then back to the saved speed
buddy speed 3 --buddy Jack       # only Jack, until you change it
buddy speed normal --buddy Jack  # clear Jack's boost

buddy alert "Build failed" --hurry    # the buddy runs to you (3×) for this one alert
buddy guide 640 320 "Click here" --speed 5
```

In the menu-bar paw, *Movement speed* has the four presets (the choice is
saved in `speedFactor` in the config), *Run for 30 seconds* and *Stop
boosts*. Right-click a buddy for *Run fast for 30 s* for just that one. Over
HTTP: `POST /speed {"factor":"fast","seconds":30,"buddy":"Jack"}` (seconds and
buddy are optional) and `GET /speed`; alerts accept `"hurry": true` or
`"speed": 5`. Legs animate faster as the buddy speeds up. The allowed range
is 0.25× to 8×.

## Timers

Start a countdown and the buddy celebrates when it ends: it runs to your
active window, does its trick or happy dance with confetti, and keeps a
bubble up until you click it, so you cannot miss it.

```bash
buddy timer 25m Pomodoro            # 25 minutes
buddy timer 1h30m Laundry
buddy timer 90s Eggs --buddy Jack   # pick who cheers
buddy timers                        # running timers with time left
buddy cancel t3
```

The menu-bar paw has a *Timers* submenu with presets and the running
countdowns (each with *Cancel*). Over HTTP: `POST /timer` with
`{"duration":"25m","name":"Pomodoro"}` (or `minutes` / `seconds`),
`GET /timers`, `DELETE /timers/:id`.

## Notifications (WhatsApp and other apps)

The buddy can announce incoming messages. Two sources are used on macOS:

1. **Notification Center** gives the sender and a preview. The buddy reads
   macOS's notification database, which needs **Full Disk Access** for the
   process that runs the buddy. In the paw menu open *Notifications → Open
   Full Disk Access settings…*, click **+**, and add the app that
   *Reveal the app to add there* shows in Finder (`Electron.app` inside the
   project's `node_modules` when running as a service; *Terminal* or iTerm
   when you use `npm start`). Press Cmd+Shift+G in the file dialog to paste
   a path. No restart is needed: the buddy retries every minute and logs
   when it starts reading. WhatsApp must be allowed to post notifications
   (its own setting and macOS's). Only apps listed in the config are read;
   nothing else is looked at or stored. Note that `buddy diagnose` runs from
   Terminal, so it needs Terminal to have Full Disk Access too.
2. **Dock badge** fallback: when Full Disk Access is missing, the buddy
   watches the unread badge on the WhatsApp Dock icon (Accessibility
   permission, already granted for window tracking) and says
   "New WhatsApp message" or "3 unread messages" when it grows.

The *Notifications* submenu in the menu bar toggles announcements and the
message preview, and shows which source is active. If nothing is announced,
run `buddy diagnose`: it checks the database access, lists which apps have
posted notifications and under which bundle id, parses the latest WhatsApp
record, and reads the Dock badge, reporting the first broken step. Config:

```jsonc
"notifications": {
  "enabled": true,
  "apps": [{ "bundleId": "net.whatsapp.WhatsApp", "label": "WhatsApp" }],
  "showBody": true,          // false = sender only
  "badgeApps": ["WhatsApp"], // Dock icon names to watch as fallback
  "pollSeconds": 3,
  "bubbleSeconds": 20
}
```

Add more apps with their bundle identifier (for an app in /Applications:
`osascript -e 'id of app "Slack"'`) and Dock name.

## Configuration

`~/Library/Application Support/desktop-buddy/config.json` (open it from the
menu bar: *Open config file*; apply with *Reload config* or `buddy reload`).

```jsonc
{
  "buddies": [
    { "pack": "lab-yellow", "enabled": true },
    { "pack": "lab-black", "name": "Pepper", "scale": 0.8 }
  ],
  "idleSitAfter": 90,          // seconds idle before sitting
  "idleSleepAfter": 300,       // seconds idle before sleeping
  "walkSpeed": 60,             // points per second at normal speed
  "speedFactor": 1,            // movement multiplier: 0.5 slow, 1 normal, 2 fast, 4 turbo
  "activeWindowPoll": 1.5,     // seconds between frontmost-window checks
  "bubbleSeconds": 12,         // default bubble lifetime
  "api": { "enabled": true, "port": 47821, "token": "" },
  "notifications": { "enabled": true, "apps": [...], "showBody": true, "badgeApps": ["WhatsApp"], "pollSeconds": 3, "bubbleSeconds": 20 },
  "reminders": [
    { "message": "Time to stretch!", "every": "45m", "target": "here" },
    { "message": "Stand-up", "at": "09:55", "days": [1, 2, 3, 4, 5], "level": "warn" }
  ]
}
```

Reminders accept `every` (`90s`, `45m`, `2h`) or `at` (`HH:MM`, optional
`days` with 0 = Sunday), plus the same `level` and `target` fields as alerts.

## Photo-realistic buddies

Buddies can also be made of real or AI-generated pictures. [docs/PHOTO-BUDDY.md](docs/PHOTO-BUDDY.md)
has a brief you can hand to an image- or video-generation tool and
`node scripts/photo-pack.mjs` turns the pictures into a pack (background
removal, scaling, feet alignment, manifest, validation).

## Adding your own buddy

**With an AI:** copy the prompt in [docs/LLM-PROMPT.md](docs/LLM-PROMPT.md)
into any chat AI, describe your character, copy its JSON answer and choose
*Import buddy from clipboard* in the paw menu (or
`pbpaste | node bin/buddy.js import -`). The full walkthrough, a ready-made
"fix it" message, and a working example (`examples/ghost.buddy.json`) are in
[docs/CREATE-A-BUDDY.md](docs/CREATE-A-BUDDY.md).

**By hand:**

A buddy is a folder containing `buddy.json` and its frame images (SVG or
PNG). Put it in `~/Library/Application Support/desktop-buddy/buddies/`,
use *Install buddy folder…* from the menu, or `buddy add /path/to/folder`.

```
my-cat/
  buddy.json
  idle-0.svg  idle-1.svg
  walk-0.png  walk-1.png  walk-2.png  walk-3.png
  sit-0.png   sleep-0.png ...
```

```json
{
  "name": "Mittens",
  "frameWidth": 128,
  "frameHeight": 128,
  "scale": 1,
  "facing": "right",
  "feetOffset": 6,
  "petLines": ["Mrrp", "*purrs*"],
  "animations": {
    "idle":  { "frames": ["idle-0.svg", "idle-1.svg"], "fps": 2 },
    "walk":  { "frames": ["walk-0.png", "walk-1.png", "walk-2.png", "walk-3.png"], "fps": 8 },
    "sit":   { "frames": ["sit-0.png"], "fps": 1 },
    "sleep": { "frames": ["sleep-0.png", "sleep-1.png"], "fps": 1 },
    "watch": { "frames": ["watch-0.png"], "fps": 1 },
    "point": { "frames": ["point-0.png"], "fps": 1 },
    "alert": { "frames": ["alert-0.png", "alert-1.png"], "fps": 4 },
    "happy": { "frames": ["happy-0.png"], "fps": 4 },
    "drag":  { "frames": ["drag-0.png"], "fps": 1 }
  }
}
```

Only `idle` and `walk` are required; any missing animation falls back to
`idle`. Artwork should face the direction given by `facing`; the app mirrors
it for the other direction. `feetOffset` is the gap in pixels between the
bottom of the frame and the character's feet.

Set `"pixelArt": true` in the manifest to scale PNG frames with
nearest-neighbour sampling so pixels stay crisp.

A pack can react to a double-click with a trick:

```json
"doubleClick": {
  "animation": "rear",
  "seconds": 4,
  "say": "Woohoo!",
  "effect": { "type": "arc-letters", "text": "LILY" }
}
```

`animation` names any animation in the pack (falls back to `happy`), `say`
is an optional bubble, and `effect` is one of:

- `{ "type": "arc-letters", "text": "LILY" }` draws a rainbow over the buddy with the letters spaced along it in rainbow colours.
- `{ "type": "bats", "count": 5 }` sends a flock of flapping bats circling the buddy.

The trick is also in the right-click menu as *Do a trick*.

The bundled buddies are generated by the `scripts/gen-*-sprites.mjs`
scripts (`npm run sprites` regenerates them all). Edit colours or poses
there, or add a new coat to the Labrador `COATS` table to get a new dog. The
unicorn is vector art; to use photographic frames instead, replace the SVGs
in `buddies/unicorn/` with PNGs of the same names and keep `buddy.json`.
`node scripts/lib/sheet.mjs out.png <pack>` renders a contact sheet of a pack
for checking artwork.

## Development

```bash
npm run dev        # launches with DevTools attached to each overlay
npm test           # simulation, reminder and API/CLI tests (no display needed)
npm run typecheck
electron . --capture=/tmp/caps   # logs a DOM probe of each overlay every 3 s and saves screenshots
```

Layout:

- `src/sim/` pure simulation (state machine for wander / approach / watch / sit / sleep / alert / guide / drag). No Electron imports so it is unit-testable.
- `src/main/` Electron main process: overlay windows per display, active-window tracking (`osascript` + System Events on macOS), idle detection, tray menu, local API, reminders, buddy pack loader.
- `src/renderer/` draws the buddies from snapshots sent at 30 fps, handles hover/click/drag and click-through toggling.
- `buddies/` bundled packs. `bin/buddy.js` CLI.

Platforms: macOS and Windows have full support (active-window tracking in `src/main/activeWindow.ts`, notifications in `src/main/notifications.ts`). On Linux everything except active-window tracking and notification watching works; add a provider in `src/main/activeWindow.ts`.
