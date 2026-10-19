# Make your own buddy with an AI

Any chat AI can design a buddy for you. The workflow is three steps and needs
no files: the AI answers with a single JSON block, you copy it, and Desktop
Buddy installs it.

## 1. Ask an AI to draw it

1. Open [LLM-PROMPT.md](LLM-PROMPT.md) and copy the big text box.
2. Paste it into a chat with the AI. Replace the line after **MY BUDDY** with
   your idea, for example:
   > A fluffy red panda wearing a tiny blue scarf, chibi style, sleepy and
   > polite. Double-click trick: it spins and shows confetti.
3. The AI replies with one `json` code block. Use the **copy** button on the
   code block so you get all of it.

Tips for better results:

- Name the style: *cute chibi*, *flat vector*, *glossy toy*, *pixel art*,
  *realistic shading*.
- Ask for the personality in the pet lines ("sarcastic", "very polite").
- Big models draw better frames. If the answer is cut off, ask for "fewer
  frames per animation" rather than "continue", because JSON cannot be resumed.
- Chat AIs produce vector drawings (SVG), not photographs. For photo-like
  results see [Using PNG images](#using-png-images-photos-pixel-art) below.

## 2. Import it

Pick one way. The new buddy appears on your screen right away and is saved in
your config.

**A. From the menu bar (easiest).** With the JSON still on your clipboard,
click the paw in the menu bar and choose
*Import buddy from clipboard (AI-made JSON)…*. If something is wrong a dialog
lists the problems.

**B. From a terminal.**

```bash
pbpaste | node bin/buddy.js import -        # straight from the clipboard (macOS)
# PowerShell on Windows:  Get-Clipboard -Raw | node bin\buddy.js import -
node bin/buddy.js import my-buddy.json      # from a file you saved
node bin/buddy.js import ./my-buddy-folder  # from a folder (see below)
```

Options: `--id name` (folder name), `--force` (replace an existing buddy with
that id), `--no-add` (install but do not put it on screen).

**C. Check without installing.** `node bin/buddy.js validate my-buddy.json`
(or `pbpaste | node bin/buddy.js validate -`) prints every problem and changes
nothing.

Imported buddies live in
`~/Library/Application Support/desktop-buddy/buddies/<id>/`. They show up in
the paw menu under *Buddies* with a checkbox like the bundled ones, so you can
turn them off and on at any time. Delete that folder to remove one for good.

### Try the example first

A complete, working bundle is included: a friendly ghost called Wisp with all
ten animations and a double-click trick.

```bash
node bin/buddy.js import examples/ghost.buddy.json
```

Open `examples/ghost.buddy.json` to see exactly what a good answer looks like.

## 3. Fix problems with the AI

Both the validator and the import dialog print a list such as:

```
✘ walk-2.svg: does not end with </svg>; the drawing looks cut off
✘ animation "idle": frame "idle-3.svg" is listed but the file is missing
! walk-0.svg: viewBox 100x100 does not match frameWidth x frameHeight 128x128
```

`✘` must be fixed before import; `!` is a warning (it still works). Paste the
list back with a message like this:

```text
Your buddy JSON did not import. Here are the problems:

<paste the list>

Please send the corrected, complete JSON again in one json code block. Keep
everything that was fine, fix only these problems, and follow the same format
rules as before.
```

To adjust the look, just ask: *"make the walk cycle bouncier"*, *"give it a
bigger head"*, *"change the colours to autumn tones"* and import the new
version (use `--force` or a new `id` if the old one is still installed; from
the menu, a duplicate id is imported as `name-2`).

## What the format means

The single-file JSON has three keys:

| Key | Meaning |
|---|---|
| `id` | Folder name for the buddy: lowercase letters, digits, dashes. |
| `manifest` | What goes into `buddy.json`: name, size, animations, optional trick. |
| `files` | Frame file name -> SVG text. |

Importing turns this into a normal buddy folder:

```
my-buddy/
  buddy.json
  idle-0.svg  idle-1.svg
  walk-0.svg  walk-1.svg  walk-2.svg  walk-3.svg
  ...
```

You can also write such a folder by hand, or build it with any tool, and import
it with `node bin/buddy.js import ./my-buddy`.

### Manifest reference

| Field | Meaning |
|---|---|
| `name` | Display name shown in the menu and on hover. |
| `frameWidth`, `frameHeight` | Size of one frame in pixels before scaling (128 x 128). |
| `scale` | Default size multiplier. Use 0.8 for small, 1.3 for big. |
| `facing` | Direction the art faces, `"right"` normally. The app mirrors it when walking left. |
| `feetOffset` | Pixels between the bottom of the frame and the feet. With feet at y = 122 in a 128 frame that is 6. |
| `edge` | `"bottom"` (default) or `"top"`. A top buddy hangs from the top of the screen (see `buddies/sloth`); draw it hanging and set `gripOffset`. |
| `gripOffset` | For `edge: "top"`: pixels from the top of the frame to the point that touches the screen's top edge. |
| `flip` | `false` for art that must never be mirrored (a front-facing figure with writing on it). The buddy then shuffles sideways instead of turning. Default `true`. |
| `speed` | Walking speed relative to other buddies, 0.1 to 3 (default 1; the sloth uses 0.3). |
| `petLines` | Things the buddy says when clicked. |
| `pixelArt` | `true` to scale PNG frames without smoothing. |
| `animations` | `{ name: { frames: [...], fps, loop?, flip? } }`. `flip` overrides the pack's `flip` for that animation (a side-view walk in a pack that otherwise never mirrors). |
| `doubleClick` | `{ animation, seconds, say, effect }`, the trick played on double-click. |

Animations used by the app: `idle` and `walk` (required), `sit`, `sleep`,
`watch`, `point`, `alert`, `happy`, `drag`, and for tricks `trick` (also `rear`,
`spin`). Missing ones fall back to `idle`.

Trick effects: `{"type":"confetti"}`, `{"type":"bats","count":5}`,
`{"type":"arc-letters","text":"LILY"}`.

### Limits the validator enforces

- Frame file names: letters, digits, `.`, `_`, `-` only, ending in `.svg`, `.png`, `.webp` or `.gif`.
- At most 300 KB per SVG frame, 150 frames and 6 MB per buddy. Raster (PNG/WebP) frames may be 1 MB each and 40 MB per pack; for photo-style buddies see [PHOTO-BUDDY.md](PHOTO-BUDDY.md).
- SVG frames may not contain scripts, `foreignObject`, event handlers, or links to anything outside the file.

## Using PNG images (photos, pixel art)

Chat AIs cannot write PNG files, but you can build a folder yourself:

1. Make transparent PNG frames facing right, all the same size (for example
   256 x 256), with the feet at the same height in every frame. Image
   generators plus a background remover work well for photo-style buddies.
2. Write a `buddy.json` as above, with `"frameWidth"` and `"frameHeight"` set
   to your PNG size divided by your `scale` choice, and PNG file names in
   `frames`.
3. `node bin/buddy.js import ./my-photo-buddy`.

Set `"pixelArt": true` for pixel art so it stays crisp when enlarged.

## Troubleshooting

| Symptom | Likely cause and fix |
|---|---|
| "not valid JSON ... line 12, column 40" | A double quote inside an SVG string, a trailing comma, or the answer was cut off. Send the message to the AI and ask for the complete JSON again. |
| "must start with <svg" | The AI wrapped a frame in text or a markdown fence. Ask it to put only the SVG in each string. |
| "the <svg> needs xmlns" | Add `xmlns='http://www.w3.org/2000/svg'` to the `<svg>` tag. |
| Imported but invisible or tiny | Check `frameWidth`/`frameHeight` and the viewBox are 128, and that the drawing fills the box. Try `"scale": 1.3`. |
| Floats above or sinks into the floor | The lowest point of the drawing is not at y = 122. Change `feetOffset` or ask the AI to move it. |
| Faces left | Set `"facing": "left"`, or ask the AI to mirror the art. |
| "already exists; choose another id" | Use `--id other-name` or `--force`. |
| Not in the menu after copying a folder by hand | Choose *Reload config* in the paw menu, or restart. |
